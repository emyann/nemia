/**
 * What a person is told of a step's spend and budget: `nemia ls`' costs beside each word, `nemia decide`'s cost line, what a step
 * blocked or broken past its budget is named for and offered, and what a try past a budget is told. Pure: no disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  answerLines,
  assess,
  costLine,
  decision,
  listing,
  overBudgetLine,
  ownStatus,
  retriesDue,
  retryLines,
  retryRefusal,
  retrySection,
  runCostLines,
  stepStatus,
  type RoundAsk,
  type Run,
  type SpendOf,
  type StepStatus,
  type TaskPhase,
} from '../src/run.ts';
import type { Closeout } from '../src/closeout/closeout.ts';
import type { Verdict } from '../src/check/check.ts';
import type { EarlierTry, RetryAsk, RetryHow, RetryMode } from '../src/retry/retry-ask.ts';
import type { Workflow } from '../src/workflow.ts';
import { names, phases, run, step } from './assessed.ts';

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
const B: Workflow[] = [{ ...step('implement'), budget: 3 }, step('review', ['implement'])];
const nothingSaid = () => undefined;

test('a step that signed off blocked past its budget: blocked while it runs, over budget once settled', async (t) => {
  const r = run({ implement: 't1', review: null });
  const stuck = (name: string) => (name === 'implement' ? said('blocked') : undefined);
  const spent = spends({ t1: 4 });
  const settled = phases({ t1: 'succeeded' });
  await t.test('its word: blocked while running, over budget settled', () => {
    assert.equal(stepStatus(B[0], r, phases({ t1: 'running' }), stuck, asked, B, spent), 'blocked');
    assert.equal(stepStatus(B[0], r, settled, stuck, asked, B, spent), 'over budget');
  });
  await t.test('its question answered with `--budget` beside `--message`; read with nothing spent, as before', () => {
    const d = decided(B, r, settled, stuck, { spent });
    assert.deepEqual(answerLines(B, r, d, settled, stuck, asked, spent), {
      implement: 'to answer it, its cap raised above $4.00:  nemia retry r-1 implement --budget <amount> --message "<answer>"',
    });
    assert.deepEqual(answerLines(B, r, d, settled, stuck, asked), {
      implement: 'to answer it:  nemia retry r-1 implement --message "<answer>"',
    });
  });
});

test("`nemia ls`' costs: each step's tries' beside its word once measured, and the run's", async (t) => {
  const p = shown(REFUSED_TWICE);
  const done = signedOff({ implement: said('done') });
  const ls = (spent: SpendOf) => listed(BUDGETED, refusedTwice(), p, done, { verdict: () => 1, spent });
  await t.test('measured: beside the step and the run', () => {
    const l = ls(spends({ t0: 1, t1: 1.25 }));
    assert.deepEqual(
      [l.steps[0], l.steps[1], l.cost],
      [
        { name: 'implement', status: 'failed ✗ check (exit 1)', branch: null, note: 'try 3 due — retries: 2, 1 spent', cost: '$2.25' },
        { name: 'review', status: 'waiting', branch: null },
        '$2.25',
      ],
    );
  });
  await t.test('an ended attempt with none: `≥`, a part never read as the whole', () => {
    const partly: SpendOf = (id) =>
      id === 't0'
        ? { usd: 1, measured: 1, unmeasured: 0, budgetEnded: false }
        : id === 't1'
          ? { usd: 0, measured: 0, unmeasured: 1, budgetEnded: false }
          : undefined;
    const part = ls(partly);
    assert.deepEqual([part.steps[0].cost, part.cost], ['≥$1.00', '≥$1.00']);
  });
  await t.test('at its budget the word says it, and nothing beside it', () => {
    const over = ls(spends({ t0: 1.75, t1: 2.5 }));
    assert.deepEqual(
      [over.steps[0], over.cost],
      [{ name: 'implement', status: 'over budget $4.25 of $3', branch: null, note: 'try 2, by retries: 2' }, '$4.25'],
    );
  });
  for (const [name, none] of [
    ['nothing read', () => undefined],
    ['nothing measured', spends({}, [])],
  ] as Array<[string, SpendOf]>) {
    await t.test(`${name}: no cost at all`, () => {
      const bare = ls(none);
      assert.deepEqual(['cost' in bare, bare.steps.map((s) => 'cost' in s)], [false, [false, false]]);
    });
  }
});

test("costLine and runCostLines: a step's cost on `nemia decide`, beside the cap in force, and the run's", async (t) => {
  const B5: Workflow = { ...step('implement'), budget: 5 };
  const one = run({ implement: 't1' });
  const three = onTry(
    [
      { taskId: 't-a', then: 'retries' },
      { taskId: 't-b', then: 'nudge', budget: 10 },
    ],
    null,
  );
  const all = spends({ 't-a': 1.5, 't-b': 1.51, t1: 1.19 });
  const partly: SpendOf = (id) =>
    id === 't-a'
      ? { usd: 1.5, measured: 1, unmeasured: 0, budgetEnded: false }
      : id === 't-b'
        ? { usd: 0, measured: 0, unmeasured: 1, budgetEnded: false }
        : undefined;
  const read = { costUsd: 1.19, cacheReadTokens: 21_400_000, cacheWriteTokens: 412_000, uncachedTokens: 9, peakContextTokens: 167_000 };
  for (const [name, line, expected] of [
    [
      'one try, beside its budget',
      () => costLine(B5, one, 'implement', { costUsd: 3.012 }, spends({ t1: 3.012 })),
      'cost  $3.01 · budget $5',
    ],
    [
      'nothing measured, no budget',
      () => costLine(step('implement'), one, 'implement', { turns: 3 }, () => undefined),
      'cost  not measured',
    ],
    [
      'three tries: this one, theirs together, the raised cap',
      () => costLine(B5, three, 'implement', { costUsd: 1.19 }, all),
      'cost  $1.19 this try · $4.20 over 3 tries · budget $10',
    ],
    [
      'tries partly measured',
      () => costLine(B5, three, 'implement', undefined, partly),
      'cost  this try not measured · ≥$1.50 over 3 tries · budget $10',
    ],
    [
      'a recheck ran no session of its own',
      () =>
        costLine(
          step('implement'),
          onTry([{ taskId: 't1', check: { taskId: 'c0' }, then: 'recheck' }], 'c1'),
          'implement',
          { costUsd: 2 },
          spends({ t1: 2 }),
        ),
      'cost  $2.00',
    ],
    [
      'what the try read, after what it cost',
      () => costLine({ ...B5, context: 200_000 }, three, 'implement', read, all),
      'cost  $1.19 this try · read 21.4M · wrote 412k · peak 167k · $4.20 over 3 tries · budget $10',
    ],
    [
      "its peak against the step's context",
      () => costLine({ ...B5, context: 150_000 }, one, 'implement', read, all),
      'cost  $1.19 · read 21.4M · wrote 412k · peak 167k, at its 150k cap · budget $5',
    ],
    [
      'tokens counted, no cost',
      () => costLine(step('implement'), one, 'implement', { cacheReadTokens: 5, cacheWriteTokens: 0, uncachedTokens: 1 }, () => undefined),
      'cost  not measured · read 5 · wrote 0',
    ],
  ] as Array<[string, () => string, string]>) {
    await t.test(`costLine: ${name}`, () => assert.equal(line(), expected));
  }
  await t.test("runCostLines: the run's, measured, partly, not, and nothing ended", () => {
    assert.deepEqual(runCostLines(three, all), ['cost  run $4.20']);
    assert.deepEqual(runCostLines(three, partly), ['cost  run $1.50 measured · 1 attempt not measured']);
    assert.deepEqual(runCostLines(three, spends({}, ['t1'])), ['cost  run not measured']);
    assert.deepEqual(
      runCostLines(three, () => undefined),
      [],
    );
  });
});

test('REFUSED as a verdict past a budget: a check that did not finish reads failed (check), not over budget', async (t) => {
  const r = refusedTwice();
  const spent = spends({ t0: 1.75, t1: 2.5 });
  const cases: Array<[string, Record<string, TaskPhase>, Verdict | undefined]> = [
    ['stopped, with no verdict read', { ...REFUSED_TWICE, c1: 'stopped' }, undefined],
    ['failed with no exit code', REFUSED_TWICE, 'unfinished'],
  ];
  for (const [why, m, verdict] of cases) {
    const p = phases(m);
    const v = () => verdict;
    await t.test(`${why}: failed (check), the recheck offered first`, () => {
      assert.equal(stepStatus(BUDGETED[0], r, p, signedDone, asked, BUDGETED, spent, v), 'failed (check)');
      const a = assessed(BUDGETED, r, p, signedDone, { verdict: v, spent });
      assert.deepEqual([a.retry, a.blocked, a.status], [[], ['review'], 'failed']);
      const d = decided(BUDGETED, r, p, signedDone, { verdict: v, spent });
      assert.deepEqual(d.kind === 'awaiting' && [d.unfinishedCheck, d.failedCheck, d.overBudget], [['implement'], [], []]);
      const lines = retryLines(BUDGETED, r, d, p, signedDone, asked, spent, v);
      assert.equal(lines.length, 1);
      names(lines[0], 'implement:', 'no retry was spent', 'nemia retry r-1 implement --recheck', '--budget above $4.25', '$4.25 of $3');
      const l = listed(BUDGETED, r, shown(m), signedOff({ implement: said('done') }), { verdict: v, spent });
      assert.deepEqual([l.steps[0].status, l.steps[0].cost, l.waitingOnYou], ['failed ✗ check (unfinished)', '$4.25', ['implement']]);
    });
    await t.test(`${why}: the recheck costs nothing, a new session still needs \`--budget\``, () => {
      const refusal = (how: RetryHow) => retryRefusal(BUDGETED, r, 'implement', how, p, signedDone, asked, v, [], () => false, spent);
      assert.equal(refusal({ mode: 'recheck' }), null);
      names(
        refusal({ mode: 'nudge' }),
        "implement's check did not finish",
        '$4.25 of its $3 budget',
        'nemia retry r-1 implement --recheck',
        'above $4.25: nemia retry r-1 implement --budget <amount>',
      );
      names(refusal({ mode: 'nudge', budget: 4 }), '--budget 4 is not above $4.25', 'nemia retry r-1 implement --budget <amount>');
      assert.equal(refusal({ mode: 'fresh', budget: 10 }), null);
      assert.deepEqual(
        retriesDue(BUDGETED, r, p, signedDone, asked, v, [askFor(3)], () => false, spent),
        [],
      );
      assert.deepEqual(
        retriesDue(BUDGETED, r, p, signedDone, asked, v, [askFor(3, 'recheck')], () => false, spent),
        [{ step: 'implement', try: 3, mode: 'recheck', by: 'ask' }],
      );
    });
  }
  await t.test('the same step whose check refused is over budget: the verdict tells the two apart', () => {
    assert.equal(
      stepStatus(BUDGETED[0], r, phases(REFUSED_TWICE), signedDone, asked, BUDGETED, spent, () => 1),
      'over budget',
    );
  });
});

test('retrySection: a try past a budget is told why its last try ended, and that its budget was reached and raised', async (t) => {
  const brief = (status: StepStatus, budget?: number, pastCap: boolean = budget !== undefined) =>
    retrySection(step('implement'), {
      try: 2,
      by: 'ask',
      mode: 'nudge',
      resumed: true,
      status,
      ...(budget !== undefined ? { budget } : {}),
      ...(pastCap ? { pastCap: true as const } : {}),
    });
  await t.test('unsigned, past its cap: why it ended, then the budget reached and raised', () => {
    assert.match(
      brief('unsigned', 10),
      /^\n## Try 2\n\nThe last try ended without the closeout the run asked for, [^\n]*\nAnd this step's tries had together cost its budget or more, so the run filed nothing more for it until a person raised the cap\.\nA person asked for this try: `nemia retry --nudge --budget 10`, raising this step's budget to \$10\./,
    );
  });
  for (const [status, sentence] of [
    ['failed', /ended `failed` before it signed off/],
    ['stopped', /was stopped before it signed off/],
    ['blocked', /signed off `blocked`/],
    ['failed (check)', /check, and it did not pass/],
  ] as const) {
    await t.test(`${status}: its own end, and the budget beside it`, () => {
      assert.match(brief(status, 10), sentence);
      assert.match(brief(status, 10), /had together cost its budget or more/);
    });
  }
  await t.test('ended at its budget: said once; no raise: no budget; a raise under the cap: not past it', () => {
    const ended = brief('budget exhausted', 10);
    assert.match(ended, /ended by its harness at this step's budget/);
    assert.doesNotMatch(ended, /had together cost its budget or more/);
    assert.doesNotMatch(brief('unsigned'), /budget/);
    const under = brief('blocked', 40, false);
    assert.match(under, /raising this step's budget to \$40\./);
    assert.doesNotMatch(under, /had together cost/);
  });
  await t.test("what the tick hands the brief is the step's own status, not the word that held it", () => {
    const r = run({ implement: 't1', review: null });
    const p = phases({ t1: 'succeeded' });
    assert.deepEqual(
      [stepStatus(B[0], r, p, nothingSaid, asked, B, spends({ t1: 4 })), ownStatus(B[0], r, p, nothingSaid, asked, B, spends({ t1: 4 }))],
      ['over budget', 'unsigned'],
    );
  });
});

test('REFUSED to hide why a step stopped past its budget: failed, stopped or unsigned is named beside over budget', async (t) => {
  const r = run({ implement: 't1', review: null });
  const spent = spends({ t1: 3.4 });
  const cases: Array<[TaskPhase, 'failed' | 'unsigned', 'failed' | 'blocked']> = [
    ['failed', 'failed', 'failed'],
    ['stopped', 'failed', 'failed'],
    ['succeeded', 'unsigned', 'blocked'],
  ];
  for (const [phase, list, outcome] of cases) {
    await t.test(`its session ${phase}: both said, on its word, its offer and the OVER BUDGET line`, () => {
      const p = phases({ t1: phase });
      const own = phase === 'succeeded' ? 'unsigned' : phase;
      assert.deepEqual(
        [stepStatus(B[0], r, p, nothingSaid, asked, B, spent), ownStatus(B[0], r, p, nothingSaid, asked, B, spent)],
        ['over budget', own],
      );
      const d = decided(B, r, p, nothingSaid, { spent });
      assert.deepEqual(d.kind === 'awaiting' && [d.outcome, d[list], d.overBudget], [outcome, ['implement'], ['implement']]);
      assert.deepEqual(retryLines(B, r, d, p, nothingSaid, asked, spent), [
        `implement: over budget (${own}), $3.40 of $3. Raise its cap above $3.40 and continue its session:  nemia retry r-1 implement --budget <amount>  (--fresh, or --model <m>, for a new session)`,
      ]);
      assert.equal(
        overBudgetLine(B, r, d, spent),
        'OVER BUDGET, waiting on you: implement ($3.40 of $3)  — the run files nothing more for it on its own; nothing after it ran',
      );
    });
  }
  await t.test('read with nothing spent: no step over budget, no line', () => {
    assert.equal(overBudgetLine(B, r, decision(B, r, phases({ t1: 'failed' }), nothingShipped, nothingSaid, asked), spent), undefined);
  });
});
