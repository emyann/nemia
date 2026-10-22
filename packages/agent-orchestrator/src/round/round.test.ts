/**
 * The tables of a loop's rounds and a person's word on them (`round.ts`): what `nemia round` and `nemia accept` take and refuse, which
 * round is due, what filing a round writes, and which asks are spent. Pure: no disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  acceptAsk,
  budgetOf,
  checkTaskId,
  roundAsk,
  roundBudgetRefusal,
  roundFiled,
  roundOf,
  roundsDue,
  spentRoundAsks,
  stepTaskId,
  type RepositoryRun,
  type RoundAsk,
  type Run,
  type SpendOf,
  type TaskPhase,
} from '../run.ts';
import { closeoutHashOf } from '../closeout/index.ts';
import type { Closeout } from '../closeout/closeout.ts';
import type { EarlierTry } from '../retry/retry-ask.ts';
import type { OutputSchema, Workflow } from '../workflow.ts';
import { names, namesFor, phases, run, step, STEPS } from '../../test/assessed.ts';

const asked = () => true;
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const CANCELLED = { cancelledAt: '2026-01-02T00:00:00Z' };
/** `findings`, strict, as the tests' team's review declares it. */
const FINDINGS: OutputSchema = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { file: { type: 'string' }, line: { type: ['integer', 'null'] }, what: { type: 'string' } },
        required: ['file', 'line', 'what'],
        additionalProperties: false,
      },
    },
  },
  required: ['findings'],
  additionalProperties: false,
};
/** `findings` and `again`, as a looping review declares them. */
const LOOPING: OutputSchema = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, again: { type: 'boolean' } },
  required: ['findings', 'again'],
};
/** implement, checked → review, looping back to it with `rounds: 3` — and ship, after the loop. */
const LOOP: Workflow[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
const [IMPLEMENT, LOOPING_REVIEW] = [LOOP[0], LOOP[1]];
/** implement checked with a $3 budget, in the loop. */
const BUDGETED_LOOP: Workflow[] = [{ ...IMPLEMENT, budget: 3 }, LOOPING_REVIEW, LOOP[2]];
const FOUND = [{ file: 'src/run.ts', line: 183, what: 'a producer with no findings reads as done' }];
const reviewed = (again: unknown): Closeout => ({
  outcome: 'done',
  summary: 'REVIEWER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { findings: FOUND, again },
});
const answered: Closeout = {
  outcome: 'done',
  summary: 'IMPLEMENTER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { replies: [{ finding: 'src/run.ts:183', answer: "won't fix", why: 'nothing worth changing' }] },
};
/** The loop on round `n`: implement's `i<n>` checked by `c<n>`, review's `r<n>`, each with its earlier rounds behind it. */
const inRound = (n: number, extra: Partial<RepositoryRun> = {}): Run => {
  const earlier = (prefix: string, checked: boolean): EarlierTry[] =>
    Array.from({ length: n - 1 }, (_, k) => ({
      taskId: `${prefix}${k + 1}`,
      ...(checked ? { check: { taskId: `c${k + 1}` } } : {}),
      then: 'round' as const,
    }));
  const tries = (t: EarlierTry[]) => (t.length ? { tries: t } : {});
  const steps = {
    implement: { taskId: `i${n}`, check: { taskId: `c${n}` }, ...tries(earlier('i', true)) },
    review: { taskId: `r${n}`, ...tries(earlier('r', false)) },
    ship: { taskId: null },
  };
  return run({}, { steps, ...extra });
};
/** Round `n` with review not filed yet. */
const reviewDue = (n: number): Run => {
  const r = inRound(n);
  return { ...r, steps: { ...r.steps, review: { taskId: null, tries: r.steps.review.tries } } };
};
const ALL_SUCCEEDED = (): TaskPhase => 'succeeded';
const saidIn =
  (n: number, again: unknown) =>
  (name: string): Closeout | undefined =>
    name === 'review' ? reviewed(again) : name === 'implement' ? (n > 1 ? answered : signedDone()) : undefined;
const roundAskFor = (round: number): RoundAsk => ({ step: 'review', round, at: '2026-09-13T12:00:00.000Z' });
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';
const acceptedTry = (t: number): Partial<RepositoryRun> => ({
  acceptances: [{ step: 'review', try: t, at: '2026-09-20T14:05:00.000Z', message: ENOUGH }],
});
const spends =
  (usd: Record<string, number>): SpendOf =>
  (id) =>
    id in usd ? { usd: usd[id], measured: 1, unmeasured: 0, budgetEnded: false } : undefined;
/** The words of an answer that refused, failing where it was taken. */
const refusalOf = (a: { refusal: string } | object): string =>
  'refusal' in a && typeof a.refusal === 'string' ? a.refusal : assert.fail(`taken, and should not have been: ${JSON.stringify(a)}`);

test('acceptAsk: what `nemia accept` takes', async (t) => {
  const said = saidIn(3, true);
  const r = inRound(3);
  const accept = (r: Run, name: string | undefined, message: string | undefined, more: Partial<{ s: typeof said; w: Workflow[] }> = {}) =>
    acceptAsk(more.w ?? LOOP, r, name, message, ALL_SUCCEEDED, more.s ?? said, asked);
  await t.test('a loop out of rounds with `again` still true, keyed by its try; the only loop needs no naming', () => {
    assert.deepEqual(accept(r, 'review', ENOUGH), { step: 'review', try: 3 });
    assert.deepEqual(accept(r, undefined, ENOUGH), { step: 'review', try: 3 });
  });
  await t.test('REFUSED: no words, or empty ones, asked for before anything about the run', () => {
    names(refusalOf(accept(r, 'review', undefined)), 'nemia accept r-1 review --message "<why>"');
    names(refusalOf(accept(r, undefined, undefined)), 'nemia accept r-1 [<step>] --message "<why>"');
    names(refusalOf(accept(r, 'review', '   ')), '--message is empty', 'nemia accept r-1 review --message "<why>"');
  });
  await t.test('REFUSED: a cancelled run, which files nothing to honour it', () => {
    names(refusalOf(accept(inRound(3, CANCELLED), 'review', ENOUGH)), 'r-1 was cancelled at 2026-01-02T00:00:00Z', 'nemia start');
  });
  await t.test('REFUSED: an unknown step, a step with no loop, a run with none, and two loops unnamed', () => {
    names(refusalOf(accept(r, 'reviewer', ENOUGH)), 'no step "reviewer"', 'implement, review, ship');
    names(refusalOf(accept(r, 'ship', ENOUGH)), 'ship has no `loop:`', 'loops close at review', 'nemia approve r-1 ship');
    const plain = acceptAsk(STEPS, run({ implement: 't1', review: 't2' }), undefined, ENOUGH, ALL_SUCCEEDED, said, asked);
    names(refusalOf(plain), 'no step of r-1 has `loop:`', 'nemia approve r-1 <step>');
    const TWO = [...LOOP, { ...step('proofread', ['ship']), loop: 'ship', rounds: 2 }];
    names(
      refusalOf(accept(r, undefined, ENOUGH, { w: TWO })),
      'r-1 has 2 loops, closing at review, proofread',
      'nemia accept r-1 <step> --message "<why>"',
    );
  });
  await t.test('REFUSED: a try already accepted, and a round already asked for', () => {
    const again = refusalOf(accept(inRound(3, acceptedTry(3)), 'review', ENOUGH));
    names(again, 'try 3 of review is already accepted', '2026-09-20T14:05:00.000Z');
    const rounded = acceptAsk(LOOP, r, 'review', ENOUGH, ALL_SUCCEEDED, said, asked, [roundAskFor(4)]);
    names(refusalOf(rounded), "round 4 of review's loop is already asked for", 'round-review-4', '.asks');
  });
  await t.test("REFUSED: below the cap, or held on a budget, ending early is not a person's", () => {
    namesFor(
      'below the cap',
      refusalOf(accept(inRound(1), 'review', ENOUGH, { s: saidIn(1, true) })),
      '`rounds: 3` has 2 left',
      'files round 2 itself',
      'nemia decide r-1',
    );
    const held: SpendOf = (id) => (id === 'i1' || id === 'i2' ? { usd: 2, measured: 1, unmeasured: 0, budgetEnded: false } : undefined);
    namesFor(
      'held on a budget',
      refusalOf(acceptAsk(BUDGETED_LOOP, inRound(2), 'review', ENOUGH, ALL_SUCCEEDED, saidIn(2, true), asked, [], held)),
      'review asked for round 3',
      'waits on a budget',
      '`rounds: 3` has one round left',
      'nemia round r-1 review --budget <amount>',
    );
  });
  await t.test('REFUSED: a loop that ended `again: false`, and a round still running', () => {
    names(
      refusalOf(accept(inRound(2), 'review', ENOUGH, { s: saidIn(2, false) })),
      'review signed off',
      '(`again: false`)',
      'its loop is over',
    );
    const running = refusalOf(accept(reviewDue(3), 'review', ENOUGH));
    names(running, "round 3 of review's loop is still running", 'nemia ls r-1', 'nemia cancel r-1');
  });
});

test('roundAsk: what `nemia round` takes and refuses', async (t) => {
  const ask = (
    r: Run,
    said: (name: string) => Closeout | undefined,
    p = ALL_SUCCEEDED as (id: string) => TaskPhase,
    name?: string,
    asks: RoundAsk[] = [],
  ) => roundAsk(LOOP, r, name, p, said, asked, asks);
  await t.test('a loop out of rounds, its only loop named or not', () => {
    assert.deepEqual(ask(inRound(3), saidIn(3, true)), { step: 'review', round: 4 });
    assert.deepEqual(ask(inRound(3), saidIn(3, true), ALL_SUCCEEDED, 'review'), { step: 'review', round: 4 });
  });
  await t.test('REFUSED: a cancelled run, and a round still running', () => {
    names(refusalOf(ask(inRound(3, CANCELLED), saidIn(3, true))), 'r-1 was cancelled at', 'a round would never be honoured');
    const running = refusalOf(ask(reviewDue(2), saidIn(2, true), phases({ i2: 'running' })));
    names(running, "round 2 of review's loop is still running", 'nemia ls r-1', 'nemia cancel r-1');
  });
  await t.test('REFUSED: a round the run files itself, and a loop that is over', () => {
    const itself = refusalOf(ask(inRound(1), saidIn(1, true)));
    names(itself, 'the run goes round again itself', '`rounds: 3` has 2 left', 'round 2', 'nemia ls r-1');
    names(refusalOf(ask(inRound(2), saidIn(2, false))), 'review signed off', '(`again: false`)');
  });
  await t.test("REFUSED: a loop at its gate, a person's word and not a round", () => {
    const gated = refusalOf(ask(inRound(2, { gates: ['review'] }), saidIn(2, false)));
    names(gated, '(`again: false`)', 'waits at its gate', 'nemia approve r-1 review', 'nemia retry r-1 review --message "<objection>"');
  });
  await t.test('REFUSED: a target blocked in its round, and a round already asked for', () => {
    const blocked = (name: string) =>
      name === 'implement' ? { ...answered, outcome: 'blocked' as const, needs: 'which flag' } : undefined;
    names(refusalOf(ask(reviewDue(2), blocked)), "implement is blocked in round 2 of review's loop", 'nemia retry r-1 implement');
    const twice = refusalOf(ask(inRound(3), saidIn(3, true), ALL_SUCCEEDED, undefined, [roundAskFor(4)]));
    names(twice, "round 4 of review's loop is already asked for", '(at 2026-09-13T12:00:00.000Z)');
  });
  await t.test('REFUSED: a step with no loop, an unknown step, a run with no loop, and several loops unnamed', () => {
    const noLoop = refusalOf(ask(inRound(3), saidIn(3, true), ALL_SUCCEEDED, 'implement'));
    names(noLoop, 'implement has no `loop:`', 'loops close at review', 'nemia retry r-1 implement');
    names(refusalOf(ask(inRound(3), saidIn(3, true), ALL_SUCCEEDED, 'deploy')), 'r-1 has no step "deploy"');
    names(refusalOf(roundAsk(STEPS, run({ implement: 't1', review: 't2' }), undefined, ALL_SUCCEEDED)), 'no step of r-1 has `loop:`');
    const two: Workflow[] = [
      ...LOOP.slice(0, 2),
      step('docs', ['review']),
      { ...step('proof', ['docs']), output: { file: 'proof.json', schema: LOOPING }, loop: 'docs', rounds: 2 },
    ];
    const answer = roundAsk(two, run({ implement: 'i1', review: 'r1', docs: null, proof: null }), undefined, ALL_SUCCEEDED);
    assert.deepEqual(Object.keys(answer), ['refusal']);
    names(refusalOf(answer), 'r-1 has 2 loops, closing at review, proof', 'nemia round r-1 <step>');
  });
  await t.test('REFUSED: an accepted loop, naming the acceptance rather than an unasked sign-off', () => {
    const accepted = refusalOf(roundAsk(LOOP, inRound(3, acceptedTry(3)), 'review', ALL_SUCCEEDED, saidIn(3, true), asked));
    names(accepted, 'review asked for round 4', '2026-09-20T14:05:00.000Z', '(nemia accept)', 'accept-review-3', '.asks');
    names(accepted, 'nemia round r-1 review');
    assert.ok(!accepted.includes('without asking'));
  });
});

test('roundAsk past a budget: once more only with `--budget` above what the step spent', async (t) => {
  await t.test('below the cap, a step over its budget: refused without a raise above it, taken with one', () => {
    const r = inRound(1);
    const ask = (budget?: number, asks: RoundAsk[] = []) =>
      roundAsk(BUDGETED_LOOP, r, undefined, ALL_SUCCEEDED, saidIn(1, true), asked, asks, spends({ i1: 4.25, r1: 0.5 }), budget);
    const bare = ask();
    assert.deepEqual(Object.keys(bare), ['refusal']);
    names(
      refusalOf(bare),
      'review asked for round 2',
      'implement has cost $4.25 of its $3 budget',
      'above $4.25',
      'nemia round r-1 review --budget <amount>',
    );
    names(refusalOf(ask(4)), '--budget 4 is not above $4.25', 'more than $4.25', 'nemia round r-1 review --budget <amount>');
    assert.deepEqual(ask(10), { step: 'review', round: 2, budget: 10 });
    names(
      refusalOf(ask(10, [roundAskFor(2)])),
      "round 2 of review's loop is asked for (at ",
      'without a --budget above $4.25',
      '$4.25 of its $3 budget',
      'round-review-2',
      'nemia round r-1 review --budget <amount>',
    );
  });
  await t.test('at the cap and past a budget: asks for `--budget` too, and takes one', () => {
    const r = inRound(3);
    const spent = spends({ i1: 1, i2: 1, i3: 1.5 });
    const bare = roundAsk(BUDGETED_LOOP, r, 'review', ALL_SUCCEEDED, saidIn(3, true), asked, [], spent);
    names(
      refusalOf(bare),
      'review asked for round 4',
      'implement has cost $3.50 of its $3 budget',
      'nemia round r-1 review --budget <amount>',
    );
    const raised = roundAsk(BUDGETED_LOOP, r, 'review', ALL_SUCCEEDED, saidIn(3, true), asked, [], spent, 5);
    assert.deepEqual(raised, { step: 'review', round: 4, budget: 5 });
  });
  await t.test('REFUSED: `--budget` on a loop with no step over its budget; without it, as before', () => {
    const spent = spends({ i1: 1, i2: 1, i3: 1.5 });
    const unraised = roundAsk(LOOP, inRound(3), 'review', ALL_SUCCEEDED, saidIn(3, true), asked, [], spent, 5);
    assert.deepEqual(Object.keys(unraised), ['refusal']);
    names(refusalOf(unraised), '--budget', "no step of review's loop is", 'nemia round r-1 review.');
    assert.deepEqual(roundAsk(LOOP, inRound(3), 'review', ALL_SUCCEEDED, saidIn(3, true), asked, [], spent), { step: 'review', round: 4 });
  });
});

test("roundBudgetRefusal: a round's `--budget`", async (t) => {
  for (const budget of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await t.test(`REFUSED: ${String(budget)}, no dollars above zero`, () => {
      names(roundBudgetRefusal('r-1', budget), `--budget ${String(budget)} is not an amount`, 'nemia round r-1 [<step>] --budget <amount>');
    });
  }
  await t.test('none given, or an amount, is let through', () => {
    assert.equal(roundBudgetRefusal('r-1', undefined), null);
    assert.equal(roundBudgetRefusal('r-1', 2.5), null);
  });
});

test('roundsDue and spentRoundAsks: which round is due, and which asks are spent', async (t) => {
  const r = inRound(1);
  const said = saidIn(1, true);
  const spent = spends({ i1: 4.25, r1: 0.5 });
  await t.test('past a budget, only a round asked with `--budget` above what was spent, raising that step', () => {
    const due = (asks: RoundAsk[]) => roundsDue(BUDGETED_LOOP, r, ALL_SUCCEEDED, said, asked, asks, spent);
    assert.deepEqual(due([{ ...roundAskFor(2), budget: 10 }]), [
      { step: 'review', target: 'implement', round: 2, by: 'ask', budget: 10, raise: ['implement'] },
    ]);
    assert.deepEqual(due([roundAskFor(2)]), [], 'without --budget');
    assert.deepEqual(due([{ ...roundAskFor(2), budget: 4 }]), [], 'not above what it spent');
  });
  await t.test('an accepted loop: no round due, and a raised ask left behind files nothing', () => {
    const accepted = inRound(3, acceptedTry(3));
    assert.deepEqual(roundsDue(LOOP, accepted, ALL_SUCCEEDED, saidIn(3, true), asked), []);
    const left = roundsDue(
      BUDGETED_LOOP,
      accepted,
      ALL_SUCCEEDED,
      saidIn(3, true),
      asked,
      [{ ...roundAskFor(4), budget: 10 }],
      spends({ i1: 1.5, i2: 1.5, i3: 1.5 }),
    );
    assert.deepEqual(left, []);
  });
  await t.test('an ask for a round the record holds is spent; one for a later round is not', () => {
    assert.deepEqual(spentRoundAsks(inRound(4), [roundAskFor(4), roundAskFor(5)]), [roundAskFor(4)]);
  });
});

test('roundFiled: a round moves every step of the loop behind it', async (t) => {
  await t.test("the target continued under its next try's id, the rest unfiled, the record given unwritten", () => {
    const chain: Workflow[] = [IMPLEMENT, step('test', ['implement']), { ...LOOPING_REVIEW, after: ['test'] }];
    const where = { workspace: '/wt', branch: 'wf/r-1/implement' };
    const steps = {
      implement: { taskId: 'r-1-implement', ...where, check: { taskId: 'r-1-implement-check' } },
      test: { taskId: 'r-1-test', ...where },
      review: { taskId: 'r-1-review', ...where },
    };
    const r = run({}, { steps });
    const taskId = stepTaskId(r, 'implement', 2);
    assert.equal(taskId, 'r-1-implement-try2');
    const next: Run = { ...r, steps: roundFiled(chain, r, { step: 'review', target: 'implement', round: 2, by: 'again' }, taskId) };
    assert.deepEqual(next.steps, {
      implement: {
        taskId: 'r-1-implement-try2',
        ...where,
        tries: [{ taskId: 'r-1-implement', check: { taskId: 'r-1-implement-check' }, then: 'round' }],
        closeoutHash: closeoutHashOf(IMPLEMENT, chain),
      },
      test: { taskId: null, ...where, tries: [{ taskId: 'r-1-test', then: 'round' }] },
      review: { taskId: null, ...where, tries: [{ taskId: 'r-1-review', then: 'round' }] },
    } satisfies Run['steps']);
    assert.equal(r.steps.implement.tries, undefined);
    const ids = [roundOf(next, 'review'), stepTaskId(next, 'test', 2), checkTaskId(next, 'implement')];
    assert.deepEqual(ids, [2, 'r-1-test-try2', 'r-1-implement-try2-check']);
  });
  await t.test('a round raised past a budget keeps the cap on the raised step, in force from that round', () => {
    const due = { step: 'review', target: 'implement', round: 2, by: 'ask' as const, budget: 10, raise: ['implement'] };
    const filed = roundFiled(BUDGETED_LOOP, inRound(1), due, 'i2');
    assert.deepEqual(
      [filed.implement.tries, filed.review.tries],
      [[{ taskId: 'i1', check: { taskId: 'c1' }, then: 'round', budget: 10 }], [{ taskId: 'r1', then: 'round' }]],
    );
    assert.equal(budgetOf(BUDGETED_LOOP[0], filed.implement), 10);
  });
});
