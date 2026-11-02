/**
 * One `nemia up` per store, on disk: `$WF_ROOT/daemon.json` written by the daemon as it takes the store, after each pass and as it stops; a
 * second `nemia up`, and a `nemia tick` by hand, refused while it names a live process whose last pass is recent; and a holder stale, gone
 * or stopped taken over. The judgement itself is pure, and lives in daemon.test.ts.
 *
 * A store of its own, since the verbs read every run under `WF_ROOT`. The engine is a fake whose tick is all a pass over an empty store
 * asks of it, so a test counts the passes and reads the file between them. A holder that is alive is a real process of the test's — a
 * sleeper — written with its own start from `/proc`, as `nemia up` writes its own; one that is gone is a child that has exited; and a pid
 * reused after a crash is the sleeper under a start that is not its own. `WF_ROOT` is read as the module loads, so it is set before the
 * import; `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of runs at rest, and a difference throws (`verifyRest`
 * in tick.verb.ts).
 */
import { after, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { Effect } from 'effect';
import type { RefusedMove, TickReport } from 'agent-runtime';
import type { Engine } from '../runtime-client.ts';
import { nodeChild } from '../../test/child.ts';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runGiven } from '../../test/placed.ts';
import { collector, seriesOf } from '../../test/collector.ts';
import { story } from '../../test/checkpoints.ts';

const ROOT = scratch('wf-daemon-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { beat, daemonFile, daemonStanding, lastCeilings, procStartOf, readFeed } = await import('../runner.ts');
const stand = eachTest(testPlace);
const runPlaced = runGiven(() => stand().layer);
const {
  heldServes,
  servesOnStore,
  parseDaemonFile,
  parsePassCost,
  parseRecentPasses,
  passed,
  recentFile,
  recentPasses,
  recordRecentPass,
  releaseStore,
  takeStore,
} = await import('./daemon.store.ts');
const { PHASES, passCost } = await import('../meter/meter.ts');
const { main: cli } = await import('../cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);

const FILE = path.join(ROOT, 'daemon.json');

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith =
  (...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number }) =>
    err.exitCode === 2 && patterns.every((p) => p.test(err.message));

/** A live process that is not this one, to hold the store: killed when the file's tests are done. */
const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' });
after(() => {
  sleeper.kill();
});
const LIVE = sleeper.pid!;

/** A pid whose process has exited: a crashed daemon's. */
const GONE = spawnSync(process.execPath, ['-e', '0']).pid;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** This boot's id, read here apart from the store's own reader. */
const BOOT = fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim();

/** The kernel's monotonic clock `m` minutes ago, under this boot's id, as the daemon stamps a reading beside a wall stamp. */
const monoAgo = (m: number) => ({ boot: BOOT, ms: Number(process.hrtime.bigint() / 1_000_000n) - m * 60_000 });

/**
 * The instant a test that reads an age or a stamp seeds `Date` at, before it writes its fixture: the CLI reads the clock itself, so only
 * a seeded clock makes every age `nemia up`, `nemia ls` and `nemia tick` print the fixture's own, whatever the machine's clock does
 * meanwhile.
 */
const NOW = Date.parse('2026-10-02T12:00:00.000Z');

/** Seeds `Date` at `NOW` for the rest of the test; `t.mock` lets it go when the test ends. */
const seeded = (t: TestContext) => t.mock.timers.enable({ apis: ['Date'], now: NOW });

/** `ms` after `NOW`, as the daemon writes a stamp. */
const at = (ms: number) => new Date(NOW + ms).toISOString();

/** A holder's file, written as `nemia up` writes one — its process's start with its pid — over what is there. */
const holdBy = (pid: number, over: Record<string, unknown> = {}): string => {
  const text = `${JSON.stringify({ pid, startedAt: minutesAgo(30), cwd: '/elsewhere', every: 4000, passedAt: minutesAgo(0.05), procStart: procStartOf(pid), ...over }, null, 2)}\n`;
  fs.writeFileSync(FILE, text);
  return text;
};

/** A duration as `durationWord` prints it (3s, 16m11s, 1h05m, 2d03h) in milliseconds; NaN for a word that is not wholly such pairs. */
const msOfWord = (word: string): number => {
  if (!/^(?:\d+[dhms])+$/.test(word)) return NaN;
  const unit = { d: 86_400_000, h: 3_600_000, m: 60_000, s: 1000 } as const;
  return [...word.matchAll(/(\d+)([dhms])/g)].reduce((ms, [, n, u]) => ms + Number(n) * unit[u as keyof typeof unit], 0);
};

/** The silence over which a holder at every 4000ms is stale, as `nemia up` prints it. */
const STALE = '15m00s';

/**
 * Whether `line` is `nemia up`'s takeover of a stale holder `pid` at every 4000ms: that pid, a silence over the bound it names, and the
 * fixture's own, `silent`.
 */
const saysStale = (line: string, pid: number, silent: string): boolean => {
  const silence = new RegExp(
    `^ {3}took ${ROOT} over from pid ${pid}, alive but silent for (\\S+), over the ${STALE} that is stale at every 4000ms — `,
  ).exec(line)?.[1];
  return silence === silent && msOfWord(silence) > msOfWord(STALE);
};

const read = () =>
  JSON.parse(fs.readFileSync(FILE, 'utf8')) as {
    pid: number;
    startedAt: string;
    cwd: string;
    every: number;
    passedAt: string | null;
    by?: string;
    url?: string;
    beatAt?: string;
    procStart?: number;
    stoppedAt?: string;
    startedMono?: { boot: string; ms: number };
    passedMono?: { boot: string; ms: number };
    beatMono?: { boot: string; ms: number };
    release?: { kind: string; root: string; tag?: string; commit?: string };
    serves?: Record<string, Record<string, unknown>>;
    holder?: Record<string, Record<string, unknown>>;
  };

const STOP = Object.assign(new Error('the test stops the daemon'), { exitCode: 9 });

/** An engine whose tick counts the passes and runs `each` on each, which may throw to stop the daemon. */
/** A pass's report that did nothing, with what a test says of it. */
const pass = (said: Partial<TickReport> = {}): TickReport => ({
  tasks: 0,
  actions: 0,
  running: {},
  views: [],
  ms: 0,
  observed: {},
  refused: [],
  unreadable: [],
  unobserved: [],
  ...said,
});

const engineOf = (
  each: (pass: number) => void = () => {
    throw STOP;
  },
) => {
  const state = {
    passes: 0,
    tick: async (): Promise<TickReport> => {
      state.passes++;
      each(state.passes);
      return pass();
    },
  };
  const e = promised({ tick: () => state.tick(), admit: async () => [] });
  return Object.defineProperties(e, {
    passes: {
      get: () => state.passes,
      set: (n: number) => {
        state.passes = n;
      },
    },
    setTick: { value: (tick: () => Promise<TickReport>) => void (state.tick = tick) },
  }) as Engine & { passes: number; setTick: (tick: () => Promise<TickReport>) => void };
};

/** What a verb printed, line by line, and what it threw. */
const typed = async (t: TestContext, argv: string[], e: Engine) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.map(String).join(' '));
  });
  let threw: unknown;
  try {
    await main(argv, e);
  } catch (err) {
    threw = err;
  } finally {
    log.mock.restore();
  }
  return { printed, threw };
};

const clear = () => fs.rmSync(FILE, { force: true });

