/**
 * `assess`, `listing` and `decision` where a loop meets a budget: `again: true` files no round while a step of the loop is over its
 * budget, `nemia round --budget` above what it spent lets it go round, an accepted loop is over nobody's budget, and a pruned run is
 * offered neither. Pure: no disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerLines,
  assess,
  decision,
  listing,
  overBudgetLine,
  retryLines,
  retryRefusal,
  roundLines,
  roundSpans,
  stepStatus,
  type RepositoryRun,
  type RoundAsk,
  type Run,
  type SpendOf,
  type TaskPhase,
} from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { EarlierTry } from '../src/retry/retry-ask.ts';
import type { OutputSchema, Workflow } from '../src/workflow.ts';
import { names, run, step } from './assessed.ts';

const asked = () => true;
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const nothingShipped = () => false;
/** `findings`, strict — as the tests' team's `test/fixtures/team/agents/review.schema.json` declares it. */
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
/** `findings` and `again`: what a looping review declares. */
const LOOPING: OutputSchema = {
  ...FINDINGS,
  properties: { ...FINDINGS.properties, again: { type: 'boolean' } },
  required: ['findings', 'again'],
};
/** implement, checked → review, looping back to it with `rounds: 3` as the parser sets it — and ship, after the loop. */
const LOOP: Workflow[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
const [IMPLEMENT, LOOPING_REVIEW] = [LOOP[0], LOOP[1]];
const FOUND = [{ file: 'src/run.ts', line: 183, what: 'a producer with no findings reads as done' }];
/** How review signed off: its findings, whether to go round again, and a summary that must travel nowhere. */
const reviewed = (again: unknown): Closeout => ({
  outcome: 'done',
  summary: 'REVIEWER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { findings: FOUND, again },
});
const REPLIES = [{ finding: 'src/run.ts:183', answer: "won't fix", why: 'an empty list is a review with nothing worth changing' }];
/** How implement signed off past round 1: its replies, and a summary that must travel nowhere. */
const answered: Closeout = {
  outcome: 'done',
  summary: 'IMPLEMENTER-SUMMARY',
  artifacts: [],
  needs: undefined,
  output: { replies: REPLIES },
};
/** The loop on round `n`: implement's `i<n>` checked by `c<n>`, review's `r<n>`, each with its earlier rounds behind it — ship unfiled. */
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
const ALL_SUCCEEDED = (): TaskPhase => 'succeeded';
/** implement's closeout — with replies past round 1 — and review's, saying `again`. */
const saidIn =
  (n: number, again: unknown) =>
  (name: string): Closeout | undefined =>
    name === 'review' ? reviewed(again) : name === 'implement' ? (n > 1 ? answered : signedDone()) : undefined;
const roundAskFor = (round: number): RoundAsk => ({ step: 'review', round, at: '2026-09-13T12:00:00.000Z' });
/** Why a person judged a loop's findings later work rather than this run's. */
const ENOUGH = 'the findings are cases no shipped team has: follow-up work, not this run.';
/** Try `t` of review, accepted as it stands at a known time. */
const acceptedTry = (t: number, message: string = ENOUGH): Partial<RepositoryRun> => ({
  acceptances: [{ step: 'review', try: t, at: '2026-09-20T14:05:00.000Z', message }],
});
const spends =
  (usd: Record<string, number>): SpendOf =>
  (id) =>
    id in usd ? { usd: usd[id], measured: 1, unmeasured: 0, budgetEnded: false } : undefined;
/** implement checked with a $3 budget, in the loop. */
const BUDGETED_LOOP: Workflow[] = [{ ...IMPLEMENT, budget: 3 }, LOOPING_REVIEW, LOOP[2]];
type Read = { rounds?: RoundAsk[]; spent?: SpendOf; verdict?: () => 0 | undefined };
const assessed = (steps: Workflow[], r: Run, saidOf: (name: string) => Closeout | undefined, o: Read = {}) =>
  assess(steps, r, ALL_SUCCEEDED, saidOf, asked, o.verdict ?? (() => 0), [], o.rounds, () => false, o.spent);
const decided = (
  steps: Workflow[],
  r: Run,
  saidOf: (name: string) => Closeout | undefined,
  o: Read = {},
  p: (id: string) => TaskPhase = ALL_SUCCEEDED,
) => decision(steps, r, p, nothingShipped, saidOf, asked, o.verdict ?? (() => 0), [], o.rounds, () => false, o.spent);
const listed = (steps: Workflow[], r: Run, saidOf: (name: string) => Closeout | undefined, o: Read = {}) =>
  listing({
    steps,
    run: r,
    phaseOf: ALL_SUCCEEDED,
    closeoutOf: saidOf,
    askedCloseout: asked,
    verdictOf: o.verdict ?? (() => 0),
    roundAsks: o.rounds ?? [],
    spendOf: o.spent ?? (() => undefined),
  });

test('REFUSED once pruned: a loop out of rounds, or held on a budget, is offered no round and no acceptance', async (t) => {
  const pruned = { at: '2026-09-17T01:00:00.000Z', worktrees: [] };
  const since = 'since the run was pruned at 2026-09-17T01:00:00.000Z — its worktrees were removed (nemia prune)';
  await t.test('out of rounds: `nemia ls` says pruned, waits on nobody, and nothing is offered', () => {
    const r = inRound(3, { pruned });
    const said = saidIn(3, true);
    const cold = { verdict: () => undefined };
    const l = listed(LOOP, r, said, cold);
    assert.deepEqual(
      [l.steps[1].status, l.steps[1].note, l.waitingOnYou],
      ['rounds exhausted', `round 3 of 3, and it asked again — no round more, ${since}`, []],
    );
    const d = decided(LOOP, r, said, cold);
    assert.ok(d.kind === 'awaiting', d.kind);
    const offers = [
      roundLines(LOOP, r, d),
      retryLines(LOOP, r, d, ALL_SUCCEEDED, said, asked),
      answerLines(LOOP, r, d, ALL_SUCCEEDED, said, asked),
    ];
    assert.deepEqual(offers, [[], [], {}]);
    names(retryRefusal(LOOP, r, 'review', { mode: 'fresh' }, ALL_SUCCEEDED, said, asked), 'was pruned at');
  });
  await t.test('held on a budget: no round more, the OVER BUDGET line says pruned, nothing offered raised or not', () => {
    const held = inRound(1, { pruned });
    const said = saidIn(1, true);
    const spent = spends({ i1: 4.25, r1: 0.5 });
    const hl = listed(BUDGETED_LOOP, held, said, { spent });
    assert.deepEqual(
      [hl.steps[1].note, hl.waitingOnYou],
      [`round 1 of 3, and it asked again, past a budget — no round more, ${since}`, []],
    );
    assert.doesNotMatch(JSON.stringify(hl), /nemia (approve|retry|round|accept) /);
    const hd = decided(BUDGETED_LOOP, held, said, { spent });
    assert.ok(hd.kind === 'awaiting', hd.kind);
    assert.equal(
      overBudgetLine(BUDGETED_LOOP, held, hd, spent),
      `OVER BUDGET: implement ($4.25 of $3), review (held: its round would file implement again, which has cost $4.25 of its $3 budget)  — nothing more is filed for them, raised or not, ${since}; nothing after them ran`,
    );
    assert.deepEqual(
      [roundLines(BUDGETED_LOOP, held, hd, spent), retryLines(BUDGETED_LOOP, held, hd, ALL_SUCCEEDED, said, asked, spent)],
      [[], []],
    );
  });
});

test('REFUSED past a budget in a loop: `again: true` files no round while a step of the loop is over its budget', async (t) => {
  const r = inRound(1);
  const said = saidIn(1, true);
  const spent = spends({ i1: 4.25, r1: 0.5 });
  await t.test('both read over budget; no round, and ship not filed', () => {
    assert.deepEqual(
      BUDGETED_LOOP.map((s) => stepStatus(s, r, ALL_SUCCEEDED, said, asked, BUDGETED_LOOP, spent)),
      ['over budget', 'over budget', 'waiting'],
    );
    const a = assessed(BUDGETED_LOOP, r, said, { spent });
    assert.deepEqual([a.round, a.ready, a.blocked, a.status], [[], [], ['ship'], 'blocked']);
  });
  await t.test("listing: review's word shows implement's spend, its own beside it, and both wait on you", () => {
    const l = listed(BUDGETED_LOOP, r, said, { spent });
    assert.deepEqual(
      l.steps.map((s) => [s.status, s.note]),
      [
        ['over budget $4.25 of $3', undefined],
        [
          'over budget — implement $4.25 of $3',
          'round 1 of 3, and it asked again, past a budget — once more: nemia round r-1 review --budget <amount>',
        ],
        ['waiting', undefined],
      ],
    );
    assert.deepEqual(l.waitingOnYou, ['implement', 'review']);
    assert.deepEqual([l.steps.map((s) => s.cost), l.cost], [[undefined, '$0.50', undefined], '$4.75']);
  });
  await t.test('decision: blocked, both over budget; the round offered with `--budget`, and no try', () => {
    const d = decided(BUDGETED_LOOP, r, said, { spent });
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.overBudget, d.exhausted], ['blocked', ['implement', 'review'], []]);
    assert.equal(
      overBudgetLine(BUDGETED_LOOP, r, d, spent),
      'OVER BUDGET, waiting on you: implement ($4.25 of $3), review (held: its round would file implement again, which has cost $4.25 of its $3 budget)  — the run files nothing more for them on its own; nothing after them ran',
    );
    assert.deepEqual(roundLines(BUDGETED_LOOP, r, d, spent), [
      'review: it asked for round 2, and implement has cost $4.25 of its $3 budget. Its findings are below. Once more, its cap raised above $4.25 — implement continued, then a new review:  nemia round r-1 review --budget <amount>',
    ]);
    assert.deepEqual(retryLines(BUDGETED_LOOP, r, d, ALL_SUCCEEDED, said, asked, spent), []);
  });
  await t.test('REFUSED: a try of the step its loop would file again, naming the round', () => {
    const tried = retryRefusal(
      BUDGETED_LOOP,
      r,
      'implement',
      { mode: 'nudge', budget: 10 },
      ALL_SUCCEEDED,
      said,
      asked,
      () => 0,
      [],
      () => false,
      spent,
    );
    names(
      tried,
      'implement did its work',
      'past its budget',
      "a person's call, not another try",
      'nemia round r-1 review --budget <amount>.',
    );
  });
  for (const under of [spends({ i1: 2.5 }), () => undefined] as SpendOf[]) {
    await t.test(
      `under its budget, or with no cost measured (${under('i1') ? 'under' : 'none'}): the loop goes round on review's word`,
      () => {
        assert.deepEqual(assessed(BUDGETED_LOOP, r, said, { spent: under }).round, [
          { step: 'review', target: 'implement', round: 2, by: 'again' },
        ]);
      },
    );
  }
  await t.test('a step not asked for again keeps its word, over budget or not, and what waits on it is filed', () => {
    assert.equal(stepStatus(BUDGETED_LOOP[0], r, ALL_SUCCEEDED, saidIn(1, false), asked, BUDGETED_LOOP, spent), 'verified');
    assert.deepEqual(assessed(BUDGETED_LOOP, r, saidIn(1, false), { spent }).ready, ['ship']);
  });
});

