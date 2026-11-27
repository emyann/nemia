/**
 * The runtime's held tokens of the servers signed in to by a code: the file's place and mode, the refresh before a session is handed a
 * token, the refresh used once, and what a spawn is given. What matters, each with the fixture that breaks it: the token is on the
 * token's file path rides `mcpTokenFiles` and no token rides anywhere, the task's `config`, which is journalled, least; a changed header
 * finds no token; two asks at once make one refresh request, held by a lock whose dead holder is broken and whose live holder is waited
 * for; a refresh the provider refuses removes the token; one that could not be sent removes nothing.
 */
import { afterAll, afterEach, beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { scratch } from 'test-kit/scratch';
import { keptRequest } from './claude/attached-file.ts';
import {
  dropToken,
  heldToken,
  holdToken,
  MCP_HEADERS_BIN,
  REFRESH_MARGIN_MS,
  tokenFileOf,
  tokened,
  TOKENS_FOLDER,
  withTokenHelpers,
} from './mcp-token.ts';
import { processStart } from '../process/alive.ts';
import type { SpawnRequest, RemoteMcpServer } from './seam.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const GITHUB: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'context,repos' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY' },
};
const FROM = { tokenEndpoint: 'https://github.com/login/oauth/access_token', clientId: 'Iv23liQBfm9prqhvXkuY' };
const T0 = Date.UTC(2026, 10, 26, 12, 0, 0);
const HOUR = 3_600_000;

/** The bounds of a helper's run, shortened: no test waits a shipped bound out. */
const SHORT = { totalMs: 9000, refreshMs: 2000, waitMs: 300, pollMs: 10 };

/** `heldToken` of the file a server's token is held in under `root`. */
const held = (root: string, name: string, server: RemoteMcpServer, now?: number) => heldToken(tokenFileOf(root, name, server), now, SHORT);

/** A grant living `seconds`, with a refresh token living half a year. */
const grant = (accessToken: string, seconds: number | null = 8 * 3600) => ({
  accessToken,
  refreshToken: 'rt-1',
  expiresInSeconds: seconds,
  refreshExpiresInSeconds: 15_811_200,
});

/** A token endpoint that answers each refresh with `answer`, writing down how many it was asked. */
const refreshing = (answer: () => Response) => {
  const asked: URLSearchParams[] = [];
  server.use(
    http.post(FROM.tokenEndpoint, async ({ request }) => {
      asked.push(new URLSearchParams(await request.text()));
      return answer();
    }),
  );
  return asked;
};

describe('holdToken: a token is one file of its own, at mode 0600, filed by the server’s name and wire bytes', () => {
  test('the file is under <root>/mcp-tokens, owner-only, and holds what a refresh needs', () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    const file = tokenFileOf(root, 'github', GITHUB);
    assert.equal(path.dirname(file), path.join(root, TOKENS_FOLDER));
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
    const held: Record<string, unknown> = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(held, {
      accessToken: 'at-1',
      refreshToken: 'rt-1',
      expiresAt: T0 + 8 * HOUR,
      refreshExpiresAt: T0 + 15_811_200_000,
      tokenEndpoint: FROM.tokenEndpoint,
      clientId: FROM.clientId,
    });
    assert.deepEqual(fs.readdirSync(path.dirname(file)), [path.basename(file)], 'no temporary file is left beside it');
  });

  test('a changed header, url or name finds no token; the record’s own key order does not matter', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    assert.equal(await held(root, 'github', GITHUB, T0), 'at-1');
    assert.equal(await held(root, 'github', { ...GITHUB, headers: { 'X-MCP-Toolsets': 'all' } }, T0), undefined);
    assert.equal(await held(root, 'github', { ...GITHUB, url: 'https://other.example/mcp' }, T0), undefined);
    assert.equal(await held(root, 'other', GITHUB, T0), undefined);
    const reordered = { ...GITHUB, headers: { 'X-B': '1', 'X-A': '2' } };
    holdToken(root, 'github', reordered, grant('at-2'), FROM, T0);
    assert.equal(await held(root, 'github', { ...GITHUB, headers: { 'X-A': '2', 'X-B': '1' } }, T0), 'at-2');
  });

  test('dropToken removes it, and says whether one was held', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    assert.equal(dropToken(root, 'github', GITHUB), true);
    assert.equal(dropToken(root, 'github', GITHUB), false);
    assert.equal(await held(root, 'github', GITHUB, T0), undefined);
  });
});

