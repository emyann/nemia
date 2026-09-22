/**
 * One `wf up` per store, on disk: `$WF_ROOT/daemon.json` written by the daemon as it takes the store, after each pass and as it stops; a
 * second `wf up`, and a `wf tick` by hand, refused while it names a live process whose last pass is recent; and a holder stale, gone or
 * stopped taken over. The judgement itself is pure, and lives in daemon.test.ts.
 *
 * A store of its own, since the verbs read every run under `WF_ROOT`. The engine is a fake whose tick is all a pass over an empty store asks
 * of it, so a test counts the passes and reads the file between them. A holder that is alive is a real process of the test's — a sleeper —
 * written with its own start from `/proc`, as `wf up` writes its own; one that is gone is a child that has exited; and a pid reused after
 * a crash is the sleeper under a start that is not its own.
 */
import { after, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { Engine } from 'agent-engine';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-daemon-'));
// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
delete process.env.WF_MAX_RUNS;
const { beat, daemonFile, daemonStanding, procStartOf } = await import('../src/runner.ts');
const { main } = await import('../src/cli.ts');

const FILE = path.join(ROOT, 'daemon.json');

/** Refused by name: exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (...patterns: RegExp[]) => (err: Error & { exitCode?: number }) => err.exitCode === 2 && patterns.every((p) => p.test(err.message));

/** A live process that is not this one, to hold the store: killed when the file's tests are done. */
const sleeper = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' });
after(() => { sleeper.kill(); });
const LIVE = sleeper.pid!;

/** A pid whose process has exited: a crashed daemon's. */
const GONE = spawnSync(process.execPath, ['-e', '0']).pid!;

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

/** A holder's file, written as `wf up` writes one — its process's start with its pid — over what is there. */
const holdBy = (pid: number, over: Record<string, unknown> = {}): string => {
  const text = `${JSON.stringify({ pid, startedAt: minutesAgo(30), cwd: '/elsewhere', every: 4000, passedAt: minutesAgo(0.05), procStart: procStartOf(pid), ...over }, null, 2)}\n`;
  fs.writeFileSync(FILE, text);
  return text;
};

const read = () => JSON.parse(fs.readFileSync(FILE, 'utf8')) as { pid: number; startedAt: string; cwd: string; every: number; passedAt: string | null; beatAt?: string; procStart?: number; stoppedAt?: string };

const STOP = Object.assign(new Error('the test stops the daemon'), { exitCode: 9 });

/** An engine whose tick counts the passes and runs `each` on each, which may throw to stop the daemon. */
const engineOf = (each: (pass: number) => void = () => { throw STOP; }) => {
  const e = { passes: 0, tick: async () => { e.passes++; each(e.passes); } };
  return e as typeof e & Engine;
};

/** What a verb printed, line by line, and what it threw. */
const typed = async (t: TestContext, argv: string[], e: Engine) => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => { printed.push(args.map(String).join(' ')); });
  let threw: unknown;
  try { await main(argv, e); } catch (err) { threw = err; } finally { log.mock.restore(); }
  return { printed, threw };
};

const clear = () => fs.rmSync(FILE, { force: true });

