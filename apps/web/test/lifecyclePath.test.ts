/**
 * The Debug panel's reading of a task's path (`lib/lifecyclePath.ts`): when it is read again, the stamp that keys it by the step's state,
 * the state lit at a step of the path and the routes taken to reach it, and where the graph full width scrolls to show the lit state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centredScroll, litAt, PATH_POLL_MS, pathPoll, pathStamp, takenRoutes } from '../src/lib/lifecyclePath.ts';
import type { MachineEdge } from '../src/lib/api/machines.ts';
import type { LifecycleStep, StepPath } from '../src/lib/api/steps.ts';

const FINAL = ['completed', 'failed', 'canceled'];

/** A path through `states`, each moved by the entry named beside it. */
const pathOf = (...moves: Array<[string, string]>): LifecycleStep[] =>
  moves.map(([state, event], i) => ({ state, event, at: new Date(Date.UTC(2026, 8, 29, 8, 0, i)).toISOString() }));

const running = pathOf(['submitted', 'filed'], ['starting', 'starting'], ['working', 'spawned']);
const settled = [...running, ...pathOf(['ending', 'ended'], ['completed', 'settled'])];
const read = (path: LifecycleStep[], taskId: string | null = 't-1'): StepPath => ({ taskId, try: 1, path });

/** The lifecycle's edges as the runtime draws them, as much of them as these tests walk. */
const EDGES: MachineEdge[] = [
  { from: 'submitted', event: 'START', to: 'starting', action: 'spawn' },
  { from: 'submitted', event: 'TICK', to: 'submitted', action: 'wait' },
  { from: 'starting', event: 'SEEN', to: 'working', action: 'wait' },
  { from: 'working', event: 'ENDED', to: 'ending', action: 'settle' },
  { from: 'ending', event: 'SETTLED', to: 'completed', action: 'none' },
  { from: 'stopping', event: 'SETTLED', to: 'canceled', action: 'none' },
];

test('the current try of a task still moving is read again every PATH_POLL_MS', () => {
  assert.equal(pathPoll(read(running), FINAL, true), PATH_POLL_MS);
  assert.equal(pathPoll(read([]), FINAL, true), PATH_POLL_MS, 'a task filed whose journal is not read yet');
});

test('REFUSED: a path is not polled once its task stands in a final state, for an earlier try, a step not filed, or before a read', () => {
  assert.equal(pathPoll(read(settled), FINAL, true), false, 'settled: completed is final');
  assert.equal(pathPoll(read(running), FINAL, false), false, 'an earlier try never moves');
  assert.equal(pathPoll(read([], null), FINAL, true), false, 'not filed: the feed says when it is');
  assert.equal(pathPoll(undefined, FINAL, true), false, 'nothing read yet');
  assert.equal(pathPoll(read(running), [], true), false, 'a machine whose final states are not known');
});

test('the stamp moves with the step’s task, its tries and its word, and with nothing else', () => {
  const step = { taskId: 't-1', tries: [{}], status: 'running', note: 'working' };
  const stamp = pathStamp(step);
  const noted = { ...step, note: 'something else' };
  assert.equal(pathStamp(noted), stamp);
  assert.notEqual(pathStamp({ ...step, status: 'succeeded' }), stamp, 'its word');
  assert.notEqual(pathStamp({ ...step, tries: [{}, {}] }), stamp, 'a try more');
  assert.notEqual(pathStamp({ ...step, taskId: 't-2' }), stamp, 'another task');
  assert.notEqual(pathStamp({ ...step, taskId: null }), stamp, 'no task');
});

test('the state lit follows the scrub, and stays on the newest past the end', () => {
  assert.equal(litAt(settled, 0), 'submitted');
  assert.equal(litAt(settled, 2), 'working');
  assert.equal(litAt(settled, 4), 'completed');
  assert.equal(litAt(settled, 9), 'completed');
  assert.equal(litAt([], 0), undefined);
});

test('the routes taken are the moves between states an edge makes, up to the scrub, and never a stay', () => {
  assert.deepEqual(takenRoutes(settled, 4, EDGES), ['submitted->starting', 'starting->working', 'working->ending', 'ending->completed']);
  assert.deepEqual(takenRoutes(settled, 2, EDGES), ['submitted->starting', 'starting->working']);
  assert.equal(takenRoutes(settled, 0, EDGES).length, 0, 'at the filing, nothing taken');
  const admitted = pathOf(['submitted', 'filed'], ['submitted', 'admitted'], ['starting', 'starting']);
  assert.deepEqual(takenRoutes(admitted, 2, EDGES), ['submitted->starting'], 'submitted to submitted is a stay, drawn on its box');
});

test("a person's move, which no edge makes, is lit as a state and taken as no route", () => {
  const stopped = [
    ...running,
    ...pathOf(['stopping', 'stop-requested'], ['stopping', 'ended'], ['canceled', 'settled']).map((s, i) => ({ ...s, at: `z${i}` })),
  ];
  assert.equal(litAt(stopped, 3), 'stopping');
  assert.deepEqual(takenRoutes(stopped, 5, EDGES), ['submitted->starting', 'starting->working', 'stopping->canceled']);
});

test('REFUSED: the graph full width scrolls only to a lit state drawn out of view, and then centres it', () => {
  const view = { top: 100, height: 600 };
  assert.equal(centredScroll(view, { top: 300, height: 80 }, 0), null, 'whole in view: no scroll');
  assert.equal(centredScroll(view, { top: 100, height: 600 }, 50), null, 'filling the view exactly: no scroll');
  assert.equal(centredScroll(view, { top: 300, height: 0 }, 0), undefined, 'not laid out yet: nothing to scroll to');
  assert.equal(centredScroll(view, { top: 1200, height: 80 }, 0), 1240 - 400, 'below the view: its middle to the view’s');
  assert.equal(centredScroll(view, { top: 660, height: 80 }, 20), 20 + 700 - 400, 'cut by the bottom edge: scrolled too');
  assert.equal(centredScroll(view, { top: 60, height: 80 }, 300), 300 + 100 - 400, 'cut by the top edge: scrolled back');
  assert.equal(centredScroll(view, { top: -500, height: 80 }, 100), 0, 'never above the top');
});
