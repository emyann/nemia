/**
 * The tables of what a step's record and its tasks say of it (`status.ts`): what a task cost and what is left of a step's budget,
 * which acceptances are spent, and what a loop's target owes and was asked by. Pure: no disk, no engine, no clock.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askingTry, budgetOf, budgetUsdFor, owedFields, spentAcceptances, taskSpend, type RepositoryRun, type Run } from '../run.ts';
import { taskUsage, type TaskClock } from '../timeline/timeline.ts';
import type { EarlierTry } from '../retry/retry-ask.ts';
import type { OutputSchema, Workflow } from '../workflow.ts';
import { run, step } from '../../test/assessed.ts';

const clock = (m: number, s = 0) => new Date(Date.UTC(2026, 8, 13, 8, m, s)).toISOString();

test('taskSpend: what a task cost is the dollars on its attempts that are over', async (t) => {
  const attempt = (endedAt: string | null, reason: string | null, costUsd?: number, limit?: string) => ({
    startedAt: clock(0),
    spawnedAt: clock(0, 5),
    endedAt,
    reason,
    usage: costUsd === undefined ? null : { costUsd },
    ...(limit ? { limit } : {}),
  });
  const view = (settled: 'succeeded' | 'failed' | 'stopped' | null, ...attempts: Array<ReturnType<typeof attempt>>): TaskClock => ({
    state: { brief: 'filed', settled, attempts },
  });
  await t.test("the ended attempts' dollars, and the harness's cut read off the last attempt's `limit`", () => {
    assert.deepEqual(taskSpend(view('failed', attempt(clock(5), 'harness', 1.25), attempt(clock(9), 'harness', 3.5, 'budget'))), {
      usd: 4.75,
      measured: 2,
      unmeasured: 0,
      budgetEnded: true,
    });
  });
  await t.test('an earlier cut is not the last attempt’s, and a `budget` reason is no longer read', () => {
    const later = view('failed', attempt(clock(9), 'harness', 3.5, 'budget'), attempt(clock(12), 'harness', 0.5));
    assert.equal(taskSpend(later)!.budgetEnded, false);
    assert.equal(taskSpend(view('failed', attempt(clock(9), 'budget', 3.5)))!.budgetEnded, false);
  });
  await t.test('an attempt in flight is in neither count', () => {
    assert.deepEqual(taskSpend(view(null, attempt(clock(5), 'lost', 1.25), attempt(null, null))), {
      usd: 1.25,
      measured: 1,
      unmeasured: 0,
      budgetEnded: false,
    });
  });
  await t.test('an ended attempt with no cost is unmeasured, never $0; one that never started ran nothing', () => {
    assert.deepEqual(taskSpend(view('failed', attempt(clock(5), 'unstartable'), attempt(clock(9), 'harness'))), {
      usd: 0,
      measured: 0,
      unmeasured: 1,
      budgetEnded: false,
    });
  });
  await t.test('an attempt its task settled open is over; no task, no spend', () => {
    assert.deepEqual(taskSpend(view('stopped', attempt(null, null, 0.5))), { usd: 0.5, measured: 1, unmeasured: 0, budgetEnded: false });
    assert.equal(taskSpend(undefined), undefined);
  });
});

test("taskUsage: a step's usage counts the resumed attempts that rebuilt their cache", async (t) => {
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
  const cold = usage(900_000, 180_000, 180_000, 20_000, 20_000);
  const rewrote = usage(183_000, 184_500, 184_501, 183_006, 183_000);
  const read = usage(2_100_000, 9_000, 190_000, 181_000, 800);
  const view = (...attempts: object[]): TaskClock => ({
    state: { brief: 'b', attempts: attempts as TaskClock['state']['attempts'], settled: 'succeeded' },
  });
  await t.test('a resumed attempt that rewrote its cache is counted', () => {
    assert.equal(taskUsage(view(attempt(1, cold), attempt(2, rewrote, 'sess-1')))!.rebuiltCaches, 1);
  });
  await t.test('a first attempt wrote its cache once, and a resumed one that read it says nothing', () => {
    assert.equal('rebuiltCaches' in taskUsage(view(attempt(1, rewrote)))!, false);
    assert.equal('rebuiltCaches' in taskUsage(view(attempt(1, cold), attempt(2, read, 'sess-1')))!, false);
  });
});

test('budgetUsdFor and budgetOf: what is left of the cap in force goes to the engine', async (t) => {
  const capped: Workflow = { ...step('implement'), harness: 'claude', budget: 3 };
  const cost = (usd: number) => ({ usd, measured: 1, unmeasured: 0 });
  await t.test('nothing spent: the whole cap', () => {
    assert.equal(budgetUsdFor(budgetOf(capped, { taskId: 't1' })), 3);
  });
  await t.test('a try under the cap leaves the next what is left', () => {
    assert.equal(budgetUsdFor(3, cost(2.9)), 0.1);
    assert.equal(budgetUsdFor(budgetOf({ ...step('implement'), budget: 3 }, undefined), cost(1)), 2);
  });
  await t.test('a raised cap, less what was spent', () => {
    const raised = budgetOf(capped, { taskId: 't2', tries: [{ taskId: 't1', then: 'nudge', budget: 10 }] });
    assert.equal(budgetUsdFor(raised, cost(4.25)), 5.75);
  });
  await t.test('digits, rounded up to a millionth: never 0, which the engine refuses', () => {
    assert.equal(String(budgetUsdFor(3, cost(2.9999999))), '0.000001');
    assert.equal(String(budgetUsdFor(0.3, cost(0.1))), '0.2');
  });
  await t.test('no cap: none handed', () => {
    assert.equal(budgetUsdFor(undefined, cost(1)), undefined);
  });
});

/** A looping review and its target, the loop on round `n` with review unfiled. */
const LOOPING: OutputSchema = {
  type: 'object',
  properties: { findings: { type: 'array' }, again: { type: 'boolean' } },
  required: ['findings', 'again'],
  additionalProperties: false,
};
const LOOP: Workflow[] = [
  { ...step('implement'), check: 'npm test' },
  { ...step('review', ['implement']), output: { file: 'review.schema.json', schema: LOOPING }, loop: 'implement', rounds: 3 },
  step('ship', ['review']),
];
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
const reviewDue = (n: number): Run => {
  const r = inRound(n);
  return { ...r, steps: { ...r.steps, review: { taskId: null, tries: r.steps.review.tries } } };
};

test("a loop's target and a person's acceptance: what is owed, asked and spent", async (t) => {
  const accepted = { acceptances: [{ step: 'review', try: 3, at: '2026-09-20T14:05:00.000Z', message: 'enough' }] };
  await t.test('spentAcceptances: an acceptance is spent by the try after it, and not before', () => {
    assert.deepEqual(spentAcceptances(inRound(4, accepted)), accepted.acceptances);
    assert.deepEqual(spentAcceptances(inRound(3, accepted)), []);
  });
  await t.test('owedFields: `replies` owed from round 2, nothing on round 1', () => {
    assert.deepEqual(owedFields(LOOP[0], inRound(1), LOOP), []);
    assert.deepEqual(owedFields(LOOP[0], reviewDue(2), LOOP), ['replies']);
  });
  await t.test("askingTry: the looping step's try that asked, owed from round 2 by the target alone", () => {
    assert.deepEqual(askingTry(LOOP, reviewDue(2), 'implement'), { looping: LOOP[1], taskId: 'r1' });
    assert.equal(askingTry(LOOP, inRound(1), 'implement'), undefined);
    assert.equal(askingTry(LOOP, reviewDue(2), 'review'), undefined);
  });
});
