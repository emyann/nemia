/**
 * `fed`, the e2e's line on the workflow feed for a page that edits the store by hand: it writes what the package reads back, a step's line and
 * a run's, appended after what is there. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fed } from './e2e/board.ts';
import { REPO, setStore } from './e2e/world.ts';

type Line = { at: string; run: string; step?: string; word: string; note?: string };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-feed-'));
after(() => {
  setStore(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * The feed as the package reads it back: `wf feed 0` over the store, its CLI. The web imports nothing of the package, and reaching into its
 * `src` is refused (`packages/agent-orchestrator/test/contract.test.ts`), so it is asked as a person asks it. Each line is printed as
 * `<time>  <run>  <step or —>  <word>`, and the last is `cursor: <bytes>`.
 */
function wfFeed(store: string): { said: string[]; cursor: number } {
  const out = execFileSync(process.execPath, [path.join(REPO, 'packages', 'agent-orchestrator', 'bin', 'wf.ts'), 'feed', '0'], {
    env: { ...process.env, WF_ROOT: store }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  });
  const lines = out.trimEnd().split('\n');
  const last = /^cursor: (\d+)$/.exec(lines.at(-1) ?? '');
  assert.ok(last, `wf feed ends with its cursor: ${out}`);
  // The words after the time: the time is the line's own, and says nothing of what the package read.
  return { said: lines.slice(0, -1).map((l) => l.replace(/^\S+ {2}/, '')), cursor: Number(last[1]) };
}

test('fed appends a line the package reads back, with a step and without', () => {
  const file = path.join(dir, 'feed.jsonl');
  const before = { at: '2026-09-22T00:00:00.000Z', run: 'r-0', word: 'running' };
  fs.writeFileSync(file, `${JSON.stringify(before)}\n`);
  setStore(dir);
  const from = Date.now();
  fed('r-1', 'implement', 'blocked');
  fed('r-1', 'awaiting approval');
  const { said, cursor } = wfFeed(dir);
  assert.equal(cursor, fs.statSync(file).size, 'every line is whole');
  assert.deepEqual(said, [
    'r-0  —  running',
    'r-1  implement  blocked',
    'r-1  —  awaiting approval',
  ]);
  const lines = fs.readFileSync(file, 'utf8').trimEnd().split('\n').map((l) => JSON.parse(l) as Line);
  assert.equal(lines[0].at, before.at, 'what was there is kept');
  for (const { at } of lines.slice(1)) assert.ok(Date.parse(at) >= from - 1000 && at === new Date(Date.parse(at)).toISOString(), `written now, as an ISO time: ${at}`);
  assert.ok(!('step' in lines[2]), "a run's line carries no step key at all");
});
