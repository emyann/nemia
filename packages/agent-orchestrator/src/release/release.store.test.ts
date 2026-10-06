/**
 * The store's releases on disk: the pointer, a release's `release.json`, the code a root holds, a build's trial environment, and a
 * release placed once. Each on a scratch store of its own, passed as the root, so no test reads `WF_ROOT`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { ReleaseFile } from './release.ts';
import {
  currentRelease,
  placeRelease,
  releaseDir,
  releaseFileOf,
  releasesDir,
  runningAt,
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

test('the pointer is a relative link, switched by a rename: it names each release in turn and leaves no link of its own beside it', () => {
  const root = storeWith('v1', 'v2');
  const pointer = path.join(releasesDir(root), 'current');
  switchCurrent('v1', root);
  assert.equal(fs.readlinkSync(pointer), 'v1');
  assert.deepEqual(currentRelease(root), { ...fileOf('v1'), dir: fs.realpathSync(releaseDir('v1', root)) });
  switchCurrent('v2', root);
  assert.equal(fs.readlinkSync(pointer), 'v2');
  assert.equal(currentRelease(root)?.tag, 'v2');
  assert.deepEqual(fs.readdirSync(releasesDir(root)).sort(), ['current', 'v1', 'v2']);
});

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

test('a root with a release.json is an install, with what it says; any other root is a checkout', () => {
  const root = storeWith('v1');
  assert.deepEqual(runningAt(releaseDir('v1', root)), { kind: 'install', root: releaseDir('v1', root), ...fileOf('v1') });
  assert.deepEqual(runningAt(root), { kind: 'checkout', root });
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
