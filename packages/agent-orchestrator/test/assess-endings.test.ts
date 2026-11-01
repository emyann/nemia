/**
 * The gate of an ending — a last step that works in the repository's own checkout (`workspace: main`) and is filed only once a person
 * approves it — as tables: what `assess`, `stepStatus` and `to decide` say at it, the approval and the send-back it offers and refuses
 * (`approvalRefusal`, `retryable`, `retryRefusal`, `roundAsk`), and what `nemia ls`, `nemia rm` and `nemia cancel` read of it (`listing`,
 * `forgetRefusal`, `cancelPlan`, `gateLines`). What an ending is told: `workspace: main` is the repository's own checkout
 * (`workspacePlan`), the run's result is the work the ending acts on (`resultSteps`, `tipBranches`, `handOffDue`), and its brief
 * (`composeBrief`) says where that work is, the check it was judged by, the one place its files go, and the approval that filed it.
 * Whether a run has landed or is a person's to decide: `decision`, which asks git and stores nothing; an ending's gate read against where
 * its result branch stands (`assess`, `listing`, `approvalRefusal`, `forgetRefusal`); an ending that lands on its check (`landsOnCheck`,
 * `approvedFirst`, `endingSteps`, `endingStopped`, `ownStatus`); and the checkout one run's ending holds (`heldCheckouts`, `branchWord`).
 * The ending's own functions are `src/ending/ending.test.ts`, and a run walked through it on disk `ship.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalRefusal,
  approvedFirst,
  artifactsContract,
  assess,
  branchWord,
  cancelPlan,
  composeBrief,
  decision,
  endingSteps,
  endingStopped,
  firstLine,
  forgetRefusal,
  gateLines,
  handOffDue,
  heldCheckouts,
  landsOnCheck,
  merges,
  onYouWords,
  ownStatus,
  resultSteps,
  retryable,
  retryRefusal,
  roundAsk,
  runReady,
  stepStatus,
  tipBranches,
  toDecideWords,
  unheld,
  workChecks,
  workspacePlan,
  type Decision,
  type MainClaim,
  type MergeState,
  type RepositoryRun,
  type RetryBriefing,
  type Run,
  type StepRecord,
  type TaskPhase,
} from '../src/run.ts';
import type { RetryAsk } from '../src/retry/retry-ask.ts';
import { parseAgent, parseWorkflow, type OutputSchema, type Workflow } from '../src/workflow.ts';
import { listing, names, namesFor, phases, run, step, STEPS } from './assessed.ts';
import type { Closeout } from '../src/closeout/closeout.ts';

const DONE = phases({ t1: 'succeeded', t2: 'succeeded' });
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
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

/** An agent whose instructions open by saying who it is, as every agent's do: what a gate must never quote as the decision. */
const OTTO = parseAgent(
  'otto',
  "---\nmodel: opus\n---\nYou are Otto, a release engineer. You land a run's result: in the repository's own checkout, you stage its merge.\n\nNever push.\n",
);
const LANDS = "Land this run's result on the base branch: stage the merge of its branch and sign off with the commit message.";
/** `implement → review → land`, land an ending led by `otto`, with the note `note` below its frontmatter. */
const landing = (note: string): Workflow[] => [
  step('implement'),
  step('review', ['implement']),
  parseWorkflow(
    'land',
    `---\nafter: review\nplace: git\nworkspace: main\ngate: true\nagent: otto\n---\n${note}`,
    undefined,
    new Map([['otto', OTTO]]),
  ),
];
const atOtto = (land: string | null = null) =>
  run({}, { steps: { implement: { taskId: 't1' }, review: { taskId: 't2' }, land: { taskId: land } } });
const FILES = '/wf/runs/r-1/artifacts/implement';

/**
 * The git place's words, as it declares them (`place/git/declared.ts`, whose `say` this is, copied: a test of the package's pure code
 * reaches no part of the real place).
 */
const SAY = {
  look: ['git diff {baseRef}', 'git status'],
  readResult: 'git -C {repo} diff {baseRef}...{branch}',
  ship: 'git -C {repo} merge --no-ff {branch}',
  drop: 'git -C {repo} branch -D {branches}',
  conflicts: '`git status` shows them.',
  unlock: 'git -C {repo} worktree unlock {path}',
  stage: 'git -C {repo} merge --no-ff --no-commit {branches}',
  attach: 'git -C {path} switch -c <branch>',
  commit: 'git -C {path} commit',
  inspect: 'git -C {path} status',
  orphans: 'git worktree list in their repository, and git worktree remove each',
  results: ['git log --oneline {base}..{branch}', 'git diff {base}...{branch}'],
  merge: 'git merge {sha}',
  mergeUncommitted: 'git merge --no-ff --no-commit {sha}',
  showMerge: 'git show --remerge-diff',
  lastMerge: 'git log --merges -1',
};
/** `s`'s brief in `r`, told the git place's words for reading the work. */
const placed = (s: Workflow, r: Run, steps: readonly Workflow[]): string =>
  composeBrief(
    s,
    r,
    steps,
    ...([undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined] as const),
    { say: SAY },
  );

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
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});

