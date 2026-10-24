/**
 * The Factory floor (src/lib/factory.ts), as tables of one function's cases each: where a run stands and who it waits on, a card's
 * words, where a closed card goes and what is kept of a person's arrangement, the cells an open card spans, the cards an open graph
 * moves, the runs on the floor, the edges between cards, the layering of runs joined by `after`, and a card's clock. `npm run e2e`
 * looks at the floor itself (`010-factory`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunSummary } from '../src/lib/api.ts';
import { coded, type Word } from './run-fixtures.ts';
import {
  byAge,
  clockCounts,
  CARD_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  GRID_COLUMNS,
  floorRuns,
  inFlight,
  keepLayout,
  NARROW_CELL_WIDTH,
  onYouOf,
  ONE_CELL,
  openSpan,
  placeRuns,
  repoName,
  runEdges,
  contextEdges,
  runClock,
  standingOf,
  TILES_FRAME,
  titleOf,
  toDecideOf,
  toggleOpen,
  unfoldingNow,
  waitedMs,
  waitsOnRuns,
  waitsOnYou,
  widenLayout,
  type Span,
} from '../src/lib/factory.ts';
import { ENDED } from '../src/lib/words.ts';
import { runsIn } from '../src/lib/factories.ts';
import { tilesOf } from '../src/lib/flow.ts';
import { instantWhole } from '../src/lib/instant.ts';
import type { Point } from '../src/lib/layout.ts';

/**
 * A run with one step per status, filed unless it is still waiting, and `status` and `moving` as the api put them; its `waitingOnYouWords`,
 * `wf ls`'s words for who it waits on, is the steps `waitingOnYou` names unless `extra` gives it.
 */
const run = (statuses: readonly Word[], extra: Partial<RunSummary> = {}): RunSummary => ({
  id: 'r-1',
  repo: '/code/app',
  factory: null,
  place: 'repository',
  work: null,
  brief: 'Do the thing',
  workflowDir: '/code/app/workflows/dev',
  workflowPage: null,
  try: null,
  createdAt: '2026-09-13T00:00:00.000Z',
  startedAt: null,
  cancelledAt: null,
  pruned: null,
  status: 'running',
  phase: 'running',
  reason: 'Running',
  on: null,
  via: null,
  moving: false,
  cost: null,
  atWork: null,
  tokens: null,
  steps: statuses.map((status, i) => ({
    name: `step-${i}`,
    taskId: status === 'waiting' ? null : `t-${i}`,
    branch: null,
    ...coded(status),
    note: null,
    roundDue: false,
    agent: null,
    since: null,
    needs: null,
    blockedByHarness: false,
    waitingFor: null,
    approve: null,
    denied: null,
    sessionUnread: null,
  })),
  graph: { roots: [], edges: [] },
  waitingOnYou: [],
  waitingOnYouWords: extra.waitingOnYou ?? [],
  after: [],
  waiting: null,
  context: [],
  holdUntil: [],
  holding: null,
  toDecide: null,
  unreadable: null,
  ...extra,
});

const cancelledAt = '2026-09-13T01:00:00.000Z';

test("titleOf and repoName: a card's title and its repo", async (t) => {
  await t.test("a card's title is the brief's first line with words on it, or the run id", () => {
    assert.equal(titleOf({ id: 'r-1', brief: '# Add a cache\n\nKeep it small.' }), 'Add a cache');
    assert.equal(titleOf({ id: 'r-1', brief: '\n\n  Give the board a menu  \nmore' }), 'Give the board a menu');
    assert.equal(titleOf({ id: 'r-1', brief: '' }), 'r-1');
    assert.equal(titleOf({ id: 'r-1', brief: '##\n  \n' }), 'r-1');
  });
  await t.test('a card names the repo by its folder', () => {
    assert.equal(repoName('/home/me/projects/hkb-v2'), 'hkb-v2');
    assert.equal(repoName('/home/me/projects/hkb-v2/'), 'hkb-v2');
    assert.equal(repoName('C:\\code\\app'), 'app');
    assert.equal(repoName('/'), '/');
  });
});

/** An open card's tiles, for steps each after the ones named, all waiting: their size is what the span reads. */
const tiles = (steps: Record<string, string[]>) =>
  tilesOf(
    Object.keys(steps),
    { roots: [], edges: Object.entries(steps).flatMap(([to, after]) => after.map((from) => ({ from, to, kind: 'after' as const }))) },
    Object.keys(steps).map((name) => ({ name, state: 'waiting' as const, note: null, roundDue: false })),
    false,
  );
/** A chain of `n` steps, each after the one before. */
const chain = (n: number) => tiles(Object.fromEntries(Array.from({ length: n }, (_, i) => [`s${i}`, i ? [`s${i - 1}`] : []])));
/** The e2e's fake run: two lanes, one a fan-in. implement → review → respond, implement → respond; tokens → theme. */
const fake = tiles({ implement: [], review: ['implement'], respond: ['review', 'implement'], tokens: [], theme: ['tokens'] });
const diamond = tiles({ plan: [], api: ['plan'], web: ['plan'], docs: ['plan'], merge: ['api', 'web', 'docs'], ship: ['merge'] });

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

test('placeRuns: where a closed card goes, fresh or as last left, and what is kept of it', async (t) => {
  await t.test('runs go on the floor oldest first, so a new one takes the next cell and moves nobody', () => {
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
  await t.test('laid out fresh, the cards fill the grid row by row', () => {
    assert.equal(GRID_COLUMNS, 4, 'the cells below assume four to a row');
    assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b', 'c', 'd', 'e'], new Map(), null)), {
      a: { x: 0, y: 0 },
      b: { x: CELL_WIDTH, y: 0 },
      c: { x: 2 * CELL_WIDTH, y: 0 },
      d: { x: 3 * CELL_WIDTH, y: 0 },
      e: { x: 0, y: CELL_HEIGHT },
    });
  });
  await t.test('a card goes where it was left, and a new one into the first cell no card is in', () => {
    const at = placeRuns(
      ['r-1', 'r-2', 'r-3', 'r-4', 'r-5', 'r-6'],
      new Map(),
      new Map([
        ['r-2', { x: 0, y: 0 }],
        ['r-4', { x: 2 * CELL_WIDTH + 10, y: -8 }],
        ['r-6', { x: -500, y: 40 }],
        ['finished', { x: CELL_WIDTH, y: 0 }],
      ]),
    );
    assert.deepEqual(
      Object.fromEntries(at),
      {
        'r-1': { x: CELL_WIDTH, y: 0 },
        'r-2': { x: 0, y: 0 },
        'r-3': { x: 3 * CELL_WIDTH, y: 0 },
        'r-4': { x: 2 * CELL_WIDTH + 10, y: -8 },
        'r-5': { x: 0, y: CELL_HEIGHT },
        'r-6': { x: -500, y: 40 },
      },
      'r-4, near the third cell, is in it; r-6, dragged off the grid, is in a cell beyond it; a run not on the floor is in no cell',
    );
  });
  await t.test('a card coming back onto the floor does not land on a card that took its cell meanwhile', () => {
    const saved = new Map([['a', { x: 0, y: 0 }]]);
    const hidden = placeRuns(['b'], new Map(), saved);
    assert.deepEqual(
      Object.fromEntries(hidden),
      { b: { x: 0, y: 0 } },
      'with a off the floor, b takes the first free cell, which is where a was saved',
    );
    assert.deepEqual(
      Object.fromEntries(placeRuns(['a', 'b'], hidden, saved)),
      {
        a: { x: CELL_WIDTH, y: 0 },
        b: { x: 0, y: 0 },
      },
      'a back on the floor moves, and b, on the floor where a person can see it, stays',
    );
  });
  await t.test('two cards saved in one cell: the older keeps it, the other takes a free cell', () => {
    const saved = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 12, y: 6 }],
      ['c', { x: CELL_WIDTH, y: 0 }],
    ]);
    assert.deepEqual(
      Object.fromEntries(placeRuns(['a', 'b', 'c'], new Map(), saved)),
      {
        a: { x: 0, y: 0 },
        b: { x: 2 * CELL_WIDTH, y: 0 },
        c: { x: CELL_WIDTH, y: 0 },
      },
      'a saved stack: the older keeps the cell, the other takes a free one',
    );
    const stacked = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 12, y: 6 }],
    ]);
    assert.deepEqual(
      Object.fromEntries(placeRuns(['a', 'b'], stacked, saved)),
      Object.fromEntries(stacked),
      'cards on the floor are never moved for one another, even stacked: a person put them there',
    );
  });
  await t.test('what is saved is every card as last left, and nothing for a run the store no longer lists', () => {
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
  await t.test("an arrangement saved while a cell was narrower is laid out on today's grid with no card over another", () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const narrow = new Map<string, Point>([
      ['a', { x: 0, y: 0 }],
      ['b', { x: NARROW_CELL_WIDTH, y: 0 }],
      ['c', { x: 2 * NARROW_CELL_WIDTH, y: 0 }],
      ['d', { x: 3 * NARROW_CELL_WIDTH, y: 0 }],
      ['e', { x: NARROW_CELL_WIDTH + 40, y: CELL_HEIGHT }],
    ]);
    assert.notDeepEqual(
      overlapping(placeRuns(ids, new Map(), narrow)),
      [],
      'read unchanged, each narrow point rounds to a cell of its own and is kept, and the cards cover each other',
    );
    const at = placeRuns(ids, new Map(), widenLayout(narrow));
    assert.deepEqual(overlapping(at), []);
    assert.deepEqual(
      Object.fromEntries(at),
      {
        a: { x: 0, y: 0 },
        b: { x: CELL_WIDTH, y: 0 },
        c: { x: 2 * CELL_WIDTH, y: 0 },
        d: { x: 3 * CELL_WIDTH, y: 0 },
        e: { x: CELL_WIDTH + (40 * CELL_WIDTH) / NARROW_CELL_WIDTH, y: CELL_HEIGHT },
      },
      'each card on the column it was on, as far into its cell, and on its row',
    );
    assert.equal(widenLayout(null), null);
  });
});

