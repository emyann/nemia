/**
 * The tables of what a step's record and its tasks say of it (`status.ts`): what a task cost and what is left of a step's budget,
 * which acceptances are spent, and what a loop's target owes and was asked by. Pure: no disk, no engine, no clock.
 */
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { askingTry, budgetOf, budgetUsdFor, owedFields, spentAcceptances, taskSpend, type RepositoryRun, type Run } from '../run.ts';
import { taskUsage, type AttemptReason, type TaskClock } from '../timeline/timeline.ts';
import type { EarlierTry } from '../retry/retry-ask.ts';
import type { OutputSchema, StepSpec } from '../workflow.ts';
import { closeoutHashOf, type Closeout } from '../closeout/index.ts';
import { keptDeclared } from '../pinned/pinned.ts';
import { addSpend, spentWord } from './status.ts';
import { spentOf } from '../summary/judged.verb.ts';
import { run, step } from '../../test/assessed.ts';

const clock = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 8, m, s)).toISOString();

describe('taskSpend: what a task cost is the dollars on its attempts that are over', () => {
  const attempt = (endedAt: string | null, reason: AttemptReason | null, costUsd?: number, limit?: string) => ({
    startedAt: clock(0),
    spawnedAt: clock(0, 5),
    endedAt,
    reason,
    usage: costUsd === undefined ? null : { costUsd },
    ...(limit ? { limit } : {}),
  });
  const view = (settled: 'succeeded' | 'failed' | 'stopped' | null, ...attempts: Array<ReturnType<typeof attempt>>) =>
    ({
      state: { brief: 'filed', settled, attempts },
    }) satisfies TaskClock;
  test("the ended attempts' dollars, and the harness's cut read off the last attempt's `limit`", () => {
    assert.deepEqual(taskSpend(view('failed', attempt(clock(5), 'harness', 1.25), attempt(clock(9), 'harness', 3.5, 'budget'))), {
      usd: 4.75,
      measured: 2,
      unmeasured: 0,
      budgetEnded: true,
    });
  });
  test('an earlier cut is not the last attempt’s, and a `budget` reason is no longer read', () => {
    const budgetAsReasonAgainstItsType = 'budget' as AttemptReason;
    const later = view('failed', attempt(clock(9), 'harness', 3.5, 'budget'), attempt(clock(12), 'harness', 0.5));
    assert.equal(taskSpend(later)!.budgetEnded, false);
    assert.equal(taskSpend(view('failed', attempt(clock(9), budgetAsReasonAgainstItsType, 3.5)))!.budgetEnded, false);
  });
  test('an attempt in flight is in neither count', () => {
    assert.deepEqual(taskSpend(view(null, attempt(clock(5), 'lost', 1.25), attempt(null, null))), {
      usd: 1.25,
      measured: 1,
      unmeasured: 0,
      budgetEnded: false,
    });
  });
  test('an ended attempt with no cost is unmeasured, never $0; one that never started ran nothing', () => {
    assert.deepEqual(taskSpend(view('failed', attempt(clock(5), 'unstartable'), attempt(clock(9), 'harness'))), {
      usd: 0,
      measured: 0,
      unmeasured: 1,
      budgetEnded: false,
    });
  });
  test('an attempt at work adds what its harness said it has spent so far as `live`, never into the measured dollars', () => {
    const spent = { usd: 16.26, at: clock(10) };
    assert.deepEqual(taskSpend({ ...view(null, attempt(null, null)), spent }), {
      usd: 0,
      measured: 0,
      unmeasured: 0,
      live: spent,
      budgetEnded: false,
    });
    assert.equal(taskSpend(view(null, attempt(null, null)))!.live, undefined, 'a session that said nothing, with no cap, stays unmeasured');
  });
  test('an attempt that has ended shows its measured cost, never the live figure a view still carries', () => {
    const spent = { usd: 16.26, at: clock(10) };
    assert.deepEqual(taskSpend({ ...view('succeeded', attempt(clock(11), 'harness', 16.4)), spent }), {
      usd: 16.4,
      measured: 1,
      unmeasured: 0,
      budgetEnded: false,
    });
  });
  test('an attempt its task settled open is over; no task, no spend', () => {
    assert.deepEqual(taskSpend(view('stopped', attempt(null, null, 0.5))), { usd: 0.5, measured: 1, unmeasured: 0, budgetEnded: false });
    assert.equal(taskSpend(undefined), undefined);
  });
});

