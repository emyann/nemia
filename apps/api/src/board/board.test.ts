/**
 * The board's built pages served beside the `Api` on one origin (`board`, src/board/board.ts): a file of the folder by its path, the
 * board's `index.html` for a path that names none (a route of the board's own), a path that climbs out of the folder refused, and with
 * no folder built a 404 that names the build. On a store marked exposed a page needs no token, while the `Api`'s routes still do.
 */
import { root } from '../../test/harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from 'agent-orchestrator/testing';
import { storeConfigLayer } from 'agent-orchestrator';
import { TOKEN_COOKIE } from 'objects';
import { scratch } from 'test-kit/scratch';
import { ApiConfig } from '../layer.ts';
import { appOver, eachTest } from '../../test/placed.ts';

const stand = eachTest(testPlace);
const standIn = eachTest(testEngine);

/** An install's root whose board is built: `apps/web/dist` with its index and one asset, and a file beside the folder no page may read. */
const install = scratch('nemia-api-board-');
const DIST = path.join(install, 'apps', 'web', 'dist');
fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
fs.writeFileSync(path.join(DIST, 'index.html'), '<!doctype html><title>board</title>');
fs.writeFileSync(path.join(DIST, 'assets', 'a.js'), 'export const a = 1;');
fs.writeFileSync(path.join(install, 'apps', 'web', 'package.json'), '{"name":"secret"}');

/** The app over the harness's store, marked exposed where `exposed`, with `env` read as the api's (`NEMIA_BOARD_DIR` among it). */
const appWith = (env: NodeJS.ProcessEnv, exposed = false) =>
  appOver(
    standIn(),
    stand(),
    storeConfigLayer({ ...process.env, WF_ROOT: root, ...(exposed ? { WF_EXPOSED: '1' } : {}) }),
    ApiConfig.layer({ ...process.env, ...env }, { kind: 'checkout', root: install }),
  );

test("the running install's apps/web/dist where NEMIA_BOARD_DIR is unset: a file by its path, and index.html for a route of the board's", async () => {
  const app = appWith({ NEMIA_BOARD_DIR: '' });
  const asset = await app.request('/assets/a.js');
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get('content-type') ?? '', /javascript/);
  assert.equal(await asset.text(), 'export const a = 1;');
  for (const url of ['/', '/runs/x', '/factory/default/runs']) {
    const page = await app.request(url);
    assert.equal(page.status, 200, url);
    assert.match(page.headers.get('content-type') ?? '', /text\/html/, url);
    assert.match(await page.text(), /<title>board<\/title>/, url);
  }
  assert.equal((await app.request('/assets/gone.js')).status, 404, 'a missing asset is no page');
});

test('NEMIA_BOARD_DIR names the folder served', async () => {
  const other = scratch('nemia-api-board-other-');
  fs.writeFileSync(path.join(other, 'index.html'), '<title>other</title>');
  assert.match(await (await appWith({ NEMIA_BOARD_DIR: other }).request('/runs/x')).text(), /other/);
});

test('REFUSED 400: a path that climbs out of the board, encoded or not', async () => {
  const app = appWith({ NEMIA_BOARD_DIR: DIST });
  for (const url of [
    '/..%2Fpackage.json',
    '/assets/..%2F..%2Fpackage.json',
    '/%2E%2E%2Fpackage.json',
    '/assets%2F..%2F..%2Fpackage.json',
  ]) {
    const res = await app.request(url);
    assert.equal(res.status, 400, url);
    assert.doesNotMatch(await res.text(), /secret/, url);
  }
});

test('REFUSED 404: with no board built, a page answers a 404 naming npm run build', async () => {
  const res = await appWith({ NEMIA_BOARD_DIR: path.join(install, 'nothing-built') }).request('/runs/x');
  assert.equal(res.status, 404);
  assert.match(((await res.json()) as { error: string }).error, /npm run build/);
});

test('a store marked exposed: a page answers with no token, a stale cookie included, while /api/runs answers 401 token-required', async () => {
  const app = appWith({ NEMIA_BOARD_DIR: DIST }, true);
  assert.equal((await app.request('/')).status, 200);
  assert.equal((await app.request('/runs/x', { headers: { cookie: `${TOKEN_COOKIE}=never-minted` } })).status, 200, 'a stale cookie');
  const api = await app.request('/api/runs');
  assert.equal(api.status, 401);
  assert.equal(((await api.json()) as { reason?: string }).reason, 'token-required');
});

test("the board serves no path of the api's: an unknown one under /api, /mcp or /openapi stays the api's own", async () => {
  const app = appWith({ NEMIA_BOARD_DIR: DIST });
  const res = await app.request('/api/nothing-here');
  assert.equal(res.status, 404);
  assert.doesNotMatch(await res.text(), /<title>board/);
  assert.doesNotMatch(await (await app.request('/openapi/nothing')).text(), /<title>board/);
});

test('a write outside the api is no page: the board answers GET and HEAD alone', async () => {
  const app = appWith({ NEMIA_BOARD_DIR: DIST });
  assert.equal((await app.request('/', { method: 'HEAD' })).status, 200);
  assert.equal((await app.request('/', { method: 'POST' })).status, 404);
});
