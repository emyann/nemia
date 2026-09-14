import { test } from 'node:test';
import assert from 'node:assert/strict';
import { barOf, changeOf, decidableRun, decisionStamp, diffLine, isDecidable, mostLines, touchedSummary } from '../src/lib/decide.ts';
import type { Decidable, Radius, Touched } from '../src/lib/api.ts';

const group = (name: string, files: number, added: number, removed: number, binary = 0) => ({ name, files, added, removed, binary });

/** A branch that moved a test from one package to another, edited the root's CLAUDE.md, and added a binary. */
const radius: Radius = {
  changes: [
    { path: 'CLAUDE.md', added: 2, removed: 0 },
    { path: 'logo.png', added: null, removed: null },
    { from: 'packages/a/test/x.test.ts', path: 'packages/b/test/x.test.ts', added: 10, removed: 3 },
  ],
  // The rename counts in both packages, as `radius` counts it.
  groups: [group('(root)', 2, 2, 0, 1), group('packages/a', 1, 10, 3), group('packages/b', 1, 10, 3)],
  agentFacing: ['CLAUDE.md'],
  checkAffecting: ['packages/a/test/x.test.ts → packages/b/test/x.test.ts'],
  lessons: [{ path: 'CLAUDE.md', added: 2, removed: 0 }],
};
const read: Touched = { branch: 'wf/r/implement', radius };
const unread = (branch: string): Touched => ({ branch, radius: { error: `git could not diff abc...${branch}` } });

test("the Factory card's line: every group once, each change's lines once — a rename across packages is not counted twice", () => {
  assert.equal(touchedSummary([read]), 'touched 3 packages · +12 −3');
  assert.equal(touchedSummary([{ branch: 'wf/r/one', radius: { ...radius, groups: [group('apps/web', 1, 4, 1)], changes: [{ path: 'apps/web/a.ts', added: 4, removed: 1 }] } }]), 'touched 1 package · +4 −1');
  // Two branches touching the same package count it once, and a branch that could not be read is said, not dropped.
  assert.equal(touchedSummary([read, read, unread('wf/r/gone')]), 'touched 3 packages · +24 −6 · 1 not read');
  assert.equal(touchedSummary([unread('wf/r/gone')]), 'touched not known — its branch could not be read');
  assert.equal(touchedSummary([unread('a'), unread('b')]), 'touched not known — 2 branches could not be read');
  assert.equal(touchedSummary([]), 'touched nothing — no branch to read');
});

test('a bar is its group\'s share of the most lines a group on the branch changed: the largest fills the track, a binary-only group has none', () => {
  const groups = [group('packages/a', 1, 60, 20), group('packages/b', 1, 30, 10), group('(root)', 1, 0, 0, 1)];
  const most = mostLines(groups);
  assert.equal(most, 80);
  assert.deepEqual(groups.map((g) => barOf(g, most)), [{ added: 75, removed: 25 }, { added: 37.5, removed: 12.5 }, { added: 0, removed: 0 }]);
  assert.deepEqual(barOf(group('x', 1, 1, 2), 3), { added: 33.33, removed: 66.67 });
  // A branch of binary files only: nothing to measure against, and no bar rather than a division by zero.
  assert.deepEqual(barOf(group('x', 1, 0, 0, 1), mostLines([group('x', 1, 0, 0, 1)])), { added: 0, removed: 0 });
  assert.equal(mostLines([]), 0);
});

test('a run is asked for its decision once it finished or waits on a person — never while it runs, nor once called off', () => {
  const at = '2026-09-13T00:00:00.000Z';
  assert.equal(decidableRun({ status: 'failed', cancelledAt: null, waitingOnYou: ['implement'] }), true);
  assert.equal(decidableRun({ status: 'succeeded', cancelledAt: null, waitingOnYou: [] }), true);
  assert.equal(decidableRun({ status: 'running', cancelledAt: null, waitingOnYou: ['implement'] }), true);
  assert.equal(decidableRun({ status: 'running', cancelledAt: null, waitingOnYou: [] }), false);
  assert.equal(decidableRun({ status: 'cancelled', cancelledAt: at, waitingOnYou: [] }), false);
  // As the api has a cancelled run, and with a step still named: called off all the same.
  assert.equal(decidableRun({ status: 'cancelled', cancelledAt: at, waitingOnYou: ['implement'] }), false);
});

test("only the api's decision is shown: not `running`, not `nothing`, not an answer still to come", () => {
  const decidable: Decidable = {
    touched: [read], lesson: { said: 'CLAUDE.md +2 −0', state: 'written' }, sensitive: [], used: {},
    total: { usage: null, used: 'not measured', cost: 'not measured' }, commands: [],
  };
  assert.equal(isDecidable(decidable), true);
  assert.equal(isDecidable({ running: true }), false);
  assert.equal(isDecidable({ nothing: 'cancelled at 2026-09-13T00:00:00.000Z — nothing to decide' }), false);
  assert.equal(isDecidable(undefined), false);
});

test("a decision is read again only when a step's task or word moves, and the list and the detail stamp a run alike", () => {
  const steps = [{ name: 'implement', taskId: 't-1', branch: 'wf/r/implement', status: 'succeeded · BLOCKED', note: null }];
  const stamp = decisionStamp({ status: 'failed', steps });
  // The detail's steps carry more; the stamp reads what both have.
  assert.equal(decisionStamp({ status: 'failed', steps: steps.map((s) => ({ ...s, closeout: null, used: null })) }), stamp);
  assert.notEqual(decisionStamp({ status: 'failed', steps: [{ ...steps[0]!, taskId: 't-2' }] }), stamp, 'a try filed');
  assert.notEqual(decisionStamp({ status: 'failed', steps: [{ ...steps[0]!, status: 'unverified · done' }] }), stamp, 'a word moved');
  assert.notEqual(decisionStamp({ status: 'succeeded', steps }), stamp, 'the run moved');
});

test("a diff's lines, told apart for their colour: a file's header, a hunk's, added, removed and context", () => {
  const kinds = [
    'diff --git a/package.json b/package.json', 'index 1111111..2222222 100644', '--- a/package.json', '+++ b/package.json',
    '@@ -1,3 +1,3 @@ {', ' "name": "app",', '-  "test": "node --test"', '+  "test": "node --test test/"', '', '\\ No newline at end of file',
    'rename from test/a.test.ts', 'Binary files a/logo.png and b/logo.png differ',
  ].map(diffLine);
  assert.deepEqual(kinds, ['meta', 'meta', 'meta', 'meta', 'hunk', 'context', 'removed', 'added', 'context', 'context', 'meta', 'meta']);
});

test("a diff's file is found among the branch's changes by its name, a rename by both ends — and not on a branch not read", () => {
  assert.deepEqual(changeOf(read, 'CLAUDE.md'), { path: 'CLAUDE.md', added: 2, removed: 0 });
  assert.equal(changeOf(read, 'packages/a/test/x.test.ts → packages/b/test/x.test.ts')?.added, 10);
  assert.equal(changeOf(read, 'README.md'), undefined);
  assert.equal(changeOf(unread('wf/r/gone'), 'CLAUDE.md'), undefined);
  assert.equal(changeOf(undefined, 'CLAUDE.md'), undefined);
});
