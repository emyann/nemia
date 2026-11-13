/**
 * `nemia upgrade` on an archive install: a scratch store whose current release came from an archive, upgraded from a `file:` download
 * base laid out as a release's (`download/<tag>/nemia-<tag>-<platform>.tar.gz`, its `SHA256SUMS`, `latest/download/latest.json`), each
 * archive a tiny release whose `bin/nemia` is a shell script; and from a stub GitHub on loopback, whose downloads all answer 404 and
 * whose API (`/api/v3`, as a host other than github.com is read) answers one release published with no archive yet. No daemon ticks the
 * store, so nothing is restarted; the store is the test's own at `ROOT`, named by `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Effect } from 'effect';
import type { Args } from '../command/command.ts';
import type { ServiceHost } from '../service/service.verb.ts';
import { scratch } from 'test-kit/scratch';
import { story } from 'test-kit/checkpoints';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { testEngine } from 'agent-runtime/testing';
import { runWith as runEngine, engineOf } from '../runtime-client.ts';
import { upgrade } from './upgrade.verb.ts';
import { platformOf, type ReleaseFile } from './release.ts';
import { currentRelease, releaseDir, releaseFileOf, releasesDir, runningAt, switchCurrent, writeReleaseFile } from './release.store.ts';
import { assetName, releaseApiUrl, writeStoreFloor } from './archive.store.ts';
import { parseVersion } from './floor.ts';
import { linkNemia, toolsNemia } from './nemia-link.store.ts';

const ROOT = fs.realpathSync(scratch('wf-upgrade-archive-'));
const HOME = scratch('wf-upgrade-archive-home-');
const ENV: NodeJS.ProcessEnv = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);

const PLATFORM = platformOf(process.platform, process.arch) ?? assert.fail('no archive is published for this machine');

/** The download base: a folder laid out as a release's downloads, read by its `file:` URL. */
const BASE = scratch('wf-upgrade-archive-base-');
const SOURCE = pathToFileURL(BASE).href;

/**
 * Publishes `tag` at the base: an archive of a release whose `bin/nemia` exits `exit`, and its `SHA256SUMS`, whose checksum is another's
 * where `damaged`; and names it newest where `latest`.
 */
function published(tag: string, { exit = 0, damaged = false, latest = false } = {}): void {
  const tree = scratch('wf-upgrade-archive-tree-');
  const shipped: ReleaseFile = { tag, commit: `c0ffee${tag.replace(/\W/g, '')}`, source: 'ci', builtAt: '2026-11-01T00:00:00.000Z' };
  writeReleaseFile(tree, shipped);
  fs.mkdirSync(path.join(tree, 'bin'));
  fs.writeFileSync(path.join(tree, 'bin', 'nemia'), `#!/bin/sh\necho "nemia $1"\nexit ${exit}\n`, { mode: 0o755 });
  const dir = path.join(BASE, 'download', tag);
  fs.mkdirSync(dir, { recursive: true });
  const asset = path.join(dir, assetName(tag, PLATFORM));
  assert.equal(spawnSync('tar', ['-czf', asset, '-C', tree, '.']).status, 0);
  const sum = crypto
    .createHash('sha256')
    .update(damaged ? 'another' : fs.readFileSync(asset))
    .digest('hex');
  fs.writeFileSync(path.join(dir, 'SHA256SUMS'), `${sum}  ${assetName(tag, PLATFORM)}\n`);
  if (latest) {
    fs.mkdirSync(path.join(BASE, 'latest', 'download'), { recursive: true });
    fs.writeFileSync(path.join(BASE, 'latest', 'download', 'latest.json'), JSON.stringify({ tag, version: tag.slice(1) }));
  }
}

/**
 * The store's first release, v1.0.0, as the installer leaves it: unpacked from an archive of this base, its launcher in `bin/`, pointed
 * at, and linked as the tools folder's `nemia`.
 */
const FIRST = (() => {
  const dir = releaseDir('v1.0.0', ROOT);
  fs.mkdirSync(dir, { recursive: true });
  writeReleaseFile(dir, {
    tag: 'v1.0.0',
    commit: 'c0ffee100',
    source: SOURCE,
    builtAt: '2026-10-01T00:00:00.000Z',
    from: 'archive',
    platform: PLATFORM,
  });
  fs.mkdirSync(path.join(dir, 'bin'));
  fs.writeFileSync(path.join(dir, 'bin', 'nemia'), '#!/bin/sh\n', { mode: 0o755 });
  switchCurrent('v1.0.0', ROOT);
  assert.equal(linkNemia(ROOT), true, "the tools folder's nemia, as the installer links it");
  return runningAt(dir);
})();

