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
  floorRuns,
  inFlight,
  keepLayout,
  movedOpen,
  ONE_CELL,
  placeRuns,
  repoName,
  runEdges,
  spanOf,
  titleOf,
  toggleOpen,
  waitsOnYou,
  type Span,
} from '../src/lib/factory.ts';
import { COLUMN_WIDTH, extentOf, layout, NODE_WIDTH, ROW_HEIGHT, type Point } from '../src/lib/layout.ts';

/** A run with one step per status, filed unless it is still waiting, and `status` and `moving` as the api put them. */
const run = (statuses: readonly string[], extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  brief: 'Do the thing',
  createdAt: '2026-09-13T00:00:00.000Z',
  cancelledAt: null,
  status: 'running',
  moving: false,
  steps: statuses.map((status, i) => ({ name: `step-${i}`, taskId: status === 'waiting' ? null : `t-${i}`, branch: null, status })),
  waitingOnYou: [],
  after: [],
  waiting: null,
  ...extra,
});

const cancelledAt = '2026-09-13T01:00:00.000Z';

test('a run is in flight, and on the Factory by default, while the api says it is running', () => {
  const shown: Array<[string, RunSummary]> = [
    ['started, nothing filed yet', run(['waiting', 'waiting'], { moving: true })],
    ['a session at work', run(['running (working)', 'waiting'], { moving: true })],
    ['its check still running', run(['verified ✓', 'checking'], { moving: true })],
    // `assess` reads a task nobody can find as running, and it holds nothing: the status alone keeps it on the floor.
    ['a step the engine has lost', run(['unknown', 'waiting'])],
  ];
  for (const [why, r] of shown) assert.equal(inFlight(r), true, why);
});

test('a run the api calls failed or cancelled stays in flight while it still moves', () => {
  const shown: Array<[string, RunSummary]> = [
    // The review's case: `assess` calls a fan-out failed once one step is final without letting its followers run.
    ['a check refused while a sibling session still runs', run(['failed ✗ check (exit 1)', 'running (working)', 'waiting'], { status: 'failed', moving: true, waitingOnYou: ['step-0'] })],
    ['a step failed, and a step waiting only on its sibling is still to be filed', run(['failed', 'unverified · done', 'waiting', 'waiting'], { status: 'failed', moving: true })],
    ['called off, a step still running until the stop lands', run(['running (working)', 'waiting'], { status: 'cancelled', moving: true, cancelledAt })],
  ];
  for (const [why, r] of shown) assert.equal(inFlight(r), true, why);
});

test('a run is finished, and hidden by default, once it has stopped moving without running', () => {
  const hidden: Array<[string, RunSummary]> = [
    ['verified, and done on its own word', run(['verified ✓', 'unverified · done'], { status: 'succeeded' })],
    // What the rule is for: the follower of a refused check reads `waiting`, and will for ever.
    ['stopped at a refused check, its follower waiting for ever', run(['failed ✗ check (exit 1)', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] })],
    ['a step signed off blocked, waiting on you', run(['succeeded · BLOCKED', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] })],
    ['a session that failed', run(['failed', 'waiting'], { status: 'failed' })],
    ['called off, and the stop has landed', run(['stopped', 'waiting'], { status: 'cancelled', cancelledAt })],
  ];
  for (const [why, r] of hidden) assert.equal(inFlight(r), false, why);
});

test("no step's word decides it: the run's status and whether it moves do", () => {
  // Runs the api would not send, to hold the Factory to its fields: live-looking words on a run it says has
  // stopped moving, and final-looking words on one it says is running.
  assert.equal(inFlight(run(['waiting', 'pending', 'checking', 'needs-human'], { status: 'failed', moving: false })), false);
  assert.equal(inFlight(run(['failed', 'stopped', 'unknown'], { status: 'running', moving: false })), true);
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
    // Dragged off the grid: in a cell beyond it, which no other card is in.
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

// ─── what the review found ───────────────────────────────────────────────────

test('an open run dropped over closed cards moves them aside at once, and the pass after moves nothing', () => {
  // The review's probe: b, open across four cells, is dragged into row 1 over c and d. The floor is laid
  // out again on the drop, so how it looks does not wait on some later change to it.
  const ids = ['a', 'b', 'c', 'd'];
  const spans = new Map([['b', { columns: 4, rows: 1 }]]);
  const dropped = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 0, y: CELL_HEIGHT }],
    ['c', { x: CELL_WIDTH, y: CELL_HEIGHT }],
    ['d', { x: 2 * CELL_WIDTH, y: CELL_HEIGHT }],
  ]);
  const at = placeRuns(ids, dropped, null, spans);
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 0, y: 0 },
    b: { x: 0, y: CELL_HEIGHT },
    c: { x: CELL_WIDTH, y: 0 },
    d: { x: 2 * CELL_WIDTH, y: 0 },
  });
  assert.deepEqual(overlapping(at, spans), []);
  assert.deepEqual(placeRuns(ids, at, null, spans), at);
});

