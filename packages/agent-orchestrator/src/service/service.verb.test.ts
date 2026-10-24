/**
 * `nemia service install`, `uninstall` and `status` over a fake machine: a host whose system's programs, lease, signal and landings are
 * the test's, writing its unit under a scratch home, so no test starts a service or runs `systemctl`, `launchctl` or `loginctl`. The pause
 * is the store's own, on a scratch `WF_ROOT`, set before the import since the pause's store reads it as it loads. Each host keeps a log of
 * what it was asked, in order, which the take-over's tests read.
 */
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Fiber } from 'effect';
import type { DaemonStanding } from '../daemon/daemon.ts';
import type { Finishing } from '../pause/pause.ts';
import type { Args } from '../command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { testEngine, until, WAITED, type Waiter } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { steeredClock, type Steered } from '../../test/steered.ts';

const ROOT = scratch('wf-service-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { installService, liveHost, uninstallService, serviceStatus, SERVICES } = await import('./service.verb.ts');
const { LET_GO_MS } = await import('agent-runtime');
const { restartService, RESTARTS } = await import('./restart.verb.ts');
const { putPause, readPause, pauseFile, resumePause } = await import('../pause/pause.store.ts');
const { EngineService, engineOf, runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const { nemiaFence } = await import('../admission/fence.ts');
const { TABLE } = await import('../command/commands.verb.ts');
type ServiceHost = import('./service.verb.ts').ServiceHost;

const HOME = scratch('wf-service-home-');
const UNIT = path.join(HOME, '.config', 'systemd', 'user', 'nemia.service');
const OLD = 4242;
const NEW = 5151;

/** Refused by kind and words: exit 2, and the message — never `String(err)`. */
const refusedWith =
  (tag: string, ...patterns: RegExp[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) =>
    err.exitCode === 2 && err._tag === tag && patterns.every((p) => p.test(err.message));

/** A lease written by the api of `pid`, standing as `kind`, its pid confirmed unless said, with a pass completed when `passed`. */
const lease = (
  pid: number,
  kind: 'ticking' | 'stopped' | 'gone' | 'stalled' = 'ticking',
  identity: 'same' | 'unknown' = 'same',
  passed = false,
): DaemonStanding => ({
  kind,
  file: {
    pid,
    by: 'api',
    url: 'http://127.0.0.1:8790',
    startedAt: new Date().toISOString(),
    cwd: '/',
    every: 4000,
    passedAt: passed ? new Date().toISOString() : null,
  },
  last: Date.now(),
  quiet: 0,
  identity,
});

/** A landing check running under the pause. */
const LANDING: Finishing = { run: 'r1', step: 'ship', kind: 'landing' };

/** A session in its call to Bash under the pause. */
const CALL: Finishing = { run: 'r2', step: 'implement', kind: 'session', calling: 'Bash' };

/** The lease of the service's new daemon `pid`, read once before its first pass and passed on every read after. */
const passing = (world: World, pid: number): void => {
  world.lease = lease(pid);
  world.unitPid = pid;
  world.later = [lease(pid), lease(pid, 'ticking', 'same', true)];
};

/**
 * The fake machine's world: the lease, and the leases each read after it moves on to (`later`), the unit's main process, the landings each
 * read finds, and what a signal and a start change.
 */
type World = {
  lease: DaemonStanding;
  later?: DaemonStanding[];
  unitPid: number | null;
  landings: Finishing[][];
  calls?: Finishing[][];
  onSignal?: () => void;
  onStart?: () => void;
  root?: string;
  stopMs?: number;
  machine?: { platform: string; wsl: boolean; systemd: boolean };
};

/**
 * A host over `world` that logs, in order, every program it calls, the pause, each landings read, the signal and what it says; and,
 * where `world.calls` is given, each calls read and each drain put or lifted.
 */
function hostOf(world: World): { host: ServiceHost; events: string[] } {
  const events: string[] = [];
  const host: ServiceHost = {
    machine: () => world.machine ?? { platform: 'linux', wsl: true, systemd: true },
    dirs: () => ({ home: HOME, configHome: path.join(HOME, '.config') }),
    roots: () => ({ root: world.root ?? ROOT, defaultRoot: ROOT }),
    daemon: () => ({ checkout: '/srv/nemia', entry: '/srv/nemia/apps/api/src/main.ts', cwd: '/srv/nemia/apps/api' }),
    node: '/usr/bin/node',
    path: '/usr/bin:/bin',
    user: () => ({ name: 'ann', uid: 1000 }),
    call: (argv) => {
      if (argv.includes('show')) return `ActiveState=active\nUnitFileState=enabled\nMainPID=${world.unitPid ?? 0}\n`;
      events.push(argv.join(' '));
      if (argv[2] === 'start') world.onStart?.();
      return '';
    },
    linger: () => true,
    lease: () => {
      const read = world.lease;
      const next = world.later?.shift();
      if (next) world.lease = next;
      const passed = read.kind === 'ticking' && read.file.passedAt !== null ? `read ${read.file.pid} passed` : undefined;
      if (passed && !events.includes(passed)) events.push(passed);
      return read;
    },
    signal: (pid) => {
      events.push(`signal ${pid}`);
      world.onSignal?.();
    },
    pause: (said) => {
      const put = putPause(said);
      events.push('pause');
      return put;
    },
    resume: () => {
      events.push('resume');
      return resumePause();
    },
    landings: () =>
      Effect.sync(() => {
        const found = world.landings.length > 1 ? world.landings.shift()! : (world.landings[0] ?? []);
        events.push(`landings ${found.length}`);
        return found;
      }),
    calls: () =>
      Effect.sync(() => {
        if (!world.calls) return [];
        const found = world.calls.length > 1 ? world.calls.shift()! : (world.calls[0] ?? []);
        events.push(`calls ${found.length}`);
        return found;
      }),
    drain: (holder) => Effect.sync(() => void (world.calls && events.push(`drain ${holder}`))),
    say: (line) => events.push(`say ${line}`),
    pollMs: 1,
    waitMs: 200,
    stopMs: world.stopMs ?? 300,
  };
  return { host, events };
}

const install = (args: Args, host: ServiceHost) => runWith(engineOf(engine().layer), installService(args, host));

/**
 * A take-over of the old pid on `host`, forked over the engine and the place of the test running now, on the clock `clock` steers where
 * one is given and on the real clock where none is.
 */
const taking = (host: ServiceHost, clock?: Steered) => {
  const program = installService({ takeOver: String(OLD) }, host).pipe(
    Effect.provide(EngineService.layer(engineOf(engine().layer))),
    Effect.provide(stand().layer),
  );
  return Effect.runFork(clock ? program.pipe(Effect.provide(clock.layer)) : program);
};

/** A rest of `by` that `clock` was asked and has not woken: the pass of `fiber`'s program that waits for the clock to move. */
const resting = (clock: Steered, by: number): boolean =>
  clock.asked.filter((ms) => ms === by).length > clock.woken.filter((ms) => ms === by).length;

/**
 * Moves `clock` by `by` for each rest of `by` `fiber`'s program is waiting on, waiting for the rest and never for a length of time,
 * until the program ends. Every rest a take-over asks but its bounds is its host's poll, so the clock moves by one poll a pass and a
 * program driven this way reaches none of those bounds: no length of real time decides what it does.
 */
const stepped = async (t: Waiter, clock: Steered, fiber: { pollUnsafe: () => unknown }, by: number): Promise<void> => {
  while (fiber.pollUnsafe() === undefined) {
    await until(t, () => resting(clock, by) || fiber.pollUnsafe() !== undefined, `a rest of ${by} ms outstanding, or the program ended`, {
      bell: clock.bell,
    });
    if (fiber.pollUnsafe() !== undefined) return;
    await clock.adjust(by);
  }
};

beforeEach(() => {
  fs.rmSync(path.join(HOME, '.config'), { recursive: true, force: true });
  fs.rmSync(pauseFile(), { force: true });
});

test('install on a store nothing ticks writes the unit, enables it at login and starts it', async () => {
  const { host, events } = hostOf({ lease: { kind: 'none' }, unitPid: null, landings: [] });
  const done = await install({ env: ['PORT=8790'] }, host);
  assert.equal(done.did, 'started');
  assert.deepEqual(events, [
    'systemctl --user daemon-reload',
    'systemctl --user enable nemia.service',
    'systemctl --user start nemia.service',
  ]);
  const text = fs.readFileSync(UNIT, 'utf8');
  assert.match(text, /^ExecStart="\/usr\/bin\/node" "\/srv\/nemia\/apps\/api\/src\/main\.ts"$/m);
  assert.match(text, /^WorkingDirectory=\/srv\/nemia\/apps\/api$/m);
  assert.deepEqual(
    text.split('\n').filter((l) => l.startsWith('Environment=')),
    [`Environment="WF_ROOT=${ROOT}"`, 'Environment="PATH=/usr/bin:/bin"', 'Environment="PORT=8790"'],
  );
  assert.equal(fs.readdirSync(path.dirname(UNIT)).length, 1, 'the hidden file the unit was written through is renamed away');
});

test('REFUSED on WSL without systemd: Invalid, naming /etc/wsl.conf, [boot], systemd=true and wsl --shutdown, and nothing written', async () => {
  const { host, events } = hostOf({
    lease: { kind: 'none' },
    unitPid: null,
    landings: [],
    machine: { platform: 'linux', wsl: true, systemd: false },
  });
  await assert.rejects(install({}, host), refusedWith('Invalid', /\/etc\/wsl\.conf/, /\[boot\]/, /systemd=true/, /wsl --shutdown/));
  assert.deepEqual(events, []);
  assert.equal(fs.existsSync(path.join(HOME, '.config')), false);
});

test('REFUSED before anything is written: a store not the default with no name, or named nemia, and a bad --env', async () => {
  const { host, events } = hostOf({ lease: { kind: 'none' }, unitPid: null, landings: [], root: '/srv/trial-store' });
  await assert.rejects(install({}, host), refusedWith('Invalid', /is not the default one/, /--name <name>/));
  await assert.rejects(install({ name: 'nemia' }, host), refusedWith('Invalid', /the name nemia is the default store's service/));
  await assert.rejects(install({ name: 'nemia-trial', env: ['WF_ROOT=/x'] }, host), refusedWith('Invalid', /--env WF_ROOT is written/));
  await assert.rejects(install({ name: 'nemia-trial', takeOver: 'abc' }, host), refusedWith('Invalid', /--take-over takes the pid/));
  assert.deepEqual(events, []);
  assert.equal(fs.existsSync(path.join(HOME, '.config')), false);
});

test('install beside a daemon started by hand writes and enables the unit, starts nothing, and names the --take-over line', async () => {
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: null, landings: [] });
  const done = await install({}, host);
  assert.equal(done.did, 'written');
  assert.equal(done.holder, OLD);
  assert.deepEqual(events, ['systemctl --user daemon-reload', 'systemctl --user enable nemia.service']);
  assert.ok(fs.existsSync(UNIT));
  assert.ok(
    done.lines.some((l) => l.includes(`pid ${OLD} holds the store`)),
    done.lines.join('\n'),
  );
  assert.ok(
    done.lines.some((l) => l.includes(`nemia service install --take-over ${OLD}`)),
    done.lines.join('\n'),
  );
});

test('install where the service’s own process holds the store restarts it on the unit just written', async () => {
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: OLD, landings: [] });
  assert.equal((await install({}, host)).did, 'restarted');
  assert.equal(events.at(-1), 'systemctl --user restart nemia.service');
});

test('a take-over pauses, waits out the landing check, stops the confirmed pid, starts the service, and resumes once it has passed', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[LANDING], [LANDING], []] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const done = await install({ takeOver: String(OLD) }, host);
  assert.equal(done.did, 'taken');
  assert.deepEqual(events, [
    'systemctl --user daemon-reload',
    'systemctl --user enable nemia.service',
    'pause',
    'landings 1',
    "say waiting for r1's ship to land: its check runs, and the daemon is stopped once it has ended",
    'landings 1',
    'landings 0',
    `signal ${OLD}`,
    'systemctl --user start nemia.service',
    `say pid ${NEW} ticks the store: waiting for its first pass`,
    `read ${NEW} passed`,
    'resume',
  ]);
  assert.equal(readPause(), null);
  assert.ok(
    done.lines.some((l) => l.includes(`took the store over from pid ${OLD}`) && l.includes(`as pid ${NEW}`)),
    done.lines.join('\n'),
  );
});