test(
  'a pass that runs long is heard from: the beat is written while the pass awaits, and the store reads as ticking throughout',
  WAITED,
  async (t) => {
    assert.equal(daemonFile(), FILE);
    clear();
    seeded(t);
    const beats: string[] = [];
    const kinds = new Set<string>();
    const e = engineOf(() => {
      throw STOP;
    });
    e.setTick(async () => {
      e.passes++;
      await until(
        t,
        () => {
          const f = read();
          assert.equal(f.passedAt, null, 'no pass completed: the beat is not a pass');
          if (f.beatAt && f.beatAt !== beats.at(-1)) beats.push(f.beatAt);
          kinds.add(daemonStanding().kind);
          t.mock.timers.tick(1);
          return beats.length >= 2;
        },
        "two beats of one pass that awaits them, as an npm ci does: counted, not timed; without the beat's timer none comes",
        { everyMs: 5 },
      );
      throw STOP;
    });
    const { threw } = await typed(t, ['up', '10'], e);
    assert.equal(threw, STOP);
    assert.equal(e.passes, 1);
    assert.ok(Date.parse(beats[1]) > Date.parse(beats[0]), beats.join(' '));
    assert.deepEqual([...kinds], ['ticking']);
    assert.ok(read().stoppedAt, 'let go as it stopped');
  },
);

