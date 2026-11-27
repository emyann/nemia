/**
 * What `nemia decide` is told of a finished run, read off git each pass and stored nowhere: `decision` (a run still going, cancelled,
 * awaiting a person, merged, failed), the `toDecide` of the assessment and its words (`toDecideWords`), and where a result branch stands
 * against the base (`branchWord`).
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { assess, branchWord, decision, endingSteps, firstLine, toDecideWords, type Decision, type RepositoryRun } from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { StepSpec } from '../src/workflow.ts';
import { aRead, names, phases, run, step, STEPS } from './assessed.ts';

const DONE = phases({ t1: 'succeeded', t2: 'succeeded' });
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const AHEAD = [{ branch: 'wf/r-1/implement', where: 'ahead' as const, commits: 3 }];

/** A run whose two steps are done and whose result sits on a branch. */
const finished = (extra: Partial<RepositoryRun> = {}) =>
  run(
    { implement: 't1', review: 't2' },
    {
      steps: {
        implement: { taskId: 't1', branch: 'wf/r-1/implement' },
        review: { taskId: 't2', branch: 'wf/r-1/review' },
      },
      ...extra,
    },
  );
const nothingShipped = () => false;
const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const said = (outcome: Closeout['outcome']) => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});

describe("decision: landed is asked of git and never stored, and a finished run is a person's to decide", () => {
  test('a run still going has nothing to decide, and says what it is waiting on', () => {
    const d = decision(aRead(STEPS, run({ implement: 't1', review: null }), { phaseOf: phases({ t1: 'running' }) }), nothingShipped);
    assert.equal(d.kind, 'running');
    assert.deepEqual(d.kind === 'running' && d.waiting, ['implement']);
  });
  test('a cancelled run has nothing to decide either', () => {
    const d = decision(aRead(STEPS, finished({ cancelledAt: '2026-01-01T00:00:00Z' }), { phaseOf: DONE }), nothingShipped);
    assert.equal(d.kind, 'cancelled');
  });
  test('a finished run is AWAITING a person — succeeding is not deciding', () => {
    const d = decision(aRead(STEPS, finished(), { phaseOf: DONE }), nothingShipped);
    assert.equal(d.kind, 'awaiting');
    assert.deepEqual(d.kind === 'awaiting' && d.branches, ['wf/r-1/review']);
  });
  test('landed is asked of git, not stored on the run', () => {
    const d = decision(aRead(STEPS, finished(), { phaseOf: DONE }), (b) => b === 'wf/r-1/review');
    assert.equal(d.kind, 'merged');
  });
  test('a fan-out is not landed because ONE of its branches landed', () => {
    const fan = [step('implement'), step('docs', ['implement']), step('tests', ['implement'])];
    const r = run(
      { implement: 't1', docs: 't2', tests: 't3' },
      {
        steps: {
          implement: { taskId: 't1', branch: 'wf/r-1/implement' },
          docs: { taskId: 't2', branch: 'wf/r-1/docs' },
          tests: { taskId: 't3', branch: 'wf/r-1/tests' },
        },
      },
    );
    const all = phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' });
    assert.equal(decision(aRead(fan, r, { phaseOf: all }), (b) => b === 'wf/r-1/docs').kind, 'awaiting');
    assert.equal(decision(aRead(fan, r, { phaseOf: all }), () => true).kind, 'merged');
  });
  test('a FAILED run is still decided, and names the step that failed', () => {
    const d = decision(aRead(STEPS, finished(), { phaseOf: phases({ t1: 'succeeded', t2: 'failed' }) }), nothingShipped);
    assert.equal(d.kind, 'awaiting', 'a run marked failed whose branch holds real work nobody read is still for a person to decide');
    assert.equal(d.kind === 'awaiting' && d.outcome, 'failed');
    assert.deepEqual(d.kind === 'awaiting' && d.failed, ['review']);
  });
  test('a run that worked directly on its base branch is never read as shipped', () => {
    const direct = run(
      {},
      {
        isolate: false,
        steps: { implement: { taskId: 't1', branch: 'main' }, review: { taskId: 't2', branch: 'main' } },
      },
    );
    const everythingShipped = () => true;

    const failed = decision(aRead(STEPS, direct, { phaseOf: phases({ t1: 'succeeded', t2: 'failed' }) }), everythingShipped);
    assert.equal(
      failed.kind,
      'awaiting',
      'with --no-worktree every step works on main, and git merge-base --is-ancestor main main is true: asked, git would call a failed run landed',
    );
    assert.equal(failed.kind === 'awaiting' && failed.outcome, 'failed', 'classified as for any run');
    assert.equal(failed.kind === 'awaiting' && failed.direct, true);

    const done = decision(aRead(STEPS, direct, { phaseOf: DONE }), everythingShipped);
    assert.equal(done.kind, 'awaiting', 'nothing to merge is not the same as merged');

    const isolated = decision(aRead(STEPS, finished(), { phaseOf: DONE }), everythingShipped);
    assert.equal(isolated.kind, 'merged', 'a worktree run is still asked of git');
  });
  test('a run that never filed anything has no branch to land, and is not "landed"', () => {
    const d = decision(aRead(STEPS, run({ implement: null, review: null }), { phaseOf: phases({}) }), () => true);
    assert.equal(d.kind, 'running');
  });
  test('REFUSED: a result branch with nothing past the base is landed only when every step succeeded — failed, blocked, unsigned or refused by its check, the run is decided; work past the base on the base branch is landed whatever the steps said', () => {
    const unchanged = () => 'unchanged' as const;
    const says = (outcome: Closeout['outcome']) => () => ({ outcome, summary: 's', artifacts: [] });
    const cases: Array<[string, Decision, string, string[]]> = [
      [
        'failed',
        decision(aRead(STEPS, finished(), { phaseOf: phases({ t1: 'succeeded', t2: 'failed' }) }), unchanged),
        'failed',
        ['review'],
      ],
      [
        'stopped',
        decision(aRead(STEPS, finished(), { phaseOf: phases({ t1: 'succeeded', t2: 'stopped' }) }), unchanged),
        'failed',
        ['review'],
      ],
      ['blocked', decision(aRead(STEPS, finished(), { phaseOf: DONE, signedOff: says('blocked') }), unchanged), 'waiting', []],
      [
        'unsigned',
        decision(aRead(STEPS, finished(), { phaseOf: DONE, signedOff: () => undefined, asked: () => true }), unchanged),
        'waiting',
        [],
      ],
    ];
    for (const [why, d, outcome, failed] of cases) {
      assert.deepEqual(
        d.kind === 'awaiting' && [d.outcome, d.failed, d.branches],
        [outcome, failed, ['wf/r-1/review']],
        `${why}: git calls a result branch nobody committed to on the base; read as shipped, it hides the failure from nemia decide`,
      );
    }
    const checked: StepSpec[] = [step('implement'), { ...step('review', ['implement']), check: 'npm test' }];
    const refused = decision(
      aRead(
        checked,
        run(
          {},
          {
            steps: {
              implement: { taskId: 't1', branch: 'wf/r-1/implement' },
              review: { taskId: 't2', branch: 'wf/r-1/review', check: { taskId: 'c2' } },
            },
          },
        ),
        {
          phaseOf: phases({ t1: 'succeeded', t2: 'succeeded', c2: 'failed' }),
          signedOff: says('done'),
          asked: () => true,
          verdictOf: () => 1,
        },
      ),
      unchanged,
    );
    assert.deepEqual(refused.kind === 'awaiting' && [refused.outcome, refused.failedCheck], ['failed', ['review']], 'refused by its check');

    assert.deepEqual(
      decision(aRead(STEPS, finished(), { phaseOf: DONE }), unchanged),
      { kind: 'merged', branches: ['wf/r-1/review'] },
      'every step succeeded, with nothing to commit: landed',
    );
    assert.deepEqual(decision(aRead(STEPS, finished(), { phaseOf: DONE, signedOff: says('done'), asked: () => true }), unchanged), {
      kind: 'merged',
      branches: ['wf/r-1/review'],
    });
    assert.deepEqual(
      decision(aRead(STEPS, finished(), { phaseOf: phases({ t1: 'succeeded', t2: 'failed' }) }), () => true),
      { kind: 'merged', branches: ['wf/r-1/review'] },
      'work past the base, merged by a person: landed though a step failed',
    );

    const fan = [step('implement'), step('docs', ['implement']), step('tests', ['implement'])];
    const r = run(
      {},
      {
        steps: {
          implement: { taskId: 't1', branch: 'wf/r-1/implement' },
          docs: { taskId: 't2', branch: 'wf/r-1/docs' },
          tests: { taskId: 't3', branch: 'wf/r-1/tests' },
        },
      },
    );
    const half = (b: string) => (b === 'wf/r-1/docs' ? true : ('unchanged' as const));
    const failing = decision(aRead(fan, r, { phaseOf: phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }) }), half);
    assert.deepEqual(
      failing.kind === 'awaiting' && [failing.outcome, failing.failed],
      ['failed', ['tests']],
      'a fan-out lands on its work only when every branch has some on the base; one that never moved leaves a failed run decided',
    );
    assert.equal(decision(aRead(fan, r, { phaseOf: phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }) }), half).kind, 'merged');
    assert.equal(
      decision(aRead(fan, r, { phaseOf: phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }) }), () => true).kind,
      'merged',
    );

    const asked: string[] = [];
    decision(aRead(fan, r, { phaseOf: phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }) }), (b) => {
      asked.push(b);
      return b !== 'wf/r-1/docs' && 'unchanged';
    });
    assert.deepEqual(asked, ['wf/r-1/docs'], 'git is asked once a branch, and not past the first branch that is not on the base');
  });
});