test('a take-over drains the daemon and waits for each call in flight, naming it once, before it signals', WAITED, async (t) => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]], calls: [[CALL], [CALL], []] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const clock = steeredClock();
  const fiber = taking(host, clock);
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  await until(t, () => clock.asked.length >= 2, 'the call read, its rest and the bound of the wait asked', { bell: clock.bell });
  assert.deepEqual(clock.asked.slice(0, 2), [host.pollMs, host.waitMs], 'it rests at the host’s pace, under the host’s bound');
  await stepped(t, clock, fiber, host.pollMs);
  assert.equal((await Effect.runPromise(Fiber.join(fiber))).did, 'taken');
  const from = events.indexOf(`drain ${OLD}`);
  assert.deepEqual(events.slice(from, from + 6), [
    `drain ${OLD}`,
    'calls 1',
    "say waiting for r2's implement: its call to Bash runs, and the daemon is stopped once it has ended",
    'calls 1',
    'calls 0',
    `signal ${OLD}`,
  ]);
  assert.ok(!events.includes('drain null'), 'the drain names the daemon that is gone, and is left');
});

test('a take-over gives up on a call that never ends, says which, and goes on to stop the daemon', WAITED, async (t) => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]], calls: [[CALL]] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const bound = { ...host, waitMs: 30 };
  const clock = steeredClock();
  const fiber = taking(bound, clock);
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  const gave =
    "say giving up on r2's implement: its call to Bash has not ended in 30 ms, and the daemon is stopped now; its holder cuts the " +
    'call, and the next one resumes the session told the call did not finish';
  await until(t, () => clock.asked.length >= 2, 'the call read, its rest and the bound of the wait asked', { bell: clock.bell });
  assert.ok(!events.includes(gave), 'a clock nothing moved is a bound nothing reached: it waits');
  await clock.adjust(bound.waitMs);
  await until(t, () => events.includes(gave), 'the call it gave up on named', { bell: clock.bell });
  await stepped(t, clock, fiber, host.pollMs);
  assert.equal((await Effect.runPromise(Fiber.join(fiber))).did, 'taken');
  assert.ok(events.indexOf(`signal ${OLD}`) > events.indexOf(gave), 'it gives up, says so, and only then signals');
});

