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
 * And `say` is measured before it is trusted, because the inbox it posts to answers nothing: a session told to
 * wait for a message naming a file is told a name, and must write that file and close with its name, while an
 * identical session never told must write nothing — without it, a session that wrote a file of its own accord
 * would pass.
 *
 * And a session that ends its turn without its closing statement is measured, because bug 1 was a success recorded for
 * exactly that, and only a fake `claude` has shown the fix: told to answer in plain text and give no statement, it must
 * never be recorded `succeeded` with none. Whether Claude Code nudges such a session itself, or ends it on its own, is
 * what the diagnostic says.
 *
 * And `remoteControl` is measured under the engine, because what shows it worked is a file Claude Code writes and the
 * engine never reads: a session filed with it must be registered under `sessions/` with a `bridgeSessionId`, beside a
 * control identical but for the field, which must have none — or the flag is not what bridged it. Both have no tools,
 * so a session anyone on the account can drive from claude.ai for the minute it lives can do nothing.
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
import { Effect, Layer } from 'effect';
import { createEngine, nameFor, type Engine, type Said, type TaskView } from '../src/facade.ts';
import { file, tick, view } from '../src/engine.ts';
import { Journal } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';

const live = process.env.AE_LIVE === '1';
const skip = live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';
const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-live-${label}-`));

/**
 * Do `act`, tick until every task has settled or ten minutes pass, check, and leave no session behind — one that
 * `act` threw on included.
 */
const settleThenCheck = async (engine: Engine, ids: Record<string, string>, check: (views: Record<string, TaskView>) => void, act?: () => Promise<void>) => {
  const views: Record<string, TaskView> = {};
  try {
    await act?.();
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
    for (const [k, id] of Object.entries(ids)) {
      if (!views[k]) { try { views[k] = await engine.view(id); } catch { /* no view, nothing known to clean */ } }
    }
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

const SAY_BRIEF = [
  'You are waiting for a message from another session that names a file.',
  'Until one arrives, run `sleep 10` with your Bash tool, one call at a time, at most 30 times.',
  'When a message names a file, create that file in the current directory with your Write tool, containing the word ok, and do nothing else.',
  'Then give your closing statement: in name, the file name the message gave, or an empty string if no message came.',
].join(' ');
const NAME_CLOSEOUT = {
  type: 'object',
  properties: { name: { type: 'string' } },
  required: ['name'],
  additionalProperties: false,
};

test('say reaches a working --bg session: told a file name, it writes that file; the same session never told writes none — and the journal has what was said', {
  skip,
  timeout: 15 * 60_000,
}, async (t) => {
  // Shipped defaults: `claude`, `auto`. Bash to wait with, Write to answer with.
  const engine = createEngine({ root: tmp('say-board') });
  const told = tmp('say-told');
  const control = tmp('say-control');
  const common = { brief: SAY_BRIEF, closeoutSchema: NAME_CLOSEOUT, deadlineSeconds: 600, effort: 'low', tools: ['Bash', 'Write'] };
  const ids = {
    told: await engine.file({ ...common, cwd: told }),
    control: await engine.file({ ...common, cwd: control }),
  };
  const name = `SAID-${randomUUID().slice(0, 8)}.txt`;
  const words = `The file to write is ${name}`;
  let said: Said | undefined;

  await settleThenCheck(engine, ids, (views) => {
    assert.equal(views.told?.state.settled, 'succeeded', `told settled: ${views.told?.phase}`);
    assert.ok(fs.existsSync(path.join(told, name)), 'the told session wrote the file the words named');
    assert.deepEqual(views.told?.state.attempts.at(-1)?.closeout, { name }, 'and closed with its name');
    assert.deepEqual(views.told?.state.said, [said], 'the journal has what was said, once');

    assert.equal(views.control?.state.settled, 'succeeded', `control settled: ${views.control?.phase}`);
    assert.deepEqual(fs.readdirSync(control).filter((f) => f.startsWith('SAID-')), [], 'the control, never told, wrote nothing');
    assert.deepEqual(views.control?.state.attempts.at(-1)?.closeout, { name: '' }, 'and closed with no name');
    assert.deepEqual(views.control?.state.said, []);
  }, async () => {
    // Told once it is seen at work: listed running, in its sleep loop. Inside `settleThenCheck`, so a `say` that
    // rejects still leaves no session behind.
    const until = Date.now() + 5 * 60_000;
    while (!said && Date.now() < until) {
      await engine.tick();
      const { phase } = await engine.view(ids.told);
      if (phase === 'running (working)' || phase === 'working (quiescent)') said = await engine.say(ids.told, words);
      else await new Promise((r) => setTimeout(r, 5_000));
    }
    assert.ok(said, 'the told session was seen working within five minutes, and told');
  });

  // The session's own record has the words too, as the transcript reader gives them to a board: a system event
  // whose text is the words, or Claude Code's sentence around them on a line of their own — never the model's own
  // mention of the file's name, which would pass with the reader of words sent in broken.
  const { events } = await engine.transcript(ids.told);
  const arrived = events.filter((e) => e.role === 'system' && e.kind === 'system' && e.text?.split('\n').includes(words));
  assert.equal(arrived.length, 1, `the told session's transcript carries the words once, as a system event: ${JSON.stringify(events.filter((e) => e.kind === 'system'))}`);
  t.diagnostic(`the words arrived ${arrived[0]!.text === words ? 'while the session worked (an attachment line)' : 'while it was idle (the line that starts a turn)'}`);
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