test("a closed card dropped on an open run's graph takes a free cell, and the graph stays", () => {
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const at = placeRuns(['a', 'b'], new Map([['a', { x: CELL_WIDTH + 12, y: 8 }], ['b', { x: 0, y: 0 }]]), null, spans);
  assert.deepEqual(Object.fromEntries(at), { a: { x: 3 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 } });
});

test('a run dropped claims its cells first, as one opened last does; a drop opens no closed run', () => {
  const open = ['a', 'b', 'c'];
  assert.deepEqual(movedOpen(open, 'a'), ['b', 'c', 'a']);
  assert.equal(movedOpen(open, 'c'), open, 'last already: the same list, so nothing changes for it');
  assert.equal(movedOpen(open, 'closed'), open);
});

test("a graph running past the grid's edge moves a card parked beyond it, and one parked clear of it stays", () => {
  // The review's probe: b opens at the grid's last column across four cells, and c was left right of the grid in its row.
  const spans = new Map([['b', { columns: 4, rows: 1 }]]);
  const onFloor = new Map([['a', { x: 0, y: 0 }], ['b', { x: 3 * CELL_WIDTH, y: 0 }], ['c', { x: 4 * CELL_WIDTH, y: 0 }]]);
  const at = placeRuns(['a', 'b', 'c'], onFloor, null, spans);
  assert.deepEqual(Object.fromEntries(at), { a: { x: 0, y: 0 }, b: { x: 3 * CELL_WIDTH, y: 0 }, c: { x: CELL_WIDTH, y: 0 } });
  assert.deepEqual(overlapping(at, spans), []);

  const clear = new Map([...onFloor, ['c', { x: 8 * CELL_WIDTH, y: 0 }]]);
  assert.deepEqual(placeRuns(['a', 'b', 'c'], clear, null, spans).get('c'), { x: 8 * CELL_WIDTH, y: 0 });

  // A run wider than the grid, placed fresh, does not start a row where a card is parked past the edge.
  const wide = new Map([['w', { columns: 6, rows: 1 }]]);
  const parked = placeRuns(['p', 'w'], new Map([['p', { x: 5 * CELL_WIDTH, y: 0 }]]), null, wide);
  assert.deepEqual(Object.fromEntries(parked), { p: { x: 5 * CELL_WIDTH, y: 0 }, w: { x: 0, y: CELL_HEIGHT } });
  assert.deepEqual(overlapping(parked, wide), []);
});

// ─── runs that wait on runs ──────────────────────────────────────────────────

/** What the api says a run waiting on `p` waits on: a run that may still ship, or one that was cancelled and never will. */
const waitingOn = (onYou: boolean): RunSummary['waiting'] => ({
  runs: [{ run: 'p', missing: false, cancelledAt: onYou ? cancelledAt : null, gone: [] }],
  word: onYou ? 'waiting on p (cancelled)' : 'waiting on p',
  advice: onYou ? `p was cancelled at ${cancelledAt}, and a cancelled run never ships — yours to resolve: wf cancel r-1, or start the work again without --after p` : 'nothing of r-1 is filed until wf decide says p has shipped onto main; nothing to decide yet',
  onYou,
});

test('a run waiting on runs that may still ship is in flight; one waiting on a run that never ships is not, and waits on you — though `assess` calls both running', () => {
  const mayShip = run(['waiting on p'], { moving: true, after: ['p'], waiting: waitingOn(false) });
  assert.deepEqual([inFlight(mayShip), waitsOnYou(mayShip)], [true, false]);
  const never = run(['waiting on p (cancelled)'], { moving: false, after: ['p'], waiting: waitingOn(true) });
  assert.deepEqual([inFlight(never), waitsOnYou(never)], [false, true]);
  // A step waiting on you still is, and a run nobody waits on is not.
  assert.equal(waitsOnYou(run(['succeeded · BLOCKED', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] })), true);
  assert.equal(waitsOnYou(run(['running (working)'], { moving: true })), false);
});

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 14, 0, minutes)).toISOString();

