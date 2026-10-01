/**
 * One `wf up` per store, on disk: `$WF_ROOT/daemon.json` written by the daemon as it takes the store, after each pass and as it stops; a
 * second `wf up`, and a `wf tick` by hand, refused while it names a live process whose last pass is recent; and a holder stale, gone or
 * stopped taken over. The judgement itself is pure, and lives in daemon.test.ts.
 *
 * A store of its own, since the verbs read every run under `WF_ROOT`. The engine is a fake whose tick is all a pass over an empty store
 * asks of it, so a test counts the passes and reads the file between them. A holder that is alive is a real process of the test's — a
 * sleeper — written with its own start from `/proc`, as `wf up` writes its own; one that is gone is a child that has exited; and a pid
 * reused after a crash is the sleeper under a start that is not its own. `WF_ROOT` is read as the module loads, so it is set before the
 * import; `WF_VERIFY_REST=1` judges in full every run a pass answers from its memo of runs at rest, and a difference throws (`verifyRest`
 * in tick.verb.ts).
 */
import { after, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { Engine, RefusedMove, TickReport } from 'agent-runtime';
import { nodeChild } from '../../test/child.ts';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-daemon-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
const { beat, daemonFile, daemonStanding, lastCeilings, procStartOf } = await import('../runner.ts');
const { parsePassCost } = await import('./daemon.store.ts');
const { PHASES, passCost } = await import('../meter/meter.ts');
const { main } = await import('../cli/main.ts');

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

/** A holder's file, written as `wf up` writes one — its process's start with its pid — over what is there. */
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

/** The milliseconds a duration printed of a fixture may say, in its words: from its age when written up to that age and the time since. */
type Ages = { from: number; to: number };

/**
 * The window of a fixture stamped `age` ms before the clock read when it was written, at or after `written`, and measured by a clock read
 * at or before `after`: a floor, and the time the pass took — never a bound fixed in advance.
 */
const windowOf = (age: number, written: number, after: number): Ages => ({ from: age, to: age + (after - written) });

/** Whether `word`, a duration as `durationWord` prints it, lies in `window`; a word that does not read is not. */
const within = (word: string, { from, to }: Ages): boolean => {
  const ms = msOfWord(word);
  return from <= ms && ms <= to;
};

/** The silence over which a holder at every 4000ms is stale, as `wf up` prints it. */
const STALE = '15m00s';

/**
 * Whether `line` is `wf up`'s takeover of a stale holder `pid` at every 4000ms: that pid, a silence over the bound it names, and one the
 * fixture's `window` allows.
 */
const saysStale = (line: string, pid: number, window: Ages): boolean => {
  const silence = new RegExp(
    `^ {3}took ${ROOT} over from pid ${pid}, alive but silent for (\\S+), over the ${STALE} that is stale at every 4000ms — `,
  ).exec(line)?.[1];
  return silence !== undefined && msOfWord(silence) > msOfWord(STALE) && within(silence, window);
};

const read = () =>
  JSON.parse(fs.readFileSync(FILE, 'utf8')) as {
    pid: number;
    startedAt: string;
    cwd: string;
    every: number;
    passedAt: string | null;
    beatAt?: string;
    procStart?: number;
    stoppedAt?: string;
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
  ...said,
});