const NOTES = Array.from({ length: 2000 }, (_, i) =>
  `line ${i + 1}: ${i % 7 === 0 ? 'a note' : 'nothing here'} — the quick brown fox jumps over the lazy dog, again and again and again`).join('\n');
/**
 * A session that spends: a long file, read fifty lines a call. Told to read one short file forty times over, haiku did once
 * (by hand) and once declined it as a waste and asked what was wanted, which Claude Code lists `blocked` — so every call
 * reads lines it has not read.
 */
const LOOP_BRIEF = [
  'NOTES.txt has 2000 lines. Read all of it with your Read tool, 50 lines per call — offset 1, then 51, then 101, and so on',
  'to the end — one call at a time, saying nothing in between. Then reply with how many of its lines say "a note".',
].join(' ');
const notesIn = (label: string) => {
  const dir = tmp(label);
  fs.writeFileSync(path.join(dir, 'NOTES.txt'), NOTES);
  return dir;
};

test('claude -p given a $0.01 budget stops at it: the attempt ends failed, reason budget, with what it cost — and its task settles failed, with no attempt 2', {
  skip,
  timeout: 12 * 60_000,
}, async (t) => {
  const engine = createEngine({ root: tmp('budget-board') });
  const ids = {
    capped: await engine.file({
      brief: LOOP_BRIEF, cwd: notesIn('budget-p'), harness: 'claude-detached', model: 'haiku', tools: ['Read'],
      budgetUsd: 0.01, maxAttempts: 2, resume: 'always', deadlineSeconds: 480,
    }),
  };
  await settleThenCheck(engine, ids, (views) => {
    const { state } = views.capped!;
    t.diagnostic(`settled ${state.settled}: ${JSON.stringify(state.attempts.map((a) => ({ n: a.n, ended: a.ended, reason: a.reason, exitCode: a.exitCode, usage: a.usage, resumeFrom: a.resumeFrom })))}`);
    assert.equal(state.settled, 'failed', `settled: ${views.capped?.phase}`);
    const [first] = state.attempts;
    assert.deepEqual([first?.ended, first?.reason, first?.exitCode], ['failed', 'budget', 1], 'it ended at its cap, as the harness printed it');
    assert.ok((first?.usage?.costUsd ?? 0) >= 0.01, `and cost at least its cap: ${first?.usage?.costUsd}`);
    assert.equal(state.attempts.length, 1, 'a budget spent is spent: maxAttempts 2 and resume always start no attempt 2');
  });
});

test('a claude --bg session given --max-budget-usd 0.01 spends past it and ends on its own — why file() refuses a budget on claude — and what it spent is measured once it is let go', {
  skip,
  timeout: 12 * 60_000,
}, async (t) => {
  // Through the Effect door, which refuses no harness's words (open issue 6): `createEngine().file()` refuses this task.
  const root = tmp('bg-budget-board');
  const layer = Layer.mergeAll(Journal.layer(Journal.filesOps(root)), Runner.claude({ root }));
  const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
  const id = await run(file({ brief: LOOP_BRIEF, cwd: notesIn('bg-budget'), model: 'haiku', tools: ['Read'], budgetUsd: 0.01, deadlineSeconds: 480 }));
  let v = await run(view(id, new Map()));
  try {
    const until = Date.now() + 10 * 60_000;
    while (!v.state.settled && Date.now() < until) {
      await run(tick());
      v = await run(view(id, new Map()));
      if (!v.state.settled) await new Promise((r) => setTimeout(r, 5_000));
    }
    const [a] = v.state.attempts;
    t.diagnostic(`settled ${v.state.settled}, attempt 1 ended ${a?.ended} (${a?.reason}), usage ${JSON.stringify(a?.usage)}`);
    assert.equal(v.state.settled, 'succeeded', 'Claude Code ended it on its own terms, not at a cap');
    // `claude -p` at this cap stopped after its first response or two, under $0.03.
    assert.ok((a?.usage?.toolCalls ?? 0) >= 5, `it kept reading past the cap: ${a?.usage?.toolCalls} tool calls. If it stopped early, Claude Code may keep --max-budget-usd under --bg now: measure it, and lift the refusal in claudeBgRefuses`);
    assert.ok((a?.usage?.costUsd ?? 0) > 0.03, `and what it spent, past the cap, was read once its release stopped it: ${a?.usage?.costUsd}`);
  } finally {
    const session = v.sessionId ?? v.state.attempts.at(-1)?.nativeId;
    if (session) {
      for (const verb of ['stop', 'rm']) {
        try { execFileSync('claude', [verb, session.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 }); } catch { /* released already */ }
      }
    }
  }
});

