/**
 * A client and a daemon of two releases (the api-consumer intent's Q9): the client's release read off its install's `release.json`
 * (`releaseAt`: the `tag` at the first folder whose `package.json` names the daemon, null for a checkout); the daemon's off its health
 * (`Health.release`). A daemon whose health says `v9`, asked by a client whose `release.json` says `v8`, is refused, exit 2, naming
 * `nemia version`; one whose health says none is asked. Which meet is `releaseMet`'s, proved by its contract
 * (`contracts/release.contract.ts`). A daemon let through whose answer does not decode by the `Api`'s Schema is refused all the same,
 * exit 2, naming its release and `nemia version` (`undecoded`, `src/objects.ts`): the decode guards what an unsaid release lets through.
 */
import { after, test } from 'node:test';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { ambient } from './ambient.ts';
import { served } from '../src/daemon.ts';
import { Refused } from '../src/refused.ts';
import { clientRelease, releaseAt } from '../src/release.ts';

/** A daemon whose `GET /api/health` answers `body`. */
const healthOf = (body: unknown): http.Server =>
  http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  });

const v9 = healthOf({ ok: true, release: 'v9' });
const unsaid = healthOf({ ok: true });
/** A daemon of v1.5.0 whose health says so, and whose every other answer is a Run this client's `Api` does not decode. */
const shapeless = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(req.url === '/api/health' ? { ok: true, release: 'v1.5.0' } : { kind: 'Run', metadata: { name: 'r-one' } }));
});
const servers = [v9, unsaid, shapeless];
for (const server of servers) await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
after(() => {
  for (const server of servers) {
    server.closeAllConnections();
    server.close();
  }
});
const urlOf = (server: http.Server) => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

/** An install's root at `root`: its `package.json` naming the daemon, and its `release.json` saying `tag` where one is given. */
function install(root: string, tag?: string): string {
  fs.mkdirSync(path.join(root, 'apps', 'cli', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'nemia', nemia: { daemon: 'apps/api/src/main.ts' } }));
  if (tag !== undefined) fs.writeFileSync(path.join(root, 'release.json'), JSON.stringify({ tag, commit: 'abc' }));
  return path.join(root, 'apps', 'cli', 'src');
}

/** A store whose lease names `url`, the start off: what `served` reads under this machine's context. */
function storeAt(url: string): NodeJS.ProcessEnv {
  const root = path.join(scratch('nemia-release-'), 'store');
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'daemon.json'), JSON.stringify({ url }));
  return { WF_ROOT: root, NEMIA_DAEMON_START: 'off' };
}

test("the client's release is its install's release.json tag; a checkout's, and code no package names the daemon above, is none", () => {
  const folder = scratch('nemia-release-root-');
  assert.equal(releaseAt(install(path.join(folder, 'installed'), 'v8')), 'v8');
  assert.equal(releaseAt(install(path.join(folder, 'checkout'))), null);
  assert.equal(releaseAt(path.join(folder)), null);
  assert.equal(clientRelease(), null, 'this checkout has no release.json');
});

test('REFUSED: a daemon whose health says v9, asked by a client whose release.json says v8, exit 2 naming `nemia version`', async () => {
  const mine = releaseAt(install(path.join(scratch('nemia-release-v8-'), 'installed'), 'v8'));
  await assert.rejects(served('ls', storeAt(urlOf(v9)), mine), (err: unknown) => {
    assert.ok(err instanceof Refused, String(err));
    assert.equal(err.code, 2);
    assert.match(err.message, /`nemia version`/);
    return true;
  });
});

test('a daemon whose health says no release is asked, and so is one of the same release, and any asked by a checkout', async () => {
  assert.equal(await served('ls', storeAt(urlOf(unsaid)), 'v8'), urlOf(unsaid));
  assert.equal(await served('ls', storeAt(urlOf(v9)), 'v9'), urlOf(v9));
  assert.equal(await served('ls', storeAt(urlOf(v9)), null), urlOf(v9));
});

test('REFUSED: a daemon whose answer does not decode, asked by a checkout, exit 2, naming its release and `nemia version`, no TypeError', async () => {
  const home = scratch('nemia-release-home-');
  const env = { ...ambient(), ...storeAt(urlOf(shapeless)), HOME: home, XDG_CONFIG_HOME: path.join(home, 'config') };
  const child = spawn(process.execPath, [path.join(import.meta.dirname, '..', 'bin', 'nemia.ts'), 'show', 'r-one'], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let err = '';
  child.stderr.on('data', (chunk) => (err += chunk));
  const code = await new Promise<number | null>((resolve) => child.on('close', resolve));
  assert.equal(code, 2, err);
  assert.match(err, /v1\.5\.0/, "the daemon's release is named");
  assert.match(err, /`nemia version`/);
  assert.doesNotMatch(err, /TypeError|Cannot read|Cannot use/);
});