test('a round asked past a budget holds no step of its loop on the pass before it is filed', async (t) => {
  const r = inRound(1);
  const said = saidIn(1, true);
  const spent = spends({ i1: 4.25, r1: 0.5 });
  const seen = (rounds: RoundAsk[]) => {
    const l = listed(BUDGETED_LOOP, r, said, { rounds, spent });
    return {
      a: assessed(BUDGETED_LOOP, r, said, { rounds, spent }),
      l,
      d: decided(BUDGETED_LOOP, r, said, { rounds, spent }),
      words: l.steps.map((s) => s.status),
    };
  };
  await t.test('after `nemia round --budget`: the round due, nothing over budget, nobody waited on, nothing offered', () => {
    const raised = seen([{ ...roundAskFor(2), budget: 10 }]);
    assert.deepEqual(
      raised.a.round.map((x) => [x.step, x.raise]),
      [['review', ['implement']]],
    );
    assert.deepEqual([raised.a.status, raised.a.ready, raised.a.blocked], ['running', [], []]);
    assert.deepEqual(roundSpans(BUDGETED_LOOP, raised.a.round), new Set(['implement', 'review']));
    assert.deepEqual(raised.words, ['verified ✓', 'unverified · done', 'waiting']);
    assert.ok(!raised.words.some((w) => w.startsWith('over budget')), raised.words.join(' | '));
    assert.deepEqual(raised.l.waitingOnYou, []);
    assert.deepEqual(
      [raised.l.steps[1].note, raised.l.steps.map((s) => s.cost)],
      ['round 2 asked (nemia round --budget 10) — the next tick files implement', ['$4.25', '$0.50', undefined]],
    );
    assert.deepEqual(raised.d, { kind: 'running', waiting: ['review'] });
    assert.deepEqual([overBudgetLine(BUDGETED_LOOP, r, raised.d, spent), roundLines(BUDGETED_LOOP, r, raised.d, spent)], [undefined, []]);
  });
  await t.test('beside a step that failed, the loop whose round is due is not called over budget, nor offered again', () => {
    const BESIDE = [...BUDGETED_LOOP, step('lint')];
    const beside = { ...r, steps: { ...r.steps, lint: { taskId: 'l1' } } };
    const lintFailed = (id: string): TaskPhase => (id === 'l1' ? 'failed' : 'succeeded');
    const d = decided(BESIDE, beside, said, { rounds: [{ ...roundAskFor(2), budget: 10 }], spent }, lintFailed);
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.failed, d.overBudget], ['failed', ['lint'], []]);
    assert.deepEqual([overBudgetLine(BESIDE, beside, d, spent), roundLines(BESIDE, beside, d, spent)], [undefined, []]);
  });
  for (const [why, rounds] of [
    ['no round asked', []],
    ['a round asked without --budget', [roundAskFor(2)]],
    ['a raise not above $4.25', [{ ...roundAskFor(2), budget: 4 }]],
  ] as const) {
    await t.test(`${why}: both still read held`, () => {
      const held = seen([...rounds]);
      assert.deepEqual([held.a.round, held.a.status, held.a.blocked], [[], 'blocked', ['ship']]);
      assert.deepEqual(
        [held.words, held.l.waitingOnYou],
        [
          ['over budget $4.25 of $3', 'over budget — implement $4.25 of $3', 'waiting'],
          ['implement', 'review'],
        ],
      );
      assert.deepEqual(held.d.kind === 'awaiting' && [held.d.outcome, held.d.overBudget], ['blocked', ['implement', 'review']]);
    });
  }
});

