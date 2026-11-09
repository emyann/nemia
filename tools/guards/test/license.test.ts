/**
 * Nemia is MIT-licensed, and the `license` field of the root's `package.json` and of every workspace's, a future one's included, says
 * so. The field defaulted to `ISC` in both packages, which `npm init` writes and nobody chose, so a package added or regenerated from
 * that default, or with no field at all, is refused here.
 *
 * The test reads files outside this package: after a change elsewhere, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO as ROOT, workspaces } from 'test-kit/repo';

/** What this repository is under, as a `license` field says it (an SPDX identifier). */
const LICENSE = 'MIT';

type Pkg = { readonly name: string; readonly license?: string };

/** Each package of `pkgs` whose `license` is not `MIT`, as a sentence naming the fix. */
const misLicensed = (pkgs: readonly Pkg[]): string[] =>
  pkgs
    .filter((pkg) => pkg.license !== LICENSE)
    .map(
      (pkg) => `${pkg.name} says "license": ${JSON.stringify(pkg.license ?? null)}: set it to "${LICENSE}", what this repository is under`,
    );

/** The root's `package.json` and each workspace's, read as a `Pkg` named by its path from the root. */
const packages = (): Pkg[] =>
  [ROOT, ...workspaces().map((dir) => path.join(ROOT, dir))].map((dir) => {
    const read = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as Pkg;
    return { ...read, name: path.join(path.relative(ROOT, dir), 'package.json') };
  });

test('the root and every workspace say the repository is MIT-licensed', () => {
  const read = packages();
  assert.ok(read.length >= 6, `read ${read.length} package.json files, fewer than the workspace has`);
  assert.deepEqual(misLicensed(read), []);
});

test("REFUSED: a package left on npm init's default, or with no license field at all", () => {
  assert.deepEqual(misLicensed([{ name: 'packages/agent-runtime/package.json', license: 'ISC' }]), [
    'packages/agent-runtime/package.json says "license": "ISC": set it to "MIT", what this repository is under',
  ]);
  assert.deepEqual(misLicensed([{ name: 'apps/web/package.json' }]), [
    'apps/web/package.json says "license": null: set it to "MIT", what this repository is under',
  ]);
  assert.deepEqual(misLicensed([{ name: 'package.json', license: 'MIT' }]), []);
});
