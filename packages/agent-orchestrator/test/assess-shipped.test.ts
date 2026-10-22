/**
 * Whether a run has shipped or is a person's to decide, as tables: `decision`, which asks git and stores nothing; an ending's gate read
 * against where its result branch stands (`assess`, `listing`, `approvalRefusal`, `forgetRefusal`); an ending that lands on its check
 * (`landsOnCheck`, `approvedFirst`, `endingSteps`, `endingStopped`, `ownStatus`); and the checkout one run's ending holds (`heldCheckouts`,
 * `branchWord`). The gate itself is `assess-endings.test.ts`, an ending's brief `assess-endings-brief.test.ts`, and the ending's own
 * functions `src/ending/ending.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalRefusal,
  approvedFirst,
  assess,
  branchWord,
  decision,
  endingSteps,
  endingStopped,
  firstLine,
  forgetRefusal,
  heldCheckouts,
  landsOnCheck,
  listing,
  merges,
  ownStatus,
  runReady,
  toDecideWords,
  type Decision,
  type MainClaim,
  type MergeState,
  type RepositoryRun,
  type Run,
  type StepRecord,
  type TaskPhase,
} from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { Workflow } from '../src/workflow.ts';
import { names, phases, run, step, STEPS } from './assessed.ts';

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
const DONE = phases({ t1: 'succeeded', t2: 'succeeded' });
const nothingShipped = () => false;
const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});
const approval = (step: string, n: number, message?: string) => ({
  step,
  try: n,
  at: '2026-09-16T23:10:00.000Z',
  ...(message ? { message } : {}),
});

/** `implement → review → ship`, as the dev folders are: the ending step works in the repository's checkout, and is gated. */
const SHIP: Workflow = {
  name: 'ship',
  after: ['review'],
  workspace: 'main',
  gate: true,
  body: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit.\n\nAbort on any failure.",
};
const ENDS: Workflow[] = [step('implement'), step('review', ['implement']), SHIP];
/** implement and review done on the run's branch, ship never filed. */
const atEnd = (extra: Partial<RepositoryRun> = {}) =>
  run(
    {},
    {
      ...extra,
      steps: {
        implement: { taskId: 't1', workspace: '/wt', branch: 'wf/r-1/implement' },
        review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' },
        ship: { taskId: null },
        ...extra.steps,
      },
    },
  );
const AHEAD = [{ branch: 'wf/r-1/implement', where: 'ahead' as const, commits: 3 }];

/** `implement → ship`, ship an ending with a check: approved first, in the repository's checkout (`landsOnCheck`). */
const LANDER: Workflow = { name: 'ship', after: ['implement'], body: 'ship it', workspace: 'main', gate: true, check: 'npm test' };
const LANDING_STEPS = [step('implement'), LANDER];
/** ship filed, signed, its check filed. */
const atLanding = (rest: Partial<RepositoryRun> = {}, ship: Partial<StepRecord> = {}): Run => ({
  ...run({ implement: 't-impl' }, { approvals: [{ step: 'ship', try: 1, at: '2026-01-01T00:30:00Z' }], ...rest }),
  steps: {
    implement: { taskId: 't-impl', branch: 'wf/r-1/implement' },
    ship: { taskId: 't-ship', check: { taskId: 't-ship-check' }, ...ship },
  },
});

