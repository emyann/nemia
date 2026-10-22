/**
 * A send-back from a gate that is not its ending, as the pure functions read it: a step at its gate may be tried with words
 * (`retryable`, `retryRefusal`, `retryLines`), what its next try is told (`triedFrom`, `retrySection`), a wordless ask that no tick
 * honours at a gate (`retriesDue`, `assess`, `listing`), and a round of a loop at its gate (`roundAsk`). The rest of a gate is
 * `assess-gates.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assess,
  decision,
  listing,
  retriesDue,
  retryable,
  retryLines,
  retryRefusal,
  retrySection,
  roundAsk,
  stepStatus,
  triedFrom,
  type RepositoryRun,
  type Run,
} from '../src/run.ts';
import type { RetryAsk, RetryHow } from '../src/retry/retry-ask.ts';
import type { OutputSchema, Workflow } from '../src/workflow.ts';
import { names, phases, run, step } from './assessed.ts';

/** `plan → implement → review`, as dev-planned is. */
const PLANNED: Workflow[] = [step('plan'), step('implement', ['plan']), step('review', ['implement'])];
/** Plan signed off done, implement and review not filed; gated at plan by `--gate plan` unless told otherwise. */
const atPlan = (extra: Partial<RepositoryRun> = {}) => run({ plan: 't1', implement: null, review: null }, { gates: ['plan'], ...extra });
const PLAN_DONE = phases({ t1: 'succeeded' });
const approval = (name: string, n: number) => ({ step: name, try: n, at: '2026-09-16T23:10:00.000Z' });
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
/** Every task here was filed asking for a closeout — which is what the runner does. */
const asked = () => true;
const refusal = (r: Run, how: RetryHow, p = PLAN_DONE) => retryRefusal(PLANNED, r, 'plan', how, p, signedDone, asked);
const OBJECTION = 'nemia retry r-1 plan --message "<objection>"';

test('retryable and retryRefusal: sending back from a gate is `nemia retry --message`', async (t) => {
  await t.test('a step at its gate may be tried, and a try of it sends back', () => {
    const at = retryable(PLANNED[0], atPlan(), PLAN_DONE, signedDone, asked, PLANNED);
    assert.deepEqual([at.status, at.modes, at.sendsBack], ['awaiting approval', ['nudge', 'fresh'], true]);
  });
  await t.test('with words, nudged or fresh, it may be sent back', () => {
    assert.equal(refusal(atPlan(), { mode: 'nudge', message: 'store the flag before you parse it' }), null);
    assert.equal(refusal(atPlan(), { mode: 'fresh', message: 'start over from the second reading' }), null);
  });
  await t.test('REFUSED without words, naming the send-back and the approval', () => {
    names(refusal(atPlan(), { mode: 'nudge' }), 'plan is awaiting approval', `${OBJECTION} —`, 'nemia approve r-1 plan');
    names(refusal(atPlan(), { mode: 'fresh' }), `${OBJECTION} --fresh`, 'nemia approve r-1 plan');
  });
  await t.test('REFUSED with --recheck', () => {
    names(refusal(atPlan(), { mode: 'recheck' }), '--recheck', 'plan is awaiting approval', `${OBJECTION}.`);
  });
  const approved = atPlan({ approvals: [approval('plan', 1)] });
  await t.test('approved, nothing after it filed: it may still be sent back, with words', () => {
    assert.equal(refusal(approved, { mode: 'nudge', message: 'not yet: store it first' }), null);
  });
  await t.test('REFUSED approved, without words', () => {
    names(
      refusal(approved, { mode: 'nudge' }),
      'plan is approved (try 1, at 2026-09-16T23:10:00.000Z)',
      'nothing after it is filed yet',
      OBJECTION,
    );
  });
  await t.test('REFUSED once what follows is filed: it has handed on', () => {
    const handedOn = run({ plan: 't1', implement: 't2', review: null }, { gates: ['plan'], approvals: [approval('plan', 1)] });
    names(
      refusal(handedOn, { mode: 'nudge', message: 'too late' }, phases({ t1: 'succeeded', t2: 'running' })),
      'plan signed off done',
      'has been filed',
      'nothing to try again',
    );
  });
  const terminal: Workflow[] = [{ ...step('implement'), check: 'npm test' }];
  const last = run(
    {},
    { gates: ['implement'], steps: { implement: { taskId: 't1', check: { taskId: 'c1' } } }, approvals: [approval('implement', 1)] },
  );
  const passed = phases({ t1: 'succeeded', c1: 'succeeded' });
  const more = { mode: 'nudge', message: 'one more thing' } as const;
  await t.test('REFUSED a step nothing waits on, once approved: it has handed on', () => {
    assert.equal(retryable(terminal[0], last, passed, signedDone, asked, terminal).sendsBack, undefined);
    names(retryRefusal(terminal, last, 'implement', more, passed, signedDone, asked), 'implement is verified', 'nothing to try again');
  });
  await t.test('a step nothing waits on, not yet approved, may be sent back', () => {
    assert.equal(retryRefusal(terminal, { ...last, approvals: undefined }, 'implement', more, passed, signedDone, asked), null);
  });
  await t.test('nemia decide offers a gate its own lines, never a try with nothing to change (retryLines)', () => {
    const d = decision(PLANNED, atPlan(), PLAN_DONE, () => false, signedDone, asked);
    assert.deepEqual(retryLines(PLANNED, atPlan(), d, PLAN_DONE, signedDone, asked), []);
  });
});