describe("a step's spend across its tries: a try continued at work adds its live figure to the earlier tries' measured cost, so far", () => {
  const attempt = (endedAt: string | null, costUsd?: number) => ({
    startedAt: clock(0),
    spawnedAt: clock(0, 5),
    endedAt,
    reason: endedAt ? ('harness' as const) : null,
    usage: costUsd === undefined ? null : { costUsd },
  });
  const tryOne: TaskClock = { state: { brief: 'filed', settled: 'failed', attempts: [attempt(clock(5), 16.06)] } };
  const tryTwo: TaskClock = { state: { brief: 'filed', settled: null, attempts: [attempt(null)] }, spent: { usd: 16.26, at: clock(30) } };
  test('the measured tries stay `usd`; `said` reads them and the live figure together, so far', () => {
    const spend = addSpend([taskSpend(tryOne), taskSpend(tryTwo)]);
    assert.deepEqual(spentOf(spend), {
      usd: 16.06,
      measured: 1,
      unmeasured: 0,
      live: { usd: 16.26, at: clock(30) },
      said: '$32.32 so far',
    });
  });
  test('two tries at work add their live figures, at the later time', () => {
    const other: TaskClock = { ...tryTwo, spent: { usd: 1, at: clock(40) } };
    assert.deepEqual(addSpend([taskSpend(tryTwo), taskSpend(other)]).live, { usd: 17.26, at: clock(40) });
  });
  test('with no live figure and nothing measured there is no spend; with no live figure, the measured word is unchanged', () => {
    const silent: TaskClock = { state: tryTwo.state };
    assert.equal(spentOf(addSpend([taskSpend(silent)])), null);
    assert.equal(spentWord(addSpend([taskSpend(tryOne), taskSpend(silent)])), '$16.06');
  });
});

describe("taskUsage: a step's usage counts the resumed attempts that rebuilt their cache", () => {
  let cold!: ReturnType<typeof usage>;
  let rewrote!: ReturnType<typeof usage>;
  let read!: ReturnType<typeof usage>;
  beforeAll(() => {
    cold = usage(900_000, 180_000, 180_000, 20_000, 20_000);
    rewrote = usage(183_000, 184_500, 184_501, 183_006, 183_000);
    read = usage(2_100_000, 9_000, 190_000, 181_000, 800);
  });
  const at = (n: number) => `2026-09-18T09:0${n}:00Z`;
  const attempt = (n: number, usage: object, resumeFrom?: string) => ({
    startedAt: at(n),
    spawnedAt: at(n),
    endedAt: at(n + 1),
    reason: 'harness',
    usage,
    ...(resumeFrom ? { resumeFrom } : {}),
  });
  const usage = (read: number, write: number, peak: number, first: number, firstWrite: number) => ({
    cacheReadTokens: read,
    cacheWriteTokens: write,
    peakContextTokens: peak,
    firstContextTokens: first,
    firstCacheWriteTokens: firstWrite,
  });
  const view = (...attempts: object[]) =>
    ({
      state: { brief: 'b', attempts: attempts as TaskClock['state']['attempts'], settled: 'succeeded' },
    }) satisfies TaskClock;
  test('a resumed attempt that rewrote its cache is counted', () => {
    assert.equal(taskUsage(view(attempt(1, cold), attempt(2, rewrote, 'sess-1')))!.rebuiltCaches, 1);
  });
  test('a first attempt wrote its cache once, and a resumed one that read it says nothing', () => {
    assert.equal('rebuiltCaches' in taskUsage(view(attempt(1, rewrote)))!, false);
    assert.equal('rebuiltCaches' in taskUsage(view(attempt(1, cold), attempt(2, read, 'sess-1')))!, false);
  });
});

describe('budgetUsdFor and budgetOf: what is left of the cap in force goes to the engine', () => {
  const capped: StepSpec = { ...step('implement'), harness: 'claude', budget: 3 };
  const onRecord = (record?: Run['steps'][string]) =>
    ({ id: 'r1', brief: 'b', workflowDir: '/w', createdAt: 'x', steps: record ? { implement: record } : {} }) as Run;
  const cost = (usd: number) => ({ usd, measured: 1, unmeasured: 0 });
  test('nothing spent: the whole cap', () => {
    assert.equal(budgetUsdFor(budgetOf(capped, onRecord({ taskId: 't1' }))), 3);
  });
  test('a try under the cap leaves the next what is left', () => {
    assert.equal(budgetUsdFor(3, cost(2.9)), 0.1);
    assert.equal(budgetUsdFor(budgetOf({ ...step('implement'), budget: 3 }, onRecord()), cost(1)), 2);
  });
  test('a raised cap, less what was spent', () => {
    const raised = budgetOf(capped, onRecord({ taskId: 't2', tries: [{ taskId: 't1', cause: 'continue', budget: 10 }] }));
    assert.equal(budgetUsdFor(raised, cost(4.25)), 5.75);
  });
  test('digits, rounded up to a millionth: never 0, which the engine refuses', () => {
    assert.equal(String(budgetUsdFor(3, cost(2.9999999))), '0.000001');
    assert.equal(String(budgetUsdFor(0.3, cost(0.1))), '0.2');
  });
  test('no cap: none handed', () => {
    assert.equal(budgetUsdFor(undefined, cost(1)), undefined);
  });
});

/** A closeout that gave `output`. */
const gave = (output: Record<string, unknown>) => ({ outcome: 'done', summary: 'did it', artifacts: [], output }) satisfies Closeout;
/** A schema of `fields`, each a required string. */
const schemaOf = (...fields: string[]) =>
  ({
    type: 'object',
    properties: Object.fromEntries(fields.map((f) => [f, { type: 'string' }])),
    required: fields,
    additionalProperties: false,
  }) satisfies OutputSchema;