test("decision: shipped is asked of git and never stored, and a finished run is a person's to decide", async (t) => {
  await t.test('a run still going has nothing to decide, and says what it is waiting on', () => {
    const d = decision(STEPS, run({ implement: 't1', review: null }), phases({ t1: 'running' }), nothingShipped);
    assert.equal(d.kind, 'running');
    assert.deepEqual(d.kind === 'running' && d.waiting, ['implement']);
  });

  await t.test('a cancelled run has nothing to decide either', () => {
    const d = decision(STEPS, finished({ cancelledAt: '2026-01-01T00:00:00Z' }), DONE, nothingShipped);
    assert.equal(d.kind, 'cancelled');
  });

  await t.test('a finished run is AWAITING a person — succeeding is not deciding', () => {
    const d = decision(STEPS, finished(), DONE, nothingShipped);
    assert.equal(d.kind, 'awaiting');
    assert.deepEqual(d.kind === 'awaiting' && d.branches, ['wf/r-1/review']);
  });

  await t.test('shipped is asked of git, not stored on the run', () => {
    const d = decision(STEPS, finished(), DONE, (b) => b === 'wf/r-1/review');
    assert.equal(d.kind, 'shipped');
  });

  await t.test('a fan-out is not shipped because ONE of its branches landed', () => {
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
    assert.equal(decision(fan, r, all, (b) => b === 'wf/r-1/docs').kind, 'awaiting');
    assert.equal(decision(fan, r, all, () => true).kind, 'shipped');
  });

  await t.test('a FAILED run is still decided, and names the step that failed', () => {
    const d = decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'failed' }), nothingShipped);
    assert.equal(d.kind, 'awaiting', 'a run marked failed whose branch holds real work nobody read is still for a person to decide');
    assert.equal(d.kind === 'awaiting' && d.outcome, 'failed');
    assert.deepEqual(d.kind === 'awaiting' && d.failed, ['review']);
  });

  await t.test('a run that worked directly on its base branch is never read as shipped', () => {
    const direct = run(
      {},
      {
        isolate: false,
        steps: { implement: { taskId: 't1', branch: 'main' }, review: { taskId: 't2', branch: 'main' } },
      },
    );
    const everythingShipped = () => true;

    const failed = decision(STEPS, direct, phases({ t1: 'succeeded', t2: 'failed' }), everythingShipped);
    assert.equal(
      failed.kind,
      'awaiting',
      'with --no-worktree every step works on main, and git merge-base --is-ancestor main main is true: asked, git would call a failed run shipped',
    );
    assert.equal(failed.kind === 'awaiting' && failed.outcome, 'failed', 'classified as for any run');
    assert.equal(failed.kind === 'awaiting' && failed.direct, true);

    const done = decision(STEPS, direct, DONE, everythingShipped);
    assert.equal(done.kind, 'awaiting', 'nothing to merge is not the same as merged');

    const isolated = decision(STEPS, finished(), DONE, everythingShipped);
    assert.equal(isolated.kind, 'shipped', 'a worktree run is still asked of git');
  });

  await t.test('a run that never filed anything has no branch to ship, and is not "shipped"', () => {
    const d = decision(STEPS, run({ implement: null, review: null }), phases({}), () => true);
    assert.equal(d.kind, 'running');
  });

  await t.test(
    'REFUSED: a result branch with nothing past the base is shipped only when every step succeeded — failed, blocked, unsigned or refused by its check, the run is decided; work past the base on the base branch is shipped whatever the steps said',
    () => {
      const unchanged = () => 'unchanged' as const;
      const says = (outcome: Closeout['outcome']) => (): Closeout => ({ outcome, summary: 's', artifacts: [] });
      const cases: Array<[string, Decision, string, string[]]> = [
        ['failed', decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'failed' }), unchanged), 'failed', ['review']],
        ['stopped', decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'stopped' }), unchanged), 'failed', ['review']],
        ['blocked', decision(STEPS, finished(), DONE, unchanged, says('blocked')), 'blocked', []],
        [
          'unsigned',
          decision(
            STEPS,
            finished(),
            DONE,
            unchanged,
            () => undefined,
            () => true,
          ),
          'blocked',
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
      const checked: Workflow[] = [step('implement'), { ...step('review', ['implement']), check: 'npm test' }];
      const refused = decision(
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
        phases({ t1: 'succeeded', t2: 'succeeded', c2: 'failed' }),
        unchanged,
        says('done'),
        () => true,
        () => 1,
      );
      assert.deepEqual(
        refused.kind === 'awaiting' && [refused.outcome, refused.failedCheck],
        ['failed', ['review']],
        'refused by its check',
      );

      assert.deepEqual(
        decision(STEPS, finished(), DONE, unchanged),
        { kind: 'shipped', branches: ['wf/r-1/review'] },
        'every step succeeded, with nothing to commit: shipped',
      );
      assert.deepEqual(
        decision(STEPS, finished(), DONE, unchanged, says('done'), () => true),
        { kind: 'shipped', branches: ['wf/r-1/review'] },
      );
      assert.deepEqual(
        decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'failed' }), () => true),
        { kind: 'shipped', branches: ['wf/r-1/review'] },
        'work past the base, merged by a person: shipped though a step failed',
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
      const failing = decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }), half);
      assert.deepEqual(
        failing.kind === 'awaiting' && [failing.outcome, failing.failed],
        ['failed', ['tests']],
        'a fan-out ships on its work only when every branch has some on the base; one that never moved leaves a failed run decided',
      );
      assert.equal(decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), half).kind, 'shipped');
      assert.equal(decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }), () => true).kind, 'shipped');

      const asked: string[] = [];
      decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }), (b) => {
        asked.push(b);
        return b !== 'wf/r-1/docs' && 'unchanged';
      });
      assert.deepEqual(asked, ['wf/r-1/docs'], 'git is asked once a branch, and not past the first branch that is not on the base');
    },
  );
});

