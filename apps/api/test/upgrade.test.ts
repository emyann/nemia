/**
 * The upgrade the person depends on, held in a test's shape: a store the release before this one served, exposed on a shared address
 * (`WF_EXPOSED=1`), its tokens kept as that release kept them — a person token's record `{ name, createdAt }`, no holder — one the
 * board was paired with through `POST /api/session` (its cookie) and one an MCP host holds, minted by `nemia token add laptop`. After
 * the upgrade, with nothing typed and no record rewritten: the board's cookie and the host's bearer each reach the api as the person
 * under their token's name, which a write records as its actor; and the board's chat send, over plain http with no Sec-Fetch-Site, is
 * the person's, 201.
 *
 * Over the app's own engine on the harness's store, the old records written by digest as the old release wrote them.
 */
import { root } from './harness.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { TOKEN_COOKIE } from 'objects';
import { appOf, liveOf } from '../src/app.ts';
import { withHer } from './her.ts';

/** The app of the upgraded release over the harness's store, marked exposed as a server bound to a shared address is. */
const { app: exposed } = appOf(liveOf({ ...process.env, WF_ROOT: root, WF_EXPOSED: '1' }));

/** A person token as the release before this one kept it: its record by its digest, its name and when it was minted, and no holder. */
function keptByTheOldRelease(name: string): string {
  const token = crypto.randomBytes(32).toString('base64url');
  const dir = path.join(root, 'person-tokens');
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const digest = crypto.createHash('sha256').update(token).digest('hex');
  fs.writeFileSync(path.join(dir, `${digest}.json`), `${JSON.stringify({ name, createdAt: '2026-10-01T09:00:00.000Z' })}\n`, {
    mode: 0o600,
  });
  return token;
}

/** A run planted as its record alone, one step and nothing of it filed: something a person holds. */
function planted(id: string): void {
  const file = path.join(root, 'runs', `${id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Hold me',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-11-11T09:00:00.000Z',
      workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
      steps: { implement: { taskId: null } },
    }),
  );
}

/** Who the hold on run `id` says put it, as its file keeps it. */
const holder = (id: string): unknown =>
  (JSON.parse(fs.readFileSync(path.join(root, 'runs', `${id}.hold`), 'utf8')) as { actor?: unknown }).actor;

/** The board's request, as a browser sends it over plain http from the shared address: no Sec-Fetch-Site, the cookie its only token. */
const fromTheBoard = (cookie: string, method: string, url: string, body: unknown) =>
  exposed.request(`http://100.64.0.7:8787${url}`, {
    method,
    headers: { 'content-type': 'application/json', host: '100.64.0.7:8787', cookie },
    body: JSON.stringify(body),
  });

test('after the upgrade, the board paired through POST /api/session keeps working with nothing typed: the person under its name, its chat send 201 over plain http', async () => {
  const board = keptByTheOldRelease('board');
  const paired = await exposed.request('http://100.64.0.7:8787/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', host: '100.64.0.7:8787', authorization: `Bearer ${board}` },
    body: '{}',
  });
  assert.equal(paired.status, 200, 'the old token still pairs the board');
  const cookie = `${TOKEN_COOKIE}=${board}`;
  assert.ok((paired.headers.get('set-cookie') ?? '').startsWith(cookie), 'the cookie the board holds is the token it was paired with');

  assert.equal((await fromTheBoard(cookie, 'GET', '/api/runs', undefined)).status, 200, 'a read by the cookie');
  planted('r-upgrade-board');
  const held = await fromTheBoard(cookie, 'POST', '/api/namespaces/default/runs/r-upgrade-board/hold', { why: 'after the upgrade' });
  assert.equal(held.status, 200, await held.clone().text());
  assert.deepEqual(holder('r-upgrade-board'), { kind: 'person', token: 'board' }, 'the person, under the board token’s name');

  withHer([]);
  const sent = await fromTheBoard(cookie, 'POST', '/api/nemia/chat/send', { text: 'Still here after the upgrade.' });
  assert.equal(sent.status, 201, await sent.clone().text());
  assert.equal(((await sent.json()) as { from?: unknown }).from, undefined, "the person's words, which carry no speaker");
});

test('after the upgrade, the MCP host holding the laptop token keeps working with nothing typed: the person under its name, on both eras', async () => {
  const laptop = keptByTheOldRelease('laptop');
  for (const era of ['legacy', 'modern'] as const) {
    const client = new Client(
      { name: 'upgrade-test', version: '0.0.0' },
      era === 'modern' ? { versionNegotiation: { mode: { pin: '2026-07-28' } } } : {},
    );
    await client.connect(
      new StreamableHTTPClientTransport(new URL('http://100.64.0.7:8787/mcp'), {
        fetch: async (url, init) => exposed.request(url, init),
        requestInit: { headers: { authorization: `Bearer ${laptop}` } },
      }),
    );
    assert.equal(client.getProtocolEra(), era);
    const id = `r-upgrade-mcp-${era}`;
    planted(id);
    const result = await client.callTool({ name: 'hold', arguments: { namespace: 'default', name: id, why: 'from the laptop' } });
    assert.notEqual(result.isError, true, JSON.stringify(result.content));
    assert.deepEqual(holder(id), { kind: 'person', token: 'laptop' }, `${era}: the person, under the laptop token’s name`);
    await client.close();
  }
});
