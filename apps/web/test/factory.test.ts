import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import {
  byAge,
  clockCounts,
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  GRID_COLUMNS,
  floorRuns,
  inFlight,
  inFlightFirst,
  keepLayout,
  NARROW_CELL_WIDTH,
  onYouOf,
  ONE_CELL,
  openSpan,
  placeRuns,
  repoName,
  runEdges,
  runClock,
  standingOf,
  TILES_FRAME,
  titleOf,
  toDecideOf,
  toggleOpen,
  unfoldingNow,
  waitedMs,
  waitsOnYou,
  widenLayout,
  type Span,
} from '../src/lib/factory.ts';
import { tilesOf } from '../src/lib/flow.ts';
import type { Point } from '../src/lib/layout.ts';

/** A run with one step per status, filed unless it is still waiting, and `status` and `moving` as the api put them. */
const run = (statuses: readonly string[], extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  brief: 'Do the thing',
  createdAt: '2026-09-13T00:00:00.000Z',
  startedAt: null,
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
    [
      'a check refused while a sibling session still runs',
      run(['failed ✗ check (exit 1)', 'running (working)', 'waiting'], { status: 'failed', moving: true, waitingOnYou: ['step-0'] }),
    ],
    [
      'a step failed, and a step waiting only on its sibling is still to be filed',
      run(['failed', 'unverified · done', 'waiting', 'waiting'], { status: 'failed', moving: true }),
    ],
    [
      'called off, a step still running until the stop lands',
      run(['running (working)', 'waiting'], { status: 'cancelled', moving: true, cancelledAt }),
    ],
  ];
  for (const [why, r] of shown) assert.equal(inFlight(r), true, why);
});

test('a run is finished, and hidden by default, once it has stopped moving without running', () => {
  const hidden: Array<[string, RunSummary]> = [
    ['verified, and done on its own word', run(['verified ✓', 'unverified · done'], { status: 'succeeded' })],
    // What the rule is for: the follower of a refused check reads `waiting`, and will for ever.
    [
      'stopped at a refused check, its follower waiting for ever',
      run(['failed ✗ check (exit 1)', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] }),
    ],
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
  assert.deepEqual(
    byAge(runs).map((r) => r.id),
    ['c', 'a', 'b'],
  );
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
  const at = placeRuns(
    ['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6'],
    new Map(),
    new Map([
      ['r-2', { x: 0, y: 0 }],
      // Near the third cell, not on it: it is still in that cell.
      ['r-4', { x: 2 * CELL_WIDTH + 10, y: -8 }],
      // Dragged off the grid: in a cell beyond it, which no other card is in.
      ['r-6', { x: -500, y: 40 }],
      // Not on the floor now, so in no cell either.
      ['finished', { x: CELL_WIDTH, y: 0 }],
    ]),
  );
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
  const saved = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 12, y: 6 }],
    ['c', { x: CELL_WIDTH, y: 0 }],
  ]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b', 'c'], new Map(), saved)), {
    a: { x: 0, y: 0 },
    b: { x: 2 * CELL_WIDTH, y: 0 },
    c: { x: CELL_WIDTH, y: 0 },
  });
  // Cards on the floor are never moved for one another, even stacked: a person put them there.
  const stacked = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 12, y: 6 }],
  ]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], stacked, saved)), Object.fromEntries(stacked));
});

test('what is saved is every card as last left, and nothing for a run the store no longer lists', () => {
  const saved = new Map([
    ['finished', { x: 1, y: 1 }],
    ['moved', { x: 2, y: 2 }],
    ['deleted', { x: 3, y: 3 }],
  ]);
  const now = new Map([
    ['moved', { x: 20, y: 20 }],
    ['new', { x: 4, y: 4 }],
  ]);
  assert.deepEqual(Object.fromEntries(keepLayout(saved, now, new Set(['finished', 'moved', 'new']))), {
    finished: { x: 1, y: 1 },
    moved: { x: 20, y: 20 },
    new: { x: 4, y: 4 },
  });
  assert.deepEqual(Object.fromEntries(keepLayout(null, now, new Set(['new']))), { new: { x: 4, y: 4 } });
});

// ─── open runs ───────────────────────────────────────────────────────────────

/** An open card's tiles, for steps each after the ones named, all waiting: their size is what the span reads. */
const tiles = (steps: Record<string, string[]>) =>
  tilesOf(
    Object.keys(steps),
    { roots: [], edges: Object.entries(steps).flatMap(([to, after]) => after.map((from) => ({ from, to, kind: 'after' as const }))) },
    Object.keys(steps).map((name) => ({ name, state: 'waiting' as const, note: null })),
    false,
  );
/** A chain of `n` steps, each after the one before. */
const chain = (n: number) => tiles(Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, i ? [`s${i - 1}`] : []])));
/** The e2e's fake run: two lanes, one a fan-in. implement → review → respond, implement → respond; tokens → theme. */
const fake = tiles({ implement: [], review: ['implement'], respond: ['review', 'implement'], tokens: [], theme: ['tokens'] });
const diamond = tiles({ plan: [], api: ['plan'], web: ['plan'], docs: ['plan'], merge: ['api', 'web', 'docs'], ship: ['merge'] });

test('an open card spans its own cell and as many to the right as its tiles reach, and as many rows down', () => {
  assert.deepEqual(openSpan(chain(1)), { columns: 2, rows: 1 });
  // The e2e's fake run: three columns of tiles, two lanes and the arc over them — three cells of a row.
  assert.deepEqual(openSpan(fake), { columns: 3, rows: 1 });
  assert.deepEqual(openSpan(chain(3)), { columns: 3, rows: 1 });
  assert.deepEqual(openSpan(chain(5)), { columns: 4, rows: 1 });
  assert.deepEqual(openSpan(chain(7)), { columns: 5, rows: 1 }, 'wider than the grid');
  // Three lanes are taller than a cell: the row below as well.
  assert.deepEqual(openSpan(diamond), { columns: 4, rows: 2 });
  // Never less than the card's own cell and the next: the tiles' frame alone reaches past its gap.
  assert.deepEqual(openSpan({ width: 0, height: 0 }), { columns: 2, rows: 1 });
  // Tiles whose right edge ends a gap short of a cell's edge, and a pixel past that; whose bottom ends a gap short of a row's, and a pixel past.
  const gap = CELL_WIDTH - CARD_WIDTH;
  const across = 2 * CELL_WIDTH - gap - CARD_WIDTH - TILES_FRAME.across;
  assert.deepEqual(openSpan({ width: across, height: 88 }), { columns: 2, rows: 1 });
  assert.deepEqual(openSpan({ width: across + 1, height: 88 }), { columns: 3, rows: 1 });
  const down = CELL_HEIGHT - gap - TILES_FRAME.down;
  assert.deepEqual(openSpan({ width: 176, height: down }), { columns: 2, rows: 1 });
  assert.deepEqual(openSpan({ width: 176, height: down + 1 }), { columns: 2, rows: 2 });
});