test('openSpan, toggleOpen and unfoldingNow: the cells an open card spans, and when it opens', async (t) => {
  await t.test('an open card spans its own cell and as many to the right as its tiles reach, and as many rows down', () => {
    assert.deepEqual(openSpan(chain(1)), { columns: 2, rows: 1 });
    assert.deepEqual(
      openSpan(fake),
      { columns: 3, rows: 1 },
      "the e2e's fake run: three columns of tiles, two lanes and the arc over them",
    );
    assert.deepEqual(openSpan(chain(3)), { columns: 3, rows: 1 });
    assert.deepEqual(openSpan(chain(5)), { columns: 4, rows: 1 });
    assert.deepEqual(openSpan(chain(7)), { columns: 5, rows: 1 }, 'wider than the grid');
    assert.deepEqual(openSpan(diamond), { columns: 4, rows: 2 }, 'three lanes are taller than a cell: the row below as well');
    assert.deepEqual(
      openSpan({ width: 0, height: 0 }),
      { columns: 2, rows: 1 },
      "never less than the card's own cell and the next: the tiles' frame alone reaches past its gap",
    );
    const gap = CELL_WIDTH - CARD_WIDTH;
    const across = 2 * CELL_WIDTH - gap - CARD_WIDTH - TILES_FRAME.across;
    assert.deepEqual(
      openSpan({ width: across, height: 88 }),
      { columns: 2, rows: 1 },
      "tiles whose right edge ends a gap short of a cell's edge",
    );
    assert.deepEqual(openSpan({ width: across + 1, height: 88 }), { columns: 3, rows: 1 }, 'tiles whose right edge ends a pixel past that');
    const down = CELL_HEIGHT - gap - TILES_FRAME.down;
    assert.deepEqual(openSpan({ width: 176, height: down }), { columns: 2, rows: 1 }, "tiles whose bottom ends a gap short of a row's");
    assert.deepEqual(openSpan({ width: 176, height: down + 1 }), { columns: 2, rows: 2 }, 'tiles whose bottom ends a pixel past that');
  });
  await t.test("an open card's span reads its steps and their graph, not their words: a status that moves moves no card", () => {
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
        { name: 'a', state: 'working', note: null, roundDue: false },
        { name: 'b', state: 'waiting', note: null, roundDue: false },
      ],
      false,
    );
    const later = tilesOf(
      ['a', 'b'],
      graph,
      [
        { name: 'a', state: 'verified', note: null, roundDue: false },
        { name: 'b', state: 'blocked', note: 'round 2 of 2', roundDue: false },
      ],
      true,
    );
    assert.deepEqual(openSpan(later), openSpan(now));
  });
  await t.test('a click opens a run, last in the order runs claim cells; another click closes it', () => {
    assert.deepEqual(toggleOpen([], 'a'), ['a']);
    assert.deepEqual(toggleOpen(['a'], 'b'), ['a', 'b']);
    assert.deepEqual(toggleOpen(['a', 'b'], 'a'), ['b']);
    assert.deepEqual(toggleOpen(toggleOpen(['b'], 'a'), 'a'), ['b']);
  });
  await t.test(
    'a card opens when it is drawn open and was not on the last pass: opened, or back on the floor open — never because it grew',
    () => {
      const one = new Map([['b', { columns: 3, rows: 1 }]]);
      const grown = new Map([['b', { columns: 3, rows: 2 }]]);
      const none = new Map<string, Span>();
      const ids = (set: ReadonlySet<string>) => [...set].sort();

      let pass = unfoldingNow(new Set(), one);
      assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [['b'], ['b']], 'opened by a click, it opens');
      pass = unfoldingNow(pass.drawn, grown);
      assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [[], ['b']], 'grown by a step its run gained, it does not open again');

      pass = unfoldingNow(pass.drawn, none);
      assert.deepEqual([ids(pass.unfolding), ids(pass.drawn)], [[], []], 'off the floor, or closed, it is forgotten');
      pass = unfoldingNow(pass.drawn, one);
      assert.deepEqual(ids(pass.unfolding), ['b'], 'so back on the floor open, it opens again');

      pass = unfoldingNow(new Set(['b']), one);
      assert.deepEqual(
        [ids(pass.unfolding), ids(pass.drawn)],
        [[], ['b']],
        'left open on the last visit, the floor starts with it remembered, so it opens over nobody',
      );
    },
  );
});

