/**
 * The disk's pure half (`disk.ts`): which part a name of the store's root is, the kind of a name by its parent's, which run a name
 * beside a record belongs to, a walk's answers summed by part, factory and kind with what did not read never said as zero, what the
 * runtime keeps by task laid over them, the runs that hold the most, and the label sets gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_KINDS,
  DISK_KINDS,
  DISK_PARTS,
  DISK_RUNS_NAMED,
  entryKey,
  entryOf,
  kindAt,
  kindIn,
  largestOf,
  partOf,
  readingOf,
  runOf,
  unreadByPart,
  vanished,
  withKept,
  type DiskEntry,
  type DiskKind,
  type DiskRoot,
  type TaskKept,
  type Walked,
} from './disk.ts';

const SPACE = { free: 70, size: 100 };
const AT = '2026-10-12T06:00:00.000Z';

/** The runs known, each with its factory. */
const runsOf = (factories: Record<string, string>) => ({
  ids: new Set(Object.keys(factories)),
  factoryOf: (id: string): string | undefined => factories[id],
});

/** What a walk read of roots that all read: their bytes, and nothing unread. */
const whole = (bytes: number[]) => ({ bytes, unread: bytes.map(() => 0), read: bytes.map(() => true) });

test('a name of the store root is its part, the series for metrics, and other for any name that is no part', () => {
  assert.deepEqual(['worktrees', 'runs', 'engine', 'checks', 'metrics', 'inbox', 'feed.jsonl', 'constructor'].map(partOf), [
    'worktrees',
    'runs',
    'engine',
    'checks',
    'series',
    'other',
    'other',
    'other',
  ]);
  assert.deepEqual([...DISK_PARTS].sort(), ['checks', 'engine', 'other', 'runs', 'series', 'sessions', 'worktrees']);
  assert.equal(partOf('sessions'), 'other', 'the sessions are no folder of the store: a name so called is any other name');
});

test('every kind is inside one part, and a root is of a kind of its own part', () => {
  assert.equal(new Set(ALL_KINDS).size, ALL_KINDS.length, 'no kind in two parts');
  assert.deepEqual(Object.keys(DISK_KINDS), [...DISK_PARTS]);
  for (const part of DISK_PARTS)
    for (const name of [undefined, 'a', 'a.json', 'a.asks', 'node_modules'])
      assert.ok((DISK_KINDS[part] as readonly string[]).includes(kindAt(part, name)), `${part} ${name}`);
});

test("a root under runs is a run's folder, its record, or a person's mark; one under worktrees a checkout", () => {
  assert.deepEqual(
    [undefined, 'r-1', 'r-1.json', 'r-1.asks', 'r-1.pruned', 'r-1.cancelled'].map((name) => kindAt('runs', name)),
    ['runs-other', 'runs-other', 'records', 'marks', 'marks', 'marks'],
  );
  assert.equal(kindAt('runs', 'r-1.json.asks'), 'marks', 'REFUSED: a name that only holds .json is no record');
  assert.deepEqual([kindAt('worktrees'), kindAt('worktrees', 'r-1')], ['checkout', 'checkout']);
  assert.deepEqual(
    (['engine', 'sessions', 'checks', 'series', 'other'] as const).map((part) => kindAt(part)),
    ['engine-other', 'harness-records', 'checks', 'series', 'other'],
  );
});