/** `implement` as a revision followed after its try was filed declares it: `goal` and a new `why`. */
const GROWN: StepSpec[] = [{ ...step('implement'), output: { file: 'implement.schema.json', schema: schemaOf('goal', 'why') } }];
/** The same step as it was filed: `goal` alone. */
const FILED: StepSpec[] = [{ ...step('implement'), output: { file: 'implement.schema.json', schema: schemaOf('goal') } }];
/** A run on `GROWN` whose `implement` try's record says `record` of its filing, as `runRecord` reads it (`keptDeclared`). */
const filedAs = (record: { declared?: string[]; closeoutHash?: string }) =>
  keptDeclared(run({ implement: 'i1' }, { steps: { implement: { taskId: 'i1', ...record } }, workflow: GROWN })) satisfies Run;

/** A looping review and its target, the loop on round `n` with review unfiled. */
const LOOPING: OutputSchema = {
  type: 'object',
  properties: { findings: { type: 'array' }, again: { type: 'boolean' } },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const LOOP: StepSpec[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
const inRound = (n: number, extra: Partial<RepositoryRun> = {}) => {
  const earlier = (prefix: string, checked: boolean) =>
    Array.from({ length: n - 1 }, (_, k) => ({
      taskId: `${prefix}${k + 1}`,
      ...(checked ? { check: { taskId: `c${k + 1}` } } : {}),
      cause: 'round' as const,
    })) satisfies EarlierTry[];
  const tries = (t: EarlierTry[]) => (t.length ? { tries: t } : {});
  const steps = {
    implement: { taskId: `i${n}`, check: { taskId: `c${n}` }, ...tries(earlier('i', true)) },
    review: { taskId: `r${n}`, ...tries(earlier('r', false)) },
    ship: { taskId: null },
  };
  return run({}, { steps, ...extra }) satisfies Run;
};
const reviewDue = (n: number) => {
  const r = inRound(n);
  const due: Run = { ...r, steps: { ...r.steps, review: { taskId: null, tries: r.steps.review.tries } } };
  return due;
};

describe("a loop's target and a person's acceptance: what is owed, asked and spent", () => {
  const accepted = { acceptances: [{ step: 'review', try: 3, at: '2026-09-20T14:05:00.000Z', message: 'enough' }] };
  test('spentAcceptances: an acceptance is spent by the try after it, and not before', () => {
    assert.deepEqual(spentAcceptances(inRound(4, accepted)), accepted.acceptances);
    assert.deepEqual(spentAcceptances(inRound(3, accepted)), []);
  });
  test('owedFields: `replies` owed from round 2, nothing on round 1', () => {
    assert.deepEqual(owedFields(LOOP[0], inRound(1), LOOP, gave({})), []);
    assert.deepEqual(owedFields(LOOP[0], reviewDue(2), LOOP, gave({})), ['replies']);
  });
  test("owedFields: a loop's target in round 2 owes what it was filed with, then `replies`", () => {
    const r = reviewDue(2);
    const filed = { ...r, steps: { ...r.steps, implement: { ...r.steps.implement, declared: ['goal'] } } };
    assert.deepEqual(owedFields(GROWN[0], filed, [GROWN[0], ...LOOP.slice(1)], gave({})), ['goal', 'replies']);
  });
  test("askingTry: the looping step's try that asked, owed from round 2 by the target alone", () => {
    assert.deepEqual(askingTry(LOOP, reviewDue(2), 'implement'), { looping: LOOP[1], taskId: 'r1' });
    assert.equal(askingTry(LOOP, inRound(1), 'implement'), undefined);
    assert.equal(askingTry(LOOP, reviewDue(2), 'review'), undefined);
  });
});

describe('owedFields: a try owes the fields it was filed with, never those a revision followed later adds', () => {
  let grown!: StepSpec;
  beforeAll(() => {
    grown = GROWN[0];
  });
  test('a record that kept its fields owes them, though its step declares more now', () => {
    assert.deepEqual(owedFields(grown, filedAs({ declared: ['goal'] }), GROWN, gave({ goal: 'g' })), ['goal']);
  });
  test('a record that kept no fields, whose schema has not moved, owes what its step declares now', () => {
    const unmoved = filedAs({ closeoutHash: closeoutHashOf(grown, GROWN) });
    assert.deepEqual(owedFields(grown, unmoved, GROWN, gave({ goal: 'g' })), ['goal', 'why']);
  });
  test('a record that kept no fields and no digest owes what its step declares now', () => {
    assert.deepEqual(owedFields(grown, filedAs({}), GROWN, gave({ goal: 'g' })), ['goal', 'why']);
  });
  test("a record that kept no fields, whose schema has moved, owes those of today's fields its closeout gave, in their order", () => {
    const moved = filedAs({ closeoutHash: closeoutHashOf(FILED[0], FILED) });
    assert.deepEqual(owedFields(grown, moved, GROWN, gave({ why: 'w', goal: 'g', other: 'o' })), ['goal', 'why']);
    assert.deepEqual(owedFields(grown, moved, GROWN, gave({ goal: 'g' })), ['goal']);
  });
});
