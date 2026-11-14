/**
 * The store's writers of a person's marks on a run against the machine (run-marks.ts): each event brought to a run carrying each set
 * of marks leaves its files as `runMarkMove` answers — moved, as they stood, or untouched where it refuses — so a move the machine
 * does not make is one the store does not write; and no file of `src` outside this folder names a mark's file.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { RUN_MARK_EVENTS, RUN_MARKS, runMarkMove, type RunMark, type RunMarkEvent } from '../run-marks/run-marks.ts';
import { filesStoreAt } from './files.store.ts';
import { cancelFile, holdFile, marksAt, pruneFile, removeHold, runsDir, writeHold } from './record.store.ts';

const ID = 'a-run-m4rk';

/** A store whose run `ID` carries the marks of `mark`, each file planted as its writer leaves it. */
function arranged(mark: RunMark): string {
  const home = scratch('wf-marks-walk-');
  fs.mkdirSync(runsDir(home), { recursive: true });
  if (mark.includes('called-off')) fs.writeFileSync(cancelFile(home, ID), '2026-11-14T00:00:00.000Z');
  if (mark.includes('pruned')) fs.writeFileSync(pruneFile(home, ID), JSON.stringify({ at: '2026-11-14T00:00:01.000Z', worktrees: [] }));
  if (mark.includes('held')) fs.writeFileSync(holdFile(home, ID), JSON.stringify({ at: '2026-11-14T00:00:02.000Z', until: [] }));
  return home;
}

/** Each event as the store's writers bring it. */
const BROUGHT: Readonly<Record<RunMarkEvent, (home: string) => unknown>> = {
  hold: (home) => writeHold(home, ID, []),
  lift: (home) => removeHold(home, ID, '2026-11-14T00:00:02.000Z'),
  cancel: (home) => filesStoreAt(home).runs.cancel(ID),
  prune: (home) => filesStoreAt(home).runs.prune(ID, { at: '2026-11-14T00:00:03.000Z', worktrees: [] }),
  unprune: (home) => filesStoreAt(home).runs.prune(ID, undefined),
};

test('the store writes the moves the marks machine makes and no other: each event on each set of marks leaves the files where runMarkMove says', async (t) => {
  for (const from of RUN_MARKS)
    for (const event of Object.keys(RUN_MARK_EVENTS) as RunMarkEvent[])
      await t.test(`${event} on a run ${from}`, () => {
        const home = arranged(from);
        assert.equal(marksAt(home, ID), from, 'the run carries the marks arranged');
        const move = runMarkMove(from, event);
        BROUGHT[event](home);
        assert.equal(marksAt(home, ID), move.kind === 'edge' ? move.to : from);
      });
});

/** The files among `sources`, each a path from `src` and its text, outside `record/` that name a mark's file. */
const namesAMark = (sources: ReadonlyMap<string, string>): string[] =>
  [...sources]
    .filter(([file, text]) => !file.startsWith('record/') && /\b(?:cancelFile|pruneFile|holdFile|unheldFile)\(/.test(text))
    .map(([file]) => file);

test("no file of src outside record/ names a mark's file, so nothing else can write one; REFUSED: a verb planted that does", () => {
  const src = path.join(import.meta.dirname, '..');
  const sources = new Map(
    fs
      .readdirSync(src, { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
      .map((file) => [file.split(path.sep).join('/'), fs.readFileSync(path.join(src, file), 'utf8')] as const),
  );
  assert.ok(sources.has('record/record.store.ts'), 'the store is among the files read');
  assert.deepEqual(namesAMark(sources), []);
  const planted = new Map([...sources, ['cancel/eager.verb.ts', 'fs.rmSync(cancelFile(home, id));'] as const]);
  assert.deepEqual(namesAMark(planted), ['cancel/eager.verb.ts']);
});
