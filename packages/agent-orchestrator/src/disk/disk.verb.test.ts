/**
 * The daemon's measure of the store's disk (`diskOnce`, `disk`) on a store of scratch whose files' sizes are read off the fixture with
 * `lstat`: each part and factory holds what was planted, every name of the store is in one entry, a name that does not read is unread
 * and never zero, the walk's cost is its names and bursts, a label set that is gone is said at zero once, the largest runs are spans,
 * and the loop rests its shipped ten minutes; and, on the runtime's stand-in with sizes planted, the engine's folder by factory and the
 * sessions' records, absent where the runtime keeps none. `WF_ROOT` is set before the store is imported, which reads it as the module
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber, Logger, Metric, Tracer } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { scratch } from '../../test/scratch.ts';
import { steeredClock } from '../../test/steered.ts';
import { until, WAITED } from '../../test/waits.ts';
import type { Answered } from '../prune/prune.ts';
import type { RecentPass } from '../meter/meter.ts';
import type { DiskEntry } from './disk.ts';
import type { EngineService as EngineNeeded } from '../runtime-client.ts';

const BASE = scratch('wf-disk-');
const ROOT = path.join(BASE, 'store');
process.env.WF_ROOT = ROOT;
const { walk, WALK_BURST } = await import('../prune/freed.store.ts');
const { DEFAULT_FACTORY } = await import('../factory/factory.ts');
const { samplesOf } = await import('../series/series.ts');
const { PHASES } = await import('../meter/meter.ts');
const { storeRoots } = await import('./disk.store.ts');
const { disk, DISK_METRICS, DISK_SPAN, DISK_SPAN_KEYS, diskOnce, freshDiskMemory } = await import('./disk.verb.ts');
const { engineOf, over: overEngine } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);

/** A file of `kb` kilobytes under the store. */
const file = (at: string, kb = 8): string => {
  const full = path.join(ROOT, at);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(kb * 1024, 1));
  return full;
};

/** The bytes `lstat` says a name of the store holds on disk, and every name under it. */
const held = (at = ''): number => {
  const full = path.join(ROOT, at);
  const stat = fs.lstatSync(full);
  const under = stat.isDirectory() ? fs.readdirSync(full).reduce((n, name) => n + held(path.join(at, name)), 0) : 0;
  return stat.blocks * 512 + under;
};

/** The bytes a folder of the store holds for itself, the names under it left out. */
const alone = (at = ''): number => fs.lstatSync(path.join(ROOT, at)).blocks * 512;

/** A run a pass answered, as far as the sweep reads it: its id, its factory, and the tasks its one step filed. */
const answered = (id: string, factory?: string, tasks: readonly string[] = []): Answered => ({
  run: { id, ...(factory ? { factory } : {}), steps: { work: { tries: tasks.map((taskId) => ({ taskId })) } } } as never,
  status: 'running',
  feed: {},
});

/** A kept pass that carries no reading. */
const PASS: RecentPass = {
  at: '2026-10-12T06:00:00.000Z',
  ms: 10,
  runs: 3,
  tasks: 0,
  queued: 0,
  admitted: 0,
  records: 3,
  rested: 0,
  reads: 0,
  phases: Object.fromEntries(PHASES.map((phase) => [phase, 1])) as RecentPass['phases'],
};

const ANSWERS = [answered('a', 'nemia'), answered('b', 'pipao'), answered('c')];

/** The parts said before the sessions, in the reading's order. */
const DISK_PARTS_BEFORE: readonly string[] = ['worktrees', 'runs', 'engine'];

