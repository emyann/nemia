/**
 * `tools/release/install.sh` run for real on a release `tools/release/archive.ts` packs, both as a person's machine meets them: a
 * fixture tree with a stand-in Node (a shell script that prints what it was asked to run) packed for this machine's platform by
 * `pack`, laid out under a `file://` download base as GitHub lays a release out (`<base>/download/<tag>/<asset>`,
 * `<base>/latest/download/latest.json`), and the installer run with `--yes --no-service` into a scratch HOME and `WF_ROOT`. It asserts
 * the release folder and its `release.json`, the relative `releases/current`, the `~/.local/bin/nemia` link and that the launcher runs
 * the release's own Node on the cli through both links; then a release whose `SHA256SUMS` line is wrong refused with exit 1, leaving
 * `current`, the releases and the link as they were. What it asserts is exit codes and files, never a sentence.
 *
 * `install.sh` is POSIX sh: each test parses it with `sh -n` first, so a bashism the host's sh refuses fails here.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { assetName, pack, PLATFORMS, type Platform } from '../../release/archive.ts';

const INSTALL = path.join(import.meta.dirname, '..', '..', 'release', 'install.sh');

/** This machine's platform as a release names it, or undefined where no archive is built for it. */
const HOST = PLATFORMS.find((each) => each === `${process.platform}-${process.arch}`);

/** A release's tree, as the archive tool is handed one: a root manifest, the cli's bin, and a Node that prints its argv. */
const fixture = (root: string): { tree: string; node: string } => {
  const tree = path.join(root, 'tree');
  fs.mkdirSync(path.join(tree, 'apps', 'cli', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(tree, 'package.json'), '{ "name": "nemia", "version": "1.2.3" }\n');
  fs.writeFileSync(path.join(tree, 'apps', 'cli', 'bin', 'nemia.ts'), '');
  const node = path.join(root, 'node');
  fs.mkdirSync(path.join(node, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(node, 'bin', 'node'), '#!/bin/sh\nprintf "%s\\n" "$0" "$@"\n', { mode: 0o755 });
  return { tree, node };
};

/** Publishes the release `tag` for `platform` under the download base `base`, as the workflow's upload lays it out. */
const publish = (base: string, tag: string, platform: Platform): string => {
  const { tree, node } = fixture(scratch('install-tree-'));
  const out = path.join(base, 'download', tag);
  pack({ tree, node, platform, tag, source: `file://${base}`, commit: 'f'.repeat(40), builtAt: '2026-11-11T00:00:00.000Z', out });
  fs.mkdirSync(path.join(base, 'latest', 'download'), { recursive: true });
  fs.writeFileSync(path.join(base, 'latest', 'download', 'latest.json'), JSON.stringify({ tag, version: tag.slice(1) }));
  return out;
};

/** A person's machine: an empty HOME and its store under it. */
const machine = () => {
  const home = fs.realpathSync(scratch('install-home-'));
  return { home, root: path.join(home, '.agent-workflows') };
};

/** Runs the installer with `args` on `home`, its store at `root`. */
const install = (home: string, root: string, args: string[]) => {
  const env = { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: home, WF_ROOT: root };
  const ran = spawnSync('sh', [INSTALL, ...args], { env, encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
  return { status: ran.status, out: `${ran.stdout}${ran.stderr}` };
};

test('install.sh parses as POSIX sh', () => {
  const ran = spawnSync('sh', ['-n', INSTALL], { encoding: 'utf8' });
  assert.equal(ran.status, 0, ran.stderr);
});

test(
  'install.sh lays down the latest release from a file:// base, points current at it and links nemia to its launcher',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    const base = fs.realpathSync(scratch('install-base-'));
    publish(base, 'v1.2.3', HOST as Platform);
    const { home, root } = machine();

    const ran = install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]);
    assert.equal(ran.status, 0, ran.out);

    const releases = path.join(root, 'releases');
    const release = JSON.parse(fs.readFileSync(path.join(releases, 'current', 'release.json'), 'utf8')) as Record<string, string>;
    assert.deepEqual(
      { tag: release.tag, from: release.from, platform: release.platform, source: release.source },
      { tag: 'v1.2.3', from: 'archive', platform: HOST, source: `file://${base}` },
    );
    assert.equal(fs.readlinkSync(path.join(releases, 'current')), 'v1.2.3', 'current is the relative link to the tag');
    const link = path.join(home, '.local', 'bin', 'nemia');
    assert.equal(fs.readlinkSync(link), path.join(releases, 'current', 'bin', 'nemia'));
    assert.deepEqual(
      fs.readdirSync(releases).filter((name) => name.startsWith('.')),
      [],
      'no hidden folder is left behind',
    );

    const launched = spawnSync(link, ['version'], { encoding: 'utf8' });
    assert.equal(launched.status, 0, launched.stderr);
    assert.deepEqual(launched.stdout.trim().split('\n'), [
      path.join(releases, 'v1.2.3', 'node', 'bin', 'node'),
      path.join(releases, 'v1.2.3', 'apps', 'cli', 'bin', 'nemia.ts'),
      'version',
    ]);
  },
);

test(
  'REFUSED: a release whose SHA256SUMS names another sum exits 1 and leaves current, the releases and the link as they were',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    const base = fs.realpathSync(scratch('install-base-'));
    publish(base, 'v1.2.3', HOST as Platform);
    const { home, root } = machine();
    assert.equal(install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]).status, 0);

    const out = publish(base, 'v1.2.4', HOST as Platform);
    fs.writeFileSync(path.join(out, 'SHA256SUMS'), `${'0'.repeat(64)}  ${assetName('v1.2.4', HOST as Platform)}\n`);
    const releases = path.join(root, 'releases');
    const before = fs.readdirSync(releases).sort();

    const ran = install(home, root, ['--yes', '--no-service', '--base', `file://${base}`]);
    assert.equal(ran.status, 1, ran.out);
    assert.equal(fs.readlinkSync(path.join(releases, 'current')), 'v1.2.3', 'current still names the release before');
    assert.deepEqual(fs.readdirSync(releases).sort(), before, 'no folder of v1.2.4, and no hidden folder left');
    assert.equal(fs.readlinkSync(path.join(home, '.local', 'bin', 'nemia')), path.join(releases, 'current', 'bin', 'nemia'));
  },
);