test("an open card's span reads its steps and their graph, not their words: a status that moves moves no card", () => {
  const graph = {
    roots: [],
    edges: [
      { from: 'a', to: 'b', kind: 'after' as const },
      { from: 'b', to: 'a', kind: 'loop' as const, rounds: 2 },
    ],
  };
  const now = tilesOf(
    ['a', 'b'],
    graph,
    [
      { name: 'a', state: 'working', note: null },
      { name: 'b', state: 'waiting', note: null },
    ],
    false,
  );
  const later = tilesOf(
    ['a', 'b'],
    graph,
    [
      { name: 'a', state: 'verified', note: null },
      { name: 'b', state: 'blocked', note: 'round 2 of 2' },
    ],
    true,
  );
  assert.deepEqual(openSpan(later), openSpan(now));
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
    boxes
      .slice(i + 1)
      .filter((b) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom)
      .map((b) => `${a.id}/${b.id}`),
  );
}

test("an arrangement saved while a cell was narrower is laid out on today's grid with no card over another", () => {
  // A floor a person arranged at the old pitch: a row of four, a card dragged a little into its cell, one on the row below.
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const narrow = new Map<string, Point>([
    ['a', { x: 0, y: 0 }],
    ['b', { x: NARROW_CELL_WIDTH, y: 0 }],
    ['c', { x: 2 * NARROW_CELL_WIDTH, y: 0 }],
    ['d', { x: 3 * NARROW_CELL_WIDTH, y: 0 }],
    ['e', { x: NARROW_CELL_WIDTH + 40, y: CELL_HEIGHT }],
  ]);
  // Read unchanged, each point rounds to a cell of its own and is kept, and the cards cover each other.
  assert.notDeepEqual(overlapping(placeRuns(ids, new Map(), narrow)), []);
  const at = placeRuns(ids, new Map(), widenLayout(narrow));
  assert.deepEqual(overlapping(at), []);
  // Each card is on the column it was on, as far into its cell, and on its row.
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 0, y: 0 },
    b: { x: CELL_WIDTH, y: 0 },
    c: { x: 2 * CELL_WIDTH, y: 0 },
    d: { x: 3 * CELL_WIDTH, y: 0 },
    e: { x: CELL_WIDTH + (40 * CELL_WIDTH) / NARROW_CELL_WIDTH, y: CELL_HEIGHT },
  });
  assert.equal(widenLayout(null), null);
});

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
  const onFloor = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: CELL_WIDTH, y: 0 }],
  ]);
  const aLast = new Map([
    ['a', { columns: 4, rows: 1 }],
    ['b', { columns: 3, rows: 1 }],
  ]);
  const bLast = new Map([
    ['b', { columns: 3, rows: 1 }],
    ['a', { columns: 4, rows: 1 }],
  ]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, aLast)), { a: { x: 0, y: 0 }, b: { x: 0, y: CELL_HEIGHT } });
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, bLast)), {
    a: { x: 0, y: CELL_HEIGHT },
    b: { x: CELL_WIDTH, y: 0 },
  });
  assert.deepEqual(overlapping(placeRuns(['a', 'b'], onFloor, null, aLast), aLast), []);
  assert.deepEqual(overlapping(placeRuns(['a', 'b'], onFloor, null, bLast), bLast), []);
});

test('a graph wider than the grid starts a row, and a tall one keeps the rows it covers', () => {
  const spans = new Map([
    ['b', { columns: 6, rows: 1 }],
    ['c', { columns: 2, rows: 2 }],
  ]);
  const at = placeRuns(['a', 'b', 'c', 'd'], new Map(), null, spans);
  assert.deepEqual(Object.fromEntries(at), {
    a: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
    b: { x: 0, y: 0 },
    c: { x: 0, y: CELL_HEIGHT },
    d: { x: 3 * CELL_WIDTH, y: CELL_HEIGHT },
  });
  assert.deepEqual(overlapping(at, spans), []);
});

test("a card coming back onto the floor does not land in an open run's graph", () => {
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const at = placeRuns(['a', 'b'], new Map([['b', { x: 0, y: 0 }]]), new Map([['a', { x: CELL_WIDTH, y: 0 }]]), spans);
  assert.deepEqual(Object.fromEntries(at), { a: { x: 3 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 } });
  assert.deepEqual(overlapping(at, spans), []);
});

// ─── what the review found ───────────────────────────────────────────────────

test('an open run dropped over closed cards leaves them under it, and the pass after moves nothing: that is where a person put it', () => {
  // The review's probe of the old floor: b, open across four cells, is dragged into row 1 over c and d. Nothing unfolds on a drop,
  // so nothing moves aside: each card on the floor moves alone, as in a modeller.
  const ids = ['a', 'b', 'c', 'd'];
  const spans = new Map([['b', { columns: 4, rows: 1 }]]);
  const dropped = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 0, y: CELL_HEIGHT }],
    ['c', { x: CELL_WIDTH, y: CELL_HEIGHT }],
    ['d', { x: 2 * CELL_WIDTH, y: CELL_HEIGHT }],
  ]);
  const at = placeRuns(ids, dropped, null, spans, new Map(), new Set());
  assert.deepEqual(Object.fromEntries(at), Object.fromEntries(dropped));
  assert.deepEqual(placeRuns(ids, at, null, spans, new Map(), new Set()), at);
  // The same floor with b unfolding now — opened, not dropped — moves c and d out from under its graph.
  const opened = placeRuns(ids, dropped, null, spans, new Map(), new Set(['b']));
  assert.deepEqual(Object.fromEntries(opened), {
    a: { x: 0, y: 0 },
    b: { x: 0, y: CELL_HEIGHT },
    c: { x: CELL_WIDTH, y: 0 },
    d: { x: 2 * CELL_WIDTH, y: 0 },
  });
  assert.deepEqual(overlapping(opened, spans), []);
});