/** `implement → ship`, ship an ending with a check: approved first, in the repository's checkout (`landsOnCheck`). */
const LANDER: Workflow = { name: 'ship', after: ['implement'], body: 'land it', workspace: 'main', gate: true, check: 'npm test' };
const LANDING_STEPS = [step('implement'), LANDER];
/** ship filed, signed, its check filed. */
const atLanding = (rest: Partial<RepositoryRun> = {}, ship: Partial<StepRecord> = {}): Run => ({
  ...run({ implement: 't-impl' }, { approvals: [{ step: 'ship', try: 1, at: '2026-01-01T00:30:00Z' }], ...rest }),
  steps: {
    implement: { taskId: 't-impl', branch: 'wf/r-1/implement' },
    ship: { taskId: 't-ship', check: { taskId: 't-ship-check' }, ...ship },
  },
});

test("an ending's gate holds it before it is filed, and `to decide` says the step's own note", async (t) => {
  await t.test(
    "an ending step's gate holds it BEFORE it is filed: at its result the run reads `awaiting approval` and files nothing, pass after pass, and `to decide` says what the step would do",
    () => {
      const r = atEnd();
      for (const pass of [1, 2, 3]) {
        const a = assess(ENDS, r, DONE, signedDone, asked);
        assert.deepEqual([a.ready, a.check, a.retry, a.round], [[], [], [], []], `pass ${pass}: nothing is filed`);
        assert.equal(stepStatus(SHIP, r, DONE, signedDone, asked, ENDS), 'awaiting approval');
        assert.deepEqual(a.toDecide, {
          kind: 'approve',
          step: 'ship',
          says: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit.",
          filed: false,
        });
      }
      const approved = assess(ENDS, atEnd({ approvals: [approval('ship', 1)] }), DONE, signedDone, asked);
      assert.deepEqual(
        [approved.ready, approved.toDecide],
        [['ship'], undefined],
        "a person's word is what files it, and it is the step's own approval that does: nothing else changed",
      );
      const ran = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      assert.equal(
        stepStatus(SHIP, ran, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), signedDone, asked, ENDS),
        'unverified',
        'once it has run, its gate holds nothing more: it was approved before it was filed',
      );
    },
  );

  await t.test(
    "REFUSED: a gate's `to decide` never quotes its step's agent — an ending led by an agent that says `You are …` is said in the step's own note, or from facts where it has none",
    () => {
      const noted = assess(landing(`${LANDS}\n\nAbort on a conflict.\n`), atOtto(), DONE, signedDone, asked);
      assert.deepEqual(
        noted.toDecide,
        { kind: 'approve', step: 'land', says: LANDS, filed: false },
        "the step's own note says what approving does",
      );
      assert.equal(toDecideWords(atOtto(), noted.toDecide), `${LANDS} — nemia approve r-1 land`);

      const bare = assess(landing(''), atOtto(), DONE, signedDone, asked);
      assert.deepEqual(
        bare.toDecide,
        { kind: 'approve', step: 'land', says: null, filed: false },
        'a step with no note of its own quotes nothing',
      );
      assert.equal(toDecideWords(atOtto(), bare.toDecide), 'land has not run: approving runs it — nemia approve r-1 land');

      for (const t of [noted.toDecide, bare.toDecide]) assert.doesNotMatch(toDecideWords(atOtto(), t), /You are/);
    },
  );

  await t.test(
    "REFUSED before the work is done: an ending step's gate does not hold while what it acts on is still running, and `nemia approve` says so at shipped defaults",
    () => {
      const running = atEnd({ steps: { review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' } } });
      const p = phases({ t1: 'succeeded', t2: 'running' });
      assert.equal(stepStatus(SHIP, running, p, signedDone, asked, ENDS), 'pending');
      assert.deepEqual(assess(ENDS, running, p, signedDone, asked).toDecide, undefined, 'nothing to decide while it runs');
      assert.equal(
        approvalRefusal(ENDS, running, 'ship', undefined, p, signedDone, asked),
        "ship is not at its gate yet: it ends the run in the repository's own checkout, and its gate holds once review has handed on — " +
          'your approval is then what files it, and nothing of it runs before that. See where the run stands: nemia ls r-1.',
      );
      const broke = phases({ t1: 'succeeded', t2: 'failed' });
      assert.equal(
        stepStatus(SHIP, atEnd(), broke, signedDone, asked, ENDS),
        'pending',
        'a step that broke leaves no gate to approve either',
      );
      assert.deepEqual(
        assess(ENDS, atEnd(), broke, signedDone, asked).toDecide,
        undefined,
        'the run waits on you for that step, not for its ending',
      );
      assert.match(String(approvalRefusal(ENDS, atEnd(), 'ship', undefined, broke, signedDone, asked)), /^ship is not at its gate yet/);
      assert.equal(approvalRefusal(ENDS, atEnd(), 'ship', undefined, DONE, signedDone, asked), null, 'at its gate, it may be approved');
    },
  );

  await t.test('REFUSED while the work is being sent back: approving an ending would take a result the objection is about', () => {
    const ask: RetryAsk = { step: 'review', try: 2, mode: 'continue', message: 'the flag is not stored', at: '2026-09-17T09:00:00.000Z' };
    assert.equal(
      approvalRefusal(ENDS, atEnd(), 'ship', undefined, DONE, signedDone, asked, () => undefined, [ask]),
      'try 2 of review is asked for (--continue, at 2026-09-17T09:00:00.000Z), and ship acts on what it changes: approving now would take the result that ask objects to. ' +
        "Approve ship once review has signed off again — or, to take the result as it stands, take that ask back first: retry-review-2, in the run's .asks directory.",
    );
  });
});

test("a send-back at an ending's gate goes to the work, and a try of the ending itself is refused before it has run", async (t) => {
  await t.test(
    "a send-back at an ending step's gate goes to the work: the step before it may be tried again with words, and is REFUSED without them",
    () => {
      const review = ENDS[1];
      const at = retryable(review, atEnd(), DONE, signedDone, asked, ENDS);
      assert.deepEqual([at.status, at.modes, at.sendsBack], ['unverified', ['continue', 'fresh'], true]);
      assert.equal(
        retryRefusal(ENDS, atEnd(), 'review', { mode: 'continue' }, DONE, signedDone, asked),
        "ship is at its gate, not review: ship ends the run in the repository's own checkout, nothing of it has run, and the send-back from that gate goes to review, the work it would act on. " +
          'A try with no words tells its session nothing to change, so it would sign off as it did. Say what to change: nemia retry r-1 review --message "<objection>" — or approve the ending, which is what files it: nemia approve r-1 ship.',
        'the step at the gate is ship, not review, and both commands it names are honoured: nemia approve r-1 review is refused, review has no gate',
      );
      assert.equal(
        retryRefusal(ENDS, atEnd(), 'review', { mode: 'fresh' }, DONE, signedDone, asked)?.includes(
          'nemia retry r-1 review --message "<objection>" --fresh',
        ),
        true,
        'the way asked for is kept in the command it names',
      );
      assert.equal(
        approvalRefusal(ENDS, atEnd(), 'review', undefined, DONE, signedDone, asked)?.startsWith('review has no gate:'),
        true,
        'the command it does not name',
      );
      assert.equal(
        retryRefusal(ENDS, atEnd(), 'review', { mode: 'continue', message: 'the flag is not stored' }, DONE, signedDone, asked),
        null,
      );
      const filed = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      assert.equal(
        retryable(review, filed, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'running' }), signedDone, asked, ENDS).sendsBack,
        undefined,
        'not once the ending is approved and filed: the run has acted, and there is nothing to hold back',
      );
      const ungated: Workflow[] = [step('implement'), step('review', ['implement']), { ...SHIP, gate: undefined }];
      assert.equal(
        retryable(review, atEnd(), DONE, signedDone, asked, ungated).sendsBack,
        undefined,
        'nor on a folder whose last step has no gate: a finished step nothing waits at is not sendable back',
      );
    },
  );

  await t.test(
    'REFUSED: a try of the ending step itself, which has not run — it names the approval that files it and the send-back to the work, not "there is nothing to try again"',
    () => {
      assert.equal(
        retryable(SHIP, atEnd(), DONE, signedDone, asked, ENDS).modes.length,
        0,
        'there is no try of a step nothing of which has run',
      );
      assert.equal(
        retryRefusal(ENDS, atEnd(), 'ship', { mode: 'continue' }, DONE, signedDone, asked),
        "ship is at its gate, and nothing of it has run: it ends the run in the repository's own checkout, and your approval is what files it, so there is no try of it to replace. " +
          'Approve it: nemia approve r-1 ship — or send the work back: nemia retry r-1 review --message "<objection>".',
      );
      namesFor(
        'with words, and with --fresh, the same: what is missing is not the objection, it is a try to replace',
        retryRefusal(ENDS, atEnd(), 'ship', { mode: 'fresh', message: 'merge it the other way round' }, DONE, signedDone, asked),
        'ship is at its gate',
        'nothing of it has run',
        'nemia approve r-1 ship',
      );
      const ran = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      assert.equal(
        retryRefusal(
          ENDS,
          ran,
          'ship',
          { mode: 'continue' },
          phases({ t1: 'succeeded', t2: 'succeeded', t3: 'running' }),
          signedDone,
          asked,
        ),
        `ship is still running, so there is nothing to try again until it ends. Wait for it: nemia ls r-1 (or stop the run: nemia cancel r-1).`,
        'once approved and filed, it is a step like any other: its own status says what there is to say',
      );
    },
  );
});