test('a take-over whose daemon takes its own let-go to stop is not refused: the stop has a bound of its own', WAITED, async (t) => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]], calls: [[CALL]], stopMs: 400 };
  const slow = Array.from({ length: 60 }, () => lease(OLD));
  world.onSignal = () => (world.later = [...slow, lease(OLD, 'stopped')]);
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const clock = steeredClock();
  const bound = { ...host, waitMs: 20 };
  const fiber = taking(bound, clock);
  t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
  await until(t, () => clock.asked.length >= 2, 'the call read, its rest and the bound of the wait asked', { bell: clock.bell });
  await clock.adjust(bound.waitMs);
  await until(t, () => events.some((e) => e.startsWith("say giving up on r2's implement")), 'the call it gave up on named first', {
    bell: clock.bell,
  });
  await stepped(t, clock, fiber, bound.pollMs);
  const done = await Effect.runPromise(Fiber.join(fiber));
  assert.equal(done.did, 'taken', 'the daemon let the store go on its own time and was never refused for it');
  assert.ok(slow.length * bound.pollMs > bound.waitMs, 'and it waited past the bound it gives a call in flight, read by read');
  assert.ok(events.includes(`signal ${OLD}`), events.join('\n'));
  assert.equal(readPause(), null, 'and the pause it put is lifted, since the take-over succeeded');
});

