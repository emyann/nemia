/**
 * The store's releases on disk where no upgrade leads: a pointer at nothing or at a half-written release, a release placed once, and
 * what the retention reads and removes: the installed releases, a build under way, and a release moved aside.
 * The pointer's switch, an install read back and a build's trial store are `upgrade.verb.test.ts`'s story. Each on a scratch
 * store of its own, passed as the root, so no test reads `WF_ROOT`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { ReleaseFile } from './release.ts';
import {
  asideLeftover,
  buildLogs,
  buildUnderWay,
  currentRelease,
  installedReleases,
  leftRemovals,
  pidEntries,
  placeRelease,
  releaseDir,
  releaseFileOf,
  releasesDir,
  removeRelease,
  switchCurrent,
  trialEnv,
  writeReleaseFile,
} from './release.store.ts';

/** What a release of `tag` says, built from `/src`. */
const fileOf = (tag: string): ReleaseFile => ({ tag, commit: `${tag}0000000000`, source: '/src', builtAt: '2026-10-06T07:00:00.000Z' });

/** A store with a built release of each tag, and no pointer. */
function storeWith(...tags: string[]): string {
  const root = scratch('wf-release-store-');
  for (const tag of tags) {
    fs.mkdirSync(releaseDir(tag, root), { recursive: true });
    writeReleaseFile(releaseDir(tag, root), fileOf(tag));
  }
  return root;
}

test('no release is current where there is no pointer, it names nothing, or it names a folder with no release.json that reads', () => {
  const root = storeWith('v1');
  assert.equal(currentRelease(root), null, 'no pointer');
  assert.equal(currentRelease(scratch('wf-release-none-')), null, 'no releases/');
  switchCurrent('gone', root);
  assert.equal(currentRelease(root), null, 'a pointer at nothing');
  fs.mkdirSync(releaseDir('half', root));
  switchCurrent('half', root);
  assert.equal(currentRelease(root), null, 'a folder with no release.json');
  fs.writeFileSync(path.join(releaseDir('half', root), 'release.json'), '{"tag": "half"}');
  assert.equal(currentRelease(root), null, 'a release.json without its commit');
  assert.equal(releaseFileOf(releaseDir('half', root)), undefined);
});

test('REFUSED: a release placed where one of its tag is already moves nothing; the first is placed', () => {
  const root = storeWith('v1');
  const tree = scratch('wf-release-tree-');
  fs.writeFileSync(path.join(tree, 'mark'), 'new');
  assert.equal(placeRelease(tree, 'v1', root), false);
  assert.ok(fs.existsSync(path.join(tree, 'mark')), 'the tree stays where it was');
  assert.equal(releaseFileOf(releaseDir('v1', root))?.commit, fileOf('v1').commit, 'the release there is unchanged');
  assert.equal(placeRelease(tree, 'v2', root), true);
  assert.ok(fs.existsSync(path.join(releaseDir('v2', root), 'mark')));
});

test("a build's commands get its trial store for WF_ROOT and AE_ROOT and no HKB_REPO, whatever the person's environment names", () => {
  const person = {
    PATH: '/bin',
    HOME: '/home/me',
    WF_ROOT: '/home/me/.agent-workflows',
    AE_ROOT: '/home/me/.agent-engine',
    HKB_REPO: '/r',
  };
  assert.deepEqual(trialEnv(person, '/b/trial'), {
    PATH: '/bin',
    HOME: '/home/me',
    WF_ROOT: '/b/trial/workflows',
    AE_ROOT: '/b/trial/engine',
  });
  assert.deepEqual(trialEnv({ PATH: '/bin' }, '/b/trial'), { PATH: '/bin', WF_ROOT: '/b/trial/workflows', AE_ROOT: '/b/trial/engine' });
});

test('the installed releases are the folders under releases/ with a release.json that reads, and nothing else there', () => {
  const root = storeWith('v1', 'v2');
  switchCurrent('v2', root);
  fs.mkdirSync(path.join(releasesDir(root), '.logs'));
  fs.mkdirSync(path.join(releasesDir(root), '.building-x-1'));
  writeReleaseFile(path.join(releasesDir(root), '.building-x-1'), fileOf('x'));
  fs.mkdirSync(releaseDir('bare', root));
  fs.symlinkSync('v1', path.join(releasesDir(root), 'alias'));
  assert.deepEqual(
    installedReleases(root)
      .map((r) => r.tag)
      .sort(),
    ['v1', 'v2'],
  );
  assert.equal(installedReleases(root)[0]?.builtAt, fileOf('v1').builtAt);
  assert.deepEqual(installedReleases(scratch('wf-release-none-')), [], 'no releases/ at all');
});

/** The pids a test says are live processes. */
const LIVE = 4242;
const live = (pid: number): boolean => pid === LIVE;