test("`nemia ls`, `nemia rm` and `nemia cancel` at an ending's gate", async (t) => {
  await t.test(
    "`nemia ls` at an ending step's gate: the step reads `awaiting approval` unfiled, with the approval and the send-back to the work beside it, and the run's line says what is to be decided",
    () => {
      const shownAs = (p: Record<string, TaskPhase>) => (id: string) => p[id] ?? 'unknown';
      const l = listing({
        steps: ENDS,
        run: atEnd(),
        phaseOf: shownAs({ t1: 'succeeded', t2: 'succeeded' }),
        closeoutOf: signedDone,
        askedCloseout: asked,
      });
      assert.deepEqual(l.steps[2], {
        name: 'ship',
        status: 'awaiting approval',
        reason: 'AwaitingApproval',
        phase: 'waiting',
        branch: null,
        note: 'approve it: nemia approve r-1 ship — or send it back: nemia retry r-1 review --message "<objection>"',
      });
      assert.deepEqual([l.waitingOnYou, onYouWords(l)], [['ship'], ['approve ship']]);
      assert.deepEqual(l.toDecide, {
        kind: 'approve',
        step: 'ship',
        says: "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit.",
        filed: false,
      });
      assert.equal(
        toDecideWords(atEnd(), l.toDecide),
        "Ship it: trial merge this run's result branch onto the base branch, run the check, and commit. — nemia approve r-1 ship",
      );
      const ran = atEnd({
        steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } },
        approvals: [approval('ship', 1, 'merge it')],
      });
      const after = listing({
        steps: ENDS,
        run: ran,
        phaseOf: shownAs({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }),
        closeoutOf: signedDone,
        askedCloseout: asked,
      });
      assert.deepEqual(
        [after.steps[2].status, after.waitingOnYou, after.toDecide],
        ['unverified · done', [], undefined],
        'approved and filed, it is a step like any other and waits on nobody',
      );
    },
  );

  await t.test(
    'REFUSED at an ending gate: `nemia rm` holds the run and `nemia cancel` calls it off — an approval would file the step that acts',
    () => {
      assert.match(
        String(forgetRefusal(ENDS, atEnd(), DONE, [], signedDone, asked)),
        /ship waits at its gate for your approval, and it is filed once it is approved: nemia approve r-1 ship/,
      );
      const ran = atEnd({ steps: { ship: { taskId: 't3', workspace: '/repo', branch: 'main' } }, approvals: [approval('ship', 1)] });
      const gatedReview: Workflow[] = [ENDS[0], { ...ENDS[1], gate: true }, ENDS[2]];
      assert.match(
        String(forgetRefusal(gatedReview, run({ implement: 't1', review: 't2', ship: null }), DONE, [], signedDone, asked)),
        /review waits at its gate for your approval, and what waits on it is filed once it is approved/,
        'a gate that holds a step which has run still says what the approval files: what waits on it',
      );
      assert.equal(
        forgetRefusal(ENDS, ran, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), [], signedDone, asked),
        null,
        'an ending approved, run and signed off holds nothing',
      );
      assert.deepEqual(cancelPlan(ENDS, atEnd(), DONE, signedDone, asked), { kind: 'cancel', stop: [] });
    },
  );

  await t.test('a run called off holds no ending gate: nothing files it, so its ending reads as the waiting step it is', () => {
    const off = atEnd({ cancelledAt: '2026-09-17T10:00:00.000Z' });
    assert.equal(stepStatus(SHIP, off, DONE, signedDone, asked, ENDS), 'pending');
    const shownAs = (p: Record<string, TaskPhase>) => (id: string) => p[id] ?? 'unknown';
    const l = listing({
      steps: ENDS,
      run: off,
      phaseOf: shownAs({ t1: 'succeeded', t2: 'succeeded' }),
      closeoutOf: signedDone,
      askedCloseout: asked,
    });
    assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['pending', [], undefined]);
  });
});

