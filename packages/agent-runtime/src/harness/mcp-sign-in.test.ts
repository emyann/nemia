/**
 * The harness half of a browser sign-in, over a CLI of a test's own that writes down each argv and environment it was handed: the real
 * one spawns Claude Code, which no node test does.
 *
 * What matters, each with the fixture that breaks it: the server is added at `--scope local`, never a scope that reaches the owner's
 * own sessions; its headers go in `mcpServerOf`'s order, which is the order the sign-in's key is computed over; no add is given a
 * client secret; and a refusal of the CLI's is carried.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { clearSignIn, mcpAddArgs, type CliRun, type McpCli } from './mcp-sign-in.ts';
import type { RemoteMcpServer } from './seam.ts';

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

test("the add's headers go in mcpServerOf's order, the order the sign-in's key is computed over, and the name and url come last", () => {
  const args = mcpAddArgs('github', GITHUB);
  const headers = args.flatMap((a, i) => (args[i - 1] === '--header' ? [a] : []));
  assert.deepEqual(headers, ['X-MCP-Readonly: false', 'X-MCP-Toolsets: context,repos'], 'sorted by name, as mcpServerOf spells them');
  assert.deepEqual(args.slice(-2), ['github', 'https://api.githubcopilot.com/mcp/']);
  assert.deepEqual(args.slice(0, 6), ['mcp', 'add', '--scope', 'local', '--transport', 'http']);
  assert.deepEqual(Object.keys(GITHUB.headers!), ['X-MCP-Toolsets', 'X-MCP-Readonly'], 'the record lists its headers unsorted');
  const reversed = mcpAddArgs('github', { ...GITHUB, headers: { 'X-MCP-Readonly': 'false', 'X-MCP-Toolsets': 'context,repos' } });
  assert.deepEqual(reversed, args, 'a record that lists its headers in another order files the same key');
});

describe('clearSignIn: a sign-out adds the server, then removes it, and what the CLI refuses', () => {
  test('a sign-out adds the server, then removes it at --scope local: a remove finds the token only through an added server', async () => {
    const ok = recording();
    assert.equal(await clearSignIn(ok.cli, 'github', GITHUB, '/var/empty/root/mcp-sign-in'), undefined);
    assert.deepEqual(
      ok.calls.map((c) => c.args.slice(0, 2)),
      [
        ['mcp', 'add'],
        ['mcp', 'remove'],
      ],
    );
    assert.deepEqual(ok.calls[0].args, mcpAddArgs('github', GITHUB), 'the add files the key a sign-in files');
    assert.equal(ok.calls[0].args.includes('--client-secret'), false, 'no add is given a client secret');
    assert.deepEqual(ok.calls[1].args, ['mcp', 'remove', '--scope', 'local', 'github']);
  });
  test('a sign-out whose add the CLI refuses, as it refuses a server already added, still removes', async () => {
    const added = recording((args) =>
      args[1] === 'add' ? { code: 1, out: 'MCP server github already exists in local config' } : { code: 0, out: '' },
    );
    assert.equal(await clearSignIn(added.cli, 'github', GITHUB, '/var/empty/root'), undefined);
    assert.deepEqual(
      added.calls.map((c) => c.args.slice(0, 2)),
      [
        ['mcp', 'add'],
        ['mcp', 'remove'],
      ],
      'the remove still ran',
    );
  });
  test('a remove the CLI turned down is the refusal', async () => {
    const failing = recording((args) => (args[1] === 'remove' ? { code: 1, out: 'cannot write the config' } : { code: 0, out: '' }));
    assert.equal(typeof (await clearSignIn(failing.cli, 'github', GITHUB, '/var/empty/root')), 'string');
  });
});
