/**
 * `nemia pair <url>`, against a stand-in of the api's pair routes: it asks a pairing with no token, prints the short code and the
 * approve command, claims with the secret until the pairing is approved, and writes the context the claim's token is for — mode 0600,
 * the context in use from then — and never prints the token. A pairing that lapsed, or that the server does not hold, ends it
 * non-zero, naming the command to type again. The polling interval is shortened by `NEMIA_PAIR_EVERY_MS`.
 */
import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { parse } from 'yaml';
import { ambient } from './ambient.ts';
import type { Said } from './served.ts';
import { configWritten } from '../src/context.ts';

const CLI = path.join(import.meta.dirname, '..', 'bin', 'nemia.ts');
const TOKEN = 'nm_paired_token_never_printed';
const OTHER = 'nm_other_servers_token';

/** What each pairing id's claims answer, in turn, the last kept. */
const claims = new Map<string, Array<[number, unknown]>>();
/** Each request the stand-in took. */
const took: Array<{ method: string; path: string; authorization: string | undefined; body: unknown }> = [];

/** The stand-in's answer to one request. */
function answer(method: string, url: string, body: unknown): [number, unknown] {
  if (method === 'POST' && url === '/api/pair') {
    const client = (body as { client: string }).client;
    const id = client === 'gone' ? 'p-gone' : client === 'lapsed' ? 'p-lapsed' : 'p-ok';
    return [200, { id, code: 'ABCD-EFGH', secret: `secret-${id}`, expiresAt: new Date(Date.now() + 600_000).toISOString() }];
  }
  const claim = /^\/api\/pair\/([^/]+)\/claim$/.exec(url);
  if (method === 'POST' && claim) {
    const queue = claims.get(claim[1] ?? '') ?? [[404, { error: 'no such pairing' }]];
    return queue.length > 1 ? (queue.shift() ?? [500, {}]) : (queue[0] ?? [500, {}]);
  }
  return [404, {}];
}

const stub = http.createServer((req, res) => {
  let text = '';
  req.on('data', (chunk) => (text += chunk));
  req.on('end', () => {
    const body: unknown = text === '' ? undefined : JSON.parse(text);
    const url = new URL(req.url ?? '/', 'http://stub').pathname;
    took.push({ method: req.method ?? '', path: url, authorization: req.headers.authorization, body });
    const [status, said] = answer(req.method ?? '', url, body);
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(said));
  });
});
await new Promise<void>((resolve) => stub.listen(0, '127.0.0.1', resolve));
after(() => {
  stub.closeAllConnections();
  stub.close();
});
const server = `http://127.0.0.1:${(stub.address() as AddressInfo).port}`;

/** A laptop of its own: its config folder, and the environment `nemia` runs with on it. */
function aLaptop(prefix: string): { env: NodeJS.ProcessEnv; file: string } {
  const folder = scratch(prefix);
  const env = {
    ...ambient(),
    HOME: path.join(folder, 'home'),
    XDG_CONFIG_HOME: path.join(folder, 'config'),
    WF_ROOT: path.join(folder, 'store'),
    NEMIA_DAEMON_START: 'off',
    NEMIA_PAIR_EVERY_MS: '20',
  };
  return { env, file: path.join(folder, 'config', 'nemia', 'config.yaml') };
}

/** `nemia <argv>` on `env`, waited on for its end. */
function nemia(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<Said> {
  const child = spawn(process.execPath, [CLI, ...argv], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  let err = '';
  child.stdout.on('data', (chunk) => (out += chunk));
  child.stderr.on('data', (chunk) => (err += chunk));
  return new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, out, err }));
  });
}

test('`nemia pair <url>` claims through a waiting answer, writes the context 0600 in use, and prints no token', async () => {
  claims.set('p-ok', [
    [200, { phase: 'waiting' }],
    [200, { phase: 'waiting' }],
    [200, { phase: 'claimed', token: TOKEN, name: 'laptop' }],
  ]);
  const { env, file } = aLaptop('nemia-pair-ok-');
  configWritten({ contexts: [{ name: 'other', server: 'http://other:7777', token: OTHER }], current: 'other' }, env);
  const from = took.length;
  const said = await nemia(['pair', server, '--context', 'vps', '--name', 'laptop'], env);
  assert.equal(said.code, 0, said.err);
  assert.ok(!said.out.includes(TOKEN) && !said.err.includes(TOKEN), 'the token is printed nowhere');
  assert.match(said.out, /ABCD-EFGH/, 'the short code is shown');
  assert.match(said.out, /nemia pairings approve ABCD-EFGH/, 'the approve command is named');
  assert.ok(said.out.includes(`NEMIA_URL=${server}`), "the profile's line for the plugin");
  const requests = took.slice(from);
  assert.deepEqual(requests[0]?.body, { client: 'laptop' });
  assert.equal(requests.filter((r) => r.path === '/api/pair/p-ok/claim').length, 3, 'asked again while it waited');
  assert.ok(
    requests.every((r) => r.authorization === undefined),
    "no token is sent to the server paired, the other context's least of all",
  );
  assert.ok(requests.filter((r) => r.path.endsWith('/claim')).every((r) => JSON.stringify(r.body) === '{"secret":"secret-p-ok"}'));
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const written = parse(fs.readFileSync(file, 'utf8')) as { 'current-context': string; contexts: unknown[] };
  assert.equal(written['current-context'], 'vps');
  assert.deepEqual(written.contexts, [
    { name: 'other', server: 'http://other:7777', token: OTHER },
    { name: 'vps', server, token: TOKEN },
  ]);
});

test("`nemia pair <url>` names the context after the url's host and the client after this machine where neither is typed", async () => {
  claims.set('p-ok', [[200, { phase: 'claimed', token: TOKEN, name: 'x' }]]);
  const { env, file } = aLaptop('nemia-pair-default-');
  const from = took.length;
  const said = await nemia(['pair', `${server}/`], env);
  assert.equal(said.code, 0, said.err);
  const asked = took.slice(from)[0]?.body as { client: string };
  assert.ok(asked.client.length > 0, 'a client name is sent');
  const written = parse(fs.readFileSync(file, 'utf8')) as { 'current-context': string };
  assert.equal(written['current-context'], '127.0.0.1');
});

test('REFUSED: a pairing that lapsed or that the server does not hold ends non-zero, naming `nemia pair` again', async () => {
  claims.set('p-lapsed', [
    [200, { phase: 'waiting' }],
    [409, { error: 'expired' }],
  ]);
  for (const name of ['lapsed', 'gone']) {
    const { env, file } = aLaptop(`nemia-pair-${name}-`);
    const said = await nemia(['pair', server, '--name', name], env);
    assert.notEqual(said.code, 0, name);
    assert.match(said.err, /nemia pair /, `${name}: the command to type again`);
    assert.equal(fs.existsSync(file), false, `${name}: no context written`);
  }
});

test('REFUSED: `nemia pair` with no url, or one that is not http(s), is a usage refusal, exit 2', async () => {
  const { env } = aLaptop('nemia-pair-usage-');
  for (const argv of [['pair'], ['pair', 'ftp://vps']]) {
    const said = await nemia(argv, env);
    assert.equal(said.code, 2, argv.join(' '));
    assert.match(said.err, /nemia pair /);
  }
});