test("triedFrom and retrySection: a send-back's brief says why the step is back", async (t) => {
  const from = (r: Run, p = PLAN_DONE, closeoutOf: () => ReturnType<typeof signedDone> | undefined = signedDone) =>
    triedFrom(PLANNED[0], r, p, closeoutOf, asked, PLANNED, () => undefined);
  await t.test('a gated step that signed off is tried from awaiting approval', () => assert.equal(from(atPlan()), 'awaiting approval'));
  await t.test('approved, and sent back all the same', () => {
    assert.equal(from(atPlan({ approvals: [approval('plan', 1)] })), 'awaiting approval');
  });
  await t.test('an ungated step from its own ending: unverified', () => assert.equal(from(atPlan({ gates: undefined })), 'unverified'));
  await t.test('a gated step whose session failed: failed', () => {
    assert.equal(
      from(atPlan(), phases({ t1: 'failed' }), () => undefined),
      'failed',
    );
  });
  await t.test('the brief: its handoff waited at its gate, a person sent it back, and what they want changed', () => {
    const brief = retrySection(PLANNED[0], {
      try: 2,
      by: 'ask',
      mode: 'nudge',
      resumed: true,
      status: 'awaiting approval',
      message: 'store the flag before you parse it',
    });
    assert.match(
      brief,
      /^\n## Try 2\n\nThe last try signed off, and its handoff waited at this step's gate for a person, who sent it back rather than let it go on: what they want changed is below\. When you sign off again, it waits there again\.\nA person asked for this try: `nemia retry --nudge --message`, with what they said below\./,
    );
    assert.ok(brief.includes('## Your answer\n\n```text\nstore the flag before you parse it\n```'), brief);
  });
});

