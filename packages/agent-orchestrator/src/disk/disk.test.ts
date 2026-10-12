/**
 * The disk's pure half (`disk.ts`): which part a name of the store's root is, which run a name beside a record belongs to, a walk's
 * answers summed by part and factory with what did not read never said as zero, what the runtime keeps by task laid over them, the
 * runs that hold the most, and the label sets gone.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DISK_PARTS,
  DISK_RUNS_NAMED,
  entryKey,
  entryOf,
  largestOf,
  partOf,
  readingOf,
  runOf,
  unreadByPart,
  vanished,
  withKept,
  type DiskEntry,
  type DiskRoot,
  type TaskKept,
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
  { part: 'other', path: '/s', own: 4 },
  { part: 'runs', path: '/s/runs', own: 8 },
  { part: 'runs', name: 'a', path: '/s/runs/a' },
  { part: 'runs', name: 'a.json', path: '/s/runs/a.json' },
  { part: 'runs', name: 'b', path: '/s/runs/b' },
  { part: 'runs', name: 'gone', path: '/s/runs/gone' },
  { part: 'worktrees', name: 'a', path: '/s/worktrees/a' },
  { part: 'engine', path: '/s/engine' },
  { part: 'series', path: '/s/metrics' },
  { part: 'other', path: '/s/inbox' },
];
const RUNS = runsOf({ a: 'nemia', b: 'pipao' });

test('a reading sums each part, by factory where a root is a run known, in the order of the parts; a name of no run is its part alone', () => {
  const reading = readingOf(ROOTS, whole([4, 8, 100, 2, 30, 5, 1000, 700, 20, 6]), RUNS, SPACE, AT);
  assert.deepEqual(reading, {
    at: AT,
    free: 70,
    size: 100,
    entries: [
      { part: 'worktrees', factory: 'nemia', bytes: 1000, unread: 0 },
      { part: 'runs', bytes: 13, unread: 0 },
      { part: 'runs', factory: 'nemia', bytes: 102, unread: 0 },
      { part: 'runs', factory: 'pipao', bytes: 30, unread: 0 },
      { part: 'engine', bytes: 700, unread: 0 },
      { part: 'series', bytes: 20, unread: 0 },
      { part: 'other', bytes: 10, unread: 0 },
    ],
  });
  const sum = reading.entries.reduce((n, entry) => n + (entry.bytes ?? 0), 0);
  assert.equal(sum, 4 + 8 + 100 + 2 + 30 + 5 + 1000 + 700 + 20 + 6, 'every root is in one entry');
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
      { part: 'runs', factory: 'nemia', bytes: 102, unread: 3 },
      { part: 'runs', factory: 'pipao', unread: 1 },
      { part: 'engine', unread: 1 },
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
  const many: DiskRoot[] = Array.from({ length: DISK_RUNS_NAMED + 1 }, (_, k) => ({ part: 'runs', name: `r${k}`, path: `/s/runs/r${k}` }));
  const sizes = many.map((_, k) => (k === 3 ? 0 : k + 1));
  const named = largestOf([...many, { part: 'runs', name: 'empty', path: '/s/runs/empty' }], whole([...sizes, 0]), runsOf({}));
  assert.equal(DISK_RUNS_NAMED, 10);
  assert.deepEqual(
    named.map((run) => run.run),
    ['r10', 'r9', 'r8', 'r7', 'r6', 'r5', 'r4', 'r2', 'r1', 'r0'],
    'REFUSED: an eleventh run, and one that holds nothing',
  );
});

test('a label set said before and in no entry now is gone; one whose entry did not read is not', () => {
  const said = new Set(
    [{ part: 'runs' as const, factory: 'nemia' }, { part: 'runs' as const, factory: 'pipao' }, { part: 'engine' as const }].map(entryKey),
  );
  const gone = vanished(said, [
    { part: 'runs', factory: 'pipao', unread: 1 },
    { part: 'engine', bytes: 3, unread: 0 },
  ]);
  assert.deepEqual(gone.map(entryOf), [{ part: 'runs', factory: 'nemia' }]);
  assert.deepEqual(entryOf(entryKey({ part: 'engine' })), { part: 'engine' });
});

/** A walk's entries around an engine folder of `engine` bytes. */
const walkedWith = (engine: number): DiskEntry[] => [
  { part: 'runs', factory: 'nemia', bytes: 7, unread: 0 },
  { part: 'engine', bytes: engine, unread: 0 },
  { part: 'other', bytes: 3, unread: 0 },
];