test("a closed card dropped on an open run's graph stays there, and so does the graph", () => {
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const onFloor = new Map([
    ['a', { x: CELL_WIDTH + 12, y: 8 }],
    ['b', { x: 0, y: 0 }],
  ]);
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, spans, new Map(), new Set())), Object.fromEntries(onFloor));
});

test('on the next visit, a card saved over an open card is a stack saved, as two in one cell are: the open card keeps its cells, the other takes a free one', () => {
  // As the floor starts (`FactoryCanvas`): nothing on it yet, the saved layout, the open cards' spans, and nothing opening. A left
  // over b's second cell, where a drop put it and the visit before kept it (the test above); c in a cell of its own.
  const spans = new Map([['b', { columns: 2, rows: 1 }]]);
  const saved = new Map([
    ['a', { x: CELL_WIDTH + 12, y: 8 }],
    ['b', { x: 0, y: 0 }],
    ['c', { x: 0, y: CELL_HEIGHT }],
  ]);
  const at = placeRuns(['a', 'b', 'c'], new Map(), saved, spans, new Map(), new Set());
  assert.deepEqual(Object.fromEntries(at), { a: { x: 2 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: CELL_HEIGHT } });
  assert.deepEqual(overlapping(at, spans), []);
  // Older than b or not: the open card claims first, as a card just opened is never the one moved aside.
  assert.deepEqual(placeRuns(['b', 'a', 'c'], new Map(), saved, spans, new Map(), new Set()), at);
});

test("a card left over an open run's graph stays when a run starts, and the run that starts takes a cell clear of both", () => {
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const onFloor = new Map([
    ['a', { x: CELL_WIDTH, y: 0 }],
    ['b', { x: 0, y: 0 }],
  ]);
  const at = placeRuns(['a', 'b', 'c'], onFloor, null, spans, new Map(), new Set());
  assert.deepEqual(Object.fromEntries(at), { a: { x: CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 }, c: { x: 3 * CELL_WIDTH, y: 0 } });
});

test('an open card grown by a step its run gained claims the cells it now reaches for the runs that start, and moves no card already there', () => {
  // b was a row tall; a lane more makes it two, over c.
  const grown = new Map([['b', { columns: 2, rows: 2 }]]);
  const onFloor = new Map([
    ['b', { x: 0, y: 0 }],
    ['c', { x: CELL_WIDTH, y: CELL_HEIGHT }],
  ]);
  const at = placeRuns(['b', 'c', 'd'], onFloor, null, grown, new Map(), new Set());
  assert.deepEqual(at.get('c'), { x: CELL_WIDTH, y: CELL_HEIGHT }, 'c stays under it');
  assert.deepEqual(at.get('d'), { x: 2 * CELL_WIDTH, y: 0 }, 'and d takes the first cell clear of it');
});

test('a card opens when it is drawn open and was not on the last pass: opened, or back on the floor open — never because it grew', () => {
  const one = new Map([['b', { columns: 3, rows: 1 }]]);
  const grown = new Map([['b', { columns: 3, rows: 2 }]]);
  const none = new Map<string, Span>();
  const ids = (set: ReadonlySet<string>) => [...set].sort();

  // Opened by a click: it opens, once; grown by a step its run gained, it does not again.
  let pass = unfoldingNow(new Set(), one);
  assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [['b'], ['b']]);
  pass = unfoldingNow(pass.drawn, grown);
  assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [[], ['b']]);

  // Off the floor — finished, and finished runs hidden — or closed, it is forgotten, so back on the floor open it opens again.
  pass = unfoldingNow(pass.drawn, none);
  assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [[], []]);
  pass = unfoldingNow(pass.drawn, one);
  assert.deepEqual(ids(pass.unfolding), ['b']);

  // Left open on the last visit: the floor starts with it remembered, so it opens over nobody.
  pass = unfoldingNow(new Set(['b']), one);
  assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [[], ['b']]);
});

test('an open run back on the floor moves the card that started under it while it was away', () => {
  // f was left open at (0, 0), across three cells; finished and hidden, it held none, and c started in the cell beside it.
  const saved = new Map([
    ['f', { x: 0, y: 0 }],
    ['c', { x: CELL_WIDTH, y: 0 }],
  ]);
  const away = new Map([['c', { x: CELL_WIDTH, y: 0 }]]);
  const open = new Map([['f', { columns: 3, rows: 1 }]]);
  // Shown again, its card goes back to its cell, open, and c moves aside.
  const back = placeRuns(['f', 'c'], away, saved, open, new Map(), unfoldingNow(new Set(), open).unfolding);
  assert.deepEqual(Object.fromEntries(back), { f: { x: 0, y: 0 }, c: { x: 3 * CELL_WIDTH, y: 0 } });
  assert.deepEqual(overlapping(back, open), []);
  // Had it been on the last pass, drawn as it was, c would have been the person's to leave there.
  assert.deepEqual(placeRuns(['f', 'c'], away, saved, open, new Map(), unfoldingNow(new Set(['f']), open).unfolding).get('c'), {
    x: CELL_WIDTH,
    y: 0,
  });
  // A card that started in its own cell stays, and f takes a free place, as a card coming back closed would.
  const inIts = new Map([['c', { x: 0, y: 0 }]]);
  const elsewhere = placeRuns(['f', 'c'], inIts, saved, open, new Map(), new Set(['f']));
  assert.deepEqual(Object.fromEntries(elsewhere), { f: { x: CELL_WIDTH, y: 0 }, c: { x: 0, y: 0 } });
});

