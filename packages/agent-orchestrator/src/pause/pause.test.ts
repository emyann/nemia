/**
 * The store's pause as `assess` reads it — nothing due, what would be named in `paused`, the rest of the judgement as without it — and
 * its words. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../tick/assess.ts';
import type { GitRun, TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { pausedLines, pauseWords, type Pause } from './pause.ts';

const PAUSE: Pause = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
const step = (name: string, after: string[] = [], more: Partial<Workflow> = {}): Workflow => ({ name, after, body: `do ${name}`, ...more });
const run = (steps: GitRun['steps'], rest: Partial<GitRun> = {}): GitRun => ({
  id: 'r-1',
  repo: '/repo',
  workspace: '/wt',
  baseRef: 'abc123',
  branch: 'main',
  isolate: true,
  brief: 'add a flag',
  workflowDir: '/wf',
  createdAt: '2026-01-01T00:00:00Z',
  steps,
  ...rest,
});
const phases = (m: Record<string, TaskPhase>) => (id: string) => m[id] ?? 'unknown';
const signed = () => ({ outcome: 'done' as const, summary: 's', artifacts: [], needs: undefined });
const asked = () => true;

test('under the pause a step ready and a check due are not due, and are named in `paused`; the rest is judged as without it', () => {
  const steps = [step('implement', [], { check: 'npm test' }), step('review', ['implement']), step('docs')];
  const r = run({ implement: { taskId: 't1' }, review: { taskId: null }, docs: { taskId: null } });
  const free = assess(steps, r, phases({ t1: 'succeeded' }), signed, asked);
  assert.deepEqual([free.check, free.ready], [['implement'], ['docs']], 'without it, the check and docs are due');
  const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'succeeded' }), signed, asked);
  assert.deepEqual(held, {
    ...free,
    ready: [],
    check: [],
    paused: { steps: ['docs', 'implement'], checks: ['implement'] },
  });
});

test('under the pause a try a person asked for is not due, and the step it asks of is still running', () => {
  const steps = [step('implement'), step('review', ['implement'])];
  const r = run({ implement: { taskId: 't1' }, review: { taskId: null } });
  const ask = { step: 'implement', try: 2, mode: 'fresh' as const, at: '2026-10-04T12:00:00.000Z' };
  const free = assess(steps, r, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
  assert.equal(free.retry.length, 1, 'without it, the try is due');
  const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
  assert.deepEqual(held, { ...free, retry: [], paused: { steps: ['implement'], checks: [] } });
  assert.equal(held.status, 'running', 'a run asked to go on is not failed while it waits for the lift');
});

test('under the pause a round its loop asks for is not due, and the looping step is still running', () => {
  const steps = [step('implement'), step('review', ['implement'], { loop: 'implement', rounds: 3 })];
  const r = run({ implement: { taskId: 't1' }, review: { taskId: 't2' } });
  const again = (name: string) => (name === 'review' ? { ...signed(), output: { again: true } } : signed());
  const free = assess(steps, r, phases({ t1: 'succeeded', t2: 'succeeded' }), again, asked);
  assert.deepEqual(
    free.round.map((d) => [d.step, d.target]),
    [['review', 'implement']],
    'without it, the round is due',
  );
  const held = assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'succeeded', t2: 'succeeded' }), again, asked);
  assert.deepEqual(held, { ...free, round: [], paused: { steps: ['review'], checks: [] } });
  assert.equal(held.status, 'running', 'a run whose loop goes round again is not over while it waits for the lift');
});

test('a run the pause holds nothing of is judged as without it', () => {
  const steps = [step('implement')];
  const r = run({ implement: { taskId: 't1' } });
  assert.deepEqual(
    assess(steps, { ...r, pause: PAUSE }, phases({ t1: 'running' }), signed, asked),
    assess(steps, r, phases({ t1: 'running' }), signed, asked),
  );
});

test('the pause says since when, by whom, why, and how it is lifted; and each landing it holds with its merge staged', () => {
  assert.equal(
    pauseWords(PAUSE),
    'the store is paused since 2026-10-04T12:00:00.000Z by ann: merging by hand — nothing new starts, and what runs finishes; wf resume lifts it',
  );
  assert.deepEqual(pausedLines({ pause: { at: '', by: '' }, staged: [{ run: 'r-1', step: 'ship', repo: '/repo' }] }), [
    'the store is paused since a time its file no longer says by someone its file no longer names — nothing new starts, and what runs finishes; wf resume lifts it',
    "   r-1's ship has its merge staged in /repo (MERGE_HEAD), and its check waits on wf resume",
  ]);
  assert.deepEqual(pausedLines({ pause: null, staged: [] }), []);
});