test("an ending's gate does not hold while the work goes round again or is being sent back", async (t) => {
  await t.test(
    "REFUSED while the work goes round again: an ending's gate does not hold on a looping step that asked for another round, and nothing is to be decided in the pass that files it",
    () => {
      const LOOPING: OutputSchema = {
        type: 'object',
        properties: { again: { type: 'boolean' } },
        required: ['again'],
        additionalProperties: false,
      };
      const looping: Workflow[] = [
        step('implement'),
        { ...step('review', ['implement']), loop: 'implement', rounds: 3, output: { file: 'review.json', schema: LOOPING } },
        SHIP,
      ];
      const r = run(
        {},
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const said = (again: boolean) => (name: string) =>
        name === 'review' ? { outcome: 'done' as const, summary: 's', artifacts: [], output: { again } } : signedDone();

      const going = assess(
        looping,
        r,
        DONE,
        said(true),
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        AHEAD,
      );
      assert.deepEqual(
        [going.round.map((x) => x.round), going.status, going.toDecide],
        [[2], 'running', undefined],
        'again: true, with rounds left: the round is filed, and the ending is a waiting step, not a merge on offer',
      );
      assert.equal(stepStatus(SHIP, r, DONE, said(true), asked, looping), 'pending');
      assert.match(
        String(approvalRefusal(looping, r, 'ship', undefined, DONE, said(true), asked)),
        /^ship is not at its gate yet: it ends the run in the repository's own checkout, and its gate holds once review has handed on/,
      );
      const l = listing({
        steps: looping,
        run: r,
        phaseOf: (id: string) => (id === 't1' || id === 't2' ? 'succeeded' : 'unknown'),
        closeoutOf: said(true),
        askedCloseout: asked,
      });
      assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['pending', [], undefined]);

      const handed = assess(
        looping,
        r,
        DONE,
        said(false),
        asked,
        () => undefined,
        [],
        [],
        () => false,
        () => undefined,
        AHEAD,
      );
      assert.deepEqual(
        [handed.round, handed.toDecide?.kind],
        [[], 'approve'],
        'again: false: the loop has handed on, and the gate holds as it does after any work',
      );
      assert.equal(stepStatus(SHIP, r, DONE, said(false), asked, looping), 'awaiting approval');

      const atGate = roundAsk(looping, r, 'review', DONE, said(false), asked);
      assert.deepEqual(Object.keys(atGate), ['refusal']);
      const gateRefused = (atGate as { refusal: string }).refusal;
      names(gateRefused, '(`again: false`)', "ship's gate", 'nemia approve r-1 ship', 'nemia retry r-1 review --message "<objection>"');
      assert.ok(
        !gateRefused.includes('What waits on it has been filed'),
        "refused there, and not with what waits on it has been filed: nothing has been, and what the run waits for is a person's word",
      );
      const plain: Workflow[] = [looping[0], looping[1], step('docs', ['review'])];
      const withDocs = run({}, { steps: { ...r.steps, docs: { taskId: 't3', workspace: '/wt', branch: 'wf/r-1/implement' } } });
      const handedOn = roundAsk(plain, withDocs, 'review', DONE, said(false), asked);
      assert.deepEqual(Object.keys(handedOn), ['refusal']);
      namesFor(
        'a loop whose follower is a step like any other says what waits on it HAS been filed',
        (handedOn as { refusal: string }).refusal,
        '(`again: false`)',
        'What waits on it has been filed',
        'nemia ls r-1',
      );
    },
  );

  await t.test(
    'REFUSED while a send-back is being filed: an ending held at its gate reads as waiting once a try of the work is due, so no merge is offered in the moment somebody objected',
    () => {
      const ask: RetryAsk = {
        step: 'review',
        try: 2,
        mode: 'continue',
        message: 'sub subtracts the wrong way round',
        at: '2026-09-17T09:00:00.000Z',
      };
      const a = assess(
        ENDS,
        atEnd(),
        DONE,
        signedDone,
        asked,
        () => undefined,
        [ask],
        [],
        () => false,
        () => undefined,
        AHEAD,
      );
      assert.deepEqual([a.retry.map((r) => `${r.step} try ${r.try}`), a.status, a.toDecide], [['review try 2'], 'running', undefined]);
      assert.deepEqual(unheld(ENDS, atEnd(), a.retry, a.round), new Set(['ship']));
      const l = listing({
        steps: ENDS,
        run: atEnd(),
        phaseOf: (id: string) => (id === 't1' || id === 't2' ? 'succeeded' : 'unknown'),
        closeoutOf: signedDone,
        askedCloseout: asked,
        verdictOf: () => undefined,
        asks: [ask],
      });
      assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['pending', [], undefined]);

      const d = decision(
        ENDS,
        atEnd(),
        DONE,
        () => false,
        signedDone,
        asked,
        () => undefined,
        [ask],
      );
      assert.deepEqual(
        [d.kind, d.kind === 'running' ? d.waiting : []],
        ['running', ['review']],
        'all three read the window the same way: nemia decide names the work as what the run waits on',
      );
      assert.deepEqual(
        gateLines(
          ENDS,
          atEnd(),
          DONE,
          signedDone,
          asked,
          () => undefined,
          () => undefined,
          [ask],
        ),
        {},
        "and says nothing of the ending's gate, whose approval is refused at that same moment",
      );
      assert.match(
        String(approvalRefusal(ENDS, atEnd(), 'ship', undefined, DONE, signedDone, asked, () => undefined, [ask])),
        /^try 2 of review is asked for \(--continue, at 2026-09-17T09:00:00\.000Z\), and ship acts on what it changes/,
        'nemia approve refuses in the window',
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
        ).toDecide?.kind,
        'approve',
        'the ask taken back, the gate holds again: nothing was stored either way, and all three say so again',
      );
      assert.deepEqual(unheld(ENDS, atEnd(), [], []), new Set());
      assert.deepEqual(gateLines(ENDS, atEnd(), DONE, signedDone, asked), {
        ship: 'awaiting approval:  nemia approve r-1 ship [--message "<words>"]  — or send it back:  nemia retry r-1 review --message "<objection>"',
      });
      assert.equal(approvalRefusal(ENDS, atEnd(), 'ship', undefined, DONE, signedDone, asked), null);
    },
  );
});