const engineOf = (
  each: (pass: number) => void = () => {
    throw STOP;
  },
) => {
  const e = {
    passes: 0,
    tick: async (): Promise<TickReport> => {
      e.passes++;
      each(e.passes);
      return pass();
    },
    admit: async () => [],
  };
  return e as typeof e & Engine;
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

test('a pass that runs long is heard from: the beat is written while the pass awaits, and the store reads as ticking throughout', async (t) => {
  assert.equal(daemonFile(), FILE);
  clear();
  const beats: string[] = [];
  const kinds = new Set<string>();
  const e = engineOf(() => {
    throw STOP;
  });
  e.tick = async () => {
    e.passes++;
    const until = Date.now() + 10_000;
    while (beats.length < 2) {
      assert.ok(
        Date.now() < until,
        "two beats within 10s of one pass that awaits them, as an npm ci does: counted, not timed; without the beat's timer none comes",
      );
      const f = read();
      assert.equal(f.passedAt, null, 'no pass completed: the beat is not a pass');
      if (f.beatAt && f.beatAt !== beats.at(-1)) beats.push(f.beatAt);
      kinds.add(daemonStanding().kind);
      await new Promise((r) => setTimeout(r, 5));
    }
    throw STOP;
  };
  const { threw } = await typed(t, ['up', '10'], e);
  assert.equal(threw, STOP);
  assert.equal(e.passes, 1);
  assert.ok(Date.parse(beats[1]) > Date.parse(beats[0]), beats.join(' '));
  assert.deepEqual([...kinds], ['ticking']);
  assert.ok(read().stoppedAt, 'let go as it stopped');
});

test("the beat writes only its own daemon's file: not over another holder, not after a stop, not a file it did not take", () => {
  clear();
  const self = { pid: process.pid, startedAt: minutesAgo(1), cwd: '/here', every: 4000, passedAt: minutesAgo(0.5) };
  fs.writeFileSync(FILE, JSON.stringify(self));
  beat(self, '2026-09-22T12:00:00.000Z');
  assert.deepEqual(read(), { ...self, beatAt: '2026-09-22T12:00:00.000Z' }, 'its own file beats, its last pass kept');
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
});

test('REFUSED at shipped defaults: `wf up` with an interval daemon.json cannot hold — before the store is taken, and no pass run', async () => {
  for (const arg of ['-5', '1e400', '0', 'soon']) {
    clear();
    const e = engineOf();
    await assert.rejects(
      main(['up', arg], e),
      refusedWith(
        new RegExp(`^wf up takes its pass interval in whole milliseconds, from 1 to 2147483647, and ${JSON.stringify(arg)} is not one: `),
      ),
      arg,
    );
    assert.equal(e.passes, 0, arg);
    assert.equal(fs.existsSync(FILE), false, `${arg}: the store not taken`);
  }
  const text = holdBy(LIVE);
  await assert.rejects(main(['up', '-5'], engineOf()), refusedWith(/^wf up takes its pass interval/));
  assert.equal(
    fs.readFileSync(FILE, 'utf8'),
    text,
    "a store held by a live daemon is not freed by a bad interval: the refusal is the interval's, the file untouched",
  );
  clear();
});

test('`wf up` takes the store: its pid, where and how often it ticks, then each pass completed — and lets it go as it stops', async (t) => {
  clear();
  const seen: ReturnType<typeof read>[] = [];
  const e = engineOf((pass) => {
    seen.push(read());
    if (pass === 3) throw STOP;
  });
  const before = Date.now();
  const { printed, threw } = await typed(t, ['up', '10'], e);
  assert.equal(threw, STOP);
  assert.equal(e.passes, 3);
  assert.deepEqual(
    seen.map((f) => [f.pid, f.cwd, f.every, f.procStart]),
    Array.from({ length: 3 }, () => [process.pid, process.cwd(), 10, procStartOf(process.pid)]),
  );
  assert.equal(typeof seen[0].procStart, 'number', 'its process named by its start, with /proc on this host');
  assert.equal(seen[0].passedAt, null, 'no pass completed before the first');
  assert.ok(Date.parse(seen[0].startedAt) >= before - 1);
  assert.ok(Date.parse(seen[1].passedAt!) >= Date.parse(seen[0].startedAt), 'the first pass written down before the second');
  assert.ok(Date.parse(seen[2].passedAt!) >= Date.parse(seen[1].passedAt!));
  const stopped = read();
  assert.equal(stopped.passedAt, seen[2].passedAt, 'the pass that threw completed nothing');
  assert.ok(stopped.stoppedAt && Date.parse(stopped.stoppedAt) >= Date.parse(stopped.passedAt!), 'let go as it stopped');
  assert.ok(
    printed.includes(
      `   holds ${ROOT} as pid ${process.pid} — a second wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`,
    ),
    printed.join('\n'),
  );
  assert.ok(!printed.some((l) => l.includes('took ')), 'an empty store is taken over from nobody');
  assert.deepEqual(
    fs.readdirSync(ROOT).filter((f) => f.startsWith('.daemon')),
    [],
    'no hidden file left behind',
  );
});

test('REFUSED at shipped defaults: a second `wf up`, and a `wf tick` by hand, while a live daemon has passed recently — the store untouched', async (t) => {
  for (const over of [{}, { passedAt: null, startedAt: minutesAgo(0.1) }, { passedAt: minutesAgo(14) }]) {
    const text = holdBy(LIVE, over);
    const e = engineOf();
    await assert.rejects(
      main(['up'], e),
      refusedWith(
        new RegExp(`^wf up: ${ROOT} is held by the wf up of pid ${LIVE}, started \\S+ in /elsewhere, every 4000ms — `),
        new RegExp(`stop it with kill ${LIVE} — that pid is the node process that ticks, not an npm exec wrapper`),
      ),
      JSON.stringify(over),
    );
    await assert.rejects(
      main(['tick'], e),
      refusedWith(
        new RegExp(`^wf tick: ${ROOT} is held by the wf up of pid ${LIVE}, `),
        new RegExp(`a pass by hand beside it would be a second writer\\. .*kill ${LIVE} `),
      ),
    );
    assert.equal(e.passes, 0, 'neither ticked');
    assert.equal(fs.readFileSync(FILE, 'utf8'), text, 'nor wrote the file');
  }
  const written = Date.now();
  holdBy(LIVE);
  const { printed } = await typed(t, ['ls'], engineOf());
  const ages = windowOf(3000, written, Date.now());
  assert.equal(printed[0], 'no runs');
  const ago = new RegExp(`^wf up: ticking, pid ${LIVE}, every 4000ms — last pass (\\S+) ago \\(`).exec(printed.at(-1)!)?.[1];
  assert.ok(ago !== undefined && within(ago, ages), `\`wf ls\` says who ticks, last, and its pass 3s ago:\n${printed.at(-1)}`);
});

test('a holder stale, gone or stopped is taken over by `wf up` — and not refused to a `wf tick`, which writes nothing', async (t) => {
  const matches = (pattern: RegExp) => (line: string) => pattern.test(line);
  const cases = [
    {
      name: 'stale',
      pid: LIVE,
      over: { passedAt: minutesAgo(16) },
      took: (line: string, ages: Ages) => saysStale(line, LIVE, ages),
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
  let stale: { line: string; ages: Ages } | undefined;
  for (const c of cases) {
    const written = Date.now();
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
    const before = Date.now();
    const { printed, threw } = await typed(t, ['up'], up);
    assert.equal(threw, STOP, c.name);
    assert.equal(during!.pid, process.pid, c.name);
    assert.ok(Date.parse(during!.startedAt) >= before - 1, `${c.name}: a start of its own`);
    assert.equal(during!.stoppedAt, undefined, c.name);
    const ages = windowOf(16 * 60_000, written, Date.now());
    const took = printed.filter((l) => l.includes(' took '));
    if (c.took) assert.ok(took.length === 1 && c.took(took[0], ages), `${c.name}:\n${printed.join('\n')}`);
    else assert.deepEqual(took, [], `${c.name}: a clean stop is nothing to report`);
    if (c.name === 'stale') stale = { line: took[0], ages };
  }
  const { line, ages } = stale!;
  const saying = (silence: string) => line.replace(/silent for \S+,/, `silent for ${silence},`);
  assert.ok(saysStale(line, LIVE, ages), `the stale line read as itself:\n${line}`);
  assert.ok(!saysStale(line.replace(`pid ${LIVE},`, `pid ${GONE},`), LIVE, ages), 'refused: a line that names another pid');
  assert.ok(!saysStale(saying('3s'), LIVE, { from: 0, to: Infinity }), 'refused: a live holder called stale, whatever the pass took');
  assert.ok(!saysStale(saying('15m30s'), LIVE, ages), 'refused: a silence shorter than the fixture is old');
  assert.ok(!saysStale(saying('2h00m'), LIVE, ages), 'refused: a silence longer than the fixture is old and the pass took');
});

test('a daemon whose store is taken over while it runs stops at its next pass, and writes nothing over the new holder', async (t) => {
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
      `^wf up: ${ROOT} was taken over by the wf up of pid ${LIVE}, started \\S+ in /elsewhere — this one stops rather than be a second writer\\.$`,
    ),
  );
  assert.equal(e.passes, 1, 'no second pass');
  assert.equal(fs.readFileSync(FILE, 'utf8'), theirs, 'neither its heartbeat nor its stop written over the holder');
});

test('`wf tick` on a store nobody holds never writes the file, and `wf ls` says which daemon ticks, last on every path', async (t) => {
  clear();
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
  assert.equal(await lastLine(), 'wf up: none has held this store — nothing ticks it; start one with wf up');
  const written = Date.now();
  holdBy(LIVE, { passedAt: minutesAgo(20) });
  const stalled = (await lastLine())!;
  const ages = windowOf(20 * 60_000, written, Date.now());
  const [, silence, ago] =
    new RegExp(`^wf up: stalled, pid ${LIVE}, every 4000ms — alive, but silent for (\\S+): last pass (\\S+) ago \\(`).exec(stalled) ?? [];
  assert.ok(silence !== undefined && within(silence, ages) && within(ago, ages), `silent, and last passed, 20m ago:\n${stalled}`);
  holdBy(GONE);
  assert.match((await lastLine())!, new RegExp(`^wf up: none ticking — pid ${GONE} is gone, its last pass `));
  clear();
});

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
  ['SIGHUP', 129],
] as const)
  test(`\`wf up\` stopped by ${signal} lets the store go on the way out, with the signal's exit code, ${code}`, async () => {
    clear();
    const cli = new URL('../cli/main.ts', import.meta.url).href;
    const w = nodeChild(
      `const { main } = await import(${JSON.stringify(cli)}); await main(['up', '20'], { tick: async () => ({ tasks: 0, actions: [], running: {}, views: [] }), admit: async () => [] });`,
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

test("REFUSED NOT: a pid alive but another process's — reused after a kill -9 — holds nothing, and is never named as one to kill", async (t) => {
  assert.equal(typeof procStartOf(LIVE), 'number', 'this test needs /proc');
  const text = holdBy(LIVE, { procStart: procStartOf(LIVE)! + 1 });
  const kill = new RegExp(`kill ${LIVE}\\b`);
  const ls = await typed(t, ['ls'], engineOf());
  assert.equal(
    ls.printed.at(-1),
    `wf up: none ticking — the wf up of pid ${LIVE} is gone, that pid another process's now; its ${ls.printed.at(-1)!.split('; its ')[1]}`,
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
  assert.equal(up.threw, STOP, 'wf up took the store and ran');
  assert.equal(during!.pid, process.pid);
  assert.ok(
    up.printed.some(
      (l) =>
        l ===
        `   took ${ROOT} over from pid ${LIVE}, whose process is gone — that pid is another process's now, started after the wf up that wrote daemon.json — ${l.split(' — ').at(-1)}`,
    ),
    up.printed.join('\n'),
  );
  for (const line of [...ls.printed, ...byHand.printed, ...up.printed]) assert.doesNotMatch(line, kill, line);
  clear();
});

test('REFUSED at shipped defaults, unconfirmed: a live pid whose start cannot be compared holds the store — and its pid is not handed over bare', async () => {
  const text = holdBy(LIVE, { procStart: undefined });
  const e = engineOf();
  const unconfirmed = new RegExp(
    `its pid, once checked: ${LIVE} could not be confirmed here as the process that wrote daemon\\.json \\(the file names no process start\\), .* if ps -p ${LIVE} -o lstart=,args= shows a wf up started at \\S+, kill ${LIVE}`,
  );
  await assert.rejects(
    main(['up'], e),
    refusedWith(new RegExp(`^wf up: ${ROOT} is held by the wf up of pid ${LIVE}, `), unconfirmed),
    'a file with no process start, as one written where there is no /proc reads everywhere: the pid is alive, so it holds',
  );
  await assert.rejects(main(['tick'], e), refusedWith(new RegExp(`^wf tick: ${ROOT} is held by the wf up of pid ${LIVE}, `), unconfirmed));
  await assert.rejects(main(['up'], e), (err: Error) => !new RegExp(`kill ${LIVE} —`).test(err.message));
  assert.equal(e.passes, 0);
  assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  clear();
});

test('`wf up` says what its passes cost once a minute, not once a pass: nine passes twenty seconds apart are two lines, the third minute not yet over', async (t) => {
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

test("`wf up --stats` reads the last pass's cost beside a daemon that holds the store, and ticks nothing", async (t) => {
  clear();
  fs.rmSync(path.join(ROOT, 'tick-stats.json'), { force: true });
  const none = await typed(t, ['up', '--stats'], engineOf());
  assert.equal(none.threw, undefined);
  assert.deepEqual(none.printed, [
    `no pass has written what it cost to ${path.join(ROOT, 'tick-stats.json')} yet — no wf up holds this store: run wf tick --stats, or start wf up`,
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
  assert.equal(held.printed.at(-1), 'written by the wf up that holds this store, after its last pass');
  clear();
  assert.match(
    (await typed(t, ['up', '--stats'], engineOf())).printed.at(-1)!,
    /^no wf up holds this store now, so this was the last pass anyone ran: wf tick --stats runs one/,
  );
});

test('REFUSED at shipped defaults: `wf tick --stats` while a daemon holds the store, pointed at `wf up --stats`; and words either verb does not take', async () => {
  holdBy(LIVE);
  const e = engineOf();
  await assert.rejects(
    main(['tick', '--stats'], e),
    refusedWith(
      new RegExp(`^wf tick: ${ROOT} is held by the wf up of pid ${LIVE}, `),
      / What its last pass cost is read without a pass: wf up --stats\.$/,
    ),
  );
  await assert.rejects(
    main(['tick'], e),
    (err: Error & { exitCode?: number }) => err.exitCode === 2 && !err.message.includes('--stats'),
    'said only to one who asked',
  );
  clear();
  await assert.rejects(main(['tick', '--bogus'], e), refusedWith(/wf tick takes no --bogus: /));
  await assert.rejects(
    main(['up', '--stats', '20'], e),
    refusedWith(/wf up --stats reads what the last pass cost and ticks nothing, so it takes no 20: /),
  );
  assert.equal(e.passes, 0, 'nothing ticked');
  assert.equal(fs.existsSync(FILE), false);
});

test('`wf up` says a move the runtime refused once while it lasts, and again once it clears and comes back — in its log, beside its other lines', async (t) => {
  clear();
  const stuck: RefusedMove = { taskId: 't-stuck', state: 'working', event: 'SESSION_LIVE' };
  const other: RefusedMove = { taskId: 't-other', state: 'ending', event: 'CLOSED' };
  const byPass = [[stuck], [stuck], [stuck, other], [stuck, other], [], [stuck], [stuck]];
  const e = engineOf();
  e.tick = async () => {
    e.passes++;
    if (e.passes > byPass.length) throw STOP;
    return pass({ tasks: 2, refused: byPass[e.passes - 1] });
  };
  const { printed, threw } = await typed(t, ['up', '1'], e);
  assert.equal(threw, STOP);
  assert.equal(e.passes, byPass.length + 1, 'every pass ran');
  const said = printed.filter((l) => l.includes('stalled'));
  const words = (m: typeof stuck) =>
    `${m.taskId}  stalled: its lifecycle has no edge from ${m.state} on ${m.event}, so nothing is done; it is asked again each pass`;
  assert.deepEqual(
    said.map((l) => l.slice(10)),
    [words(stuck), words(other), words(stuck)],
    `each pass's report says what was refused, pass 5 has cleared it, and pass 6 has it back:\n${printed.join('\n')}`,
  );
  assert.ok(
    said.every((l) => /^\d\d:\d\d:\d\d  t-/.test(l)),
    'stamped as the daemon stamps every line',
  );
});

test('`wf tick` says every move its one pass refused', async (t) => {
  clear();
  const stuck: RefusedMove = { taskId: 't-stuck', state: 'submitted', event: 'READY' };
  const e = engineOf();
  e.tick = async () => pass({ tasks: 1, refused: [stuck, stuck] });
  const { printed, threw } = await typed(t, ['tick'], e);
  assert.equal(threw, undefined);
  assert.deepEqual(
    printed.filter((l) => l.includes('stalled')),
    ['t-stuck  stalled: its lifecycle has no edge from submitted on READY, so nothing is done; it is asked again each pass'],
  );
});

test('`wf up` says a task the runtime left out once while it lasts, and again once it clears and comes back; `wf tick` says each its pass left out', async (t) => {
  clear();
  const bad = "t-bad's journal (/store/tasks/t-bad.jsonl), entry 2 is a `measured` event, and its `usage.turns` is not a number";
  const feed = 'the feed (/store/feed.jsonl), entry 3 read from cursor 148 is no event this runtime writes';
  const byPass = [[bad], [bad, feed], [bad], [], [bad]];
  const e = engineOf();
  e.tick = async () => {
    e.passes++;
    if (e.passes > byPass.length) throw STOP;
    return pass({ tasks: 2, unreadable: byPass[e.passes - 1] });
  };
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
  e.tick = async () => pass({ tasks: 2, unreadable: [bad, feed] });
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
});

test('a cost reads back as written, and REFUSED: half a file, another shape, a phase missing, a count that is not one', () => {
  assert.deepEqual(parsePassCost(JSON.stringify(COST)), COST);
  const text = JSON.stringify(COST);
  assert.equal(parsePassCost(text.slice(0, text.length / 2)), undefined, 'half of one');
  assert.equal(parsePassCost('[]'), undefined);
  assert.equal(parsePassCost(JSON.stringify({ sessions: 2, runs: 0 })), undefined, 'tick.json is not one');
  const { git: _, ...noGit } = COST.phases;
  assert.equal(parsePassCost(JSON.stringify({ ...COST, phases: noGit })), undefined, 'a phase missing');
  assert.equal(parsePassCost(JSON.stringify({ ...COST, ms: -1 })), undefined);
  assert.equal(
    parsePassCost(JSON.stringify({ ...COST, phases: { ...COST.phases, act: { ...COST.phases.act, bytes: 'many' } } })),
    undefined,
  );
  assert.equal(parsePassCost(JSON.stringify({ ...COST, harnesses: [] })), undefined);
  assert.equal(
    parsePassCost(JSON.stringify({ ...COST, harnesses: { claude: { calls: 1, ms: 1, listed: 'all', spawned: 0 } } })),
    undefined,
  );
  assert.deepEqual(
    parsePassCost(JSON.stringify({ ...COST, later: 1 })),
    { ...COST, later: 1 },
    'a key a newer meter writes is kept, as the file is read whole',
  );
  const { rested: _rested, ...unrested } = COST;
  assert.equal(parsePassCost(JSON.stringify(unrested)), undefined, 'REFUSED: no count of the runs answered from memory');
  assert.equal(parsePassCost(JSON.stringify({ ...COST, rested: 'some' })), undefined, 'and a count of them that is not one');
  assert.equal(parsePassCost(JSON.stringify({ ...COST, rested: -1 })), undefined);
});

test('the ceilings of the last pass read back as written, and REFUSED — read as none — when a count is not one', () => {
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