test("a graph running past the grid's edge moves a card parked beyond it, and one parked clear of it stays", () => {
  // The review's probe: b opens at the grid's last column across four cells, and c was left right of the grid in its row.
  const spans = new Map([['b', { columns: 4, rows: 1 }]]);
  const onFloor = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: 3 * CELL_WIDTH, y: 0 }],
    ['c', { x: 4 * CELL_WIDTH, y: 0 }],
  ]);
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
  advice: onYou
    ? `p was cancelled at ${cancelledAt}, and a cancelled run never ships — yours to resolve: wf cancel r-1, or start the work again without --after p`
    : 'nothing of r-1 is filed until wf decide says p has shipped onto main; nothing to decide yet',
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
    // Cancelled, and waited on by e, which is not in flight: e waits on you, so its card stays; c brings no card, e's waiting line names it.
    run([], { id: 'c', status: 'cancelled', cancelledAt, createdAt: at(3) }),
    run([], { id: 'e', after: ['c'], waiting: waitingOn(true), createdAt: at(4) }),
    // Finished, after z: a finished run brings no run it waits on.
    run([], { id: 'y', status: 'succeeded', after: ['z'], createdAt: at(5) }),
  ];
  assert.deepEqual(
    floorRuns(runs, false).map((r) => r.id),
    ['a', 'b', 'e'],
  );
  assert.deepEqual(
    floorRuns(runs, true).map((r) => r.id),
    ['z', 'a', 'b', 'c', 'e', 'y'],
  );
  // One level: a finished parent brings none of its own parents.
  const chain = [
    run([], { id: 'g', status: 'succeeded', createdAt: at(0) }),
    run([], { id: 'p', status: 'succeeded', after: ['g'], createdAt: at(1) }),
    run([], { id: 'k', moving: true, after: ['p'], createdAt: at(2) }),
  ];
  assert.deepEqual(
    floorRuns(chain, false).map((r) => r.id),
    ['p', 'k'],
  );
});

/** What a person has to decide, as the api words it (`RunToDecide`): an ending step's gate, or a branch nobody merged. */
const approve = (id: string, step: string): RunSummary['toDecide'] => ({
  kind: 'approve',
  step,
  says: 'Merge it onto the base branch.',
  said: `Merge it onto the base branch. — wf approve ${id} ${step}`,
  command: `wf approve ${id} ${step}`,
});
const merge = (id: string, branch: string): RunSummary['toDecide'] => ({
  kind: 'git',
  branches: [branch],
  said: `${branch} is ahead of main, and nothing has merged it — wf decide ${id}`,
  command: `wf decide ${id}`,
});

test('a run nobody has decided stays on the floor, whatever Show finished says, until it is decided', () => {
  const runs = [
    // Finished at its ending's gate: nothing of it moves, and its result is a person's word away.
    run(['unverified · done', 'awaiting approval'], {
      id: 'ends',
      status: 'failed',
      waitingOnYou: ['ship'],
      onYou: ['approve ship'],
      toDecide: approve('ends', 'ship'),
      createdAt: at(0),
    }),
    // Finished and succeeded, with a branch nobody merged: nothing waits on you, and the run is still to be decided.
    run(['unverified · done'], { id: 'ahead', status: 'succeeded', toDecide: merge('ahead', 'wf/ahead/implement'), createdAt: at(1) }),
    // Finished and decided: its ending merged it, so the card is off the floor with the rest.
    run(['unverified · done', 'unverified · done'], { id: 'shipped', status: 'succeeded', createdAt: at(2) }),
  ];
  assert.deepEqual(
    floorRuns(runs, false).map((r) => r.id),
    ['ends', 'ahead'],
  );
  assert.deepEqual(
    floorRuns(runs, true).map((r) => r.id),
    ['ends', 'ahead', 'shipped'],
  );
  // And a list from an api that carries no `toDecide` at all reads as one with nothing to decide, rather than taking the floor down.
  const old = [{ ...runs[1]!, toDecide: undefined as unknown as RunSummary['toDecide'] }];
  assert.deepEqual(
    floorRuns(old, false).map((r) => r.id),
    [],
  );
  assert.equal(toDecideOf(old[0]!), null);
});

test('a run that waits on a person stays on the floor, whatever Show finished says, until the person has answered', () => {
  const runs = [
    // Stopped at a gate in the middle, as the api listed a-workspace-is-a-choice-and-f86t on 2026-09-19: nothing moves, nothing to decide.
    run(['unverified · done', 'awaiting approval', 'waiting'], {
      id: 'gated',
      status: 'failed',
      moving: false,
      waitingOnYou: ['plan'],
      onYou: ['approve plan'],
      toDecide: null,
      createdAt: at(0),
    }),
    // A step signed off blocked and asks the person something; its followers will never be filed without an answer.
    run(['succeeded · BLOCKED', 'waiting'], {
      id: 'blocked',
      status: 'failed',
      moving: false,
      waitingOnYou: ['step-0'],
      onYou: ['step-0'],
      toDecide: null,
      createdAt: at(1),
    }),
    // Cancelled, with the blocked step still named: a cancelled run waits on nobody, and is off the floor with the finished.
    run(['succeeded · BLOCKED', 'waiting'], {
      id: 'called-off',
      status: 'cancelled',
      cancelledAt,
      waitingOnYou: ['step-0'],
      onYou: ['step-0'],
      toDecide: null,
      createdAt: at(2),
    }),
    // Failed at a refused check, which asks nobody: finished, and off the floor.
    run(['failed · check refused'], { id: 'refused', status: 'failed', toDecide: null, createdAt: at(3) }),
  ];
  assert.deepEqual(
    floorRuns(runs, false).map((r) => r.id),
    ['gated', 'blocked'],
  );
  assert.deepEqual(
    floorRuns(runs, true).map((r) => r.id),
    ['gated', 'blocked', 'called-off', 'refused'],
  );
  assert.equal(waitsOnYou(runs[2]!), false, 'a cancelled run waits on nobody');
  assert.equal(standingOf(runs[0]!), 'waiting on you');
  // Level-triggered: once the plan is approved the run moves again, and once it is finished, answered, it goes with the rest.
  const approved = { ...runs[0]!, status: 'running' as const, moving: true, waitingOnYou: [], onYou: [] };
  assert.deepEqual(
    floorRuns([approved], false).map((r) => r.id),
    ['gated'],
  );
  const done = { ...approved, status: 'succeeded' as const, moving: false };
  assert.deepEqual(
    floorRuns([done], false).map((r) => r.id),
    [],
  );
});

