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
import { runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-service-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { installService, uninstallService, serviceStatus, SERVICES } = await import('./service.verb.ts');
const { restartService, RESTARTS } = await import('./restart.verb.ts');
const { putPause, readPause, pauseFile, resumePause } = await import('../pause/pause.store.ts');
const { EngineService, runWith: runEngine } = await import('../runtime-client.ts');
const { gitPlaceLayer } = await import('../place/shipped.store.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
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
  onSignal?: () => void;
  onStart?: () => void;
  root?: string;
  machine?: { platform: string; wsl: boolean; systemd: boolean };
};

/** A host over `world` that logs, in order, every program it calls, the pause, each landings read, the signal and what it says. */
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
    say: (line) => events.push(`say ${line}`),
    pollMs: 1,
    waitMs: 200,
  };
  return { host, events };
}

const install = (args: Args, host: ServiceHost) => runWith({} as never, installService(args, host));

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
  const fiber = Effect.runFork(
    installService({ takeOver: String(OLD) }, { ...host, say: (l) => (events.push(`say ${l}`), said()) }).pipe(
      Effect.provideService(EngineService, {} as never),
      Effect.provide(gitPlaceLayer),
    ),
  );
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
    install({ takeOver: String(OLD) }, { ...host, waitMs: 30 }),
    refusedWith('Conflict', /still holds the store: check it with ps -p 4242/),
  );
  assert.ok(!events.includes('systemctl --user start nemia.service'), events.join('\n'));
  assert.ok(readPause() !== null);
});

test('uninstall stops, disables and removes the unit, then says how the lease stands; one not installed is Missing', async () => {
  const { host, events } = hostOf({ lease: lease(OLD, 'stopped'), unitPid: null, landings: [] });
  await assert.rejects(runWith({} as never, uninstallService({}, host)), refusedWith('Missing', /no service nemia is installed/));
  await install({}, host);
  events.length = 0;
  const done = await runWith({} as never, uninstallService({}, host));
  assert.deepEqual(events, ['systemctl --user disable --now nemia.service', 'systemctl --user daemon-reload']);
  assert.equal(fs.existsSync(UNIT), false);
  assert.match(done.lines[1], /^api: none ticking — pid 4242 stopped/);
});

test('status reads the unit back: what it runs, from which checkout, who holds the store, and lingering', async () => {
  const { host } = hostOf({ lease: lease(OLD), unitPid: OLD, landings: [] });
  const before = await runWith({} as never, serviceStatus({}, host));
  assert.equal(before.service.unit, null);
  await install({}, host);
  const after = await runWith({} as never, serviceStatus({}, host));
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
    SERVICES.map((c) => [c.name, c.only?.side, c.nemia]),
    [
      ['service install', 'cli', 'prompts'],
      ['service uninstall', 'cli', 'prompts'],
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

const restart = (args: Args, host: ServiceHost) => runWith({} as never, restartService(args, host));

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
    RESTARTS.map((c) => [c.name, c.only?.side, c.nemia]),
    [['service restart', 'cli', 'prompts']],
  );
  const fence = nemiaFence(TABLE);
  assert.ok(fence.ask.includes('Bash(nemia service restart:*)'), fence.ask.join('\n'));
  assert.ok(!fence.allow.some((r) => r.startsWith('Bash(nemia service restart')));
});