test("inside a run's folder, its handed files, agents and inputs are their kinds, and a picture is one only among the handed", () => {
  const under = (path: string[], start: DiskKind = 'runs-other'): DiskKind => path.reduce<DiskKind>(kindIn, start);
  assert.deepEqual(
    [
      ['artifacts', 'design', 'shot.png'],
      ['artifacts', 'implement', 'deep', 'Shot.JPEG'],
      ['artifacts', 'implement', 'test-costs-agent-orchestrator.json'],
      ['artifacts', 'implement', 'notes.md'],
      ['agents', 'ada', 'skills', 'look', 'SKILL.md'],
      ['agents', 'ada', 'logo.png'],
      ['inputs', 'mock.png'],
      ['work', 'artifacts', 'x.png'],
      ['brief-copy.txt'],
    ].map((names) => under(names)),
    ['pictures', 'pictures', 'handed', 'handed', 'agents', 'agents', 'inputs', 'pictures', 'runs-other'],
  );
  assert.deepEqual(
    [['artifact', 'x.png'], ['artifacts.png'], ['shot.png']].map((names) => under(names)),
    ['runs-other', 'runs-other', 'runs-other'],
    'REFUSED: a picture outside the handed files, and a folder named near one, are no handed picture',
  );
  assert.deepEqual(
    ['shot.png.txt', 'pngs', 'a.svg', 'a.webp'].map((name) => kindIn('handed', name)),
    ['handed', 'handed', 'pictures', 'pictures'],
  );
  assert.equal(under(['x.png', 'inside.txt'], 'handed'), 'handed', 'a folder named as a picture holds handed files, not pictures');
  assert.deepEqual([kindIn('records', 'artifacts'), kindIn('marks', 'approve-land-1')], ['records', 'marks']);
});

test('inside a checkout, everything under a node_modules at any depth is its dependencies, and nothing else is', () => {
  const under = (path: string[]): DiskKind => path.reduce<DiskKind>(kindIn, 'checkout');
  assert.deepEqual(
    [
      ['node_modules', 'effect', 'package.json'],
      ['apps', 'web', 'node_modules', '.bin', 'vite'],
      ['packages', 'node_modules'],
      ['packages', 'node_module', 'x.js'],
      ['src', 'node_modules.ts'],
      ['src', 'index.ts'],
    ].map(under),
    ['dependencies', 'dependencies', 'dependencies', 'checkout', 'checkout', 'checkout'],
  );
});

test('a name beside a record is its run by the id before a dot, the longest known, and never a run whose id it only starts with', () => {
  const ids = new Set(['r-xyz', 'r-xyz-implement', 'a.b']);
  assert.equal(runOf('r-xyz', ids), 'r-xyz');
  assert.equal(runOf('r-xyz.json', ids), 'r-xyz');
  assert.equal(runOf('r-xyz-implement.asks', ids), 'r-xyz-implement');
  assert.equal(runOf('a.b.cancelled', ids), 'a.b');
  assert.equal(runOf('r-xyz-review', ids), undefined, 'REFUSED: a prefix with no dot after it is another run');
  assert.equal(runOf('r-xy.json', ids), undefined);
  assert.equal(runOf('.hidden', ids), undefined);
});

const ROOTS: DiskRoot[] = [
  { part: 'other', kind: 'other', path: '/s', own: 4 },
  { part: 'runs', kind: 'runs-other', path: '/s/runs', own: 8 },
  { part: 'runs', kind: 'runs-other', name: 'a', path: '/s/runs/a' },
  { part: 'runs', kind: 'records', name: 'a.json', path: '/s/runs/a.json' },
  { part: 'runs', kind: 'runs-other', name: 'b', path: '/s/runs/b' },
  { part: 'runs', kind: 'runs-other', name: 'gone', path: '/s/runs/gone' },
  { part: 'worktrees', kind: 'checkout', name: 'a', path: '/s/worktrees/a' },
  { part: 'engine', kind: 'engine-other', path: '/s/engine' },
  { part: 'series', kind: 'series', path: '/s/metrics' },
  { part: 'other', kind: 'other', path: '/s/inbox' },
];
const RUNS = runsOf({ a: 'nemia', b: 'pipao' });

test('a reading sums each part, by factory where a root is a run known, in the order of the parts; a name of no run is its part alone', () => {
  const reading = readingOf(ROOTS, whole([4, 8, 100, 2, 30, 5, 1000, 700, 20, 6]), RUNS, SPACE, AT);
  assert.deepEqual(reading, {
    at: AT,
    free: 70,
    size: 100,
    entries: [
      { part: 'worktrees', kind: 'checkout', factory: 'nemia', bytes: 1000, unread: 0 },
      { part: 'runs', kind: 'runs-other', bytes: 13, unread: 0 },
      { part: 'runs', kind: 'runs-other', factory: 'nemia', bytes: 100, unread: 0 },
      { part: 'runs', kind: 'records', factory: 'nemia', bytes: 2, unread: 0 },
      { part: 'runs', kind: 'runs-other', factory: 'pipao', bytes: 30, unread: 0 },
      { part: 'engine', kind: 'engine-other', bytes: 700, unread: 0 },
      { part: 'series', kind: 'series', bytes: 20, unread: 0 },
      { part: 'other', kind: 'other', bytes: 10, unread: 0 },
    ],
  });
  const sum = reading.entries.reduce((n, entry) => n + (entry.bytes ?? 0), 0);
  assert.equal(sum, 4 + 8 + 100 + 2 + 30 + 5 + 1000 + 700 + 20 + 6, 'every root is in one entry');
});

