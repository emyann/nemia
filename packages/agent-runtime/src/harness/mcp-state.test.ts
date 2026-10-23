/**
 * The state a harness reports of a record's servers (`mcpServersRead`), over an ask of a test's own, which counts the sessions
 * opened: the real ask spawns Claude Code, which no node test does.
 *
 * The two things that matter, each with the fixture that breaks it: one session for a whole record, never one per server; and a look
 * that failed answered as a failure, never as an empty list, which a caller would read as "this factory records no server". And two
 * the caller cannot see: the session is opened in the cwd it was given, and an ask still waiting when the bound is up is stopped
 * rather than left running.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { McpServerStatus } from '@anthropic-ai/claude-agent-sdk';
import { mcpServersRead, MCP_STATE_MS, type McpStatusAsk } from './mcp-state.ts';
import { mcpStateRefusal } from '../service/options.ts';
import { mcpServerOf } from './mcp.ts';
import type { RemoteMcpServer } from './seam.ts';

/**
 * Three servers of one factory, one with two headers out of their sorted order and an oauth client, as a record holds them: the
 * headers' order is what tells a server handed raw from one handed as `mcpServerOf` spells it.
 */
const THREE: Record<string, RemoteMcpServer> = {
  github: {
    type: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    headers: { 'X-MCP-Toolsets': 'actions,repos', 'X-MCP-Readonly': 'true' },
    oauth: { clientId: 'Iv23liQBfm9prqhvXkuY', callbackPort: 8791 },
  },
  docs: { type: 'http', url: 'https://docs.example/mcp' },
  feed: { type: 'sse', url: 'https://feed.example/sse' },
};

/** An ask that answers `said` and writes down every session it was opened for: the servers it was handed, and where it was opened. */
const asking = (said: readonly McpServerStatus[] | Error) => {
  const opened: Array<Record<string, RemoteMcpServer>> = [];
  const at: string[] = [];
  const ask: McpStatusAsk = async (servers, cwd) => {
    opened.push(servers);
    at.push(cwd);
    if (said instanceof Error) throw said;
    return said;
  };
  return { ask, opened, at };
};

const statusOf = (name: string, status: McpServerStatus['status'], more: Partial<McpServerStatus> = {}): McpServerStatus => ({
  name,
  status,
  ...more,
});

