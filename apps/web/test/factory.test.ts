import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import {
  byAge,
  CELL_HEIGHT,
  CELL_WIDTH,
  GRID_COLUMNS,
  inFlight,
  keepLayout,
  placeRuns,
  repoName,
  stepInFlight,
  titleOf,
} from '../src/lib/factory.ts';

/** A run with one step per status, filed unless it is still waiting. */
const run = (statuses: readonly string[], extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  brief: 'Do the thing',
  createdAt: '2026-09-13T00:00:00.000Z',
  cancelledAt: null,
  steps: statuses.map((status, i) => ({ name: `step-${i}`, taskId: status === 'waiting' ? null : `t-${i}`, branch: null, status })),
  waitingOnYou: [],
  ...extra,
});

const cancelledAt = '2026-09-13T01:00:00.000Z';

test('a run shows by default while any step is still to move', () => {
  const shown: Array<[string, RunSummary]> = [
    ['started, nothing filed yet', run(['waiting', 'waiting'])],
    ['filed and queued for a slot', run(['pending', 'waiting'])],
    ['a session at work', run(['running (working)', 'waiting'])],
    ['a session gone quiet, not finished', run(['working (quiescent)'])],
    ['spawned, not yet seen by its harness', run(['starting'])],
    ['between attempts', run(['between attempts'])],
    ['a session asking a person', run(['needs-human'])],
    ['its check still running', run(['verified ✓', 'checking'])],
    ['one step done, the next still to be filed', run(['succeeded · done', 'waiting'])],
    // A choice, so it is named: a follower that will never be filed still keeps the run on the floor.
    ['a follower still waiting behind a failure', run(['failed', 'waiting'])],
    ['a word the engine has not used before', run(['paused (rate limited)'])],
  ];
  for (const [why, r] of shown) assert.equal(inFlight(r), true, why);
});

test('a run waiting on you shows, though every session in it has ended', () => {
  assert.equal(inFlight(run(['succeeded · BLOCKED'], { waitingOnYou: ['step-0'] })), true);
  assert.equal(inFlight(run(['verified ✓', 'failed ✗ check (exit 1)'], { waitingOnYou: ['step-1'] })), true);
});

test('a run is finished, and hidden by default, when every step has stopped and nobody is waited on', () => {
  const hidden: Array<[string, RunSummary]> = [
    ['done on every step', run(['succeeded · done', 'succeeded'])],
    ['verified, and done on its own word', run(['verified ✓', 'unverified'])],
    ['failed and stopped', run(['failed', 'stopped'])],
    ['a closeout nobody could read', run(['succeeded · closeout unreadable'])],
    ['a task the engine has no record of, which never moves again', run(['unknown'])],
    ['no steps at all', run([])],
  ];
  for (const [why, r] of hidden) assert.equal(inFlight(r), false, why);
});

test('on a run somebody called off, a step not yet started never will be', () => {
  // The api empties `waitingOnYou` on a cancelled run, so a blocked step waits on nobody.
  assert.equal(inFlight(run(['succeeded · BLOCKED', 'waiting'], { cancelledAt })), false);
  assert.equal(inFlight(run(['stopped', 'pending'], { cancelledAt })), false);
  // A step still running when the run was called off is running until the stop lands.
  assert.equal(inFlight(run(['running (working)', 'waiting'], { cancelledAt })), true);
});

test('a step is moving unless the first word of its status says it stopped', () => {
  const stopped = ['succeeded', 'succeeded · done', 'succeeded · BLOCKED', 'done', 'verified ✓', 'unverified', 'unsigned',
    'failed', 'failed · done', 'failed ✗ check (exit 1)', 'stopped', 'unknown'];
  for (const status of stopped) assert.equal(stepInFlight(status, false), false, status);
  const moving = ['waiting', 'pending', 'starting', 'running (working)', 'working (quiescent)', 'between attempts', 'needs-human', 'checking'];
  for (const status of moving) assert.equal(stepInFlight(status, false), true, status);
});

test("a card's title is the brief's first line with words on it, or the run id", () => {
  assert.equal(titleOf({ id: 'r-1', brief: '# Add a cache\n\nKeep it small.' }), 'Add a cache');
  assert.equal(titleOf({ id: 'r-1', brief: '\n\n  Give the board a menu  \nmore' }), 'Give the board a menu');
  assert.equal(titleOf({ id: 'r-1', brief: '' }), 'r-1');
  assert.equal(titleOf({ id: 'r-1', brief: '##\n  \n' }), 'r-1');
});

test('a card names the repo by its folder', () => {
  assert.equal(repoName('/home/me/projects/hkb-v2'), 'hkb-v2');
  assert.equal(repoName('/home/me/projects/hkb-v2/'), 'hkb-v2');
  assert.equal(repoName('C:\\code\\app'), 'app');
  assert.equal(repoName('/'), '/');
});

test('runs go on the floor oldest first, so a new one takes the next cell and moves nobody', () => {
  const runs = [
    run([], { id: 'b', createdAt: '2026-09-13T02:00:00.000Z' }),
    run([], { id: 'c', createdAt: '2026-09-13T01:00:00.000Z' }),
    run([], { id: 'a', createdAt: '2026-09-13T02:00:00.000Z' }),
  ];
  assert.deepEqual(byAge(runs).map((r) => r.id), ['c', 'a', 'b']);
});

test('laid out fresh, the cards fill the grid row by row', () => {
  assert.equal(GRID_COLUMNS, 4, 'the cells below assume four to a row');
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b', 'c', 'd', 'e'], new Map())), {
    a: { x: 0, y: 0 },
    b: { x: CELL_WIDTH, y: 0 },
    c: { x: 2 * CELL_WIDTH, y: 0 },
    d: { x: 3 * CELL_WIDTH, y: 0 },
    e: { x: 0, y: CELL_HEIGHT },
  });
});

test('a card goes where it was left, and a new one into the first cell no card is in', () => {
  const at = placeRuns(['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6'], new Map([
    ['r-2', { x: 0, y: 0 }],
    // Near the third cell, not on it: it is still in that cell.
    ['r-4', { x: 2 * CELL_WIDTH + 10, y: -8 }],
    // Dragged off the grid: in no cell.
    ['r-6', { x: -500, y: 40 }],
    // Not on the floor now, so in no cell either.
    ['finished', { x: CELL_WIDTH, y: 0 }],
  ]));
  assert.deepEqual(Object.fromEntries(at), {
    'r-1': { x: CELL_WIDTH, y: 0 },
    'r-2': { x: 0, y: 0 },
    'r-3': { x: 3 * CELL_WIDTH, y: 0 },
    'r-4': { x: 2 * CELL_WIDTH + 10, y: -8 },
    'r-5': { x: 0, y: CELL_HEIGHT },
    'r-6': { x: -500, y: 40 },
  });
});

test('what is saved is every card as last left, and nothing for a run the store no longer lists', () => {
  const saved = new Map([['finished', { x: 1, y: 1 }], ['moved', { x: 2, y: 2 }], ['deleted', { x: 3, y: 3 }]]);
  const now = new Map([['moved', { x: 20, y: 20 }], ['new', { x: 4, y: 4 }]]);
  assert.deepEqual(Object.fromEntries(keepLayout(saved, now, new Set(['finished', 'moved', 'new']))), {
    finished: { x: 1, y: 1 },
    moved: { x: 20, y: 20 },
    new: { x: 4, y: 4 },
  });
  assert.deepEqual(Object.fromEntries(keepLayout(null, now, new Set(['new']))), { new: { x: 4, y: 4 } });
});