test('one daemon per store: taken, beaten, refused to a second, taken over when it stalls or goes, and the api as its holder', async (t) => {
  const s = story(t);

  await s.test('nobody holds the store: a hand tick never writes the lease, and ls says who ticks, last on every path', async (t) => {
    clear();
    seeded(t);
    assert.equal(
      (
        await typed(
          t,
          ['tick'],
          engineOf(() => {}),
        )
      ).threw,
      undefined,
    );
    assert.equal(fs.existsSync(FILE), false, "the daemon is the file's one writer");
    const lastLine = async () => (await typed(t, ['ls'], engineOf())).printed.at(-1);
    assert.equal(
      await lastLine(),
      'daemon: none has held this store — nothing ticks it; start one with npm start in apps/api, or nemia up where no board is served — or any nemia command that files work starts one',
    );
    holdBy(LIVE, { passedAt: minutesAgo(20) });
    const stalled = (await lastLine())!;
    assert.ok(
      stalled.startsWith(
        `nemia up: stalled, pid ${LIVE}, every 4000ms — alive, but silent for 20m00s: last pass 20m00s ago (${at(-20 * 60_000)}); `,
      ),
      `silent, and last passed, 20m ago:\n${stalled}`,
    );
    holdBy(GONE);
    assert.match((await lastLine())!, new RegExp(`^nemia up: none ticking — pid ${GONE} is gone, its last pass `));
    clear();
  });

  await s.test(
    'nemia up takes the store: its pid, where and how often it ticks, each pass completed, and lets it go as it stops',
    async (t) => {
      clear();
      seeded(t);
      const seen: ReturnType<typeof read>[] = [];
      const e = engineOf((pass) => {
        seen.push(read());
        if (pass === 3) throw STOP;
        t.mock.timers.tick(1000);
      });
      const { printed, threw } = await typed(t, ['up', '10'], e);
      assert.equal(threw, STOP);
      assert.equal(e.passes, 3);
      assert.deepEqual(
        seen.map((f) => [f.pid, f.cwd, f.every, f.procStart]),
        Array.from({ length: 3 }, () => [process.pid, process.cwd(), 10, procStartOf(process.pid)]),
      );
      assert.equal(typeof seen[0].procStart, 'number', 'its process named by its start, with /proc on this host');
      assert.deepEqual(
        seen.map((f) => [f.startedMono?.boot, f.passedMono?.boot]),
        [
          [BOOT, undefined],
          [BOOT, BOOT],
          [BOOT, BOOT],
        ],
        'each stamp written with its monotonic reading, of this boot',
      );
      assert.ok(seen[2].passedMono!.ms >= seen[1].passedMono!.ms && seen[1].passedMono!.ms >= seen[0].startedMono!.ms);
      assert.deepEqual(
        seen.map((f) => [f.startedAt, f.passedAt]),
        [
          [at(0), null],
          [at(0), at(1000)],
          [at(0), at(2000)],
        ],
        'started when it took the store, no pass completed before the first, and each pass written down as it completed, before the next',
      );
      const stopped = read();
      assert.equal(stopped.passedAt, seen[2].passedAt, 'the pass that threw completed nothing');
      assert.equal(stopped.stoppedAt, at(2000), 'let go as it stopped');
      assert.ok(
        printed.includes(
          `   holds ${ROOT} as pid ${process.pid} — a second daemon, the api or a nemia up, or a nemia tick, on this store is refused while it ticks (daemon.json)`,
        ),
        printed.join('\n'),
      );
      assert.ok(!printed.some((l) => l.includes('took ')), 'an empty store is taken over from nobody');
      assert.deepEqual(
        fs.readdirSync(ROOT).filter((f) => f.startsWith('.daemon')),
        [],
        'no hidden file left behind',
      );
    },
  );

  await s.test('nemia up holds the attached sessions while it holds the store, and lets them go before the store', async (t) => {
    clear();
    seeded(t);
    const held: string[] = [];
    const e = engineOf(() => {
      held.push(`pass, store ${read().stoppedAt ? 'let go' : 'held'}`);
      throw STOP;
    });
    const hold = () =>
      Effect.acquireRelease(
        Effect.sync(() => void held.push('hold')),
        () => Effect.sync(() => void held.push(`let go, store ${read().stoppedAt ? 'let go' : 'held'}`)),
      );
    const { threw } = await typed(t, ['up', '10'], Object.assign(e, { hold }));
    assert.equal(threw, STOP);
    assert.deepEqual(held, ['hold', 'pass, store held', 'let go, store held']);
  });

  await s.test(
    "its beat writes only its own daemon's file: not over another holder, not after a stop, not a file it did not take",
    async () => {
      clear();
      const self = { pid: process.pid, by: 'up' as const, startedAt: minutesAgo(1), cwd: '/here', every: 4000, passedAt: minutesAgo(0.5) };
      fs.writeFileSync(FILE, JSON.stringify(self));
      const mono = monoAgo(0);
      beat(self, { at: Date.parse('2026-09-22T12:00:00.000Z'), mono });
      assert.deepEqual(read(), { ...self, beatAt: '2026-09-22T12:00:00.000Z', beatMono: mono }, 'its own file beats, its last pass kept');
      beat(self, { at: Date.parse('2026-09-22T12:00:04.000Z') });
      assert.deepEqual(
        read(),
        { ...self, beatAt: '2026-09-22T12:00:04.000Z' },
        'a beat with no monotonic reading leaves none of an earlier beat beside its own stamp',
      );
      for (const [name, over] of [
        ['another holder', { pid: LIVE }],
        ['stopped', { stoppedAt: minutesAgo(0.1) }],
        ['an earlier start of this pid', { startedAt: minutesAgo(5) }],
      ] as const) {
        const text = holdBy(process.pid, { ...self, ...over });
        beat(self);
        assert.equal(fs.readFileSync(FILE, 'utf8'), text, name);
      }
      clear();
      beat(self);
      assert.equal(fs.existsSync(FILE), false, 'no file is not written by a beat');
    },
  );

  await s.test('the lease names the release its daemon runs: as it takes the store, through a pass, a beat and its stop', async () => {
    clear();
    const release = { kind: 'install', root: path.join(ROOT, 'releases', 'v1'), tag: 'v1', commit: 'abcdef1234567890' } as const;
    const { held } = takeStore({ every: 4000, cwd: '/here', by: 'api', release });
    assert.deepEqual(read().release, release, 'as it takes the store');
    const next = passed(held);
    assert.deepEqual(read().release, release, 'after a pass');
    beat(next);
    assert.deepEqual(read().release, release, 'after a beat');
    releaseStore(next);
    assert.deepEqual(parseDaemonFile(fs.readFileSync(FILE, 'utf8'))?.release, release, 'after its stop, as the reader decodes it');
    clear();
    takeStore({ every: 4000, cwd: '/here', by: 'api' });
    assert.equal('release' in read(), false, 'a daemon given no release writes none');
    clear();
  });

  await s.test(
    'REFUSED: a second nemia up, and a nemia tick by hand, beside a live daemon that passed recently, the store untouched',
    async (t) => {
      seeded(t);
      for (const over of [{}, { passedAt: null, startedAt: minutesAgo(0.1) }, { passedAt: minutesAgo(14) }]) {
        const text = holdBy(LIVE, over);
        const e = engineOf();
        await assert.rejects(
          main(['up'], e),
          refusedWith(
            new RegExp(`^nemia up: ${ROOT} is held by the nemia up of pid ${LIVE}, started \\S+ in /elsewhere, every 4000ms — `),
            new RegExp(`stop it with kill ${LIVE} — that pid is the node process that ticks, not an npm wrapper`),
          ),
          JSON.stringify(over),
        );
        await assert.rejects(
          main(['tick'], e),
          refusedWith(
            new RegExp(`^nemia tick: ${ROOT} is held by the nemia up of pid ${LIVE}, `),
            new RegExp(`a pass by hand beside it would be a second writer\\. .*kill ${LIVE} `),
          ),
        );
        assert.equal(e.passes, 0, 'neither ticked');
        assert.equal(fs.readFileSync(FILE, 'utf8'), text, 'nor wrote the file');
      }
      holdBy(LIVE);
      const { printed } = await typed(t, ['ls'], engineOf());
      assert.equal(printed[0], 'no runs');
      assert.equal(
        printed.at(-1),
        `nemia up: ticking, pid ${LIVE}, every 4000ms — last pass 3s ago (${at(-3000)})`,
        '`nemia ls` says who ticks, last, and its pass 3s ago',
      );
    },
  );

  await s.test('REFUSED: a live daemon is not read stalled when the wall clock steps forward past its window', async (t) => {
    const text = holdBy(LIVE, { startedMono: monoAgo(30), passedMono: monoAgo(0.05), beatMono: monoAgo(0.05) });
    t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 20 * 60_000 });
    const e = engineOf();
    await assert.rejects(main(['up'], e), refusedWith(new RegExp(`^nemia up: ${ROOT} is held by the nemia up of pid ${LIVE}, `)));
    await assert.rejects(main(['tick'], e), refusedWith(new RegExp(`^nemia tick: ${ROOT} is held by the nemia up of pid ${LIVE}, `)));
    assert.equal(e.passes, 0, 'neither ticked');
    assert.equal(fs.readFileSync(FILE, 'utf8'), text, 'nor wrote the file');
    const { printed } = await typed(t, ['ls'], engineOf());
    assert.match(printed.at(-1)!, new RegExp(`^nemia up: ticking, pid ${LIVE}, every 4000ms — `));
    clear();
  });

  await s.test('a daemon silent past its window on the monotonic clock is taken over, though the wall clock reads it fresh', async (t) => {
    seeded(t);
    holdBy(LIVE, { startedMono: monoAgo(46), passedMono: monoAgo(16) });
    let during: ReturnType<typeof read> | undefined;
    const up = engineOf(() => {
      during = read();
      throw STOP;
    });
    const { printed, threw } = await typed(t, ['up'], up);
    assert.equal(threw, STOP);
    assert.equal(during!.pid, process.pid, 'the store taken');
    const took = printed.filter((l) => l.startsWith('   took '));
    assert.ok(took.length === 1 && saysStale(took[0], LIVE, '16m00s'), printed.join('\n'));
    clear();
  });

  await s.test(
    'a holder stale, gone, stopped or unreadable is taken over by nemia up, and not refused to a nemia tick, which writes nothing',
    async (t) => {
      seeded(t);
      const matches = (pattern: RegExp) => (line: string) => pattern.test(line);
      const cases = [
        {
          name: 'stale',
          pid: LIVE,
          over: { passedAt: minutesAgo(16) },
          took: (line: string) => saysStale(line, LIVE, '16m00s'),
        },
        { name: 'gone', pid: GONE, over: {}, took: matches(new RegExp(`^ {3}took ${ROOT} over from pid ${GONE}, whose process is gone`)) },
        { name: 'stopped', pid: LIVE, over: { stoppedAt: minutesAgo(0.01) }, took: undefined },
        {
          name: 'unreadable',
          pid: LIVE,
          over: { pid: 'nobody' },
          took: matches(new RegExp(`^ {3}took ${ROOT} over from a daemon.json that did not read as a holder$`)),
        },
      ];
      let stale: string | undefined;
      for (const c of cases) {
        const text = holdBy(c.pid, c.over);
        const tick = engineOf(() => {});
        const byHand = await typed(t, ['tick'], tick);
        assert.equal(byHand.threw, undefined, c.name);
        assert.equal(tick.passes, 1, c.name);
        assert.equal(fs.readFileSync(FILE, 'utf8'), text, `${c.name}: a hand tick never writes the file`);

        let during: ReturnType<typeof read> | undefined;
        const up = engineOf(() => {
          during = read();
          throw STOP;
        });
        const { printed, threw } = await typed(t, ['up'], up);
        assert.equal(threw, STOP, c.name);
        assert.equal(during!.pid, process.pid, c.name);
        assert.equal(during!.startedAt, at(0), `${c.name}: a start of its own`);
        assert.equal(during!.stoppedAt, undefined, c.name);
        const took = printed.filter((l) => l.startsWith('   took '));
        if (c.took) assert.ok(took.length === 1 && c.took(took[0]), `${c.name}:\n${printed.join('\n')}`);
        else assert.deepEqual(took, [], `${c.name}: a clean stop is nothing to report`);
        if (c.name === 'stale') stale = took[0];
      }
      const line = stale!;
      const saying = (silence: string) => line.replace(/silent for \S+,/, `silent for ${silence},`);
      assert.ok(saysStale(line, LIVE, '16m00s'), `the stale line read as itself:\n${line}`);
      assert.ok(!saysStale(line.replace(`pid ${LIVE},`, `pid ${GONE},`), LIVE, '16m00s'), 'refused: a line that names another pid');
      assert.ok(!saysStale(saying('3s'), LIVE, '3s'), 'refused: a live holder called stale, whatever silence it is expected to say');
      assert.ok(!saysStale(saying('15m30s'), LIVE, '16m00s'), 'refused: a silence shorter than the fixture is old');
      assert.ok(!saysStale(saying('2h00m'), LIVE, '16m00s'), 'refused: a silence longer than the fixture is old');
    },
  );

  await s.test(
    'a daemon whose store is taken over while it runs stops at its next pass, and writes nothing over the new holder',
    async (t) => {
      clear();
      let theirs = '';
      const e = engineOf((pass) => {
        if (pass === 1) theirs = holdBy(LIVE);
        if (pass > 1) throw STOP;
      });
      const { threw } = await typed(t, ['up', '10'], e);
      assert.ok(threw instanceof Error && threw !== STOP, String(threw));
      assert.match(
        threw.message,
        new RegExp(
          `^nemia up: ${ROOT} was taken over by the nemia up of pid ${LIVE}, started \\S+ in /elsewhere — this one stops rather than be a second writer\\.$`,
        ),
      );
      assert.equal(e.passes, 1, 'no second pass');
      assert.equal(fs.readFileSync(FILE, 'utf8'), theirs, 'neither its heartbeat nor its stop written over the holder');
    },
  );

  await s.test("a pid alive but another process's, reused after a kill -9, holds nothing and is never named as one to kill", async (t) => {
    assert.equal(typeof procStartOf(LIVE), 'number', 'this test needs /proc');
    const text = holdBy(LIVE, { procStart: procStartOf(LIVE)! + 1 });
    const kill = new RegExp(`kill ${LIVE}\\b`);
    const ls = await typed(t, ['ls'], engineOf());
    assert.equal(
      ls.printed.at(-1),
      `nemia up: none ticking — the nemia up of pid ${LIVE} is gone, that pid another process's now; its ${ls.printed.at(-1)!.split('; its ')[1]}`,
      'the sleeper under a start that is not its own: a live pid, a fresh pass, and not the process that wrote the file',
    );
    const tick = engineOf(() => {});
    const byHand = await typed(t, ['tick'], tick);
    assert.equal(byHand.threw, undefined, 'a hand tick is not refused');
    assert.equal(tick.passes, 1);
    assert.equal(fs.readFileSync(FILE, 'utf8'), text);
    let during: ReturnType<typeof read> | undefined;
    const up = await typed(
      t,
      ['up'],
      engineOf(() => {
        during = read();
        throw STOP;
      }),
    );
    assert.equal(up.threw, STOP, 'nemia up took the store and ran');
    assert.equal(during!.pid, process.pid);
    assert.ok(
      up.printed.some(
        (l) =>
          l ===
          `   took ${ROOT} over from pid ${LIVE}, whose process is gone — that pid is another process's now, started after the nemia up that wrote daemon.json — ${l.split(' — ').at(-1)}`,
      ),
      up.printed.join('\n'),
    );
    for (const line of [...ls.printed, ...byHand.printed, ...up.printed]) assert.doesNotMatch(line, kill, line);
    clear();
  });

  await s.test(
    'REFUSED, unconfirmed: a live pid whose start cannot be compared holds the store, and its pid is not handed over bare',
    async () => {
      const text = holdBy(LIVE, { procStart: undefined });
      const e = engineOf();
      const unconfirmed = new RegExp(
        `its pid, once checked: ${LIVE} could not be confirmed here as the process that wrote daemon\\.json \\(the file names no process start\\), .* if ps -p ${LIVE} -o lstart=,args= shows a nemia up started at \\S+, kill ${LIVE}`,
      );
      await assert.rejects(
        main(['up'], e),
        refusedWith(new RegExp(`^nemia up: ${ROOT} is held by the nemia up of pid ${LIVE}, `), unconfirmed),
        'a file with no process start, as one written where there is no /proc reads everywhere: the pid is alive, so it holds',
      );
      await assert.rejects(
        main(['tick'], e),
        refusedWith(new RegExp(`^nemia tick: ${ROOT} is held by the nemia up of pid ${LIVE}, `), unconfirmed),
      );
      await assert.rejects(main(['up'], e), (err: Error) => !new RegExp(`kill ${LIVE} —`).test(err.message));
      assert.equal(e.passes, 0);
      assert.equal(fs.readFileSync(FILE, 'utf8'), text);
      clear();
    },
  );

  await s.test(
    'up as the api takes the store as the api, writes where it serves once it listens, and lets it go as its scope closes',
    async () => {
      clear();
      const { up, holdUrl } = await import('./up.verb.ts');
      const { Effect } = await import('effect');
      const seen: ReturnType<typeof read>[] = [];
      const e = engineOf((n) => {
        seen.push(read());
        if (n === 2) throw STOP;
      });
      const listening = Effect.sync(() => {
        assert.equal(read().url, undefined, 'no url before it listens');
        assert.equal(holdUrl('http://127.0.0.1:8787'), true);
      });
      const threw = await runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api', onTaken: () => listening }))).then(
        () => assert.fail('the daemon returned'),
        (err: unknown) => err,
      );
      assert.equal(threw, STOP);
      assert.deepEqual(
        seen.map((f) => [f.by, f.url]),
        [
          ['api', 'http://127.0.0.1:8787'],
          ['api', 'http://127.0.0.1:8787'],
        ],
        'the holder and its url kept by every pass written down',
      );
      const stopped = read();
      assert.ok(stopped.stoppedAt, 'let go as its scope closed');
      assert.equal(holdUrl('http://127.0.0.1:9999'), false, 'a lease let go takes no url');
      assert.equal(read().url, 'http://127.0.0.1:8787');
      clear();
    },
  );

  await s.test(
    'REFUSED both ways round: an api holding the store refuses a nemia up and a nemia tick, and a nemia up holding it refuses an api',
    async (t) => {
      seeded(t);
      const { up } = await import('./up.verb.ts');
      const { Effect } = await import('effect');
      const text = holdBy(LIVE, { by: 'api', url: 'http://127.0.0.1:8787' });
      const e = engineOf();
      await assert.rejects(
        main(['up'], e),
        refusedWith(
          new RegExp(`^nemia up: ${ROOT} is held by the api of pid ${LIVE} at http://127\\.0\\.0\\.1:8787, started `),
          new RegExp(`stop it with kill ${LIVE} — `),
        ),
      );
      await assert.rejects(main(['tick'], e), refusedWith(new RegExp(`^nemia tick: ${ROOT} is held by the api of pid ${LIVE} at `)));
      const { printed } = await typed(t, ['ls'], engineOf());
      assert.equal(printed.at(-1), `api: ticking, pid ${LIVE} at http://127.0.0.1:8787, every 4000ms — last pass 3s ago (${at(-3000)})`);
      holdBy(LIVE);
      const api = await runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api' })).pipe(Effect.flip));
      assert.ok(
        refusedWith(
          new RegExp(`^api: ${ROOT} is held by the nemia up of pid ${LIVE}, started `),
          new RegExp(`serve a board beside it with --no-tick, or start this api again once it has stopped: stop it with kill ${LIVE} — `),
        )(api as Error),
        String(api),
      );
      assert.equal(e.passes, 0, 'none ticked');
      assert.notEqual(fs.readFileSync(FILE, 'utf8'), text);
      assert.equal(read().by, undefined, 'nor wrote the file: a record that names no holder is a nemia up');
      clear();
    },
  );

  await s.test('an api whose store is taken over while it runs stops at its next pass, naming the new holder', async () => {
    clear();
    const { up } = await import('./up.verb.ts');
    const { Effect } = await import('effect');
    let theirs = '';
    const e = engineOf((n) => {
      if (n === 1) theirs = holdBy(LIVE);
      if (n > 1) throw STOP;
    });
    const threw = await runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api' })).pipe(Effect.flip));
    assert.match(
      (threw as Error).message,
      new RegExp(
        `^api: ${ROOT} was taken over by the nemia up of pid ${LIVE}, started \\S+ in /elsewhere — this one stops rather than be a second writer\\.$`,
      ),
    );
    assert.equal(e.passes, 1);
    assert.equal(fs.readFileSync(FILE, 'utf8'), theirs);
    clear();
  });
});

