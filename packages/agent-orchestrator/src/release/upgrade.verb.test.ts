/**
 * `nemia upgrade` on a scratch store, from a scratch repository whose tags are tiny packages: a `package.json` with a `build` and a
 * `release:check` that are node one-liners and a lockfile with no dependency, so `npm ci` installs nothing and needs no network. Each tag
 * is upgraded to, rolled back to and refused as the command does it, and the daemon restarted through a fake machine: a host whose lease,
 * unit, signal and start are the test's, as `service.verb.test.ts`'s are, so no test starts a service or signals a process. `WF_ROOT` is
 * set before the import, since the pause's store reads it as it loads; the repository is the test place's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { DaemonStanding } from '../daemon/daemon.ts';
import type { Args } from '../command/command.ts';
import { scratch } from '../../test/scratch.ts';
import { testPlace } from '../../place/memory/index.ts';
import { runOver } from '../../test/placed.ts';
import { story } from '../../test/checkpoints.ts';

const ROOT = fs.realpathSync(scratch('wf-upgrade-'));
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
delete process.env.WF_MAX_RUNS;
delete process.env.WF_MAX_CONCURRENT;
const { upgrade, RELEASES } = await import('./upgrade.verb.ts');
const { currentRelease, releaseDir, releasesDir, runningAt } = await import('./release.store.ts');
const { unitText } = await import('../service/service.ts');
const { readPause } = await import('../pause/pause.store.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const place = testPlace();
const stand = () => place;
const runWith = runOver(runEngine, () => stand().layer);
const { TABLE } = await import('../command/commands.verb.ts');
const { nemiaFence, widened } = await import('../admission/fence.ts');
type ServiceHost = import('../service/service.verb.ts').ServiceHost;

const HOME = scratch('wf-upgrade-home-');
const UNIT = path.join(HOME, '.config', 'systemd', 'user', 'nemia.service');
const OLD = 4242;
const NEW = 5151;

/** The environment a release's commands are handed: npm quiet and offline, and a file the fixture's check writes what it saw into. */
const SEEN = path.join(scratch('wf-upgrade-seen-'), 'env.json');
const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
  npm_config_offline: 'true',
  SEEN_FILE: SEEN,
};

/** The check a tag's `release:check` runs: it writes the stores it was handed into `SEEN_FILE`, then exits `exit`. */
const CHECK = (exit: number) =>
  `node -e "require('fs').writeFileSync(process.env.SEEN_FILE, JSON.stringify({WF_ROOT: process.env.WF_ROOT, AE_ROOT: process.env.AE_ROOT, HKB_REPO: process.env.HKB_REPO ?? null})); process.exit(${exit})"`;

/** The scripts of a fixture tag: a build that writes `built.txt`, and a check, each exiting as said. */
const scripts = ({ build = 0, check = 0 }: { build?: number; check?: number | null } = {}): Record<string, string> => ({
  build: `node -e "require('fs').writeFileSync('built.txt', 'built'); process.exit(${build})"`,
  ...(check === null ? {} : { 'release:check': CHECK(check) }),
});