/** A machine with no daemon ticking the store and no service installed. */
const idle: ServiceHost = {
  machine: () => ({ platform: 'linux', wsl: false, systemd: true }),
  dirs: () => ({ home: HOME, configHome: path.join(HOME, '.config') }),
  roots: () => ({ root: ROOT, defaultRoot: ROOT }),
  daemon: () => ({ checkout: '/srv/nemia', entry: '/srv/nemia/apps/api/src/main.ts', cwd: '/srv/nemia/apps/api' }),
  size: () => ({ memoryMiB: 16384, cpus: 8 }),
  node: '/usr/bin/node',
  path: '/usr/bin:/bin',
  user: () => ({ name: 'ann', uid: 1000 }),
  call: () => '',
  linger: () => true,
  standing: () => null,
  lease: () => ({ kind: 'none' }),
  signal: () => assert.fail('no daemon is signalled'),
  pause: () => assert.fail('no store is paused'),
  resume: () => assert.fail('no store is resumed'),
  calls: () => Effect.succeed([]),
  drain: () => Effect.void,
  say: () => undefined,
  pollMs: 1,
  waitMs: 200,
  timeoutMs: 200,
  stopMs: 200,
};

const run = (args: Args) => runWith(engineOf(engine().layer), upgrade(args, idle, ENV, FIRST));

/** The refusal an upgrade fails with: its tag and message, its exit 2. */
async function refusalOf(args: Args): Promise<{ tag: string; message: string }> {
  const err = await run(args).then(
    () => assert.fail('the upgrade was expected to be refused'),
    (e: Error & { _tag?: string; exitCode?: number }) => e,
  );
  assert.equal(err.exitCode, 2, err.message);
  return { tag: err._tag ?? '', message: err.message };
}

/** What is left under `releases/` beside the releases and the logs: no build folder, no hidden link. */
const leftovers = (): string[] => fs.readdirSync(releasesDir(ROOT)).filter((f) => f.startsWith('.') && f !== '.logs');

test('an archive install upgraded from its download base: the newest by default, refused a damaged archive, and refused going back past its floor', async (t) => {
  const s = story(t);

  await s.test(
    'with no tag, the newest published is downloaded, checked, smoke-run, written release.json last and pointed at',
    async () => {
      published('v1.1.0', { latest: true });
      const done = await run({});
      assert.equal(done.built, true);
      assert.equal(done.release.tag, 'v1.1.0');
      assert.equal(fs.readlinkSync(path.join(releasesDir(ROOT), 'current')), 'v1.1.0', 'a relative link');
      const file = releaseFileOf(releaseDir('v1.1.0', ROOT));
      assert.equal(file?.from, 'archive');
      assert.equal(file?.platform, PLATFORM);
      assert.equal(file?.source, SOURCE, 'the download base, for the next upgrade');
      assert.equal(file?.commit, 'c0ffeev110', "the archive's own commit");
      assert.ok(fs.existsSync(path.join(releaseDir('v1.1.0', ROOT), 'bin', 'nemia')), 'unpacked at the root');
      assert.equal(
        fs.realpathSync(toolsNemia(ROOT)),
        fs.realpathSync(path.join(releaseDir('v1.1.0', ROOT), 'bin', 'nemia')),
        "the tools folder's nemia resolves to the new release's",
      );
      assert.deepEqual(leftovers(), [], 'the build folder is taken away');
    },
  );

  await s.test('REFUSED: an archive that does not match its SHA256SUMS: exit 2, and releases/current stays where it was', async () => {
    published('v1.2.0', { damaged: true });
    const { tag } = await refusalOf({ tag: 'v1.2.0' });
    assert.equal(tag, 'Invalid');
    assert.equal(currentRelease(ROOT)?.tag, 'v1.1.0');
    assert.equal(fs.existsSync(releaseDir('v1.2.0', ROOT)), false);
    assert.deepEqual(leftovers(), []);
  });

  await s.test('REFUSED: an archive whose nemia version fails is never pointed at', async () => {
    published('v1.2.1', { exit: 1 });
    const { tag, message } = await refusalOf({ tag: 'v1.2.1' });
    assert.equal(tag, 'Invalid');
    assert.ok(message.includes(path.join(releasesDir(ROOT), '.logs')), message);
    assert.equal(currentRelease(ROOT)?.tag, 'v1.1.0');
    assert.equal(fs.existsSync(releaseDir('v1.2.1', ROOT)), false);
  });

  await s.test('REFUSED: v0.9.0 on a store whose floor is v1.2.0 exits 2 naming v1.2.0, before anything is fetched', async () => {
    published('v0.9.0');
    writeStoreFloor(ROOT, parseVersion('v1.2.0') ?? assert.fail());
    const { tag, message } = await refusalOf({ tag: 'v0.9.0' });
    assert.equal(tag, 'Conflict');
    assert.ok(message.includes('v1.2.0'), message);
    assert.equal(fs.existsSync(releaseDir('v0.9.0', ROOT)), false);
    assert.equal(currentRelease(ROOT)?.tag, 'v1.1.0');
    assert.equal(fs.existsSync(path.join(releasesDir(ROOT), '.logs', 'v0.9.0')), false);
  });

  await s.test('REFUSED: a tag no release is published under is Missing, naming its URL', async () => {
    const { tag, message } = await refusalOf({ tag: 'v9.9.9' });
    assert.equal(tag, 'Missing');
    assert.ok(message.includes(`${SOURCE}/download/v9.9.9/`), message);
    assert.equal(currentRelease(ROOT)?.tag, 'v1.1.0');
  });

  await s.test(
    'REFUSED: a tag that is not v and three dotted numbers, named or read from latest.json, is Invalid before anything is fetched, as install.sh refuses it',
    async () => {
      const before = fs.readdirSync(releasesDir(ROOT)).sort();
      for (const name of ['v1.0.0/../..', 'v1.0.0 ', 'v1.2.3-rc.1']) {
        assert.equal((await refusalOf({ tag: name })).tag, 'Invalid', name);
        assert.deepEqual(fs.readdirSync(releasesDir(ROOT)).sort(), before, `${JSON.stringify(name)}: nothing is placed or removed`);
      }
      published('v1.3.0 ', { latest: true });
      assert.equal((await refusalOf({})).tag, 'Invalid', 'latest.json naming a tag with a space');
      assert.deepEqual(fs.readdirSync(releasesDir(ROOT)).sort(), before);
      assert.equal(currentRelease(ROOT)?.tag, 'v1.1.0');
    },
  );
});

