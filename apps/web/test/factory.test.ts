import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import {
  byAge,
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  GRAPH_TOP,
  graphAt,
  GRID_COLUMNS,
  inFlight,
  keepLayout,
  ONE_CELL,
  placeRuns,
  repoName,
  spanOf,
  stepInFlight,
  titleOf,
  toggleOpen,
  type Span,
} from '../src/lib/factory.ts';
import { COLUMN_WIDTH, extentOf, layout, NODE_WIDTH, ROW_HEIGHT, type Point } from '../src/lib/layout.ts';

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
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b', 'c', 'd', 'e'], new Map(), null)), {
    a: { x: 0, y: 0 },
    b: { x: CELL_WIDTH, y: 0 },
    c: { x: 2 * CELL_WIDTH, y: 0 },
    d: { x: 3 * CELL_WIDTH, y: 0 },
    e: { x: 0, y: CELL_HEIGHT },
  });
});

test('a card goes where it was left, and a new one into the first cell no card is in', () => {
  const at = placeRuns(['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6'], new Map(), new Map([
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

test('a card coming back onto the floor does not land on a card that took its cell meanwhile', () => {
  // `a` was on the floor in the first cell when a drag saved the arrangement.
  const saved = new Map([['a', { x: 0, y: 0 }]]);
  // `a` finishes and drops off the floor; `b` starts, and takes the first free cell, which is `a`'s.
  const hidden = placeRuns(['b'], new Map(), saved);
  assert.deepEqual(Object.fromEntries(hidden), { b: { x: 0, y: 0 } });
  // Show finished: `a` comes back. `b` is on the floor where a person can see it, so `b` stays and `a` moves.
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], hidden, saved)), {
    a: { x: CELL_WIDTH, y: 0 },
    b: { x: 0, y: 0 },
  });
});

test('two cards saved in one cell: the older keeps it, the other takes a free cell', () => {
  // How the stack gets saved: the next drag writes `b` where it was placed, beside `a`'s old position.
  const saved = new Map([['a', { x: 0, y: 0 }], ['b', { x: 12, y: 6 }], ['c', { x: CELL_WIDTH, y: 0 }]]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b', 'c'], new Map(), saved)), {
    a: { x: 0, y: 0 },
    b: { x: 2 * CELL_WIDTH, y: 0 },
    c: { x: CELL_WIDTH, y: 0 },
  });
  // Cards on the floor are never moved for one another, even stacked: a person put them there.
  const stacked = new Map([['a', { x: 0, y: 0 }], ['b', { x: 12, y: 6 }]]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], stacked, saved)), Object.fromEntries(stacked));
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

// ─── open runs ───────────────────────────────────────────────────────────────

/** A chain of `n` steps, each after the one before, laid out. */
const chain = (n: number) => layout(Array.from({ length: n }, (_, i) => ({ name: `s${i}`, after: i ? [`s${i - 1}`] : [] })));
const fanOut = layout([{ name: 'plan', after: [] }, { name: 'api', after: ['plan'] }, { name: 'web', after: ['plan'] }]);
const diamond = layout([
  { name: 'plan', after: [] },
  { name: 'api', after: ['plan'] },
  { name: 'web', after: ['plan'] },
  { name: 'docs', after: ['plan'] },
  { name: 'merge', after: ['api', 'web', 'docs'] },
  { name: 'ship', after: ['merge'] },
]);

test('an open run spans its card\'s cell and as many to the right as its graph is wide', () => {
  assert.deepEqual(spanOf(extentOf(new Map())), ONE_CELL, 'no steps: the card alone');
  assert.deepEqual(spanOf(extentOf(chain(1))), { columns: 2, rows: 1 });
  // The e2e's fake run is a chain of three: a whole row of the grid.
  assert.deepEqual(spanOf(extentOf(chain(3))), { columns: 4, rows: 1 });
  assert.deepEqual(spanOf(extentOf(chain(5))), { columns: 6, rows: 1 }, 'wider than the grid');
  // Taller than a cell, so it takes the row below as well.
  assert.deepEqual(spanOf(extentOf(fanOut)), { columns: 3, rows: 2 });
  assert.deepEqual(spanOf(extentOf(diamond)), { columns: 5, rows: 3 });
  // At a cell's edge, and a pixel past it.
  assert.deepEqual(spanOf({ width: CELL_WIDTH, height: ROW_HEIGHT }), { columns: 2, rows: 1 });
  assert.deepEqual(spanOf({ width: CELL_WIDTH + 1, height: ROW_HEIGHT }), { columns: 3, rows: 1 });
  assert.deepEqual(spanOf({ width: 0, height: CELL_HEIGHT - GRAPH_TOP + 1 }), { columns: 1, rows: 2 });
});