/** The cards a holder writes on the lease: opaque to this layer, so a shape the runtime would read is all the fixture needs. */
const CARDS = { claude: { name: 'claude', supportedInterfaces: [{ url: 'http://127.0.0.1:45671/claude' }] } };

test('what the lease serves: written by its holder alone, read back, and answered only of another live process', async (t) => {
  await t.test('written by the holding process, and read back key for key through the schema', async () => {
    clear();
    const { held } = takeStore({ every: 4000, cwd: '/here', by: 'api' });
    assert.equal(heldServes(CARDS), true, 'the process that holds the lease writes it');
    assert.deepEqual(read().serves, CARDS, 'on the file');
    assert.deepEqual(
      parseDaemonFile(fs.readFileSync(FILE, 'utf8'))?.serves,
      CARDS,
      'and back through the schema, which names the key — a key it does not name is dropped on the next write',
    );
    const next = passed(held);
    assert.deepEqual(read().serves, CARDS, 'and a pass of its own daemon keeps it');
    beat(next);
    assert.deepEqual(read().serves, CARDS, 'as does its beat');
    clear();
    takeStore({ every: 4000, cwd: '/here', by: 'api' });
    assert.equal('serves' in read(), false, 'a daemon that writes none names none');
    clear();
  });
  await t.test('a lease written before `up` and `serves` reads as them, and its next beat writes them and no `holder`', async () => {
    for (const over of [{ holder: CARDS }, { by: 'wf up', holder: CARDS }, { by: 'up', serves: CARDS }]) {
      const held = parseDaemonFile(holdBy(process.pid, over));
      assert.deepEqual([held?.by, held?.serves], ['up', CARDS], JSON.stringify(over));
      beat(held!);
      const { by, serves, holder, beatAt } = read();
      assert.deepEqual({ by, serves, holder, beat: beatAt !== undefined }, { by: 'up', serves: CARDS, holder: undefined, beat: true });
    }
    clear();
  });
  await t.test('REFUSED: heldServes writes nothing over another holder, after a stop, or where there is no lease', async () => {
    clear();
    for (const [name, over] of [
      ['another holder', { pid: LIVE }],
      ['stopped', { stoppedAt: minutesAgo(0.1) }],
    ] as const) {
      const text = holdBy(process.pid, over);
      assert.equal(heldServes(CARDS), false, `${name}: it answers it wrote nothing`);
      assert.equal(fs.readFileSync(FILE, 'utf8'), text, `${name}: and the file is byte for byte as it was`);
    }
    clear();
    assert.equal(heldServes(CARDS), false, 'no lease is no lease of this process’s');
    assert.equal(fs.existsSync(FILE), false, 'and nothing is written');
  });
  await t.test('servesOnStore answers another live process alone: never its own, never a lease nobody ticks', async () => {
    clear();
    assert.equal(servesOnStore(), undefined, 'no lease serves nothing');
    holdBy(LIVE, { serves: CARDS });
    assert.deepEqual(servesOnStore(), CARDS, 'a ticking lease of another live process names what it serves');
    holdBy(process.pid, { serves: CARDS });
    assert.equal(servesOnStore(), undefined, 'a lease this process holds serves nothing to it: a viewer never dials itself');
    holdBy(LIVE, { serves: CARDS, stoppedAt: minutesAgo(0.1) });
    assert.equal(servesOnStore(), undefined, 'a lease let go names a port no one listens on');
    holdBy(GONE, { serves: CARDS });
    assert.equal(servesOnStore(), undefined, 'nor does one whose process is gone');
    holdBy(LIVE, { serves: CARDS, passedAt: minutesAgo(30), startedAt: minutesAgo(40) });
    assert.equal(servesOnStore(), undefined, 'nor one that has gone silent past its window');
    holdBy(LIVE);
    assert.equal(servesOnStore(), undefined, 'a ticking lease that serves nothing answers none');
    fs.writeFileSync(FILE, 'not json');
    assert.equal(servesOnStore(), undefined, 'and a file that does not read as a lease answers none');
    clear();
  });
});

