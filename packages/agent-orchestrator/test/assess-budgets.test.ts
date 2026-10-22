/**
 * `assess`, `listing` and `decision` on a step's `budget:` across its tries: over its budget it is held for a person, who raises the
 * cap with `--budget` above what it spent; ended by its harness at its budget it reads budget exhausted. Pure: no disk, no engine, no
 * clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assess,
  budgetOf,
  cancelPlan,
  decision,
  listing,
  ownStatus,
  retriesDue,
  retryable,
  retryLines,
  retryRefusal,
  stepStatus,
  tryNote,
  type RoundAsk,
  type Run,
  type SpendOf,
  type TaskPhase,
} from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { Verdict } from '../src/check/check.ts';
import { nextTry, type EarlierTry, type RetryAsk, type RetryHow, type RetryMode } from '../src/retry/retry-ask.ts';
import type { Workflow } from '../src/workflow.ts';
import { names, namesFor, phases, run, step, STEPS } from './assessed.ts';

const asked = () => true;
const signedDone = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const nothingShipped = () => false;
/** The engine's own phase words, which are free text. */
const shown = (m: Record<string, string>) => (id: string) => m[id] ?? 'unknown';
/** How each step signed off, by name. A step not named left no closeout. */
const signedOff = (m: Record<string, Closeout>) => (name: string) => m[name];
const said = (outcome: Closeout['outcome']): Closeout => ({
  outcome,
  summary: 'rewrote the parser\nand the three tests that pinned it',
  artifacts: [],
  needs: outcome === 'blocked' ? 'which flag name ships' : undefined,
});
/** `implement` on the try after `tries`: its task `t1`, its check `check`. `review` not filed. */
const onTry = (tries: EarlierTry[] = [], check: string | null = 'c1') =>
  run(
    {},
    {
      steps: {
        implement: { taskId: 't1', ...(check ? { check: { taskId: check } } : {}), ...(tries.length ? { tries } : {}) },
        review: { taskId: null },
      },
    },
  );
/** A person's ask for implement's try `n`. */
const askFor = (n: number, mode: RetryMode = 'nudge'): RetryAsk => ({ step: 'implement', try: n, mode, at: '2026-09-13T10:00:00.000Z' });
/**
 * What the engine measured of each task's sessions, by id — dollars on its ended attempts — and the tasks its harness ended at their
 * budget.
 */
const spends =
  (usd: Record<string, number>, budgetEnded: string[] = []): SpendOf =>
  (id) =>
    id in usd || budgetEnded.includes(id)
      ? { usd: usd[id] ?? 0, measured: id in usd ? 1 : 0, unmeasured: id in usd ? 0 : 1, budgetEnded: budgetEnded.includes(id) }
      : undefined;
/** implement checked, with `retries: 2` and a $3 budget, on claude; review after it. */
const BUDGETED: Workflow[] = [{ ...step('implement'), check: 'npm test', retries: 2, budget: 3 }, step('review', ['implement'])];
/** implement on try 2 — `retries:` filed it — its check refused again. */
const refusedTwice = () => onTry([{ taskId: 't0', check: { taskId: 'c0' }, then: 'retries' }], 'c1');
const REFUSED_TWICE = { t0: 'succeeded', c0: 'failed', t1: 'succeeded', c1: 'failed' } as const;
/** What the tick and `nemia ls` read beside a step's phases: its verdict, the person's asks and what was spent. */
type Read = { verdict?: (step: string) => Verdict | undefined; asks?: RetryAsk[]; rounds?: RoundAsk[]; spent?: SpendOf };
const assessed = (steps: Workflow[], r: Run, p: (id: string) => TaskPhase, saidOf: (name: string) => Closeout | undefined, o: Read = {}) =>
  assess(steps, r, p, saidOf, asked, o.verdict, o.asks, o.rounds, () => false, o.spent);
const decided = (steps: Workflow[], r: Run, p: (id: string) => TaskPhase, saidOf: (name: string) => Closeout | undefined, o: Read = {}) =>
  decision(steps, r, p, nothingShipped, saidOf, asked, o.verdict, o.asks, o.rounds, () => false, o.spent);
const listed = (steps: Workflow[], r: Run, p: (id: string) => string, saidOf: (name: string) => Closeout | undefined, o: Read = {}) =>
  listing({
    steps,
    run: r,
    phaseOf: p,
    closeoutOf: saidOf,
    askedCloseout: asked,
    verdictOf: o.verdict ?? (() => undefined),
    asks: o.asks ?? [],
    roundAsks: o.rounds ?? [],
    spendOf: o.spent ?? (() => undefined),
  });