test("`workspacePlan` and the run's result: an ending works in the repository's own checkout, on the work of the steps before it", async (t) => {
  await t.test(
    "`workspace: main` is the repository's own checkout, and the run's result is the work the ending step acts on, not its branch",
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'land it', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      assert.deepEqual(workspacePlan(dev, ending), { kind: 'base' }, 'said by the step, not by the shape');
      assert.deepEqual(workspacePlan(dev, dev[1]), { kind: 'inherit', from: 'implement' }, 'and nothing else changes');
      assert.deepEqual(
        resultSteps(dev).map((s) => s.name),
        ['review'],
        "the result is what the ending step would merge: review's work, never main, of which every question about a result says yes",
      );
      assert.deepEqual(
        resultSteps([step('implement'), step('review', ['implement'])]).map((s) => s.name),
        ['review'],
        'a folder with no ending step is unchanged',
      );
      const fanIn: Workflow[] = [step('a'), step('b'), { name: 'ship', after: ['a', 'b'], body: 'land it', workspace: 'main' }];
      assert.deepEqual(
        resultSteps(fanIn).map((s) => s.name),
        ['a', 'b'],
        'an ending step that waits on several: each of them',
      );

      const r = run(
        { implement: 't1', review: 't2', ship: 't3' },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: 't3', workspace: '/repo', branch: 'main' },
          },
        },
      );
      assert.deepEqual(
        tipBranches(r, dev, 'succeeded'),
        ['wf/r-1/implement'],
        "the work's branch, not the base branch the ending step is on",
      );
      assert.deepEqual(
        handOffDue(dev, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' })),
        ['review'],
        'the run commits nothing in the checkout: what a person left lying there is theirs',
      );
    },
  );
});