test('REFUSED: `nemia up` and `nemia tick` given words they do not take, each named, with no pass run and the lease untouched', async (t) => {
  for (const arg of ['-5', '1e400', '0', 'soon'])
    await t.test(`nemia up ${arg}: an interval daemon.json cannot hold, refused before the store is taken`, async () => {
      clear();
      const e = engineOf();
      await assert.rejects(main(['up', arg], e), refusedWith(/whole milliseconds/, new RegExp(`"${arg}"`)));
      assert.equal(e.passes, 0);
      assert.equal(fs.existsSync(FILE), false, 'the store not taken');
    });

  await t.test("nemia up -5 beside a live daemon: the refusal is the interval's, and the lease is not freed", async () => {
    const text = holdBy(LIVE);
    await assert.rejects(main(['up', '-5'], engineOf()), refusedWith(/whole milliseconds/));
    assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  });

  await t.test('nemia tick --stats beside a live daemon: pointed at nemia up --stats', async () => {
    const text = holdBy(LIVE);
    const e = engineOf();
    await assert.rejects(main(['tick', '--stats'], e), refusedWith(new RegExp(`pid ${LIVE}`), /nemia up --stats/));
    assert.equal(e.passes, 0);
    assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  });

  await t.test('nemia tick beside a live daemon: --stats said only to one who asked', async () => {
    holdBy(LIVE);
    await assert.rejects(
      main(['tick'], engineOf()),
      (err: Error & { exitCode?: number }) => err.exitCode === 2 && !err.message.includes('--stats'),
    );
  });

  for (const [argv, names] of [
    [['tick', '--bogus'], [/--bogus/]],
    [
      ['up', '--stats', '20'],
      [/--stats/, /takes no 20/],
    ],
  ] as const)
    await t.test(`nemia ${argv.join(' ')}: the word it does not take named`, async () => {
      clear();
      const e = engineOf();
      await assert.rejects(main([...argv], e), refusedWith(...names));
      assert.equal(e.passes, 0);
      assert.equal(fs.existsSync(FILE), false);
    });
});

test("`nemia up` stopped by a signal lets the store go on the way out, with the signal's exit code", async (t) => {
  for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
    ['SIGHUP', 129],
  ] as const)
    await t.test(`${signal}: ${code}`, async () => {
      clear();
      const cli = new URL('../cli/main.ts', import.meta.url).href;
      const fake = new URL('../../test/promised.ts', import.meta.url).href;
      const w = nodeChild(
        `const { main } = await import(${JSON.stringify(cli)}); const { promised } = await import(${JSON.stringify(fake)}); await main(['up', '20'], promised({ tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }), admit: async () => [] }));`,
        { ...process.env, WF_ROOT: ROOT },
      );
      const { child } = w;
      try {
        await w.until(() => fs.existsSync(FILE) && read().pid === child.pid && Boolean(read().passedAt), 'the daemon wrote a pass');
        child.kill(signal);
        assert.equal(
          (await w.closed).code,
          code,
          'a real process, since a signal stops it; its engine a fake, so no harness is asked anything',
        );
        const file = read();
        assert.equal(file.pid, child.pid);
        assert.ok(file.stoppedAt, 'stoppedAt written as it stopped');
      } finally {
        child.kill('SIGKILL');
        clear();
      }
    });
});

test('`nemia up` says what its passes cost once a minute, not once a pass: nine passes twenty seconds apart are two lines, the third minute not yet over', async (t) => {
  clear();
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const e = engineOf((pass) => {
    if (pass === 10) throw STOP;
    t.mock.timers.tick(20_000);
  });
  const { printed, threw } = await typed(t, ['up', '10'], e);
  t.mock.timers.reset();
  assert.equal(threw, STOP);
  const said = printed.filter((l) => /^\d\d:\d\d:\d\d {2}cost: /.test(l));
  assert.equal(said.length, 2, printed.join('\n'));
  for (const line of said)
    assert.match(
      line,
      /cost: 4 passes in 60s, [\d.]+ ms a pass \(slowest [\d.]+\) — .* read, \d+ process(es)? started; measuring [\d.]+ ms$/,
    );
  clear();
});

test("`nemia up --stats` reads the last pass's cost beside a daemon that holds the store, and ticks nothing", async (t) => {
  clear();
  fs.rmSync(path.join(ROOT, 'tick-stats.json'), { force: true });
  const none = await typed(t, ['up', '--stats'], engineOf());
  assert.equal(none.threw, undefined);
  assert.deepEqual(none.printed, [
    `no pass has written what it cost to ${path.join(ROOT, 'tick-stats.json')} yet — no daemon holds this store: run nemia tick --stats, or start one (npm start in apps/api, or nemia up; any nemia command that files work starts one too)`,
  ]);

  const byHand = await typed(
    t,
    ['tick', '--stats'],
    engineOf(() => {}),
  );
  assert.equal(byHand.threw, undefined);
  const at = byHand.printed.findIndex((l) => l.startsWith('the last pass, at '));
  assert.ok(at >= 0, byHand.printed.join('\n'));
  assert.equal(byHand.printed.at(-1)!.startsWith('measuring it: '), true, 'the breakdown is said last');
  assert.ok(
    byHand.printed.some((l) => /^ {2}runtime +[\d.]+ +1 /.test(l)),
    "the runtime's pass, one call",
  );

  const text = holdBy(LIVE);
  const e = engineOf();
  const held = await typed(t, ['up', '--stats'], e);
  assert.equal(held.threw, undefined);
  assert.equal(e.passes, 0, 'no pass');
  assert.equal(fs.readFileSync(FILE, 'utf8'), text, 'nor the store taken');
  assert.equal(held.printed[0], byHand.printed[at], 'the pass the hand tick wrote');
  assert.equal(held.printed.at(-1), 'written by the daemon that holds this store, after its last pass');
  clear();
  assert.match(
    (await typed(t, ['up', '--stats'], engineOf())).printed.at(-1)!,
    /^no daemon holds this store now, so this was the last pass anyone ran: nemia tick --stats runs one/,
  );
});