test(
  'a take-over waits past its bound for a landing check that never ends: a check that did not finish is no refusal',
  WAITED,
  async (t) => {
    const world: World = { lease: lease(OLD), unitPid: null, landings: [[LANDING]], calls: [[]] };
    const { host, events } = hostOf(world);
    const fiber = taking({ ...host, waitMs: 1 });
    await until(
      t,
      () => events.filter((e) => e === 'landings 1').length >= 5,
      'the landing read five times, each long past the bound of one millisecond',
      { everyMs: 5 },
    );
    await Effect.runPromise(Fiber.interrupt(fiber));
    assert.ok(!events.some((e) => e.startsWith('drain') || e.startsWith('signal')), events.join('\n'));
  },
);

test('a take-over interrupted while it waits on a call lifts its drain and its pause, and signals nothing', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]], calls: [[CALL]] };
  const { host, events } = hostOf(world);
  let said: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => (said = resolve));
  const fiber = taking({ ...host, say: (l) => (events.push(`say ${l}`), said()) }, steeredClock());
  await waiting;
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.ok(!events.some((e) => e.startsWith('signal')), events.join('\n'));
  assert.deepEqual(events.slice(-2), ['drain null', 'resume']);
});

test('REFUSED to take over a pid the lease does not name, or one it cannot confirm: Conflict, before the unit is written', async () => {
  const other = hostOf({ lease: lease(OLD), unitPid: null, landings: [] });
  await assert.rejects(install({ takeOver: '999' }, other.host), refusedWith('Conflict', /held by pid 4242, not 999/));
  const unsure = hostOf({ lease: lease(OLD, 'ticking', 'unknown'), unitPid: null, landings: [] });
  await assert.rejects(install({ takeOver: String(OLD) }, unsure.host), refusedWith('Conflict', /could not be confirmed/));
  assert.deepEqual([...other.events, ...unsure.events], []);
  assert.equal(fs.existsSync(UNIT), false);
});

