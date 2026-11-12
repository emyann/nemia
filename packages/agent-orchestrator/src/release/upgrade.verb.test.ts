/**
 * `nemia upgrade` on a scratch store, from a scratch repository whose tags are tiny packages: a `package.json` with a `build` and a
 * `release:check` that are node one-liners and a lockfile with no dependency, so `npm ci` installs nothing and needs no network. Each tag
 * is upgraded to, rolled back to and refused as the command does it, and the daemon restarted through a fake machine: a host whose lease,
 * unit, signal and start are the test's, as `service.verb.test.ts`'s are, so no test starts a service or signals a process. The store is
 * the test's own at `ROOT`, named by `ENV`; the repository is the test place's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { DaemonStanding } from '../daemon/daemon.ts';
import type { Args } from '../command/command.ts';
import type { ServiceHost } from '../service/service.verb.ts';
import { scratch } from 'test-kit/scratch';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { testEngine } from 'agent-runtime/testing';
import { story } from 'test-kit/checkpoints';
import { upgrade, RELEASES } from './upgrade.verb.ts';
import { currentRelease, releaseDir, releasesDir, runningAt } from './release.store.ts';
import { unitText } from '../service/service.ts';
import { readPause } from '../pause/pause.store.ts';
import { runWith as runEngine, engineOf } from '../runtime-client.ts';
import { TABLE } from '../command/commands.verb.ts';
import { nemiaFence, widened } from '../admission/fence.ts';
import type { Readiness, ReadinessPiece } from 'objects';

const ROOT = fs.realpathSync(scratch('wf-upgrade-'));
const place = testPlace();
const stand = () => place;

const HOME = scratch('wf-upgrade-home-');
const UNIT = path.join(HOME, '.config', 'systemd', 'user', 'nemia.service');
const OLD = 4242;
const NEW = 5151;

/**
 * The environment the test's store is named by and a release's commands are handed: the store at `ROOT`, npm quiet and offline, and a
 * file the fixture's check writes what it saw into.
 */
const SEEN = path.join(scratch('wf-upgrade-seen-'), 'env.json');
const ENV: NodeJS.ProcessEnv = {
  ...process.env,
  WF_ROOT: ROOT,
  WF_VERIFY_REST: '1',
  WF_MAX_RUNS: undefined,
  WF_MAX_CONCURRENT: undefined,
  npm_config_audit: 'false',
  npm_config_fund: 'false',
  npm_config_update_notifier: 'false',
  npm_config_offline: 'true',
  SEEN_FILE: SEEN,
};
const runWith = runOver(runEngine, () => stand().layer, ENV);

/** The check a tag's `release:check` runs: it writes the stores it was handed into `SEEN_FILE`, then exits `exit`. */
const CHECK = (exit: number) =>
  `node -e "require('fs').writeFileSync(process.env.SEEN_FILE, JSON.stringify({WF_ROOT: process.env.WF_ROOT, AE_ROOT: process.env.AE_ROOT, HKB_REPO: process.env.HKB_REPO ?? null})); process.exit(${exit})"`;

/**
 * The scripts of a fixture tag: a build that writes `built.txt` and puts the tag's `nemia.sh` as the tree's npm bin `nemia`, as a
 * release's build links the CLI, and a check, each exiting as said.
 */