/** The store afresh: runs `a` of nemia, `b` of pipao and `c` of no factory, a folder of no run, and every part with files of its own. */
function planted(): void {
  fs.rmSync(ROOT, { recursive: true, force: true });
  file('worktrees/a/design/src/big.bin', 256);
  file('worktrees/a/review/small.bin', 16);
  file('worktrees/b/work/f.bin', 64);
  file('runs/a/artifacts/implement/shot.png', 128);
  file('runs/a.json', 4);
  file('runs/a.asks', 4);
  file('runs/b/artifacts/report.md', 32);
  file('runs/c.json', 12);
  file('runs/forgotten/artifacts/old.png', 48);
  file('engine/runs/a-work/journal.jsonl', 512);
  file('engine/bodies/x', 24);
  file('checks/a-work-check.stdout', 20);
  file('metrics/minute/2026-10-12.jsonl', 40);
  file('inbox/card.md', 8);
  file('feed.jsonl', 36);
}

/** A registry of metrics of a test's own. */
const registryOf = (): Registry => new Map();
type Registry = (typeof Metric.MetricRegistry)['Service'];

/** `program` over `registry` and the test's engine, and each span it made. */
const over = async <A>(registry: Registry, program: Effect.Effect<A, unknown, EngineNeeded>) => {
  const spans: Tracer.NativeSpan[] = [];
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  const value = await Effect.runPromise(
    program.pipe(overEngine(engineOf(engine().layer)), Effect.provideService(Metric.MetricRegistry, registry), Effect.withTracer(tracer)),
  );
  return { value, spans };
};

/** What `registry` holds of the gauge `id`, each series as its labels in words and its value. */
const gauges = async (registry: Registry, id: string): Promise<Record<string, number>> => {
  const snapshot = await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  return Object.fromEntries(
    snapshot
      .filter((m) => m.id === id)
      .map((m) => [
        Object.entries(m.attributes ?? {})
          .map(([key, value]) => `${key}=${value}`)
          .sort()
          .join(' '),
        (m.state as { value: number }).value,
      ]),
  );
};

/** The entry of `part` and `factory` among `entries`. */
const entryOf = (entries: readonly DiskEntry[], part: string, factory?: string) =>
  entries.find((entry) => entry.part === part && entry.factory === factory);

test('a store with files of known sizes is read part by part and factory by factory, and every name of it is in one entry', async () => {
  planted();
  const outside = path.join(BASE, 'main-modules.bin');
  fs.writeFileSync(outside, Buffer.alloc(512 * 1024, 1));
  fs.linkSync(outside, path.join(ROOT, 'worktrees', 'a', 'design', 'linked.bin'));
  const registry = registryOf();
  const { value } = await over(registry, diskOnce(ANSWERS, freshDiskMemory()));
  const { entries } = value.reading;
  const expected: DiskEntry[] = [
    { part: 'worktrees', bytes: alone('worktrees'), unread: 0 },
    { part: 'worktrees', factory: 'nemia', bytes: held('worktrees/a') - held('worktrees/a/design/linked.bin'), unread: 0 },
    { part: 'worktrees', factory: 'pipao', bytes: held('worktrees/b'), unread: 0 },
    { part: 'runs', bytes: alone('runs') + held('runs/forgotten'), unread: 0 },
    { part: 'runs', factory: 'nemia', bytes: held('runs/a') + held('runs/a.json') + held('runs/a.asks'), unread: 0 },
    { part: 'runs', factory: 'pipao', bytes: held('runs/b'), unread: 0 },
    { part: 'runs', factory: DEFAULT_FACTORY, bytes: held('runs/c.json'), unread: 0 },
    { part: 'engine', bytes: held('engine'), unread: 0 },
    { part: 'checks', bytes: held('checks'), unread: 0 },
    { part: 'series', bytes: held('metrics'), unread: 0 },
    { part: 'other', bytes: alone() + held('inbox') + held('feed.jsonl'), unread: 0 },
  ];
  assert.deepEqual(entries, expected, 'each part holds what was planted in it: a part left out, or put in another, differs here');
  assert.ok(
    expected.every((entry) => (entry.bytes ?? 0) > 0),
    'the fixture holds blocks in every entry',
  );
  const whole = await Effect.runPromise(walk([ROOT]));
  const sum = entries.reduce((n, entry) => n + (entry.bytes ?? 0), 0);
  assert.equal(sum, whole.bytes[0], 'the entries add up to the store walked whole: a part left out is missing here');
  assert.equal(
    sum,
    held() - held('worktrees/a/design/linked.bin'),
    'and to the fixture, a file whose other name is outside the store left out',
  );
  assert.equal(value.names, whole.names - 3, 'the sweep reads each name once: all but the store, runs and worktrees, counted when listed');
  assert.equal(value.bursts, Math.floor(value.names / WALK_BURST));

  const bytes = await gauges(registry, 'disk.bytes');
  assert.equal(bytes['factory=nemia part=worktrees'], entryOf(entries, 'worktrees', 'nemia')!.bytes);
  assert.equal(bytes['factory=pipao part=runs'], held('runs/b'));
  assert.equal(bytes['part=engine'], held('engine'));
  assert.equal(Object.keys(bytes).length, expected.length);
  assert.deepEqual(await gauges(registry, 'disk.unread'), {
    'part=worktrees': 0,
    'part=runs': 0,
    'part=engine': 0,
    'part=sessions': 0,
    'part=checks': 0,
    'part=series': 0,
    'part=other': 0,
  });
  const free = (await gauges(registry, 'disk.free'))[''];
  const size = (await gauges(registry, 'disk.size'))[''];
  assert.deepEqual([free, size], [value.reading.free, value.reading.size]);
  assert.ok(free > 0 && free <= size, `${free} of ${size}`);
  assert.deepEqual(Object.keys(DISK_METRICS).sort(), ['bytes', 'free', 'size', 'unread']);
});