test('every step of an open run lies right of its card and inside its span, a gap short of the next cell', () => {
  for (const [shape, at] of Object.entries({ one: chain(1), three: chain(3), five: chain(5), fanOut, diamond })) {
    const span = spanOf(extentOf(at));
    const placed = graphAt(at);
    const xs = [...placed.values()].map((p) => p.x);
    // The first column a column's arrow right of the card, as each column is from the one before.
    assert.equal(Math.min(...xs), CARD_WIDTH + COLUMN_WIDTH - NODE_WIDTH, shape);
    for (const [name, p] of placed) {
      const where = `${shape}: ${name} at ${JSON.stringify(p)} in ${JSON.stringify(span)}`;
      assert.ok(p.y >= 0, `below the card's top — ${where}`);
      assert.ok(p.x + NODE_WIDTH + (CELL_WIDTH - CARD_WIDTH) <= span.columns * CELL_WIDTH, `a gap short of the next cell across — ${where}`);
      assert.ok(p.y + ROW_HEIGHT <= span.rows * CELL_HEIGHT, `a gap short of the next row — ${where}`);
    }
  }
  // A chain is level, beside the card.
  assert.deepEqual([...graphAt(chain(3)).values()].map((p) => p.y), [GRAPH_TOP, GRAPH_TOP, GRAPH_TOP]);
});

test('a click opens a run, last in the order runs claim cells; another click closes it', () => {
  assert.deepEqual(toggleOpen([], 'a'), ['a']);
  assert.deepEqual(toggleOpen(['a'], 'b'), ['a', 'b']);
  assert.deepEqual(toggleOpen(['a', 'b'], 'a'), ['b']);
  assert.deepEqual(toggleOpen(toggleOpen(['b'], 'a'), 'a'), ['b']);
});

/**
 * Pairs of runs whose boxes on the floor overlap: a card's cell, or an open run's cells across and down.
 * Measured in the floor's coordinates, not in cells, so it does not share `placeRuns`' arithmetic.
 */
function overlapping(at: ReadonlyMap<string, Point>, spans: ReadonlyMap<string, Span> = new Map()): string[] {
  const boxes = [...at].map(([id, { x, y }]) => {
    const { columns, rows } = spans.get(id) ?? ONE_CELL;
    return { id, x, y, right: x + columns * CELL_WIDTH, bottom: y + rows * CELL_HEIGHT };
  });
  return boxes.flatMap((a, i) =>
    boxes.slice(i + 1).filter((b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom).map((b) => `${a.id}/${b.id}`),
  );
}

test('a run opening moves the cards its graph now covers, never itself, and no card beside it', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const fresh = placeRuns(ids, new Map(), null);
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const opened = placeRuns(ids, fresh, null, spans);
  assert.deepEqual(Object.fromEntries(opened), {
    a: { x: 0, y: 0 },
    b: { x: CELL_WIDTH, y: 0 },
    // c and d were in b's graph: the first free cells, in age order.
    c: { x: CELL_WIDTH, y: CELL_HEIGHT },
    d: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
    e: { x: 0, y: CELL_HEIGHT },
  });
  assert.deepEqual(overlapping(opened, spans), []);
  // The same pass again moves nothing: a level-triggered layout, not one that moves on every read.
  assert.deepEqual(placeRuns(ids, opened, null, spans), opened);

  // A run that starts while b is open does not land in its graph.
  const started = placeRuns([...ids, 'f'], opened, null, spans);
  assert.deepEqual(started.get('f'), { x: 3 * CELL_WIDTH, y: CELL_HEIGHT });
  assert.deepEqual(overlapping(started, spans), []);

  // Closed again: b takes its one cell, nobody moves back, and the next run takes the first free cell.
  const closed = placeRuns([...ids, 'f'], opened, null);
  assert.deepEqual(Object.fromEntries([...closed].filter(([id]) => id !== 'f')), Object.fromEntries(opened));
  assert.deepEqual(closed.get('f'), { x: 2 * CELL_WIDTH, y: 0 });
  assert.deepEqual(overlapping(closed), []);
});

test('two open runs whose graphs meet: the one opened last stays, and the other moves to a row with room', () => {
  const onFloor = new Map([['a', { x: 0, y: 0 }], ['b', { x: CELL_WIDTH, y: 0 }]]);
  const aLast = new Map([['a', { columns: 4, rows: 1 }], ['b', { columns: 3, rows: 1 }]]);
  const bLast = new Map([['b', { columns: 3, rows: 1 }], ['a', { columns: 4, rows: 1 }]]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, aLast)), { a: { x: 0, y: 0 }, b: { x: 0, y: CELL_HEIGHT } });
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, bLast)), { a: { x: 0, y: CELL_HEIGHT }, b: { x: CELL_WIDTH, y: 0 } });
  assert.deepEqual(overlapping(placeRuns(['a', 'b'], onFloor, null, aLast), aLast), []);
  assert.deepEqual(overlapping(placeRuns(['a', 'b'], onFloor, null, bLast), bLast), []);
});

test('a graph wider than the grid starts a row, and a tall one keeps the rows it covers', () => {
  const spans = new Map([['b', { columns: 6, rows: 1 }], ['c', { columns: 2, rows: 2 }]]);
  const at = placeRuns(['a', 'b', 'c', 'd'], new Map(), null, spans);
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
    b: { x: 0, y: 0 },
    c: { x: 0, y: CELL_HEIGHT },
    d: { x: 3 * CELL_WIDTH, y: CELL_HEIGHT },
  });
  assert.deepEqual(overlapping(at, spans), []);
});

test('a card coming back onto the floor does not land in an open run\'s graph', () => {
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const at = placeRuns(['a', 'b'], new Map([['b', { x: 0, y: 0 }]]), new Map([['a', { x: CELL_WIDTH, y: 0 }]]), spans);
  assert.deepEqual(Object.fromEntries(at), { a: { x: 3 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 } });
  assert.deepEqual(overlapping(at, spans), []);
});