const UNSIGNED_BRIEF = [
  'Reply with the single word ok, as plain text, and end your turn.',
  'Call no tool, and give no closing statement, even when you are asked for one.',
].join(' ');

test('a --bg session asked for a closing statement that ends its turn without one is never recorded succeeded without one', {
  skip,
  timeout: 15 * 60_000,
}, async (t) => {
  // Shipped defaults but the model: `claude`, `auto`, one attempt. Quiet takes ninety seconds to be called.
  const engine = createEngine({ root: tmp('unsigned-board') });
  const ids = { unsigned: await engine.file({ brief: UNSIGNED_BRIEF, cwd: tmp('unsigned'), closeoutSchema: WORD_CLOSEOUT, deadlineSeconds: 480, model: 'haiku' }) };

  await settleThenCheck(engine, ids, (views) => {
    const v = views.unsigned!;
    const [a] = v.state.attempts;
    t.diagnostic(`attempt 1 ended ${a?.ended} (${a?.reason}), closeout ${JSON.stringify(a?.closeout)}, task ${v.state.settled ?? v.phase}`);
    assert.ok(v.state.settled, `settled: ${v.phase}`);
    assert.ok(!(v.state.settled === 'succeeded' && a?.closeout === undefined),
      `recorded succeeded with nothing said, ended ${a?.ended} (${a?.reason}). A harness end means Claude Code ended the session itself: a way to bug 1 that quiet does not cover (docs/open-issues.md)`);
  });
});

/** The registration Claude Code wrote for the background session named `name`, under `sessions/` — or `undefined` while there is none. */
const registrationOf = (name: string): Record<string, unknown> | undefined => {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  for (const f of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown> | null;
      if (r?.name === name && r.kind === 'bg') return r;
    } catch { /* gone since the directory was read, or read mid-write */ }
  }
  return undefined;
};

test('a --bg session filed with remoteControl: true is bridged — its registration carries a bridgeSessionId — and the same session filed without it is not', {
  skip,
  timeout: 6 * 60_000,
}, async (t) => {
  const engine = createEngine({ root: tmp('remote-board') });
  const common = { brief: 'Reply with the single word ok, and nothing else.', model: 'haiku', tools: [] };
  const ids = {
    bridged: await engine.file({ ...common, cwd: tmp('remote'), remoteControl: true }),
    control: await engine.file({ ...common, cwd: tmp('remote-none') }),
  };
  const found: Record<string, Record<string, unknown> | undefined> = {};
  const read = () => { for (const [k, id] of Object.entries(ids)) found[k] = registrationOf(nameFor(id, 1)); };
  try {
    await engine.tick();
    const until = Date.now() + 2 * 60_000;
    while (!(found.bridged?.bridgeSessionId && found.control) && Date.now() < until) {
      await new Promise((r) => setTimeout(r, 2_000));
      read();
    }
    // A bridge the control got a moment after it registered would not be seen yet: look again, as long after.
    await new Promise((r) => setTimeout(r, 15_000));
    read();
    const shown = (r: Record<string, unknown> | undefined) => (r ? `${r.version} ${r.sessionId}, bridgeSessionId ${r.bridgeSessionId ?? 'none'}` : 'not registered');
    t.diagnostic(`bridged: ${shown(found.bridged)}; control: ${shown(found.control)}`);
    assert.ok(found.bridged, 'the session filed with remoteControl registered');
    assert.equal(typeof found.bridged.bridgeSessionId, 'string', 'and is bridged: the agents view lists it');
    assert.ok(found.control, 'the control registered');
    assert.equal(found.control.bridgeSessionId, undefined,
      'the control is bridged too: Claude Code bridges background sessions on its own again, so the flag is not what did it. Measure it, and say so in the README');
  } finally {
    const sessions = new Set<string>();
    for (const r of Object.values(found)) if (typeof r?.sessionId === 'string') sessions.add(r.sessionId);
    for (const id of Object.values(ids)) {
      try { const v = await engine.view(id); if (v.sessionId) sessions.add(v.sessionId); } catch { /* nothing known to clean */ }
    }
    for (const s of sessions) {
      for (const verb of ['stop', 'rm']) {
        try { execFileSync('claude', [verb, s.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 }); } catch { /* best effort */ }
      }
    }
  }
});