test("an ending's gate and git's word: what is to decide, read off where the result branch stands", async (t) => {
  await t.test(
    "a run at its ending step's gate is not shipped while its result is off the base, and nothing that waits on it starts — but one whose result a person merged by hand has, as git says, and any other gate holds whatever git says",
    () => {
      const merged = () => true as const;
      const ahead = () => false as const;
      const d = decision(ENDS, atEnd(), DONE, ahead, signedDone, asked);
      assert.equal(d.kind, 'awaiting');
      if (d.kind !== 'awaiting') return;
      assert.deepEqual([d.outcome, d.awaitingApproval, d.branches, d.direct], ['blocked', ['ship'], ['wf/r-1/implement'], false]);
      assert.equal(
        runReady(run({}, { after: ['r-1'] }), () => false),
        false,
        'a run waiting on it is not ready',
      );

      const byHand = decision(ENDS, atEnd(), DONE, merged, signedDone, asked);
      assert.deepEqual(
        [byHand.kind, byHand.kind === 'shipped' ? byHand.branches : []],
        ['shipped', ['wf/r-1/implement']],
        'merged by hand before the ending ran: the gate held the merge and nothing else, and git has it: shipped, so a run --after it starts',
      );
      assert.equal(
        decision(ENDS, atEnd(), DONE, () => 'unchanged' as const, signedDone, asked).kind,
        'shipped',
        "the work committed nothing past the run's base: on the base as the no-ending kind reads it, shipped once every step finished",
      );

      const accepted: Workflow[] = [step('implement'), { ...step('review', ['implement']), gate: true }];
      const signed = run(
        { implement: 't1', review: 't2' },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' },
          },
        },
      );
      const held = decision(accepted, signed, DONE, merged, signedDone, asked);
      assert.deepEqual(
        [held.kind, held.kind === 'awaiting' ? held.awaitingApproval : []],
        ['awaiting', ['review']],
        "any other gate is a person's word git cannot give: a gated step that has run and signed off, its branch merged, is still awaiting it",
      );
      const ran = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      const shipped = decision(ENDS, ran, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), merged, signedDone, asked);
      assert.deepEqual(
        [shipped.kind, shipped.kind === 'shipped' ? shipped.branches : []],
        ['shipped', ['wf/r-1/implement']],
        'approved, filed and done, it ships as any run does: on the branch the ending step merged, never on main',
      );
    },
  );

  await t.test(
    "an ending's gate whose result git already has is nothing to decide: `to decide`, the listing and `nemia approve` read the same standing — and only an ending that has not run, only on git's word",
    () => {
      const ON = [{ branch: 'wf/r-1/implement', where: 'on' as const }];
      const GONE = [{ branch: 'wf/r-1/implement', where: 'gone' as const }];
      const onBase = assess(
        ENDS,
        atEnd(),
        DONE,
        signedDone,
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        ON,
      );
      assert.deepEqual([onBase.ready, onBase.toDecide], [[], undefined], 'nothing filed, and nothing to decide');
      const l = listing({
        steps: ENDS,
        run: atEnd(),
        phaseOf: DONE,
        closeoutOf: signedDone,
        askedCloseout: asked,
        verdictOf: () => undefined,
        asks: [],
        roundAsks: [],
        answers: [],
        waits: [],
        saidTo: () => 0,
        spendOf: () => undefined,
        standings: ON,
      });
      assert.deepEqual([l.toDecide, l.waitingOnYou], [undefined, []]);
      assert.equal(
        l.steps[2].note,
        'wf/r-1/implement is on main — nothing is left for ship to merge: the run has shipped as git reads it, and nothing waits on you; close the record if you want it closed: nemia cancel r-1',
      );
      assert.equal(
        approvalRefusal(
          ENDS,
          atEnd(),
          'ship',
          undefined,
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          () => undefined,
          ON,
        ),
        'wf/r-1/implement is on main, so there is nothing left for ship to merge: approving would file it to merge what the base branch already has. ' +
          'The run has shipped as git reads it — nemia decide r-1 says so, and a run started --after it goes on without ship. Nothing waits on you; if you want the record closed: nemia cancel r-1.',
      );
      assert.equal(
        forgetRefusal(
          ENDS,
          atEnd(),
          DONE,
          [],
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => undefined,
          undefined,
          ON,
        ),
        null,
        'nemia rm reads the same standing: the gate holds nothing, so it names no approval',
      );
      assert.match(
        String(forgetRefusal(ENDS, atEnd(), DONE, [], signedDone, asked)),
        /^ship waits at its gate for your approval, and it is filed once it is approved: nemia approve r-1 ship/,
        'without the standing, the approval is what holds the run',
      );

      for (const [said, standings] of [
        ["a branch ahead leaves the gate a person's word", AHEAD],
        ["a branch git no longer has leaves the gate a person's word", GONE],
        ["no standing read at all, the board's call, leaves the gate a person's word", []],
      ] as const) {
        assert.equal(
          assess(
            ENDS,
            atEnd(),
            DONE,
            signedDone,
            asked,
            () => undefined,
            [],
            [],
            () => false,
            () => undefined,
            standings,
          ).toDecide?.kind,
          'approve',
          said,
        );
        assert.equal(
          approvalRefusal(
            ENDS,
            atEnd(),
            'ship',
            undefined,
            DONE,
            signedDone,
            asked,
            () => undefined,
            [],
            () => undefined,
            standings,
          ),
          null,
          said,
        );
        assert.deepEqual(
          listing({
            steps: ENDS,
            run: atEnd(),
            phaseOf: DONE,
            closeoutOf: signedDone,
            askedCloseout: asked,
            verdictOf: () => undefined,
            asks: [],
            roundAsks: [],
            answers: [],
            waits: [],
            saidTo: () => 0,
            spendOf: () => undefined,
            standings,
          }).waitingOnYou,
          ['ship'],
          said,
        );
      }

      const accepted: Workflow[] = [step('implement'), { ...step('review', ['implement']), gate: true }];
      const signed = run(
        { implement: 't1', review: 't2' },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' },
          },
        },
      );
      assert.deepEqual(
        assess(
          accepted,
          signed,
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          ON,
        ).toDecide,
        { kind: 'approve', step: 'review', says: null, filed: true },
        "a gate on a last step that has run and merges nothing is acceptance of what it did, not a merge: git's standing does not answer it",
      );
      assert.equal(
        approvalRefusal(
          accepted,
          signed,
          'review',
          undefined,
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          () => undefined,
          ON,
        ),
        null,
      );
    },
  );

  await t.test(
    '`to decide` in a folder with no ending step: a finished run whose branch is ahead of the base and not gone, read off git each pass — and nothing once it is merged',
    () => {
      const ahead = assess(
        STEPS,
        finished(),
        DONE,
        signedDone,
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        AHEAD,
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
            STEPS,
            finished(),
            DONE,
            signedDone,
            asked,
            () => undefined,
            [],
            [],
            () => false,
            () => undefined,
            standing(where),
          ).toDecide,
          undefined,
          where,
        );
      }
      assert.equal(
        assess(
          STEPS,
          finished(),
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
        ).toDecide,
        undefined,
        'nothing read off git says nothing',
      );
      const broke = assess(
        STEPS,
        finished(),
        phases({ t1: 'succeeded', t2: 'failed' }),
        signedDone,
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        AHEAD,
      );
      assert.deepEqual(
        [broke.status, broke.toDecide],
        ['failed', undefined],
        'only a run every step of which finished: a broken step is what its run waits on',
      );
      assert.equal(
        assess(
          STEPS,
          finished(CANCELLED),
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          AHEAD,
        ).toDecide,
        undefined,
        'and only one nobody called off',
      );
      assert.equal(
        assess(
          STEPS,
          run({ implement: 't1', review: null }),
          phases({ t1: 'running' }),
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          AHEAD,
        ).toDecide,
        undefined,
        'still running',
      );
      assert.deepEqual(
        assess(
          ENDS,
          atEnd(),
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          AHEAD,
        ).toDecide,
        {
          kind: 'approve',
          step: 'ship',
          says: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit.",
          filed: false,
        },
        'a gated ending is the decision, not git: its branch ahead says nothing more than its gate does',
      );
    },
  );

  await t.test(
    "a gate on the last step of a folder that merges nothing: approving accepts what it did, so `says` is its closeout's, not its prose — and the branch is still a person's once approved",
    () => {
      const gatedLast: Workflow[] = [step('implement'), { ...step('review', ['implement']), gate: true }];
      const r = finished();
      assert.equal(merges(gatedLast), false);
      assert.equal(merges(ENDS), true, 'a folder whose ending acts on the base branch answers for its own branch');
      assert.deepEqual(
        endingSteps(gatedLast, r).map((s) => s.name),
        ['review'],
        "a terminal gated step is where a person's word ends the run",
      );

      const held = assess(
        gatedLast,
        r,
        DONE,
        signedDone,
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        AHEAD,
      );
      assert.deepEqual(
        held.toDecide,
        { kind: 'approve', step: 'review', says: null, filed: true },
        "at the gate: the word, and nothing of the step's own prose; approving accepts what it handed on",
      );
      assert.equal(toDecideWords(r, held.toDecide), 'review has signed off at its gate — nemia approve r-1 review');

      const approved = () =>
        assess(
          gatedLast,
          finished({ approvals: [approval('review', 1)] }),
          DONE,
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          AHEAD,
        );
      assert.deepEqual(
        [approved().status, approved().toDecide],
        ['succeeded', { kind: 'result', branches: ['wf/r-1/implement'] }],
        'approved: nothing merges its branch, so the run is one to decide until git says the branch landed',
      );
      const landed = assess(
        gatedLast,
        finished({ approvals: [approval('review', 1)] }),
        DONE,
        signedDone,
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        [{ branch: 'wf/r-1/implement', where: 'on' }],
      );
      assert.equal(landed.toDecide, undefined, 'merged by hand, it is decided');
      const ran = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      assert.equal(
        assess(
          ENDS,
          ran,
          phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }),
          signedDone,
          asked,
          () => undefined,
          [],
          [],
          () => false,
          () => undefined,
          AHEAD,
        ).toDecide,
        undefined,
        "a folder whose ending merges says nothing once that step has run: the branch is its business, not a person's git",
      );
    },
  );
});