/**
 * A stub GitHub on loopback: every download answers 404, and the API answers the release of each tag in `published`, with the assets
 * named, and 404 for any other. Its download base is `<origin>/o/r/releases`, a repository's as github.com lays it out.
 */
async function stubGitHub(published: Record<string, readonly string[]>): Promise<{ source: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const asked = /^\/api\/v3\/repos\/o\/r\/releases\/tags\/([^/]+)$/.exec(req.url ?? '');
    const assets = asked?.[1] === undefined ? undefined : published[decodeURIComponent(asked[1])];
    if (assets === undefined) {
      res.writeHead(404, { 'content-type': 'application/json' }).end('{"message":"Not Found"}');
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ assets: assets.map((name) => ({ name })) }));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    source: `http://127.0.0.1:${port}/o/r/releases`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test('an archive that answers 404: Conflict where its release is published without it yet, Missing where no release has the tag', async (t) => {
  const github = await stubGitHub({ 'v1.5.0': ['SHA256SUMS', 'install.sh'] });
  t.after(github.close);
  const install = { ...FIRST, source: github.source };
  const refused = async (tag: string): Promise<string> => {
    const err = await runWith(engineOf(engine().layer), upgrade({ tag }, idle, ENV, install)).then(
      () => assert.fail('the upgrade was expected to be refused'),
      (e: Error & { _tag?: string; exitCode?: number }) => e,
    );
    assert.equal(err.exitCode, 2, err.message);
    return err._tag ?? '';
  };
  const before = currentRelease(ROOT)?.tag;

  assert.equal(await refused('v1.5.0'), 'Conflict', 'a published release whose archive is not attached yet: upgrade again later');
  assert.equal(await refused('v9.8.7'), 'Missing', 'no release by that tag');
  assert.equal(currentRelease(ROOT)?.tag, before, 'nothing switched');
  assert.equal(fs.existsSync(releaseDir('v1.5.0', ROOT)), false);
  assert.deepEqual(leftovers(), []);
});

test("a download base's release is read from github.com's API, another host's /api/v3, and from no API for a base of another shape", async (t) => {
  const rows: [string, string | undefined][] = [
    ['https://github.com/o/r/releases', 'https://api.github.com/repos/o/r/releases/tags/v1.5.0'],
    ['https://github.com/o/r/releases/', 'https://api.github.com/repos/o/r/releases/tags/v1.5.0'],
    ['https://git.example.com/o/r/releases', 'https://git.example.com/api/v3/repos/o/r/releases/tags/v1.5.0'],
    [SOURCE, undefined],
    ['https://example.com/downloads', undefined],
  ];
  for (const [source, api] of rows) await t.test(source, () => assert.equal(releaseApiUrl(source, 'v1.5.0'), api));
});