test('the cost of a sweep is the names of the store and a burst yielded each WALK_BURST of them, whatever the machine', async () => {
  planted();
  const files = 2 * WALK_BURST + 30;
  for (let k = 0; k < files; k++) fs.writeFileSync(path.join(ROOT, 'runs', k % 2 ? 'a' : 'b', `f${k}`), '');
  const count = (at: string): number =>
    1 + (fs.lstatSync(at).isDirectory() ? fs.readdirSync(at).reduce((n, name) => n + count(path.join(at, name)), 0) : 0);
  const { value } = await over(registryOf(), diskOnce(ANSWERS, freshDiskMemory()));
  assert.equal(value.names, count(ROOT) - 3, 'every name once, but the store, runs and worktrees themselves, counted alone when listed');
  assert.equal(value.bursts, Math.floor(value.names / WALK_BURST));
  assert.equal(value.bursts, 2);
});

test('REFUSED: a folder gone between the listing and the walk is unread, never zero, in the reading, the series and the gauges', async () => {
  planted();
  const registry = registryOf();
  const memory = freshDiskMemory();
  const first = (await over(registry, diskOnce(ANSWERS, memory))).value.reading;
  const before = entryOf(first.entries, 'runs', 'pipao')!.bytes!;
  const roots = storeRoots();
  fs.rmSync(path.join(ROOT, 'runs', 'b'), { recursive: true });
  const { reading } = (await over(registry, diskOnce(ANSWERS, memory, roots))).value;
  assert.deepEqual(entryOf(reading.entries, 'runs', 'pipao'), { part: 'runs', factory: 'pipao', unread: 1 });
  const others = (entries: readonly DiskEntry[]) =>
    entries.filter((entry) => !(entry.part === 'runs' && (entry.factory === 'pipao' || !entry.factory)));
  assert.deepEqual(others(reading.entries), others(first.entries), 'every other entry is whole');
  const samples = samplesOf({ ...PASS, disk: reading }).filter((sample) => sample.s.startsWith('disk.'));
  assert.deepEqual(
    samples.filter((sample) => sample.l.part === 'runs' && sample.l.factory === 'pipao'),
    [],
    'no bytes are sampled for what did not read',
  );
  assert.deepEqual(
    samples.filter((sample) => sample.s === 'disk.unread' && sample.v > 0),
    [{ s: 'disk.unread', l: { part: 'runs' }, v: 1 }],
  );
  assert.equal((await gauges(registry, 'disk.unread'))['part=runs'], 1);
  assert.equal(
    (await gauges(registry, 'disk.bytes'))['factory=pipao part=runs'],
    before,
    'the gauge keeps what last read, and is not zeroed',
  );
});