const OVER = { verdict: () => 1 as const, spent: spends({ t0: 1.75, t1: 2.5 }) };

test('REFUSED past its budget, at shipped defaults: a step whose ended tries cost more than its `budget:` is held', async (t) => {
  const r = refusedTwice();
  const p = phases(REFUSED_TWICE);
  await t.test("over budget, its check refused: no try on the run's word, the run failed and not finished", () => {
    assert.equal(stepStatus(BUDGETED[0], r, p, signedDone, asked, BUDGETED, OVER.spent, OVER.verdict), 'over budget');
    const a = assessed(BUDGETED, r, p, signedDone, OVER);
    assert.deepEqual([a.retry, a.blocked, a.status], [[], ['review'], 'failed']);
    assert.deepEqual(cancelPlan(BUDGETED, r, p, signedDone, asked, OVER.verdict, [], [], OVER.spent), { kind: 'cancel', stop: [] });
  });
  await t.test('listing: the amounts in its word, waiting on you', () => {
    const l = listed(BUDGETED, r, shown(REFUSED_TWICE), signedOff({ implement: said('done') }), OVER);
    assert.deepEqual(
      [l.steps[0].status, l.steps[0].note, l.waitingOnYou],
      ['over budget $4.25 of $3', 'try 2, by retries: 2', ['implement']],
    );
  });
  await t.test('decision: failed, its check refused and over budget both said, offered `--budget`', () => {
    const d = decided(BUDGETED, r, p, signedDone, OVER);
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.overBudget, d.failedCheck, d.failed], [
      'failed',
      ['implement'],
      ['implement'],
      [],
    ]);
    assert.deepEqual(retryLines(BUDGETED, r, d, p, signedDone, asked, OVER.spent, OVER.verdict), [
      'implement: over budget (check refused), $4.25 of $3. Raise its cap above $4.25 and continue its session:  nemia retry r-1 implement --budget <amount>  (--fresh, or --model <m>, for a new session; retries: 2, 1 spent; --recheck runs its check again, and needs no --budget)',
    ]);
  });
  await t.test('at its cap, $3.00 of $3: held as past it, no try', () => {
    const atCap = spends({ t0: 1.5, t1: 1.5 });
    assert.equal(stepStatus(BUDGETED[0], r, p, signedDone, asked, BUDGETED, atCap, OVER.verdict), 'over budget');
    assert.deepEqual(assessed(BUDGETED, r, p, signedDone, { ...OVER, spent: atCap }).retry, []);
  });
  for (const [why, under] of [
    ['under it', spends({ t0: 1.5, t1: 1.4999 })],
    ['no cost measured', () => undefined],
  ] as Array<[string, SpendOf]>) {
    await t.test(`${why}: its check refused, and \`retries:\` tries it again`, () => {
      assert.equal(stepStatus(BUDGETED[0], r, p, signedDone, asked, BUDGETED, under, OVER.verdict), 'failed (check)');
      assert.deepEqual(assessed(BUDGETED, r, p, signedDone, { ...OVER, spent: under }).retry, [
        { step: 'implement', try: 3, mode: 'nudge', by: 'retries' },
      ]);
      const l = listed(BUDGETED, r, shown(REFUSED_TWICE), signedOff({ implement: said('done') }), { ...OVER, spent: under });
      assert.equal(l.steps[0].status, 'failed ✗ check (exit 1)');
    });
  }
  await t.test('a step with no `budget:` is never over one, nor one read with nothing spent', () => {
    const RETRIED: Workflow[] = [{ ...step('implement'), check: 'npm test', retries: 2 }, step('review', ['implement'])];
    assert.equal(stepStatus(RETRIED[0], r, p, signedDone, asked, RETRIED, OVER.spent, OVER.verdict), 'failed (check)');
    assert.equal(stepStatus(BUDGETED[0], r, p, signedDone, asked, BUDGETED), 'failed (check)');
  });
});