test("the header's `waiting on you` counts the runs whose cards are drawn waiting on you, with Show finished off", () => {
  const runs = [
    run(['unverified · done', 'awaiting approval'], {
      id: 'gated',
      status: 'failed',
      waitingOnYou: ['plan'],
      onYou: ['approve plan'],
      toDecide: null,
      createdAt: at(0),
    }),
    run(['succeeded · BLOCKED'], { id: 'blocked', status: 'failed', waitingOnYou: ['step-0'], onYou: ['step-0'], createdAt: at(1) }),
    run(['unverified · done', 'awaiting approval'], {
      id: 'ends',
      status: 'failed',
      waitingOnYou: ['ship'],
      onYou: ['approve ship'],
      toDecide: approve('ends', 'ship'),
      createdAt: at(2),
    }),
    run([], { id: 'e', after: ['c'], waiting: waitingOn(true), createdAt: at(3) }),
    run(['succeeded · BLOCKED'], {
      id: 'called-off',
      status: 'cancelled',
      cancelledAt,
      waitingOnYou: ['step-0'],
      onYou: ['step-0'],
      createdAt: at(4),
    }),
    run([], { id: 'shipped', status: 'succeeded', createdAt: at(5) }),
    run(['running (working)'], { id: 'going', moving: true, createdAt: at(6) }),
  ];
  // As FactoryCanvas counts it: `runs.filter(waitsOnYou)` over every run, beside the cards `floorRuns` draws.
  const counted = runs.filter(waitsOnYou).map((r) => r.id);
  const drawn = floorRuns(runs, false)
    .filter(waitsOnYou)
    .map((r) => r.id);
  assert.deepEqual(counted, ['gated', 'blocked', 'ends', 'e']);
  assert.deepEqual(drawn, counted);
});

test("the ending step's own gate is not asked for twice: the to-decide line says it, and `waiting on you` leaves it out", () => {
  const ends = run(['unverified · done', 'awaiting approval'], {
    id: 'ends',
    status: 'failed',
    waitingOnYou: ['ship'],
    onYou: ['approve ship'],
    toDecide: approve('ends', 'ship'),
  });
  assert.equal(waitsOnYou(ends), true, 'the step still waits at its gate');
  assert.deepEqual(onYouOf(ends), [], 'and nothing is left to name: the decision is the whole of it');
  // Another step waiting on you is still named, beside the ending's own line.
  const both = { ...ends, waitingOnYou: ['tokens', 'ship'], onYou: ['tokens', 'approve ship'] };
  assert.deepEqual(onYouOf(both), ['tokens']);
  // A branch nobody merged asks for no step, so nothing is filtered.
  const ahead = run(['unverified · done'], {
    id: 'ahead',
    status: 'succeeded',
    waitingOnYou: ['implement'],
    onYou: ['implement'],
    toDecide: merge('ahead', 'wf/ahead/implement'),
  });
  assert.deepEqual(onYouOf(ahead), ['implement']);
});

test('the Runs page lists the runs in flight first, then the rest, each newest first', () => {
  const runs = [
    run([], { id: 'old-done', status: 'succeeded', createdAt: at(0) }),
    run([], { id: 'old-going', moving: true, createdAt: at(1) }),
    run([], { id: 'new-done', status: 'succeeded', createdAt: at(5) }),
    // A fan-out `assess` calls failed while a sibling session still works: in flight, so on top.
    run([], { id: 'failed-moving', status: 'failed', moving: true, createdAt: at(3) }),
    // Running by `assess`, waiting on a run that never ships: nothing of it moves, so among the rest, by its date.
    run([], { id: 'gated', after: ['p'], waiting: waitingOn(true), createdAt: at(6) }),
    run([], { id: 'cancelled', status: 'cancelled', cancelledAt, createdAt: at(4) }),
    // Running with nothing held — a task the engine has lost: in flight, as on the Factory.
    run([], { id: 'lost', createdAt: at(2) }),
  ];
  assert.deepEqual(
    inFlightFirst(runs).map((r) => r.id),
    ['failed-moving', 'lost', 'old-going', 'gated', 'new-done', 'cancelled', 'old-done'],
  );
  // Newest first all the same when nothing is in flight, and when all is.
  const done = runs.filter((r) => !inFlight(r));
  assert.deepEqual(
    inFlightFirst(done).map((r) => r.id),
    ['gated', 'new-done', 'cancelled', 'old-done'],
  );
  assert.deepEqual(
    inFlightFirst(runs.filter(inFlight)).map((r) => r.id),
    ['failed-moving', 'lost', 'old-going'],
  );
  // The same instant: by id, so a refetch moves no row; and the list given is left as it was.
  const twins = [run([], { id: 'b', createdAt: at(0) }), run([], { id: 'a', createdAt: at(0) })];
  assert.deepEqual(
    inFlightFirst(twins).map((r) => r.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    twins.map((r) => r.id),
    ['b', 'a'],
  );
});

test('a run that stops moving drops below the runs still going, whenever it started', () => {
  const going = run([], { id: 'going', moving: true, createdAt: at(0) });
  const started = run([], { id: 'started', moving: true, createdAt: at(9) });
  assert.deepEqual(
    inFlightFirst([going, started]).map((r) => r.id),
    ['started', 'going'],
  );
  const finished = { ...started, status: 'succeeded' as const, moving: false };
  assert.deepEqual(
    inFlightFirst([going, finished]).map((r) => r.id),
    ['going', 'started'],
  );
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
const DIAMOND = new Map([
  ['b', ['a']],
  ['c', ['a']],
  ['d', ['b', 'c']],
]);

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
  assert.deepEqual(
    [...placeRuns(ids, new Map(), null).values()].map((p) => p.y),
    [0, 0, 0, 0],
  );
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

test('a card a person dropped between two rows holds both, so the card placed next is not drawn over its foot', () => {
  // Dropped 45 short of the second row — where the e2e's floor had one, its own height leaving 27 of its cell — and a card coming onto
  // the floor. The row it hangs into is not free: a card there would be drawn over the top of this one.
  const dropped = new Map([['a', { x: 0, y: CELL_HEIGHT - 45 }]]);
  const at = placeRuns(['a', 'b'], dropped, null);
  assert.deepEqual(at.get('a'), { x: 0, y: CELL_HEIGHT - 45 }, 'a person put it there, and it stays');
  assert.deepEqual(at.get('b'), { x: CELL_WIDTH, y: 0 }, 'and the next card goes beside it, not into the row it hangs into');
  // A card the layering puts halfway down a row holds both rows too, as it always has.
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], new Map([['a', { x: 0, y: CELL_HEIGHT / 2 }]]), null)), {
    a: { x: 0, y: CELL_HEIGHT / 2 },
    b: { x: CELL_WIDTH, y: 0 },
  });
  // On the grid, a card holds its own row and no other: the floor fills row by row.
  assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], new Map([['a', { x: 0, y: CELL_HEIGHT }]]), null)), {
    a: { x: 0, y: CELL_HEIGHT },
    b: { x: 0, y: 0 },
  });
});