test('a factory whose runs are gone is said at zero once, and not again', async () => {
  planted();
  const registry = registryOf();
  const memory = freshDiskMemory();
  await over(registry, diskOnce(ANSWERS, memory));
  assert.ok((await gauges(registry, 'disk.bytes'))['factory=pipao part=worktrees'] > 0);
  fs.rmSync(path.join(ROOT, 'worktrees', 'b'), { recursive: true });
  fs.rmSync(path.join(ROOT, 'runs', 'b'), { recursive: true });
  const second = (await over(registry, diskOnce(ANSWERS, memory))).value.reading;
  assert.equal(entryOf(second.entries, 'worktrees', 'pipao'), undefined);
  const bytes = await gauges(registry, 'disk.bytes');
  assert.deepEqual([bytes['factory=pipao part=worktrees'], bytes['factory=pipao part=runs']], [0, 0]);
  assert.ok(!memory.said.has(JSON.stringify(['worktrees', 'pipao'])), 'what is gone is remembered no longer');
  const fresh = registryOf();
  await over(fresh, diskOnce(ANSWERS, memory));
  assert.equal('factory=pipao part=worktrees' in (await gauges(fresh, 'disk.bytes')), false, 'the third sweep does not say it again');
});

/** The runs of the kept fixtures: `a` of nemia with two tasks, `b` of pipao with one, `c` of no factory with one. */
const TASKED = [answered('a', 'nemia', ['t-a1', 't-a2']), answered('b', 'pipao', ['t-b1']), answered('c', undefined, ['t-c1'])];

/** Files the stand-in's tasks `ids`, in order. */
const filed = async (ids: readonly string[]): Promise<void> => {
  for (const id of ids) await Effect.runPromise(engineOf(engine().layer).file({ id, brief: 'b', cwd: '/r' }));
};

test('what the runtime keeps by task is said by factory: the engine, the rest of it alone, and the sessions, in the reading, the series and the gauges', async () => {
  planted();
  await filed(['t-a1', 't-a2', 't-b1', 't-c1', 't-of-no-run']);
  engine().keeps('t-a1', { journal: 1000, bodies: 2000, files: 4000, records: 50_000 });
  engine().keeps('t-a2', { journal: 500, records: 10_000 });
  engine().keeps('t-b1', { journal: 300, files: 200 });
  engine().keeps('t-c1', { files: 64, records: 128 });
  engine().keeps('t-of-no-run', { journal: 9000, records: 7000 });
  const registry = registryOf();
  const { reading } = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value;
  const whole = held('engine');
  assert.deepEqual(
    reading.entries.filter((entry) => entry.part === 'engine' || entry.part === 'sessions'),
    [
      { part: 'engine', bytes: whole - 7500 - 500 - 64, unread: 0 },
      { part: 'engine', factory: 'nemia', bytes: 7500, unread: 0 },
      { part: 'engine', factory: 'pipao', bytes: 500, unread: 0 },
      { part: 'engine', factory: DEFAULT_FACTORY, bytes: 64, unread: 0 },
      { part: 'sessions', bytes: 7000, unread: 0 },
      { part: 'sessions', factory: 'nemia', bytes: 60_000, unread: 0 },
      { part: 'sessions', factory: DEFAULT_FACTORY, bytes: 128, unread: 0 },
    ],
  );
  const samples = samplesOf({ ...PASS, disk: reading }).filter((sample) => sample.s === 'disk.bytes');
  assert.deepEqual(
    samples.filter((sample) => sample.l.part === 'sessions' || (sample.l.part === 'engine' && sample.l.factory !== undefined)),
    [
      { s: 'disk.bytes', l: { part: 'engine', factory: 'nemia' }, v: 7500 },
      { s: 'disk.bytes', l: { part: 'engine', factory: 'pipao' }, v: 500 },
      { s: 'disk.bytes', l: { part: 'engine', factory: DEFAULT_FACTORY }, v: 64 },
      { s: 'disk.bytes', l: { part: 'sessions' }, v: 7000 },
      { s: 'disk.bytes', l: { part: 'sessions', factory: 'nemia' }, v: 60_000 },
      { s: 'disk.bytes', l: { part: 'sessions', factory: DEFAULT_FACTORY }, v: 128 },
    ],
  );
  const bytes = await gauges(registry, 'disk.bytes');
  assert.deepEqual(
    [bytes['factory=nemia part=engine'], bytes['factory=nemia part=sessions'], bytes['part=sessions'], bytes['part=engine']],
    [7500, 60_000, 7000, whole - 8064],
  );
  assert.equal('factory=pipao part=sessions' in bytes, false, 'a factory whose tasks keep no record has no sessions series');
});

