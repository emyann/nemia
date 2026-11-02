/**
 * `ensureDaemon`, on a store of its own, told as one story: a daemon spawned for real where no lease stands, found by its lease; none
 * beside a daemon that ticks; the store's login service started in place of a spawn, and another store's left alone; the start turned
 * off; a daemon that ends before it takes the store. Beside it the shipped wait, a Mac's login agent, a spawn that throws and a store
 * taken by another while one starts, each said and none thrown.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from '../../test/scratch.ts';
import { steeredClock } from '../../test/steered.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { story } from '../../test/checkpoints.ts';

const ROOT = scratch('wf-demand-');
process.env.WF_ROOT = ROOT;
const { ensureDaemon, liveDemandHost } = await import('./demand.verb.ts');
const { daemonFile, daemonStanding, releaseStore, takeStore } = await import('../daemon/daemon.store.ts');
const { DEMAND_OFF } = await import('./demand.ts');
const { plistText, unitText } = await import('../service/service.ts');
type DemandHost = import('./demand.verb.ts').DemandHost;

const PACKAGE = path.resolve(import.meta.dirname, '..', '..');
const FIXTURE = path.join(PACKAGE, 'test', 'fixtures', 'demand', 'daemon.ts');
const HOME = scratch('wf-demand-home-');
const CONFIG = path.join(HOME, '.config');
const NO_SYSTEM = { platform: 'linux', wsl: false, systemd: false };
const { [DEMAND_OFF]: _off, ...ON } = process.env;

const started: number[] = [];
after(() => {
  for (const pid of started) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      continue;
    }
  }
});

/** A host over the scratch store that keeps what it says, refuses a spawn and every program, and finds no service unless `over` says. */
function hostOf(over: Partial<DemandHost> = {}): { host: DemandHost; said: string[]; calls: string[] } {
  const said: string[] = [];
  const calls: string[] = [];
  const host: DemandHost = {
    ...liveDemandHost(),
    machine: () => NO_SYSTEM,
    dirs: () => ({ home: HOME, configHome: CONFIG }),
    roots: () => ({ root: ROOT, defaultRoot: ROOT }),
    daemon: () => ({ checkout: PACKAGE, entry: FIXTURE, cwd: PACKAGE }),
    user: () => ({ name: 'ann', uid: 1000 }),
    call: (argv) => {
      calls.push(argv.join(' '));
      return '';
    },
    say: (line) => said.push(line),
    spawn: () => assert.fail('a second daemon started'),
    env: ON,
    pollMs: 5,
    waitMs: 2_000,
    ...over,
  };
  return { host, said, calls };
}

/** Waits, a beat at a time, until the store's lease reads as `done` says. */
async function leaseUntil(done: (kind: string) => boolean): Promise<void> {
  while (!done(daemonStanding().kind)) await new Promise((resolve) => setTimeout(resolve, 20));
}

/** The service named `name` for the store `root`, as `nemia service install` writes it. */
const specOf = (name: string, root: string) => ({
  name,
  node: '/usr/bin/node',
  entry: FIXTURE,
  cwd: PACKAGE,
  checkout: PACKAGE,
  env: [['WF_ROOT', root] as const, ['PATH', '/usr/bin'] as const],
  logs: path.join(HOME, 'Library', 'Logs', `${name}.log`),
});

