/**
 * The store's releases on disk where no upgrade leads: a pointer at nothing or at a half-written release, and a release placed once.
 * The pointer's switch, an install read back and a build's trial store are `upgrade.verb.test.ts`'s story. Each on a scratch
 * store of its own, passed as the root, so no test reads `WF_ROOT`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import type { ReleaseFile } from './release.ts';
import { currentRelease, placeRelease, releaseDir, releaseFileOf, switchCurrent, writeReleaseFile } from './release.store.ts';

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