test("a root's bytes by kind are its entries by kind, and they add up to the root; what did not read is on the root's own kind", () => {
  const roots: DiskRoot[] = [
    { part: 'runs', kind: 'runs-other', name: 'a', path: '/s/runs/a' },
    { part: 'runs', kind: 'runs-other', name: 'b', path: '/s/runs/b' },
  ];
  const walked: Walked = {
    bytes: [4 + 30 + 60 + 10, 4 + 5],
    kinds: [
      { 'runs-other': 4, pictures: 30, handed: 60, agents: 10 },
      { 'runs-other': 4, handed: 5 },
    ],
    unread: [2, 0],
    read: [true, true],
  };
  const { entries } = readingOf(roots, walked, RUNS, SPACE, AT);
  assert.deepEqual(entries, [
    { part: 'runs', kind: 'runs-other', factory: 'nemia', bytes: 4, unread: 2 },
    { part: 'runs', kind: 'pictures', factory: 'nemia', bytes: 30, unread: 0 },
    { part: 'runs', kind: 'handed', factory: 'nemia', bytes: 60, unread: 0 },
    { part: 'runs', kind: 'agents', factory: 'nemia', bytes: 10, unread: 0 },
    { part: 'runs', kind: 'runs-other', factory: 'pipao', bytes: 4, unread: 0 },
    { part: 'runs', kind: 'handed', factory: 'pipao', bytes: 5, unread: 0 },
  ]);
  for (const factory of ['nemia', 'pipao']) {
    const held: number = entries.filter((entry) => entry.factory === factory).reduce((n, entry) => n + (entry.bytes ?? 0), 0);
    assert.equal(held, walked.bytes[factory === 'nemia' ? 0 : 1], `the kinds of ${factory}'s runs add up to them`);
  }
});

test('REFUSED: an entry none of whose roots read has no bytes, never zero, and its unread names are said by part', () => {
  const walked = {
    bytes: [4, 8, 100, 2, 0, 5, 1000, 0, 20, 6],
    unread: [0, 0, 3, 0, 1, 0, 0, 1, 0, 0],
    read: [true, true, true, true, false, true, true, false, true, true],
  };
  const { entries } = readingOf(ROOTS, walked, RUNS, SPACE, AT);
  assert.deepEqual(
    entries.filter((entry) => entry.unread > 0),
    [
      { part: 'runs', kind: 'runs-other', factory: 'nemia', bytes: 100, unread: 3 },
      { part: 'runs', kind: 'runs-other', factory: 'pipao', unread: 1 },
      { part: 'engine', kind: 'engine-other', unread: 1 },
    ],
    'a run whose folder read holds its bytes beside what did not read under it',
  );
  assert.deepEqual(
    unreadByPart(entries).map(({ part, unread }) => `${part} ${unread}`),
    ['worktrees 0', 'runs 4', 'engine 1', 'sessions 0', 'checks 0', 'series 0', 'other 0'],
    'every part is said, zero where all read',
  );
});

test('the largest runs are ten, largest first, each the sum of its parts, a folder of no run under its own name', () => {
  const largest = largestOf(ROOTS, whole([4, 8, 100, 2, 30, 5, 1000, 700, 20, 6]), RUNS);
  assert.deepEqual(largest, [
    { run: 'a', factory: 'nemia', bytes: 1102 },
    { run: 'b', factory: 'pipao', bytes: 30 },
    { run: 'gone', bytes: 5 },
  ]);
  const many: DiskRoot[] = Array.from({ length: DISK_RUNS_NAMED + 1 }, (_, k) => ({
    part: 'runs',
    kind: 'runs-other',
    name: `r${k}`,
    path: `/s/runs/r${k}`,
  }));
  const sizes = many.map((_, k) => (k === 3 ? 0 : k + 1));
  const empty: DiskRoot = { part: 'runs', kind: 'runs-other', name: 'empty', path: '/s/runs/empty' };
  const named = largestOf([...many, empty], whole([...sizes, 0]), runsOf({}));
  assert.equal(DISK_RUNS_NAMED, 10);
  assert.deepEqual(
    named.map((run) => run.run),
    ['r10', 'r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r2', 'r1', 'r0'],
    'REFUSED: an eleventh run, and one that holds nothing',
  );
});