/** The fixture repository: a package with no dependency, committed on main. */
const REPO = (() => {
  const dir = scratch('wf-upgrade-repo-');
  fs.writeFileSync(
    path.join(dir, 'package-lock.json'),
    `${JSON.stringify({ name: 'fx', version: '1.0.0', lockfileVersion: 3, requires: true, packages: { '': { name: 'fx', version: '1.0.0' } } }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(dir, '.gitignore'), 'node_modules/\n');
  stand().world.repository(dir, {
    'package-lock.json': fs.readFileSync(path.join(dir, 'package-lock.json'), 'utf8'),
    '.gitignore': 'node_modules/\n',
  });
  return dir;
})();

/** Commits a fixture package with `scripts` and `marker` in it, tags it `tag`, and answers the commit. */
function tagged(tag: string, marker: string, given: Record<string, string> = scripts()): string {
  fs.writeFileSync(
    path.join(REPO, 'package.json'),
    `${JSON.stringify({ name: 'fx', version: '1.0.0', private: true, scripts: given }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(REPO, 'marker.txt'), `${marker}\n`);
  const commit = stand().world.commit(REPO, marker);
  stand().world.tag(REPO, tag, commit);
  return commit;
}

/**
 * The fake machine's world: the lease, the leases read after it in turn (`later`), the unit's main process, and what a signal and a start
 * change.
 */
type World = {
  lease: DaemonStanding;
  later?: DaemonStanding[];
  unitPid: number | null;
  onSignal?: () => void;
  onStart?: () => void;
};

/** A lease written by the api of `pid`, standing as `kind`, its pid confirmed, its first pass completed when `passed`. */
const lease = (pid: number, kind: 'ticking' | 'stopped' = 'ticking', passed = false): DaemonStanding => ({
  kind,
  file: {
    pid,
    by: 'api',
    startedAt: new Date().toISOString(),
    cwd: '/',
    every: 4000,
    passedAt: passed ? new Date().toISOString() : null,
  },
  last: Date.now(),
  quiet: 0,
  identity: 'same',
});

/** A host over `world` that logs, in order, every program it calls, the pause, each landings read, the signal and what it says. */
function hostOf(world: World): { host: ServiceHost; events: string[] } {
  const events: string[] = [];
  const host: ServiceHost = {
    machine: () => ({ platform: 'linux', wsl: true, systemd: true }),
    dirs: () => ({ home: HOME, configHome: path.join(HOME, '.config') }),
    roots: () => ({ root: ROOT, defaultRoot: ROOT }),
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
      world.lease = world.later?.shift() ?? world.lease;
      return read;
    },
    signal: (pid) => {
      events.push(`signal ${pid}`);
      world.onSignal?.();
    },
    pause: (said) => {
      events.push(`pause by ${said.by}`);
      return { paused: true, at: new Date().toISOString() } as never;
    },
    resume: () => {
      events.push('resume');
      return { paused: false } as never;
    },
    calls: () => Effect.succeed([]),
    drain: () => Effect.void,
    landings: () =>
      Effect.sync(() => {
        events.push('landings 0');
        return [];
      }),
    say: (line) => events.push(`say ${line}`),
    pollMs: 1,
    waitMs: 200,
    stopMs: 200,
  };
  return { host, events };
}

/** No daemon ticks the store. */
const idle = () => hostOf({ lease: { kind: 'none' }, unitPid: null });

/** Writes the service's unit, running the daemon at `checkout`. */
function unitOn(checkout: string): void {
  fs.mkdirSync(path.dirname(UNIT), { recursive: true });
  fs.writeFileSync(
    UNIT,
    unitText({
      name: 'nemia',
      node: '/usr/bin/node',
      checkout,
      entry: path.join(checkout, 'apps', 'api', 'src', 'main.ts'),
      cwd: path.join(checkout, 'apps', 'api'),
      env: [['WF_ROOT', ROOT]],
      logs: '/dev/null',
    }),
  );
}

const run = (args: Args, host: ServiceHost, env: NodeJS.ProcessEnv = ENV) => runWith({} as never, upgrade(args, host, env));

/** The refusal an upgrade fails with: its tag and message. */
async function refusalOf(args: Args, host: ServiceHost, env?: NodeJS.ProcessEnv): Promise<{ tag: string; message: string }> {
  const err = await run(args, host, env).then(
    () => assert.fail('the upgrade was expected to be refused'),
    (e: Error & { _tag?: string; exitCode?: number }) => e,
  );
  assert.equal(err.exitCode, 2, err.message);
  return { tag: err._tag ?? '', message: err.message };
}

/** What is left under `releases/` beside the releases: no build folder, no hidden link. */
const leftovers = (): string[] => fs.readdirSync(releasesDir()).filter((f) => f.startsWith('.') && f !== '.logs');

const V1 = tagged('v1', 'one');
const V2 = tagged('v2', 'two');

test('two tags: v1 built on its trial store, v2 switched in with the service on the pointer restarted, back to v1 beside a hand daemon', async (t) => {
  const s = story(t);
  const pointer = path.join(releasesDir(), 'current');
  let first: { built: boolean; release: { builtAt: string } } | undefined;

  await s.test('v1 is exported, built and checked on a trial store, then pointed at by a relative link', async () => {
    assert.equal(currentRelease(), null, 'no pointer yet');
    const home = '/home/me';
    const { WF_ROOT: _wf, ...person } = ENV;
    fs.rmSync(SEEN, { force: true });
    const done = await run({ tag: 'v1', repo: REPO }, idle().host, {
      ...person,
      HOME: home,
      AE_ROOT: path.join(home, '.agent-engine'),
      HKB_REPO: REPO,
    });
    first = done;
    assert.equal(done.built, true);
    assert.match(done.lines.at(-1) ?? '', /no daemon ticks the store/);
    const seen = JSON.parse(fs.readFileSync(SEEN, 'utf8')) as Record<string, string | null>;
    const building = `^${releasesDir().replaceAll('.', '\\.')}/\\.building-v1-\\d+/trial/`;
    assert.match(seen.WF_ROOT ?? '', new RegExp(`${building}workflows$`), 'WF_ROOT given though the person has none');
    assert.match(seen.AE_ROOT ?? '', new RegExp(`${building}engine$`), "the person's AE_ROOT replaced");
    assert.equal(seen.HKB_REPO, null, 'HKB_REPO taken out');
    assert.equal(fs.readlinkSync(pointer), 'v1', 'a relative link');
    assert.equal(currentRelease()?.commit, V1);
    assert.equal(currentRelease()?.dir, fs.realpathSync(releaseDir('v1')));
    assert.equal(fs.readFileSync(path.join(releaseDir('v1'), 'marker.txt'), 'utf8'), 'one\n', "the tag's tree");
    assert.equal(fs.readFileSync(path.join(releaseDir('v1'), 'built.txt'), 'utf8'), 'built', 'its build ran there');
    assert.equal(fs.existsSync(path.join(releaseDir('v1'), '.git')), false, 'the export holds no repository');
    assert.deepEqual(runningAt(releaseDir('v1')), {
      kind: 'install',
      root: releaseDir('v1'),
      tag: 'v1',
      commit: V1,
      source: REPO,
      builtAt: done.release.builtAt,
    });
    assert.deepEqual(runningAt(REPO), { kind: 'checkout', root: REPO }, 'a root with no release.json is a checkout');
    assert.deepEqual(leftovers(), [], 'the trial store is taken away with the build');
  });

  await s.test(
    'v2 is switched in by a rename, and the service on the pointer paused, waited, signalled, started and resumed in order',
    async () => {
      unitOn(pointer);
      const world: World = { lease: lease(OLD), unitPid: OLD };
      world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
      world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW, 'ticking', true)]), (world.unitPid = NEW));
      const { host, events } = hostOf(world);
      const done = await run({ tag: 'v2', repo: REPO }, host);
      assert.deepEqual(events.slice(0, 4), [
        'pause by nemia upgrade',
        'landings 0',
        `signal ${OLD}`,
        'systemctl --user start nemia.service',
      ]);
      assert.equal(events.at(-1), 'resume');
      assert.equal(done.restart, 'service');
      assert.equal(done.pid, NEW);
      assert.match(done.lines.at(-1) ?? '', new RegExp(`onto v2: the service ticks the store as pid ${NEW}`));
      assert.equal(fs.readlinkSync(pointer), 'v2');
      assert.equal(currentRelease()?.commit, V2);
      const names = fs.readdirSync(releasesDir()).filter((f) => !f.startsWith('.'));
      assert.deepEqual(names.sort(), ['current', 'v1', 'v2'], 'no link of its own left beside the pointer');
      fs.rmSync(UNIT, { force: true });
    },
  );

  await s.test('back to v1 without a rebuild, and a daemon started by hand named and never signalled', async () => {
    const inode = fs.statSync(path.join(releaseDir('v1'), 'release.json')).ino;
    const { host, events } = hostOf({ lease: lease(OLD), unitPid: null });
    const back = await run({ tag: 'v1', repo: REPO }, host);
    assert.equal(back.built, false);
    assert.match(back.lines[0], /without a rebuild/);
    assert.equal(currentRelease()?.tag, 'v1');
    assert.equal(fs.statSync(path.join(releaseDir('v1'), 'release.json')).ino, inode, 'not rebuilt');
    assert.equal(back.release.builtAt, first?.release.builtAt);
    assert.deepEqual(events, [], 'nothing paused nor signalled');
    assert.equal(back.restart, 'hand');
    assert.match(back.lines.at(-2) ?? '', new RegExp(`pid ${OLD} ticks the store`));
    assert.ok(
      (back.lines.at(-1) ?? '').includes(`${path.join(pointer, 'node_modules', '.bin')}/nemia service install --take-over ${OLD}`),
      back.lines.at(-1),
    );
    assert.deepEqual(leftovers(), []);
  });

  await s.test('REFUSED: v2 again once its tag names another commit is a Conflict, and the pointer stays on v1', async () => {
    const moved = tagged('v2', 'two again');
    const { tag, message } = await refusalOf({ tag: 'v2', repo: REPO }, idle().host);
    assert.equal(tag, 'Conflict');
    assert.ok(message.includes(`releases/v2 was built at ${V2.slice(0, 7)}`), message);
    assert.ok(message.includes(moved.slice(0, 7)), message);
    assert.equal(currentRelease()?.commit, V1);
    stand().world.tag(REPO, 'v2', V2);
  });
});