test('REFUSED: a runtime that keeps no record of any session leaves the reading, the series and the gauges with no sessions bytes', async () => {
  planted();
  await filed(['t-a1', 't-b1']);
  engine().keeps('t-a1', { journal: 1000, files: 4000 });
  const registry = registryOf();
  const { reading } = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value;
  assert.equal(entryOf(reading.entries, 'engine', 'nemia')?.bytes, 5000, 'the runtime was asked, and answered');
  assert.deepEqual(
    reading.entries.filter((entry) => entry.part === 'sessions'),
    [],
  );
  const samples = samplesOf({ ...PASS, disk: reading });
  assert.deepEqual(
    samples.filter((sample) => sample.s === 'disk.bytes' && sample.l.part === 'sessions'),
    [],
  );
  assert.deepEqual(
    Object.keys(await gauges(registry, 'disk.bytes')).filter((labels) => labels.includes('part=sessions')),
    [],
  );
});

test('an engine whose kept fails leaves the engine whole under no factory and the sessions unread with no bytes, the other parts read as before', async () => {
  planted();
  const registry = registryOf();
  const before = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value.reading.entries;
  await filed(['t-a1']);
  engine().keeps('t-a1', { journal: 1000, records: 2000 });
  engine().failKept(1);
  const { reading } = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value;
  assert.deepEqual(reading.entries, [
    ...before.filter((entry) => DISK_PARTS_BEFORE.includes(entry.part)),
    { part: 'sessions', unread: 1 },
    ...before.filter((entry) => !DISK_PARTS_BEFORE.includes(entry.part)),
  ]);
  assert.deepEqual(entryOf(reading.entries, 'engine'), { part: 'engine', bytes: held('engine'), unread: 0 });
  assert.equal((await gauges(registry, 'disk.unread'))['part=sessions'], 1);
});

test("a factory whose sessions' records are gone on the next sweep is said at zero once, and not again", async () => {
  planted();
  await filed(['t-a1']);
  engine().keeps('t-a1', { records: 4096 });
  const registry = registryOf();
  const memory = freshDiskMemory();
  await over(registry, diskOnce(TASKED, memory));
  assert.equal((await gauges(registry, 'disk.bytes'))['factory=nemia part=sessions'], 4096);
  engine().keeps('t-a1', {});
  const second = (await over(registry, diskOnce(TASKED, memory))).value.reading;
  assert.equal(entryOf(second.entries, 'sessions', 'nemia'), undefined);
  assert.equal((await gauges(registry, 'disk.bytes'))['factory=nemia part=sessions'], 0);
  const fresh = registryOf();
  await over(fresh, diskOnce(TASKED, memory));
  assert.equal('factory=nemia part=sessions' in (await gauges(fresh, 'disk.bytes')), false, 'the third sweep does not say it again');
});

