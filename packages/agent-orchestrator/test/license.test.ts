/**
 * Nemia is MIT-licensed, and says so where a person and a tool look: the root's `LICENSE`, and the `license` field of the root's
 * `package.json` and of every workspace's. The field defaulted to `ISC` in both packages, which `npm init` writes and nobody chose,
 * so a package added or regenerated from that default is refused here. The root also names the repository it is published from.
 *
 * The third parties' licences are their own, reproduced in `THIRD_PARTY_NOTICES.md`: the README's last line says both, so a person
 * who reads no further knows what the repository is under and where the rest is.
 *
 * The test reads files outside this package: after a change elsewhere, `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

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

/** Every workspace folder the root's `package.json` names, by absolute path. */
const workspaces = (): string[] => {
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { workspaces: string[] };
  return root.workspaces.flatMap((glob) => {
    const top = glob.replace(/\/\*$/, '');
    return fs.readdirSync(path.join(ROOT, top)).map((name) => path.join(ROOT, top, name));
  });
};

/** The root's `package.json` and each workspace's, read as a `Pkg` named by its path from the root. */
const packages = (): Pkg[] =>
  [ROOT, ...workspaces()].map((dir) => {
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

test("the root LICENSE is the MIT License, under the owner's copyright", () => {
  const text = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(text, /^MIT License\n/);
  assert.match(text, /\nCopyright \(c\) 2026 emyann\n/);
  assert.match(text, /Permission is hereby granted, free of charge, to any person obtaining a copy\nof this software/);
  assert.match(text, /The above copyright notice and this permission notice shall be included in all\ncopies/);
  assert.match(text, /THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND/);
});

test('the root package.json names the repository Nemia is published from', () => {
  const root = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
    repository?: { type?: string; url?: string };
  };
  assert.deepEqual(root.repository, { type: 'git', url: 'git+https://github.com/emyann/nemia.git' });
});

test("the README says Nemia is MIT and where the third parties' notices are", () => {
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const line = readme.split('\n\n').at(-1) ?? '';
  assert.match(line, /MIT/, 'the README no longer says what Nemia is licensed under: say it in its last section');
  assert.match(line, /THIRD_PARTY_NOTICES\.md/, "the README's licence line does not say where the third parties' notices are");
});