test('a pause a person put stands through a take-over: it is neither put again nor lifted', async () => {
  putPause({ by: 'ann', why: 'reading the night' });
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
  world.onSignal = () => (world.lease = lease(OLD, 'gone'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  assert.equal((await install({ takeOver: String(OLD) }, host)).did, 'taken');
  assert.ok(!events.includes('pause') && !events.includes('resume'), events.join('\n'));
  assert.equal(readPause()?.by, 'ann');
});

test('a take-over interrupted while it waits on a landing lifts its own pause and signals nothing', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[LANDING]] };
  const { host, events } = hostOf(world);
  let said: () => void = () => undefined;
  const waiting = new Promise<void>((resolve) => (said = resolve));
  const fiber = taking({ ...host, say: (l) => (events.push(`say ${l}`), said()) }, steeredClock());
  await waiting;
  assert.ok(readPause() !== null, 'the take-over paused the store');
  await Effect.runPromise(Fiber.interrupt(fiber));
  assert.equal(readPause(), null);
  assert.ok(!events.some((e) => e.startsWith('signal')), events.join('\n'));
  assert.equal(events.at(-1), 'resume');
});

test('REFUSED when the service never ticks: Conflict naming nemia service status, the store left paused and nemia resume said', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  const { host, events } = hostOf(world);
  await assert.rejects(
    install({ takeOver: String(OLD) }, { ...host, waitMs: 30 }),
    refusedWith('Conflict', /does not tick the store yet: nemia service status says why/, /the store stays paused: nemia resume/),
  );
  assert.ok(readPause() !== null);
  assert.ok(events.includes('systemctl --user start nemia.service') && !events.includes('resume'), events.join('\n'));
});