describe('`nemia decide` read off where the result branch stands', () => {
  test('`to decide` in a folder with no ending step: a finished run whose branch is ahead of the base and not gone, read off git each pass — and nothing once it is merged', () => {
    const ahead = assess(
      aRead(STEPS, finished(), {
        phaseOf: DONE,
        signedOff: signedDone,
        asked,
        verdictOf: () => undefined,
        asks: [],
        roundAsks: [],
        sessionBlocked: () => false,
        spendOf: () => undefined,
        standings: AHEAD,
      }),
    );
    assert.deepEqual([ahead.status, ahead.toDecide], ['succeeded', { kind: 'result', branches: ['wf/r-1/implement'] }]);
    assert.equal(
      toDecideWords(finished(), ahead.toDecide!),
      'wf/r-1/implement is ahead of main, and nothing has merged it — nemia decide r-1',
    );
    const standing = (where: 'on' | 'gone') => [{ branch: 'wf/r-1/implement', where }];
    for (const where of ['on', 'gone'] as const) {
      assert.equal(
        assess(
          aRead(STEPS, finished(), {
            phaseOf: DONE,
            signedOff: signedDone,
            asked,
            verdictOf: () => undefined,
            asks: [],
            roundAsks: [],
            sessionBlocked: () => false,
            spendOf: () => undefined,
            standings: standing(where),
          }),
        ).toDecide,
        undefined,
        where,
      );
    }
    assert.equal(
      assess(
        aRead(STEPS, finished(), {
          phaseOf: DONE,
          signedOff: signedDone,
          asked,
          verdictOf: () => undefined,
          asks: [],
          roundAsks: [],
          sessionBlocked: () => false,
          spendOf: () => undefined,
        }),
      ).toDecide,
      undefined,
      'nothing read off git says nothing',
    );
    const broke = assess(
      aRead(STEPS, finished(), {
        phaseOf: phases({ t1: 'succeeded', t2: 'failed' }),
        signedOff: signedDone,
        asked,
        verdictOf: () => undefined,
        asks: [],
        roundAsks: [],
        sessionBlocked: () => false,
        spendOf: () => undefined,
        standings: AHEAD,
      }),
    );
    assert.deepEqual(
      [broke.status, broke.toDecide],
      ['failed', undefined],
      'only a run every step of which finished: a broken step is what its run waits on',
    );
    assert.equal(
      assess(
        aRead(STEPS, finished(CANCELLED), {
          phaseOf: DONE,
          signedOff: signedDone,
          asked,
          verdictOf: () => undefined,
          asks: [],
          roundAsks: [],
          sessionBlocked: () => false,
          spendOf: () => undefined,
          standings: AHEAD,
        }),
      ).toDecide,
      undefined,
      'and only one nobody called off',
    );
    assert.equal(
      assess(
        aRead(STEPS, run({ implement: 't1', review: null }), {
          phaseOf: phases({ t1: 'running' }),
          signedOff: signedDone,
          asked,
          verdictOf: () => undefined,
          asks: [],
          roundAsks: [],
          sessionBlocked: () => false,
          spendOf: () => undefined,
          standings: AHEAD,
        }),
      ).toDecide,
      undefined,
      'still running',
    );
  });
  test("a gate on the last step of a folder that merges nothing: approving accepts what it did, so `says` is its closeout's, not its prose — and the branch is still a person's once approved", () => {
    const gatedLast: StepSpec[] = [step('implement'), { ...step('review', ['implement']), gate: true }];
    const r = finished();
    assert.deepEqual(
      endingSteps(gatedLast, r).map((s) => s.name),
      ['review'],
      "a terminal gated step is where a person's word ends the run",
    );

    const held = assess(
      aRead(gatedLast, r, {
        phaseOf: DONE,
        signedOff: signedDone,
        asked,
        verdictOf: () => undefined,
        asks: [],
        roundAsks: [],
        sessionBlocked: () => false,
        spendOf: () => undefined,
        standings: AHEAD,
      }),
    );
    assert.deepEqual(
      held.toDecide,
      { kind: 'approve', step: 'review' },
      "at the gate: the word, and nothing of the step's own prose; approving accepts what it handed on",
    );
    assert.equal(toDecideWords(r, held.toDecide), 'review has signed off at its gate — nemia approve r-1 review');

    const approval = (step: string, n: number) => ({ step, try: n, at: '2026-09-16T23:10:00.000Z' });
    const approved = () =>
      assess(
        aRead(gatedLast, finished({ approvals: [approval('review', 1)] }), {
          phaseOf: DONE,
          signedOff: signedDone,
          asked,
          verdictOf: () => undefined,
          asks: [],
          roundAsks: [],
          sessionBlocked: () => false,
          spendOf: () => undefined,
          standings: AHEAD,
        }),
      );
    assert.deepEqual(
      [approved().status, approved().toDecide],
      ['succeeded', { kind: 'result', branches: ['wf/r-1/implement'] }],
      'approved: nothing merges its branch, so the run is one to decide until git says the branch landed',
    );
    const landed = assess(
      aRead(gatedLast, finished({ approvals: [approval('review', 1)] }), {
        phaseOf: DONE,
        signedOff: signedDone,
        asked,
        verdictOf: () => undefined,
        asks: [],
        roundAsks: [],
        sessionBlocked: () => false,
        spendOf: () => undefined,
        standings: [{ branch: 'wf/r-1/implement', where: 'on' }],
      }),
    );
    assert.equal(landed.toDecide, undefined, 'merged by hand, it is decided');
  });
});

describe('`branchWord`: where a result branch stands against the base branch, for a person', () => {
  test('`branchWord`: where a result branch stands against the base branch, for a person', () => {
    const r = finished();
    assert.equal(branchWord(r, { branch: 'wf/r-1/implement', where: 'on' }), 'wf/r-1/implement is on main');
    assert.equal(
      branchWord(r, { branch: 'wf/r-1/implement', where: 'ahead', commits: 3 }),
      'wf/r-1/implement is ahead of main by 3 commits',
    );
    assert.equal(
      branchWord(r, { branch: 'wf/r-1/implement', where: 'ahead', commits: 1 }),
      'wf/r-1/implement is ahead of main by 1 commit',
    );
    assert.equal(branchWord(r, { branch: 'wf/r-1/implement', where: 'gone' }), 'wf/r-1/implement is gone: git no longer has it');
    assert.match(
      branchWord(r, { branch: 'wf/r-1/implement', where: 'unread', why: 'git timed out' }),
      /^wf\/r-1\/implement: .*git timed out/,
    );
    assert.equal(firstLine('\n\n  Ship it.\nThen the check.\n'), 'Ship it.');
    assert.equal(firstLine(''), '');
  });
});