test("a step over its budget is tried again only on a person's `--budget` above what it spent", async (t) => {
  const r = refusedTwice();
  const p = phases(REFUSED_TWICE);
  const due = (asks: RetryAsk[]) => retriesDue(BUDGETED, r, p, signedDone, asked, OVER.verdict, asks, () => false, OVER.spent);
  await t.test('without `--budget`, or with one not above what it spent, no tick honours it', () => {
    assert.deepEqual(due([askFor(3)]), []);
    assert.deepEqual(due([{ ...askFor(3), budget: 4.25 }]), []);
  });
  await t.test('above it, the try carries the cap past it; a recheck costs nothing and needs none', () => {
    assert.deepEqual(due([{ ...askFor(3, 'fresh'), budget: 10 }]), [
      { step: 'implement', try: 3, mode: 'fresh', budget: 10, pastCap: true, by: 'ask' },
    ]);
    assert.deepEqual(due([askFor(3, 'recheck')]), [{ step: 'implement', try: 3, mode: 'recheck', by: 'ask' }]);
  });
  await t.test('the record keeps the cap, in force from that try; a try past the new cap is held again', () => {
    const raised = nextTry(r.steps.implement, { step: 'implement', try: 3, mode: 'fresh', budget: 10, by: 'ask' }, 't2');
    assert.deepEqual(raised.tries?.at(-1), { taskId: 't1', check: { taskId: 'c1' }, then: 'fresh', budget: 10 });
    assert.equal(tryNote(BUDGETED[0], raised), 'try 3, fresh, on your word, budget $10');
    const on3: Run = { ...r, steps: { ...r.steps, implement: { ...raised, check: { taskId: 'c2' } } } };
    assert.equal(budgetOf(BUDGETED[0], on3.steps.implement), 10);
    const p3 = phases({ ...REFUSED_TWICE, t2: 'succeeded', c2: 'failed' });
    const status = (t2: number) =>
      stepStatus(BUDGETED[0], on3, p3, signedDone, asked, BUDGETED, spends({ t0: 1.75, t1: 2.5, t2 }), OVER.verdict);
    assert.equal(status(5), 'failed (check)');
    assert.equal(status(6), 'over budget');
  });
});

test('REFUSED by name: `nemia retry` of a step over its budget', async (t) => {
  const r = refusedTwice();
  const p = phases(REFUSED_TWICE);
  const refusal = (how: RetryHow, asks: RetryAsk[] = [], of: SpendOf = OVER.spent) =>
    retryRefusal(BUDGETED, r, 'implement', how, p, signedDone, asked, OVER.verdict, asks, () => false, of);
  await t.test('without `--budget`, the step and its amounts named', () => {
    names(
      refusal({ mode: 'nudge' }),
      'implement is over budget',
      '$4.25 of its $3 budget',
      'above $4.25',
      'nemia retry r-1 implement --budget <amount>.',
    );
    names(refusal({ mode: 'fresh', model: 'opus' }), 'above $4.25', 'nemia retry r-1 implement --budget <amount> --model opus.');
  });
  for (const low of [3, 4.25]) {
    await t.test(`\`--budget ${low}\`, not above what it spent`, () => {
      names(
        refusal({ mode: 'nudge', budget: low }),
        `--budget ${low} is not above $4.25`,
        'more than $4.25',
        'nemia retry r-1 implement --budget <amount>',
      );
    });
  }
  await t.test('above it, or a recheck without one, is taken; a recheck with one, or no amount, refused', () => {
    assert.equal(refusal({ mode: 'nudge', budget: 4.26 }), null);
    assert.equal(refusal({ mode: 'recheck' }), null);
    names(refusal({ mode: 'recheck', budget: 10 }), '--budget', '--recheck files none');
    names(refusal({ mode: 'nudge', budget: 0 }), '--budget 0 is not an amount.');
  });
  for (const budget of [10, 3]) {
    await t.test(`under its cap with \`retries:\` left, \`--budget ${budget}\`: the run tries it itself, said first`, () => {
      const itself = refusal({ mode: 'nudge', budget }, [], spends({ t0: 1, t1: 1 }));
      namesFor('tried by the run', itself, 'the run tries implement again itself', '`retries: 2` has 1 left', 'try 3', 'nemia ls r-1');
      assert.ok(!itself!.includes('--budget'));
    });
  }
  await t.test('`retries:` spent, under its cap: a raise above the cap in force is taken, one not above refused', () => {
    const spentOut: Workflow[] = [{ ...BUDGETED[0], retries: 1 }, BUDGETED[1]];
    const out = (how: RetryHow) =>
      retryRefusal(spentOut, r, 'implement', how, p, signedDone, asked, OVER.verdict, [], () => false, spends({ t0: 1, t1: 1 }));
    assert.equal(out({ mode: 'nudge', budget: 10 }), null);
    names(out({ mode: 'nudge', budget: 2.5 }), '--budget 2.5 is not above $3', 'the $3 cap in force on implement');
  });
  await t.test('a step with no `budget:`', () => {
    const plain = retryRefusal(
      STEPS,
      run({ implement: 't1', review: null }),
      'implement',
      { mode: 'nudge', budget: 5 },
      phases({ t1: 'failed' }),
      signedDone,
      asked,
    );
    names(plain, 'implement has no `budget:`', 'without --budget: nemia retry r-1 implement.');
  });
  await t.test('an ask left waiting without a raise is named; one that carries enough is waited for', () => {
    names(
      refusal({ mode: 'nudge', budget: 10 }, [askFor(3)]),
      'try 3 of implement is asked for (--nudge, at ',
      'without a --budget above $4.25',
      '$4.25 of its $3 budget',
      'retry-implement-3',
      '.asks',
      'nemia retry r-1 implement --budget <amount>',
    );
    names(refusal({ mode: 'nudge' }, [{ ...askFor(3), budget: 10 }]), 'try 3 of implement is already asked for');
  });
});

