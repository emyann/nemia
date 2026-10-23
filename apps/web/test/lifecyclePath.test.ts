/**
 * The Debug panel's reading of a task's path (`lib/lifecyclePath.ts`): when it is read again, the stamp that keys it by the step's state,
 * the state lit at a step of the path and the routes taken to reach it, and where the graph full width scrolls to show the lit state.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byPerson, centredScroll, litAt, PATH_POLL_MS, pathPoll, pathStamp, takenRoutes } from '../src/lib/lifecyclePath.ts';
import type { MachineEdge, MachineVerb } from '../src/lib/api/machines.ts';
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
  { from: 'working', event: 'ENDED', guard: 'holds', to: 'input-required', action: 'hold' },
  { from: 'ending', event: 'SETTLED', to: 'completed', action: 'none' },
  { from: 'stopping', event: 'SETTLED', to: 'canceled', action: 'none' },
];

/** The lifecycle's verbs as the runtime declares them: what a person writes from outside it. */
const VERBS: MachineVerb[] = [
  {
    verb: 'requestStop',
    entry: 'stop-requested',
    by: 'person',
    from: ['submitted', 'starting', 'working', 'input-required', 'ending'],
    to: 'stopping',
    guard: 'stoppable',
  },
  { verb: 'answer', entry: 'input', by: 'person', from: ['input-required'], to: 'submitted', guard: 'awaitsWord' },
  { verb: 'close', entry: 'closed', by: 'person', from: ['input-required'], to: 'ending', guard: 'awaitsWord' },
];

const GRAPH = { edges: EDGES, verbs: VERBS };

/** A review task held open after its turn, then closed by a person: input-required to ending at its `closed` entry. */
const closed = [...running, ...pathOf(['input-required', 'ended'], ['ending', 'closed'], ['completed', 'settled'])].map((s, i) => ({
  ...s,
  at: `c${i}`,
}));

test("pathPoll, pathStamp: when a task's path is read again, and the stamp that keys it", async (t) => {
  await t.test('the current try of a task still moving is read again every PATH_POLL_MS', () => {
    assert.equal(pathPoll(read(running), FINAL, true), PATH_POLL_MS);
    assert.equal(pathPoll(read([]), FINAL, true), PATH_POLL_MS, 'a task filed whose journal is not read yet');
  });
  await t.test(
    'REFUSED: a path is not polled once its task stands in a final state, for an earlier try, a step not filed, or before a read',
    () => {
      assert.equal(pathPoll(read(settled), FINAL, true), false, 'settled: completed is final');
      assert.equal(pathPoll(read(running), FINAL, false), false, 'an earlier try never moves');
      assert.equal(pathPoll(read([], null), FINAL, true), false, 'not filed: the feed says when it is');
      assert.equal(pathPoll(undefined, FINAL, true), false, 'nothing read yet');
      assert.equal(pathPoll(read(running), [], true), false, 'a machine whose final states are not known');
    },
  );
  await t.test('the stamp moves with the step’s task, its tries and its word, and with nothing else', () => {
    const step = { taskId: 't-1', tries: [{}], status: 'running', note: 'working' };
    const stamp = pathStamp(step);
    const noted = { ...step, note: 'something else' };
    assert.equal(pathStamp(noted), stamp);
    assert.notEqual(pathStamp({ ...step, status: 'succeeded' }), stamp, 'its word');
    assert.notEqual(pathStamp({ ...step, tries: [{}, {}] }), stamp, 'a try more');
    assert.notEqual(pathStamp({ ...step, taskId: 't-2' }), stamp, 'another task');
    assert.notEqual(pathStamp({ ...step, taskId: null }), stamp, 'no task');
  });
});

