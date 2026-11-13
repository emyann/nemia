/**
 * `fed`, the e2e's line on the workflow feed for a page that edits the store by hand: it writes what the package reads back, a step's line
 * and a run's, appended after what is there. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { after, test, type TestContext } from 'node:test';
import { fed } from './e2e/board.ts';
import { API, setStore } from './e2e/world.ts';
import { scratch } from 'test-kit/scratch';

type Line = { at: string; run: string; step?: string; word: string; note?: string };

const dir = scratch('e2e-feed-');
after(() => setStore(undefined));

/**
 * The feed as the api reads it back: `GET /api/feed/wait?from=0` of an api served over the store, ticking nothing, the read `nemia watch
 * --once 0` asks. The web imports nothing of the packages, so the store is asked as the board asks it. Answers each line's run, step (`—`
 * for a run's own line) and word, and the cursor.
 */
async function apiFeed(t: TestContext, store: string): Promise<{ said: string[]; cursor: number }> {
  const child = spawn(process.execPath, ['src/main.ts', '--no-tick'], {
    cwd: API,
    env: { ...process.env, WF_ROOT: store, PORT: '0', OTEL_EXPORTER_OTLP_ENDPOINT: '', NEMIA_BIND: '', WF_EXPOSED: '' },
  });
  let printed = '';
  const ended = new Promise<void>((resolve) => child.on('close', () => resolve()));
  t.after(async () => {
    child.kill();
    await ended;
  });
  const url = await new Promise<string>((resolve, reject) => {
    const look = (chunk: Buffer) => {
      printed += chunk.toString();
      const m = /api listening on (http:\/\/127\.0\.0\.1:\d+)/.exec(printed);
      if (m?.[1]) resolve(m[1]);
    };
    child.stdout.on('data', look);
    child.stderr.on('data', look);
    void ended.then(() => reject(new Error(`the api ended before it listened:\n${printed}`)));
  });
  const answer = await fetch(`${url}/api/feed/wait?from=0&for=1s`);
  assert.equal(answer.status, 200, `the api answers the feed's wait: ${await answer.clone().text()}`);
  const body = (await answer.json()) as {
    lines: { metadata: { labels: { run: string; step?: string } }; message: string }[];
    cursor: string;
  };
  const said = body.lines.map(({ metadata: { labels }, message }) => `${labels.run}  ${labels.step ?? '—'}  ${message}`);
  return { said, cursor: Number(body.cursor) };
}

test('fed appends a line the package reads back, with a step and without', async (t) => {
  const file = path.join(dir, 'feed.jsonl');
  const before = { at: '2026-09-22T00:00:00.000Z', run: 'r-0', word: 'running' };
  fs.writeFileSync(file, `${JSON.stringify(before)}\n`);
  setStore(dir);
  const now = Date.parse('2026-10-02T21:30:00.123Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  fed('r-1', 'implement', 'blocked');
  fed('r-1', 'awaiting approval');
  t.mock.timers.reset();
  const { said, cursor } = await apiFeed(t, dir);
  assert.equal(cursor, fs.statSync(file).size, 'every line is whole');
  assert.deepEqual(said, ['r-0  —  running', 'r-1  implement  blocked', 'r-1  —  awaiting approval']);
  const lines = fs
    .readFileSync(file, 'utf8')
    .trimEnd()
    .split('\n')
    .map((l) => JSON.parse(l) as Line);
  assert.equal(lines[0].at, before.at, 'what was there is kept');
  for (const { at } of lines.slice(1)) assert.equal(at, new Date(now).toISOString(), 'written now, as an ISO time');
  assert.ok(!('step' in lines[2]), "a run's line carries no step key at all");
});