test('each of the ten largest runs is a span of its own carrying its run, its bytes and its factory, and an eleventh run is none', async () => {
  planted();
  for (let k = 1; k <= 9; k++) file(`runs/more-${k}/artifacts/f.bin`, 200 + 8 * k);
  const answers = [...ANSWERS, ...Array.from({ length: 9 }, (_, k) => answered(`more-${k + 1}`, 'nemia'))];
  const { value, spans } = await over(registryOf(), diskOnce(answers, freshDiskMemory()));
  const said = spans.filter((span) => span.name === DISK_SPAN);
  assert.equal(said.length, 10);
  assert.deepEqual(
    said.map((span) => Object.fromEntries(span.attributes)),
    value.largest.map((run) => ({ run: run.run, value: run.bytes, ...(run.factory ? { factory: run.factory } : {}) })),
  );
  assert.deepEqual(
    said.map((span) => [...span.attributes.keys()].filter((key) => key !== 'factory')),
    said.map(() => [...DISK_SPAN_KEYS]),
  );
  assert.equal(value.largest[0].run, 'a');
  assert.equal(
    value.largest[0].bytes,
    held('worktrees/a') + held('runs/a') + held('runs/a.json') + held('runs/a.asks'),
    'a run over its parts',
  );
  const named = new Set(value.largest.map((run) => run.run));
  assert.deepEqual(
    ['b', 'c', 'forgotten', ...answers.slice(3).map((a) => a.run.id)].filter((id) => !named.has(id)),
    ['b', 'c', 'forgotten'],
    'the three smallest of thirteen are not named',
  );
  assert.ok(
    said.every((span) => span.parent._tag === 'None' && span.status._tag === 'Ended'),
    'each a root, ended',
  );
});

test(
  'REFUSED at shipped defaults: the loop rests ten minutes between two sweeps, and a sweep that fails warns once, leaves no reading, and ends nothing',
  WAITED,
  async (t) => {
    planted();
    const warned: string[] = [];
    const keeper = Logger.make(({ message }) => void warned.push((Array.isArray(message) ? message : [message]).join(' ')));
    const kept: Array<string | undefined> = [];
    const clock = steeredClock();
    const loop = Effect.runFork(
      disk(
        () => ANSWERS,
        (reading) => void kept.push(reading && `${reading.entries.length} entries`),
      ).pipe(
        overEngine(engineOf(engine().layer)),
        Effect.provideService(Metric.MetricRegistry, new Map()),
        Effect.provide(Logger.layer([keeper])),
        Effect.provide(clock.layer),
      ),
    );
    t.after(() => Effect.runPromise(Fiber.interrupt(loop)));
    const ended = Effect.runPromise(Fiber.join(loop)).then(() => assert.fail('the loop ended'));
    const rested = (times: number) =>
      Promise.race([until(t, () => clock.asked.length === times, `the loop is at rest ${times}`, { bell: clock.bell }), ended]);
    await rested(1);
    assert.deepEqual([clock.asked, kept], [[600_000], ['11 entries']], 'the rest is the shipped ten minutes');
    await clock.adjust(599_999);
    assert.deepEqual([clock.woken, kept.length], [[], 1], 'a millisecond before its rest ends, no sweep');
    fs.renameSync(ROOT, `${ROOT}-away`);
    await clock.adjust(1);
    await rested(2);
    assert.deepEqual(
      [clock.woken, kept],
      [[600_000], ['11 entries', undefined]],
      'at ten minutes, the next sweep: it fails, and no reading is left',
    );
    await clock.adjust(600_000);
    await rested(3);
    assert.equal(warned.length, 1, 'said once across two failed sweeps');
    assert.ok(warned[0].startsWith('What the store takes on the disk could not be measured this sweep: ENOENT'), warned[0]);
    fs.renameSync(`${ROOT}-away`, ROOT);
    await clock.adjust(600_000);
    await rested(4);
    assert.deepEqual(kept, ['11 entries', undefined, undefined, '11 entries'], 'and measures again once the store reads');
  },
);