test("placeRuns: an open run's graph moves the cards it covers, and never one a person put there", async (t) => {
  await t.test('a run opening moves the cards its graph now covers, never itself, and no card beside it', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const fresh = placeRuns(ids, new Map(), null);
    const spans = new Map([['b', { columns: 3, rows: 1 }]]);
    const opened = placeRuns(ids, fresh, null, spans);
    assert.deepEqual(
      Object.fromEntries(opened),
      {
        a: { x: 0, y: 0 },
        b: { x: CELL_WIDTH, y: 0 },
        c: { x: CELL_WIDTH, y: CELL_HEIGHT },
        d: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
        e: { x: 0, y: CELL_HEIGHT },
      },
      "c and d, under b's graph, take the first free cells, in age order",
    );
    assert.deepEqual(overlapping(opened, spans), []);
    assert.deepEqual(placeRuns(ids, opened, null, spans), opened, 'the same pass again moves nothing: the layout is level-triggered');

    const started = placeRuns([...ids, 'f'], opened, null, spans);
    assert.deepEqual(
      started.get('f'),
      { x: 3 * CELL_WIDTH, y: CELL_HEIGHT },
      'a run that starts while b is open does not land in its graph',
    );
    assert.deepEqual(overlapping(started, spans), []);

    const closed = placeRuns([...ids, 'f'], opened, null);
    assert.deepEqual(
      Object.fromEntries([...closed].filter(([id]) => id !== 'f')),
      Object.fromEntries(opened),
      'closed again, b takes its one cell and nobody moves back',
    );
    assert.deepEqual(closed.get('f'), { x: 2 * CELL_WIDTH, y: 0 }, 'and the next run takes the first free cell');
    assert.deepEqual(overlapping(closed), []);
  });
  await t.test('two open runs whose graphs meet: the one opened last stays, and the other moves to a row with room', () => {
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
  await t.test('a graph wider than the grid starts a row, and a tall one keeps the rows it covers', () => {
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
  await t.test("a card coming back onto the floor does not land in an open run's graph", () => {
    const spans = new Map([['b', { columns: 3, rows: 1 }]]);
    const at = placeRuns(['a', 'b'], new Map([['b', { x: 0, y: 0 }]]), new Map([['a', { x: CELL_WIDTH, y: 0 }]]), spans);
    assert.deepEqual(Object.fromEntries(at), { a: { x: 3 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 } });
    assert.deepEqual(overlapping(at, spans), []);
  });
  await t.test(
    'an open run dropped over closed cards leaves them under it, and the pass after moves nothing: that is where a person put it',
    () => {
      const ids = ['a', 'b', 'c', 'd'];
      const spans = new Map([['b', { columns: 4, rows: 1 }]]);
      const dropped = new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: 0, y: CELL_HEIGHT }],
        ['c', { x: CELL_WIDTH, y: CELL_HEIGHT }],
        ['d', { x: 2 * CELL_WIDTH, y: CELL_HEIGHT }],
      ]);
      const at = placeRuns(ids, dropped, null, spans, new Map(), new Set());
      assert.deepEqual(
        Object.fromEntries(at),
        Object.fromEntries(dropped),
        'b, open across four cells and dropped over c and d, leaves them under it: nothing unfolds on a drop, and each card moves alone',
      );
      assert.deepEqual(placeRuns(ids, at, null, spans, new Map(), new Set()), at, 'and the pass after moves nothing');
      const opened = placeRuns(ids, dropped, null, spans, new Map(), new Set(['b']));
      assert.deepEqual(
        Object.fromEntries(opened),
        {
          a: { x: 0, y: 0 },
          b: { x: 0, y: CELL_HEIGHT },
          c: { x: CELL_WIDTH, y: 0 },
          d: { x: 2 * CELL_WIDTH, y: 0 },
        },
        'the same floor with b unfolding now, opened rather than dropped, moves c and d out from under its graph',
      );
      assert.deepEqual(overlapping(opened, spans), []);
    },
  );
  await t.test("a closed card dropped on an open run's graph stays there, and so does the graph", () => {
    const spans = new Map([['b', { columns: 3, rows: 1 }]]);
    const onFloor = new Map([
      ['a', { x: CELL_WIDTH + 12, y: 8 }],
      ['b', { x: 0, y: 0 }],
    ]);
    assert.deepEqual(Object.fromEntries(placeRuns(['a', 'b'], onFloor, null, spans, new Map(), new Set())), Object.fromEntries(onFloor));
  });
  await t.test(
    'on the next visit, a card saved over an open card is a stack saved, as two in one cell are: the open card keeps its cells, the other takes a free one',
    () => {
      const spans = new Map([['b', { columns: 2, rows: 1 }]]);
      const saved = new Map([
        ['a', { x: CELL_WIDTH + 12, y: 8 }],
        ['b', { x: 0, y: 0 }],
        ['c', { x: 0, y: CELL_HEIGHT }],
      ]);
      const at = placeRuns(['a', 'b', 'c'], new Map(), saved, spans, new Map(), new Set());
      assert.deepEqual(
        Object.fromEntries(at),
        { a: { x: 2 * CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 }, c: { x: 0, y: CELL_HEIGHT } },
        "as the floor starts, with nothing on it and nothing opening: a, saved over b's second cell, takes a free cell, and c keeps its own",
      );
      assert.deepEqual(overlapping(at, spans), []);
      assert.deepEqual(
        placeRuns(['b', 'a', 'c'], new Map(), saved, spans, new Map(), new Set()),
        at,
        'older than a or not, the open card claims first: a card just opened is never the one moved aside',
      );
    },
  );
  await t.test("a card left over an open run's graph stays when a run starts, and the run that starts takes a cell clear of both", () => {
    const spans = new Map([['b', { columns: 3, rows: 1 }]]);
    const onFloor = new Map([
      ['a', { x: CELL_WIDTH, y: 0 }],
      ['b', { x: 0, y: 0 }],
    ]);
    const at = placeRuns(['a', 'b', 'c'], onFloor, null, spans, new Map(), new Set());
    assert.deepEqual(Object.fromEntries(at), { a: { x: CELL_WIDTH, y: 0 }, b: { x: 0, y: 0 }, c: { x: 3 * CELL_WIDTH, y: 0 } });
  });
  await t.test(
    'an open card grown by a step its run gained claims the cells it now reaches for the runs that start, and moves no card already there',
    () => {
      const grown = new Map([['b', { columns: 2, rows: 2 }]]);
      const onFloor = new Map([
        ['b', { x: 0, y: 0 }],
        ['c', { x: CELL_WIDTH, y: CELL_HEIGHT }],
      ]);
      const at = placeRuns(['b', 'c', 'd'], onFloor, null, grown, new Map(), new Set());
      assert.deepEqual(at.get('c'), { x: CELL_WIDTH, y: CELL_HEIGHT }, 'c stays under the row b grew into');
      assert.deepEqual(at.get('d'), { x: 2 * CELL_WIDTH, y: 0 }, 'and d takes the first cell clear of it');
    },
  );
  await t.test('an open run back on the floor moves the card that started under it while it was away', () => {
    const saved = new Map([
      ['f', { x: 0, y: 0 }],
      ['c', { x: CELL_WIDTH, y: 0 }],
    ]);
    const away = new Map([['c', { x: CELL_WIDTH, y: 0 }]]);
    const open = new Map([['f', { columns: 3, rows: 1 }]]);
    const back = placeRuns(['f', 'c'], away, saved, open, new Map(), unfoldingNow(new Set(), open).unfolding);
    assert.deepEqual(
      Object.fromEntries(back),
      { f: { x: 0, y: 0 }, c: { x: 3 * CELL_WIDTH, y: 0 } },
      'f, left open across three cells and away while c started beside it, goes back to its cell open, and c moves aside',
    );
    assert.deepEqual(overlapping(back, open), []);
    assert.deepEqual(
      placeRuns(['f', 'c'], away, saved, open, new Map(), unfoldingNow(new Set(['f']), open).unfolding).get('c'),
      {
        x: CELL_WIDTH,
        y: 0,
      },
      "had f been on the last pass, drawn as it was, c would be the person's to leave there",
    );
    const inIts = new Map([['c', { x: 0, y: 0 }]]);
    const elsewhere = placeRuns(['f', 'c'], inIts, saved, open, new Map(), new Set(['f']));
    assert.deepEqual(
      Object.fromEntries(elsewhere),
      { f: { x: CELL_WIDTH, y: 0 }, c: { x: 0, y: 0 } },
      "a card that started in f's own cell stays, and f takes a free place, as a card coming back closed would",
    );
  });
  await t.test("a graph running past the grid's edge moves a card parked beyond it, and one parked clear of it stays", () => {
    const spans = new Map([['b', { columns: 4, rows: 1 }]]);
    const onFloor = new Map([
      ['a', { x: 0, y: 0 }],
      ['b', { x: 3 * CELL_WIDTH, y: 0 }],
      ['c', { x: 4 * CELL_WIDTH, y: 0 }],
    ]);
    const at = placeRuns(['a', 'b', 'c'], onFloor, null, spans);
    assert.deepEqual(
      Object.fromEntries(at),
      { a: { x: 0, y: 0 }, b: { x: 3 * CELL_WIDTH, y: 0 }, c: { x: CELL_WIDTH, y: 0 } },
      "b, open at the grid's last column across four cells, moves c, left right of the grid in its row",
    );
    assert.deepEqual(overlapping(at, spans), []);

    const clear = new Map([...onFloor, ['c', { x: 8 * CELL_WIDTH, y: 0 }]]);
    assert.deepEqual(
      placeRuns(['a', 'b', 'c'], clear, null, spans).get('c'),
      { x: 8 * CELL_WIDTH, y: 0 },
      "a card parked clear of b's graph stays",
    );

    const wide = new Map([['w', { columns: 6, rows: 1 }]]);
    const parked = placeRuns(['p', 'w'], new Map([['p', { x: 5 * CELL_WIDTH, y: 0 }]]), null, wide);
    assert.deepEqual(
      Object.fromEntries(parked),
      { p: { x: 5 * CELL_WIDTH, y: 0 }, w: { x: 0, y: CELL_HEIGHT } },
      'a run wider than the grid, placed fresh, does not start a row where a card is parked past the edge',
    );
    assert.deepEqual(overlapping(parked, wide), []);
  });
});

/** What the api says a run waiting on `p` waits on: a run that may still land, or one that was cancelled and never will. */
const waitingOn = (onYou: boolean): RunSummary['waiting'] => ({
  runs: [{ run: 'p', missing: false, cancelledAt: onYou ? cancelledAt : null, gone: [] }],
  word: onYou ? 'waiting on p (cancelled)' : 'waiting on p',
  advice: onYou
    ? `p was cancelled at ${cancelledAt}, and a cancelled run never lands — yours to resolve: wf cancel r-1, or start the work again without --after p`
    : 'nothing of r-1 is filed until wf decide says p has landed onto main; nothing to decide yet',
  waitingOnYou: onYou,
});

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 14, 0, minutes)).toISOString();

/** What the api says of a card that still waits on `runs` before anything of it is filed (`RunWaiting`). */
const waitsOn = (...runs: string[]): RunSummary['waiting'] => ({
  runs: runs.map((run) => ({ run, missing: false, cancelledAt: null, gone: [] })),
  word: `waiting on ${runs.join(', ')}`,
  advice: '',
  waitingOnYou: false,
});