test('mcpServersRead: one session for a record, a failed look answered as a failure, in the cwd it was given, stopped at its bound', async (t) => {
  await t.test(
    'a record of three servers is read in one session, never three, and each server is handed as mcpServerOf spells it',
    async () => {
      const { ask, opened, at } = asking([
        statusOf('github', 'connected', { tools: [{ name: 'get_me' }, { name: 'list_issues' }] }),
        statusOf('docs', 'needs-auth'),
        statusOf('feed', 'failed', { error: 'connect ECONNREFUSED' }),
      ]);
      const read = await mcpServersRead(THREE, '/tmp', { ask });
      assert.equal(opened.length, 1, 'one session for the whole record: a session per server would be three CLI spawns of seconds each');
      assert.deepEqual(
        at,
        ['/tmp'],
        "opened where the caller said, which the engine's verb makes its own root and never the process's cwd",
      );
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
    },
  );

  await t.test(
    'a look that failed answers a failure, never an empty list: an absence read off a failed look is not an absence',
    async () => {
      const { ask, opened } = asking(new Error('spawn claude ENOENT'));
      const read = await mcpServersRead(THREE, '/tmp', { ask });
      assert.equal(opened.length, 1, 'the session was opened');
      assert.equal(read.read, false, 'read: false — an empty list would read as "this factory records no server" and blank the board');
      assert.match(read.read === false ? read.why : '', /3 server\(s\) could not be read: spawn claude ENOENT/);
      assert.equal('servers' in read, false, 'and it names no server: there is nothing to say of one');
    },
  );

  await t.test('a server the harness named nothing of is pending, not dropped: every server of the record is named once', async () => {
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

  await t.test('a state word this runtime does not know is a failed look, never carried as if it were one of the five', async () => {
    const { ask } = asking([statusOf('github', 'half-connected' as McpServerStatus['status'])]);
    const read = await mcpServersRead({ github: THREE.github }, '/tmp', { ask });
    assert.equal(read.read, false, 'a sixth word a newer Claude Code grew is not read as connected');
    assert.match(read.read === false ? read.why : '', /half-connected/, 'the word it was told');
    assert.match(read.read === false ? read.why : '', /connected, needs-auth, failed, pending, disabled/, 'the five it knows');
    assert.match(read.read === false ? read.why : '', /add it to MCP_STATES/, 'and the sentence names the fix');
  });

  await t.test('a read that never answers is a failed look once its bound is past, and the bound is named in the sentence', async () => {
    const ask: McpStatusAsk = () => new Promise(() => {});
    const read = await mcpServersRead({ github: THREE.github }, '/tmp', { ask, withinMs: 20 });
    assert.equal(read.read, false, 'a harness that never answers does not hold the tick for ever');
    assert.match(read.read === false ? read.why : '', /read no state within 0.02s/);
    assert.ok(MCP_STATE_MS > 5_000, 'and the shipped bound leaves the harness its 5s per server');
  });

  await t.test('the session is opened in the cwd the caller named, whatever the process is in', async () => {
    const { ask, at } = asking([statusOf('docs', 'connected')]);
    const was = process.cwd();
    await mcpServersRead({ docs: THREE.docs }, '/var/empty/named-root', { ask });
    assert.deepEqual(at, ['/var/empty/named-root'], 'the caller names the folder the servers are read in');
    assert.notEqual(at[0], was, "and not the process's own, which is what a dropped argument would leave");
  });

  await t.test('a read that runs past its bound stops the ask it was waiting on, as a server that hangs on connect makes one', async () => {
    let stopped: string | undefined;
    let release = () => {};
    const waited = new Promise<void>((resolve) => {
      release = resolve;
    });
    const ask: McpStatusAsk = (_servers, _cwd, _executable, stop) =>
      new Promise<never>((_, reject) => {
        stop.addEventListener(
          'abort',
          () => {
            stopped = 'the ask was stopped by the bound';
            release();
            reject(new Error('stopped'));
          },
          { once: true },
        );
      });
    const read = await mcpServersRead({ docs: THREE.docs }, '/tmp', { ask, withinMs: 20 });
    assert.equal(read.read, false, 'the bound answers that the look failed');
    await waited;
    assert.equal(stopped, 'the ask was stopped by the bound', 'and the ask is aborted: losing the race does not stop what lost it');
  });
});

test('mcpStateRefusal: a record a state cannot be read of is refused by name, saying what to do', async (t) => {
  const rows: { name: string; given: unknown; said: readonly RegExp[] }[] = [
    {
      name: 'no record at all names what it was handed',
      given: undefined,
      said: [/takes a map of remote MCP servers by name/, /it was handed undefined/],
    },
    { name: 'a list is no map by name', given: [THREE.docs], said: [/takes a map of remote MCP servers by name/] },
    { name: 'an empty map takes at least one server', given: {}, said: [/takes at least one server, and was handed none/] },
    {
      name: 'a server the harness starts is no remote server, and has no connection to report',
      given: { local: { command: 'npx' } },
      said: [/`local` is not a remote server/, /a server the harness starts has no connection to report/],
    },
    {
      name: 'one such server among remote ones is named',
      given: { github: THREE.github, local: { command: 'npx' } },
      said: [/`local` is not a remote server/],
    },
  ];
  await t.test('a record of remote servers is no refusal', () => assert.equal(mcpStateRefusal(THREE), undefined));
  for (const row of rows)
    await t.test(row.name, () => {
      const why = mcpStateRefusal(row.given);
      assert.equal(typeof why, 'string');
      for (const said of row.said) assert.match(why!, said);
    });
});