test('`nemia up` says a move the runtime refused once while it lasts, and again once it clears and comes back — in its log, beside its other lines', async (t) => {
  clear();
  const stuck: RefusedMove = { taskId: 't-stuck', state: 'working', event: 'SESSION_LIVE' };
  const other: RefusedMove = { taskId: 't-other', state: 'ending', event: 'CLOSED' };
  const byPass = [[stuck], [stuck], [stuck, other], [stuck, other], [], [stuck], [stuck]];
  const e = engineOf();
  e.setTick(async () => {
    e.passes++;
    if (e.passes > byPass.length) throw STOP;
    return pass({ tasks: 2, refused: byPass[e.passes - 1] });
  });
  const { printed, threw } = await typed(t, ['up', '1'], e);
  assert.equal(threw, STOP);
  assert.equal(e.passes, byPass.length + 1, 'every pass ran');
  const said = printed.filter((l) => l.includes('stalled'));
  const words = (m: typeof stuck) =>
    `${m.taskId}  stalled: its lifecycle has no edge from ${m.state} on ${m.event}, so nothing is done; it is asked again each pass`;
  assert.deepEqual(
    said.map((l) => l.slice(10)),
    [words(stuck), words(other), words(stuck)],
    `each pass says what was refused; 5 cleared it, 6 has it back:\n${printed.join('\n')}`,
  );
  assert.ok(
    said.every((l) => /^\d\d:\d\d:\d\d  t-/.test(l)),
    'stamped as the daemon stamps every line',
  );
});

test('`nemia tick` says every move its one pass refused', async (t) => {
  clear();
  const stuck: RefusedMove = { taskId: 't-stuck', state: 'submitted', event: 'READY' };
  const e = engineOf();
  e.setTick(async () => pass({ tasks: 1, refused: [stuck, stuck] }));
  const { printed, threw } = await typed(t, ['tick'], e);
  assert.equal(threw, undefined);
  assert.deepEqual(
    printed.filter((l) => l.includes('stalled')),
    ['t-stuck  stalled: its lifecycle has no edge from submitted on READY, so nothing is done; it is asked again each pass'],
  );
});

test('`nemia up` says a task the runtime left out once while it lasts, and again once it clears and comes back; `nemia tick` says each its pass left out', async (t) => {
  clear();
  const bad = "t-bad's journal (/store/tasks/t-bad.jsonl), entry 2 is a `measured` event, and its `usage.responses` is not a number";
  const feed = 'the feed (/store/feed.jsonl), entry 3 read from cursor 148 is no event this runtime writes';
  const byPass = [[bad], [bad, feed], [bad], [], [bad]];
  const e = engineOf();
  e.setTick(async () => {
    e.passes++;
    if (e.passes > byPass.length) throw STOP;
    return pass({ tasks: 2, unreadable: byPass[e.passes - 1] });
  });
  const errors: string[] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });
  const { threw } = await typed(t, ['up', '1'], e);
  assert.equal(threw, STOP);
  const said = errors.filter((l) => l.includes('left out: '));
  assert.deepEqual(
    said.map((l) => l.slice(10)),
    [`left out: ${bad}`, `left out: ${feed}`, `left out: ${bad}`],
    errors.join('\n'),
  );
  assert.ok(
    said.every((l) => /^\d\d:\d\d:\d\d  left out: /.test(l)),
    'stamped as the daemon stamps every line',
  );
  errors.length = 0;
  e.setTick(async () => pass({ tasks: 2, unreadable: [bad, feed] }));
  assert.equal((await typed(t, ['tick'], e)).threw, undefined);
  assert.deepEqual(errors, [`left out: ${bad}`, `left out: ${feed}`]);
});

/** A pass's cost as the meter writes one: every phase, and two harnesses observed. */
const COST = passCost({
  at: '2026-09-25T10:00:00.000Z',
  ms: 212,
  phases: Object.fromEntries(PHASES.map((p) => [p, { ms: 10, calls: 1, bytes: 100, reads: 1, spawned: 0 }])) as Parameters<
    typeof passCost
  >[0]['phases'],
  harnesses: { claude: { calls: 1, ms: 118, listed: 3, spawned: 1 }, check: { calls: 1, ms: 2, listed: 40, spawned: 0, unread: 1 } },
  records: 12,
  overheadMs: 0.4,
  rested: 3,
  runs: 40,
  tasks: 5,
  queued: 2,
  admitted: 1,
  waitMs: 1500,
  load: 0.25,
});