test('REFUSED when the stopped daemon still holds the store: Conflict naming ps -p, and the service is not started', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
  const { host, events } = hostOf(world);
  await assert.rejects(
    install({ takeOver: String(OLD) }, { ...host, stopMs: 30 }),
    refusedWith('Conflict', /still holds the store: check it with ps -p 4242/),
  );
  assert.ok(!events.includes('systemctl --user start nemia.service'), events.join('\n'));
  assert.ok(readPause() !== null);
});

test(
  'REFUSED at shipped defaults: a stopped daemon that still holds the store is waited for ninety seconds and no less, its lease read every two seconds',
  WAITED,
  async (t) => {
    const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
    const { host } = hostOf(world);
    const live = liveHost();
    let reads = 0;
    const shipped = { ...host, pollMs: live.pollMs, waitMs: live.waitMs, stopMs: live.stopMs, lease: () => (reads++, host.lease()) };
    assert.ok(
      live.stopMs > LET_GO_MS,
      `the shipped stop wait is ${live.stopMs} ms and the runtime's let-go takes up to ${LET_GO_MS} ms: a daemon parking the ` +
        'session whose call it cut would be refused as one that will not stop, so raise stopMs or lower LET_GO_MS',
    );
    const clock = steeredClock();
    const fiber = taking(shipped, clock);
    t.after(() => Effect.runPromise(Fiber.interrupt(fiber)));
    const refused = Effect.runPromise(Fiber.join(fiber));
    refused.catch(() => undefined);
    await until(t, () => clock.asked.length === 2, 'the wait and its first rest asked', { bell: clock.bell });
    assert.deepEqual(clock.asked, [2_000, live.stopMs], 'the shipped pace of its reads, and the shipped wait for the stop');
    const read = reads;
    await clock.adjust(1_999);
    assert.deepEqual([clock.woken, reads], [[], read], 'a millisecond early, the lease is not read again');
    await clock.adjust(1);
    assert.deepEqual([clock.woken, reads], [[2_000], read + 1], 'at two seconds it is');
    await clock.adjust(live.stopMs - 2_000 - 1);
    assert.equal(fiber.pollUnsafe(), undefined, 'a millisecond before the shipped wait, the take-over still waits');
    await clock.adjust(1);
    await assert.rejects(refused, refusedWith('Conflict', /still holds the store: check it with ps -p 4242/));
  },
);

test('uninstall stops, disables and removes the unit, then says how the lease stands; one not installed is Missing', async () => {
  const { host, events } = hostOf({ lease: lease(OLD, 'stopped'), unitPid: null, landings: [] });
  await assert.rejects(
    runWith(engineOf(engine().layer), uninstallService({}, host)),
    refusedWith('Missing', /no service nemia is installed/),
  );
  await install({}, host);
  events.length = 0;
  const done = await runWith(engineOf(engine().layer), uninstallService({}, host));
  assert.deepEqual(events, ['systemctl --user disable --now nemia.service', 'systemctl --user daemon-reload']);
  assert.equal(fs.existsSync(UNIT), false);
  assert.match(done.lines[1], /^api: none ticking — pid 4242 stopped/);
});

test('status reads the unit back: what it runs, from which checkout, who holds the store, and lingering', async () => {
  const { host } = hostOf({ lease: lease(OLD), unitPid: OLD, landings: [] });
  const before = await runWith(engineOf(engine().layer), serviceStatus({}, host));
  assert.equal(before.service.unit, null);
  await install({}, host);
  const after = await runWith(engineOf(engine().layer), serviceStatus({}, host));
  assert.equal(after.service.unit?.entry, '/srv/nemia/apps/api/src/main.ts');
  assert.equal(after.service.unit?.node, '/usr/bin/node');
  assert.ok(
    after.lines.some((l) => l.includes("the service's own process holds the store")),
    after.lines.join('\n'),
  );
  assert.ok(after.lines.some((l) => l.startsWith('lingering: on')));
});