/** What a person has to decide, as the api words it (`RunToDecide`): an ending step's gate, or a branch nobody merged. */
const approve = (id: string, step: string): RunSummary['toDecide'] => ({
  kind: 'approve',
  step,
  says: 'Merge it onto the base branch.',
  filed: false,
  back: [step],
  onto: 'main',
  said: `Merge it onto the base branch. — wf approve ${id} ${step}`,
  command: `wf approve ${id} ${step}`,
});
const merge = (id: string, branch: string): RunSummary['toDecide'] => ({
  kind: 'result',
  branches: [branch],
  said: `${branch} is ahead of main, and nothing has merged it — wf decide ${id}`,
  command: `wf decide ${id}`,
});

/** The diamond: a, then b and c together, then d. */
const DIAMOND = new Map([
  ['b', ['a']],
  ['c', ['a']],
  ['d', ['b', 'c']],
]);

/** Each `after` edge between placed cards whose parent does not stand a column or more left of its child, as `parent->child`. */
function backwards(at: ReadonlyMap<string, Point>, after: ReadonlyMap<string, readonly string[]>): string[] {
  const column = (id: string) => Math.round(at.get(id)!.x / CELL_WIDTH);
  return [...after].flatMap(([child, parents]) =>
    parents.filter((p) => at.has(p) && at.has(child) && column(p) >= column(child)).map((p) => `${p}->${child}`),
  );
}

/** The triangle: a; then b; then d, after both — `api` after `schema`, `web` after the two. */
const TRIANGLE = new Map([
  ['b', ['a']],
  ['d', ['a', 'b']],
]);