test('the floor is every run in flight, and each finished run one of them waits on — and every run once finished runs are asked for', () => {
  const runs = [
    run([], { id: 'z', status: 'succeeded', createdAt: at(0) }),
    // Shipped, and waited on by b, in flight: on the floor, so b's edge has a card to leave from.
    run([], { id: 'a', status: 'succeeded', createdAt: at(1) }),
    run([], { id: 'b', moving: true, after: ['a'], createdAt: at(2) }),
    // Cancelled, and waited on by e, which is not in flight: e waits on you, and neither is on the floor.
    run([], { id: 'c', status: 'cancelled', cancelledAt, createdAt: at(3) }),
    run([], { id: 'e', after: ['c'], waiting: waitingOn(true), createdAt: at(4) }),
    // Finished, after z: a finished run brings no run it waits on.
    run([], { id: 'y', status: 'succeeded', after: ['z'], createdAt: at(5) }),
  ];
  assert.deepEqual(floorRuns(runs, false).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(floorRuns(runs, true).map((r) => r.id), ['z', 'a', 'b', 'c', 'e', 'y']);
  // One level: a finished parent brings none of its own parents.
  const chain = [
    run([], { id: 'g', status: 'succeeded', createdAt: at(0) }),
    run([], { id: 'p', status: 'succeeded', after: ['g'], createdAt: at(1) }),
    run([], { id: 'k', moving: true, after: ['p'], createdAt: at(2) }),
  ];
  assert.deepEqual(floorRuns(chain, false).map((r) => r.id), ['p', 'k']);
});

test('an edge from each run a card waits on to its card, both on the floor: to come until the child starts, and done once it has', () => {
  const edges = runEdges([
    run(['verified ✓'], { id: 'a' }),
    // Started: a step is filed.
    run(['running (working)'], { id: 'b', after: ['a'] }),
    // Not started; a run it names twice is one edge, and one not on the floor is none.
    run(['waiting'], { id: 'd', after: ['a', 'b', 'off-the-floor', 'a'] }),
  ]);
  assert.deepEqual(edges, [
    { id: 'after:a->b', source: 'a', target: 'b', state: 'done' },
    { id: 'after:a->d', source: 'a', target: 'd', state: 'to-come' },
    { id: 'after:b->d', source: 'b', target: 'd', state: 'to-come' },
  ]);
});

/** The diamond: a, then b and c together, then d. */
const DIAMOND = new Map([['b', ['a']], ['c', ['a']], ['d', ['b', 'c']]]);

test('runs joined by `after`, laid out fresh, are layered: each a column right of every run it waits on, and level with their middle — a diamond reads as one', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const at = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 0, y: CELL_HEIGHT / 2 },
    b: { x: CELL_WIDTH, y: 0 },
    c: { x: CELL_WIDTH, y: CELL_HEIGHT },
    d: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT / 2 },
  });
  assert.deepEqual(overlapping(at), []);
  // On the floor, nothing moves.
  assert.deepEqual(placeRuns(ids, at, null, new Map(), DIAMOND), at);
  // Given no edges, the same runs fill the grid row by row, as ever.
  assert.deepEqual([...placeRuns(ids, new Map(), null).values()].map((p) => p.y), [0, 0, 0, 0]);
});

test('a card beside the diamond keeps the grid, and one placed after it lands on no half of a card the layering put between two rows', () => {
  const at = placeRuns(['e', 'a', 'b', 'c', 'd', 'f'], new Map(), null, new Map(), DIAMOND);
  assert.deepEqual(Object.fromEntries(at), {
    e: { x: 0, y: 0 },
    // The first place the whole diamond fits: a, halfway down, would be on e's cell in the first column.
    a: { x: CELL_WIDTH, y: CELL_HEIGHT / 2 },
    b: { x: 2 * CELL_WIDTH, y: 0 },
    c: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
    d: { x: 3 * CELL_WIDTH, y: CELL_HEIGHT / 2 },
    // Not under a, in the second column: a straddles the row.
    f: { x: 0, y: CELL_HEIGHT },
  });
  assert.deepEqual(overlapping(at), []);
});

test('a run that starts while the runs it waits on are on the floor goes right of the rightmost of them — past the grid, rather than left of one', () => {
  const onFloor = new Map([['a', { x: 0, y: 0 }], ['b', { x: CELL_WIDTH, y: 0 }], ['x', { x: 2 * CELL_WIDTH, y: 0 }]]);
  const at = placeRuns(['a', 'b', 'x', 'd'], onFloor, null, new Map(), new Map([['d', ['a', 'b']]]));
  assert.deepEqual(at.get('d'), { x: 3 * CELL_WIDTH, y: 0 }, "right of b, in the first cell there no card is in: x has the one beside b");
  const edge = placeRuns(['b', 'd'], new Map([['b', { x: 3 * CELL_WIDTH, y: 0 }]]), null, new Map(), new Map([['d', ['b']]]));
  assert.deepEqual(edge.get('d'), { x: 4 * CELL_WIDTH, y: 0 });
});

test('an open run is placed on its own, and the cards that wait on it layered right of it, clear of its graph', () => {
  const spans = new Map([['a', { columns: 3, rows: 1 }]]);
  const at = placeRuns(['a', 'b', 'c', 'd'], new Map(), null, spans, DIAMOND);
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 0, y: 0 },
    b: { x: CELL_WIDTH, y: CELL_HEIGHT },
    c: { x: CELL_WIDTH, y: 2 * CELL_HEIGHT },
    d: { x: 2 * CELL_WIDTH, y: 1.5 * CELL_HEIGHT },
  });
  assert.deepEqual(overlapping(at, spans), []);
});

test('runs whose `after` goes round, as only a record edited by hand could, are placed a card at a time, and the layout ends', () => {
  const at = placeRuns(['a', 'b'], new Map(), null, new Map(), new Map([['a', ['b']], ['b', ['a']]]));
  assert.deepEqual(Object.fromEntries(at), { a: { x: 0, y: 0 }, b: { x: CELL_WIDTH, y: 0 } });
});
