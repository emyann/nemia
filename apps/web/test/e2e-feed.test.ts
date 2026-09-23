/**
 * `fed`, the e2e's line on the workflow feed for a page that edits the store by hand: it writes what the package reads back, a step's line and
 * a run's, appended after what is there. No browser, so `npm test` runs it.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { after, test } from 'node:test';
import { fed } from './e2e/board.ts';
import { REPO, setStore } from './e2e/world.ts';

type Line = { at: string; run: string; step?: string; word: string; note?: string };

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-feed-'));
after(() => {
  setStore(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fed appends a line the package reads back, with a step and without', async () => {
  // The package's own reader, by URL: the web imports nothing of the package, and a static import would typecheck its sources here.
  const { readFeedFile } = (await import(pathToFileURL(path.join(REPO, 'packages', 'agent-orchestrator', 'src', 'feed.ts')).href)) as {
    readFeedFile: (file: string, after?: number) => { lines: Line[]; cursor: number };
  };
  const file = path.join(dir, 'feed.jsonl');
  const before = { at: '2026-09-22T00:00:00.000Z', run: 'r-0', word: 'running' };
  fs.writeFileSync(file, `${JSON.stringify(before)}\n`);
  setStore(dir);
  const from = Date.now();
  fed('r-1', 'implement', 'blocked');
  fed('r-1', 'awaiting approval');
  const { lines, cursor } = readFeedFile(file);
  assert.equal(cursor, fs.statSync(file).size, 'every line is whole');
  assert.deepEqual(lines.map(({ at: _, ...said }) => said), [
    { run: 'r-0', word: 'running' },
    { run: 'r-1', step: 'implement', word: 'blocked' },
    { run: 'r-1', word: 'awaiting approval' },
  ]);
  assert.equal(lines[0].at, before.at, 'what was there is kept');
  for (const { at } of lines.slice(1)) assert.ok(Date.parse(at) >= from - 1000 && at === new Date(Date.parse(at)).toISOString(), `written now, as an ISO time: ${at}`);
  assert.ok(!('step' in lines[2]), "a run's line carries no step key at all");
});
