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
    landings: () =>
      Effect.sync(() => {
        events.push('landings 0');
        return [];
      }),
    say: (line) => events.push(`say ${line}`),
    pollMs: 1,
    waitMs: 200,
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

test('two tags: upgraded to v1, then v2, then back to v1 without a rebuild; each pointed at, recorded and running as an install', async () => {
  const first = await run({ tag: 'v1', repo: REPO }, idle().host);
  assert.equal(first.built, true);
  assert.deepEqual(first.lines.slice(1), ['releases/current now names v1', 'no daemon ticks the store: the next one started runs v1']);
  assert.equal(currentRelease()?.tag, 'v1');
  assert.equal(currentRelease()?.commit, V1);
  assert.equal(fs.readFileSync(path.join(releaseDir('v1'), 'marker.txt'), 'utf8'), 'one\n', "the tag's tree");
  assert.equal(fs.readFileSync(path.join(releaseDir('v1'), 'built.txt'), 'utf8'), 'built', 'its build ran there');
  assert.equal(fs.existsSync(path.join(releaseDir('v1'), '.git')), false, 'the export holds no repository');
  assert.deepEqual(runningAt(releaseDir('v1')), {
    kind: 'install',
    root: releaseDir('v1'),
    tag: 'v1',
    commit: V1,
    source: REPO,
    builtAt: first.release.builtAt,
  });
  assert.equal(fs.readlinkSync(path.join(releasesDir(), 'current')), 'v1', 'a relative link');

  await run({ tag: 'v2', repo: REPO }, idle().host);
  assert.equal(currentRelease()?.tag, 'v2');
  assert.equal(currentRelease()?.commit, V2);

  const inode = fs.statSync(path.join(releaseDir('v1'), 'release.json')).ino;
  const back = await run({ tag: 'v1', repo: REPO }, idle().host);
  assert.equal(back.built, false);
  assert.match(back.lines[0], /^v1 is built already at [0-9a-f]{7} .*: switched to it without a rebuild$/);
  assert.equal(currentRelease()?.tag, 'v1');
  assert.equal(fs.statSync(path.join(releaseDir('v1'), 'release.json')).ino, inode, 'not rebuilt');
  assert.equal(back.release.builtAt, first.release.builtAt);
  assert.deepEqual(leftovers(), []);
});

test('REFUSED: a check that fails changes nothing: the pointer stays, no release and no build folder remain, and the log is kept', async () => {
  await run({ tag: 'v1', repo: REPO }, idle().host);
  tagged('v3', 'three', scripts({ check: 1 }));
  const { tag, message } = await refusalOf({ tag: 'v3', repo: REPO }, idle().host);
  assert.equal(tag, 'Invalid');
  const log = /read (\S+)\.$/.exec(message)?.[1] ?? '';
  assert.match(
    message,
    /^nemia upgrade v3: npm run release:check exited 1, so nothing changed and releases\/current stays where it was: read /,
  );
  assert.ok(log.startsWith(path.join(releasesDir(), '.logs', 'v3-')) && fs.existsSync(log), log);
  assert.match(fs.readFileSync(log, 'utf8'), /\$ npm ci[\s\S]*\$ npm run build[\s\S]*\$ npm run release:check/);
  assert.equal(currentRelease()?.tag, 'v1');
  assert.equal(fs.existsSync(releaseDir('v3')), false);
  assert.deepEqual(leftovers(), []);
});

test('REFUSED: a build that fails changes nothing, and its check never runs', async () => {
  await run({ tag: 'v1', repo: REPO }, idle().host);
  tagged('v4', 'four', scripts({ build: 3 }));
  fs.rmSync(SEEN, { force: true });
  const { tag, message } = await refusalOf({ tag: 'v4', repo: REPO }, idle().host);
  assert.equal(tag, 'Invalid');
  assert.match(message, /^nemia upgrade v4: npm run build exited 3, so nothing changed/);
  assert.equal(fs.existsSync(SEEN), false, 'the check did not run');
  assert.equal(currentRelease()?.tag, 'v1');
  assert.equal(fs.existsSync(releaseDir('v4')), false);
  assert.deepEqual(leftovers(), []);
});