test('a label set said before and in no entry now is gone; one whose entry did not read is not', () => {
  const said = new Set(
    (
      [
        { part: 'runs', kind: 'handed', factory: 'nemia' },
        { part: 'runs', kind: 'pictures', factory: 'nemia' },
        { part: 'runs', kind: 'handed', factory: 'pipao' },
        { part: 'engine', kind: 'journals' },
      ] as const
    ).map(entryKey),
  );
  const gone = vanished(said, [
    { part: 'runs', kind: 'handed', factory: 'nemia', bytes: 3, unread: 0 },
    { part: 'runs', kind: 'handed', factory: 'pipao', unread: 1 },
    { part: 'engine', kind: 'journals', bytes: 3, unread: 0 },
  ]);
  assert.deepEqual(
    gone.map(entryOf),
    [{ part: 'runs', kind: 'pictures', factory: 'nemia' }],
    'REFUSED: a kind gone beside one still there',
  );
  const hidden = vanished(said, [
    { part: 'runs', kind: 'runs-other', factory: 'nemia', unread: 1 },
    { part: 'engine', kind: 'journals', bytes: 3, unread: 0 },
  ]);
  assert.deepEqual(hidden.map(entryOf), [{ part: 'runs', kind: 'handed', factory: 'pipao' }], 'a kind of a run that did not read is not');
  assert.deepEqual(entryOf(entryKey({ part: 'engine', kind: 'bodies' })), { part: 'engine', kind: 'bodies' });
});

/** A walk's entries around an engine folder of `engine` bytes. */
const walkedWith = (engine: number): DiskEntry[] => [
  { part: 'runs', kind: 'handed', factory: 'nemia', bytes: 7, unread: 0 },
  { part: 'engine', kind: 'engine-other', bytes: engine, unread: 0 },
  { part: 'other', kind: 'other', bytes: 3, unread: 0 },
];

/** The factory of each task of the fixtures: `t-n*` nemia's, `t-p*` pipao's, any other no run's. */
const factoryOfTask = (taskId: string): string | undefined =>
  taskId.startsWith('t-n') ? 'nemia' : taskId.startsWith('t-p') ? 'pipao' : undefined;

/** The bytes of `entries` of `part`. */
const sumOf = (entries: readonly DiskEntry[], part: DiskEntry['part']): number =>
  entries.filter((entry) => entry.part === part).reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);

test('what the runtime keeps by task is the engine by kind and factory, engine-other alone the whole less those, and the sessions by factory and alone', () => {
  const kept: TaskKept[] = [
    { taskId: 't-n1', engine: { journals: 10, bodies: 20, 'session-output': 60, 'session-files': 10 }, sessions: 40, unread: 0 },
    { taskId: 't-p1', engine: { journals: 10, 'check-output': 20 }, unread: 2 },
    { taskId: 't-n2', engine: { journals: 10, 'check-output': 40, 'session-files': 0 }, sessions: 5, unread: 0 },
    { taskId: 'gone', engine: { journals: 20 }, sessions: 9, unread: 1 },
  ];
  const entries = withKept(walkedWith(1000), kept, factoryOfTask);
  assert.deepEqual(entries, [
    { part: 'runs', kind: 'handed', factory: 'nemia', bytes: 7, unread: 0 },
    { part: 'engine', kind: 'session-files', unread: 1 },
    { part: 'engine', kind: 'journals', bytes: 20, unread: 0 },
    { part: 'engine', kind: 'engine-other', bytes: 1000 - 100 - 30 - 50 - 20, unread: 0 },
    { part: 'engine', kind: 'session-output', factory: 'nemia', bytes: 60, unread: 0 },
    { part: 'engine', kind: 'check-output', factory: 'nemia', bytes: 40, unread: 0 },
    { part: 'engine', kind: 'session-files', factory: 'nemia', bytes: 10, unread: 0 },
    { part: 'engine', kind: 'journals', factory: 'nemia', bytes: 20, unread: 0 },
    { part: 'engine', kind: 'bodies', factory: 'nemia', bytes: 20, unread: 0 },
    { part: 'engine', kind: 'check-output', factory: 'pipao', bytes: 20, unread: 0 },
    { part: 'engine', kind: 'session-files', factory: 'pipao', unread: 2 },
    { part: 'engine', kind: 'journals', factory: 'pipao', bytes: 10, unread: 0 },
    { part: 'sessions', kind: 'harness-records', bytes: 9, unread: 0 },
    { part: 'sessions', kind: 'harness-records', factory: 'nemia', bytes: 45, unread: 0 },
    { part: 'other', kind: 'other', bytes: 3, unread: 0 },
  ]);
  assert.equal(sumOf(entries, 'engine'), 1000, 'the kinds of the engine add up to the walked whole');
});