test('placeRuns: runs joined by `after` are layered left to right, and stay so as graphs unfold', async (t) => {
  await t.test(
    'runs joined by `after`, laid out fresh, are layered: each a column right of every run it waits on, and level with their middle — a diamond reads as one',
    () => {
      const ids = ['a', 'b', 'c', 'd'];
      const at = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
      assert.deepEqual(Object.fromEntries(at), {
        a: { x: 0, y: CELL_HEIGHT / 2 },
        b: { x: CELL_WIDTH, y: 0 },
        c: { x: CELL_WIDTH, y: CELL_HEIGHT },
        d: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT / 2 },
      });
      assert.deepEqual(overlapping(at), []);
      assert.deepEqual(placeRuns(ids, at, null, new Map(), DIAMOND), at, 'on the floor, nothing moves');
      assert.deepEqual(
        [...placeRuns(ids, new Map(), null).values()].map((p) => p.y),
        [0, 0, 0, 0],
        'given no edges, the same runs fill the grid row by row',
      );
    },
  );
  await t.test(
    'a card beside the diamond keeps the grid, and one placed after it lands on no half of a card the layering put between two rows',
    () => {
      const at = placeRuns(['e', 'a', 'b', 'c', 'd', 'f'], new Map(), null, new Map(), DIAMOND);
      assert.deepEqual(
        Object.fromEntries(at),
        {
          e: { x: 0, y: 0 },
          a: { x: CELL_WIDTH, y: CELL_HEIGHT / 2 },
          b: { x: 2 * CELL_WIDTH, y: 0 },
          c: { x: 2 * CELL_WIDTH, y: CELL_HEIGHT },
          d: { x: 3 * CELL_WIDTH, y: CELL_HEIGHT / 2 },
          f: { x: 0, y: CELL_HEIGHT },
        },
        "the diamond goes in the first place it fits whole, where a, halfway down, is clear of e's cell; f is not under a, which straddles the row",
      );
      assert.deepEqual(overlapping(at), []);
    },
  );
  await t.test('a card a person dropped between two rows holds both, so the card placed next is not drawn over its foot', () => {
    const dropped = new Map([['a', { x: 0, y: CELL_HEIGHT - 45 }]]);
    const at = placeRuns(['a', 'b'], dropped, null);
    assert.deepEqual(at.get('a'), { x: 0, y: CELL_HEIGHT - 45 }, 'a person put it there, and it stays');
    assert.deepEqual(
      at.get('b'),
      { x: CELL_WIDTH, y: 0 },
      'and the next card goes beside it, not into the row it hangs into, where it would be drawn over its top',
    );
    assert.deepEqual(
      Object.fromEntries(placeRuns(['a', 'b'], new Map([['a', { x: 0, y: CELL_HEIGHT / 2 }]]), null)),
      {
        a: { x: 0, y: CELL_HEIGHT / 2 },
        b: { x: CELL_WIDTH, y: 0 },
      },
      'a card the layering puts halfway down a row holds both rows too',
    );
    assert.deepEqual(
      Object.fromEntries(placeRuns(['a', 'b'], new Map([['a', { x: 0, y: CELL_HEIGHT }]]), null)),
      {
        a: { x: 0, y: CELL_HEIGHT },
        b: { x: 0, y: 0 },
      },
      'on the grid, a card holds its own row and no other: the floor fills row by row',
    );
  });
  await t.test(
    'a run that starts while the runs it waits on are on the floor goes right of the rightmost of them — past the grid, rather than left of one',
    () => {
      const onFloor = new Map([
        ['a', { x: 0, y: 0 }],
        ['b', { x: CELL_WIDTH, y: 0 }],
        ['x', { x: 2 * CELL_WIDTH, y: 0 }],
      ]);
      const at = placeRuns(['a', 'b', 'x', 'd'], onFloor, null, new Map(), new Map([['d', ['a', 'b']]]));
      assert.deepEqual(
        at.get('d'),
        { x: 3 * CELL_WIDTH, y: 0 },
        'right of b, in the first cell there no card is in: x has the one beside b',
      );
      const edge = placeRuns(['b', 'd'], new Map([['b', { x: 3 * CELL_WIDTH, y: 0 }]]), null, new Map(), new Map([['d', ['b']]]));
      assert.deepEqual(edge.get('d'), { x: 4 * CELL_WIDTH, y: 0 });
    },
  );
  await t.test('an open run is placed on its own, and the cards that wait on it layered right of it, clear of its graph', () => {
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
  await t.test(
    'runs whose `after` goes round, as only a record edited by hand could, are placed a card at a time, and the layout ends',
    () => {
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
    },
  );
  await t.test(
    "a graph unfolding over the diamond's top, one side and its bottom, and not the other side, moves the whole diamond: it still reads as one",
    () => {
      const ids = ['a', 'b', 'c', 'd'];
      const fresh = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
      const spans = new Map([['x', { columns: 3, rows: 1 }]]);
      const onFloor = new Map([...fresh, ['x', { x: 0, y: 0 }]]);
      const at = placeRuns(['x', ...ids], onFloor, null, spans, DIAMOND);
      assert.deepEqual(backwards(at, DIAMOND), [], 'every run left of each run that waits on it');
      assert.deepEqual(
        overlapping(at, spans),
        [],
        "x, open across the first row's first three cells over a, b and d and not c, covers no card",
      );
      const [a, b, c, d] = ids.map((id) => at.get(id)!);
      assert.deepEqual(
        [a.y, d.y],
        [(b.y + c.y) / 2, (b.y + c.y) / 2],
        'laid out together, as the diamond it was: the top and bottom level with the middle of the sides',
      );
      assert.deepEqual(placeRuns(['x', ...ids], at, null, spans, DIAMOND), at, 'and the pass after moves nothing');
    },
  );
  await t.test(
    'one card of the diamond moved aside by a graph takes the rest of the diamond with it, rather than landing right of the run that waits on it',
    () => {
      const ids = ['a', 'b', 'c', 'd'];
      const fresh = placeRuns(ids, new Map(), null, new Map(), DIAMOND);
      const spans = new Map([['x', { columns: 1, rows: 1 }]]);
      const at = placeRuns(['x', ...ids], new Map([...fresh, ['x', fresh.get('c')!]]), null, spans, DIAMOND);
      assert.deepEqual(backwards(at, DIAMOND), [], 'x, open over c alone, moves the whole diamond: no edge runs backwards');
      assert.deepEqual(overlapping(at, spans), []);
    },
  );
  await t.test(
    'a card coming onto the floor goes left of a card on the floor that waits on it — below, when the cell left of it is taken — never right',
    () => {
      const onFloor = new Map([
        ['x', { x: 0, y: 0 }],
        ['b', { x: CELL_WIDTH, y: 0 }],
      ]);
      const at = placeRuns(['x', 'a', 'b'], onFloor, null, new Map(), new Map([['b', ['a']]]));
      assert.deepEqual(
        Object.fromEntries(at),
        { x: { x: 0, y: 0 }, a: { x: 0, y: CELL_HEIGHT }, b: { x: CELL_WIDTH, y: 0 } },
        'a, back with nowhere saved, goes below the cell left of b, which x has',
      );
    },
  );
  await t.test(
    'a card with no column between a card it waits on and one that waits on it: the cards `after` joins are laid out again, together',
    () => {
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
      assert.deepEqual(
        Object.fromEntries(at),
        { p: { x: 0, y: 0 }, m: { x: CELL_WIDTH, y: 0 }, k: { x: 2 * CELL_WIDTH, y: 0 } },
        'm, coming onto the floor between p and k, which waits on it, lays the three out again in a row',
      );
    },
  );
  await t.test(
    "cards a person left where the layering would not have put them stay, when none of them has to move: a person's arrangement",
    () => {
      const onFloor = new Map([
        ['a', { x: 2 * CELL_WIDTH, y: 0 }],
        ['b', { x: 0, y: CELL_HEIGHT }],
      ]);
      const after = new Map([['b', ['a']]]);
      assert.deepEqual(placeRuns(['a', 'b'], onFloor, null, new Map(), after), onFloor);
    },
  );
  await t.test(
    "a graph unfolding over a card whose group also waits on the opened run's parent: the card no graph covered stays, and no edge runs backwards",
    () => {
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
      const spans = new Map([['b', { columns: 3, rows: 1 }]]);
      const at = placeRuns(ids, fresh, null, spans, TRIANGLE);
      assert.deepEqual(
        backwards(at, TRIANGLE),
        [],
        'b, opened across three cells over d and not a: every run left of each run that waits on it',
      );
      assert.deepEqual(overlapping(at, spans), []);
      assert.deepEqual(at.get('a'), { x: 0, y: 0 }, 'a, which no graph covered, stays where it is');
      assert.deepEqual(placeRuns(ids, at, null, spans, TRIANGLE), at, 'and the pass after moves nothing');
    },
  );
  await t.test(
    'a diamond whose bottom also waits on its top, one side opened over the bottom: laid out again where it can be, and no edge runs backwards',
    () => {
      const skip = new Map([...DIAMOND, ['d', ['b', 'c', 'a']]]);
      const ids = ['a', 'b', 'c', 'd'];
      const fresh = placeRuns(ids, new Map(), null, new Map(), skip);
      const spans = new Map([['b', { columns: 3, rows: 1 }]]);
      const at = placeRuns(ids, fresh, null, spans, skip);
      assert.deepEqual(backwards(at, skip), []);
      assert.deepEqual(overlapping(at, spans), []);
      assert.deepEqual(placeRuns(ids, at, null, spans, skip), at);
    },
  );
});

test("runClock and clockCounts: a card's and a row's clock, and what its hover says", async (t) => {
  await t.test(
    "a card's clock counts from when the run started — its first filing — not from when it was created: the wait before is waiting, and said on hover",
    () => {
      const createdAt = '2026-09-20T08:00:00.000Z';
      const startedAt = '2026-09-20T12:29:00.000Z';
      const now = Date.parse('2026-09-20T14:14:00.000Z');
      const going = { createdAt, startedAt, cancelledAt: null, waiting: null };
      const clock = runClock(going, now, false);
      assert.deepEqual([clock.words, clock.at], ['1h 45m since it started', startedAt]);
      assert.ok(clock.title.startsWith(`Started ${instantWhole(new Date(startedAt))}.`), clock.title);
      assert.match(clock.title, /^Started \d{1,2} Sep 2026, \d{1,2}:29:00 [AP]M\. /, 'the whole instant, to the second, with its year');
      assert.ok(
        clock.title.endsWith(`Created ${instantWhole(new Date(createdAt))}, and waited 4h 29m before its first step was filed.`),
        clock.title,
      );
      assert.equal(waitedMs(going), (4 * 60 + 29) * 60_000);
      assert.equal(
        runClock(going, now, true).words,
        'started 1h 45m ago',
        'finished, it says when it started, from the start, not a clock still counting',
      );
      assert.deepEqual([clockCounts(going, false), clockCounts(going, true)], [true, false]);

      const atOnce = runClock({ ...going, startedAt: createdAt }, now, false);
      assert.deepEqual(
        [atOnce.words, atOnce.title],
        ['6h 14m since it started', `Started ${instantWhole(new Date(createdAt))}.`],
        'started at once, or with its filings off the feed where the api gives createdAt: no wait to speak of',
      );
    },
  );
  await t.test(
    "a card's clock is the run's time at work: a run that is over took it, one still going is at work and counts up while a task of it runs, and the wall time is on hover",
    () => {
      const startedAt = '2026-09-20T12:00:00.000Z';
      const base = { createdAt: startedAt, startedAt, cancelledAt: null, waiting: null, waitingOnYou: [] };
      const local = (iso: string) => instantWhole(new Date(iso));
      const done = { ...base, atWork: { ms: (2 * 60 + 10) * 60_000, since: null, endedAt: '2026-09-20T15:00:00.000Z' } };
      const later = Date.parse('2026-09-20T16:30:00.000Z');
      assert.deepEqual(runClock(done, later, true), {
        words: 'took 2h 10m',
        at: startedAt,
        title: `At work 2h 10m. Started ${local(startedAt)}, ended ${local('2026-09-20T15:00:00.000Z')}: 3h 00m from start to end.`,
      });
      assert.equal(clockCounts(done, true), false, 'over, it counts no more');

      const running = { ...base, atWork: { ms: 20 * 60_000, since: '2026-09-20T13:00:00.000Z', endedAt: null } };
      const now = Date.parse('2026-09-20T13:05:30.000Z');
      assert.equal(runClock(running, now, false).words, '25m 30s at work', 'what ran before, and the time since what runs started');
      assert.equal(runClock(running, now + 10_000, false).words, '25m 40s at work', 'it counts up with now');
      assert.equal(
        runClock(running, now, false).title,
        `At work 25m 30s. Started ${local(startedAt)}, still going: 1h 05m from start to now.`,
      );
      assert.equal(clockCounts(running, false), true);

      const called = { ...done, cancelledAt: '2026-09-20T15:10:00.000Z' };
      assert.equal(runClock(called, later, true).words, 'took 2h 10m', 'called off, it is over too');
      const nothingRan = { ...base, atWork: { ms: 0, since: null, endedAt: null } };
      assert.equal(runClock(nothingRan, later, true).title, `At work 0s. Started ${local(startedAt)}, and no session or check of it ran.`);
      assert.equal(
        runClock({ ...base, startedAt: '2026-09-20T14:45:00.000Z', atWork: null }, later, true).words,
        'started 1h 45m ago',
        'a run the api could not judge has no time at work, and says when it started',
      );
    },
  );
  await t.test(
    "REFUSED: a row's clock saying what a card says — a column says the time at work alone, and `not started` for a run nothing of which is filed",
    () => {
      const startedAt = '2026-09-20T12:00:00.000Z';
      const base = { createdAt: startedAt, startedAt, cancelledAt: null, waiting: null, waitingOnYou: [] };
      const later = Date.parse('2026-09-20T16:30:00.000Z');
      const row = (run: Parameters<typeof runClock>[0], finished: boolean) => runClock(run, later, finished, 'row');

      const done = { ...base, atWork: { ms: (2 * 60 + 10) * 60_000, since: null, endedAt: '2026-09-20T15:00:00.000Z' } };
      assert.equal(row(done, true).words, '2h 10m', 'the figure alone: the column is headed Clock, and the preview says the rest');
      assert.equal(runClock(done, later, true).words, 'took 2h 10m', 'and a card still says its sentence');
      assert.equal(row(done, true).title, runClock(done, later, true).title, 'the times in full are the same wherever the clock is drawn');

      const running = { ...base, atWork: { ms: 20 * 60_000, since: '2026-09-20T16:00:00.000Z', endedAt: null } };
      assert.equal(row(running, false).words, '50m', 'what ran before, and the time since what runs started');

      const created = '2026-09-20T08:00:00.000Z';
      const unfiled = { createdAt: created, startedAt: null, cancelledAt: null, waiting: null };
      assert.equal(row(unfiled, false).words, 'not started', 'REFUSED: the hours since it was created, which are no time at work');
      assert.equal(runClock(unfiled, later, false).words, 'waiting for 8h 30m', 'and a card still says how long it has waited');
      assert.equal(row({ ...unfiled, cancelledAt: '2026-09-20T09:00:00.000Z' }, true).words, 'not started');
      assert.equal(row({ ...base, atWork: null }, true).words, 'not judged', 'a run the api gives no time at work of');
    },
  );
  await t.test(
    'REFUSED: a run at a gate is not over — it is at work for what it ran, says no end, and its clock stands still until a person answers',
    () => {
      const startedAt = '2026-09-20T12:00:00.000Z';
      const atWork = { ms: 20 * 60_000, since: null, endedAt: '2026-09-20T12:20:00.000Z' };
      const gated = { createdAt: startedAt, startedAt, cancelledAt: null, waiting: null, waitingOnYou: ['plan'], atWork };
      const now = Date.parse('2026-09-20T14:00:00.000Z');
      const clock = runClock(gated, now, true);
      assert.equal(clock.words, '20m 00s at work', 'off the moving floor, finished, and not over: a person is to answer');
      assert.equal(clock.title, `At work 20m 00s. Started ${instantWhole(new Date(startedAt))}, still going: 2h 00m from start to now.`);
      assert.deepEqual([clockCounts(gated, true), clockCounts(gated, false)], [false, false], 'nothing of it runs, so nothing counts');
    },
  );
  await t.test(
    'REFUSED: a run nothing of which is filed has no time at work — it is waiting, and for how long, whether it waits on runs, for a slot, or on you; called off first, it never started',
    () => {
      const createdAt = '2026-09-20T08:00:00.000Z';
      const now = Date.parse('2026-09-20T12:29:00.000Z');
      const waiting = {
        runs: [],
        word: 'waiting on 7a87',
        advice: 'nothing of 7fev is filed until wf decide says 7a87 has landed onto main',
        waitingOnYou: false,
      };
      const onRuns = runClock({ createdAt, startedAt: null, cancelledAt: null, waiting }, now, false);
      assert.deepEqual([onRuns.words, onRuns.at], ['waiting for 4h 29m', createdAt]);
      assert.equal(onRuns.title, `Created ${instantWhole(new Date(createdAt))}. Nothing of it is filed yet: waiting on 7a87.`);
      assert.doesNotMatch(onRuns.words, /since it started|started .* ago/);
      assert.equal(
        runClock({ createdAt, startedAt: null, cancelledAt: null, waiting: null }, now, false).words,
        'waiting for 4h 29m',
        'held for a slot, or its parents landed and the next pass yet to file it: nothing to name, and waiting all the same',
      );
      const onYou = { createdAt, startedAt: null, cancelledAt: null, waiting: { ...waiting, waitingOnYou: true } };
      assert.equal(
        runClock(onYou, now, true).words,
        'waiting for 4h 29m',
        'waiting on a run that never lands without a person: off the moving floor, finished, and still waiting',
      );
      assert.equal(clockCounts(onYou, true), true, 'and its clock still counts');
      assert.equal(waitedMs(onYou), null);
      const called = { createdAt, startedAt: null, cancelledAt: '2026-09-20T09:00:00.000Z', waiting: null };
      assert.deepEqual(
        [runClock(called, now, true).words, runClock(called, now, true).title],
        ['created 4h 29m ago', `Created ${instantWhole(new Date(createdAt))}. Called off before anything of it was filed.`],
        'called off before anything of it was filed: it never started, and waits for nothing',
      );
      assert.equal(clockCounts(called, true), false);
    },
  );
});

/** What the api says of a run a person holds until `p` lands (`wf hold`): a hold that lifts on its own, or one only a person lifts. */
const holdingOn = (onYou: boolean): NonNullable<RunSummary['holding']> => ({
  at: '2026-09-13T00:30:00.000Z',
  runs: [{ run: 'p', missing: false, cancelledAt: onYou ? cancelledAt : null, gone: [], landed: false }],
  word: 'held until p lands',
  advice: onYou
    ? 'p was cancelled — yours to resolve: wf hold r-1 --off, or wf cancel r-1'
    : 'nothing of r-1 is filed, and nothing is asked of you, until wf decide says p has landed; to go on before then: wf hold r-1 --off',
  waitingOnYou: onYou,
});

test('inFlight, standingOf, waitsOnYou and onYouOf: where a run stands, and who it waits on', async (t) => {
  await t.test('a run is in flight, and on the Factory by default, while the api says it is running', () => {
    const shown: Array<[string, RunSummary]> = [
      ['started, nothing filed yet', run(['waiting', 'waiting'], { moving: true })],
      ['a session at work', run(['running (working)', 'waiting'], { moving: true })],
      ['its check still running', run(['verified ✓', 'checking'], { moving: true })],
      ['a step the engine has lost, which `assess` reads as running: the status alone keeps it on the floor', run(['unknown', 'waiting'])],
    ];
    for (const [why, r] of shown) assert.equal(inFlight(r), true, why);
  });
  await t.test('a run the api calls failed or cancelled stays in flight while it still moves', () => {
    const shown: Array<[string, RunSummary]> = [
      [
        'a check refused while a sibling session still runs, in a fan-out `assess` calls failed once one step is final',
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
  await t.test('a run is finished, and hidden by default, once it has stopped moving without running', () => {
    const hidden: Array<[string, RunSummary]> = [
      ['verified, and done on its own word', run(['verified ✓', 'unverified · done'], { status: 'succeeded' })],
      [
        'stopped at a refused check, its follower waiting for ever',
        run(['failed ✗ check (exit 1)', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] }),
      ],
      [
        'a step signed off blocked, waiting on you',
        run(['succeeded · BLOCKED', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] }),
      ],
      ['a session that failed', run(['failed', 'waiting'], { status: 'failed' })],
      ['called off, and the stop has landed', run(['stopped', 'waiting'], { status: 'cancelled', cancelledAt })],
    ];
    for (const [why, r] of hidden) assert.equal(inFlight(r), false, why);
  });
  await t.test("no step's word decides it: the run's status and whether it moves do", () => {
    assert.equal(
      inFlight(run(['waiting', 'pending', 'checking', 'needs-human'], { status: 'failed', moving: false })),
      false,
      'live-looking words on a run the api says has stopped moving: not in flight',
    );
    assert.equal(
      inFlight(run(['failed', 'stopped', 'unknown'], { status: 'running', moving: false })),
      true,
      'final-looking words on a run the api says is running: in flight',
    );
  });
  await t.test(
    'a run waiting on runs that may still land is in flight; one waiting on a run that never lands is not, and waits on you — though `assess` calls both running',
    () => {
      const mayShip = run(['waiting on p'], { moving: true, after: ['p'], waiting: waitingOn(false) });
      assert.deepEqual([inFlight(mayShip), waitsOnYou(mayShip)], [true, false]);
      const never = run(['waiting on p (cancelled)'], { moving: false, after: ['p'], waiting: waitingOn(true) });
      assert.deepEqual([inFlight(never), waitsOnYou(never)], [false, true]);
      assert.equal(
        waitsOnYou(run(['succeeded · BLOCKED', 'waiting'], { status: 'failed', waitingOnYou: ['step-0'] })),
        true,
        'a run with a step waiting on you waits on you',
      );
      assert.equal(waitsOnYou(run(['running (working)'], { moving: true })), false, 'a run nobody waits on does not');
    },
  );
  await t.test("the ending step's own gate is not asked for twice: the to-decide line says it, and `waiting on you` leaves it out", () => {
    const ends = run(['unverified · done', 'awaiting approval'], {
      id: 'ends',
      status: 'failed',
      waitingOnYou: ['ship'],
      waitingOnYouWords: ['approve ship'],
      toDecide: approve('ends', 'ship'),
    });
    assert.equal(waitsOnYou(ends), true, 'the step still waits at its gate');
    assert.deepEqual(onYouOf(ends), [], 'and nothing is left to name: the decision is the whole of it');
    const both = { ...ends, waitingOnYou: ['tokens', 'ship'], waitingOnYouWords: ['tokens', 'approve ship'] };
    assert.deepEqual(onYouOf(both), ['tokens'], "another step waiting on you is still named, beside the ending's own line");
    const ahead = run(['unverified · done'], {
      id: 'ahead',
      status: 'succeeded',
      waitingOnYou: ['implement'],
      waitingOnYouWords: ['implement'],
      toDecide: merge('ahead', 'wf/ahead/implement'),
    });
    assert.deepEqual(onYouOf(ahead), ['implement'], 'a branch nobody merged asks for no step, so nothing is filtered');
  });
  await t.test(
    "where a run stands, in the start form's word: called off, waiting on you — a step, or a run it waits on that never lands — in flight, or finished",
    () => {
      assert.equal(standingOf(run([], { status: 'cancelled', cancelledAt })), ENDED.cancelled.word);
      assert.equal(
        standingOf(run(['waiting on p (cancelled)'], { after: ['p'], waiting: waitingOn(true) })),
        'waiting on you',
        'a run that never filed a step, and never will without a person, is not finished, whatever `inFlight` says',
      );
      assert.equal(standingOf(run(['succeeded · BLOCKED'], { status: 'failed', waitingOnYou: ['step-0'] })), 'waiting on you');
      assert.equal(standingOf(run(['waiting on p'], { moving: true, after: ['p'], waiting: waitingOn(false) })), 'in flight');
      assert.equal(standingOf(run(['verified ✓'], { status: 'succeeded' })), 'finished');
    },
  );
  await t.test(
    "who a run waits on, on the Runs row, is `wf ls`'s words where the api gives them — `approve plan` — and the steps by name from an api that gives none, never a throw",
    () => {
      const gated = run(['awaiting approval', 'waiting'], {
        status: 'failed',
        waitingOnYou: ['step-0'],
        waitingOnYouWords: ['approve step-0'],
      });
      assert.deepEqual(onYouOf(gated), ['approve step-0']);
      const { waitingOnYouWords: _words, ...before } = gated;
      assert.deepEqual(
        onYouOf(before),
        ['step-0'],
        'a list without `waitingOnYouWords` is read as the steps `waitingOnYou` names, not refused',
      );
      assert.deepEqual(onYouOf({ ...before, waitingOnYou: [] }), []);
    },
  );
  await t.test(
    'a run held until runs that may still land is in flight; one only a person lifts is not, and waits on you — as a run waiting `--after` runs',
    () => {
      const gated = { status: 'running' as const, moving: false, waitingOnYou: [] as string[], waiting: null };
      const lifts = run(['awaiting approval', 'waiting'], { ...gated, holdUntil: ['p'], holding: holdingOn(false) });
      assert.deepEqual(
        [inFlight(lifts), waitsOnYou(lifts)],
        [true, false],
        'a step held at its gate, which `assess` calls running with nothing moving and nothing waiting on you, until runs that may ship: in flight',
      );
      const yours = run(['awaiting approval', 'waiting'], { ...gated, holdUntil: ['p'], holding: holdingOn(true) });
      assert.deepEqual(
        [inFlight(yours), waitsOnYou(yours)],
        [false, true],
        'held until a person lifts it: not in flight, and waiting on you',
      );
      assert.equal(
        inFlight({ ...yours, moving: true }),
        true,
        'a step still at work when the hold was written moves, and is in flight whoever lifts the hold',
      );
      const off = run(['awaiting approval', 'waiting'], {
        ...gated,
        status: 'cancelled',
        cancelledAt,
        holdUntil: ['p'],
        holding: holdingOn(true),
      });
      assert.deepEqual([inFlight(off), waitsOnYou(off)], [false, false], 'a run called off waits on nobody, held or not');
      assert.deepEqual(
        [standingOf(lifts), standingOf(yours)],
        ['in flight', 'waiting on you'],
        'the start form says where it stands in the same words',
      );
    },
  );
});

test('waitsOnRuns and floorRuns: which runs are on the floor, ghosts and finished runs included', async (t) => {
  await t.test('a run waits on runs, a ghost on the floor, while what it waits on may still land and nothing of it is filed', () => {
    assert.equal(waitsOnRuns(run(['waiting'], { after: ['p'], waiting: waitingOn(false), moving: true })), true);
    assert.equal(
      waitsOnRuns(run(['waiting'], { after: ['p'], waiting: waitingOn(true) })),
      false,
      'a run waiting on a run that never lands waits on you',
    );
    assert.equal(
      waitsOnRuns(
        run(['waiting'], {
          after: ['p'],
          waiting: waitingOn(false),
          holding: { at: cancelledAt, runs: [], word: 'held until a person lifts it', advice: 'wf hold r-1 --off', waitingOnYou: true },
        }),
      ),
      false,
      'a run held until only a person lifts it waits on you',
    );
    assert.equal(
      waitsOnRuns(run(['waiting'], { after: ['p'], waiting: waitingOn(false), cancelledAt })),
      false,
      'a cancelled run waits on nobody',
    );
    assert.equal(
      waitsOnRuns(run(['running (working)'], { after: ['p'], waiting: null, moving: true })),
      false,
      'a run that started is a card again',
    );
    assert.equal(waitsOnRuns(run(['running (working)'], { moving: true })), false, 'a run started without --after waits on nothing');
  });
  await t.test(
    "a factory's floor draws its own run waiting on a run of another factory, as a ghost and with no edge, and no card of that run",
    () => {
      const runs = [
        run(['running (working)'], { id: 'p', factory: null, moving: true, createdAt: '2026-09-14T00:00:00.000Z' }),
        run(['waiting'], {
          id: 'c',
          factory: 'nemia',
          after: ['p'],
          waiting: waitingOn(false),
          moving: true,
          createdAt: '2026-09-14T00:01:00.000Z',
        }),
      ];
      const floor = floorRuns(runsIn(runs, { name: 'nemia', default: false }), false);
      assert.deepEqual(
        floor.map((one) => one.id),
        ['c'],
      );
      assert.equal(runEdges(floor).length, 0, 'p is on no card of this floor, so no edge leaves it');
      assert.equal(waitsOnRuns(floor[0]), true);
      assert.deepEqual(
        floorRuns(runs, false).map((one) => one.id),
        ['p', 'c'],
        'without the factory, p would be on the floor',
      );
    },
  );
  await t.test(
    'the floor is every run in flight, and each finished run one of them still waits on — and every run once finished runs are asked for',
    () => {
      const runs = [
        run([], { id: 'z', status: 'succeeded', createdAt: at(0) }),
        run([], { id: 'a', status: 'succeeded', createdAt: at(1) }),
        run([], { id: 'b', after: ['a'], waiting: waitsOn('a'), createdAt: at(2) }),
        run([], { id: 'c', status: 'cancelled', cancelledAt, createdAt: at(3) }),
        run([], { id: 'e', after: ['c'], waiting: waitingOn(true), createdAt: at(4) }),
        run([], { id: 'y', status: 'succeeded', after: ['z'], createdAt: at(5) }),
        run([], { id: 'x', status: 'succeeded', createdAt: at(6) }),
        run(['running (working)'], { id: 's', moving: true, after: ['x'], createdAt: at(7) }),
      ];
      assert.deepEqual(
        floorRuns(runs, false).map((r) => r.id),
        ['a', 'b', 'e', 's'],
        "a, finished and still waited on by b in flight, is on the floor for b's edge to leave from; e waits on you, and its waiting line " +
          'names c, which brings no card; y, finished, brings no z; s has started, its wait on x over, and brings no x',
      );
      assert.deepEqual(
        floorRuns(runs, true).map((r) => r.id),
        ['z', 'a', 'b', 'c', 'e', 'y', 'x', 's'],
      );
      const chain = [
        run([], { id: 'g', status: 'succeeded', createdAt: at(0) }),
        run([], { id: 'p', status: 'succeeded', after: ['g'], createdAt: at(1) }),
        run([], { id: 'k', after: ['p'], waiting: waitsOn('p'), createdAt: at(2) }),
      ];
      assert.deepEqual(
        floorRuns(chain, false).map((r) => r.id),
        ['p', 'k'],
        'one level: a finished parent brings none of its own parents',
      );
    },
  );
  await t.test('a finished run read as context and waited on by nobody is kept off the floor: context is no wait', () => {
    const runs = [
      run([], { id: 'source', status: 'succeeded', createdAt: at(0) }),
      run(['waiting'], { id: 'reader', moving: true, context: ['source'], createdAt: at(1) }),
    ];
    assert.deepEqual(
      floorRuns(runs, false).map((r) => r.id),
      ['reader'],
    );
  });
  await t.test('a run nobody has decided stays on the floor, whatever Show finished says, until it is decided', () => {
    const runs = [
      run(['unverified · done', 'awaiting approval'], {
        id: 'ends',
        status: 'failed',
        waitingOnYou: ['ship'],
        waitingOnYouWords: ['approve ship'],
        toDecide: approve('ends', 'ship'),
        createdAt: at(0),
      }),
      run(['unverified · done'], { id: 'ahead', status: 'succeeded', toDecide: merge('ahead', 'wf/ahead/implement'), createdAt: at(1) }),
      run(['unverified · done', 'unverified · done'], { id: 'landed', status: 'succeeded', createdAt: at(2) }),
    ];
    assert.deepEqual(
      floorRuns(runs, false).map((r) => r.id),
      ['ends', 'ahead'],
      "ends, finished at its ending's gate, and ahead, succeeded with a branch nobody merged, stay; landed, decided, is off the floor",
    );
    assert.deepEqual(
      floorRuns(runs, true).map((r) => r.id),
      ['ends', 'ahead', 'landed'],
    );
    const old = [{ ...runs[1], toDecide: undefined as unknown as RunSummary['toDecide'] }];
    assert.deepEqual(
      floorRuns(old, false).map((r) => r.id),
      [],
      'a list from an api that carries no `toDecide` reads as one with nothing to decide, rather than taking the floor down',
    );
    assert.equal(toDecideOf(old[0]), null);
  });
  await t.test('a run that waits on a person stays on the floor, whatever Show finished says, until the person has answered', () => {
    const runs = [
      run(['unverified · done', 'awaiting approval', 'waiting'], {
        id: 'gated',
        status: 'awaiting approval',
        moving: false,
        waitingOnYou: ['plan'],
        waitingOnYouWords: ['approve plan'],
        toDecide: null,
        createdAt: at(0),
      }),
      run(['succeeded · BLOCKED', 'waiting'], {
        id: 'blocked',
        status: 'waiting',
        moving: false,
        waitingOnYou: ['step-0'],
        waitingOnYouWords: ['step-0'],
        toDecide: null,
        createdAt: at(1),
      }),
      run(['succeeded · BLOCKED', 'waiting'], {
        id: 'called-off',
        status: 'cancelled',
        cancelledAt,
        waitingOnYou: ['step-0'],
        waitingOnYouWords: ['step-0'],
        toDecide: null,
        createdAt: at(2),
      }),
      run(['failed ✗ check (exit 1)'], { id: 'refused', status: 'failed', toDecide: null, createdAt: at(3) }),
    ];
    assert.deepEqual(
      floorRuns(runs, false).map((r) => r.id),
      ['gated', 'blocked'],
      'gated, stopped at a gate in the middle with nothing to decide, and blocked, asking the person something, stay; called-off, ' +
        'cancelled with its blocked step still named, and refused, at a check that asks nobody, are off the floor',
    );
    assert.deepEqual(
      floorRuns(runs, true).map((r) => r.id),
      ['gated', 'blocked', 'called-off', 'refused'],
    );
    assert.equal(waitsOnYou(runs[2]), false, 'a cancelled run waits on nobody');
    assert.equal(standingOf(runs[0]), 'waiting on you');
    const approved = { ...runs[0], status: 'running' as const, moving: true, waitingOnYou: [], waitingOnYouWords: [] };
    assert.deepEqual(
      floorRuns([approved], false).map((r) => r.id),
      ['gated'],
      'once the plan is approved the run moves again, and stays',
    );
    const done = { ...approved, status: 'succeeded' as const, moving: false };
    assert.deepEqual(
      floorRuns([done], false).map((r) => r.id),
      [],
      'once it is finished, answered, it goes with the rest',
    );
  });
  await t.test("the header's `waiting on you` counts the runs whose cards are drawn waiting on you, with Show finished off", () => {
    const runs = [
      run(['unverified · done', 'awaiting approval'], {
        id: 'gated',
        status: 'failed',
        waitingOnYou: ['plan'],
        waitingOnYouWords: ['approve plan'],
        toDecide: null,
        createdAt: at(0),
      }),
      run(['succeeded · BLOCKED'], {
        id: 'blocked',
        status: 'failed',
        waitingOnYou: ['step-0'],
        waitingOnYouWords: ['step-0'],
        createdAt: at(1),
      }),
      run(['unverified · done', 'awaiting approval'], {
        id: 'ends',
        status: 'failed',
        waitingOnYou: ['ship'],
        waitingOnYouWords: ['approve ship'],
        toDecide: approve('ends', 'ship'),
        createdAt: at(2),
      }),
      run([], { id: 'e', after: ['c'], waiting: waitingOn(true), createdAt: at(3) }),
      run(['succeeded · BLOCKED'], {
        id: 'called-off',
        status: 'cancelled',
        cancelledAt,
        waitingOnYou: ['step-0'],
        waitingOnYouWords: ['step-0'],
        createdAt: at(4),
      }),
      run([], { id: 'landed', status: 'succeeded', createdAt: at(5) }),
      run(['running (working)'], { id: 'going', moving: true, createdAt: at(6) }),
    ];
    const counted = runs.filter(waitsOnYou).map((r) => r.id);
    const drawn = floorRuns(runs, false)
      .filter(waitsOnYou)
      .map((r) => r.id);
    assert.deepEqual(counted, ['gated', 'blocked', 'ends', 'e']);
    assert.deepEqual(drawn, counted, 'the runs FactoryCanvas counts over every run are the cards floorRuns draws waiting on you');
  });
  await t.test(
    'a held run stays on the floor while it is held, and brings the finished run it is held until, so the edge into it leaves from a card',
    () => {
      const runs = [
        run([], { id: 'p', status: 'succeeded', createdAt: at(0) }),
        run(['awaiting approval'], { id: 'h', status: 'running', holdUntil: ['p'], holding: holdingOn(false), createdAt: at(1) }),
        run(['awaiting approval'], { id: 'q', status: 'running', holdUntil: ['gone'], holding: holdingOn(true), createdAt: at(2) }),
      ];
      assert.deepEqual(
        floorRuns(runs, false).map((r) => r.id),
        ['p', 'h', 'q'],
        'h brings p, the finished run it is held until; q, held until a run not listed at all, stays and brings nothing',
      );
      const lifted = runs.map((r) => ({
        ...r,
        holdUntil: [],
        holding: null,
        status: r.id === 'p' ? ('succeeded' as const) : ('failed' as const),
      }));
      assert.deepEqual(
        floorRuns(lifted, false).map((r) => r.id),
        [],
        "lifted, off runs that had finished, the api lists no run and no hold and says each run's own status again, and the parent goes with them",
      );
    },
  );
});

test('runEdges and contextEdges: the edges drawn between cards', async (t) => {
  await t.test(
    'an edge from each run a card still waits on to its card, both on the floor, to come — reduced: A→B, B→C and A→C draws only A→B and B→C',
    () => {
      const edges = runEdges([
        run(['verified ✓'], { id: 'a' }),
        run(['waiting'], { id: 'b', after: ['a'], waiting: waitsOn('a') }),
        run(['waiting'], { id: 'c', after: ['a', 'b'], waiting: waitsOn('a', 'b', 'off-the-floor', 'a') }),
      ]);
      assert.deepEqual(
        edges,
        [
          { id: 'after:a->b', source: 'a', target: 'b', state: 'to-come' },
          { id: 'after:b->c', source: 'b', target: 'c', state: 'to-come' },
        ],
        'a→c goes by b, so it is not drawn; a run named twice is one edge, and one not on the floor is none',
      );
    },
  );
  await t.test('a wait that is over draws nothing: a card started after its waits, and a hold whose run landed', () => {
    assert.deepEqual(
      runEdges([run(['verified ✓'], { id: 'a' }), run(['running (working)'], { id: 'b', after: ['a'], waiting: null })]),
      [],
      'b has started: its parents landed, and it waits on none',
    );
    const landed = { ...holdingOn(false), runs: [{ run: 'a', missing: false, cancelledAt: null, gone: [], landed: true }] };
    assert.deepEqual(
      runEdges([run(['verified ✓'], { id: 'a' }), run(['awaiting approval'], { id: 'h', holdUntil: ['a'], holding: landed })]),
      [],
    );
  });
  await t.test(
    'the lines of what a card reads are drawn only for the focused card: one from each run in its context on the floor, none without a focus',
    () => {
      const runs = [
        run(['verified ✓'], { id: 'a' }),
        run(['running (working)'], { id: 'b' }),
        run(['waiting'], { id: 'c', context: ['a', 'b', 'off-the-floor', 'a', 'c'] }),
      ];
      assert.deepEqual(contextEdges(runs, null), [], 'no focus, no line');
      assert.deepEqual(contextEdges(runs, 'a'), [], 'a reads nothing');
      assert.deepEqual(contextEdges(runs, 'c'), [
        { id: 'read:a->c', source: 'a', target: 'c' },
        { id: 'read:b->c', source: 'b', target: 'c' },
      ]);
      assert.deepEqual(runEdges(runs), [], 'and none of it is a wait');
    },
  );
  await t.test(
    'an edge from each run a card is held until that has not landed, both on the floor, drawn as an `after` edge — and none where an `after` edge already joins the two',
    () => {
      const held = (...runs: string[]): RunSummary['holding'] => ({
        ...holdingOn(false),
        runs: runs.map((run) => ({ run, missing: false, cancelledAt: null, gone: [], landed: false })),
      });
      const edges = runEdges([
        run(['verified ✓'], { id: 'a' }),
        run(['running (working)'], { id: 'b' }),
        run(['awaiting approval'], { id: 'h', holdUntil: ['a', 'b'], holding: held('a', 'b', 'a', 'off-the-floor', 'h') }),
        run(['waiting'], { id: 'd', after: ['a'], waiting: waitsOn('a'), holdUntil: ['a'], holding: held('a') }),
        run(['waiting'], { id: 'e' }),
      ]);
      assert.deepEqual(
        edges,
        [
          { id: 'hold:a->h', source: 'a', target: 'h', state: 'to-come' },
          { id: 'hold:b->h', source: 'b', target: 'h', state: 'to-come' },
          { id: 'after:a->d', source: 'a', target: 'd', state: 'to-come' },
        ],
        'h, started and held until a and b, has two edges to come; d, after a and held until it, one, the `after` one; e, held by nobody, none',
      );
      assert.deepEqual(
        runEdges([run(['verified ✓'], { id: 'a' }), run(['awaiting approval'], { id: 'h', holdUntil: [] })]),
        [],
        'lifted, the api lists no run, and the edge goes',
      );
    },
  );
});
