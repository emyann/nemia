import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptStepOf, barOf, changeOf, decidableRun, decisionStamp, diffLine, isDecidable, mostLines, touchedSummary } from '../src/lib/decide.ts';
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
  // Two branches with the same changes count each package and each file once, and a branch that could not be read is said, not dropped.
  assert.equal(touchedSummary([read, read, unread('wf/r/gone')]), 'touched 3 packages · +12 −3 · 1 not read');
  assert.equal(touchedSummary([unread('wf/r/gone')]), 'touched not known — its branch could not be read');
  assert.equal(touchedSummary([unread('a'), unread('b')]), 'touched not known — 2 branches could not be read');
  assert.equal(touchedSummary([]), 'touched nothing — no branch to read');
});

test("REFUSED: a fan-out's result branches each carry the parent's changes, and the card counts them once — not once per branch", () => {
  // plan changed packages/a/src/x.ts; api and web each started from its branch in a worktree of their own. api added a file beside it, and
  // web changed x.ts further and a file of its own. Each result branch is diffed against the run's base, so each carries plan's +100.
  const branch = (name: string, changes: Radius['changes'], groups: Radius['groups']): Touched =>
    ({ branch: `wf/r/${name}`, radius: { changes, groups, agentFacing: [], checkAffecting: [], lessons: [] } });
  const api = branch('api', [{ path: 'packages/a/src/x.ts', added: 100, removed: 0 }, { path: 'packages/a/src/y.ts', added: 5, removed: 0 }], [group('packages/a', 2, 105, 0)]);
  const web = branch('web', [{ path: 'packages/a/src/x.ts', added: 120, removed: 4 }, { path: 'apps/web/z.ts', added: 7, removed: 1 }], [group('packages/a', 1, 120, 4), group('apps/web', 1, 7, 1)]);
  // x.ts once, as the branch that changed it most has it — plan's lines and web's on top: +120 −4; then y.ts +5 and z.ts +7 −1.
  assert.equal(touchedSummary([api, web]), 'touched 2 packages · +132 −5');
  assert.notEqual(touchedSummary([api, web]), 'touched 2 packages · +232 −5', "plan's +100 counted once per result branch");
  // In either order: the larger change is the file's, whichever branch is read first.
  assert.equal(touchedSummary([web, api]), 'touched 2 packages · +132 −5');
  // A binary file on both adds no lines, and does not stand in for a counted change of the same path.
  const bin = branch('bin', [{ path: 'packages/a/src/x.ts', added: null, removed: null }], [group('packages/a', 1, 0, 0, 1)]);
  assert.equal(touchedSummary([bin, api]), 'touched 1 package · +105 −0');
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

/** A fan-out as the api gives it: implement signed off blocked, and tokens in `tokens`' word. The run `assess` calls failed. */
const fanOut = (tokens: string, over: { status?: string; waitingOnYou?: string[]; tokensTask?: string | null } = {}) => ({
  status: over.status ?? 'failed', cancelledAt: null, waitingOnYou: over.waitingOnYou ?? ['implement'],
  steps: [
    { name: 'implement', taskId: 't-1', branch: 'wf/r/implement', status: 'succeeded · BLOCKED', note: null },
    { name: 'tokens', taskId: over.tokensTask === undefined ? 't-2' : over.tokensTask, branch: 'wf/r/tokens', status: tokens, note: null },
  ],
});

test("a decision is read again when a step settles, a try is filed, or the run moves — and the list and the detail stamp a run alike", () => {
  const stamp = decisionStamp(fanOut('running (working)'));
  // The detail's steps carry more; the stamp reads what both have.
  const detail = fanOut('running (working)');
  assert.equal(decisionStamp({ ...detail, steps: detail.steps.map((s) => ({ ...s, closeout: null, used: null })) }), stamp);
  for (const settled of ['checking', 'unverified · done', 'succeeded · BLOCKED', 'failed', 'unsigned']) {
    assert.notEqual(decisionStamp(fanOut(settled)), stamp, `tokens signed off or ended: ${settled}`);
  }
  assert.notEqual(decisionStamp(fanOut('checking')), decisionStamp(fanOut('verified ✓')), 'a check settled');
  assert.notEqual(decisionStamp(fanOut('failed ✗ check (unfinished)')), decisionStamp(fanOut('failed ✗ check (exit 1)')), 'a refusal is not a check that did not finish');
  assert.notEqual(decisionStamp(fanOut('running (working)', { tokensTask: 't-3' })), stamp, 'a try filed');
  assert.notEqual(decisionStamp(fanOut('running (working)', { status: 'running', waitingOnYou: [] })), stamp, 'a person asked for a try');
  assert.notEqual(decisionStamp(fanOut('succeeded · BLOCKED', { status: 'succeeded' })), decisionStamp(fanOut('succeeded · BLOCKED')), 'the run moved');
  // A step not filed is not in flight, and one filed is: the task moves it.
  assert.notEqual(decisionStamp(fanOut('waiting', { tokensTask: null })), decisionStamp(fanOut('pending')), 'a step filed');
});

test("a decision is not read again while a live step's engine word moves and nothing it says has", () => {
  const stamp = decisionStamp(fanOut('running (working)'));
  for (const word of ['working (quiescent)', 'starting', 'between attempts', 'needs-human', 'pending', 'running (working)']) {
    assert.equal(decisionStamp(fanOut(word)), stamp, `tokens' engine word: ${word}`);
  }
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

test("the board presses `accept` on the step its command names, and on no other row, nor a command it cannot read the step off", () => {
  const accept = (command: string) => ({ label: 'accept' as const, command });
  assert.equal(acceptStepOf(accept('wf accept r-1 review --message "<why>"'), 'r-1'), 'review');
  assert.equal(acceptStepOf(accept('wf accept r 1 review --message "<why>"'), 'r 1'), 'review');
  // Every other row only copies, and a command that is not `wf accept` for this run — or names no one step — is not pressed.
  assert.equal(acceptStepOf({ label: 'once more', command: 'wf round r-1 review' }, 'r-1'), null);
  assert.equal(acceptStepOf(accept('wf accept r-2 review --message "<why>"'), 'r-1'), null);
  assert.equal(acceptStepOf(accept('wf accept r-1 --message "<why>"'), 'r-1'), null);
  assert.equal(acceptStepOf(accept('wf accept r-1 review extra --message "<why>"'), 'r-1'), null);
  assert.equal(acceptStepOf(accept('wf accept r-1 review'), 'r-1'), null);
});
