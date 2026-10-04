/**
 * The store's cordon as `assess` reads it — nothing due, what would be named in `cordoned`, the rest of the judgement as without it — and
 * its words. Pure: no disk, no engine.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assess } from '../tick/assess.ts';
import type { GitRun, TaskPhase } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';
import { cordonLines, cordonWords, type Cordon } from './cordon.ts';

const CORDON: Cordon = { at: '2026-10-04T12:00:00.000Z', by: 'ann', why: 'merging by hand' };
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

test('under the cordon a step ready and a check due are not due, and are named in `cordoned`; the rest is judged as without it', () => {
  const steps = [step('implement', [], { check: 'npm test' }), step('review', ['implement']), step('docs')];
  const r = run({ implement: { taskId: 't1' }, review: { taskId: null }, docs: { taskId: null } });
  const free = assess(steps, r, phases({ t1: 'succeeded' }), signed, asked);
  assert.deepEqual([free.check, free.ready], [['implement'], ['docs']], 'without it, the check and docs are due');
  const held = assess(steps, { ...r, cordon: CORDON }, phases({ t1: 'succeeded' }), signed, asked);
  assert.deepEqual(held, {
    ...free,
    ready: [],
    check: [],
    cordoned: { steps: ['docs', 'implement'], checks: ['implement'] },
  });
});

test('under the cordon a try a person asked for is not due, and the step it asks of is still running', () => {
  const steps = [step('implement'), step('review', ['implement'])];
  const r = run({ implement: { taskId: 't1' }, review: { taskId: null } });
  const ask = { step: 'implement', try: 2, mode: 'fresh' as const, at: '2026-10-04T12:00:00.000Z' };
  const free = assess(steps, r, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
  assert.equal(free.retry.length, 1, 'without it, the try is due');
  const held = assess(steps, { ...r, cordon: CORDON }, phases({ t1: 'failed' }), signed, asked, undefined, [ask]);
  assert.deepEqual(held, { ...free, retry: [], cordoned: { steps: ['implement'], checks: [] } });
  assert.equal(held.status, 'running', 'a run asked to go on is not failed while it waits for the lift');
});

test('a run the cordon holds nothing of is judged as without it', () => {
  const steps = [step('implement')];
  const r = run({ implement: { taskId: 't1' } });
  assert.deepEqual(
    assess(steps, { ...r, cordon: CORDON }, phases({ t1: 'running' }), signed, asked),
    assess(steps, r, phases({ t1: 'running' }), signed, asked),
  );
});

test('the cordon says since when, by whom, why, and how it is lifted; and each landing it holds with its merge staged', () => {
  assert.equal(
    cordonWords(CORDON),
    'the store is cordoned since 2026-10-04T12:00:00.000Z by ann: merging by hand — nothing new starts, and what runs finishes; wf uncordon lifts it',
  );
  assert.deepEqual(cordonLines({ cordon: { at: '', by: '' }, staged: [{ run: 'r-1', step: 'ship', repo: '/repo' }] }), [
    'the store is cordoned since a time its file no longer says by someone its file no longer names — nothing new starts, and what runs finishes; wf uncordon lifts it',
    "   r-1's ship has its merge staged in /repo (MERGE_HEAD), and its check waits on wf uncordon",
  ]);
  assert.deepEqual(cordonLines({ cordon: null, staged: [] }), []);
});