test('a pass that runs long is heard from: the beat is written while the pass awaits, and the store reads as ticking throughout', async (t) => {
  assert.equal(daemonFile(), FILE);
  clear();
  // One pass that awaits — as an npm ci in each of several worktrees does — until it has seen two beats of its own daemon, under a bound of
  // seconds: counted, not timed. Without the beat's timer no beat comes and the bound fails it.
  const beats: string[] = [];
  const kinds = new Set<string>();
  const e = engineOf(() => { throw STOP; });
  e.tick = async () => {
    e.passes++;
    const until = Date.now() + 10_000;
    while (beats.length < 2) {
      assert.ok(Date.now() < until, 'two beats within 10s of a pass in flight');
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
  assert.ok(Date.parse(beats[1]!) > Date.parse(beats[0]!), beats.join(' '));
  assert.deepEqual([...kinds], ['ticking']);
  assert.ok(read().stoppedAt, 'let go as it stopped');
});

test('the beat writes only its own daemon\'s file: not over another holder, not after a stop, not a file it did not take', () => {
  clear();
  const self = { pid: process.pid, startedAt: minutesAgo(1), cwd: '/here', every: 4000, passedAt: minutesAgo(0.5) };
  fs.writeFileSync(FILE, JSON.stringify(self));
  beat(self, '2026-09-22T12:00:00.000Z');
  assert.deepEqual(read(), { ...self, beatAt: '2026-09-22T12:00:00.000Z' }, 'its own file beats, its last pass kept');
  for (const [name, over] of [['another holder', { pid: LIVE }], ['stopped', { stoppedAt: minutesAgo(0.1) }], ['an earlier start of this pid', { startedAt: minutesAgo(5) }]] as const) {
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
    await assert.rejects(main(['up', arg], e), refusedWith(new RegExp(`^wf up takes its pass interval in whole milliseconds, from 1 to 2147483647, and ${JSON.stringify(arg)} is not one: `)), arg);
    assert.equal(e.passes, 0, arg);
    assert.equal(fs.existsSync(FILE), false, `${arg}: the store not taken`);
  }
  // And a store held by a live daemon is not freed by one: the refusal is the interval's, the file untouched.
  const text = holdBy(LIVE);
  await assert.rejects(main(['up', '-5'], engineOf()), refusedWith(/^wf up takes its pass interval/));
  assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  clear();
});

test('`wf up` takes the store: its pid, where and how often it ticks, then each pass completed — and lets it go as it stops', async (t) => {
  clear();
  const seen: ReturnType<typeof read>[] = [];
  const e = engineOf((pass) => { seen.push(read()); if (pass === 3) throw STOP; });
  const before = Date.now();
  const { printed, threw } = await typed(t, ['up', '10'], e);
  assert.equal(threw, STOP);
  assert.equal(e.passes, 3);
  assert.deepEqual(seen.map((f) => [f.pid, f.cwd, f.every, f.procStart]), Array(3).fill([process.pid, process.cwd(), 10, procStartOf(process.pid)]));
  assert.equal(typeof seen[0]!.procStart, 'number', 'its process named by its start, with /proc on this host');
  assert.equal(seen[0]!.passedAt, null, 'no pass completed before the first');
  assert.ok(Date.parse(seen[0]!.startedAt) >= before - 1);
  assert.ok(Date.parse(seen[1]!.passedAt!) >= Date.parse(seen[0]!.startedAt), 'the first pass written down before the second');
  assert.ok(Date.parse(seen[2]!.passedAt!) >= Date.parse(seen[1]!.passedAt!));
  const stopped = read();
  assert.equal(stopped.passedAt, seen[2]!.passedAt, 'the pass that threw completed nothing');
  assert.ok(stopped.stoppedAt && Date.parse(stopped.stoppedAt) >= Date.parse(stopped.passedAt!), 'let go as it stopped');
  assert.ok(printed.includes(`   holds ${ROOT} as pid ${process.pid} — a second wf up, or a wf tick, on this store is refused while it ticks (daemon.json)`), printed.join('\n'));
  assert.ok(!printed.some((l) => l.includes('took ')), 'an empty store is taken over from nobody');
  assert.deepEqual(fs.readdirSync(ROOT).filter((f) => f.startsWith('.daemon')), [], 'no hidden file left behind');
});

test('REFUSED at shipped defaults: a second `wf up`, and a `wf tick` by hand, while a live daemon has passed recently — the store untouched', async (t) => {
  for (const over of [{}, { passedAt: null, startedAt: minutesAgo(0.1) }, { passedAt: minutesAgo(14) }]) {
    const text = holdBy(LIVE, over);
    const e = engineOf();
    await assert.rejects(main(['up'], e), refusedWith(
      new RegExp(`^wf up: ${ROOT} is held by the wf up of pid ${LIVE}, started \\S+ in /elsewhere, every 4000ms — `),
      new RegExp(`stop it with kill ${LIVE} — that pid is the node process that ticks, not an npm exec wrapper`),
    ), JSON.stringify(over));
    await assert.rejects(main(['tick'], e), refusedWith(
      new RegExp(`^wf tick: ${ROOT} is held by the wf up of pid ${LIVE}, `),
      new RegExp(`a pass by hand beside it would be a second writer\\. .*kill ${LIVE} `),
    ));
    assert.equal(e.passes, 0, 'neither ticked');
    assert.equal(fs.readFileSync(FILE, 'utf8'), text, 'nor wrote the file');
  }
  // `wf ls` says who ticks, last.
  holdBy(LIVE);
  const { printed } = await typed(t, ['ls'], engineOf());
  assert.equal(printed[0], 'no runs');
  assert.match(printed.at(-1)!, new RegExp(`^wf up: ticking, pid ${LIVE}, every 4000ms — last pass \\d+s ago \\(`));
});

test('a holder stale, gone or stopped is taken over by `wf up` — and not refused to a `wf tick`, which writes nothing', async (t) => {
  const cases = [
    { name: 'stale', pid: LIVE, over: { passedAt: minutesAgo(16) }, took: new RegExp(`^ {3}took ${ROOT} over from pid ${LIVE}, alive but silent for 16m0\\ds, over the 15m00s that is stale at every 4000ms`) },
    { name: 'gone', pid: GONE, over: {}, took: new RegExp(`^ {3}took ${ROOT} over from pid ${GONE}, whose process is gone`) },
    { name: 'stopped', pid: LIVE, over: { stoppedAt: minutesAgo(0.01) }, took: undefined },
    { name: 'unreadable', pid: LIVE, over: { pid: 'nobody' }, took: new RegExp(`^ {3}took ${ROOT} over from a daemon.json that did not read as a holder$`) },
  ];
  for (const c of cases) {
    const text = holdBy(c.pid, c.over);
    const tick = engineOf(() => {});
    const byHand = await typed(t, ['tick'], tick);
    assert.equal(byHand.threw, undefined, c.name);
    assert.equal(tick.passes, 1, c.name);
    assert.equal(fs.readFileSync(FILE, 'utf8'), text, `${c.name}: a hand tick never writes the file`);

    let during: ReturnType<typeof read> | undefined;
    const up = engineOf(() => { during = read(); throw STOP; });
    const before = Date.now();
    const { printed, threw } = await typed(t, ['up'], up);
    assert.equal(threw, STOP, c.name);
    assert.equal(during!.pid, process.pid, c.name);
    assert.ok(Date.parse(during!.startedAt) >= before - 1, `${c.name}: a start of its own`);
    assert.equal(during!.stoppedAt, undefined, c.name);
    const took = printed.filter((l) => l.includes(' took '));
    if (c.took) assert.ok(took.length === 1 && c.took.test(took[0]!), `${c.name}:\n${printed.join('\n')}`);
    else assert.deepEqual(took, [], `${c.name}: a clean stop is nothing to report`);
  }
});

test('a daemon whose store is taken over while it runs stops at its next pass, and writes nothing over the new holder', async (t) => {
  clear();
  let theirs = '';
  const e = engineOf((pass) => { if (pass === 1) theirs = holdBy(LIVE); if (pass > 1) throw STOP; });
  const { threw } = await typed(t, ['up', '10'], e);
  assert.ok(threw instanceof Error && threw !== STOP, String(threw));
  assert.match((threw as Error).message, new RegExp(`^wf up: ${ROOT} was taken over by the wf up of pid ${LIVE}, started \\S+ in /elsewhere — this one stops rather than be a second writer\\.$`));
  assert.equal(e.passes, 1, 'no second pass');
  assert.equal(fs.readFileSync(FILE, 'utf8'), theirs, 'neither its heartbeat nor its stop written over the holder');
});

test('`wf tick` on a store nobody holds never writes the file, and `wf ls` says which daemon ticks, last on every path', async (t) => {
  clear();
  assert.equal((await typed(t, ['tick'], engineOf(() => {}))).threw, undefined);
  assert.equal(fs.existsSync(FILE), false, 'the daemon is the file\'s one writer');
  const lastLine = async () => (await typed(t, ['ls'], engineOf())).printed.at(-1);
  assert.equal(await lastLine(), 'wf up: none has held this store — nothing ticks it; start one with wf up');
  holdBy(LIVE, { passedAt: minutesAgo(20) });
  assert.match((await lastLine())!, new RegExp(`^wf up: stalled, pid ${LIVE}, every 4000ms — alive, but silent for 20m0\\ds: last pass 20m0\\ds ago \\(`));
  holdBy(GONE);
  assert.match((await lastLine())!, new RegExp(`^wf up: none ticking — pid ${GONE} is gone, its last pass `));
  clear();
});

test('`wf up` stopped by a signal lets the store go on the way out, with the signal\'s exit code', async () => {
  clear();
  // A real process, since a signal stops it; its engine a fake, so no harness is asked anything.
  const cli = new URL('../src/cli.ts', import.meta.url).href;
  const child = spawn(process.execPath, ['--input-type=module', '-e', `const { main } = await import(${JSON.stringify(cli)}); await main(['up', '20'], { tick: async () => {} });`], {
    env: { ...process.env, WF_ROOT: ROOT }, stdio: 'ignore',
  });
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  try {
    // Wait for a pass it wrote down, under a bound.
    const until = Date.now() + 20_000;
    while (!(fs.existsSync(FILE) && read().pid === child.pid && read().passedAt)) {
      assert.ok(Date.now() < until, 'the daemon wrote a pass within 20s');
      await new Promise((r) => setTimeout(r, 25));
    }
    child.kill('SIGTERM');
    assert.equal(await exited, 143);
    const file = read();
    assert.equal(file.pid, child.pid);
    assert.ok(file.stoppedAt, 'stoppedAt written as it stopped');
  } finally {
    child.kill('SIGKILL');
    clear();
  }
});

test('REFUSED NOT: a pid alive but another process\'s — reused after a kill -9 — holds nothing, and is never named as one to kill', async (t) => {
  // The sleeper under a start that is not its own: a live pid, a fresh pass, and not the process that wrote the file.
  assert.equal(typeof procStartOf(LIVE), 'number', 'this test needs /proc');
  const text = holdBy(LIVE, { procStart: procStartOf(LIVE)! + 1 });
  const kill = new RegExp(`kill ${LIVE}\\b`);
  const ls = await typed(t, ['ls'], engineOf());
  assert.equal(ls.printed.at(-1), `wf up: none ticking — the wf up of pid ${LIVE} is gone, that pid another process's now; its ${ls.printed.at(-1)!.split('; its ')[1]}`);
  const tick = engineOf(() => {});
  const byHand = await typed(t, ['tick'], tick);
  assert.equal(byHand.threw, undefined, 'a hand tick is not refused');
  assert.equal(tick.passes, 1);
  assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  let during: ReturnType<typeof read> | undefined;
  const up = await typed(t, ['up'], engineOf(() => { during = read(); throw STOP; }));
  assert.equal(up.threw, STOP, 'wf up took the store and ran');
  assert.equal(during!.pid, process.pid);
  assert.ok(up.printed.some((l) => l === `   took ${ROOT} over from pid ${LIVE}, whose process is gone — that pid is another process's now, started after the wf up that wrote daemon.json — ${l.split(' — ').at(-1)}`), up.printed.join('\n'));
  for (const line of [...ls.printed, ...byHand.printed, ...up.printed]) assert.doesNotMatch(line, kill, line);
  clear();
});

test('REFUSED at shipped defaults, unconfirmed: a live pid whose start cannot be compared holds the store — and its pid is not handed over bare', async () => {
  // A file with no process start, as one written where there is no /proc reads everywhere: the pid is alive, so it holds.
  const text = holdBy(LIVE, { procStart: undefined });
  const e = engineOf();
  const unconfirmed = new RegExp(`its pid, once checked: ${LIVE} could not be confirmed here as the process that wrote daemon\\.json \\(the file names no process start\\), .* if ps -p ${LIVE} -o lstart=,args= shows a wf up started at \\S+, kill ${LIVE}`);
  await assert.rejects(main(['up'], e), refusedWith(new RegExp(`^wf up: ${ROOT} is held by the wf up of pid ${LIVE}, `), unconfirmed));
  await assert.rejects(main(['tick'], e), refusedWith(new RegExp(`^wf tick: ${ROOT} is held by the wf up of pid ${LIVE}, `), unconfirmed));
  await assert.rejects(main(['up'], e), (err: Error) => !new RegExp(`kill ${LIVE} —`).test(err.message));
  assert.equal(e.passes, 0);
  assert.equal(fs.readFileSync(FILE, 'utf8'), text);
  clear();
});