test('a step blocked under its cap takes a `--budget` above it, not past its cap', async (t) => {
  const B20: Workflow[] = [{ ...step('implement'), budget: 20 }, step('review', ['implement'])];
  const r = run({ implement: 't1', review: null });
  const p = phases({ t1: 'succeeded' });
  const blocked = () => ({ outcome: 'blocked' as const, summary: 's', artifacts: [], needs: 'a try with a larger budget, about $15–25' });
  const spent = spends({ t1: 19.27 });
  const refusal = (how: RetryHow, asks: RetryAsk[] = []) =>
    retryRefusal(
      B20,
      r,
      'implement',
      how,
      p,
      blocked,
      asked,
      () => undefined,
      asks,
      () => false,
      spent,
    );
  const due = (asks: RetryAsk[]) =>
    retriesDue(
      B20,
      r,
      p,
      blocked,
      asked,
      () => undefined,
      asks,
      () => false,
      spent,
    );
  await t.test('taken with one above the cap, or none; the tick files it with no `pastCap`', () => {
    assert.equal(refusal({ mode: 'nudge', budget: 40 }), null);
    assert.equal(refusal({ mode: 'nudge' }), null);
    assert.deepEqual(due([{ ...askFor(2), budget: 40 }]), [{ step: 'implement', try: 2, mode: 'nudge', budget: 40, by: 'ask' }]);
  });
  for (const low of [15, 20]) {
    await t.test(`REFUSED: \`--budget ${low}\`, not above the cap in force`, () => {
      names(
        refusal({ mode: 'nudge', budget: low }),
        `--budget ${low} is not above $20`,
        '$20 cap in force on implement',
        '$19.27',
        'more than $20',
        'nemia retry r-1 implement --budget <amount>',
      );
    });
  }
  await t.test('an ask left with one not above the cap is never due, and named', () => {
    assert.deepEqual(due([{ ...askFor(2), budget: 20 }]), []);
    names(
      refusal({ mode: 'nudge', budget: 40 }, [{ ...askFor(2), budget: 20 }]),
      'try 2 of implement is asked for (--nudge, at ',
      'with --budget 20, not above $20',
      'retry-implement-2',
      '.asks',
      'nemia retry r-1 implement --budget <amount>',
    );
  });
  await t.test('no `budget:`: an ask with a `--budget` is never due, and named; one without is', () => {
    const free = run({ implement: 't1', review: null });
    const failed = phases({ t1: 'failed' });
    const unbudgeted = (asks: RetryAsk[]) => retriesDue(STEPS, free, failed, signedDone, asked, () => undefined, asks);
    assert.deepEqual(unbudgeted([{ ...askFor(2), budget: 10 }]), []);
    assert.deepEqual(unbudgeted([askFor(2)]), [{ step: 'implement', try: 2, mode: 'nudge', by: 'ask' }]);
    const left = retryRefusal(STEPS, free, 'implement', { mode: 'nudge' }, failed, signedDone, asked, () => undefined, [
      { ...askFor(2), budget: 10 },
    ]);
    names(
      left,
      'try 2 of implement is asked for (--nudge, at ',
      'with --budget 10',
      'no `budget:`',
      'retry-implement-2',
      'nemia retry r-1 implement.',
    );
  });
});