test('REFUSED: a tag with no release:check script is Invalid, naming the fix, and builds nothing', async () => {
  tagged('v5', 'five', scripts({ check: null }));
  const { tag, message } = await refusalOf({ tag: 'v5', repo: REPO }, idle().host);
  assert.equal(tag, 'Invalid');
  assert.equal(
    message,
    "nemia upgrade v5: the tag's package.json has no release:check script, so it cannot be checked as a release: tag a commit that has one.",
  );
  assert.equal(fs.existsSync(releaseDir('v5')), false);
});

test('REFUSED: a built tag that now names another commit is a Conflict, and the pointer is unchanged', async () => {
  await run({ tag: 'v2', repo: REPO }, idle().host);
  await run({ tag: 'v1', repo: REPO }, idle().host);
  const moved = tagged('v2', 'two again');
  const { tag, message } = await refusalOf({ tag: 'v2', repo: REPO }, idle().host);
  assert.equal(tag, 'Conflict');
  assert.equal(
    message,
    `nemia upgrade v2: releases/v2 was built at ${V2.slice(0, 7)}, and the tag now names ${moved.slice(0, 7)}: the tag moved. Tag the new commit with a new name.`,
  );
  assert.equal(currentRelease()?.tag, 'v1');
  assert.equal(currentRelease()?.commit, V1);
  stand().world.tag(REPO, 'v2', V2);
});

test('REFUSED: a tag the repository lacks, and a tag that names no release folder, before anything is built', async () => {
  const missing = await refusalOf({ tag: 'v9', repo: REPO }, idle().host);
  assert.equal(missing.tag, 'Missing');
  assert.match(missing.message, new RegExp(`^nemia upgrade v9: ${REPO} has no tag v9`));
  const bad = await refusalOf({ tag: '../x', repo: REPO }, idle().host);
  assert.equal(bad.tag, 'Invalid');
  assert.match(bad.message, /is not a tag a release folder can be named by/);
  assert.equal(fs.existsSync(path.join(ROOT, 'x')), false);
  assert.deepEqual(leftovers(), []);
});

test("a release's checks run on the build's own trial store, never a person's: WF_ROOT and AE_ROOT under the build, HKB_REPO gone", async () => {
  const home = '/home/me';
  tagged('v6', 'six');
  const { WF_ROOT: _wf, AE_ROOT: _ae, ...unset } = ENV;
  for (const env of [
    { ...unset, HOME: home, HKB_REPO: REPO },
    { ...ENV, AE_ROOT: path.join(home, '.agent-engine'), HKB_REPO: REPO },
  ]) {
    fs.rmSync(SEEN, { force: true });
    fs.rmSync(releaseDir('v6'), { recursive: true, force: true });
    await run({ tag: 'v6', repo: REPO }, idle().host, env);
    const seen = JSON.parse(fs.readFileSync(SEEN, 'utf8')) as Record<string, string | null>;
    const building = new RegExp(`^${releasesDir().replaceAll('.', '\\.')}/\\.building-v6-\\d+/trial/`);
    assert.match(seen.WF_ROOT ?? '', new RegExp(`${building.source}workflows$`));
    assert.match(seen.AE_ROOT ?? '', new RegExp(`${building.source}engine$`));
    assert.equal(seen.HKB_REPO, null);
    for (const store of [ROOT, path.join(home, '.agent-workflows'), path.join(home, '.agent-engine')])
      assert.ok(seen.WF_ROOT !== store && seen.AE_ROOT !== store, `${store} handed to the check`);
  }
  assert.deepEqual(leftovers(), [], 'the trial store is taken away with the build');
});