test('REFUSED: an upgrade that cannot build, check or restart changes what it says it does, and nothing else', async (t) => {
  await t.test('a check that fails: the pointer stays, no release nor build folder remains, and the log is kept', async () => {
    await run({ tag: 'v1', repo: REPO }, idle().host);
    tagged('v3', 'three', scripts({ check: 1 }));
    const { tag, message } = await refusalOf({ tag: 'v3', repo: REPO }, idle().host);
    assert.equal(tag, 'Invalid');
    assert.match(message, /npm run release:check exited 1/);
    const log = /read (\S+)\.$/.exec(message)?.[1] ?? '';
    assert.ok(log.startsWith(path.join(releasesDir(), '.logs', 'v3-')) && fs.existsSync(log), log);
    assert.match(fs.readFileSync(log, 'utf8'), /\$ npm ci[\s\S]*\$ npm run build[\s\S]*\$ npm run release:check/);
    assert.equal(currentRelease()?.tag, 'v1');
    assert.equal(fs.existsSync(releaseDir('v3')), false);
    assert.deepEqual(leftovers(), []);
  });

  await t.test('a build that fails beside the service on the pointer: its check never runs, nothing paused nor signalled', async () => {
    unitOn(path.join(ROOT, 'releases', 'current'));
    const { host, events } = hostOf({ lease: lease(OLD), unitPid: OLD });
    tagged('v4', 'four', scripts({ build: 3 }));
    fs.rmSync(SEEN, { force: true });
    const { tag, message } = await refusalOf({ tag: 'v4', repo: REPO }, host);
    assert.equal(tag, 'Invalid');
    assert.match(message, /npm run build exited 3/);
    assert.equal(fs.existsSync(SEEN), false, 'the check did not run');
    assert.deepEqual(events, []);
    assert.equal(readPause(), null, 'no pause put');
    assert.equal(currentRelease()?.tag, 'v1');
    assert.equal(fs.existsSync(releaseDir('v4')), false);
    assert.deepEqual(leftovers(), []);
    fs.rmSync(UNIT, { force: true });
  });

  await t.test('a tag with no release:check script is Invalid, naming the script, and builds nothing', async () => {
    tagged('v5', 'five', scripts({ check: null }));
    const { tag, message } = await refusalOf({ tag: 'v5', repo: REPO }, idle().host);
    assert.equal(tag, 'Invalid');
    assert.match(message, /has no release:check script/);
    assert.equal(fs.existsSync(releaseDir('v5')), false);
  });

  await t.test('a tag the repository lacks is Missing, naming it', async () => {
    const { tag, message } = await refusalOf({ tag: 'v9', repo: REPO }, idle().host);
    assert.equal(tag, 'Missing');
    assert.ok(message.includes(`${REPO} has no tag v9`), message);
  });

  await t.test('a tag no release folder can be named by is Invalid, before anything is built', async () => {
    const { tag, message } = await refusalOf({ tag: '../x', repo: REPO }, idle().host);
    assert.equal(tag, 'Invalid');
    assert.match(message, /is not a tag a release folder/);
    assert.equal(fs.existsSync(path.join(ROOT, 'x')), false);
    assert.deepEqual(leftovers(), []);
  });

  await t.test('a new daemon that ends before its first pass is a Conflict naming its log, and the store stays paused', async () => {
    unitOn(path.join(ROOT, 'releases', 'current'));
    const world: World = { lease: lease(OLD), unitPid: OLD };
    world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
    world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW, 'stopped')]), (world.unitPid = NEW));
    const { host, events } = hostOf(world);
    const { tag, message } = await refusalOf({ tag: 'v2', repo: REPO }, host);
    assert.equal(tag, 'Conflict');
    assert.ok(message.includes(`pid ${NEW}`), message);
    assert.match(message, /journalctl --user -u nemia\.service/);
    assert.match(message, /nemia resume/);
    assert.ok(!events.includes('resume'), events.join('\n'));
    fs.rmSync(UNIT, { force: true });
  });
});