test('the service commands are the CLI’s alone; Nemia’s fence asks before install and uninstall and lets status run', () => {
  assert.deepEqual(
    SERVICES.map((c) => [c.name, c.only?.side, c.class]),
    [
      ['service install', 'cli', 'ask'],
      ['service uninstall', 'cli', 'ask'],
      ['service status', 'cli', 'read'],
    ],
  );
  const fence = nemiaFence(TABLE);
  assert.ok(fence.ask.includes('Bash(nemia service install:*)'));
  assert.ok(fence.ask.includes('Bash(nemia service uninstall:*)'));
  assert.ok(!fence.allow.some((r) => r.startsWith('Bash(nemia service install') || r.startsWith('Bash(nemia service uninstall')));
  assert.ok(fence.allow.includes('Bash(nemia service status)') && fence.allow.includes('Bash(nemia service status:*)'));
});

/** A unit written for the service, as install leaves it, so a restart finds it installed. */
const installed = async (): Promise<void> => {
  await install({}, hostOf({ lease: { kind: 'none' }, unitPid: null, landings: [] }).host);
};

const restart = (args: Args, host: ServiceHost) => runWith(engineOf(engine().layer), restartService(args, host));

test('REFUSED when the new daemon ends before its first pass: Conflict naming its log, the lease and nemia resume, and no resume', async () => {
  for (const ended of ['stopped', 'gone'] as const) {
    fs.rmSync(pauseFile(), { force: true });
    const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
    world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
    world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW), lease(NEW, ended)]));
    const { host, events } = hostOf(world);
    await assert.rejects(
      install({ takeOver: String(OLD) }, host),
      refusedWith(
        'Conflict',
        new RegExp(`pid ${NEW} ended before its first pass`),
        /journalctl --user -u nemia\.service/,
        /nemia service status/,
        /the store stays paused: nemia resume/,
      ),
    );
    assert.ok(!events.includes('resume'), events.join('\n'));
    assert.ok(readPause() !== null, `${ended}: the store stays paused`);
  }
});

test('REFUSED when another pid takes the new daemon’s place before its first pass: the one waited on ended', async () => {
  const world: World = { lease: lease(OLD), unitPid: null, landings: [[]] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW), lease(NEW + 1, 'ticking', 'same', true)]));
  const { host } = hostOf(world);
  await assert.rejects(
    install({ takeOver: String(OLD) }, host),
    refusedWith('Conflict', new RegExp(`pid ${NEW} ended before its first pass`)),
  );
});

test('restart waits on a landing check at work, stops the service’s daemon, starts the unit, and resumes only after the first pass', async () => {
  await installed();
  const world: World = { lease: lease(OLD), unitPid: OLD, landings: [[LANDING], [LANDING], []] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const done = await restart({}, host);
  assert.deepEqual(events, [
    'pause',
    'landings 1',
    "say waiting for r1's ship to land: its check runs, and the daemon is stopped once it has ended",
    'landings 1',
    'landings 0',
    `signal ${OLD}`,
    'systemctl --user start nemia.service',
    `say pid ${NEW} ticks the store: waiting for its first pass`,
    `read ${NEW} passed`,
    'resume',
  ]);
  assert.equal(done.did, 'restarted');
  assert.equal(done.pid, NEW);
  assert.equal(readPause(), null);
  assert.match(done.lines[0], new RegExp(`restarted nemia\\.service: pid ${OLD} stopped, and pid ${NEW} ticks the store`));
});

test('REFUSED: a restart whose new daemon’s first pass fails keeps the store paused and names the log, with no resume', async () => {
  await installed();
  const world: World = { lease: lease(OLD), unitPid: OLD, landings: [[]] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW), lease(NEW, 'stopped')]));
  const { host, events } = hostOf(world);
  await assert.rejects(
    restart({}, host),
    refusedWith('Conflict', /^nemia service restart: /, /journalctl --user -u nemia\.service/, /nemia service status/, /nemia resume/),
  );
  assert.ok(!events.includes('resume'), events.join('\n'));
  assert.match(readPause()?.why ?? '', /restarting the daemon at pid 4242/);
});