test('the service on releases/current is restarted: paused, landings waited, signalled, started and resumed, in that order', async () => {
  await run({ tag: 'v1', repo: REPO }, idle().host);
  unitOn(path.join(ROOT, 'releases', 'current'));
  const world: World = { lease: lease(OLD), unitPid: OLD };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW, 'ticking', true)]), (world.unitPid = NEW));
  const { host, events } = hostOf(world);
  const done = await run({ tag: 'v2', repo: REPO }, host);
  assert.deepEqual(events, [
    'pause by nemia upgrade',
    'landings 0',
    `signal ${OLD}`,
    'systemctl --user start nemia.service',
    `say pid ${NEW} ticks the store: waiting for its first pass`,
    'resume',
  ]);
  assert.equal(done.restart, 'service');
  assert.equal(done.pid, NEW);
  assert.equal(done.lines.at(-1), `restarted the daemon onto v2: the service ticks the store as pid ${NEW}`);
  assert.equal(currentRelease()?.tag, 'v2');
});

test('REFUSED: an upgrade whose new daemon ends before its first pass is a Conflict naming its log, and the store stays paused', async () => {
  unitOn(path.join(ROOT, 'releases', 'current'));
  const world: World = { lease: lease(OLD), unitPid: OLD };
  world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
  world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW, 'stopped')]), (world.unitPid = NEW));
  const { host, events } = hostOf(world);
  const err = await run({ tag: 'v1', repo: REPO }, host).then(
    () => assert.fail('the upgrade answered'),
    (e: Error) => e,
  );
  assert.equal(err.name, 'Conflict');
  assert.match(err.message, new RegExp(`^nemia upgrade: the daemon started as pid ${NEW} ended before its first pass`));
  assert.match(err.message, /journalctl --user -u nemia\.service/);
  assert.match(err.message, /nemia resume/);
  assert.ok(!events.includes('resume'), events.join('\n'));
});

test('a daemon started by hand is never signalled: it is named, left running, and the take-over line from the installed nemia said', async () => {
  fs.rmSync(UNIT, { force: true });
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: null });
  const done = await run({ tag: 'v1', repo: REPO }, host);
  assert.deepEqual(events, []);
  assert.equal(done.restart, 'hand');
  assert.deepEqual(done.lines.slice(-2), [
    `pid ${OLD} ticks the store and does not run releases/current: it is left running the code it started with.`,
    `To move it onto v1: ${path.join(ROOT, 'releases', 'current', 'node_modules', '.bin')}/nemia service install --take-over ${OLD} hands the store to the service on releases/current.`,
  ]);
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

test('REFUSED: a failed build pauses nothing and signals nothing, even where the service runs the pointer', async () => {
  unitOn(path.join(ROOT, 'releases', 'current'));
  const { host, events } = hostOf({ lease: lease(OLD), unitPid: OLD });
  tagged('v7', 'seven', scripts({ build: 1 }));
  await refusalOf({ tag: 'v7', repo: REPO }, host);
  assert.deepEqual(events, []);
  assert.equal(readPause(), null, 'no pause put');
  fs.rmSync(UNIT, { force: true });
});

test("nemia upgrade is classed prompts and is the CLI's alone; Nemia's fence asks for it until the person's list grants it", () => {
  const [command] = RELEASES;
  assert.equal(command.name, 'upgrade');
  assert.equal(command.nemia, 'prompts');
  assert.equal(command.writes, true);
  assert.equal(command.only?.side, 'cli');
  const fence = nemiaFence(TABLE);
  assert.ok(fence.ask.includes('Bash(nemia upgrade:*)'), JSON.stringify(fence.ask));
  assert.ok(!fence.allow.some((a) => a.startsWith('Bash(nemia upgrade')), JSON.stringify(fence.allow));
  const granted = widened(fence, ['Bash(nemia upgrade:*)']);
  assert.ok(!granted.ask.includes('Bash(nemia upgrade:*)'), "the person's allow reaches the call");
  assert.ok(nemiaFence(TABLE).allow.includes('Bash(nemia version)'), 'version is a read');
});