test('a build is under way while the process its folder names lives, and not once it has exited', () => {
  const root = storeWith('v1');
  assert.equal(buildUnderWay(root, live), false, 'no build folder');
  fs.mkdirSync(path.join(releasesDir(root), '.building-v9-4141'));
  assert.equal(buildUnderWay(root, live), false, 'a pid that has exited');
  fs.mkdirSync(path.join(releasesDir(root), `.building-v9-${LIVE}`));
  assert.equal(buildUnderWay(root, live), true, 'a live pid');
});

test('REFUSED: a release is not removed while the pointer names it or a build is under way; else it is moved aside, then listed', () => {
  const root = storeWith('v1', 'v2');
  switchCurrent('v2', root);
  assert.equal(removeRelease(root, 'v2', live), false, 'the current');
  assert.ok(fs.existsSync(releaseDir('v2', root)));
  const building = path.join(releasesDir(root), `.building-v3-${LIVE}`);
  fs.mkdirSync(building);
  assert.equal(removeRelease(root, 'v1', live), false, 'a build under way');
  assert.ok(fs.existsSync(releaseDir('v1', root)));
  fs.rmSync(building, { recursive: true });
  const aside = removeRelease(root, 'v1', live);
  assert.equal(aside, path.join(releasesDir(root), `.removing-v1-${process.pid}`));
  assert.equal(fs.existsSync(releaseDir('v1', root)), false);
  assert.deepEqual(leftRemovals(root), [aside]);
  assert.deepEqual(
    installedReleases(root).map((r) => r.tag),
    ['v2'],
    'a release moved aside is no installed one',
  );
});

test("the pid-named entries under releases/ are each build's folder and each pointer link made beside current, by whether its process lives", () => {
  const root = storeWith('v1');
  switchCurrent('v1', root);
  const releases = releasesDir(root);
  fs.mkdirSync(path.join(releases, '.building-v9-4141'));
  fs.mkdirSync(path.join(releases, `.building-v9-${LIVE}`));
  fs.symlinkSync('v1', path.join(releases, '.current-4141'));
  fs.mkdirSync(path.join(releases, '.building-v9-abc'));
  fs.mkdirSync(path.join(releases, '.logs'));
  fs.mkdirSync(path.join(releases, '.removing-v1-1'));
  assert.deepEqual(
    pidEntries(root, live).sort((a, b) => (a.name < b.name ? -1 : 1)),
    [
      { name: '.building-v9-4141', live: false },
      { name: `.building-v9-${LIVE}`, live: true },
      { name: '.current-4141', live: false },
    ],
  );
  assert.deepEqual(pidEntries(scratch('wf-release-none-'), live), [], 'no releases/ folder');
});

test("a leftover is moved aside with what it holds, once; a pointer link is moved as a link, and the release it named stands", () => {
  const root = storeWith('v1');
  const releases = releasesDir(root);
  const dead = path.join(releases, '.building-v9-4141');
  fs.mkdirSync(path.join(dead, 'tree'), { recursive: true });
  fs.mkdirSync(path.join(dead, 'trial', 'engine'), { recursive: true });
  const aside = asideLeftover(root, '.building-v9-4141');
  assert.equal(aside, path.join(releases, `.removing-.building-v9-4141-${process.pid}`));
  assert.ok(fs.existsSync(path.join(releases, `.removing-.building-v9-4141-${process.pid}`, 'trial', 'engine')));
  assert.equal(fs.existsSync(dead), false);
  assert.equal(asideLeftover(root, '.building-v9-4141'), false, 'gone already');
  fs.symlinkSync('v1', path.join(releases, '.current-4141'));
  const link = asideLeftover(root, '.current-4141');
  assert.ok(link !== false && fs.lstatSync(link).isSymbolicLink());
  assert.deepEqual(leftRemovals(root).sort(), [aside, link].sort());
  for (const dir of leftRemovals(root)) fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(fs.existsSync(path.join(releaseDir('v1', root), 'release.json')), 'deleting the link leaves the release it named');
});

test("the build logs are each file under releases/.logs with when it was last written, in whole milliseconds; none with no folder", () => {
  const root = storeWith();
  assert.deepEqual(buildLogs(root), [], 'no releases/ folder');
  const logs = path.join(releasesDir(root), '.logs');
  fs.mkdirSync(path.join(logs, 'not-a-log'), { recursive: true });
  fs.writeFileSync(path.join(logs, 'v1-a.log'), 'npm ci\n');
  fs.utimesSync(path.join(logs, 'v1-a.log'), 1_700_000_000.5, 1_700_000_000.5);
  assert.deepEqual(buildLogs(root), [{ name: 'v1-a.log', modifiedMs: 1_700_000_000_500 }]);
});