test("`composeBrief` of a step in the repository's own checkout: where the work is, the check it was judged by, where its files go, and the approval that filed it", async (t) => {
  await t.test(
    "an ending step is told where the work is — the branches, not the workspace — since the repository's checkout is not where the run worked",
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const brief = placed(ending, r, dev);
      assert.match(brief, /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./);
      assert.match(brief, /The work of review is not in this directory: it is on wf\/r-1\/implement, cut from `abc123`:/);
      assert.match(brief, /git log --oneline main\.\.wf\/r-1\/implement/);
      assert.match(brief, /git diff main\.\.\.wf\/r-1\/implement/);
      assert.match(brief, /the run commits nothing here for you/);
      assert.doesNotMatch(brief, /This workspace has already been worked in by/, 'the work is not here');
    },
  );

  await t.test(
    'an ending step is told the check the work was judged by, one line for each distinct check, and none when no step has one',
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const checked = [
        { ...step('implement'), check: 'npm test && npm run build' },
        { ...step('review', ['implement']), check: 'npm test && npm run build' },
        ending,
      ];
      assert.deepEqual(workChecks(checked), ['npm test && npm run build'], 'the same check twice is one');
      const brief = composeBrief(ending, r, checked);
      assert.equal(brief.split("This workflow's check, which its work was judged by: `npm test && npm run build`").length, 2, brief);

      const two = [{ ...step('implement'), check: 'npm test' }, { ...step('review', ['implement']), check: 'npm run e2e' }, ending];
      assert.deepEqual(workChecks(two), ['npm test', 'npm run e2e'], 'in the order the steps run');
      const both = composeBrief(ending, r, two);
      assert.match(
        both,
        /This workflow's check, which its work was judged by: `npm test`\n\nThis workflow's check, which its work was judged by: `npm run e2e`/,
      );

      assert.deepEqual(workChecks([step('implement'), step('review', ['implement']), ending]), []);
      assert.doesNotMatch(
        composeBrief(ending, r, [step('implement'), step('review', ['implement']), ending]),
        /This workflow's check/,
        'no check, no line',
      );
      assert.doesNotMatch(
        composeBrief(step('review', ['implement']), r, checked),
        /This workflow's check/,
        'a step that is not an ending is not told it',
      );
    },
  );

  await t.test(
    'a step in the checkout whose run cut no branch — the whole workflow is that step — is told so, and is given no empty fence to read',
    () => {
      const watcher: Workflow = { name: 'supervise', after: [], body: 'Watch the runs.', workspace: 'main', slot: 'none' };
      const r = run({ supervise: 't1' }, { steps: { supervise: { taskId: 't1', workspace: '/repo', branch: 'main' } } });
      const brief = composeBrief(watcher, r, [watcher], () => undefined, FILES);
      assert.match(brief, /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./);
      assert.match(brief, /This run cut no branch of its own — it is this step, and nothing else — so there is no work of its to read/);
      assert.doesNotMatch(brief, /result branch/);
      assert.doesNotMatch(brief, /```\n```/, 'no fence with nothing in it');
      assert.match(brief, /the run commits nothing here for you/);
      assert.doesNotMatch(brief, /The checkout is at/, 'a sha frozen at `nemia start` is no claim about where the checkout stands now');
    },
  );

  await t.test(
    'a late try of a step in the checkout is told the base branch by name, never the sha the run froze: a step that does not end is composed again on every answer',
    () => {
      const watcher: Workflow = { name: 'supervise', after: [], body: 'Watch the runs.', workspace: 'main', slot: 'none' };
      const r = run(
        { supervise: 't1' },
        {
          steps: {
            supervise: {
              taskId: 't1',
              workspace: '/repo',
              branch: 'main',
              tries: [
                { taskId: 't0', cause: 'continue' },
                { taskId: 't0b', cause: 'continue' },
                { taskId: 't0c', cause: 'continue' },
              ],
            },
          },
        },
      );
      const briefing: RetryBriefing = { try: 4, by: 'ask', mode: 'continue', resumed: false, status: 'blocked', message: 'Merge it.' };
      const brief = composeBrief(watcher, r, [watcher], () => undefined, FILES, undefined, briefing);
      assert.match(
        brief,
        /You are in \/repo, the repository's own checkout, on main — not in a worktree of this run's\./,
        'the base branch, by name, in the whole brief a new session on try 4 is composed',
      );
      assert.doesNotMatch(
        brief,
        /abc123/,
        "the run's frozen base is several merges behind by the fourth answer, and the brief claims nothing about it",
      );
      assert.doesNotMatch(brief, /The checkout is at/);
    },
  );

  await t.test(
    'a step in the checkout is told the one place its files go: the run hands nothing off there, so nothing it leaves is collected or committed',
    () => {
      const ending: Workflow = { name: 'ship', after: ['review'], body: 'Ship it.', workspace: 'main', gate: true };
      const dev = [step('implement'), step('review', ['implement']), ending];
      const r = run(
        { implement: 't1', review: 't2', ship: null },
        {
          steps: {
            implement: { taskId: 't1', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            review: { taskId: 't2', workspace: '/wt/implement', branch: 'wf/r-1/implement' },
            ship: { taskId: null },
          },
        },
      );
      const brief = composeBrief(ending, r, dev, () => undefined, FILES);
      assert.match(brief, /\n## Files for the person who decides\n/);
      assert.doesNotMatch(brief, /## Files for the steps after you/, 'nothing follows it, and this is not a workspace it hands off');
      assert.doesNotMatch(
        brief,
        /Or leave it in this workspace/,
        "the second way is false here: it would be left in a person's checkout for ever",
      );
      assert.doesNotMatch(brief, /WF_ARTIFACTS/, 'and `workspace: main` refuses a check, so there is none to be given it');
      assert.ok(brief.includes(FILES), 'the directory the run made, by absolute path');
      assert.match(artifactsContract(FILES, true), /a file you leave here is\nnot collected and not committed/);
      assert.match(artifactsContract(FILES, true), /`nemia decide` reads a path named from\nthe workspace root as `not collected`/);
      assert.match(
        composeBrief(dev[1], r, dev, () => undefined, FILES),
        /\n## Files for the steps after you\n/,
        'every other step is told both ways',
      );
      assert.match(artifactsContract(FILES), /Or leave it in this workspace/);
    },
  );

  await t.test(
    "an ending step's brief carries one way of handing a file over, not two: the run collects nothing from the repository's own checkout, and commits nothing there",
    () => {
      const ending = composeBrief(SHIP, atEnd(), ENDS, undefined, FILES);
      assert.ok(ending.includes('\n## Files for the person who decides\n'), ending);
      assert.ok(ending.includes(`reaches them one way: put it in \`${FILES}\`, and name it in \`artifacts\` by\nabsolute path.`), ending);
      assert.doesNotMatch(ending, /Or leave it in this workspace/, 'the run hands nothing off in that checkout (`handOffDue`)');
      assert.match(
        ending,
        /a file you leave here is\nnot collected and not committed — it stays in a person's checkout, and `nemia decide` reads a path named from\nthe workspace root as `not collected`\./,
        "a file left in the checkout is said to stay in a person's checkout",
      );
      assert.doesNotMatch(ending, /WF_ARTIFACTS/, "and it runs no check of the run's, so there is none to name");
      const work = composeBrief(ENDS[1], atEnd(), ENDS, undefined, FILES);
      assert.ok(work.includes('\n## Files for the steps after you\n'), work);
      assert.ok(
        work.includes('- Or leave it in this workspace, and name it in `artifacts` by its path from the workspace root'),
        `every other step is told both ways: its workspace is the run's, and what it leaves there is collected and committed:\n${work}`,
      );
      assert.doesNotMatch(work, /## Files for the person who decides/);
    },
  );

  await t.test(
    'an ending step is handed its own approval and the words given with it — `## Approved`, since that approval is what files it — and `gateLines` says its gate',
    () => {
      const r = atEnd({ approvals: [approval('ship', 1, 'Merge it, and do not touch the changelog.')] });
      const brief = composeBrief(SHIP, r, ENDS);
      assert.match(
        brief,
        /\n## Approved\n\nA person approved this step before it was filed: nothing of it has run, and their word is what files it\./,
      );
      assert.match(brief, /ship, try 1, approved at 2026-09-16T23:10:00\.000Z:/);
      assert.match(brief, /Merge it, and do not touch the changelog\./);
      assert.doesNotMatch(composeBrief(SHIP, atEnd(), ENDS), /## Approved/, 'nothing before a person says it');
      assert.deepEqual(gateLines(ENDS, atEnd(), DONE, signedDone, asked), {
        ship: 'awaiting approval:  nemia approve r-1 ship [--message "<words>"]  — or send it back:  nemia retry r-1 review --message "<objection>"',
      });
      assert.deepEqual(gateLines(ENDS, r, DONE, signedDone, asked), {
        ship: 'approved 23:10Z — "Merge it, and do not touch the changelog."',
      });
    },
  );
});

test("decision: landed is asked of git and never stored, and a finished run is a person's to decide", async (t) => {
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

  await t.test('landed is asked of git, not stored on the run', () => {
    const d = decision(STEPS, finished(), DONE, (b) => b === 'wf/r-1/review');
    assert.equal(d.kind, 'landed');
  });

  await t.test('a fan-out is not landed because ONE of its branches landed', () => {
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
    assert.equal(decision(fan, r, all, () => true).kind, 'landed');
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
      'with --no-worktree every step works on main, and git merge-base --is-ancestor main main is true: asked, git would call a failed run landed',
    );
    assert.equal(failed.kind === 'awaiting' && failed.outcome, 'failed', 'classified as for any run');
    assert.equal(failed.kind === 'awaiting' && failed.direct, true);

    const done = decision(STEPS, direct, DONE, everythingShipped);
    assert.equal(done.kind, 'awaiting', 'nothing to merge is not the same as merged');

    const isolated = decision(STEPS, finished(), DONE, everythingShipped);
    assert.equal(isolated.kind, 'landed', 'a worktree run is still asked of git');
  });

  await t.test('a run that never filed anything has no branch to land, and is not "landed"', () => {
    const d = decision(STEPS, run({ implement: null, review: null }), phases({}), () => true);
    assert.equal(d.kind, 'running');
  });

  await t.test(
    'REFUSED: a result branch with nothing past the base is landed only when every step succeeded — failed, blocked, unsigned or refused by its check, the run is decided; work past the base on the base branch is landed whatever the steps said',
    () => {
      const unchanged = () => 'unchanged' as const;
      const says = (outcome: Closeout['outcome']) => (): Closeout => ({ outcome, summary: 's', artifacts: [] });
      const cases: Array<[string, Decision, string, string[]]> = [
        ['failed', decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'failed' }), unchanged), 'failed', ['review']],
        ['stopped', decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'stopped' }), unchanged), 'failed', ['review']],
        ['blocked', decision(STEPS, finished(), DONE, unchanged, says('blocked')), 'waiting', []],
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
        { kind: 'landed', branches: ['wf/r-1/review'] },
        'every step succeeded, with nothing to commit: landed',
      );
      assert.deepEqual(
        decision(STEPS, finished(), DONE, unchanged, says('done'), () => true),
        { kind: 'landed', branches: ['wf/r-1/review'] },
      );
      assert.deepEqual(
        decision(STEPS, finished(), phases({ t1: 'succeeded', t2: 'failed' }), () => true),
        { kind: 'landed', branches: ['wf/r-1/review'] },
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
      const failing = decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }), half);
      assert.deepEqual(
        failing.kind === 'awaiting' && [failing.outcome, failing.failed],
        ['failed', ['tests']],
        'a fan-out lands on its work only when every branch has some on the base; one that never moved leaves a failed run decided',
      );
      assert.equal(decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), half).kind, 'landed');
      assert.equal(decision(fan, r, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'failed' }), () => true).kind, 'landed');

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
    "a run at its ending step's gate is not landed while its result is off the base, and nothing that waits on it starts — but one whose result a person merged by hand has, as git says, and any other gate holds whatever git says",
    () => {
      const merged = () => true as const;
      const ahead = () => false as const;
      const d = decision(ENDS, atEnd(), DONE, ahead, signedDone, asked);
      assert.equal(d.kind, 'awaiting');
      if (d.kind !== 'awaiting') return;
      assert.deepEqual([d.outcome, d.awaitingApproval, d.branches, d.direct], ['waiting', ['ship'], ['wf/r-1/implement'], false]);
      assert.equal(
        runReady(run({}, { after: ['r-1'] }), () => false),
        false,
        'a run waiting on it is not ready',
      );

      const byHand = decision(ENDS, atEnd(), DONE, merged, signedDone, asked);
      assert.deepEqual(
        [byHand.kind, byHand.kind === 'landed' ? byHand.branches : []],
        ['landed', ['wf/r-1/implement']],
        'merged by hand before the ending ran: the gate held the merge and nothing else, and git has it: landed, so a run --after it starts',
      );
      assert.equal(
        decision(ENDS, atEnd(), DONE, () => 'unchanged' as const, signedDone, asked).kind,
        'landed',
        "the work committed nothing past the run's base: on the base as the no-ending kind reads it, landed once every step finished",
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
      const landed = decision(ENDS, ran, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'succeeded' }), merged, signedDone, asked);
      assert.deepEqual(
        [landed.kind, landed.kind === 'landed' ? landed.branches : []],
        ['landed', ['wf/r-1/implement']],
        'approved, filed and done, it lands as any run does: on the branch the ending step merged, never on main',
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
        'wf/r-1/implement is on main — nothing is left for ship to merge: the run has landed as git reads it, and nothing waits on you; close the record if you want it closed: nemia cancel r-1',
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
          'The run has landed as git reads it — nemia decide r-1 says so, and a run started --after it goes on without ship. Nothing waits on you; if you want the record closed: nemia cancel r-1.',
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