test('REFUSED: an argument the installer does not take exits 2, and a flag with no value too', () => {
  const { home, root } = machine();
  assert.equal(install(home, root, ['--yes', '--no-such-flag']).status, 2);
  assert.equal(install(home, root, ['--yes', '--version']).status, 2);
  assert.equal(fs.existsSync(root), false, 'nothing is written before the arguments are read');
});

test(
  'REFUSED: a client install with no token for its server exits 1 under --yes; given one by file, it names the context with it',
  {
    skip: HOST === undefined && `no release is built for ${process.platform}-${process.arch}`,
  },
  () => {
    const base = fs.realpathSync(scratch('install-base-'));
    publish(base, 'v1.2.3', HOST as Platform);
    const client = ['--yes', '--client', '--server', 'http://100.64.0.1:8787', '--base', `file://${base}`];
    const bare = machine();
    assert.equal(install(bare.home, bare.root, client).status, 1);

    const given = machine();
    const tokenFile = path.join(given.home, 'token');
    fs.writeFileSync(tokenFile, 'a-token\n', { mode: 0o600 });
    const ran = install(given.home, given.root, [...client, '--token-file', tokenFile]);
    assert.equal(ran.status, 0, ran.out);
    assert.match(ran.out, /--token-file/, 'set-context is handed the token by its file');
    assert.doesNotMatch(ran.out, /a-token/, 'the token itself is never printed');
  },
);
