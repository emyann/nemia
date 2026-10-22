/**
 * The harness half of a sign-in, over a CLI of a test's own that writes down each argv and environment it was handed: the real one
 * spawns Claude Code, which no node test does.
 *
 * What matters, each with the fixture that breaks it: the secret rides `MCP_CLIENT_SECRET` alone and never the argv; the server is
 * added at `--scope local`, never a scope that reaches the owner's own sessions; its headers go in `mcpServerOf`'s order, which is
 * the order the stored secret's key is computed over; and no refusal quotes the secret back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearSignIn, mcpAddArgs, storeClientSecret, type CliRun, type McpCli } from './mcp-sign-in.ts';
import type { RemoteMcpServer } from './seam.ts';

const SECRET = 'not-a-real-secret-0123456789abcdef';

const GITHUB: RemoteMcpServer = {
  type: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  headers: { 'X-MCP-Toolsets': 'context,repos', 'X-MCP-Readonly': 'false' },
  oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
};

/** A CLI that answers `answer` for each call and writes down its argv, its cwd and its environment. */
const recording = (answer: (args: readonly string[], env: NodeJS.ProcessEnv) => CliRun = () => ({ code: 0, out: '' })) => {
  const calls: Array<{ args: readonly string[]; cwd: string; env: NodeJS.ProcessEnv }> = [];
  const cli: McpCli = async (args, { cwd, env }) => {
    calls.push({ args, cwd, env });
    return answer(args, env);
  };
  return { cli, calls };
};

/** Whether a call's argv carries the secret anywhere. */
const argvCarries = (args: readonly string[], secret: string) => args.some((a) => a.includes(secret));

test('the secret is stored by remove then add, at --scope local, the secret in MCP_CLIENT_SECRET and never in the argv', async () => {
  const { cli, calls } = recording();
  const why = await storeClientSecret(cli, 'github', GITHUB, SECRET, '/var/empty/root/mcp-sign-in');
  assert.equal(why, undefined);
  assert.deepEqual(
    calls.map((c) => c.args.slice(0, 2)),
    [
      ['mcp', 'remove'],
      ['mcp', 'add'],
    ],
    'an earlier add under the name is removed first, since the CLI refuses a second',
  );
  for (const c of calls) {
    assert.equal(
      c.args[c.args.indexOf('--scope') + 1],
      'local',
      'local scope: the owner’s own sessions in their own checkouts do not gain the server',
    );
    assert.equal(argvCarries(c.args, SECRET), false, 'the argv is in /proc/<pid>/cmdline, readable by every process of the user');
    assert.equal(c.cwd, '/var/empty/root/mcp-sign-in', 'run in the folder the caller names, under the engine’s root');
  }
  assert.equal(calls[1].env.MCP_CLIENT_SECRET, SECRET, 'the add reads the secret from its environment');
  assert.equal(calls[0].env.MCP_CLIENT_SECRET, undefined, 'the remove is handed no secret');
  const add = calls[1].args;
  assert.equal(
    add[add.indexOf('--client-secret') + 1],
    '--callback-port',
    '--client-secret is given no value: the CLI reads the environment',
  );
});

test('FIXTURE: a CLI argv that carried the secret would be caught by the same assertion', () => {
  assert.equal(argvCarries(['mcp', 'add', '--client-secret', SECRET], SECRET), true);
});

test("the add's headers go in mcpServerOf's order, the order the stored secret's key is computed over, and the name and url come last", () => {
  const args = mcpAddArgs('github', GITHUB);
  const headers = args.flatMap((a, i) => (args[i - 1] === '--header' ? [a] : []));
  assert.deepEqual(headers, ['X-MCP-Readonly: false', 'X-MCP-Toolsets: context,repos'], 'sorted by name, as mcpServerOf spells them');
  assert.deepEqual(args.slice(-2), ['github', 'https://api.githubcopilot.com/mcp/']);
  assert.deepEqual(args.slice(0, 6), ['mcp', 'add', '--scope', 'local', '--transport', 'http']);
  const reversed = mcpAddArgs('github', { ...GITHUB, headers: { 'X-MCP-Toolsets': 'context,repos', 'X-MCP-Readonly': 'false' } });
  assert.deepEqual(reversed, args, 'a record that lists its headers in another order files the same key');
});

test('a failing add is refused in the CLI’s words with the secret taken out, even where the CLI echoes its environment', async () => {
  const { cli } = recording((args, env) =>
    args[1] === 'add' ? { code: 1, out: `error: bad client, MCP_CLIENT_SECRET=${env.MCP_CLIENT_SECRET}` } : { code: 1, out: 'not found' },
  );
  const why = await storeClientSecret(cli, 'github', GITHUB, SECRET, '/var/empty/root');
  assert.ok(why, 'a failed add is a refusal, not a sign-in that will fail in the browser');
  assert.match(why, /did not store the client secret of `github` \(exit 1\)/);
  assert.equal(why.includes(SECRET), false, 'no refusal quotes the secret');
  assert.match(why, /MCP_CLIENT_SECRET=<secret>/);
});

test('a sign-out is `claude mcp remove --scope local <name>`, and a remove the CLI refuses says to sign in first', async () => {
  const ok = recording();
  assert.equal(await clearSignIn(ok.cli, 'github', '/var/empty/root/mcp-sign-in'), undefined);
  assert.deepEqual(ok.calls[0].args, ['mcp', 'remove', '--scope', 'local', 'github']);
  const refused = recording(() => ({ code: 1, out: 'No MCP server found with name: github' }));
  assert.match((await clearSignIn(refused.cli, 'github', '/var/empty/root')) ?? '', /Sign in to it first/);
});