test('what a pass kept reads back: its cost, the recent passes, the ceilings; REFUSED, read as none, where it does not read', async (t) => {
  const text = JSON.stringify(COST);
  const { place: _, ...noPlace } = COST.phases;
  const { rested: _rested, ...unrested } = COST;
  const unobserved = ['harness `claude`: claude agents: timed out'];
  const refused: readonly (readonly [string, string])[] = [
    ['half a file', text.slice(0, text.length / 2)],
    ['another shape', '[]'],
    ['tick.json', JSON.stringify({ sessions: 2, runs: 0 })],
    ['a phase missing', JSON.stringify({ ...COST, phases: noPlace })],
    ['a time below zero', JSON.stringify({ ...COST, ms: -1 })],
    ['a phase count that is not one', JSON.stringify({ ...COST, phases: { ...COST.phases, act: { ...COST.phases.act, bytes: 'many' } } })],
    ['harnesses not a record', JSON.stringify({ ...COST, harnesses: [] })],
    [
      "a harness's count that is not one",
      JSON.stringify({ ...COST, harnesses: { claude: { calls: 1, ms: 1, listed: 'all', spawned: 0 } } }),
    ],
    ['no count of the runs answered from memory', JSON.stringify(unrested)],
    ['a count of them in words', JSON.stringify({ ...COST, rested: 'some' })],
    ['a count of them below zero', JSON.stringify({ ...COST, rested: -1 })],
    ['what it saw, not a count', JSON.stringify({ ...COST, queued: 'two' })],
    ['a reason it could not read a harness that is not words', JSON.stringify({ ...COST, unobserved: [1] })],
    ['those reasons not a list', JSON.stringify({ ...COST, unobserved: 'harness `claude`: down' })],
  ];
  for (const [name, written] of refused) await t.test(`a cost: ${name}`, () => assert.equal(parsePassCost(written), undefined));

  await t.test('a cost reads back as written, with a key a newer meter writes, what it could not read, or none of what it saw', () => {
    assert.deepEqual(parsePassCost(text), COST);
    assert.deepEqual(parsePassCost(JSON.stringify({ ...COST, later: 1 })), { ...COST, later: 1 }, 'the file is read whole');
    assert.deepEqual(parsePassCost(JSON.stringify({ ...COST, unobserved })), { ...COST, unobserved });
    const { runs: _runs, tasks: _tasks, queued: _queued, admitted: _admitted, ...older } = COST;
    assert.deepEqual(parsePassCost(JSON.stringify(older)), older, 'a file an older tick wrote');
  });

  await t.test(
    'the recent passes keep the last `keep`, the oldest left out first, and one that does not read left out, the file named once',
    async (t) => {
      const errors: string[] = [];
      t.mock.method(process.stderr, 'write', (line: string) => errors.push(line) > 0);
      fs.rmSync(recentFile(), { force: true });
      try {
        assert.deepEqual(recentPasses(), [], 'none before any pass kept one');
        for (const ms of [1, 2, 3, 4, 5]) recordRecentPass({ ...COST, ms }, 3);
        assert.deepEqual(
          recentPasses().map((r) => r.ms),
          [3, 4, 5],
        );
        assert.equal(recentPasses()[0].runs, 40);
        const kept = JSON.parse(fs.readFileSync(recentFile(), 'utf8')) as unknown[];
        fs.writeFileSync(recentFile(), JSON.stringify([kept[0], { ...(kept[1] as object), ms: 'slow' }, kept[2], 7]));
        assert.deepEqual(
          recentPasses().map((r) => r.ms),
          [3, 5],
        );
        assert.equal(errors.length, 1, errors.join(''));
        assert.ok(errors[0].startsWith(`${recentFile()}: 2 of its passes`), errors[0]);
        recordRecentPass({ ...COST, ms: 6 }, 3);
        assert.deepEqual(
          recentPasses().map((r) => r.ms),
          [3, 5, 6],
          'the next pass writes the file without them',
        );
      } finally {
        fs.rmSync(recentFile(), { force: true });
      }
    },
  );

  await t.test(
    "a recent pass's disk reads with its kinds, and one kept before the kinds without them; REFUSED: a kind no part has",
    async () => {
      const disk = (kind?: string) => ({
        at: '2026-10-15T04:00:00.000Z',
        free: 70,
        size: 100,
        entries: [{ part: 'runs', ...(kind === undefined ? {} : { kind }), factory: 'nemia', bytes: 40, unread: 0 }],
      });
      const kept = (kind?: string) => {
        fs.rmSync(recentFile(), { force: true });
        recordRecentPass({ ...COST, ms: 1 }, 3);
        const [pass] = JSON.parse(fs.readFileSync(recentFile(), 'utf8')) as object[];
        return parseRecentPasses(JSON.stringify([{ ...pass, disk: disk(kind) }]));
      };
      try {
        assert.deepEqual(kept('pictures').passes[0].disk, disk('pictures'));
        assert.deepEqual(kept().passes[0].disk, disk(), 'a pass kept before the kinds');
        assert.deepEqual([kept('photos').passes.length, kept('photos').unread], [0, 1]);
      } finally {
        fs.rmSync(recentFile(), { force: true });
      }
    },
  );

  await t.test('the ceilings of the last pass read back as written, and REFUSED, read as none, when a count is not one', async () => {
    const file = path.join(ROOT, 'tick.json');
    try {
      fs.writeFileSync(file, JSON.stringify({ sessions: 4, runs: 2 }));
      assert.deepEqual(lastCeilings(), { sessions: 4, runs: 2 });
      for (const bad of [{ sessions: 4, runs: -1 }, { sessions: 4, runs: 1.5 }, { sessions: '4', runs: 2 }, { sessions: 4 }, [4, 2]]) {
        fs.writeFileSync(file, JSON.stringify(bad));
        assert.equal(lastCeilings(), undefined, JSON.stringify(bad));
      }
      fs.writeFileSync(file, '{"sessions": 4');
      assert.equal(lastCeilings(), undefined, 'half a file');
    } finally {
      fs.rmSync(file, { force: true });
    }
  });

  await t.test(
    'a recent pass keeps its quota and checks, a ring an older tick wrote without them reads, and REFUSED: a quota not a number',
    async () => {
      fs.rmSync(recentFile(), { force: true });
      try {
        const check = { factory: 'nemia', workflow: 'build', step: 'implement', agent: 'ada' };
        const { kept } = recordRecentPass(COST, 3, { quota: { h: { w: 12.5 } }, checks: [check] });
        assert.deepEqual([kept.at(-1)?.quota, kept.at(-1)?.checks], [{ h: { w: 12.5 } }, [check]]);
        assert.deepEqual(recentPasses(), kept, 'read back as kept');
        const { waitMs: _w, load: _l, quota: _q, checks: _c, ...older } = kept[0];
        fs.writeFileSync(recentFile(), JSON.stringify([older, { ...kept[0], quota: { h: { w: 'most' } } }]));
        assert.deepEqual(recentPasses(), [older], 'the older reads; the quota that is no number is left out');
      } finally {
        fs.rmSync(recentFile(), { force: true });
      }
    },
  );
});

test('the daemon names on the lease what its hold serves, and names none when it holds nothing', async () => {
  clear();
  const { up } = await import('./up.verb.ts');
  const { Effect } = await import('effect');
  const ran = async (held: unknown) => {
    const seen: ReturnType<typeof read>[] = [];
    const e = promised({
      hold: () => held,
      tick: async () => {
        seen.push(read());
        throw STOP;
      },
      admit: async () => [],
    });
    const threw = await runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api' }))).then(
      () => assert.fail('the daemon returned'),
      (err: unknown) => err,
    );
    assert.equal(threw, STOP);
    return seen;
  };
  assert.deepEqual(
    (await ran({ url: 'http://127.0.0.1:45671', token: 'tok-1', cards: CARDS })).map((f) => f.serves),
    [CARDS],
    'a daemon that holds something names it on the lease, before its first pass',
  );
  assert.equal(
    JSON.stringify(read()).includes('tok-1'),
    false,
    'and never the token the hold answered beside the cards: the lease carries nothing secret',
  );
  assert.deepEqual(
    (await ran(null)).map((f) => f.serves),
    [undefined],
    'a daemon whose hold answers nothing serves nothing on the lease',
  );
  assert.equal('serves' in read(), false, 'and the lease a new daemon takes carries nothing the last served, however the last one ended');
  clear();
});

test('`up` writes the feed a daemon started line once it holds the store, before it serves: the first, then one saying when the last stopped', async () => {
  clear();
  fs.rmSync(path.join(ROOT, 'feed.jsonl'), { force: true });
  const { up } = await import('./up.verb.ts');
  const { Effect } = await import('effect');
  const daemonLines = () => readFeed(0).lines.filter((l) => 'daemon' in l);
  const started: Array<ReturnType<typeof daemonLines>[number] | undefined> = [];
  const serving = Effect.sync(() => started.push(daemonLines().at(-1)));
  const once = () =>
    runPlaced(Effect.scoped(up(engineOf(), { every: 10, repo: ROOT, holder: 'api', onTaken: () => serving }))).then(
      () => assert.fail('the daemon returned'),
      (err: unknown) => assert.equal(err, STOP),
    );
  await once();
  const stoppedAt = read().stoppedAt;
  await once();
  assert.deepEqual(
    started.map((l) => [l && 'daemon' in l ? l.daemon : undefined, l?.word, l?.note]),
    [
      [process.pid, 'daemon started', 'first daemon on this store'],
      [process.pid, 'daemon started', `last stopped at ${stoppedAt}`],
    ],
    'each line written before onTaken, as the daemon serves',
  );
  assert.equal(daemonLines().length, 2);
  clear();
});

