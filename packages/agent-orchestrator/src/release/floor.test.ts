/**
 * The store's floor read off a tag: `v1.2.3` and `1.2.3` read as three numbers, anything else as no version, and a tag below the floor
 * refused. The laws of `goingBackRefused` and `floorAfter` are the contract's (`contracts/store-floor.contract.ts`); this holds the parse
 * the upgrade reads a tag with, and the release's own floor as a version a tag names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goingBackRefused, parseVersion, STORE_READABLE_FROM, versionTag } from './floor.ts';

test('a tag reads as its version with or without its v, and a tag that is no version reads as none', () => {
  assert.deepEqual(parseVersion('v1.2.3'), { major: 1, minor: 2, patch: 3 });
  assert.deepEqual(parseVersion('1.20.0'), { major: 1, minor: 20, patch: 0 });
  for (const text of ['v1', 'v1.2', 'v1.2.3-rc.1', 'latest', '', 'v-1.2.3', 'v1.2.3.4']) assert.equal(parseVersion(text), null, text);
  assert.equal(versionTag({ major: 1, minor: 2, patch: 3 }), 'v1.2.3');
});

test('REFUSED: v0.9.0 on a store whose floor is v1.2.0; v1.2.0 and v1.10.0 are allowed, and a store with no floor refuses none', () => {
  const floor = parseVersion('v1.2.0');
  const at = (tag: string) => goingBackRefused(parseVersion(tag) ?? assert.fail(tag), floor);
  assert.equal(at('v0.9.0'), true);
  assert.equal(at('v1.1.9'), true);
  assert.equal(at('v1.2.0'), false);
  assert.equal(at('v1.10.0'), false, 'compared as numbers, never as text');
  assert.equal(goingBackRefused({ major: 0, minor: 1, patch: 0 }, null), false);
});

test("this release's floor names a release a tag can name", () => {
  assert.deepEqual(parseVersion(versionTag(STORE_READABLE_FROM)), STORE_READABLE_FROM);
});
