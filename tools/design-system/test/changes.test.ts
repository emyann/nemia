/**
 * What a build says changed against the last one (`src/manifest/manifest.ts`): the fold of `fileChange` over every path of both
 * manifests, which the contract leaves to a test, and the last lines a person's session reads to publish only those files.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { changeLines, changesSince, lastManifest, manifestOf, recordManifest, type Manifest } from '../src/manifest/manifest.ts';

const at = (sha256: string) => ({ sha256, bytes: 1 });

test('a path only this build holds is added, one whose bytes moved changed, one gone removed, and one the same in none', () => {
  const before: Manifest = { a: at('1'), b: at('2'), c: at('3') };
  const after: Manifest = { b: at('2b'), c: at('3'), d: at('4'), aa: at('5') };
  assert.deepEqual(changesSince(before, after), { added: ['aa', 'd'], changed: ['b'], removed: ['a'] });
});

test('with no last build every path is added', () => {
  assert.deepEqual(changesSince({}, { 'x/y': at('1'), a: at('2') }), { added: ['a', 'x/y'], changed: [], removed: [] });
});

test('the last lines say the three counts, then each path under its change', () => {
  const lines = changeLines({ added: ['d'], changed: ['b'], removed: ['a'] }, 'the last build');
  assert.match(lines[0] ?? '', /1 added, 1 changed, 1 removed/);
  assert.deepEqual(lines.slice(1), ['  added d', '  changed b', '  removed a']);
});

test("the last build is its folder's manifest, or its project's files hashed when it wrote none, and nothing when there is none", () => {
  const root = scratch('design-system-changes');
  const project = path.join(root, 'download', 'project');
  fs.mkdirSync(path.join(project, 'components'), { recursive: true });
  fs.writeFileSync(path.join(project, 'components', 'bundle.js'), 'x');
  const hashed = lastManifest(path.join(root, 'download'));
  assert.deepEqual(Object.keys(hashed), ['components/bundle.js']);
  assert.deepEqual(hashed, manifestOf(project));
  fs.writeFileSync(path.join(root, 'download', 'manifest.json'), JSON.stringify({ kept: at('9') }));
  assert.deepEqual(Object.keys(lastManifest(path.join(root, 'download'))), ['kept']);
  assert.deepEqual(lastManifest(path.join(root, 'nowhere')), {});
  assert.deepEqual(lastManifest(undefined), {});
});

test("a build with faults leaves the last good build's manifest in place, and one with none records its own", () => {
  const root = scratch('design-system-recorded');
  const file = path.join(root, 'manifest.json');
  const good: Manifest = { 'components/X/preview.html': at('1') };
  recordManifest(file, good, []);
  assert.deepEqual(lastManifest(root), good);
  recordManifest(file, { 'components/X/preview.html': at('2') }, ['X Story: undeclared']);
  assert.deepEqual(lastManifest(root), good);
  assert.deepEqual(changesSince(lastManifest(root), { 'components/X/preview.html': at('2') }).changed, ['components/X/preview.html']);
  recordManifest(file, {}, ['the build stopped: no tag']);
  assert.deepEqual(lastManifest(root), good);
});