test('a run that starts while the runs it waits on are on the floor goes right of the rightmost of them — past the grid, rather than left of one', () => {
  const onFloor = new Map([
    ['a', { x: 0, y: 0 }],
    ['b', { x: CELL_WIDTH, y: 0 }],
    ['x', { x: 2 * CELL_WIDTH, y: 0 }],
  ]);
  const at = placeRuns(['a', 'b', 'x', 'd'], onFloor, null, new Map(), new Map([['d', ['a', 'b']]]));
  assert.deepEqual(at.get('d'), { x: 3 * CELL_WIDTH, y: 0 }, 'right of b, in the first cell there no card is in: x has the one beside b');
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
  const at = placeRuns(
    ['a', 'b'],
    new Map(),
    null,
    new Map(),
    new Map([
      ['a', ['b']],
      ['b', ['a']],
    ]),
  );
  assert.deepEqual(Object.fromEntries(at), { a: { x: 0, y: 0 }, b: { x: CELL_WIDTH, y: 0 } });
});

// ─── what the second review found ────────────────────────────────────────────

/** Each `after` edge between placed cards whose parent does not stand a column or more left of its child, as `parent->child`. */
function backwards(at: ReadonlyMap<string, Point>, after: ReadonlyMap<string, readonly string[]>): string[] {
  const column = (id: string) => Math.round(at.get(id)!.x / CELL_WIDTH);
  return [...after].flatMap(([child, parents]) =>
    parents.filter((p) => at.has(p) && at.has(child) && column(p) >= column(child)).map((p) => `${p}->${child}`),
  );
}

test("a graph unfolding over the diamond's top, one side and its bottom, and not the other side, moves the whole diamond: it still reads as one", () => {
  const ids = ['a', 'b', 'c', 'd'];
  const fresh = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
  // An open run across the first row's first three cells: over a (halfway down it), b and d (halfway down), and not c, in the row below.
  const spans = new Map([['x', { columns: 3, rows: 1 }]]);
  const onFloor = new Map([...fresh, ['x', { x: 0, y: 0 }]]);
  const at = placeRuns(['x', ...ids], onFloor, null, spans, DIAMOND);
  assert.deepEqual(backwards(at, DIAMOND), [], 'every run left of each run that waits on it');
  assert.deepEqual(overlapping(at, spans), []);
  // Laid out together, as the diamond it was: the top and bottom level with the middle of the sides.
  const [a, b, c, d] = ids.map((id) => at.get(id)!);
  assert.deepEqual([a!.y, d!.y], [(b!.y + c!.y) / 2, (b!.y + c!.y) / 2]);
  assert.deepEqual(placeRuns(['x', ...ids], at, null, spans, DIAMOND), at, 'and the pass after moves nothing');
});

test('one card of the diamond moved aside by a graph takes the rest of the diamond with it, rather than landing right of the run that waits on it', () => {
  const ids = ['a', 'b', 'c', 'd'];
  const fresh = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
  // Over c alone: the second row's second cell.
  const spans = new Map([['x', { columns: 1, rows: 1 }]]);
  const at = placeRuns(['x', ...ids], new Map([...fresh, ['x', fresh.get('c')!]]), null, spans, DIAMOND);
  assert.deepEqual(backwards(at, DIAMOND), []);
  assert.deepEqual(overlapping(at, spans), []);
});

test('a card coming onto the floor goes left of a card on the floor that waits on it — below, when the cell left of it is taken — never right', () => {
  // b waits on a and is on the floor in the second column; x has the first. a comes back with nowhere saved.
  const onFloor = new Map([
    ['x', { x: 0, y: 0 }],
    ['b', { x: CELL_WIDTH, y: 0 }],
  ]);
  const at = placeRuns(['x', 'a', 'b'], onFloor, null, new Map(), new Map([['b', ['a']]]));
  assert.deepEqual(Object.fromEntries(at), { x: { x: 0, y: 0 }, a: { x: 0, y: CELL_HEIGHT }, b: { x: CELL_WIDTH, y: 0 } });
});

test('a card with no column between a card it waits on and one that waits on it: the cards `after` joins are laid out again, together', () => {
  // m comes onto the floor between p, in the first column, and k, in the second, which waits on m.
  const onFloor = new Map([
    ['p', { x: 0, y: 0 }],
    ['k', { x: CELL_WIDTH, y: 0 }],
  ]);
  const after = new Map([
    ['m', ['p']],
    ['k', ['m']],
  ]);
  const at = placeRuns(['p', 'm', 'k'], onFloor, null, new Map(), after);
  assert.deepEqual(backwards(at, after), []);
  assert.deepEqual(Object.fromEntries(at), { p: { x: 0, y: 0 }, m: { x: CELL_WIDTH, y: 0 }, k: { x: 2 * CELL_WIDTH, y: 0 } });
});