test('at the cap and past a budget: rounds exhausted, its once more asking for `--budget` too', async (t) => {
  const r = inRound(3);
  const said = saidIn(3, true);
  const spent = spends({ i1: 1, i2: 1, i3: 1.5 });
  await t.test('exhausted, not over budget; both offers, the round with `--budget`', () => {
    assert.deepEqual(
      BUDGETED_LOOP.map((s) => stepStatus(s, r, ALL_SUCCEEDED, said, asked, BUDGETED_LOOP, spent)),
      ['verified', 'exhausted', 'waiting'],
    );
    const d = decided(BUDGETED_LOOP, r, said, { spent });
    assert.deepEqual(d.kind === 'awaiting' && [d.exhausted, d.overBudget], [['review'], []]);
    assert.deepEqual(roundLines(BUDGETED_LOOP, r, d, spent), [
      'review: it asked for round 4, and `rounds: 3` are spent, and implement has cost $3.50 of its $3 budget. Its findings are below. Once more, its cap raised above $3.50 — implement continued, then a new review:  nemia round r-1 review --budget <amount>',
      'review: enough — go on with what is there; its findings stay on the record, and ship is filed and handed them with your words:  nemia accept r-1 review --message "<why>"',
    ]);
    assert.equal(
      listed(BUDGETED_LOOP, r, said, { spent }).steps[1].note,
      'round 3 of 3, and it asked again — once more: nemia round r-1 review --budget <amount>',
    );
  });
  await t.test('a loop with no step over its budget offers the round without one', () => {
    assert.deepEqual(roundLines(LOOP, r, decided(LOOP, r, said, { spent }), spent), [
      'review: it asked for round 4, and `rounds: 3` are spent. Its findings are below. Once more — implement continued, then a new review:  nemia round r-1 review',
      'review: enough — go on with what is there; its findings stay on the record, and ship is filed and handed them with your words:  nemia accept r-1 review --message "<why>"',
    ]);
    assert.equal(listed(LOOP, r, said, { spent }).steps[1].note, 'round 3 of 3, and it asked again — once more: nemia round r-1 review');
  });
});

test("an accepted loop is over nobody's budget: no step of it is held, since no round will be filed", async (t) => {
  const said = saidIn(3, true);
  const spent = spends({ i1: 1.5, i2: 1.5, i3: 1.5 });
  const r = inRound(3, acceptedTry(3));
  await t.test('no step held, nobody waited on, and ship filed', () => {
    assert.deepEqual(
      BUDGETED_LOOP.map((s) => stepStatus(s, r, ALL_SUCCEEDED, said, asked, BUDGETED_LOOP, spent)),
      ['verified', 'unverified', 'waiting'],
    );
    const l = listed(BUDGETED_LOOP, r, said, { spent });
    assert.deepEqual([l.steps.map((s) => s.status), l.waitingOnYou], [['verified ✓', 'unverified · done', 'waiting'], []]);
    assert.deepEqual(assessed(BUDGETED_LOOP, r, said, { spent, verdict: () => undefined }).ready, ['ship']);
  });
});
