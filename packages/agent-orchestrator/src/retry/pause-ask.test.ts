/**
 * The ask `wf pause --now` writes for each task it stops (`interrupted`): due only on that very task, still the step's current one and
 * settled `stopped`, never with a stop first; void, and set aside by the tick, once its task ended any other way, a later try replaced
 * it, or its step went over its budget. Each refusing fixture is one on which a person's ask of the same mode would be due.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Run, TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import type { SpendOf } from '../status/status.ts';
import { nextTry, type RetryAsk } from './retry-ask.ts';
import { pauseAskVoid, pauseAsksVoid, retriesDue, tryNote } from './retry.ts';
import { retrySection } from '../brief/brief-sections.ts';

const IMPLEMENT: Workflow = { name: 'implement', after: [], body: 'do it', check: 'npm test' };

/** A run whose implement is on its first try: its session `taskId`, and its check's where one is given. */
const runOn = (taskId: string, check?: string): Run => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc',
  branch: 'main',
  isolate: true,
  brief: 'b',
  workflowDir: '/wf',
  createdAt: '2026-10-04T00:00:00Z',
  steps: { implement: { taskId, ...(check ? { check: { taskId: check } } : {}) } },
});

const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';

/** The ask a pause writes for try 2 of implement: a nudge of the session it stopped, or a recheck of the check. */
const pauseAsk = (interrupted: string, mode: 'nudge' | 'recheck' = 'nudge'): RetryAsk => ({
  step: 'implement',
  try: 2,
  mode,
  interrupted,
  at: '2026-10-04T12:00:00Z',
});

/** A person's ask of the same try and mode: what is due where a pause's is not, so each fixture refuses on the rule alone. */
const ownAsk = (mode: 'nudge' | 'recheck' = 'nudge'): RetryAsk => ({ step: 'implement', try: 2, mode, at: '2026-10-04T12:00:00Z' });

const due = (run: Run, phaseOf: (id: string) => TaskPhase, ask: RetryAsk, spendOf?: SpendOf, verdict?: number) =>
  retriesDue(
    [IMPLEMENT],
    run,
    phaseOf,
    undefined,
    undefined,
    () => verdict,
    [ask],
    () => false,
    spendOf,
  );

test('a pause ask is due on the session it stopped, once settled stopped, on the pause word and with no stop first', () => {
  const p = phases({ t1: 'stopped' });
  assert.deepEqual(due(runOn('t1'), p, pauseAsk('t1')), [{ step: 'implement', try: 2, mode: 'nudge', by: 'pause' }]);
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t1'), pauseAsk('t1'), p), false);
});

test('a pause ask is not due while its session still runs, and is not void: a person ask would stop it first', () => {
  const p = phases({ t1: 'running' });
  assert.equal(due(runOn('t1'), p, ownAsk())[0]?.stopFirst, true, 'the fixture: a person ask is due with a stop first');
  assert.deepEqual(due(runOn('t1'), p, pauseAsk('t1')), []);
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t1'), pauseAsk('t1'), p), false);
});

test('a pause ask on a session that failed on its own is not due, and is void', () => {
  const p = phases({ t1: 'failed' });
  assert.equal(due(runOn('t1'), p, ownAsk()).length, 1, 'the fixture: a person nudge of a failed session is due');
  assert.deepEqual(due(runOn('t1'), p, pauseAsk('t1')), []);
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t1'), pauseAsk('t1'), p), true);
});

test('a pause ask on a session that succeeded on its own is void', () => {
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t1', 'c1'), pauseAsk('t1'), phases({ t1: 'succeeded', c1: 'succeeded' })), true);
});

test('a pause ask whose task is no longer the step current one is not due, and is void', () => {
  const p = phases({ t1: 'stopped', t2: 'stopped' });
  assert.equal(due(runOn('t2'), p, ownAsk()).length, 1, 'the fixture: a person nudge of a stopped session is due');
  assert.deepEqual(due(runOn('t2'), p, pauseAsk('t1')), []);
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t2'), pauseAsk('t1'), p), true);
  assert.deepEqual(pauseAsksVoid([IMPLEMENT], runOn('t2'), [pauseAsk('t1'), ownAsk()], p), [pauseAsk('t1')]);
});

test('a pause ask rechecks the check it stopped, and is void once that check exited with a number', () => {
  const stopped = phases({ t1: 'succeeded', c1: 'stopped' });
  assert.deepEqual(due(runOn('t1', 'c1'), stopped, pauseAsk('c1', 'recheck')), [
    { step: 'implement', try: 2, mode: 'recheck', by: 'pause' },
  ]);
  const refused = phases({ t1: 'succeeded', c1: 'failed' });
  assert.equal(due(runOn('t1', 'c1'), refused, ownAsk('recheck'), undefined, 1).length, 1, 'the fixture: a person recheck is due');
  assert.deepEqual(due(runOn('t1', 'c1'), refused, pauseAsk('c1', 'recheck'), undefined, 1), []);
  assert.equal(pauseAskVoid(IMPLEMENT, runOn('t1', 'c1'), pauseAsk('c1', 'recheck'), refused), true);
});

test('a pause ask on a step its stopped session took over its budget is void', () => {
  const step: Workflow = { ...IMPLEMENT, budget: 1 };
  const spent: SpendOf = (id) => (id === 't1' ? { usd: 2, measured: 1, unmeasured: 0, budgetEnded: false } : undefined);
  const p = phases({ t1: 'stopped' });
  assert.equal(pauseAskVoid(step, runOn('t1'), pauseAsk('t1'), p, spent), true);
  assert.equal(pauseAskVoid(step, runOn('t1'), pauseAsk('t1'), p), false, 'under its budget, the same ask stands');
});

test('the try a pause filed keeps its mode, is marked paused, and is said as the pause', () => {
  const record = nextTry(runOn('t1').steps.implement, { step: 'implement', try: 2, mode: 'nudge', by: 'pause' }, 't2');
  assert.deepEqual(record.tries, [{ taskId: 't1', then: 'nudge', paused: true }]);
  assert.equal(tryNote(IMPLEMENT, record), 'try 2, continued after wf pause --now');
});

test('the brief of a try the pause filed says the pause stopped its session and the run filed the try, never a person', () => {
  const brief = retrySection(IMPLEMENT, { try: 2, by: 'pause', mode: 'nudge', resumed: true, status: 'stopped' });
  assert.match(
    brief,
    /The store was paused at once \(`wf pause --now`\), which stopped this session before it signed off; once resumed, the run filed/,
  );
  assert.doesNotMatch(brief, /A person asked for this try/);
});