test('REFUSED: a restart beside a daemon started by hand names nemia service install --take-over <pid> and signals nothing', async () => {
  await installed();
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: null, landings: [] });
  await assert.rejects(restart({}, host), refusedWith('Conflict', new RegExp(`nemia service install --take-over ${OLD}`)));
  assert.deepEqual(events, []);
  assert.equal(readPause(), null);
});

test('REFUSED: a restart with no service installed is Missing, naming nemia service install, or its --take-over line beside a daemon', async () => {
  const none = hostOf({ lease: lease(OLD, 'stopped'), unitPid: null, landings: [] });
  await assert.rejects(
    restart({}, none.host),
    refusedWith('Missing', /no service nemia is installed/, /nemia service install writes and starts it/),
  );
  const byHand = hostOf({ lease: lease(OLD), unitPid: null, landings: [] });
  await assert.rejects(
    restart({}, byHand.host),
    refusedWith(
      'Missing',
      /no service nemia is installed/,
      new RegExp(`pid ${OLD} holds the store: nemia service install --take-over ${OLD} `),
    ),
  );
  assert.deepEqual([...none.events, ...byHand.events], []);
  assert.equal(readPause(), null);
});

test('REFUSED: a restart while the holder is stalled is Conflict, naming it, and signals nothing', async () => {
  await installed();
  const { host, events } = hostOf({ lease: lease(OLD, 'stalled'), unitPid: OLD, landings: [] });
  await assert.rejects(restart({}, host), refusedWith('Conflict', /stalled, pid 4242/));
  assert.deepEqual(events, []);
});

test('a restart where nothing ticks starts the unit and waits for its first pass, signalling and pausing nothing', async () => {
  await installed();
  const world: World = { lease: lease(OLD, 'stopped'), unitPid: null, landings: [] };
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const done = await restart({}, host);
  assert.deepEqual(events, [
    'systemctl --user start nemia.service',
    `say pid ${NEW} ticks the store: waiting for its first pass`,
    `read ${NEW} passed`,
  ]);
  assert.equal(done.did, 'started');
  assert.equal(done.pid, NEW);
});

test('a pause a person put stands through a restart where nothing ticks: the unit started, the pause kept, and the answer says so', async () => {
  await installed();
  putPause({ by: 'ann', why: 'reading the night' });
  const world: World = { lease: lease(OLD, 'stopped'), unitPid: null, landings: [] };
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const done = await restart({}, host);
  assert.ok(!events.includes('pause') && !events.includes('resume'), events.join('\n'));
  assert.equal(readPause()?.by, 'ann');
  assert.equal(done.did, 'started');
  assert.equal(done.paused, true);
  assert.ok(
    done.lines.some((l) => l.includes('the pause that stood is left as it was')),
    done.lines.join('\n'),
  );
});

test('a pause a person put stands through a restart: neither put again nor lifted, and the answer says so', async () => {
  await installed();
  putPause({ by: 'ann', why: 'reading the night' });
  const world: World = { lease: lease(OLD), unitPid: OLD, landings: [[]] };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => passing(world, NEW);
  const { host, events } = hostOf(world);
  const done = await restart({}, host);
  assert.ok(!events.includes('pause') && !events.includes('resume'), events.join('\n'));
  assert.equal(readPause()?.by, 'ann');
  assert.equal(done.paused, true);
  assert.ok(
    done.lines.some((l) => l.includes('the pause that stood is left as it was')),
    done.lines.join('\n'),
  );
});

test('the restart is the CLI’s alone, and Nemia’s fence asks before it', () => {
  assert.deepEqual(
    RESTARTS.map((c) => [c.name, c.only?.side, c.class]),
    [['service restart', 'cli', 'ask']],
  );
  const fence = nemiaFence(TABLE);
  assert.ok(fence.ask.includes('Bash(nemia service restart:*)'), fence.ask.join('\n'));
  assert.ok(!fence.allow.some((r) => r.startsWith('Bash(nemia service restart')));
});
