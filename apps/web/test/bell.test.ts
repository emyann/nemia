/**
 * The waiting bar's rows (src/lib/bell.ts): the rows of the runs that wait on a person across every factory, in what order, what each waits
 * for and where its row opens. Which runs wait is the api's to say (`bellRows` filters none): the rows
 * are read here over the board's own rule (`waitsOnYou`), which the pages still on the whole list keep.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import { coded } from './run-fixtures.ts';
import { bellHash, bellRows } from '../src/lib/bell.ts';
import { waitsOnYou } from '../src/lib/factory.ts';

/** A run of the default factory with a step per name in `steps`, nobody waited on, and `extra` over it. */
const run = (id: string, extra: Partial<RunSummary> = {}, steps: readonly string[] = ['plan', 'build', 'ship']): RunSummary => ({
  id,
  repo: '/code/app',
  factory: null,
  place: 'repository',
  work: null,
  brief: `# ${id}'s brief\n\nMore.`,
  workflowDir: '/code/app/workflows/dev',
  workflowPage: null,
  try: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  startedAt: '2026-10-01T00:00:00.000Z',
  cancelledAt: null,
  pruned: null,
  status: 'running',
  phase: 'running',
  reason: 'Running',
  on: null,
  via: null,
  moving: true,
  cost: null,
  atWork: null,
  tokens: null,
  steps: steps.map((name) => ({
    name,
    taskId: `t-${name}`,
    branch: null,
    ...coded('waiting'),
    note: null,
    roundDue: false,
    agent: null,
    since: null,
    needs: null,
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    sessionUnread: null,
  })),
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  onYou: [],
  after: [],
  waiting: null,
  context: [],
  heldUntil: [],
  holding: null,
  toDecide: null,
  unreadable: null,
  ...extra,
});

/** A run whose second step waits at its gate. */
const atGate = (id: string, extra: Partial<RunSummary> = {}): RunSummary => {
  const base = run(id, {
    status: 'awaiting approval',
    moving: false,
    waitingOnYou: ['build'],
    onYou: ['approve build'],
  });
  return { ...base, steps: base.steps.map((step) => (step.name === 'build' ? { ...step, approve: 'approve build' } : step)), ...extra };
};

/** The bell's rows of those of `runs` the board's own rule says wait on a person. */
const bellRuns = (runs: readonly RunSummary[]) => bellRows(runs.filter(waitsOnYou));

/** A hold on a run until `p` lands: one a person lifts alone when `onYou`. */
const holdOn = (onYou: boolean): RunSummary['holding'] => ({
  at: '2026-10-01T00:00:00.000Z',
  runs: [{ run: 'p', missing: onYou, cancelledAt: null, gone: [], landed: false }],
  word: onYou ? 'held until p lands (no such run)' : 'held until p lands',
  advice: 'wf hold r --off',
  onYou,
});

/** What a run started after `p` waits on: a run that never lands without a person when `onYou`. */
const waitOn = (onYou: boolean): RunSummary['waiting'] => ({
  runs: [{ run: 'p', missing: false, cancelledAt: onYou ? '2026-10-01T00:00:00.000Z' : null, gone: [] }],
  word: onYou ? 'waiting on p (cancelled)' : 'waiting on p',
  advice: 'nothing to decide yet',
  onYou,
});

test("bellRows, bellHash: the waiting bar's rows, their order, what each waits for and where it opens", async (t) => {
  await t.test('REFUSED: a run held until a run that may still land waits on nobody, and is not on the bell', () => {
    const held = run('held', { heldUntil: ['p'], holding: holdOn(false) });
    assert.equal(bellRuns([held]).length, 0);
    const lifted = run('stuck', { heldUntil: ['p'], holding: holdOn(true) });
    assert.deepEqual(
      bellRuns([held, lifted]).map((row) => [row.run, row.waitsFor]),
      [['stuck', ['held until p lands (no such run)']]],
      'a hold only a person lifts is',
    );
  });
  await t.test('REFUSED: a cancelled run waits on nobody, whatever its steps last said', () => {
    assert.equal(bellRuns([atGate('gone', { cancelledAt: '2026-10-02T00:00:00.000Z' })]).length, 0);
    assert.equal(bellRuns([atGate('here')]).length, 1, 'the same run not cancelled is on the bell');
  });
  await t.test('REFUSED: a finished run whose branch nobody merged is the floor’s to decide, not the bell’s', () => {
    const unmerged = run('done', {
      status: 'succeeded',
      moving: false,
      toDecide: { kind: 'result', branches: ['wf/done/ship'], said: 'merge or drop wf/done/ship', command: 'git merge wf/done/ship' },
    });
    assert.equal(bellRuns([unmerged]).length, 0);
  });
  await t.test(
    'a run waiting on a run that never lands without a person is on the bell, with its word; one that may still land is not',
    () => {
      const never = run('never', { after: ['p'], waiting: waitOn(true), moving: false });
      const may = run('may', { after: ['p'], waiting: waitOn(false) });
      assert.deepEqual(
        bellRuns([never, may]).map((row) => [row.run, row.waitsFor]),
        [['never', ['waiting on p (cancelled)']]],
      );
    },
  );
  await t.test("REFUSED: a row's gate is the step that waits at its gate, wherever it stands, and its hash is that step's section", () => {
    const [row] = bellRuns([atGate('r-g')]);
    assert.equal(row.gate, 'build');
    assert.equal(bellHash(row), 'step-build');
    assert.deepEqual(row.waitsFor, ['approve build']);
    assert.equal(row.title, "r-g's brief");
  });
  await t.test(
    'a run that asks and is at no gate opens its page at its top, and says each step by name where the api gives no words',
    () => {
      const asks = run('asks', { status: 'failed', moving: false, waitingOnYou: ['plan'] });
      const [row] = bellRuns([asks]);
      assert.equal(row.gate, null);
      assert.equal(bellHash(row), undefined);
      assert.deepEqual(row.waitsFor, ['plan']);
    },
  );
  await t.test('REFUSED: the bell lists its runs oldest first, whatever order the api answers', () => {
    const newer = atGate('b-new', { createdAt: '2026-10-03T00:00:00.000Z' });
    const older = atGate('a-old', { createdAt: '2026-10-01T00:00:00.000Z' });
    const middle = atGate('c-mid', { createdAt: '2026-10-02T00:00:00.000Z' });
    assert.deepEqual(
      bellRuns([newer, middle, older]).map((row) => row.run),
      ['a-old', 'c-mid', 'b-new'],
    );
  });
  await t.test(
    'REFUSED: the bell lists every run it is handed: which runs wait is the api’s to say, and no rule of the board drops one',
    () => {
      const called = atGate('called', { cancelledAt: '2026-10-02T00:00:00.000Z' });
      const quiet = run('quiet');
      assert.deepEqual(
        bellRows([called, quiet]).map((row) => row.run),
        ['called', 'quiet'],
      );
    },
  );
  await t.test('a row names its factory: the one the run names, or default for one naming none', () => {
    assert.deepEqual(
      bellRuns([atGate('d'), atGate('n', { factory: 'nemia' })]).map((row) => row.factory),
      ['default', 'nemia'],
    );
  });
});