/** A systemd unit named `name` for the store `root`. */
function unitFor(name: string, root: string): void {
  const dir = path.join(CONFIG, 'systemd', 'user');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.service`), unitText(specOf(name, root)));
}

test('a ticking command starts a daemon on demand: none, one live, a login service, the start turned off, one that dies early', async (t) => {
  const s = story(t);
  const LINUX = () => ({ platform: 'linux', wsl: false, systemd: true });
  t.after(() => fs.rmSync(CONFIG, { recursive: true, force: true }));
  let pid = 0;
  t.after(async () => {
    if (pid === 0 || daemonStanding().kind !== 'ticking') return;
    process.kill(pid, 'SIGTERM');
    await leaseUntil((kind) => kind !== 'ticking');
  });

  await s.test(
    'no lease: a daemon is spawned detached, found by its lease, and said with its pid, its log and how to stop it',
    async () => {
      assert.equal(daemonStanding().kind, 'none');
      const { host, said } = hostOf({
        spawn: (spec) => {
          const child = liveDemandHost().spawn(spec);
          if (child.pid !== undefined) started.push(child.pid);
          return child;
        },
        waitMs: 60_000,
      });
      assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'spawn' });
      pid = started[0];
      const lease = daemonStanding();
      assert.equal(lease.kind === 'ticking' && lease.file.pid, pid);
      const log = path.join(ROOT, 'daemon.log');
      assert.equal(said.length, 1, said.join('\n'));
      for (const words of [`pid ${pid}`, log, `kill ${pid}`, FIXTURE]) assert.ok(said[0].includes(words), `${words}: ${said[0]}`);
      assert.ok(fs.existsSync(log));
    },
  );

  await s.test('beside that live daemon nothing starts, no service is looked for, and nothing is said', async () => {
    const { host, said, calls } = hostOf({ machine: () => assert.fail('looked for a service beside a ticking daemon') });
    assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'ticking' });
    assert.deepEqual([said, calls], [[], []]);
    process.kill(pid, 'SIGTERM');
    await leaseUntil((kind) => kind === 'stopped');
  });

  await s.test(
    "once it stopped, the store's login service is started in place of a spawn, and another store's unit left alone",
    async () => {
      unitFor('nemia-other', '/srv/another-store');
      unitFor('nemia', ROOT);
      const { host, said, calls } = hostOf({ machine: LINUX, waitMs: 50 });
      assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'service' });
      assert.deepEqual(
        calls.filter((c) => !c.includes(' show ')),
        ['systemctl --user start nemia.service'],
      );
      assert.match(said.join('\n'), /has not taken the store after 0s/);
      assert.match(said.join('\n'), /journalctl --user -u nemia\.service/);
    },
  );

  await s.test('NEMIA_DAEMON_START=off starts nothing, not even the service installed, and says so once', async () => {
    const { host, said, calls } = hostOf({ machine: LINUX, env: { ...ON, [DEMAND_OFF]: 'off' } });
    assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'off' });
    assert.equal(said.length, 1);
    assert.match(said[0], /NEMIA_DAEMON_START=off/);
    assert.deepEqual(calls, []);
    fs.rmSync(CONFIG, { recursive: true, force: true });
  });

  await s.test(
    'over a lease that does not read, a daemon that ends before it takes the store is said with its exit and its log, unwaited',
    async () => {
      fs.writeFileSync(daemonFile(), '{');
      assert.equal(daemonStanding().kind, 'unreadable');
      const { host, said } = hostOf({
        spawn: () => ({ pid: 77, ended: Promise.resolve({ code: 2, signal: null }) }),
        waitMs: 600_000,
      });
      assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'spawn' });
      const line = said.join('\n');
      assert.match(line, /a daemon \(pid 77\)/);
      assert.match(line, /exit 2/);
      assert.ok(line.includes(`${ROOT}/daemon.log`), line);
      fs.rmSync(daemonFile());
    },
  );
});

test(
  'REFUSED at shipped defaults: a service that never takes the store is waited for sixty seconds and no less, its lease read every 200 ms',
  WAITED,
  async (t) => {
    fs.rmSync(CONFIG, { recursive: true, force: true });
    unitFor('nemia', ROOT);
    t.after(() => fs.rmSync(CONFIG, { recursive: true, force: true }));
    const live = liveDemandHost();
    let reads = 0;
    const { host, said } = hostOf({
      machine: () => ({ platform: 'linux', wsl: false, systemd: true }),
      pollMs: live.pollMs,
      waitMs: live.waitMs,
      lease: () => {
        reads++;
        return live.lease();
      },
    });
    const clock = steeredClock();
    let ended = false;
    const start = Effect.runPromise(ensureDaemon(host).pipe(Effect.provide(clock.layer))).then((answer) => {
      ended = true;
      return answer;
    });
    await until(t, () => clock.asked.length === 2, 'the wait and its first rest asked', { bell: clock.bell });
    assert.deepEqual(clock.asked, [200, 60_000], 'the shipped pace of its reads, and the shipped wait');
    const read = reads;
    await clock.adjust(199);
    assert.deepEqual([clock.woken, reads], [[], read], 'a millisecond early, the lease is not read again');
    await clock.adjust(1);
    assert.deepEqual([clock.woken, reads], [[200], read + 1], 'at 200 ms it is');
    await clock.adjust(59_799);
    assert.equal(ended, false, 'a millisecond before sixty seconds, the command still waits');
    await clock.adjust(1);
    assert.deepEqual(await start, { kind: 'service' });
    assert.match(said.join('\n'), /started its login service nemia\.service, but it has not taken the store after 60s: /);
  },
);

test('on a Mac the login agent of the store is bootstrapped', async () => {
  const agents = path.join(HOME, 'Library', 'LaunchAgents');
  fs.mkdirSync(agents, { recursive: true });
  fs.writeFileSync(path.join(agents, 'nemia.plist'), plistText(specOf('nemia', ROOT)));
  try {
    const { host, calls } = hostOf({ machine: () => ({ platform: 'darwin', wsl: false, systemd: false }), waitMs: 50 });
    assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'service' });
    assert.ok(calls.includes(`launchctl bootstrap gui/1000 ${path.join(agents, 'nemia.plist')}`), calls.join('\n'));
  } finally {
    fs.rmSync(path.join(HOME, 'Library'), { recursive: true, force: true });
  }
});

test('a daemon that cannot be spawned is said, never thrown', async () => {
  const { host, said } = hostOf({
    spawn: () => {
      throw new Error('spawn ENOENT');
    },
  });
  assert.deepEqual(await Effect.runPromise(ensureDaemon(host)), { kind: 'spawn' });
  assert.match(said.join('\n'), /it could not be started \(spawn ENOENT\)/);
});

test('another daemon that takes the store while this one starts is named as its holder', async () => {
  let held: ReturnType<typeof takeStore>['held'] | undefined;
  const { host, said } = hostOf({
    spawn: () => {
      held = takeStore({ every: 4000, cwd: PACKAGE, by: 'api' }).held;
      return { pid: 77, ended: new Promise(() => undefined) };
    },
  });
  try {
    await Effect.runPromise(ensureDaemon(host));
    assert.match(said.join('\n'), new RegExp(`another daemon, pid ${process.pid}, took ${ROOT} while this command started pid 77`));
  } finally {
    if (held !== undefined) releaseStore(held);
  }
});
