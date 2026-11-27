/**
 * A session that outlives its MCP server's token keeps calling the server (`bin/ae-mcp-headers.ts`, `src/harness/mcp-token.ts`): a
 * job through the real engine, worker, `bin/ae-claude-job.ts` and Agent SDK, with the stand-in Claude Code acting as its MCP client
 * (`fixtures/stand-in-claude.ts`, plan `mcp`: the helper run for each call, as Claude Code's docs say), a real local MCP server that
 * answers 200 to the one token it accepts now, and a real local token endpoint that counts its refreshes.
 *
 * What it holds: a call made after the held token lapsed carries the refreshed token and is answered; no token is in the task's
 * journal, a run file, a request file or the stand-in's argv; two helpers started at once make one refresh; a refresh the provider
 * refuses removes the token and the helper prints no header.
 *
 * Real servers over `node:http`, because the helper is a child process, which MSW cannot reach (`remote-server.ts` is the precedent).
 *
 * A boundary test: a real store, a real detached worker, the SDK's own child process, a helper child process and two HTTP servers.
 */
import { afterEach, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { until, WAITED } from '../src/waits/index.ts';
import { holdToken, tokenFileOf, TOKENS_FOLDER } from '../src/harness/mcp-token.ts';

const CONFIG = scratch('ae-helper-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;

const { Engine } = await import('../src/index.ts');
const { builtEngine } = await import('./engine.ts');
const { STAND_IN } = await import('./attached-held.ts');

const JOB_ID = '5e551011-0000-4000-8000-00000000000d';
const HELPER = path.join(import.meta.dirname, '..', 'bin', 'ae-mcp-headers.ts');
const HOUR = 3_600_000;

const closers: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

/** A local server on a port the system picks, closed after the test. */
const listening = async (handler: http.RequestListener) => {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  closers.push(() => new Promise<void>((resolve) => void server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

/** An MCP server that answers 200 to the bearer in `accepts` and 401 to any other, writing down each call's bearer and status. */
const mcpServer = async () => {
  const state = { accepts: new Set<string>(), log: [] as { bearer: string; status: number }[] };
  const url = await listening((request, response) => {
    const bearer = String(request.headers.authorization ?? '').replace('Bearer ', '');
    const status = state.accepts.has(bearer) ? 200 : 401;
    state.log.push({ bearer, status });
    response.writeHead(status).end('{}');
  });
  return { url: `${url}/mcp`, state };
};

/** A token endpoint that answers each refresh grant with `answer` after `delayMs`, counting the refresh tokens it was shown. */
const tokenEndpoint = async (answer: { status: number; body: object }, delayMs = 0) => {
  const asked: string[] = [];
  const url = await listening((request, response) => {
    let text = '';
    request.on('data', (d) => (text += String(d)));
    request.on('end', () => {
      asked.push(new URLSearchParams(text).get('refresh_token') ?? '');
      setTimeout(() => response.writeHead(answer.status, { 'content-type': 'application/json' }).end(JSON.stringify(answer.body)), delayMs);
    });
  });
  return { url: `${url}/token`, asked };
};

const REFRESHED = { status: 200, body: { access_token: 'at-2', refresh_token: 'rt-2', expires_in: 28800 } };
const grant = { accessToken: 'at-1', refreshToken: 'rt-1', expiresInSeconds: 8 * 3600, refreshExpiresInSeconds: 15_811_200 };

/** Every file under `folder` but those under `skip`, by path. */
// oxlint-disable-next-line landmines-types/no-explicit-return-types -- a recursive function's type cannot be inferred
const filesUnder = (folder: string, skip: string): string[] =>
  fs.readdirSync(folder, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(folder, e.name);
    if (full === skip) return [];
    return e.isDirectory() ? filesUnder(full, skip) : [full];
  });

describe('a job whose MCP server’s token lapsed while it ran keeps calling the server', WAITED, () => {
  test('a call after the token lapsed carries the refreshed token and is answered, and no token is written anywhere', async (t) => {
    const mcp = await mcpServer();
    const provider = await tokenEndpoint(REFRESHED);
    const root = scratch('ae-helper-job-');
    const dir = path.join(root, 'work');
    fs.mkdirSync(dir, { recursive: true });
    const server = { type: 'http' as const, url: mcp.url, oauth: { clientId: 'cid' } };
    holdToken(root, 'github', server, grant, { tokenEndpoint: provider.url, clientId: 'cid' });
    mcp.state.accepts.add('at-1');

    const engine = builtEngine(Engine.layer({ root, harnesses: { claude: 'claude' }, claudeExecutable: STAND_IN }));
    const plan = { id: JOB_ID, mcp: { calls: 2 }, output: { outcome: 'done' } };
    const taskId = await Effect.runPromise(
      engine.file({
        brief: 'call it',
        cwd: dir,
        harness: 'claude',
        closeoutSchema: { type: 'object' },
        config: { mcp: { github: server }, env: { STANDIN_DIR: dir, STANDIN_PLAN: JSON.stringify(plan) } },
      }),
    );
    t.onTestFinished(() => Effect.runPromise(Effect.ignore(engine.stop(taskId))));
    await Effect.runPromise(engine.tick());
    const calls = () =>
      fs.existsSync(path.join(dir, 'mcp.jsonl'))
        ? fs.readFileSync(path.join(dir, 'mcp.jsonl'), 'utf8').split('\n').filter(Boolean).length
        : 0;

    await until(t, () => fs.existsSync(path.join(dir, 'argv.jsonl')), 'the session started', { everyMs: 50 });
    fs.writeFileSync(path.join(dir, 'mcp-call'), '');
    await until(t, () => calls() === 1, 'the first call was made', { everyMs: 50 });

    mcp.state.accepts.clear();
    mcp.state.accepts.add('at-2');
    const before = calls();
    holdToken(root, 'github', server, grant, { tokenEndpoint: provider.url, clientId: 'cid' }, Date.now() - 9 * HOUR);
    fs.writeFileSync(path.join(dir, 'mcp-call'), '');
    await until(t, () => calls() === before + 2, 'the call after the token lapsed was refused, then retried', { everyMs: 50 });

    assert.deepEqual(mcp.state.log, [
      { bearer: 'at-1', status: 200 },
      { bearer: 'at-1', status: 401 },
      { bearer: 'at-2', status: 200 },
    ]);
    assert.deepEqual(provider.asked, ['rt-1'], 'one refresh, with the refresh token held');
    assert.equal(JSON.parse(fs.readFileSync(tokenFileOf(root, 'github', server), 'utf8')).accessToken, 'at-2');

    const argv = fs.readFileSync(path.join(dir, 'argv.jsonl'), 'utf8');
    assert.ok(argv.includes('headersHelper') && argv.includes(path.basename(HELPER)), 'argv carries the helper command');
    assert.ok(argv.includes(tokenFileOf(root, 'github', server)), 'and the token file’s path');
    const written = filesUnder(root, path.join(root, TOKENS_FOLDER)).filter((f) => /at-[12]|rt-[12]/.test(fs.readFileSync(f, 'utf8')));
    assert.deepEqual(written, [], 'no token, access or refresh, is in the journal, a run file, a request file or the stand-in’s argv');
  });
});

describe('the helper, run by Claude Code as a child process', () => {
  const run = async (file: string) => {
    const { stdout } = await promisify(execFile)(process.execPath, [HELPER, file]);
    return JSON.parse(stdout) as Record<string, string>;
  };

  test('two helpers started at once on an expired token make one refresh, and both print the new token', async () => {
    const provider = await tokenEndpoint(REFRESHED, 700);
    const root = scratch('ae-helper-race-');
    const server = { type: 'http' as const, url: 'http://127.0.0.1:9/mcp', oauth: { clientId: 'cid' } };
    holdToken(root, 'github', server, grant, { tokenEndpoint: provider.url, clientId: 'cid' }, Date.now() - 9 * HOUR);
    const both = await Promise.all([run(tokenFileOf(root, 'github', server)), run(tokenFileOf(root, 'github', server))]);
    assert.deepEqual(both, [{ Authorization: 'Bearer at-2' }, { Authorization: 'Bearer at-2' }]);
    assert.deepEqual(provider.asked, ['rt-1']);
  });

  test('a refresh the provider refuses removes the token, and the helper prints no header', async () => {
    const provider = await tokenEndpoint({ status: 400, body: { error: 'invalid_grant' } });
    const root = scratch('ae-helper-refused-');
    const server = { type: 'http' as const, url: 'http://127.0.0.1:9/mcp', oauth: { clientId: 'cid' } };
    holdToken(root, 'github', server, grant, { tokenEndpoint: provider.url, clientId: 'cid' }, Date.now() - 9 * HOUR);
    assert.deepEqual(await run(tokenFileOf(root, 'github', server)), {});
    assert.equal(fs.existsSync(tokenFileOf(root, 'github', server)), false);
  });
});