test('REFUSED, nothing is drawn: with no task that keeps a record there is no sessions entry at all, not one at zero', () => {
  const kept: TaskKept[] = [
    { taskId: 't-n1', engine: { journals: 100 }, unread: 0 },
    { taskId: 'gone', engine: { journals: 20 }, unread: 0 },
  ];
  const entries = withKept(walkedWith(1000), kept, factoryOfTask);
  assert.deepEqual(
    entries.map((entry) => [entry.part, entry.kind, entry.factory ?? null, entry.bytes]),
    [
      ['runs', 'handed', 'nemia', 7],
      ['engine', 'journals', null, 20],
      ['engine', 'engine-other', null, 880],
      ['engine', 'journals', 'nemia', 100],
      ['other', 'other', null, 3],
    ],
  );
  assert.deepEqual(withKept(walkedWith(1000), [], factoryOfTask), walkedWith(1000), 'and a runtime with no task changes nothing');
  const drawn = withKept(walkedWith(1000), [{ taskId: 't-n1', engine: { journals: 0 }, sessions: 0, unread: 0 }], factoryOfTask);
  assert.deepEqual(
    drawn.filter((entry) => entry.part === 'sessions' || entry.kind === 'journals'),
    [{ part: 'sessions', kind: 'harness-records', factory: 'nemia', bytes: 0, unread: 0 }],
    'a kind that holds nothing adds no entry, and a record kept at zero bytes is said',
  );
});

test('bytes named by tasks above the walked whole leave engine-other at zero, never below', () => {
  const entries = withKept(walkedWith(100), [{ taskId: 't-n1', engine: { 'session-output': 160 }, unread: 0 }], factoryOfTask);
  assert.deepEqual(
    entries.filter((entry) => entry.part === 'engine'),
    [
      { part: 'engine', kind: 'engine-other', bytes: 0, unread: 0 },
      { part: 'engine', kind: 'session-output', factory: 'nemia', bytes: 160, unread: 0 },
    ],
  );
});

test('an ask that failed leaves the engine whole, and the sessions one entry with no bytes and a name unread; an engine that did not read stays so', () => {
  assert.deepEqual(withKept(walkedWith(1000), undefined, factoryOfTask), [
    { part: 'runs', kind: 'handed', factory: 'nemia', bytes: 7, unread: 0 },
    { part: 'engine', kind: 'engine-other', bytes: 1000, unread: 0 },
    { part: 'sessions', kind: 'harness-records', unread: 1 },
    { part: 'other', kind: 'other', bytes: 3, unread: 0 },
  ]);
  const unread: DiskEntry[] = [{ part: 'engine', kind: 'engine-other', unread: 1 }];
  assert.deepEqual(
    withKept(unread, [{ taskId: 'gone', engine: { journals: 5 }, unread: 0 }], factoryOfTask),
    [
      { part: 'engine', kind: 'journals', bytes: 5, unread: 0 },
      { part: 'engine', kind: 'engine-other', unread: 1 },
    ],
    'no bytes, never zero, for what no task names; the runtime still says what it measured',
  );
});
