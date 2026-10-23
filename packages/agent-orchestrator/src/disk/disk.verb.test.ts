/**
 * The daemon's measure of the store's disk (`diskOnce`, `disk`) on a store of scratch whose files' sizes are read off the fixture with
 * `lstat`: each part and factory holds what was planted, every name of the store is in one entry, a name that does not read is unread
 * and never zero, the walk's cost is its names and bursts, a label set that is gone is said at zero once, the largest runs are spans,
 * and the loop rests its shipped ten minutes; and, on the runtime's stand-in with sizes planted, the engine's folder by factory and the
 * sessions' records, absent where the runtime keeps none. Told as one story on `story(t)`, each checkpoint planting the store afresh
 * and sharing the test's stand-in, whose planted sizes it takes on in its order (a sweep whose `kept` fails first, then one that keeps
 * no record, then each kept); the loop's rest, on a steered clock, stays a test of its own. The kinds, parts and sums as tables are in
 * `disk.test.ts`. `WF_ROOT` is set before the store is imported, which reads it as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber, Logger, Metric, Tracer } from 'effect';
import { testEngine, until, WAITED } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { story } from '../../test/story.ts';
import { scratch } from '../../test/scratch.ts';
import { steeredClock } from '../../test/steered.ts';
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
const { engineOf, HARNESSES, over: overEngine } = await import('../runtime-client.ts');
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

/**
 * `entries` by part and factory, in their order, each the sum of its kinds: bytes where any kind read, and every name that did not.
 */
const byPart = (entries: readonly DiskEntry[]): DiskEntry[] => {
  const by = new Map<string, DiskEntry>();
  for (const { part, factory, bytes, unread } of entries) {
    const key = JSON.stringify([part, factory ?? null]);
    const was = by.get(key) ?? { part, ...(factory === undefined ? {} : { factory }), unread: 0 };
    const sum = bytes === undefined && was.bytes === undefined ? {} : { bytes: (was.bytes ?? 0) + (bytes ?? 0) };
    by.set(key, { ...was, ...sum, unread: was.unread + unread });
  }
  return [...by.values()];
};

/** The entry of `part` and `factory` among `entries`, its kinds summed (`byPart`). */
const entryOf = (entries: readonly DiskEntry[], part: string, factory?: string) =>
  byPart(entries).find((entry) => entry.part === part && entry.factory === factory);

/** Gauges' values by their labels in words (`gauges`), summed over their kinds: the gauges by part and factory. */
const summedOverKinds = (values: Record<string, number>): Record<string, number> => {
  const sums: Record<string, number> = {};
  for (const [labels, value] of Object.entries(values)) {
    const key = labels
      .split(' ')
      .filter((label) => !label.startsWith('kind='))
      .join(' ');
    sums[key] = (sums[key] ?? 0) + value;
  }
  return sums;
};

/** The bytes of each kind among `entries` of `part` and `factory`, by kind. */
const kindsOf = (entries: readonly DiskEntry[], part: string, factory?: string): Record<string, number | undefined> =>
  Object.fromEntries(entries.filter((entry) => entry.part === part && entry.factory === factory).map((entry) => [entry.kind, entry.bytes]));

/** The runs of the kept fixtures: `a` of nemia with two tasks, `b` of pipao with one, `c` of no factory with one. */
const TASKED = [answered('a', 'nemia', ['t-a1', 't-a2']), answered('b', 'pipao', ['t-b1']), answered('c', undefined, ['t-c1'])];

/** Files the stand-in's tasks `ids`, in order, those among `checks` on the checks' harness. */
const filed = async (ids: readonly string[], checks: readonly string[] = []): Promise<void> => {
  for (const id of ids) {
    const harness = checks.includes(id) ? { harness: HARNESSES.check.name } : {};
    await Effect.runPromise(engineOf(engine().layer).file({ id, brief: 'b', cwd: '/r', ...harness }));
  }
};