describe('heldToken: a token due is refreshed before a session is handed it', () => {
  test('a token with time left is handed on, and the provider is not asked', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    const asked = refreshing(() => HttpResponse.json({ access_token: 'never' }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 7 * HOUR), 'at-1');
    assert.equal(asked.length, 0);
  });

  test('a token within the margin of its expiry is refreshed with the refresh grant, the client id and no secret, and the new one is held', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    const asked = refreshing(() => HttpResponse.json({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 28800 }));
    const now = T0 + 8 * HOUR - REFRESH_MARGIN_MS + 1;
    assert.equal(await held(root, 'github', GITHUB, now), 'at-2');
    assert.deepEqual(Object.fromEntries(asked[0] ?? []), { client_id: FROM.clientId, grant_type: 'refresh_token', refresh_token: 'rt-1' });
    assert.equal(await held(root, 'github', GITHUB, now), 'at-2', 'the new token is held: the next ask is not a refresh');
    assert.equal(asked.length, 1);
    assert.equal(fs.statSync(tokenFileOf(root, 'github', GITHUB)).mode & 0o777, 0o600);
  });

  test('two asks at once for a due token make one refresh request: a refresh token is used once', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    const asked = refreshing(() => HttpResponse.json({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 28800 }));
    const now = T0 + 9 * HOUR;
    const both = await Promise.all([held(root, 'github', GITHUB, now), held(root, 'github', GITHUB, now)]);
    assert.deepEqual(both, ['at-2', 'at-2']);
    assert.equal(asked.length, 1);
  });

  test('a lock left by a process that is gone is broken, and the refresh is made', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    fs.writeFileSync(`${tokenFileOf(root, 'github', GITHUB)}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, start: '1', id: 'old' }));
    const asked = refreshing(() => HttpResponse.json({ access_token: 'at-2', refresh_token: 'rt-2', expires_in: 28800 }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), 'at-2');
    assert.equal(asked.length, 1);
    assert.equal(fs.existsSync(`${tokenFileOf(root, 'github', GITHUB)}.lock`), false, 'the lock is released');
  });

  test('a lock a running process holds is waited for, and past the bound the token is handed as read, not refreshed again', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    const lock = `${tokenFileOf(root, 'github', GITHUB)}.lock`;
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, start: processStart(process.pid), id: 'other' }));
    const asked = refreshing(() => HttpResponse.json({ access_token: 'never' }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 8 * HOUR - 1000), 'at-1');
    assert.equal(asked.length, 0);
    assert.equal(fs.existsSync(lock), true, 'a lock that is not ours is left');
  });

  test('a refresh that could not be sent hands the token as read where it has not lapsed', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    server.use(http.post(FROM.tokenEndpoint, () => HttpResponse.error()));
    assert.equal(await held(root, 'github', GITHUB, T0 + 8 * HOUR - 1000), 'at-1');
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), true);
  });

  test('a refresh the provider answers invalid_grant removes the token: the server reads needs-auth', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    refreshing(() => HttpResponse.json({ error: 'invalid_grant' }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), undefined);
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), false);
  });

  test('a refresh that could not be sent hands no token this time and removes nothing', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    server.use(http.post(FROM.tokenEndpoint, () => HttpResponse.error()));
    assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), undefined);
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), true);
  });

  test('a refresh the provider failed to answer (503, 429, a page with no error) removes nothing', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('at-1'), FROM, T0);
    for (const status of [503, 429, 200]) {
      refreshing(() => new HttpResponse('<html>try later</html>', { status, headers: { 'content-type': 'text/html' } }));
      assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), undefined);
      assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), true, `status ${status}`);
    }
    refreshing(() => HttpResponse.json({ error: 'temporarily_unavailable' }, { status: 503 }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), undefined);
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), true);
  });

  test('a due token whose refresh token has lapsed is gone, and no request is made', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, { ...grant('at-1'), refreshExpiresInSeconds: 3600 }, FROM, T0);
    const asked = refreshing(() => HttpResponse.json({ access_token: 'never' }));
    assert.equal(await held(root, 'github', GITHUB, T0 + 9 * HOUR), undefined);
    assert.equal(asked.length, 0);
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', GITHUB)), false);
  });
});

describe('tokened: a spawn is handed the token files on `mcpTokenFiles`, and the task’s config is untouched', () => {
  const spawning = () => {
    const spawned: SpawnRequest[] = [];
    const ops = {
      spawn: (r: SpawnRequest) =>
        Effect.sync(() => {
          spawned.push(r);
        }),
    };
    return { spawned, ops };
  };

  test('the path of a held file rides `mcpTokenFiles` alone: `config` is byte-identical and no token is anywhere in the request', async () => {
    const root = scratch('ae-mcp-token-');
    holdToken(root, 'github', GITHUB, grant('planted-token'), FROM, Date.now());
    const { spawned, ops } = spawning();
    const config = { mcp: { github: GITHUB, local: { command: 'npx' } } };
    const before = JSON.stringify(config);
    await Effect.runPromise(tokened(ops, root).spawn({ name: 'ae/t/1', brief: 'work', cwd: root, config }));
    assert.deepEqual(spawned[0]?.mcpTokenFiles, { github: tokenFileOf(root, 'github', GITHUB) });
    assert.equal(JSON.stringify(spawned[0]?.config), before);
    assert.equal(JSON.stringify(spawned[0]).includes('planted-token'), false);
  });

  test('a task with no remote server, or none signed in to, is spawned as it was', async () => {
    const root = scratch('ae-mcp-token-');
    const { spawned, ops } = spawning();
    const wrapped = tokened(ops, root);
    await Effect.runPromise(wrapped.spawn({ name: 'ae/t/1', brief: 'work', cwd: root }));
    await Effect.runPromise(wrapped.spawn({ name: 'ae/t/2', brief: 'work', cwd: root, config: { mcp: { github: GITHUB } } }));
    assert.deepEqual(
      spawned.map((r) => r.mcpTokenFiles),
      [undefined, undefined],
    );
  });
});

test('keptRequest, which an attached session’s run file holds, carries the token files and no brief', () => {
  const kept = keptRequest({ name: 'ae/t/1', brief: 'work', cwd: '/x', mcpTokenFiles: { github: '/store/mcp-tokens/github-1.json' } });
  assert.deepEqual(kept.mcpTokenFiles, { github: '/store/mcp-tokens/github-1.json' });
  assert.equal('brief' in kept, false);
});

test('withTokenHelpers lays a quoted headersHelper on a named server, no Authorization, and leaves another as it is', () => {
  const servers = { github: GITHUB, other: { type: 'http', url: 'https://other.example/mcp' } };
  const given = withTokenHelpers(servers, { github: "/store/it's/github.json" });
  assert.deepEqual(given, {
    github: {
      ...GITHUB,
      headersHelper: `'${process.execPath}' '${MCP_HEADERS_BIN}' '/store/it'\\''s/github.json'`,
    },
    other: servers.other,
  });
  assert.equal(withTokenHelpers(servers, undefined), servers);
});