test("cards a person left where the layering would not have put them stay, when none of them has to move: a person's arrangement", () => {
  const onFloor = new Map([
    ['a', { x: 2 * CELL_WIDTH, y: 0 }],
    ['b', { x: 0, y: CELL_HEIGHT }],
  ]);
  const after = new Map([['b', ['a']]]);
  assert.deepEqual(placeRuns(['a', 'b'], onFloor, null, new Map(), after), onFloor);
});

test("where a run stands, in the start form's word: called off, waiting on you — a step, or a run it waits on that never ships — in flight, or finished", () => {
  assert.equal(standingOf(run([], { status: 'cancelled', cancelledAt })), 'cancelled');
  // Never filed a step, and never will without a person: not finished, whatever `inFlight` says.
  assert.equal(standingOf(run(['waiting on p (cancelled)'], { after: ['p'], waiting: waitingOn(true) })), 'waiting on you');
  assert.equal(standingOf(run(['succeeded · BLOCKED'], { status: 'failed', waitingOnYou: ['step-0'] })), 'waiting on you');
  assert.equal(standingOf(run(['waiting on p'], { moving: true, after: ['p'], waiting: waitingOn(false) })), 'in flight');
  assert.equal(standingOf(run(['verified ✓'], { status: 'succeeded' })), 'finished');
});

// ─── what the third review found ─────────────────────────────────────────────

/** The triangle: a; then b; then d, after both — `api` after `schema`, `web` after the two. */
const TRIANGLE = new Map([
  ['b', ['a']],
  ['d', ['a', 'b']],
]);

test("a graph unfolding over a card whose group also waits on the opened run's parent: the card no graph covered stays, and no edge runs backwards", () => {
  const ids = ['a', 'b', 'd'];
  const fresh = placeRuns(ids, new Map(), null, new Map(), TRIANGLE);
  assert.deepEqual(
    [...fresh.values()],
    [
      { x: 0, y: 0 },
      { x: CELL_WIDTH, y: 0 },
      { x: 2 * CELL_WIDTH, y: 0 },
    ],
    'laid out fresh, a row',
  );
  // b opened across three cells: over d, and not a. Laid out again together, a would have to be left of b and d right of b, one column apart.
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const at = placeRuns(ids, fresh, null, spans, TRIANGLE);
  assert.deepEqual(backwards(at, TRIANGLE), [], 'every run left of each run that waits on it');
  assert.deepEqual(overlapping(at, spans), []);
  assert.deepEqual(at.get('a'), { x: 0, y: 0 }, 'a, which no graph covered, stays where it is');
  assert.deepEqual(placeRuns(ids, at, null, spans, TRIANGLE), at, 'and the pass after moves nothing');
});

test('a diamond whose bottom also waits on its top, one side opened over the bottom: laid out again where it can be, and no edge runs backwards', () => {
  const skip = new Map([...DIAMOND, ['d', ['b', 'c', 'a']]]);
  const ids = ['a', 'b', 'c', 'd'];
  const fresh = placeRuns(ids, new Map(), null, new Map(), skip);
  const spans = new Map([['b', { columns: 3, rows: 1 }]]);
  const at = placeRuns(ids, fresh, null, spans, skip);
  assert.deepEqual(backwards(at, skip), []);
  assert.deepEqual(overlapping(at, spans), []);
  assert.deepEqual(placeRuns(ids, at, null, spans, skip), at);
});