test("`up` births the daemon's series and the caller's at zero and exports them before it serves; a pass then puts its values in", async (t) => {
  clear();
  const { up, DAEMON_SERIES } = await import('./up.verb.ts');
  const { telemetryLayer } = await import('../telemetry/telemetry.store.ts');
  const { Effect, Metric } = await import('effect');
  const c = await collector(t);
  const theirs = Metric.counter('test.caller.series', { incremental: true });
  const metricsPosts = () => c.posts.filter((p) => p.path === '/v1/metrics').map((p) => seriesOf(p.body, () => true, true));
  let serving: Record<string, number>[] = [];
  const e = engineOf((n) => {
    if (n === 2) throw STOP;
  });
  await runPlaced(
    Effect.scoped(
      up(e, {
        every: 10,
        repo: ROOT,
        holder: 'api',
        series: [theirs],
        onTaken: () => Effect.sync(() => (serving = metricsPosts())),
      }),
    ).pipe(Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url })), Effect.provideService(Metric.MetricRegistry, new Map())),
  ).then(
    () => assert.fail('the daemon returned'),
    (err: unknown) => assert.equal(err, STOP),
  );
  const born = {
    'pass.duration': 0,
    ...Object.fromEntries(PHASES.map((phase) => [`pass.phase.duration{phase=${phase}}`, 0])),
    'pass.journal_reads': 0,
    'feed.follow.beats': 0,
    'feed.follow.reads': 0,
    'feed.follow.lines': 0,
    'test.caller.series': 0,
  };
  assert.equal(DAEMON_SERIES.length + 1, Object.keys(born).length, 'each series the daemon births is one the test reads');
  assert.deepEqual(serving, [born], 'one post before it serves, every series in it at zero');
  const last = metricsPosts().at(-1)!;
  assert.ok(last['pass.duration'] >= 1, `a pass put its time in after: ${JSON.stringify(last)}`);
  clear();
});

test("REFUSED: a daemon refused the lease births no series, so the live daemon's are never read as reset", async (t) => {
  seeded(t);
  const { up } = await import('./up.verb.ts');
  const { telemetryLayer } = await import('../telemetry/telemetry.store.ts');
  const { Effect, Metric } = await import('effect');
  const c = await collector(t);
  holdBy(LIVE);
  const e = engineOf();
  const refused = await runPlaced(
    Effect.scoped(
      up(e, { every: 10, repo: ROOT, holder: 'api', series: [Metric.counter('test.refused.series', { incremental: true })] }),
    ).pipe(
      Effect.flip,
      Effect.provide(telemetryLayer({ OTEL_EXPORTER_OTLP_ENDPOINT: c.url })),
      Effect.provideService(Metric.MetricRegistry, new Map()),
    ),
  );
  assert.match((refused as Error).message, /^api: .* is held by the nemia up of pid /);
  assert.equal(e.passes, 0, 'none ticked');
  const named = c.posts.filter((p) => p.path === '/v1/metrics').map((p) => Object.keys(seriesOf(p.body, () => true, true)));
  assert.deepEqual(
    named.flat().filter((name) => name.startsWith('pass.') || name.startsWith('feed.follow.') || name === 'test.refused.series'),
    [],
    'no series of the live daemon posted at zero',
  );
  clear();
});

test("the daemon asks each harness's quota and hands its reading to the passes; a harness that fails, dies or answers no windows keeps its last", async () => {
  clear();
  const { up, askedQuota } = await import('./up.verb.ts');
  const { Effect } = await import('effect');
  const answers: Record<string, import('effect').Effect.Effect<unknown, unknown>> = {
    a: Effect.succeed({ kind: 'windows', limits: [{ key: 'five', usedPercentage: 30, resetsAt: null }], subscription: null }),
    b: Effect.fail(new Error('no answer')),
    c: Effect.succeed({ kind: 'no-plan' }),
    d: Effect.die(new Error('the harness broke')),
  };
  const asking = { quota: (name: string) => answers[name] } as unknown as Engine;
  const last = { b: { week: 5 }, c: { week: 6 }, d: { week: 7 } };
  assert.deepEqual(await Effect.runPromise(askedQuota(asking, last, ['a', 'b', 'c', 'd'])), {
    a: { five: 30 },
    b: { week: 5 },
    c: { week: 6 },
    d: { week: 7 },
  });
  assert.deepEqual(last, { b: { week: 5 }, c: { week: 6 }, d: { week: 7 } }, 'the last reading is not changed in place');

  fs.rmSync(recentFile(), { force: true });
  const e = engineOf((n) => {
    if (recentPasses().at(-1)?.quota || n > 500) throw STOP;
  });
  Object.assign(e, {
    quota: () => Effect.succeed({ kind: 'windows', limits: [{ key: 'w', usedPercentage: 12, resetsAt: null }], subscription: null }),
  });
  await assert.rejects(runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api' }))), (err) => err === STOP);
  const quota = recentPasses().at(-1)?.quota ?? {};
  assert.ok(Object.keys(quota).length > 0, 'a pass kept the reading');
  for (const windows of Object.values(quota)) assert.deepEqual(windows, { w: 12 });
  clear();
});

test("a good reading sets the quota's gauges by harness and window, through the ask handed down and never the engine's", async () => {
  const { askedQuota } = await import('./up.verb.ts');
  const { Effect, Metric } = await import('effect');
  const resetsAt = '2026-10-27T09:00:00.000Z';
  const answers: Record<string, unknown> = {
    claude: {
      kind: 'windows',
      limits: [
        { key: 'seven_day', usedPercentage: 42, resetsAt },
        { key: 'five_hour', usedPercentage: 7, resetsAt: null },
      ],
      subscription: null,
    },
    codex: { kind: 'unanswered', subscription: null },
  };
  const refusing = {
    quota: () => {
      throw new Error("the engine's own ask is not the one handed down");
    },
  } as unknown as Engine;
  const registry = new Map();
  const reading = await Effect.runPromise(
    askedQuota(refusing, { codex: { week: 3 } }, ['claude', 'codex'], (name) => Effect.succeed(answers[name] as never)).pipe(
      Effect.provideService(Metric.MetricRegistry, registry),
    ),
  );
  assert.deepEqual(reading, { claude: { seven_day: 42, five_hour: 7 }, codex: { week: 3 } });
  const snapshot = await Effect.runPromise(Metric.snapshot.pipe(Effect.provideService(Metric.MetricRegistry, registry)));
  const gauges = snapshot
    .filter((m) => m.id.startsWith('quota.'))
    .map((m) => [m.id, m.attributes, (m.state as { value: number }).value])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  assert.deepEqual(gauges, [
    ['quota.resets_at', { harness: 'claude', window: 'seven_day' }, Date.parse(resetsAt) / 1000],
    ['quota.used', { harness: 'claude', window: 'five_hour' }, 7],
    ['quota.used', { harness: 'claude', window: 'seven_day' }, 42],
  ]);
});

test('the daemon delivers the subscriptions: a wake line written to the feed is said to the subscribed task through the engine', async () => {
  clear();
  const { up } = await import('./up.verb.ts');
  const { Effect } = await import('effect');
  const { dropSubscription, putSubscription } = await import('../subscription/subscription.store.ts');
  const { feedFile, feedSize } = await import('../feed/feed.store.ts');
  putSubscription('daemon', { task: 'nemia', selectors: ['reason=AwaitingApproval'], digestEvery: 60, from: feedSize() });
  fs.appendFileSync(feedFile(), `${JSON.stringify({ at: at(0), run: 'r-1', step: 'plan', word: 'awaiting approval' })}\n`);
  const told: string[] = [];
  const e = engineOf((n) => {
    if (told.length || n > 2000) throw STOP;
  });
  Object.assign(e, { say: (task: string, text: string) => Effect.sync(() => told.push(`${task}: ${text}`)) });
  await assert.rejects(runPlaced(Effect.scoped(up(e, { every: 10, repo: ROOT, holder: 'api' }))), (err) => err === STOP);
  assert.equal(told.length, 1, told.join('\n'));
  assert.match(
    told[0],
    /^nemia: The feed needs your judgement:\n {2}\S+ {2}r-1 {2}plan {2}awaiting approval(\n\nSince your last news:\n(1 routine line|2 routine lines) of the feed:(\n {2}\S+ {2}pid \d+ {2}daemon started {2}· first daemon on this store)?(\n {2}\S+ {2}r-1 {2}— {2}removed)?)?$/,
    "the wake alone, or with the routine lines the same read found riding it: the daemon's started line, and the tick's own line of r-1, which no run of the store names",
  );
  dropSubscription('daemon');
  clear();
});