test('the service on a checkout is not restarted: the install line that rewrites it onto the pointer is said', async () => {
  unitOn('/srv/nemia');
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: OLD });
  const done = await run({ tag: 'v2', repo: REPO }, host);
  assert.deepEqual(events, []);
  assert.equal(done.restart, 'hand');
  assert.match(done.lines.at(-1) ?? '', /nemia service install rewrites the service onto releases\/current and restarts it\.$/);
  fs.rmSync(UNIT, { force: true });
});

test("nemia upgrade is classed ask and is the CLI's alone; Nemia's fence asks for it until the person's list grants it", () => {
  const [command] = RELEASES;
  assert.equal(command.name, 'upgrade');
  assert.equal(command.class, 'ask');
  assert.equal(command.writes, true);
  assert.equal(command.only?.side, 'cli');
  const fence = nemiaFence(TABLE);
  assert.ok(fence.ask.includes('Bash(nemia upgrade:*)'), JSON.stringify(fence.ask));
  assert.ok(!fence.allow.some((a) => a.startsWith('Bash(nemia upgrade')), JSON.stringify(fence.allow));
  const granted = widened(fence, ['Bash(nemia upgrade:*)']);
  assert.ok(!granted.ask.includes('Bash(nemia upgrade:*)'), "the person's allow reaches the call");
  assert.ok(nemiaFence(TABLE).allow.includes('Bash(nemia version)'), 'version is a read');
});