test('REFUSED at a gate, pass after pass: a wordless ask for the next try is not due', async (t) => {
  const wordless: RetryAsk = { step: 'plan', try: 2, mode: 'nudge', at: '2026-09-16T23:00:00.000Z' };
  const withWords: RetryAsk = { ...wordless, message: 'store it first' };
  await t.test('while the session runs, blocked by its harness, it is due: the tick stops the session first', () => {
    const due = retriesDue(
      PLANNED,
      atPlan(),
      phases({ t1: 'running' }),
      () => undefined,
      asked,
      () => undefined,
      [wordless],
      () => true,
    );
    assert.deepEqual(
      due.map((r) => [r.step, r.stopFirst]),
      [['plan', true]],
    );
  });
  await t.test('signed off at its gate, it is not due, pass after pass', () => {
    for (let pass = 1; pass <= 3; pass++) {
      const a = assess(PLANNED, atPlan(), PLAN_DONE, signedDone, asked, () => undefined, [wordless]);
      const status = stepStatus(PLANNED[0], atPlan(), PLAN_DONE, signedDone, asked);
      assert.deepEqual([a.retry, a.ready, status], [[], [], 'awaiting approval'], `pass ${pass}`);
    }
  });
  await t.test('approved, and not handed on: not due either', () => {
    const r = atPlan({ approvals: [approval('plan', 1)] });
    assert.deepEqual(
      retriesDue(PLANNED, r, PLAN_DONE, signedDone, asked, () => undefined, [wordless]),
      [],
    );
  });
  await t.test('with words, it is a send-back, and due', () => {
    const due = retriesDue(PLANNED, atPlan(), PLAN_DONE, signedDone, asked, () => undefined, [withWords]);
    assert.deepEqual(
      due.map((r) => [r.step, r.message]),
      [['plan', 'store it first']],
    );
  });
  await t.test('nemia ls: awaiting approval and waiting on you, no try said to be due', () => {
    const l = listing({
      steps: PLANNED,
      run: atPlan(),
      phaseOf: (id) => (id === 't1' ? 'succeeded' : 'unknown'),
      closeoutOf: signedDone,
      askedCloseout: asked,
      verdictOf: () => undefined,
      asks: [wordless],
    });
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['awaiting approval', ['plan']]);
    assert.ok(l.steps[0].note?.startsWith('approve it: nemia approve r-1 plan'), l.steps[0].note);
  });
  await t.test('REFUSED a send-back with words: nemia retry names the wordless ask and says to delete it', () => {
    names(
      retryRefusal(PLANNED, atPlan(), 'plan', withWords, PLAN_DONE, signedDone, asked, () => undefined, [wordless]),
      'try 2 of plan is asked for',
      '(--nudge, at 2026-09-16T23:00:00.000Z)',
      'with no words',
      'plan is awaiting approval',
      'retry-plan-2',
      '.asks',
      OBJECTION,
    );
  });
});

test("roundAsk at a gate: a round of a loop at its gate is a person's word, not `nemia round`'s", async (t) => {
  const LOOPING: OutputSchema = {
    type: 'object',
    properties: { again: { type: 'boolean' } },
    required: ['again'],
    additionalProperties: false,
  };
  const looped: Workflow[] = [
    step('implement'),
    { ...step('review', ['implement']), loop: 'implement', rounds: 1, output: { file: 'review.json', schema: LOOPING } },
    step('ship', ['review']),
  ];
  const r = run({ implement: 't1', review: 't2', ship: null }, { gates: ['review'] });
  const handed = (name: string) =>
    name === 'review' ? { outcome: 'done' as const, summary: 's', artifacts: [], output: { again: false } } : signedDone();
  const both = phases({ t1: 'succeeded', t2: 'succeeded' });
  const answer = roundAsk(looped, r, 'review', both, handed, asked);
  await t.test('REFUSED: the round has ended, and waits at its gate for an approval or a send-back', () => {
    assert.deepEqual(Object.keys(answer), ['refusal']);
    names(
      (answer as { refusal: string }).refusal,
      '(`again: false`)',
      'waits at its gate',
      'nemia approve r-1 review',
      'nemia retry r-1 review --message "<objection>"',
    );
  });
  await t.test('REFUSED with --budget, the same', () => {
    assert.deepEqual(
      roundAsk(looped, r, 'review', both, handed, asked, [], () => undefined, 5),
      answer,
    );
  });
});