test('a disk sweep: a store of known sizes across factories read by part, kind and factory, then runs and records removed, and what the runtime keeps planted on its stand-in', async (t) => {
  const s = story(t);
  await s.test(
    'a store with files of known sizes is read part by part and factory by factory, and every name of it is in one entry',
    async () => {
      planted();
      const outside = path.join(BASE, 'main-modules.bin');
      fs.writeFileSync(outside, Buffer.alloc(512 * 1024, 1));
      fs.linkSync(outside, path.join(ROOT, 'worktrees', 'a', 'design', 'linked.bin'));
      const registry = registryOf();
      const { value } = await over(registry, diskOnce(ANSWERS, freshDiskMemory()));
      const entries = byPart(value.reading.entries);
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
      assert.equal(
        value.names,
        whole.names - 3,
        'the sweep reads each name once: all but the store, runs and worktrees, counted when listed',
      );
      assert.equal(value.bursts, Math.floor(value.names / WALK_BURST));

      const kinds = await gauges(registry, 'disk.bytes');
      assert.equal(Object.keys(kinds).length, value.reading.entries.length, 'a gauge for each kind of each part and factory');
      assert.ok(
        Object.keys(kinds).every((labels) => labels.includes(' kind=') || labels.startsWith('kind=')),
        'each by its kind',
      );
      const bytes = summedOverKinds(kinds);
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
    },
  );

  await s.test(
    "each kind holds its own names: a file with two names inside once, for one of its kinds, one hardlinked from outside not at all, a link's own blocks",
    async () => {
      planted();
      file('worktrees/a/design/node_modules/effect/index.js', 40);
      file('worktrees/a/design/apps/web/node_modules/.bin/vite', 24);
      file('worktrees/a/design/src/node_modules.ts', 12);
      file('runs/a/artifacts/implement/deep/Shot.JPG', 16);
      file('runs/a/artifacts/implement/test-costs-x.json', 20);
      file('runs/a/agents/ada/SKILL.md', 8);
      file('runs/a/inputs/mock.png', 20);
      file('runs/a/work/notes/kept.txt', 4);
      const twice = path.join(ROOT, 'runs/a/inputs/shot-again.png');
      fs.linkSync(path.join(ROOT, 'runs/a/artifacts/implement/shot.png'), twice);
      const outside = path.join(BASE, 'kinds-outside.png');
      fs.writeFileSync(outside, Buffer.alloc(256 * 1024, 1));
      fs.linkSync(outside, path.join(ROOT, 'runs/a/artifacts/implement/outside.png'));
      fs.symlinkSync(outside, path.join(ROOT, 'runs/a/artifacts/implement/link.png'));
      const { value } = await over(registryOf(), diskOnce(ANSWERS, freshDiskMemory()));
      const { entries } = value.reading;
      const shot = held('runs/a/artifacts/implement/shot.png');
      const runs = kindsOf(entries, 'runs', 'nemia');
      const once = { pictures: runs.pictures! - shot, inputs: runs.inputs! - shot };
      const pictures = held('runs/a/artifacts/implement/deep/Shot.JPG') + held('runs/a/artifacts/implement/link.png');
      const inputs = alone('runs/a/inputs') + held('runs/a/inputs/mock.png');
      assert.ok(
        (once.pictures === pictures && runs.inputs === inputs) || (runs.pictures === pictures && once.inputs === inputs),
        `the file of two names inside is in pictures or in inputs, once: ${JSON.stringify(runs)}`,
      );
      const handed = ['artifacts', 'artifacts/implement', 'artifacts/implement/deep'].reduce((n, at) => n + alone(`runs/a/${at}`), 0);
      assert.deepEqual(
        { ...runs, pictures: undefined, inputs: undefined },
        {
          'runs-other': alone('runs/a') + held('runs/a/work'),
          pictures: undefined,
          handed: handed + held('runs/a/artifacts/implement/test-costs-x.json'),
          agents: held('runs/a/agents'),
          inputs: undefined,
          records: held('runs/a.json'),
          marks: held('runs/a.asks'),
        },
        'each kind of the run, in their order; a file hardlinked from outside in none, a link as a link',
      );
      const modules = held('worktrees/a/design/node_modules') + held('worktrees/a/design/apps/web/node_modules');
      assert.deepEqual(kindsOf(entries, 'worktrees', 'nemia'), { checkout: held('worktrees/a') - modules, dependencies: modules });
      assert.deepEqual(
        [kindsOf(entries, 'runs'), kindsOf(entries, 'checks'), kindsOf(entries, 'series'), kindsOf(entries, 'other')],
        [
          {
            'runs-other': alone('runs') + alone('runs/forgotten'),
            handed: alone('runs/forgotten/artifacts'),
            pictures: held('runs/forgotten/artifacts/old.png'),
          },
          { checks: held('checks') },
          { series: held('metrics') },
          { other: alone() + held('inbox') + held('feed.jsonl') },
        ],
      );
      const whole = await Effect.runPromise(walk([ROOT]));
      const sum = entries.reduce((n, entry) => n + (entry.bytes ?? 0), 0);
      assert.equal(sum, whole.bytes[0], 'the kinds add up to the store walked whole');
      assert.equal(
        sum,
        held() - held('runs/a/artifacts/implement/outside.png') - shot,
        'and to the fixture, each file once, none from outside',
      );
    },
  );

  await s.test(
    'the cost of a sweep is the names of the store and a burst yielded each WALK_BURST of them, whatever the machine',
    async () => {
      planted();
      const files = 2 * WALK_BURST + 30;
      for (let k = 0; k < files; k++) fs.writeFileSync(path.join(ROOT, 'runs', k % 2 ? 'a' : 'b', `f${k}`), '');
      const count = (at: string): number =>
        1 + (fs.lstatSync(at).isDirectory() ? fs.readdirSync(at).reduce((n, name) => n + count(path.join(at, name)), 0) : 0);
      const { value } = await over(registryOf(), diskOnce(ANSWERS, freshDiskMemory()));
      assert.equal(
        value.names,
        count(ROOT) - 3,
        'every name once, but the store, runs and worktrees themselves, counted alone when listed',
      );
      assert.equal(value.bursts, Math.floor(value.names / WALK_BURST));
      assert.equal(value.bursts, 2);
    },
  );

  await s.test(
    'REFUSED: a folder gone between the listing and the walk is unread, never zero, in the reading, the series and the gauges',
    async () => {
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
      assert.deepEqual(
        reading.entries.filter((entry) => entry.factory === 'pipao' && entry.part === 'runs'),
        [{ part: 'runs', kind: 'runs-other', factory: 'pipao', unread: 1 }],
        "what did not read is on its root's own kind",
      );
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
        summedOverKinds(await gauges(registry, 'disk.bytes'))['factory=pipao part=runs'],
        before,
        'the gauges of every kind keep what last read, and none is zeroed',
      );
    },
  );

  await s.test('a factory whose runs are gone is said at zero once, and not again', async () => {
    planted();
    const registry = registryOf();
    const memory = freshDiskMemory();
    await over(registry, diskOnce(ANSWERS, memory));
    assert.ok(summedOverKinds(await gauges(registry, 'disk.bytes'))['factory=pipao part=worktrees'] > 0);
    fs.rmSync(path.join(ROOT, 'worktrees', 'b'), { recursive: true });
    fs.rmSync(path.join(ROOT, 'runs', 'b'), { recursive: true });
    const second = (await over(registry, diskOnce(ANSWERS, memory))).value.reading;
    assert.equal(entryOf(second.entries, 'worktrees', 'pipao'), undefined);
    const bytes = await gauges(registry, 'disk.bytes');
    const pipao = Object.entries(bytes).filter(([labels]) => labels.startsWith('factory=pipao'));
    assert.deepEqual(
      pipao.map(([labels, value]) => [labels.replace(/ part=.*/, ''), value]),
      pipao.map(([labels]) => [labels.replace(/ part=.*/, ''), 0]),
    );
    assert.deepEqual(
      pipao.map(([labels]) => labels).sort(),
      ['factory=pipao kind=checkout part=worktrees', 'factory=pipao kind=handed part=runs', 'factory=pipao kind=runs-other part=runs'],
      'every kind of it is said at zero',
    );
    assert.ok(![...memory.said].some((key) => key.includes('"pipao"')), 'what is gone is remembered no longer');
    const fresh = registryOf();
    await over(fresh, diskOnce(ANSWERS, memory));
    const again = Object.keys(await gauges(fresh, 'disk.bytes')).filter((labels) => labels.startsWith('factory=pipao'));
    assert.deepEqual(again, [], 'the third sweep does not say it again');
  });

  await s.test(
    'an engine whose kept fails leaves the engine whole under no factory and the sessions unread with no bytes, the other parts read as before',
    async () => {
      planted();
      const registry = registryOf();
      const before = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value.reading.entries;
      await filed(['t-a1']);
      engine().keeps('t-a1', { journal: 1000, records: 2000 });
      engine().failKept(1);
      const { reading } = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value;
      assert.deepEqual(reading.entries, [
        ...before.filter((entry) => DISK_PARTS_BEFORE.includes(entry.part)),
        { part: 'sessions', kind: 'harness-records', unread: 1 },
        ...before.filter((entry) => !DISK_PARTS_BEFORE.includes(entry.part)),
      ]);
      assert.deepEqual(
        reading.entries.filter((entry) => entry.part === 'engine'),
        [{ part: 'engine', kind: 'engine-other', bytes: held('engine'), unread: 0 }],
      );
      assert.equal((await gauges(registry, 'disk.unread'))['part=sessions'], 1);
    },
  );

  await s.test(
    'REFUSED: a runtime that keeps no record of any session leaves the reading, the series and the gauges with no sessions bytes',
    async () => {
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
    },
  );

  await s.test("a factory whose sessions' records are gone on the next sweep is said at zero once, and not again", async () => {
    planted();
    await filed(['t-a1']);
    engine().keeps('t-a1', { records: 4096 });
    const registry = registryOf();
    const memory = freshDiskMemory();
    await over(registry, diskOnce(TASKED, memory));
    assert.equal((await gauges(registry, 'disk.bytes'))['factory=nemia kind=harness-records part=sessions'], 4096);
    engine().keeps('t-a1', {});
    const second = (await over(registry, diskOnce(TASKED, memory))).value.reading;
    assert.equal(entryOf(second.entries, 'sessions', 'nemia'), undefined);
    assert.equal((await gauges(registry, 'disk.bytes'))['factory=nemia kind=harness-records part=sessions'], 0);
    const fresh = registryOf();
    await over(fresh, diskOnce(TASKED, memory));
    assert.equal(
      'factory=nemia kind=harness-records part=sessions' in (await gauges(fresh, 'disk.bytes')),
      false,
      'the third sweep does not say it again',
    );
  });

  await s.test(
    'each of the ten largest runs is a span of its own carrying its run, its bytes and its factory, and an eleventh run is none',
    async () => {
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
    },
  );

  await s.test(
    "what the runtime keeps by task is said by factory and kind, a check's output apart from a session's, the rest of the engine alone",
    async () => {
      planted();
      await filed(['t-a1', 't-a2', 't-b1', 't-c1', 't-of-no-run'], ['t-a1', 't-b1']);
      engine().keeps('t-a1', { journal: 1000, bodies: 2000, output: 3000, files: 4000, records: 50_000 });
      engine().keeps('t-a2', { journal: 500, output: 700, records: 10_000 });
      engine().keeps('t-b1', { journal: 300, output: 200 });
      engine().keeps('t-c1', { files: 64, records: 128 });
      engine().keeps('t-of-no-run', { journal: 9000, output: 1000, records: 7000 });
      const registry = registryOf();
      const { reading } = (await over(registry, diskOnce(TASKED, freshDiskMemory()))).value;
      const whole = held('engine');
      const named = 1000 + 2000 + 3000 + 4000 + 500 + 700 + 300 + 200 + 64 + 9000 + 1000;
      assert.deepEqual(
        reading.entries.filter((entry) => entry.part === 'engine' || entry.part === 'sessions'),
        [
          { part: 'engine', kind: 'session-output', bytes: 1000, unread: 0 },
          { part: 'engine', kind: 'journals', bytes: 9000, unread: 0 },
          { part: 'engine', kind: 'engine-other', bytes: whole - named, unread: 0 },
          { part: 'engine', kind: 'session-output', factory: 'nemia', bytes: 700, unread: 0 },
          { part: 'engine', kind: 'check-output', factory: 'nemia', bytes: 3000, unread: 0 },
          { part: 'engine', kind: 'session-files', factory: 'nemia', bytes: 4000, unread: 0 },
          { part: 'engine', kind: 'journals', factory: 'nemia', bytes: 1500, unread: 0 },
          { part: 'engine', kind: 'bodies', factory: 'nemia', bytes: 2000, unread: 0 },
          { part: 'engine', kind: 'check-output', factory: 'pipao', bytes: 200, unread: 0 },
          { part: 'engine', kind: 'journals', factory: 'pipao', bytes: 300, unread: 0 },
          { part: 'engine', kind: 'session-files', factory: DEFAULT_FACTORY, bytes: 64, unread: 0 },
          { part: 'sessions', kind: 'harness-records', bytes: 7000, unread: 0 },
          { part: 'sessions', kind: 'harness-records', factory: 'nemia', bytes: 60_000, unread: 0 },
          { part: 'sessions', kind: 'harness-records', factory: DEFAULT_FACTORY, bytes: 128, unread: 0 },
        ],
      );
      assert.equal(
        entryOf(reading.entries, 'engine')!.bytes! + named - 1000 - 9000,
        whole,
        "the engine's kinds add up to the engine walked",
      );
      const samples = samplesOf({ ...PASS, disk: reading }).filter((sample) => sample.s === 'disk.bytes');
      assert.deepEqual(
        samples.filter((sample) => sample.l.part === 'sessions' || (sample.l.part === 'engine' && sample.l.factory === 'pipao')),
        [
          { s: 'disk.bytes', l: { part: 'engine', kind: 'check-output', factory: 'pipao' }, v: 200 },
          { s: 'disk.bytes', l: { part: 'engine', kind: 'journals', factory: 'pipao' }, v: 300 },
          { s: 'disk.bytes', l: { part: 'sessions', kind: 'harness-records' }, v: 7000 },
          { s: 'disk.bytes', l: { part: 'sessions', kind: 'harness-records', factory: 'nemia' }, v: 60_000 },
          { s: 'disk.bytes', l: { part: 'sessions', kind: 'harness-records', factory: DEFAULT_FACTORY }, v: 128 },
        ],
      );
      const bytes = await gauges(registry, 'disk.bytes');
      assert.deepEqual(
        [
          bytes['factory=nemia kind=check-output part=engine'],
          bytes['factory=nemia kind=session-output part=engine'],
          bytes['factory=nemia kind=harness-records part=sessions'],
          bytes['kind=engine-other part=engine'],
        ],
        [3000, 700, 60_000, whole - named],
      );
      assert.equal(
        Object.keys(bytes).some((labels) => labels.startsWith('factory=pipao') && labels.endsWith('part=sessions')),
        false,
        'a factory whose tasks keep no record has no sessions series',
      );
    },
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
    assert.deepEqual([clock.asked, kept], [[600_000], ['18 entries']], 'the rest is the shipped ten minutes');
    await clock.adjust(599_999);
    assert.deepEqual([clock.woken, kept.length], [[], 1], 'a millisecond before its rest ends, no sweep');
    fs.renameSync(ROOT, `${ROOT}-away`);
    await clock.adjust(1);
    await rested(2);
    assert.deepEqual(
      [clock.woken, kept],
      [[600_000], ['18 entries', undefined]],
      'at ten minutes, the next sweep: it fails, and no reading is left',
    );
    await clock.adjust(600_000);
    await rested(3);
    assert.equal(warned.length, 1, 'said once across two failed sweeps');
    assert.ok(warned[0].startsWith('What the store takes on the disk could not be measured this sweep: ENOENT'), warned[0]);
    fs.renameSync(`${ROOT}-away`, ROOT);
    await clock.adjust(600_000);
    await rested(4);
    assert.deepEqual(kept, ['18 entries', undefined, undefined, '18 entries'], 'and measures again once the store reads');
  },
);