test('a step its harness ended at its budget reads budget exhausted, with the amounts', async (t) => {
  const DETACHED: Workflow[] = [
    { ...step('implement'), harness: 'claude-detached', check: 'npm test', retries: 2, budget: 3 },
    step('review', ['implement']),
  ];
  const r = run({ implement: 't1', review: null });
  const p = phases({ t1: 'failed' });
  const ended = spends({ t1: 3.02 }, ['t1']);
  const nothingSaid = () => undefined;
  await t.test("the harness's cut, failed or done; read with nothing measured, failed; stopped by a person, stopped", () => {
    assert.equal(stepStatus(DETACHED[0], r, p, nothingSaid, asked, DETACHED, ended), 'budget exhausted');
    assert.equal(stepStatus(DETACHED[0], r, p, nothingSaid, asked, DETACHED), 'failed');
    assert.equal(stepStatus(DETACHED[0], r, phases({ t1: 'succeeded' }), nothingSaid, asked, DETACHED, ended), 'budget exhausted');
    assert.equal(ownStatus(DETACHED[0], r, phases({ t1: 'stopped' }), nothingSaid, asked, DETACHED, ended), 'stopped');
  });
  await t.test('never tried by `retries:`, waited on by a person, offered `--budget`', () => {
    const a = assessed(DETACHED, r, p, nothingSaid, { spent: ended });
    assert.deepEqual([a.retry, a.blocked, a.status], [[], ['review'], 'blocked']);
    const l = listed(DETACHED, r, shown({ t1: 'failed' }), signedOff({}), { spent: ended });
    assert.deepEqual([l.steps[0].status, l.waitingOnYou], ['budget exhausted $3.02 of $3', ['implement']]);
    const d = decided(DETACHED, r, p, nothingSaid, { spent: ended });
    assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d.budgetExhausted, d.failed], ['blocked', ['implement'], []]);
    assert.deepEqual(retryLines(DETACHED, r, d, p, nothingSaid, asked, ended), [
      'implement: budget exhausted, $3.02 of $3. Raise its cap above $3.02 and continue its session:  nemia retry r-1 implement --budget <amount>  (--fresh, or --model <m>, for a new session; retries: 2, 0 spent)',
    ]);
  });
  await t.test('retryable: the raise it needs; none with no `budget:`', () => {
    assert.deepEqual(
      retryable(DETACHED[0], r, p, nothingSaid, asked, DETACHED, () => false, ended),
      {
        status: 'budget exhausted',
        modes: ['nudge', 'fresh'],
        blockedByHarness: false,
        raise: { above: 3.02, spent: { usd: 3.02, measured: 1, unmeasured: 0 }, cap: 3 },
      },
    );
    assert.deepEqual(
      retryable(STEPS[0], run({ implement: 't1', review: null }), phases({ t1: 'failed' }), nothingSaid, asked, STEPS, () => false, ended)
        .raise,
      undefined,
    );
  });
  const refusal = (how: RetryHow, of: SpendOf = ended) =>
    retryRefusal(
      DETACHED,
      r,
      'implement',
      how,
      p,
      nothingSaid,
      asked,
      () => undefined,
      [],
      () => false,
      of,
    );
  await t.test('REFUSED: no `--budget`, or one not above what it cost', () => {
    names(
      refusal({ mode: 'nudge' }),
      'implement ended at its budget',
      'stopped its session at $3',
      'cost $3.02',
      'nemia retry r-1 implement --budget <amount>',
    );
    names(
      refusal({ mode: 'nudge', budget: 2 }),
      '--budget 2 is not above $3.02',
      'more than $3.02',
      'nemia retry r-1 implement --budget <amount>',
    );
  });
  await t.test('cut off before its cost was written: the cap it was ended at is what a raise passes', () => {
    const unmeasured = spends({}, ['t1']);
    names(
      refusal({ mode: 'nudge', budget: 3 }, unmeasured),
      '--budget 3 is not above $3',
      'more than $3:',
      'nemia retry r-1 implement --budget <amount>',
    );
    assert.equal(refusal({ mode: 'fresh', budget: 5 }, unmeasured), null);
    assert.equal(
      listed(DETACHED, r, shown({ t1: 'failed' }), signedOff({}), { spent: unmeasured }).steps[0].status,
      'budget exhausted at $3',
    );
  });
});
