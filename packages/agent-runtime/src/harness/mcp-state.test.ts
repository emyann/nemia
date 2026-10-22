/**
 * The state a harness reports of a record's servers (`mcpServersRead`), over an ask of a test's own, which counts the sessions
 * opened: the real ask spawns Claude Code, which no node test does.
 *
 * The two things that matter, each with the fixture that breaks it: one session for a whole record, never one per server; and a look
 * that failed answered as a failure, never as an empty list, which a caller would read as "this factory records no server".
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersRead, MCP_STATE_MS, type McpStatusAsk } from './mcp-state.ts';
import { mcpStateRefusal } from '../service/options.ts';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer } from './seam.ts';

/** Three servers of one factory, one with a toolset header and an oauth client, as a record holds them. */
const THREE: Record<string, RemoteMcpServer> = {
  github: {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': 'actions,repos' },
    oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
  },
  docs: { type: 'http', url: 'https://docs.example/mcp' },
  feed: { type: 'sse', url: 'https://feed.example/sse' },
};

/** An ask that answers `said` and writes down every session it was opened for, with the servers it was handed. */
const asking = (said: readonly McpServerStatus[] | Error) => {
  const opened: Array<Record<string, RemoteMcpServer>> = [];
  const ask: McpStatusAsk = async (servers) => {
    opened.push(servers);
    if (said instanceof Error) throw said;
    return said;
  };
  return { ask, opened };
};

const statusOf = (name: string, status: McpServerStatus['status'], more: Partial<McpServerStatus> = {}): McpServerStatus => ({
  name,
  status,
  ...more,
});

test('a record of three servers is read in one session, never three, and each server is handed as mcpServerOf spells it', async () => {
  const { ask, opened } = asking([
    statusOf('github', 'connected', { tools: [{ name: 'get_me' }, { name: 'list_issues' }] }),
    statusOf('docs', 'needs-auth'),
    statusOf('feed', 'failed', { error: 'connect ECONNREFUSED' }),
  ]);
  const read = await mcpServersRead(THREE, '/tmp', { ask });
  assert.equal(opened.length, 1, 'one session for the whole record: a session per server would be three CLI spawns of seconds each');
  assert.deepEqual(Object.keys(opened[0]), ['github', 'docs', 'feed'], 'every server of the record in that one session');
  assert.equal(
    JSON.stringify(opened[0].github),
    JSON.stringify(mcpServerOf(THREE.github)),
    'handed as the one producer spells it, so the bytes judged are the bytes a step gets and the sign-in is found',
  );
  assert.deepEqual(read, {
    read: true,
    servers: [
      { name: 'github', status: 'connected', tools: 2 },
      { name: 'docs', status: 'needs-auth' },
      { name: 'feed', status: 'failed', error: 'connect ECONNREFUSED' },
    ],
  });
});

test('a look that failed answers a failure, never an empty list: an absence read off a failed look is not an absence', async () => {
  const { ask, opened } = asking(new Error('spawn claude ENOENT'));
  const read = await mcpServersRead(THREE, '/tmp', { ask });
  assert.equal(opened.length, 1, 'the session was opened');
  assert.equal(read.read, false, 'read: false — an empty list would read as "this factory records no server" and blank the board');
  assert.match(read.read === false ? read.why : '', /3 server\(s\) could not be read: spawn claude ENOENT/);
  assert.equal('servers' in read, false, 'and it names no server: there is nothing to say of one');
});

test('a server the harness named nothing of is pending, not dropped: every server of the record is named once', async () => {
  const { ask } = asking([statusOf('github', 'connected', { tools: [] })]);
  assert.deepEqual(await mcpServersRead(THREE, '/tmp', { ask }), {
    read: true,
    servers: [
      { name: 'github', status: 'connected', tools: 0 },
      { name: 'docs', status: 'pending' },
      { name: 'feed', status: 'pending' },
    ],
  });
});

test('a state word this runtime does not know is a failed look, never carried as if it were one of the five', async () => {
  const { ask } = asking([statusOf('github', 'half-connected' as McpServerStatus['status'])]);
  const read = await mcpServersRead({ github: THREE.github }, '/tmp', { ask });
  assert.equal(read.read, false, 'a sixth word a newer Claude Code grew is not read as connected');
  assert.match(read.read === false ? read.why : '', /is no state this runtime knows \(connected, needs-auth, failed, pending, disabled\)/);
  assert.match(read.read === false ? read.why : '', /add it to MCP_STATES/, 'and the sentence names the fix');
});

test('a read that never answers is a failed look once its bound is past, and the bound is named in the sentence', async () => {
  const ask: McpStatusAsk = () => new Promise(() => {});
  const read = await mcpServersRead({ github: THREE.github }, '/tmp', { ask, withinMs: 20 });
  assert.equal(read.read, false, 'a harness that never answers does not hold the tick for ever');
  assert.match(read.read === false ? read.why : '', /read no state within 0.02s/);
  assert.ok(MCP_STATE_MS > 5_000, 'and the shipped bound leaves the harness its 5s per server');
});

test('a record a state cannot be read of is refused by name, in sentences that say what to do', () => {
  assert.equal(mcpStateRefusal(THREE), undefined);
  assert.match(mcpStateRefusal(undefined)!, /takes a map of remote MCP servers by name.*it was handed undefined/s);
  assert.match(mcpStateRefusal([THREE.docs])!, /takes a map of remote MCP servers by name/);
  assert.match(mcpStateRefusal({})!, /takes at least one server, and was handed none/);
  assert.match(
    mcpStateRefusal({ local: { command: 'npx' } })!,
    /`local` is not a remote server.*a server the harness starts has no connection to report/s,
  );
  assert.match(mcpStateRefusal({ github: THREE.github, local: { command: 'npx' } })!, /`local` is not a remote server/);
});