test("litAt, takenRoutes, byPerson: the state lit at the scrub, the routes taken to it, and the verb that names a person's move", async (t) => {
  await t.test('the state lit follows the scrub, and stays on the newest past the end', () => {
    assert.equal(litAt(settled, 0), 'submitted');
    assert.equal(litAt(settled, 2), 'working');
    assert.equal(litAt(settled, 4), 'completed');
    assert.equal(litAt(settled, 9), 'completed');
    assert.equal(litAt([], 0), undefined);
  });
  await t.test('the routes taken are the moves between states an edge makes, up to the scrub, and never a stay', () => {
    assert.deepEqual(takenRoutes(settled, 4, GRAPH), ['submitted->starting', 'starting->working', 'working->ending', 'ending->completed']);
    assert.deepEqual(takenRoutes(settled, 2, GRAPH), ['submitted->starting', 'starting->working']);
    assert.equal(takenRoutes(settled, 0, GRAPH).length, 0, 'at the filing, nothing taken');
    const admitted = pathOf(['submitted', 'filed'], ['submitted', 'admitted'], ['starting', 'starting']);
    assert.deepEqual(takenRoutes(admitted, 2, GRAPH), ['submitted->starting'], 'submitted to submitted is a stay, drawn on its box');
  });
  await t.test("a person's stop takes its verb's route, from the state it was taken in", () => {
    const stopped = [
      ...running,
      ...pathOf(['stopping', 'stop-requested'], ['stopping', 'ended'], ['canceled', 'settled']).map((s, i) => ({ ...s, at: `z${i}` })),
    ];
    assert.equal(litAt(stopped, 3), 'stopping');
    assert.deepEqual(takenRoutes(stopped, 5, GRAPH), [
      'submitted->starting',
      'starting->working',
      'working->stopping',
      'stopping->canceled',
    ]);
  });
  await t.test("a person's close takes its verb's route at its entry, and not before", () => {
    assert.equal(litAt(closed, 4), 'ending');
    assert.ok(takenRoutes(closed, 4, GRAPH).includes('input-required->ending'), 'at the closed entry');
    assert.ok(!takenRoutes(closed, 3, GRAPH).includes('input-required->ending'), 'at the entry before, held');
    assert.deepEqual(takenRoutes(closed, 5, GRAPH), [
      'submitted->starting',
      'starting->working',
      'working->input-required',
      'input-required->ending',
      'ending->completed',
    ]);
  });
  await t.test(
    "REFUSED: a move neither an edge nor a verb makes takes no route, a person's close in a graph without its verb included",
    () => {
      assert.ok(!takenRoutes(closed, 5, { edges: EDGES, verbs: [] }).includes('input-required->ending'));
      const leapt = pathOf(['submitted', 'filed'], ['completed', 'settled']);
      assert.equal(takenRoutes(leapt, 1, GRAPH).length, 0, 'submitted to completed: nothing joins them');
    },
  );
  await t.test("a person's move is named by the verb that journals its entry, from where it was taken to where it leads", () => {
    assert.equal(byPerson(closed, 4, VERBS), 'close');
    assert.equal(byPerson(closed, 3, VERBS), undefined, 'the turn ended: no person moved it');
    assert.equal(byPerson(closed, 0, VERBS), undefined, 'the filing moves nothing');
    const answered = pathOf(['input-required', 'ended'], ['submitted', 'input']);
    assert.equal(byPerson(answered, 1, VERBS), 'answer');
  });
  await t.test('REFUSED: a move is named by no verb whose entry is not the one that made it, or whose route is not the move', () => {
    const misnamed = pathOf(['input-required', 'ended'], ['ending', 'input']);
    assert.equal(byPerson(misnamed, 1, VERBS), undefined, 'the answer journals input, but leads to submitted, not ending');
    const elsewhere = pathOf(['stopping', 'ended'], ['ending', 'closed']);
    assert.equal(byPerson(elsewhere, 1, VERBS), undefined, 'a close is taken from input-required only');
    const stayed = pathOf(['stopping', 'stop-requested'], ['stopping', 'stop-requested']);
    assert.equal(byPerson(stayed, 1, VERBS), undefined, 'a stay is no move');
  });
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