test("who a run waits on, on the Runs row, is `wf ls`'s words where the api gives them — `approve plan` — and the steps by name from an api that gives none, never a throw", () => {
  const gated = run(['awaiting approval', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'], onYou: ['approve step-0'] });
  assert.deepEqual(onYouOf(gated), ['approve step-0']);
  // A list from an api started before it carried `onYou`: the Factory polls it, so it is read as that api said it, not refused.
  const { onYou: _onYou, ...before } = gated;
  assert.deepEqual(onYouOf(before), ['step-0']);
  assert.deepEqual(onYouOf({ ...before, waitingOnYou: [] }), []);
});

test("a card's clock counts from when the run started — its first filing — not from when it was created: the wait before is waiting, and said on hover", () => {
  // 7fev, 2026-09-20: created, waited 4h 29m on its parent, then worked 1h 45m. Its card said about 6h.
  const createdAt = '2026-09-20T08:00:00.000Z';
  const startedAt = '2026-09-20T12:29:00.000Z';
  const now = Date.parse('2026-09-20T14:14:00.000Z');
  const going = { createdAt, startedAt, cancelledAt: null, waiting: null };
  const clock = runClock(going, now, false);
  assert.deepEqual([clock.words, clock.at], ['1h 45m since it started', startedAt]);
  assert.ok(clock.title.startsWith(`Started ${new Date(startedAt).toLocaleString()}.`), clock.title);
  assert.ok(
    clock.title.endsWith(`Created ${new Date(createdAt).toLocaleString()}, and waited 4h 29m before its first step was filed.`),
    clock.title,
  );
  assert.equal(waitedMs(going), (4 * 60 + 29) * 60_000);
  // Finished: when it started, not a clock still counting — from the start too.
  assert.equal(runClock(going, now, true).words, 'started 1h 45m ago');
  assert.deepEqual([clockCounts(going, false), clockCounts(going, true)], [true, false]);

  // Started at once — or started with its filings off the feed, when the api gives createdAt: no wait to speak of.
  const atOnce = runClock({ ...going, startedAt: createdAt }, now, false);
  assert.deepEqual([atOnce.words, atOnce.title], ['6h 14m since it started', `Started ${new Date(createdAt).toLocaleString()}.`]);
});

test('REFUSED: a run nothing of which is filed has no time at work — it is waiting, and for how long, whether it waits on runs, for a slot, or on you; called off first, it never started', () => {
  const createdAt = '2026-09-20T08:00:00.000Z';
  const now = Date.parse('2026-09-20T12:29:00.000Z');
  const waiting = {
    runs: [],
    word: 'waiting on 7a87',
    advice: 'nothing of 7fev is filed until wf decide says 7a87 has shipped onto main',
    onYou: false,
  };
  const onRuns = runClock({ createdAt, startedAt: null, cancelledAt: null, waiting }, now, false);
  assert.deepEqual([onRuns.words, onRuns.at], ['waiting for 4h 29m', createdAt]);
  assert.equal(onRuns.title, `Created ${new Date(createdAt).toLocaleString()}. Nothing of it is filed yet: waiting on 7a87.`);
  assert.doesNotMatch(onRuns.words, /since it started|started .* ago/);
  // Held for a slot, or its parents shipped and the next pass yet to file it: nothing to name, and waiting all the same.
  assert.equal(runClock({ createdAt, startedAt: null, cancelledAt: null, waiting: null }, now, false).words, 'waiting for 4h 29m');
  // On a run that never ships without a person: off the moving floor, `finished`, and still waiting — its clock still counts.
  const onYou = { createdAt, startedAt: null, cancelledAt: null, waiting: { ...waiting, onYou: true } };
  assert.equal(runClock(onYou, now, true).words, 'waiting for 4h 29m');
  assert.equal(clockCounts(onYou, true), true);
  assert.equal(waitedMs(onYou), null);
  // Called off before anything of it was filed: it never started, and waits for nothing.
  const called = { createdAt, startedAt: null, cancelledAt: '2026-09-20T09:00:00.000Z', waiting: null };
  assert.deepEqual(
    [runClock(called, now, true).words, runClock(called, now, true).title],
    ['created 4h 29m ago', `Created ${new Date(createdAt).toLocaleString()}. Called off before anything of it was filed.`],
  );
  assert.equal(clockCounts(called, true), false);
});

/** What the api says of a run a person holds until `p` ships (`wf hold`): a hold that lifts on its own, or one only a person lifts. */
const holdingOn = (onYou: boolean): NonNullable<RunSummary['holding']> => ({
  at: '2026-09-13T00:30:00.000Z',
  runs: [{ run: 'p', missing: false, cancelledAt: onYou ? cancelledAt : null, gone: [], shipped: false }],
  word: 'held until p ships',
  advice: onYou
    ? 'p was cancelled — yours to resolve: wf hold r-1 --off, or wf cancel r-1'
    : 'nothing of r-1 is filed, and nothing is asked of you, until wf decide says p has shipped; to go on before then: wf hold r-1 --off',
  onYou,
});

test('a run held until runs that may still ship is in flight; one only a person lifts is not, and waits on you — as a run waiting `--after` runs', () => {
  // A step at its gate, held: `assess` calls a held run running whatever its steps say, and the api says nothing waits on you, and nothing moves.
  const gated = { status: 'running', moving: false, waitingOnYou: [] as string[], waiting: null };
  const lifts = run(['awaiting approval', 'waiting'], { ...gated, heldUntil: ['p'], holding: holdingOn(false) });
  assert.deepEqual([inFlight(lifts), waitsOnYou(lifts)], [true, false]);
  const yours = run(['awaiting approval', 'waiting'], { ...gated, heldUntil: ['p'], holding: holdingOn(true) });
  assert.deepEqual([inFlight(yours), waitsOnYou(yours)], [false, true]);
  // A step of it still at work when the hold was written moves, and is in flight whoever lifts the hold.
  assert.equal(inFlight({ ...yours, moving: true }), true);
  // A run called off waits on nobody, held or not.
  const off = run(['awaiting approval', 'waiting'], {
    ...gated,
    status: 'cancelled',
    cancelledAt,
    heldUntil: ['p'],
    holding: holdingOn(true),
  });
  assert.deepEqual([inFlight(off), waitsOnYou(off)], [false, false]);
  // Where the run stands on the start form, in the same words.
  assert.deepEqual([standingOf(lifts), standingOf(yours)], ['in flight', 'waiting on you']);
});

test('a held run stays on the floor while it is held, and brings the finished run it is held until, so the edge into it leaves from a card', () => {
  const runs = [
    run([], { id: 'p', status: 'succeeded', createdAt: at(0) }),
    run(['awaiting approval'], { id: 'h', status: 'running', heldUntil: ['p'], holding: holdingOn(false), createdAt: at(1) }),
    // Held until a run that is not listed at all: its card stays, and brings nothing.
    run(['awaiting approval'], { id: 'q', status: 'running', heldUntil: ['gone'], holding: holdingOn(true), createdAt: at(2) }),
  ];
  assert.deepEqual(
    floorRuns(runs, false).map((r) => r.id),
    ['p', 'h', 'q'],
  );
  // Lifted, off runs that had finished: the api lists no run and no hold, and says each run's own status again, and the parent goes with them.
  const lifted = runs.map((r) => ({
    ...r,
    heldUntil: [],
    holding: null,
    status: r.id === 'p' ? ('succeeded' as const) : ('failed' as const),
  }));
  assert.deepEqual(
    floorRuns(lifted, false).map((r) => r.id),
    [],
  );
});

test('an edge from each run a card is held until, both on the floor, drawn as an `after` edge — to come while the hold stands, whether or not the card started — and none where an `after` edge already joins the two', () => {
  const edges = runEdges([
    run(['verified ✓'], { id: 'a' }),
    run(['running (working)'], { id: 'b' }),
    // Started, and held until a and b: two edges to come, whatever its steps say.
    run(['awaiting approval'], { id: 'h', heldUntil: ['a', 'b', 'a', 'off-the-floor', 'h'] }),
    // Waiting on a and held until it too: one edge, the `after` one.
    run(['waiting'], { id: 'd', after: ['a'], heldUntil: ['a'] }),
    // An api older than the hold lists no `heldUntil`: no edge, and no refusal.
    run(['waiting'], { id: 'e' }),
  ]);
  assert.deepEqual(edges, [
    { id: 'hold:a->h', source: 'a', target: 'h', state: 'to-come' },
    { id: 'hold:b->h', source: 'b', target: 'h', state: 'to-come' },
    { id: 'after:a->d', source: 'a', target: 'd', state: 'to-come' },
  ]);
  // Lifted: the api lists no run, and the edge goes.
  assert.deepEqual(runEdges([run(['verified ✓'], { id: 'a' }), run(['awaiting approval'], { id: 'h', heldUntil: [] })]), []);
});