test('an ending that lands on its check: who files it, whether it stopped on the base branch, its own status, and `nemia rm` of its merge', async (t) => {
  await t.test(
    'an ending lands on its check where it acts on the base branch and has a check, whoever files it: never a plain step or one with no check',
    () => {
      assert.equal(landsOnCheck(LANDER, run({})), true);
      assert.equal(landsOnCheck({ ...LANDER, check: undefined }, run({})), false, 'a ship with no check: its session lands it, as before');
      assert.equal(landsOnCheck({ ...LANDER, workspace: undefined }, run({})), false, 'a step of the work');
      assert.equal(
        landsOnCheck({ ...LANDER, gate: undefined }, run({})),
        true,
        "an ungated ending lands on its check in the same way: who files it — a person's approval, or the pass of a review before it — is `approvedFirst`'s and `hasGate`'s, never this",
      );
      assert.equal(landsOnCheck({ ...LANDER, gate: undefined }, run({}, { gates: ['ship'] })), true, 'a gate makes no difference to it');
    },
  );

  await t.test(
    "an ungated ending is nobody's to decide: no gated ending, nothing at a gate, and the send-back through its loop still offered",
    () => {
      const ungated = { ...LANDER, gate: undefined };
      const steps = [{ ...step('implement'), loop: undefined }, { ...step('review'), after: ['implement'], loop: 'implement' }, ungated];
      const ours = run({ implement: 't-impl', review: 't-review' });
      assert.deepEqual(endingSteps(steps, ours), [], 'nothing of it waits on a person');
      assert.deepEqual(
        endingSteps([step('implement'), LANDER], ours).map((s) => s.name),
        ['ship'],
        'a gated one does',
      );
      assert.equal(approvedFirst(ungated, ours), false, 'and no approval is owed before it is filed');
      assert.equal(approvedFirst(LANDER, ours), true);
    },
  );

  await t.test(
    'an ending that stopped on the base branch is read so whether a person filed it or its workflow did: the send-back and its own try are offered either way',
    () => {
      const ungated = { ...LANDER, gate: undefined };
      const shipFiledAndSettled = (rest: Partial<RepositoryRun> = {}): Run => ({
        ...run({ implement: 't-impl' }, rest),
        steps: { implement: { taskId: 't-impl', branch: 'wf/r-1/implement' }, ship: { taskId: 't-ship' } },
      });
      const settled = () => 'succeeded' as TaskPhase;
      const did = (ending: Workflow, outcome: Closeout['outcome'] = 'blocked', rest: Partial<RepositoryRun> = {}): boolean =>
        endingStopped(
          ending,
          shipFiledAndSettled(rest),
          settled,
          (name) => (name === 'ship' ? said(outcome) : undefined),
          () => true,
          [step('implement'), ending],
          () => undefined,
        );

      assert.equal(
        did(ungated),
        true,
        "quick's land: filed by its review's pass and stopped there, it still offers `nemia retry <run> land` and the send-back",
      );
      assert.equal(did(LANDER), true, "build's land, gated, as before");
      assert.equal(
        did({ ...LANDER, gate: undefined }, 'blocked', { gates: ['ship'] }),
        true,
        'a gate the run was started with changes nothing',
      );
      assert.equal(
        did({ ...ungated, workspace: undefined }),
        false,
        'a step of the work stopped on no base branch, and has its own ways on',
      );
      assert.equal(did(ungated, 'done'), false, 'an ending that signed off done stopped at nothing');
    },
  );

  await t.test(
    'ownStatus reads an ending that lands on its check off the landing: checking until it lands, verified on a commit, failed on an abort',
    () => {
      const own = (r: Run, check: TaskPhase) =>
        ownStatus(
          LANDER,
          r,
          phases({ 't-ship': 'succeeded', 't-ship-check': check }),
          signedDone,
          () => false,
          LANDING_STEPS,
          () => undefined,
        );
      assert.equal(own(atLanding(), 'succeeded'), 'checking', 'a check that passed has not landed anything');
      assert.equal(own(atLanding({}, { landed: { commit: 'merged0' } }), 'succeeded'), 'verified');
      assert.equal(own(atLanding({}, { landed: { aborted: 'its check refused the merge (exit 1)' } }), 'failed'), 'failed (check)');
      assert.equal(
        own(atLanding({}, { landed: { aborted: 'ship signed off no commit message' } }), 'succeeded'),
        'failed',
        'a passing check whose merge was not committed',
      );
    },
  );

  await t.test("REFUSED: nemia rm of a run whose ending's merge is staged and not landed, with nothing of it running", () => {
    const r = atLanding();
    const ph = phases({ 't-impl': 'succeeded', 't-ship': 'succeeded', 't-ship-check': 'succeeded' });
    const closeoutOf = (): Closeout => ({ ...signedDone(), output: { message: 'Add a flag' } });
    const forget = (at: Run, merging: MergeState['merging']) =>
      forgetRefusal(
        LANDING_STEPS,
        at,
        ph,
        [],
        closeoutOf,
        () => false,
        () => undefined,
        [],
        [],
        () => undefined,
        undefined,
        [],
        'rm',
        merging,
      );
    const refusal = forget(r, 'ours');
    names(String(refusal), "ship's merge is staged", '(/repo)', 'not yet committed or aborted');
    names(String(refusal), 'The next tick lands it', 'nemia rm r-1 once nemia ls r-1');
    assert.match(
      String(forget(r, 'none')),
      /ship signed off, and the run has not yet checked its merge and committed or aborted it/,
      'nothing staged, and nothing landed yet',
    );
    assert.equal(
      forget({ ...r, steps: { ...r.steps, ship: { ...r.steps.ship, landed: { commit: 'merged0' } } } }, 'none'),
      null,
      'landed, it is forgotten',
    );
  });
});