const scripts = ({ build = 0, check = 0 }: { build?: number; check?: number | null } = {}): Record<string, string> => ({
  build: `node -e "const fs = require('fs'); fs.writeFileSync('built.txt', 'built'); fs.mkdirSync('node_modules/.bin', { recursive: true }); fs.copyFileSync('nemia.sh', 'node_modules/.bin/nemia'); fs.chmodSync('node_modules/.bin/nemia', 0o755); process.exit(${build})"`,
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

/** The file the fixture's `nemia` appends each command it was given to, with the store it was given. */
const CARRIED = path.join(scratch('wf-upgrade-carried-'), 'carried.txt');

/**
 * The readiness read the fixture's `nemia doctor --json` prints, as the new release's daemon would answer it: every piece in place
 * unless a test writes another (`readAs`).
 */
/** The last line the fixture's carry prints when it fails, which the upgrade's refusal names. */
const CARRY_FAILED = 'Claude Code 9.9.9 did not install (exit 1)';

const READ = path.join(scratch('wf-upgrade-read-'), 'readiness.json');
const readAs = (read: Readiness): void => fs.writeFileSync(READ, JSON.stringify(read));
readAs({ ready: true, pieces: [] });

/**
 * Commits a fixture package with `scripts` and `marker` in it, and a `nemia.sh` that appends its arguments and `WF_ROOT` to `CARRIED`,
 * refuses `--local` with exit 2 on every verb as a release's cli does, and exits `carry`, its last line `CARRY_FAILED` where not 0 — or,
 * asked `doctor --json`, prints `READ` and exits 1, as `nemia doctor` exits while a run waits —, tags it `tag`, and answers the commit.
 */
function tagged(tag: string, marker: string, given: Record<string, string> = scripts(), carry = 0): string {
  fs.writeFileSync(
    path.join(REPO, 'package.json'),
    `${JSON.stringify({ name: 'fx', version: '1.0.0', private: true, scripts: given }, null, 2)}\n`,
  );
  fs.writeFileSync(path.join(REPO, 'marker.txt'), `${marker}\n`);
  fs.writeFileSync(
    path.join(REPO, 'nemia.sh'),
    `#!/bin/sh\necho "$* $WF_ROOT" >> '${CARRIED}'\nfor word in "$@"; do if [ "$word" = --local ]; then echo '--local reads no store in process any more' >&2; exit 2; fi; done\nif [ "$1 $2" = "doctor --json" ]; then echo "context $NEMIA_CONTEXT" >> '${CARRIED}'; cat '${READ}'; exit 1; fi\necho 'carrying the harnesses'\nif [ ${carry} -ne 0 ]; then echo '${CARRY_FAILED}' >&2; fi\nexit ${carry}\n`,
  );
  const commit = stand().world.commit(REPO, marker);
  stand().world.tag(REPO, tag, commit);
  return commit;
}

/**
 * The fake machine's world: the lease, the leases read after it in turn (`later`), the unit's main process, and what a signal and a start
 * change. As systemd does, a signal to the unit's main process ends it, clearing `unitPid`.
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

/** A host over `world` that logs, in order, every program it calls, the pause, the signal and what it says. */
function hostOf(world: World): { host: ServiceHost; events: string[] } {
  const events: string[] = [];
  const host: ServiceHost = {
    machine: () => ({ platform: 'linux', wsl: true, systemd: true }),
    dirs: () => ({ home: HOME, configHome: path.join(HOME, '.config') }),
    roots: () => ({ root: ROOT, defaultRoot: ROOT }),
    daemon: () => ({ checkout: '/srv/nemia', entry: '/srv/nemia/apps/api/src/main.ts', cwd: '/srv/nemia/apps/api' }),
    size: () => ({ memoryMiB: 16384, cpus: 8 }),
    node: '/usr/bin/node',
    path: '/usr/bin:/bin',
    user: () => ({ name: 'ann', uid: 1000 }),
    call: (argv) => {
      if (argv.includes('show'))
        return `ActiveState=${world.unitPid === null ? 'inactive' : 'active'}\nUnitFileState=enabled\nMainPID=${world.unitPid ?? 0}\n`;
      events.push(argv.join(' '));
      if (argv[2] === 'start') world.onStart?.();
      return '';
    },
    linger: () => true,
    standing: () => null,
    lease: () => {
      const read = world.lease;
      world.lease = world.later?.shift() ?? world.lease;
      return read;
    },
    signal: (pid) => {
      events.push(`signal ${pid}`);
      if (world.unitPid === pid) world.unitPid = null;
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
    say: (line) => events.push(`say ${line}`),
    pollMs: 1,
    waitMs: 200,
    timeoutMs: 200,
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

const engine = eachTest(testEngine);

/** A pid no process has: past the highest Linux allows (2^22) and macOS's. */
const DEAD = 4_194_305;
const run = (args: Args, host: ServiceHost, env: NodeJS.ProcessEnv = ENV) => runWith(engineOf(engine().layer), upgrade(args, host, env));

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
const leftovers = (): string[] => fs.readdirSync(releasesDir(ROOT)).filter((f) => f.startsWith('.') && f !== '.logs');

const V1 = tagged('v1', 'one');
const V2 = tagged('v2', 'two');

test('two tags: v1 built on its trial store, v2 switched in with the service on the pointer restarted, back to v1 beside a hand daemon', async (t) => {
  const s = story(t);
  const pointer = path.join(releasesDir(ROOT), 'current');
  let first: { built: boolean; release: { builtAt: string } } | undefined;

  await s.test('v1 is exported, built and checked on a trial store, then pointed at by a relative link', async () => {
    assert.equal(currentRelease(ROOT), null, 'no pointer yet');
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
    const building = `^${releasesDir(ROOT).replaceAll('.', '\\.')}/\\.building-v1-\\d+/trial/`;
    assert.match(seen.WF_ROOT ?? '', new RegExp(`${building}workflows$`), 'WF_ROOT given though the person has none');
    assert.match(seen.AE_ROOT ?? '', new RegExp(`${building}engine$`), "the person's AE_ROOT replaced");
    assert.equal(seen.HKB_REPO, null, 'HKB_REPO taken out');
    assert.equal(fs.readlinkSync(pointer), 'v1', 'a relative link');
    assert.equal(currentRelease(ROOT)?.commit, V1);
    assert.equal(currentRelease(ROOT)?.dir, fs.realpathSync(releaseDir('v1', ROOT)));
    assert.equal(fs.readFileSync(path.join(releaseDir('v1', ROOT), 'marker.txt'), 'utf8'), 'one\n', "the tag's tree");
    assert.equal(fs.readFileSync(path.join(releaseDir('v1', ROOT), 'built.txt'), 'utf8'), 'built', 'its build ran there');
    assert.equal(fs.existsSync(path.join(releaseDir('v1', ROOT), '.git')), false, 'the export holds no repository');
    assert.deepEqual(runningAt(releaseDir('v1', ROOT)), {
      kind: 'install',
      root: releaseDir('v1', ROOT),
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
      assert.deepEqual(events.slice(0, 3), ['pause by nemia upgrade', `signal ${OLD}`, 'systemctl --user start nemia.service']);
      assert.equal(events.at(-1), 'resume');
      assert.equal(done.restart, 'service');
      assert.equal(done.pid, NEW);
      assert.match(done.lines.at(-1) ?? '', new RegExp(`onto v2: the service ticks the store as pid ${NEW}`));
      assert.equal(fs.readlinkSync(pointer), 'v2');
      assert.equal(currentRelease(ROOT)?.commit, V2);
      const names = fs.readdirSync(releasesDir(ROOT)).filter((f) => !f.startsWith('.'));
      assert.deepEqual(names.sort(), ['current', 'v1', 'v2'], 'no link of its own left beside the pointer');
      fs.rmSync(UNIT, { force: true });
    },
  );

  await s.test('back to v1 without a rebuild, and a daemon started by hand named and never signalled', async () => {
    const inode = fs.statSync(path.join(releaseDir('v1', ROOT), 'release.json')).ino;
    const { host, events } = hostOf({ lease: lease(OLD), unitPid: null });
    const back = await run({ tag: 'v1', repo: REPO }, host);
    assert.equal(back.built, false);
    assert.match(back.lines[0], /without a rebuild/);
    assert.equal(currentRelease(ROOT)?.tag, 'v1');
    assert.equal(fs.statSync(path.join(releaseDir('v1', ROOT), 'release.json')).ino, inode, 'not rebuilt');
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
    assert.equal(currentRelease(ROOT)?.commit, V1);
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
    assert.ok(log.startsWith(path.join(releasesDir(ROOT), '.logs', 'v3-')) && fs.existsSync(log), log);
    assert.match(fs.readFileSync(log, 'utf8'), /\$ npm ci[\s\S]*\$ npm run build[\s\S]*\$ npm run release:check/);
    assert.equal(currentRelease(ROOT)?.tag, 'v1');
    assert.equal(fs.existsSync(releaseDir('v3', ROOT)), false);
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
    assert.equal(readPause(ROOT), null, 'no pause put');
    assert.equal(currentRelease(ROOT)?.tag, 'v1');
    assert.equal(fs.existsSync(releaseDir('v4', ROOT)), false);
    assert.deepEqual(leftovers(), []);
    fs.rmSync(UNIT, { force: true });
  });

  await t.test('a tag with no release:check script is Invalid, naming the script, and builds nothing', async () => {
    tagged('v5', 'five', scripts({ check: null }));
    const { tag, message } = await refusalOf({ tag: 'v5', repo: REPO }, idle().host);
    assert.equal(tag, 'Invalid');
    assert.match(message, /has no release:check script/);
    assert.equal(fs.existsSync(releaseDir('v5', ROOT)), false);
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

test('an upgrade removes the releases no one needs: not the two newest, not one a session runs on, nothing while a build is under way', async (t) => {
  const s = story(t);
  const e = () => engineOf(engine().layer);
  const runOn = (args: Args) => runWith(e(), upgrade(args, idle().host, ENV));
  const installed = () =>
    fs
      .readdirSync(releasesDir(ROOT))
      .filter((f) => !f.startsWith('.') && f !== 'current')
      .sort();
  await run({ tag: 'v1', repo: REPO }, idle().host);
  await run({ tag: 'v2', repo: REPO }, idle().host);
  tagged('v6', 'six');
  tagged('v7', 'seven');
  tagged('v8', 'eight');

  await s.test('v6 built after v1 and v2 removes v1, which is neither of the two newest nor run on', async () => {
    const done = await runOn({ tag: 'v6', repo: REPO });
    assert.deepEqual(done.removed, ['v1']);
    assert.equal(fs.existsSync(releaseDir('v1', ROOT)), false);
    assert.ok(
      done.lines.some((l) => /\bv1\b/.test(l) && l !== done.lines[0]),
      done.lines.join('\n'),
    );
    assert.deepEqual(installed(), ['v2', 'v6']);
  });

  await s.test('a session at work on v2 keeps it when v7 makes it the oldest', async () => {
    const engineNow = e();
    await Effect.runPromise(engineNow.file({ id: 'on-v2', brief: 'b', cwd: '/r', harness: 'claude' }));
    engine().settle('on-v2', 'working', { image: path.join(fs.realpathSync(releasesDir(ROOT)), 'v2', 'packages', 'agent-runtime') });
    const done = await runWith(engineNow, upgrade({ tag: 'v7', repo: REPO }, idle().host, ENV));
    assert.deepEqual(done.removed, []);
    assert.deepEqual(installed(), ['v2', 'v6', 'v7']);
  });

  await s.test('a build under way in another upgrade holds every removal', async () => {
    const building = path.join(releasesDir(ROOT), `.building-vx-${process.pid}`);
    fs.mkdirSync(building);
    try {
      const done = await runOn({ tag: 'v8', repo: REPO });
      assert.deepEqual(done.removed, []);
      assert.deepEqual(installed(), ['v2', 'v6', 'v7', 'v8']);
    } finally {
      fs.rmSync(building, { recursive: true, force: true });
    }
  });

  await s.test('once nothing holds, a rollback to v7 removes v2 and v6', async () => {
    engine().settle('on-v2', 'succeeded', {});
    const done = await runOn({ tag: 'v7', repo: REPO });
    assert.equal(done.built, false);
    assert.deepEqual([...done.removed].sort(), ['v2', 'v6']);
    assert.deepEqual(installed(), ['v7', 'v8']);
    assert.deepEqual(leftovers(), []);
  });

  await s.test(
    "a crashed upgrade's build folder is removed by the next upgrade, which says so, and only a log over 30 days old goes",
    async () => {
      const crashed = path.join(releasesDir(ROOT), `.building-v9-${DEAD}`);
      fs.mkdirSync(path.join(crashed, 'trial', 'engine'), { recursive: true });
      const logs = path.join(releasesDir(ROOT), '.logs');
      const old = path.join(logs, 'v9-old.log');
      fs.writeFileSync(old, 'npm ci\n');
      const longAgo = (Date.now() - 31 * 24 * 60 * 60 * 1000) / 1000;
      fs.utimesSync(old, longAgo, longAgo);
      const fresh = fs.readdirSync(logs).filter((name) => name !== 'v9-old.log');
      assert.ok(fresh.length > 0, 'the builds before wrote their logs');
      const done = await runOn({ tag: 'v8', repo: REPO });
      assert.equal(fs.existsSync(crashed), false);
      assert.ok(
        done.lines.some((l) => l.includes(`.building-v9-${DEAD}`)),
        done.lines.join('\n'),
      );
      assert.ok(
        done.lines.some((l) => l.includes('v9-old.log')),
        done.lines.join('\n'),
      );
      assert.deepEqual(fs.readdirSync(logs).sort(), [...fresh].sort(), "a fresh log, a failed build's among them, is kept");
      assert.deepEqual(leftovers(), []);
    },
  );
});

test("the new tree's nemia doctor carry runs on the store before the switch: its failure switches nothing, its pass switches", async (t) => {
  const s = story(t);
  const before = currentRelease(ROOT)?.tag;

  await s.test('a carry that exits 1 is Invalid, and releases/current stays where it was with no release placed', async () => {
    tagged('v10', 'ten', scripts(), 1);
    fs.rmSync(CARRIED, { force: true });
    const { tag, message } = await refusalOf({ tag: 'v10', repo: REPO }, idle().host);
    assert.equal(tag, 'Invalid');
    assert.ok(message.includes(CARRY_FAILED), `the carry's last line is said beside the log: ${message}`);
    assert.equal(currentRelease(ROOT)?.tag, before);
    assert.equal(fs.existsSync(releaseDir('v10', ROOT)), false);
    assert.deepEqual(leftovers(), []);
    assert.deepEqual(fs.readFileSync(CARRIED, 'utf8').trim().split('\n'), [`doctor carry ${ROOT}`], 'run once, on the store');
  });

  await s.test('a carry that exits 0, from a tree whose cli refuses --local on every verb, lets the upgrade switch to it', async () => {
    tagged('v11', 'eleven');
    fs.rmSync(CARRIED, { force: true });
    const done = await run({ tag: 'v11', repo: REPO }, idle().host);
    assert.equal(done.built, true);
    assert.equal(currentRelease(ROOT)?.tag, 'v11');
    assert.deepEqual(fs.readFileSync(CARRIED, 'utf8').trim().split('\n'), [`doctor carry ${ROOT}`]);
  });
});

test('an upgrade onto a release whose read is not ready says each missing piece a run waits on and its fix, and still succeeds', async (t) => {
  const s = story(t);
  const pointer = path.join(releasesDir(ROOT), 'current');
  const onPointer = () => {
    unitOn(pointer);
    const world: World = { lease: lease(OLD), unitPid: OLD };
    world.onSignal = () => (world.lease = lease(OLD, 'stopped'));
    world.onStart = () => ((world.lease = lease(NEW)), (world.later = [lease(NEW, 'ticking', true)]), (world.unitPid = NEW));
    return hostOf(world).host;
  };
  const piece = (name: string): ReadinessPiece => ({
    name,
    area: 'workflow',
    state: 'missing',
    message: `${name} is not installed`,
    fixes: [{ message: `install ${name}`, command: `nemia doctor fix ${name} --factory nemia --workflow quick`, startable: true }],
    factory: 'nemia',
    workflow: 'quick',
    cost: 'run',
  });
  const linger: ReadinessPiece = {
    name: 'linger',
    area: 'service',
    state: 'missing',
    message: 'stops at logout',
    fixes: [],
    cost: 'server',
  };
  tagged('v12', 'twelve');
  tagged('v13', 'thirteen');

  await s.test(
    'restarted onto a release that reads two pieces missing: each is said with its fix, after the restart, and it succeeds',
    async () => {
      readAs({ ready: false, pieces: [piece('mise'), piece('repository-toolchain'), linger] });
      fs.rmSync(CARRIED, { force: true });
      try {
        const done = await run({ tag: 'v12', repo: REPO }, onPointer());
        assert.equal(done.restart, 'service');
        assert.ok(fs.readFileSync(CARRIED, 'utf8').includes(`doctor --json ${ROOT}`), 'the new release read the store');
        const after = done.lines.slice(done.lines.findIndex((l) => l.includes(`ticks the store as pid ${NEW}`)) + 1);
        assert.match(after[0] ?? '', /not ready/, after.join('\n'));
        for (const name of ['mise', 'repository-toolchain'])
          assert.ok(
            after.some((l) => l.includes(`nemia doctor fix ${name} --factory nemia --workflow quick`)),
            `${name}'s fix: ${after.join('\n')}`,
          );
        assert.ok(!after.some((l) => l.includes('linger')), 'a piece no run waits on is left to nemia doctor');
      } finally {
        readAs({ ready: true, pieces: [] });
        fs.rmSync(UNIT, { force: true });
      }
    },
  );

  await s.test(
    "a person whose context is a remote server still has this machine's store read: the read runs under the context local",
    async () => {
      fs.rmSync(CARRIED, { force: true });
      try {
        await run({ tag: 'v13', repo: REPO }, onPointer(), { ...ENV, NEMIA_CONTEXT: 'far-away' });
        const said = fs.readFileSync(CARRIED, 'utf8').trim().split('\n');
        assert.ok(said.includes(`doctor --json ${ROOT}`), said.join('\n'));
        assert.ok(said.includes('context local'), said.join('\n'));
      } finally {
        fs.rmSync(UNIT, { force: true });
      }
    },
  );

  await s.test('restarted onto a release that reads ready: nothing more is said than the restart', async () => {
    try {
      const done = await run({ tag: 'v13', repo: REPO }, onPointer());
      const restart = done.lines.findIndex((l) => l.includes(`onto v13: the service ticks the store as pid ${NEW}`));
      assert.ok(restart > 0, done.lines.join('\n'));
      assert.ok(
        done.lines.slice(restart + 1).every((l) => l.startsWith('removed ')),
        `only the retention's removals follow the restart: ${done.lines.join('\n')}`,
      );
    } finally {
      fs.rmSync(UNIT, { force: true });
    }
  });

  await s.test(
    "a read the server refused, the client's token missing, says no run is held: one line naming the token's fix, and it succeeds",
    async () => {
      const client = (name: string, cost: ReadinessPiece['cost'], command?: string): ReadinessPiece => ({
        name,
        area: 'client',
        state: 'missing',
        message: `${name} is missing`,
        fixes: command === undefined ? [] : [{ message: `${name} is missing`, command, startable: false }],
        cost,
      });
      readAs({
        ready: false,
        pieces: [
          client('token-accepted', 'run', 'nemia config set-context local --token-file <file>'),
          client('local-bin-on-path', 'client'),
        ],
      });
      try {
        const done = await run({ tag: 'v13', repo: REPO }, onPointer());
        const restart = done.lines.findIndex((l) => l.includes(`onto v13: the service ticks the store as pid ${NEW}`));
        const after = done.lines.slice(restart + 1).filter((l) => !l.startsWith('removed '));
        assert.equal(after.length, 1, after.join('\n'));
        assert.ok(after[0]?.includes('nemia config set-context local --token-file'), after[0]);
        assert.doesNotMatch(after[0] ?? '', /not ready|held/, 'no run is said held on a piece of the client');
      } finally {
        readAs({ ready: true, pieces: [] });
        fs.rmSync(UNIT, { force: true });
      }
    },
  );

  await s.test('a read that does not answer is one line naming nemia doctor, and the upgrade still succeeds', async () => {
    fs.writeFileSync(READ, 'not json');
    try {
      const done = await run({ tag: 'v12', repo: REPO }, onPointer());
      const restart = done.lines.findIndex((l) => l.includes(`onto v12: the service ticks the store as pid ${NEW}`));
      assert.match(done.lines[restart + 1] ?? '', /nemia doctor\b/, done.lines.join('\n'));
    } finally {
      readAs({ ready: true, pieces: [] });
      fs.rmSync(UNIT, { force: true });
    }
  });
});

test("`nemia upgrade --help` says it upgrades this machine's install, and names `nemia server upgrade` for the server a context names", () => {
  const help = (RELEASES.find((c) => c.name === 'upgrade')?.help ?? []).join(' ');
  assert.match(help, /nemia server upgrade/);
  assert.match(help, /nemia service/, "kept apart from this machine's login unit");
});