/** The factory of each task of the fixtures: `t-n*` nemia's, `t-p*` pipao's, any other no run's. */
const factoryOfTask = (taskId: string): string | undefined =>
  taskId.startsWith('t-n') ? 'nemia' : taskId.startsWith('t-p') ? 'pipao' : undefined;

test('what the runtime keeps by task is the engine by factory, the engine alone the whole less those, and the sessions by factory and alone', () => {
  const kept: TaskKept[] = [
    { taskId: 't-n1', engine: 100, sessions: 40, unread: 0 },
    { taskId: 't-p1', engine: 30, unread: 2 },
    { taskId: 't-n2', engine: 50, sessions: 5, unread: 0 },
    { taskId: 'gone', engine: 20, sessions: 9, unread: 1 },
  ];
  const entries = withKept(walkedWith(1000), kept, factoryOfTask);
  assert.deepEqual(entries, [
    { part: 'runs', factory: 'nemia', bytes: 7, unread: 0 },
    { part: 'engine', bytes: 1000 - 100 - 30 - 50, unread: 1 },
    { part: 'engine', factory: 'nemia', bytes: 150, unread: 0 },
    { part: 'engine', factory: 'pipao', bytes: 30, unread: 2 },
    { part: 'sessions', bytes: 9, unread: 0 },
    { part: 'sessions', factory: 'nemia', bytes: 45, unread: 0 },
    { part: 'other', bytes: 3, unread: 0 },
  ]);
  const engine = entries.filter((entry) => entry.part === 'engine').reduce((sum, entry) => sum + (entry.bytes ?? 0), 0);
  assert.equal(engine, 1000, 'the entries of the engine add up to the walked whole: a task of no run stays in the part alone');
});

test('REFUSED, nothing is drawn: with no task that keeps a record there is no sessions entry at all, not one at zero', () => {
  const kept: TaskKept[] = [
    { taskId: 't-n1', engine: 100, unread: 0 },
    { taskId: 'gone', engine: 20, unread: 0 },
  ];
  const entries = withKept(walkedWith(1000), kept, factoryOfTask);
  assert.deepEqual(
    entries.map((entry) => [entry.part, entry.factory ?? null, entry.bytes]),
    [
      ['runs', 'nemia', 7],
      ['engine', null, 900],
      ['engine', 'nemia', 100],
      ['other', null, 3],
    ],
  );
  assert.deepEqual(withKept(walkedWith(1000), [], factoryOfTask), walkedWith(1000), 'and a runtime with no task changes nothing');
  const drawn = withKept(walkedWith(1000), [{ taskId: 't-n1', engine: 0, sessions: 0, unread: 0 }], factoryOfTask);
  assert.deepEqual(drawn.find((entry) => entry.part === 'sessions'), { part: 'sessions', factory: 'nemia', bytes: 0, unread: 0 });
});

test('bytes given to factories above the walked whole leave the engine alone at zero, never below', () => {
  const entries = withKept(walkedWith(100), [{ taskId: 't-n1', engine: 160, unread: 0 }], factoryOfTask);
  assert.deepEqual(
    entries.filter((entry) => entry.part === 'engine'),
    [
      { part: 'engine', bytes: 0, unread: 0 },
      { part: 'engine', factory: 'nemia', bytes: 160, unread: 0 },
    ],
  );
});

test('an ask that failed leaves the engine whole, and the sessions one entry with no bytes and a name unread; an engine that did not read stays so', () => {
  assert.deepEqual(withKept(walkedWith(1000), undefined, factoryOfTask), [
    { part: 'runs', factory: 'nemia', bytes: 7, unread: 0 },
    { part: 'engine', bytes: 1000, unread: 0 },
    { part: 'sessions', unread: 1 },
    { part: 'other', bytes: 3, unread: 0 },
  ]);
  const unread: DiskEntry[] = [{ part: 'engine', unread: 1 }];
  assert.deepEqual(withKept(unread, [{ taskId: 'gone', engine: 5, unread: 0 }], factoryOfTask), unread, 'no bytes, never zero');
});