test("`heldCheckouts` and `branchWord`: the repository's checkout goes to one run's ending, and where a result branch stands", async (t) => {
  await t.test(
    "the repository's own checkout goes to one run's ending step: a step in it keeps it, the oldest word takes a free one, and the words say which run has it",
    () => {
      const claim = (id: string, over: Partial<MainClaim> = {}): MainClaim => ({
        id,
        repo: '/repo',
        step: 'ship',
        holds: false,
        at: '2026-09-17T11:00:00.000Z',
        ...over,
      });

      const free = heldCheckouts([
        claim('r-3', { at: '2026-09-17T12:00:00.000Z' }),
        claim('r-1'),
        claim('r-2', { at: '2026-09-17T10:00:00.000Z' }),
      ]);
      assert.deepEqual(
        [...free],
        [
          ['r-1', { run: 'r-2', step: 'ship' }],
          ['r-3', { run: 'r-2', step: 'ship' }],
        ],
        'with nothing in it, the oldest word takes it, whatever order the claims come in, and whichever run was made first',
      );
      assert.deepEqual(
        [...heldCheckouts([claim('r-b'), claim('r-a')])],
        [['r-b', { run: 'r-a', step: 'ship' }]],
        'the same words on two runs: the id breaks the tie, so a pass cannot hand the checkout to a different one each time it asks',
      );
      const busy = heldCheckouts([
        claim('r-1', { at: '2026-09-17T09:00:00.000Z' }),
        claim('r-9', { holds: true, at: undefined }),
        claim('r-2'),
      ]);
      assert.deepEqual(
        [...busy],
        [
          ['r-1', { run: 'r-9', step: 'ship' }],
          ['r-2', { run: 'r-9', step: 'ship' }],
        ],
        'a step already in it keeps it, whatever was said and whenever: nothing is taken from under a session that is merging',
      );
      assert.deepEqual(
        [...heldCheckouts([claim('r-1'), claim('r-2', { repo: '/other' })])],
        [],
        "one repository at a time: two runs of two checkouts hold nothing of each other's",
      );
      assert.deepEqual(
        [...heldCheckouts([claim('r-1', { at: undefined }), claim('r-2', { at: undefined })])],
        [],
        "a run that has nobody's word waits for nothing: it is not filed for other reasons, and says them",
      );
    },
  );

  await t.test('`branchWord`: where a result branch stands against the base branch, for a person', () => {
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
    assert.equal(firstLine('\n\n  Ship it.\nThen the check.\n'), 'Ship it.');
    assert.equal(firstLine(''), '');
  });
});
