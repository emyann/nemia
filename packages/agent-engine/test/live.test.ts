/**
 * Against the real harness — skipped unless `AE_LIVE=1`, because it spends money.
 *
 * `--tools` was wired having been verified only as far as `claude --help`, and a fence proven by a
 * flag's help text is the kind of guard that has been silently inert before. So this runs a real
 * `--bg` session told to write a file with no tool that can, beside a control identical but for
 * `tools` — without the control, a session that never ran would pass the first assertion too.
 *
 * The MCP fence gets the same: a session filed with no `mcp`, in an empty directory, on a machine
 * whose operator has servers, claude.ai connectors and Claude in Chrome, must report no MCP server and
 * no MCP tool — beside a control given one server, which must report that server and its tool.
 * Servers connect after a `--bg` session starts, so the brief waits for them. The first run did not:
 * both sessions answered while their servers were still connecting — Chrome among them, under strict.
 *
 *   AE_LIVE=1 node --test test/live.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngine, type Engine, type TaskView } from '../src/facade.ts';

const live = process.env.AE_LIVE === '1';
const skip = live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';
const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-live-${label}-`));

/** Tick until every task has settled or ten minutes pass, check, and leave no session behind. */
const settleThenCheck = async (engine: Engine, ids: Record<string, string>, check: (views: Record<string, TaskView>) => void) => {
  const views: Record<string, TaskView> = {};
  try {
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await engine.tick();
      for (const [k, id] of Object.entries(ids)) views[k] = await engine.view(id);
      if (Object.values(views).every((v) => v.state.settled)) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    check(views);
  } finally {
    // Settled sessions stay in the harness's registry (open issue 3); leave nothing running behind.
    for (const v of Object.values(views)) {
      if (!v.sessionId) continue;
      const short = v.sessionId.split('-')[0]!;
      for (const verb of ['stop', 'rm']) {
        try { execFileSync('claude', [verb, short], { stdio: 'ignore', timeout: 30_000 }); } catch { /* best effort */ }
      }
    }
  }
};

const BRIEF = [
  'Create a file named PROOF.txt in the current directory, containing the word ok.',
  'Use a tool you have. If none of your tools can create a file, do not look for another way.',
  'Either way, finish by giving your closing statement.',
].join(' ');
const CLOSEOUT = {
  type: 'object',
  properties: { wrote: { type: 'boolean' } },
  required: ['wrote'],
  additionalProperties: false,
};

test('a --bg session with tools: Read, Grep, Glob cannot write a file; the same brief without them does', {
  skip,
  timeout: 12 * 60_000,
}, async () => {
  // Shipped defaults: the built-in harnesses, `claude` first, `auto` permission mode.
  const engine = createEngine({ root: tmp('board') });
  const fenced = tmp('fenced');
  const open = tmp('open');
  const common = { brief: BRIEF, closeoutSchema: CLOSEOUT, deadlineSeconds: 480, effort: 'low' };
  const ids = {
    fenced: await engine.file({ ...common, cwd: fenced, tools: ['Read', 'Grep', 'Glob'] }),
    open: await engine.file({ ...common, cwd: open }),
  };

  await settleThenCheck(engine, ids, (views) => {
    assert.equal(views.open?.state.settled, 'succeeded', `control settled: ${views.open?.phase}`);
    assert.ok(fs.existsSync(path.join(open, 'PROOF.txt')), 'control: the brief does get a file written when a tool can');

    assert.equal(views.fenced?.state.settled, 'succeeded', `fenced settled: ${views.fenced?.phase}`);
    assert.equal(fs.existsSync(path.join(fenced, 'PROOF.txt')), false, 'the fence held: no tool, no file');
    // `--tools` must not take away the tool a closing statement is made with.
    assert.notEqual(views.fenced?.state.attempts.at(-1)?.closeout, undefined, 'the fenced session still gave its closeout');
  });
});

const MCP_BRIEF = [
  'Some MCP servers may still be connecting when you start, and you are told which.',
  'While you are told that any server is still connecting, run `sleep 15` with your Bash tool and look again, at most six times.',
  'Then give your closing statement: in mcpServers, the name of every MCP server you have been told of, connected, connecting or failed;',
  'in mcpTools, the exact name of every tool you have whose name begins with mcp__, loaded or deferred. Use an empty list for none.',
  'Call no MCP tool, and no tool at all except Bash for the sleep and the one that gives your closing statement.',
].join(' ');
const MCP_CLOSEOUT = {
  type: 'object',
  properties: {
    mcpServers: { type: 'array', items: { type: 'string' } },
    mcpTools: { type: 'array', items: { type: 'string' } },
  },
  required: ['mcpServers', 'mcpTools'],
  additionalProperties: false,
};

/** The smallest MCP server: newline-delimited JSON-RPC on stdio, with one tool, `ping`. */
const PROBE_SERVER = `
import readline from 'node:readline';
const send = (m) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...m }) + '\\n');
readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') send({ id: msg.id, result: { protocolVersion: msg.params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'aeprobe', version: '1.0.0' } } });
  else if (msg.method === 'tools/list') send({ id: msg.id, result: { tools: [{ name: 'ping', description: 'Answers pong.', inputSchema: { type: 'object', properties: {} } }] } });
  else if (msg.method === 'tools/call') send({ id: msg.id, result: { content: [{ type: 'text', text: 'pong' }] } });
  else if (msg.method === 'ping') send({ id: msg.id, result: {} });
  else send({ id: msg.id, error: { code: -32601, message: 'no such method' } });
});
`;

test("a --bg session filed with no mcp, in an empty directory, has no MCP tools — not the operator's; one given a server has its tool", {
  skip,
  timeout: 12 * 60_000,
}, async () => {
  const engine = createEngine({ root: tmp('mcp-board') });
  const server = path.join(tmp('mcp-server'), 'server.mjs');
  fs.writeFileSync(server, PROBE_SERVER);
  const common = { brief: MCP_BRIEF, closeoutSchema: MCP_CLOSEOUT, deadlineSeconds: 480, effort: 'low' };
  const ids = {
    bare: await engine.file({ ...common, cwd: tmp('mcp-bare') }),
    given: await engine.file({ ...common, cwd: tmp('mcp-given'), mcp: { aeprobe: { command: process.execPath, args: [server] } } }),
  };

  await settleThenCheck(engine, ids, (views) => {
    const said = (k: string) => views[k]?.state.attempts.at(-1)?.closeout as { mcpServers?: string[]; mcpTools?: string[] } | undefined;
    assert.equal(views.given?.state.settled, 'succeeded', `control settled: ${views.given?.phase}`);
    // Without the control, a session that answered before its servers connected passes the next assertion.
    assert.ok(said('given')?.mcpTools?.includes('mcp__aeprobe__ping'), `control: a session given a server reports its tool; it said ${JSON.stringify(said('given'))}`);
    assert.deepEqual(said('given')?.mcpServers, ['aeprobe'], 'and that server only');

    assert.equal(views.bare?.state.settled, 'succeeded', `bare settled: ${views.bare?.phase}`);
    assert.deepEqual(said('bare'), { mcpServers: [], mcpTools: [] }, "no mcp and no .mcp.json: none of the operator's servers, connectors or Chrome");
  });
});
