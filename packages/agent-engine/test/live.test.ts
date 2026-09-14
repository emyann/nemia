/**
 * Against the real harness — skipped unless `AE_LIVE=1`, because it spends money.
 *
 * `--tools` was wired having been verified only as far as `claude --help`, and a fence proven by a
 * flag's help text is the kind of guard that has been silently inert before. So this runs a real
 * `--bg` session told to write a file with no tool that can, beside a control identical but for
 * `tools` — without the control, a session that never ran would pass the first assertion too.
 *
 * `--disallowedTools` gets the same, on `--bg` and not only `-p`: a session told to run `npm run build` and
 * `npm run e2e`, beside a control identical but for `disallowedTools`. The control must run both, or the fenced
 * one running neither proves nothing — and the first version's did not. Both ran in `dontAsk` in a checkout whose
 * `.claude/settings.json` allows the two commands, as this repository's does for implement's check; the checkout
 * was a temporary directory, and the control was refused with dontAsk's own message: a `--bg` session there was
 * not given the directory's settings (the directory is untrusted, the likely reason). So the checkouts are made
 * inside this package, and the test is run from a checkout Claude Code trusts.
 *
 * The MCP fence gets the same: a session filed with no `mcp`, in an empty directory, on a machine
 * whose operator has servers, claude.ai connectors and Claude in Chrome, must report no MCP server and
 * no MCP tool — beside a control given one server, which must report that server and its tool.
 * Servers connect after a `--bg` session starts, so the brief waits for them. The first run did not:
 * both sessions answered while their servers were still connecting — Chrome among them, under strict.
 *
 * And the engine's release of a settled session is measured before it is trusted: `claude rm` could
 * have taken the transcript with it. So a session is told a word, settles and is released; then
 * `ae logs` must still read it, and a second task resuming it must still say the word.
 *
 *   AE_LIVE=1 node --test test/live.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
    // The engine releases a session once its end is on the record; this is for one that never got that far.
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

const DENY_BRIEF = [
  'Run these two commands with your Bash tool, one call each, in this order: `npm run build`, then `npm run e2e`.',
  'Write each exactly as given, adding nothing to it, and run nothing else. If one is denied, do not look for another way to run it.',
  'Then give your closing statement: in denied, each of the two commands that was denied, or an empty list.',
].join(' ');
const DENY_CLOSEOUT = {
  type: 'object',
  properties: { denied: { type: 'array', items: { type: 'string' } } },
  required: ['denied'],
  additionalProperties: false,
};
const WRITTEN = ['BUILT', 'E2E'];

/**
 * A checkout as this repository's review has one: its settings allow both commands, and each writes a file into it.
 * Made inside this package, not in `os.tmpdir()`, whose directories Claude Code does not trust.
 */
const allowingCheckout = (label: string) => {
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, '..', `.ae-live-${label}-`));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'probe', private: true, scripts: { build: 'touch BUILT', e2e: 'touch E2E' } }));
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow: ['Bash(npm run build)', 'Bash(npm run e2e)'] } }));
  return dir;
};

test('a --bg session in dontAsk, in a checkout whose settings allow npm run build and npm run e2e, runs neither when disallowedTools names both; the same session without it runs both', {
  skip,
  timeout: 12 * 60_000,
}, async () => {
  const engine = createEngine({ root: tmp('deny-board') });
  const fenced = allowingCheckout('deny-fenced');
  const open = allowingCheckout('deny-open');
  // The shipped reviewer's fence, less what this does not need: Bash only, in dontAsk.
  const common = { brief: DENY_BRIEF, closeoutSchema: DENY_CLOSEOUT, deadlineSeconds: 480, model: 'haiku', permissionMode: 'dontAsk', tools: ['Bash'] };
  try {
    const ids = {
      fenced: await engine.file({ ...common, cwd: fenced, disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)'] }),
      open: await engine.file({ ...common, cwd: open }),
    };

    await settleThenCheck(engine, ids, (views) => {
      const said = (k: string) => JSON.stringify(views[k]?.state.attempts.at(-1)?.closeout);
      assert.equal(views.open?.state.settled, 'succeeded', `control settled: ${views.open?.phase}`);
      assert.deepEqual(WRITTEN.filter((f) => fs.existsSync(path.join(open, f))), WRITTEN,
        `control: the settings allow both, and both ran — refused, the checkout's settings were not applied: run this from a checkout Claude Code trusts. It said ${said('open')}`);

      assert.equal(views.fenced?.state.settled, 'succeeded', `fenced settled: ${views.fenced?.phase}`);
      assert.deepEqual(WRITTEN.filter((f) => fs.existsSync(path.join(fenced, f))), [], `the deny beat the allow: neither ran; it said ${said('fenced')}`);
      assert.notEqual(views.fenced?.state.attempts.at(-1)?.closeout, undefined, 'and the fenced session still gave its closeout');
    });
  } finally {
    for (const dir of [fenced, open]) fs.rmSync(dir, { recursive: true, force: true });
  }
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

const WORD_CLOSEOUT = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
};

test('a settled --bg session is stopped and removed from claude agents — and ae logs still reads it, and --resume still continues it', {
  skip,
  timeout: 25 * 60_000,
}, async () => {
  const engine = createEngine({ root: tmp('release-board') });
  const cwd = tmp('release');
  const word = `ae${randomUUID().slice(0, 8)}`;
  const agents = () => JSON.parse(execFileSync('claude', ['agents', '--all', '--json'], { encoding: 'utf8', timeout: 60_000 })) as Array<{ sessionId?: string }>;
  const settled = async (id: string) => {
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await engine.tick();
      const v = await engine.view(id);
      if (v.state.settled) return v;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return engine.view(id);
  };
  const sessions = new Set<string>();
  const common = { cwd, deadlineSeconds: 480, model: 'haiku', closeoutSchema: WORD_CLOSEOUT };
  try {
    const firstId = await engine.file({ ...common, brief: `The code word is ${word}. Remember it, and do nothing else. Then give your closing statement, with word set to ok.` });
    const first = await settled(firstId);
    if (first.sessionId) sessions.add(first.sessionId);
    const id = first.state.attempts.at(-1)?.nativeId ?? undefined;
    assert.equal(first.state.settled, 'succeeded', `first settled: ${first.phase}`);
    assert.ok(id, 'its session id is on the record');
    assert.equal(agents().some((r) => r.sessionId === id), false, 'released in the pass that settled it: not in claude agents');
    assert.match(await engine.logs(firstId), new RegExp(word), 'ae logs still reads the removed session');

    const secondId = await engine.file({ ...common, resumeFrom: id, brief: 'What was the code word you were given? Give it as word in your closing statement.' });
    const second = await settled(secondId);
    if (second.sessionId) sessions.add(second.sessionId);
    assert.equal(second.state.settled, 'succeeded', `resumed settled: ${second.phase}`);
    assert.deepEqual(second.state.attempts.at(-1)?.closeout, { word }, 'the removed session was resumed, and remembered its word');
    assert.equal(agents().some((r) => r.sessionId === second.sessionId), false, 'and the resumed one was released too');
  } finally {
    for (const s of sessions) {
      for (const verb of ['stop', 'rm']) {
        try { execFileSync('claude', [verb, s.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 }); } catch { /* released already */ }
      }
    }
  }
});
