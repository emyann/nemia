/**
 * The gate of an ending — a last step that works in the repository's own checkout (`workspace: main`) and is filed only once a person
 * approves it — as tables: what `assess`, `stepStatus` and `to decide` say at it, the approval and the send-back it offers and refuses
 * (`approvalRefusal`, `retryable`, `retryRefusal`, `roundAsk`), and what `nemia ls`, `nemia rm` and `nemia cancel` read of it (`listing`,
 * `forgetRefusal`, `cancelPlan`, `gateLines`). Whether a run at it has shipped is `assess-shipped.test.ts`, its brief
 * `assess-endings-brief.test.ts`, and a run walked through it on disk `ship.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalRefusal,
  assess,
  cancelPlan,
  decision,
  forgetRefusal,
  gateLines,
  listing,
  onYouWords,
  retryable,
  retryRefusal,
  roundAsk,
  stepStatus,
  toDecideWords,
  unheld,
  type RepositoryRun,
  type TaskPhase,
} from '../src/run.ts';
import type { RetryAsk } from '../src/retry/retry-ask.ts';
import { parseAgent, parseWorkflow, type OutputSchema, type Workflow } from '../src/workflow.ts';
import { names, namesFor, phases, run, step } from './assessed.ts';

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
      assert.equal(stepStatus(SHIP, running, p, signedDone, asked, ENDS), 'waiting');
      assert.deepEqual(assess(ENDS, running, p, signedDone, asked).toDecide, undefined, 'nothing to decide while it runs');
      assert.equal(
        approvalRefusal(ENDS, running, 'ship', undefined, p, signedDone, asked),
        "ship is not at its gate yet: it ends the run in the repository's own checkout, and its gate holds once review has handed on — " +
          'your approval is then what files it, and nothing of it runs before that. See where the run stands: nemia ls r-1.',
      );
      const broke = phases({ t1: 'succeeded', t2: 'failed' });
      assert.equal(
        stepStatus(SHIP, atEnd(), broke, signedDone, asked, ENDS),
        'waiting',
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
    const ask: RetryAsk = { step: 'review', try: 2, mode: 'nudge', message: 'the flag is not stored', at: '2026-09-17T09:00:00.000Z' };
    assert.equal(
      approvalRefusal(ENDS, atEnd(), 'ship', undefined, DONE, signedDone, asked, () => undefined, [ask]),
      'try 2 of review is asked for (--nudge, at 2026-09-17T09:00:00.000Z), and ship acts on what it changes: approving now would take the result that ask objects to. ' +
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
      assert.deepEqual([at.status, at.modes, at.sendsBack], ['unverified', ['nudge', 'fresh'], true]);
      assert.equal(
        retryRefusal(ENDS, atEnd(), 'review', { mode: 'nudge' }, DONE, signedDone, asked),
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
        retryRefusal(ENDS, atEnd(), 'review', { mode: 'nudge', message: 'the flag is not stored' }, DONE, signedDone, asked),
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
        retryRefusal(ENDS, atEnd(), 'ship', { mode: 'nudge' }, DONE, signedDone, asked),
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
        retryRefusal(ENDS, ran, 'ship', { mode: 'nudge' }, phases({ t1: 'succeeded', t2: 'succeeded', t3: 'running' }), signedDone, asked),
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
    assert.equal(stepStatus(SHIP, off, DONE, signedDone, asked, ENDS), 'waiting');
    const shownAs = (p: Record<string, TaskPhase>) => (id: string) => p[id] ?? 'unknown';
    const l = listing({
      steps: ENDS,
      run: off,
      phaseOf: shownAs({ t1: 'succeeded', t2: 'succeeded' }),
      closeoutOf: signedDone,
      askedCloseout: asked,
    });
    assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['waiting', [], undefined]);
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
      assert.equal(stepStatus(SHIP, r, DONE, said(true), asked, looping), 'waiting');
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
      assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['waiting', [], undefined]);

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
        mode: 'nudge',
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
      assert.deepEqual([l.steps[2].status, l.waitingOnYou, l.toDecide], ['waiting', [], undefined]);

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
        /^try 2 of review is asked for \(--nudge, at 2026-09-17T09:00:00\.000Z\), and ship acts on what it changes/,
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
