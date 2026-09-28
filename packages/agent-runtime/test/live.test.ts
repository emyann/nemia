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
 * never be recorded as ended with none unless its end says so — `stated: false`, the fact the orchestrator reads as
 * unsigned since stage 4a (before, the runtime judged it `unsigned` itself). Whether Claude Code nudges such a session
 * itself, or ends it on its own, is what the diagnostic says.
 *
 * And `claude.remoteControl` is measured under the engine, because what shows it worked is a file Claude Code writes and the
 * engine never reads: a session filed with it must be registered under `sessions/` with a `bridgeSessionId`, beside a
 * control identical but for the field, which must have none — or the flag is not what bridged it. Both have no tools,
 * so a session anyone on the account can drive from claude.ai for the minute it lives can do nothing.
 *
 * And Codex as an A2A agent (M13, which runs only where `codex` is on PATH): a held Codex task is an A2A context, and that
 * rests on a claim no fake can make — that `codex exec resume <thread>` goes on under the same thread id and in the same
 * rollout, rather than forking a thread of its own. A task told a word signs, waits with no worker, is answered, and must
 * say the word under the thread id it signed with (codex-cli 0.154.0, 2026-09-23: one id, one rollout).
 *
 *   AE_LIVE=1 node --test test/live.test.ts
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { createEngine, nameFor, type Engine, type Said, type TaskView } from '../src/facade.ts';
import { file, tick, view } from '../src/engine.ts';
import { Journal } from '../src/journal.ts';
import { Runner } from '../src/runner.ts';
import { TaskState } from '@a2a-js/sdk';
import { clientOf } from '../src/a2a-client.ts';
import { codex } from '../src/runner-codex.ts';
import { codexRolloutFile } from '../src/runner-codex-transcript.ts';
import { detachedOps } from '../src/runner-detached.ts';
import { scratch } from './scratch.ts';

const live = process.env.AE_LIVE === '1';
const skip = live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';
const tmp = (label: string) => scratch(`ae-live-${label}-`);

/**
 * Do `act`, tick until every task has settled or ten minutes pass, check, and leave no session behind — one that
 * `act` threw on included.
 */
const settleThenCheck = async (
  engine: Engine,
  ids: Record<string, string>,
  check: (views: Record<string, TaskView>) => void,
  act?: () => Promise<void>,
) => {
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
      if (!views[k]) {
        try {
          views[k] = await engine.view(id);
        } catch {
          /* no view, nothing known to clean */
        }
      }
    }
    for (const v of Object.values(views)) {
      if (!v.sessionId) continue;
      const short = v.sessionId.split('-')[0]!;
      for (const verb of ['stop', 'rm']) {
        try {
          execFileSync('claude', [verb, short], { stdio: 'ignore', timeout: 30_000 });
        } catch {
          /* best effort */
        }
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

test(
  'a --bg session with tools: Read, Grep, Glob cannot write a file; the same brief without them does',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    // Shipped defaults: the built-in harnesses, `claude` first, `auto` permission mode.
    const engine = createEngine({ root: tmp('board') });
    const fenced = tmp('fenced');
    const open = tmp('open');
    const common = { brief: BRIEF, closeoutSchema: CLOSEOUT, deadlineSeconds: 480, config: { effort: 'low', background: true } };
    const ids = {
      fenced: await engine.file({ ...common, cwd: fenced, config: { ...common.config, tools: ['Read', 'Grep', 'Glob'] } }),
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
  },
);

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
 * Made inside this package, not under the machine's temp directory, whose directories Claude Code does not trust.
 */
const allowingCheckout = (label: string) => {
  const dir = fs.mkdtempSync(path.join(import.meta.dirname, '..', `.ae-live-${label}-`));
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'probe', private: true, scripts: { build: 'touch BUILT', e2e: 'touch E2E' } }),
  );
  fs.mkdirSync(path.join(dir, '.claude'));
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: ['Bash(npm run build)', 'Bash(npm run e2e)'] } }),
  );
  return dir;
};

test(
  'a --bg session in dontAsk, in a checkout whose settings allow npm run build and npm run e2e, runs neither when disallowedTools names both; the same session without it runs both',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    const engine = createEngine({ root: tmp('deny-board') });
    const fenced = allowingCheckout('deny-fenced');
    const open = allowingCheckout('deny-open');
    // The shipped reviewer's fence, less what this does not need: Bash only, in dontAsk.
    const common = {
      brief: DENY_BRIEF,
      closeoutSchema: DENY_CLOSEOUT,
      deadlineSeconds: 480,
      config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Bash'], background: true },
    };
    try {
      const ids = {
        fenced: await engine.file({
          ...common,
          cwd: fenced,
          config: { ...common.config, disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)'] },
        }),
        open: await engine.file({ ...common, cwd: open }),
      };

      await settleThenCheck(engine, ids, (views) => {
        const said = (k: string) => JSON.stringify(views[k]?.state.attempts.at(-1)?.closeout);
        assert.equal(views.open?.state.settled, 'succeeded', `control settled: ${views.open?.phase}`);
        assert.deepEqual(
          WRITTEN.filter((f) => fs.existsSync(path.join(open, f))),
          WRITTEN,
          `control: the settings allow both, and both ran — refused, the checkout's settings were not applied: run this from a checkout Claude Code trusts. It said ${said('open')}`,
        );

        assert.equal(views.fenced?.state.settled, 'succeeded', `fenced settled: ${views.fenced?.phase}`);
        assert.deepEqual(
          WRITTEN.filter((f) => fs.existsSync(path.join(fenced, f))),
          [],
          `the deny beat the allow: neither ran; it said ${said('fenced')}`,
        );
        assert.notEqual(views.fenced?.state.attempts.at(-1)?.closeout, undefined, 'and the fenced session still gave its closeout');
      });
    } finally {
      for (const dir of [fenced, open]) fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

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

test(
  "a --bg session filed with no mcp, in an empty directory, has no MCP tools — not the operator's; one given a server has its tool",
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    const engine = createEngine({ root: tmp('mcp-board') });
    const server = path.join(tmp('mcp-server'), 'server.mjs');
    fs.writeFileSync(server, PROBE_SERVER);
    const common = { brief: MCP_BRIEF, closeoutSchema: MCP_CLOSEOUT, deadlineSeconds: 480, config: { effort: 'low', background: true } };
    const ids = {
      bare: await engine.file({ ...common, cwd: tmp('mcp-bare') }),
      given: await engine.file({
        ...common,
        cwd: tmp('mcp-given'),
        config: { ...common.config, mcp: { aeprobe: { command: process.execPath, args: [server] } } },
      }),
    };

    await settleThenCheck(engine, ids, (views) => {
      const said = (k: string) => views[k]?.state.attempts.at(-1)?.closeout as { mcpServers?: string[]; mcpTools?: string[] } | undefined;
      assert.equal(views.given?.state.settled, 'succeeded', `control settled: ${views.given?.phase}`);
      // Without the control, a session that answered before its servers connected passes the next assertion.
      assert.ok(
        said('given')?.mcpTools?.includes('mcp__aeprobe__ping'),
        `control: a session given a server reports its tool; it said ${JSON.stringify(said('given'))}`,
      );
      assert.deepEqual(said('given')?.mcpServers, ['aeprobe'], 'and that server only');

      assert.equal(views.bare?.state.settled, 'succeeded', `bare settled: ${views.bare?.phase}`);
      assert.deepEqual(
        said('bare'),
        { mcpServers: [], mcpTools: [] },
        "no mcp and no .mcp.json: none of the operator's servers, connectors or Chrome",
      );
    });
  },
);

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

/**
 * Told a file name while it works, a session writes that file; the same session never told writes none. A `--bg` session
 * is told through Claude Code's inbox, and a job (`claude -p`) on its stdin, by its worker.
 */
const sayReaches = (background: boolean) => async (t: TestContext) => {
  // Shipped defaults: `claude`, `auto`. Bash to wait with, Write to answer with.
  const engine = createEngine({ root: tmp('say-board') });
  const told = tmp('say-told');
  const control = tmp('say-control');
  const common = {
    brief: SAY_BRIEF,
    closeoutSchema: NAME_CLOSEOUT,
    deadlineSeconds: 600,
    config: { effort: 'low', tools: ['Bash', 'Write'], ...(background ? { background } : {}) },
  };
  const ids = {
    told: await engine.file({ ...common, cwd: told }),
    control: await engine.file({ ...common, cwd: control }),
  };
  const name = `SAID-${randomUUID().slice(0, 8)}.txt`;
  const words = `The file to write is ${name}`;
  let said: Said | undefined;

  await settleThenCheck(
    engine,
    ids,
    (views) => {
      assert.equal(views.told?.state.settled, 'succeeded', `told settled: ${views.told?.phase}`);
      assert.ok(fs.existsSync(path.join(told, name)), 'the told session wrote the file the words named');
      assert.deepEqual(views.told?.state.attempts.at(-1)?.closeout, { name }, 'and closed with its name');
      assert.deepEqual(views.told?.state.said, [said], 'the journal has what was said, once');

      assert.equal(views.control?.state.settled, 'succeeded', `control settled: ${views.control?.phase}`);
      assert.deepEqual(
        fs.readdirSync(control).filter((f) => f.startsWith('SAID-')),
        [],
        'the control, never told, wrote nothing',
      );
      assert.deepEqual(views.control?.state.attempts.at(-1)?.closeout, { name: '' }, 'and closed with no name');
      assert.deepEqual(views.control?.state.said, []);
    },
    async () => {
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
    },
  );

  // The session's own record has the words too, as the transcript reader gives them to a board — never the model's own
  // mention of the file's name, which would pass with the reader of words sent in broken.
  const { events } = await engine.transcript(ids.told);
  if (!background) {
    // A job's words are a user message on its stdin; said while it works, Claude Code keeps them as an attachment the
    // reader gives as the user's words, as the brief is (2.1.280).
    const arrived = events.filter((e) => e.role === 'user' && e.kind === 'text' && e.text === words);
    assert.equal(
      arrived.length,
      1,
      `the told job's transcript carries the words once, as the person's: ${JSON.stringify(events.filter((e) => e.role === 'user'))}`,
    );
    return;
  }
  // A `--bg` session's, a system event whose text is the words, or Claude Code's sentence around them on a line of their own.
  const arrived = events.filter((e) => e.role === 'system' && e.kind === 'system' && e.text?.split('\n').includes(words));
  assert.equal(
    arrived.length,
    1,
    `the told session's transcript carries the words once, as a system event: ${JSON.stringify(events.filter((e) => e.kind === 'system'))}`,
  );
  t.diagnostic(
    `the words arrived ${arrived[0]!.text === words ? 'while the session worked (an attachment line)' : 'while it was idle (the line that starts a turn)'}`,
  );
};

test(
  'say reaches a working --bg session: told a file name, it writes that file; the same session never told writes none — and the journal has what was said',
  {
    skip,
    timeout: 15 * 60_000,
  },
  sayReaches(true),
);

test(
  'say reaches a working job on its stdin: told a file name, it writes that file; the same job never told writes none — and the journal has what was said',
  {
    skip,
    timeout: 15 * 60_000,
  },
  sayReaches(false),
);

const WORD_CLOSEOUT = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
};

test(
  'a settled --bg session is stopped and removed from claude agents — and ae logs still reads it, and --resume still continues it',
  {
    skip,
    timeout: 25 * 60_000,
  },
  async () => {
    const engine = createEngine({ root: tmp('release-board') });
    const cwd = tmp('release');
    const word = `ae${randomUUID().slice(0, 8)}`;
    const agents = () =>
      JSON.parse(execFileSync('claude', ['agents', '--all', '--json'], { encoding: 'utf8', timeout: 60_000 })) as Array<{
        sessionId?: string;
      }>;
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
    const common = { cwd, deadlineSeconds: 480, config: { model: 'haiku', background: true }, closeoutSchema: WORD_CLOSEOUT };
    try {
      const firstId = await engine.file({
        ...common,
        brief: `The code word is ${word}. Remember it, and do nothing else. Then give your closing statement, with word set to ok.`,
      });
      const first = await settled(firstId);
      if (first.sessionId) sessions.add(first.sessionId);
      const id = first.state.attempts.at(-1)?.nativeId ?? undefined;
      assert.equal(first.state.settled, 'succeeded', `first settled: ${first.phase}`);
      assert.ok(id, 'its session id is on the record');
      assert.equal(
        agents().some((r) => r.sessionId === id),
        false,
        'released in the pass that settled it: not in claude agents',
      );
      assert.match(await engine.logs(firstId), new RegExp(word), 'ae logs still reads the removed session');

      const secondId = await engine.file({
        ...common,
        resumeFrom: id,
        brief: 'What was the code word you were given? Give it as word in your closing statement.',
      });
      const second = await settled(secondId);
      if (second.sessionId) sessions.add(second.sessionId);
      assert.equal(second.state.settled, 'succeeded', `resumed settled: ${second.phase}`);
      assert.deepEqual(second.state.attempts.at(-1)?.closeout, { word }, 'the removed session was resumed, and remembered its word');
      assert.equal(
        agents().some((r) => r.sessionId === second.sessionId),
        false,
        'and the resumed one was released too',
      );
    } finally {
      for (const s of sessions) {
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, s.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 });
          } catch {
            /* released already */
          }
        }
      }
    }
  },
);

const NOTES = Array.from(
  { length: 2000 },
  (_, i) =>
    `line ${i + 1}: ${i % 7 === 0 ? 'a note' : 'nothing here'} — the quick brown fox jumps over the lazy dog, again and again and again`,
).join('\n');
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

test(
  'claude -p given a $0.01 budget stops at it: the attempt ends failed at the limit `budget`, with what it cost — and its task settles failed, with no attempt 2',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async (t) => {
    const engine = createEngine({ root: tmp('budget-board') });
    const ids = {
      capped: await engine.file({
        brief: LOOP_BRIEF,
        cwd: notesIn('budget-p'),
        harness: 'claude-detached',
        config: { model: 'haiku', tools: ['Read'], budgetUsd: 0.01 },
        deadlineSeconds: 480,
      }),
    };
    await settleThenCheck(engine, ids, (views) => {
      const { state } = views.capped!;
      t.diagnostic(
        `settled ${state.settled}: ${JSON.stringify(state.attempts.map((a) => ({ n: a.n, ended: a.ended, reason: a.reason, exitCode: a.exitCode, usage: a.usage, resumeFrom: a.resumeFrom })))}`,
      );
      assert.equal(state.settled, 'failed', `settled: ${views.capped?.phase}`);
      const [first] = state.attempts;
      assert.deepEqual(
        [first?.ended, first?.reason, first?.limit, first?.exitCode],
        ['failed', 'harness', 'budget', 1],
        'it ended at its cap, as the harness printed it',
      );
      assert.ok((first?.usage?.costUsd ?? 0) >= 0.01, `and cost at least its cap: ${first?.usage?.costUsd}`);
      assert.equal(state.attempts.length, 1, 'a budget spent is spent: no attempt 2');
    });
  },
);

test(
  'a claude --bg session given --max-budget-usd 0.01 spends past it and ends on its own — why file() refuses a budget beside background: true — and what it spent is measured once it is let go',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async (t) => {
    // Through the Effect door, which refuses no harness's words (open issue 6): `createEngine().file()` refuses this task.
    const root = tmp('bg-budget-board');
    const layer = Layer.mergeAll(Journal.layer(Journal.filesOps(root)), Runner.claude({ root }));
    const run = <A, E>(e: Effect.Effect<A, E, Journal | Runner>) => Effect.runPromise(e.pipe(Effect.provide(layer)));
    const id = await run(
      file({
        brief: LOOP_BRIEF,
        cwd: notesIn('bg-budget'),
        config: { model: 'haiku', tools: ['Read'], budgetUsd: 0.01 },
        deadlineSeconds: 480,
      }),
    );
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
      assert.ok(
        (a?.usage?.toolCalls ?? 0) >= 5,
        `it kept reading past the cap: ${a?.usage?.toolCalls} tool calls. If it stopped early, Claude Code may keep --max-budget-usd under --bg now: measure it, and lift the refusals in claudeBgRefuses and claudeCodeRefuses`,
      );
      assert.ok(
        (a?.usage?.costUsd ?? 0) > 0.03,
        `and what it spent, past the cap, was read once its release stopped it: ${a?.usage?.costUsd}`,
      );
    } finally {
      const session = v.sessionId ?? v.state.attempts.at(-1)?.nativeId;
      if (session) {
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, session.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 });
          } catch {
            /* released already */
          }
        }
      }
    }
  },
);

const UNSIGNED_BRIEF = [
  'Reply with the single word ok, as plain text, and end your turn.',
  'Call no tool, and give no closing statement, even when you are asked for one.',
].join(' ');

test(
  'a --bg session asked for a closing statement that ends its turn without one is never recorded as ending without one unsaid',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    // Shipped defaults but the model and the mode: `claude` as a background session, `auto`, one attempt. Quiet takes ninety seconds to be called.
    const engine = createEngine({ root: tmp('unsigned-board') });
    const ids = {
      unsigned: await engine.file({
        brief: UNSIGNED_BRIEF,
        cwd: tmp('unsigned'),
        closeoutSchema: WORD_CLOSEOUT,
        deadlineSeconds: 480,
        config: { model: 'haiku', background: true },
      }),
    };

    await settleThenCheck(engine, ids, (views) => {
      const v = views.unsigned!;
      const [a] = v.state.attempts;
      t.diagnostic(
        `attempt 1 ended ${a?.ended} (${a?.reason}), stated ${a?.stated}, closeout ${JSON.stringify(a?.closeout)}, task ${v.state.settled ?? v.phase}`,
      );
      assert.ok(v.state.settled, `settled: ${v.phase}`);
      assert.ok(
        a?.closeout !== undefined || a?.stated === false || a?.ended !== 'done',
        `recorded done with nothing said and not saying so, ended ${a?.ended} (${a?.reason}), stated ${a?.stated}: bug 1, which the orchestrator could then not read as unsigned`,
      );
    });
  },
);

/** The registration Claude Code wrote for the background session named `name`, under `sessions/` — or `undefined` while there is none. */
const registrationOf = (name: string): Record<string, unknown> | undefined => {
  const dir = path.join(process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), '.claude'), 'sessions');
  for (const f of fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f))) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as Record<string, unknown> | null;
      if (r?.name === name && r.kind === 'bg') return r;
    } catch {
      /* gone since the directory was read, or read mid-write */
    }
  }
  return undefined;
};

test(
  'a --bg session filed with claude.remoteControl is bridged — its registration carries a bridgeSessionId — and the same session filed without it is not',
  {
    skip,
    timeout: 6 * 60_000,
  },
  async (t) => {
    const engine = createEngine({ root: tmp('remote-board') });
    const common = {
      brief: 'Reply with the single word ok, and nothing else.',
      config: { model: 'haiku', tools: [] as string[], background: true },
    };
    const ids = {
      bridged: await engine.file({ ...common, cwd: tmp('remote'), config: { ...common.config, claude: { remoteControl: true } } }),
      control: await engine.file({ ...common, cwd: tmp('remote-none') }),
    };
    const found: Record<string, Record<string, unknown> | undefined> = {};
    const read = () => {
      for (const [k, id] of Object.entries(ids)) found[k] = registrationOf(nameFor(id, 1));
    };
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
      const shown = (r: Record<string, unknown> | undefined) =>
        r ? `${r.version} ${r.sessionId}, bridgeSessionId ${r.bridgeSessionId ?? 'none'}` : 'not registered';
      t.diagnostic(`bridged: ${shown(found.bridged)}; control: ${shown(found.control)}`);
      assert.ok(found.bridged, 'the session filed with claude.remoteControl registered');
      assert.equal(typeof found.bridged.bridgeSessionId, 'string', 'and is bridged: the agents view lists it');
      assert.ok(found.control, 'the control registered');
      assert.equal(
        found.control.bridgeSessionId,
        undefined,
        'the control is bridged too: Claude Code bridges background sessions on its own again, so the flag is not what did it. Measure it, and say so in the README',
      );
    } finally {
      const sessions = new Set<string>();
      for (const r of Object.values(found)) if (typeof r?.sessionId === 'string') sessions.add(r.sessionId);
      for (const id of Object.values(ids)) {
        try {
          const v = await engine.view(id);
          if (v.sessionId) sessions.add(v.sessionId);
        } catch {
          /* nothing known to clean */
        }
      }
      for (const s of sessions) {
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, s.split('-')[0]!], { stdio: 'ignore', timeout: 30_000 });
          } catch {
            /* best effort */
          }
        }
      }
    }
  },
);

/*
 * Stage 2's measurements: `claude` runs a step as a job (`claude -p`), and a `--bg` session only when asked. Each was first
 * taken by hand on Claude Code 2.1.280 (docs/open-issues.md, *Claude Code as a job*); these keep them measurable on the next.
 */

/** One `claude -p` line of its stream: what the runner reads, parsed as the reader parses it. */
type StreamLine = Record<string, unknown> & { type?: string; subtype?: string; session_id?: string };
const streamOf = (text: string): StreamLine[] =>
  text.split('\n').flatMap((l) => {
    try {
      return [JSON.parse(l) as StreamLine];
    } catch {
      return [];
    }
  });
const resultOf = (lines: StreamLine[]) => lines.filter((l) => l.type === 'result').at(-1);
const sessionOf = (lines: StreamLine[]) => lines.find((l) => l.type === 'system' && l.subtype === 'init')?.session_id;
const toolCalled = (lines: StreamLine[]) =>
  lines.some(
    (l) =>
      l.type === 'assistant' &&
      ((l.message as { content?: Array<{ type?: string }> } | undefined)?.content ?? []).some((c) => c.type === 'tool_use'),
  );
const PRINT = ['-p', '--model', 'haiku', '--output-format', 'stream-json', '--verbose'];

/** `claude -p` run to its end under a bound, its stdin closed: the exit, and the stream it printed. */
const printed = (args: string[], cwd: string, bound = 240_000): { exit: number | null; lines: StreamLine[] } => {
  try {
    return {
      exit: 0,
      lines: streamOf(
        execFileSync('claude', [...PRINT, ...args], { cwd, encoding: 'utf8', timeout: bound, stdio: ['ignore', 'pipe', 'pipe'] }),
      ),
    };
  } catch (e) {
    const err = e as { status?: number | null; stdout?: string };
    return { exit: err.status ?? null, lines: streamOf(err.stdout ?? '') };
  }
};

/** A `claude -p` left running: its stream as it grows, and a wait for its exit bounded by `ms`. */
const started = (args: string[], cwd: string, stdin: 'ignore' | 'pipe' = 'ignore') => {
  const child = spawn('claude', [...PRINT, ...args], { cwd, stdio: [stdin, 'pipe', 'ignore'] });
  let out = '';
  child.stdout!.on('data', (d) => {
    out += d;
  });
  child.stdin?.on('error', () => {});
  const exited = new Promise<number | null>((r) =>
    child.on('exit', (code, signal) => r(code ?? (signal ? 128 + (os.constants.signals[signal] ?? 0) : null))),
  );
  return {
    child,
    raw: () => out,
    lines: () => streamOf(out),
    exit: (ms: number) => Promise.race([exited, new Promise<'running'>((r) => setTimeout(() => r('running'), ms))]),
  };
};
const until = async (ok: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 500));
  return ok();
};

const DENIED_BRIEF = (outside: string) =>
  [
    'Do these three things, in order, each exactly once, even if one fails, then give your closing statement with finished set to true:',
    `1) Use the Write tool to write the text hi to the file ${outside}/x.txt (a folder outside your working directory).`,
    '2) Run the Bash command: curl -s -o /dev/null https://example.com',
    '3) Use WebFetch to fetch https://example.com and say its title.',
  ].join(' ');
const FINISHED_CLOSEOUT = {
  type: 'object',
  properties: { finished: { type: 'boolean' } },
  required: ['finished'],
  additionalProperties: false,
};

test(
  'M1: claude -p waits on nobody in any mode, with or without --permission-prompts none — a call it may not make is denied, and said twice: a permission_denied line as it happens and permission_denials on its result',
  {
    skip,
    timeout: 20 * 60_000,
  },
  async (t) => {
    const probe = tmp('m1');
    const runs = ['auto', 'dontAsk', 'default', 'acceptEdits'].flatMap((mode) =>
      [false, true].map(async (none) => {
        const label = `${mode}${none ? '-none' : ''}`;
        const cwd = path.join(probe, `w-${label}`);
        fs.mkdirSync(cwd);
        const allow = mode === 'dontAsk' ? ['--allowedTools', 'Edit(**),Bash(npm test)'] : [];
        const brief = DENIED_BRIEF(path.join(probe, `outside-${label}`)).replace(' with finished set to true', ', the word FINISHED');
        // The prompt first: `--allowedTools` takes every word after it, and took a prompt given last for a rule.
        const { exit, lines } = printed(
          [brief, '--permission-mode', mode, ...allow, ...(none ? ['--permission-prompts', 'none'] : [])],
          cwd,
        );
        return { label, exit, lines, outside: fs.existsSync(path.join(probe, `outside-${label}`, 'x.txt')) };
      }),
    );
    // One at a time would take eight minutes: the eight are independent, each in a folder of its own.
    for (const { label, exit, lines, outside } of await Promise.all(runs)) {
      const result = resultOf(lines);
      const events = lines.filter((l) => l.type === 'system' && l.subtype === 'permission_denied');
      const denials = (result?.permission_denials ?? []) as Array<{ tool_name?: string; tool_use_id?: string }>;
      const mode = lines.find((l) => l.subtype === 'init')?.permissionMode;
      t.diagnostic(
        `${label}: exit ${exit}, ran as ${mode}, result ${result?.subtype}, denied ${denials.map((d) => d.tool_name).join(', ') || 'nothing'}; events ${events.map((e) => `${e.tool_name}/${e.decision_reason_type ?? '-'}`).join(', ')}`,
      );
      assert.equal(exit, 0, `${label}: it ended on its own inside four minutes — it waited on nobody`);
      assert.ok(result, `${label}: it printed its result`);
      assert.equal(outside, false, `${label}: nothing was written outside its folder`);
      assert.ok(denials.length > 0, `${label}: its result says what it was denied`);
      assert.deepEqual(
        events.map((e) => e.tool_use_id),
        denials.map((d) => d.tool_use_id),
        `${label}: one permission_denied line for each denial, the same calls`,
      );
    }
  },
);

test(
  'M1 under the engine: a job on claude at shipped defaults settles on its own and its attempt carries what it was denied; a job asked for nothing it may not do carries no denials',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    const engine = createEngine({ root: tmp('m1-board') });
    const probe = tmp('m1-engine');
    const ids = {
      denied: await engine.file({
        brief: DENIED_BRIEF(path.join(probe, 'outside')),
        cwd: tmp('m1-denied'),
        closeoutSchema: FINISHED_CLOSEOUT,
        deadlineSeconds: 480,
        config: { model: 'haiku' },
      }),
      control: await engine.file({
        brief: 'Give your closing statement, with finished set to true. Call no tool first.',
        cwd: tmp('m1-control'),
        closeoutSchema: FINISHED_CLOSEOUT,
        deadlineSeconds: 480,
        config: { model: 'haiku' },
      }),
    };
    await settleThenCheck(engine, ids, (views) => {
      const [denied] = views.denied!.state.attempts;
      const [control] = views.control!.state.attempts;
      t.diagnostic(
        `denied: ${views.denied!.state.settled}, ${JSON.stringify(denied?.denials)}; control: ${views.control!.state.settled}, ${JSON.stringify(control?.denials)}`,
      );
      assert.equal(views.denied!.state.settled, 'succeeded', `the denied job finished its work: ${views.denied!.phase}`);
      assert.equal(denied?.exitCode, 0, "it ran as a job: a process of the engine's, which exited — a background session has no exit code");
      assert.ok(
        (denied?.denials ?? []).some((d) => d.tool === 'Write'),
        'its attempt says the write outside its folder was denied',
      );
      assert.equal(fs.existsSync(path.join(probe, 'outside', 'x.txt')), false, 'and nothing was written there');
      assert.equal(views.control!.state.settled, 'succeeded', `the control finished: ${views.control!.phase}`);
      assert.equal(control?.denials, undefined, 'and was denied nothing: a denial is not printed for every job');
    });
  },
);

test(
  "M2, M3, M5: a job resumed from a --bg session remembers it; a job resumed from a job is charged its own spend, not its parent's again; a budget on a resume caps its own spend",
  {
    skip,
    timeout: 40 * 60_000,
  },
  async (t) => {
    const engine = createEngine({ root: tmp('m2-board') });
    const cwd = tmp('m2');
    const settled = async (id: string) => {
      const end = Date.now() + 10 * 60_000;
      while (Date.now() < end) {
        await engine.tick();
        const v = await engine.view(id);
        if (v.state.settled) return v;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      return engine.view(id);
    };
    const common = { cwd, deadlineSeconds: 480, closeoutSchema: WORD_CLOSEOUT };
    const tell = (word: string) =>
      `The code word is ${word}. Remember it, and do nothing else. Then give your closing statement, with word set to ok.`;
    const ask = 'What was the code word you were given? Give it as word in your closing statement.';
    const last = (v: TaskView) => v.state.attempts.at(-1);

    // M3: `claude -p --resume` continues a `--bg` session.
    const bgWord = `ae${randomUUID().slice(0, 8)}`;
    const bg = await settled(await engine.file({ ...common, config: { model: 'haiku', background: true }, brief: tell(bgWord) }));
    assert.equal(bg.state.settled, 'succeeded', `the background session settled: ${bg.phase}`);
    const parent = last(bg)?.nativeId ?? undefined;
    assert.ok(parent, 'its Claude Code id is on the record');
    const fromBg = await settled(await engine.file({ ...common, config: { model: 'haiku' }, resumeFrom: parent, brief: ask }));
    t.diagnostic(`a job resumed from a background session: ${fromBg.state.settled}, ${JSON.stringify(last(fromBg)?.usage)}`);
    assert.equal(fromBg.state.settled, 'succeeded', `the job resumed from it settled: ${fromBg.phase}`);
    assert.deepEqual(last(fromBg)?.closeout, { word: bgWord }, 'and remembered the word');
    assert.equal(last(fromBg)?.nativeId, parent, 'in the same session');
    // What it printed carries the background session's spend on, and no run file holds that spend: dropped, never overcounted.
    assert.equal(
      last(fromBg)?.usage?.costUsd,
      undefined,
      'a job whose parent was a background session records no cost it cannot tell apart',
    );

    // M2: a resume's result prints the whole session's cost; the attempt is charged what the resume spent.
    const word = `ae${randomUUID().slice(0, 8)}`;
    const first = await settled(await engine.file({ ...common, config: { model: 'haiku' }, brief: tell(word) }));
    assert.equal(first.state.settled, 'succeeded', `the first job settled: ${first.phase}`);
    const second = await settled(
      await engine.file({ ...common, config: { model: 'haiku' }, resumeFrom: last(first)!.nativeId!, brief: ask }),
    );
    const [one, two] = [last(first)?.usage?.costUsd, last(second)?.usage?.costUsd];
    t.diagnostic(`costs: first job ${one}, the job resumed from it ${two}`);
    assert.deepEqual(last(second)?.closeout, { word }, 'a job resumed from a job remembers');
    assert.ok(one !== undefined && one > 0 && two !== undefined && two > 0, 'and both were charged something');
    assert.ok(
      two! < one!,
      "the resume, a short question on a warm cache, was charged less than the job it continued: not that job's spend again",
    );

    // M5: a cap below the session's whole spend still lets a short resume finish — it caps the resume's own.
    const cap = Math.max(0.01, Math.round((one! + two!) * 50) / 100);
    const capped = await settled(
      await engine.file({ ...common, config: { model: 'haiku', budgetUsd: cap }, resumeFrom: last(second)!.nativeId!, brief: ask }),
    );
    t.diagnostic(
      `a resume capped at $${cap}, under its session's $${(one! + two!).toFixed(4)}: ${capped.state.settled}, ${last(capped)?.reason}, cost ${last(capped)?.usage?.costUsd}`,
    );
    assert.equal(capped.state.settled, 'succeeded', `a resume under a cap below its session's whole cost finished: ${capped.phase}`);
  },
);

test(
  "M7: a job resumed from a job that was denied is not charged its parent's denials — the result of a resume says only what the resume was denied, unlike its cost",
  {
    skip,
    timeout: 20 * 60_000,
  },
  async (t) => {
    const engine = createEngine({ root: tmp('m7-board') });
    const probe = tmp('m7');
    const common = { cwd: tmp('m7-work'), deadlineSeconds: 480, closeoutSchema: FINISHED_CLOSEOUT, config: { model: 'haiku' } };
    const settled = async (id: string) => {
      const end = Date.now() + 10 * 60_000;
      while (Date.now() < end) {
        await engine.tick();
        const v = await engine.view(id);
        if (v.state.settled) return v;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      return engine.view(id);
    };
    const denied = await settled(await engine.file({ ...common, brief: DENIED_BRIEF(path.join(probe, 'outside')) }));
    const parent = denied.state.attempts.at(-1);
    assert.equal(denied.state.settled, 'succeeded', `the denied job settled: ${denied.phase}`);
    assert.ok(
      (parent?.denials ?? []).some((d) => d.tool === 'Write'),
      'and its attempt says what it was denied',
    );
    const resumed = await settled(
      await engine.file({
        ...common,
        resumeFrom: parent!.nativeId!,
        brief: 'Give your closing statement, with finished set to true. Call no tool first.',
      }),
    );
    const child = resumed.state.attempts.at(-1);
    t.diagnostic(
      `parent denied ${JSON.stringify(parent?.denials)}; the resume: ${resumed.state.settled}, denied ${JSON.stringify(child?.denials)}, cost ${child?.usage?.costUsd}`,
    );
    assert.equal(resumed.state.settled, 'succeeded', `the resume settled: ${resumed.phase}`);
    assert.equal(child?.nativeId, parent?.nativeId, 'in the same session');
    assert.equal(child?.denials, undefined, "the resume, which called nothing, carries none of its parent's denials");
  },
);

test(
  'M4: claude -p stopped mid-turn by SIGTERM or SIGINT can be resumed, and remembers what it was told',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    for (const signal of ['SIGTERM', 'SIGINT'] as const) {
      const cwd = tmp(`m4-${signal}`);
      const word = `ae${randomUUID().slice(0, 8)}`;
      // In the words haiku followed by hand: told only to run it, it has declined a sleep as pointless.
      const job = started(
        [
          `I am testing how my build tool handles a slow step. Remember the code word ${word}. Please run exactly this Bash command, which is safe and expected: sleep 40 && echo SLEPT . Then reply DONE.`,
          '--permission-mode',
          'dontAsk',
          '--allowedTools',
          'Bash(sleep *)',
        ],
        cwd,
      );
      try {
        assert.ok(
          await until(() => toolCalled(job.lines()), 90_000),
          `${signal}: it called its tool — it printed ${JSON.stringify(job.lines().map((l) => (l.type === 'assistant' ? l.message : l.type))).slice(0, 2000)}`,
        );
        await new Promise((r) => setTimeout(r, 3_000));
        job.child.kill(signal);
        const exit = await job.exit(20_000);
        const session = sessionOf(job.lines());
        t.diagnostic(`${signal}: exit ${exit}, result ${resultOf(job.lines())?.subtype ?? 'none'}`);
        assert.notEqual(exit, 'running', `${signal}: it ended within twenty seconds`);
        assert.ok(session, `${signal}: its first line named its session`);
        const resumed = printed(
          ['--resume', session!, '--permission-mode', 'dontAsk', 'What was the code word I told you? Reply with it alone.'],
          cwd,
        );
        assert.equal(resumed.exit, 0, `${signal}: the resume ran`);
        assert.match(String(resultOf(resumed.lines)?.result ?? ''), new RegExp(word), `${signal}: and remembered the word`);
      } finally {
        job.child.kill('SIGKILL');
      }
    }
  },
);

test(
  'M6, for wf say: a claude -p reading stream-json on its stdin takes a second message into the turn it is working',
  {
    skip,
    timeout: 10 * 60_000,
  },
  async (t) => {
    const cwd = tmp('m6');
    const word = `ae${randomUUID().slice(0, 8)}`;
    const job = started(['--input-format', 'stream-json', '--permission-mode', 'dontAsk', '--allowedTools', 'Bash(sleep *)'], cwd, 'pipe');
    const say = (text: string) => job.child.stdin!.write(`${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`);
    try {
      say(
        'Run the Bash command `sleep 20`. When it finishes, tell me every code word I have given you so far (maybe none), and nothing else.',
      );
      assert.ok(await until(() => toolCalled(job.lines()), 90_000), 'it started its sleep');
      await new Promise((r) => setTimeout(r, 2_000));
      say(`The code word is ${word}.`);
      await until(() => job.lines().some((l) => l.type === 'result'), 150_000);
      job.child.stdin!.end();
      await job.exit(30_000);
      const results = job.lines().filter((l) => l.type === 'result');
      t.diagnostic(`results: ${JSON.stringify(results.map((r) => ({ subtype: r.subtype, result: r.result, turns: r.num_turns })))}`);
      assert.ok(results.length >= 1, 'it answered');
      assert.match(
        String(results[0]!.result ?? ''),
        new RegExp(word),
        'its first answer — the turn that was running — has the word said while it slept',
      );
      // The control is M4's: SIGINT, then `-p --resume` with the words, which a job without this stdin still has.
    } finally {
      job.child.kill('SIGKILL');
    }
  },
);

/*
 * Stage 2 part 2a: a job's words come on its stdin (`--input-format stream-json`), so that a person's can follow them. Before
 * the worker ran a job so, what a job is given as flags was measured under it against the same job given a plain prompt:
 * the closeout (`--json-schema`), the spend cap (`--max-budget-usd`) and a denial. Each streamed job is run as the worker
 * runs it: its brief the first line on its stdin, and its stdin ended at the first line of its stream that is a result.
 */

/** One line of stream-json input: a user message, as M6 wrote them. */
const userLine = (text: string) => `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;

/** A `claude -p` given its brief as a prompt, run to its end: its exit, its stream, and whether its stream ended on a result line. */
const plainJob = async (brief: string, args: string[], cwd: string, bound = 300_000) => {
  const job = started([brief, ...args], cwd);
  const exit = await job.exit(bound);
  if (exit === 'running') job.child.kill('SIGKILL');
  return { exit, lines: job.lines(), raw: job.raw() };
};

/**
 * A `claude -p --input-format stream-json` run as the worker runs it: the brief its first stdin line, stdin held open until
 * the first result, then ended. Also whether it exited on its own, stdin still open, within five seconds of its result.
 */
const streamedJob = async (brief: string, args: string[], cwd: string, bound = 300_000) => {
  const job = started(['--input-format', 'stream-json', ...args], cwd, 'pipe');
  job.child.stdin!.write(userLine(brief));
  // The line parsed, and its own `type` read: measured on 2.1.280, a result line prints `type` far down its object, both here
  // and under a prompt — `{"duration_api_ms":…` — so a line that starts `{"type":"result"` is never seen, and stdin never ended.
  const resulted = await until(() => job.lines().some((l) => l.type === 'result'), bound);
  const onItsOwn = resulted ? await job.exit(5_000) : 'running';
  job.child.stdin!.end();
  const exit = await job.exit(30_000);
  if (exit === 'running') job.child.kill('SIGKILL');
  return { exit, onItsOwn, lines: job.lines(), raw: job.raw(), resulted };
};

test(
  'M8, M9, M10: a job reading its brief from stream-json on its stdin keeps its closeout, its spend cap and its denials as a job given the brief as a prompt does',
  {
    skip,
    timeout: 20 * 60_000,
  },
  async (t) => {
    const version = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
    t.diagnostic(`claude --version: ${version}`);
    const probe = tmp('m8');
    const dir = (label: string) => {
      const d = path.join(probe, label);
      fs.mkdirSync(d);
      return d;
    };
    const notes = (label: string) => {
      const d = dir(label);
      fs.writeFileSync(path.join(d, 'NOTES.txt'), NOTES);
      return d;
    };
    const schema = ['--json-schema', JSON.stringify(FINISHED_CLOSEOUT)];
    const CLOSE = 'Give your closing statement, with finished set to true. Call no tool first.';
    const budget = ['--tools', 'Read', '--max-budget-usd', '0.01'];
    const denied = (label: string): [string, string[]] => [
      DENIED_BRIEF(path.join(probe, `outside-${label}`)),
      [...schema, '--permission-mode', 'auto', '--permission-prompts', 'none'],
    ];
    const [m8p, m8s, m9p, m9s, m10p, m10s] = await Promise.all([
      plainJob(CLOSE, schema, dir('m8-plain')),
      streamedJob(CLOSE, schema, dir('m8-streamed')),
      plainJob(LOOP_BRIEF, budget, notes('m9-plain')),
      streamedJob(LOOP_BRIEF, budget, notes('m9-streamed')),
      plainJob(...denied('m10-plain'), dir('m10-plain')),
      streamedJob(...denied('m10-streamed'), dir('m10-streamed')),
    ]);
    const shown = (r: { exit: number | null | 'running'; lines: StreamLine[] } & { onItsOwn?: unknown }) => {
      const result = resultOf(r.lines);
      return `exit ${r.exit}${r.onItsOwn !== undefined ? ` (on its own, stdin open: ${r.onItsOwn})` : ''}, results ${r.lines.filter((l) => l.type === 'result').length}, subtype ${result?.subtype}, structured_output ${JSON.stringify(result?.structured_output)}, cost ${result?.total_cost_usd}, denied ${JSON.stringify(((result?.permission_denials ?? []) as Array<{ tool_name?: string }>).map((d) => d.tool_name))}`;
    };
    for (const [label, r] of Object.entries({ m8p, m8s, m9p, m9s, m10p, m10s })) t.diagnostic(`${label}: ${shown(r)}`);
    const firstKey = (raw: string) =>
      raw
        .split('\n')
        .find((l) => {
          try {
            return JSON.parse(l).type === 'result';
          } catch {
            return false;
          }
        })
        ?.slice(0, 24);
    t.diagnostic(`a result line starts ${firstKey(m8s.raw)} streamed, ${firstKey(m8p.raw)} prompted`);

    for (const s of [m8s, m9s, m10s]) {
      assert.ok(s.resulted, 'each streamed job printed a result line — the line the worker ends stdin at');
      assert.equal(
        s.onItsOwn,
        'running',
        'and was still running five seconds after it, its stdin open: ending stdin is what lets a job exit',
      );
      assert.equal(s.lines.filter((l) => l.type === 'result').length, 1, 'and one result: the brief is one turn');
    }
    // M8: the closeout.
    assert.deepEqual(resultOf(m8p.lines)?.structured_output, { finished: true }, 'M8 control: a prompted job gives its structured_output');
    assert.deepEqual(resultOf(m8s.lines)?.structured_output, { finished: true }, 'M8: a streamed job gives its structured_output');
    assert.equal(m8s.exit, m8p.exit, 'M8: and exits as the prompted job did, once its stdin is ended');
    // M9: the spend cap.
    assert.equal(resultOf(m9p.lines)?.subtype, 'error_max_budget_usd', 'M9 control: a prompted job stops at its cap');
    assert.equal(resultOf(m9s.lines)?.subtype, 'error_max_budget_usd', 'M9: a streamed job stops at its cap');
    assert.equal(m9s.exit, m9p.exit, 'M9: and exits with the code the prompted job did');
    assert.ok(
      Number(resultOf(m9s.lines)?.total_cost_usd) < 0.05,
      `M9: having spent about its cap, not run past it: ${resultOf(m9s.lines)?.total_cost_usd}`,
    );
    // M10: a denial.
    for (const [label, r] of [
      ['M10 control', m10p],
      ['M10', m10s],
    ] as const) {
      const result = resultOf(r.lines);
      const denials = (result?.permission_denials ?? []) as Array<{ tool_name?: string; tool_use_id?: string }>;
      const events = r.lines.filter((l) => l.type === 'system' && l.subtype === 'permission_denied');
      assert.ok(
        denials.some((d) => d.tool_name === 'Write'),
        `${label}: the result says the write outside was denied`,
      );
      assert.deepEqual(
        events.map((e) => e.tool_use_id),
        denials.map((d) => d.tool_use_id),
        `${label}: a permission_denied line for each denial`,
      );
      assert.deepEqual(result?.structured_output, { finished: true }, `${label}: and it carried on to its closeout`);
    }
    assert.equal(m10s.exit, m10p.exit, 'M10: the streamed job exits as the prompted one did');
    assert.equal(fs.existsSync(path.join(probe, 'outside-m10-streamed', 'x.txt')), false, 'M10: nothing was written outside its folder');
  },
);

/*
 * Stage 2 part 2: before the orchestrator filed every Claude Code step as a job, a job's fence was measured against a
 * background session's. The planner and the reviewers run `dontAsk` with no `allow:` of their own, fenced by this
 * repository's `.claude/settings.json` alone: a job that read no project settings would be denied every command they run.
 */

/**
 * M11's two commands, named afresh on every run: `build` and `e2e` are names a person's own `~/.claude/settings.json`, or a
 * machine's managed settings, may well allow — this repository's does — and an allow from there would run the command with no
 * project settings read at all. A name made up on the spot is on no list but the one the checkout writes.
 */
const M11_NONCE = randomUUID().slice(0, 8);
const M11_ALLOWED = `m11-allowed-${M11_NONCE}`;
const M11_UNLISTED = `m11-unlisted-${M11_NONCE}`;
const M11_WRITTEN = ['ALLOWED', 'UNLISTED'];
const M11_BRIEF = [
  `Run these two commands with your Bash tool, one call each, in this order: \`npm run ${M11_ALLOWED}\`, then \`npm run ${M11_UNLISTED}\`.`,
  'Write each exactly as given, adding nothing to it, and run nothing else. If one is denied, do not look for another way to run it.',
  'Then give your closing statement: in denied, each of the two commands that was denied, or an empty list.',
].join(' ');

/** A checkout whose settings allow `npm run <M11_ALLOWED>` alone; `npm run <M11_UNLISTED>` is in its package.json and on no list. */
const oneAllowedCheckout = (label: string) => {
  const dir = allowingCheckout(label);
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name: 'probe', private: true, scripts: { [M11_ALLOWED]: 'touch ALLOWED', [M11_UNLISTED]: 'touch UNLISTED' } }),
  );
  fs.writeFileSync(
    path.join(dir, '.claude', 'settings.json'),
    JSON.stringify({ permissions: { allow: [`Bash(npm run ${M11_ALLOWED})`] } }),
  );
  return dir;
};

test(
  "M11: a job in dontAsk honours the checkout's settings as a --bg session does — the allowed command runs, the unlisted one is denied, and the job records the denial",
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    const version = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
    t.diagnostic(`claude --version: ${version}`);
    const engine = createEngine({ root: tmp('m11-board') });
    const job = oneAllowedCheckout('m11-job');
    const bg = oneAllowedCheckout('m11-bg');
    t.diagnostic(`allowed: npm run ${M11_ALLOWED}; unlisted: npm run ${M11_UNLISTED}`);
    // The planner's and the reviewer's fence: dontAsk, nothing allowed on the task, the checkout's settings the only list.
    const common = {
      brief: M11_BRIEF,
      closeoutSchema: DENY_CLOSEOUT,
      deadlineSeconds: 480,
      config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Bash'] },
    };
    try {
      const ids = {
        job: await engine.file({ ...common, cwd: job }),
        bg: await engine.file({ ...common, cwd: bg, config: { ...common.config, background: true } }),
      };
      await settleThenCheck(engine, ids, (views) => {
        const last = (k: string) => views[k]?.state.attempts.at(-1);
        for (const k of ['job', 'bg']) {
          t.diagnostic(
            `${k}: ${views[k]?.state.settled}, exit ${last(k)?.exitCode}, said ${JSON.stringify(last(k)?.closeout)}, denied ${JSON.stringify(last(k)?.denials)}, wrote ${M11_WRITTEN.filter((f) => fs.existsSync(path.join(k === 'job' ? job : bg, f)))}`,
          );
        }
        // The control: a background session there honours the settings, or nothing below is about a job.
        assert.equal(views.bg?.state.settled, 'succeeded', `the background session settled: ${views.bg?.phase}`);
        assert.deepEqual(
          M11_WRITTEN.filter((f) => fs.existsSync(path.join(bg, f))),
          ['ALLOWED'],
          'control: the background session ran the allowed command and not the unlisted one — refused, run this from a checkout Claude Code trusts',
        );

        assert.equal(views.job?.state.settled, 'succeeded', `the job settled: ${views.job?.phase}`);
        assert.equal(typeof last('job')?.exitCode, 'number', 'it ran as a job: a process that exited');
        assert.deepEqual(
          M11_WRITTEN.filter((f) => fs.existsSync(path.join(job, f))),
          ['ALLOWED'],
          'the job ran the command its settings allow, and not the one they do not list',
        );
        // A denial names a command by its first word (`denialOf`), so the two are told apart by count: the allowed one ran, one was denied.
        assert.deepEqual(
          last('job')?.denials,
          [{ tool: 'Bash', what: 'npm' }],
          'and its attempt records one denial, the unlisted command: the allowed one ran',
        );
      });
    } finally {
      for (const dir of [job, bg]) fs.rmSync(dir, { recursive: true, force: true });
    }
  },
);

const M12_CLOSEOUT = { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false };

test(
  'M12: a job held open signs and waits with no process, an answer resumes its session under its own cap and it remembers, a close settles it',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    t.diagnostic(`claude --version: ${execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()}`);
    const root = tmp('m12-board');
    const engine = createEngine({ root });
    // Said in the brief and nowhere else: only a session that continues the first knows it.
    const secret = `m12-${randomUUID().slice(0, 8)}`;
    const id = await engine.file({
      brief: `Remember the code word ${secret}. Call no tool but StructuredOutput, and give your closing statement with word set to ready.`,
      cwd: tmp('m12-work'),
      closeoutSchema: M12_CLOSEOUT,
      holdOpen: true,
      deadlineSeconds: 300,
      config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Read'], budgetUsd: 0.5 },
    });
    const until = async (phase: string) => {
      const by = Date.now() + 5 * 60_000;
      let v = await engine.view(id);
      while (v.phase !== phase && !v.state.settled && Date.now() < by) {
        await new Promise((r) => setTimeout(r, 3_000));
        await engine.tick();
        v = await engine.view(id);
      }
      return v;
    };
    await engine.tick();
    const waiting = await until('input-required');
    t.diagnostic(`turn 0: ${waiting.phase}, ${JSON.stringify(waiting.state.attempts.map((a) => [a.ended, a.closeout, a.nativeId]))}`);
    assert.equal(waiting.phase, 'input-required');
    assert.deepEqual(waiting.state.attempts[0]?.closeout, { word: 'ready' });
    assert.equal(
      execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).includes(nameFor(id, 1)),
      false,
      'no process runs for it while it waits',
    );
    for (let i = 0; i < 2; i++) await engine.tick();
    assert.equal((await engine.view(id)).state.attempts.length, 1, 'and ticks start nothing');

    await engine.answer(id, 'Call no tool but StructuredOutput. Give your closing statement with word set to the code word I gave you.', {
      config: { budgetUsd: 0.3 },
    });
    await engine.tick();
    const answered = await until('input-required');
    const [first, second] = answered.state.attempts;
    t.diagnostic(
      `turn 1: ${answered.phase}, ${JSON.stringify([second?.ended, second?.closeout, second?.resumeFrom, second?.nativeId, second?.usage?.cacheReadTokens])}`,
    );
    assert.equal(answered.phase, 'input-required', 'signed again, it waits again');
    assert.equal(second?.resumeFrom, first?.nativeId, 'the turn resumed the session that signed');
    assert.deepEqual(second?.closeout, { word: secret }, 'and it remembered what only that session was told');
    const args = fs.readFileSync(
      path.join(root, 'runs', 'claude', `${nameFor(id, 2).replaceAll('/', '_').replaceAll('-', '_')}.json`),
      'utf8',
    );
    assert.match(args, /"--max-budget-usd","0\.3"/, "under the answer's cap");

    await engine.close(id);
    await engine.tick();
    assert.equal((await engine.view(id)).state.settled, 'succeeded');
  },
);

const M13_CLOSEOUT = { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false };
const hasCodex = (() => {
  try {
    execFileSync('codex', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test(
  'M13: a Codex task held open signs and waits with no process; its answer resumes the thread that signed — whether under the same thread id, and in the same rollout, is what it records',
  {
    skip: live ? (hasCodex ? false : 'no `codex` on PATH') : 'set AE_LIVE=1 to run against Codex (spends from its subscription)',
    timeout: 15 * 60_000,
  },
  async (t) => {
    t.diagnostic(`codex --version: ${execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim()}`);
    const root = tmp('m13-board');
    const engine = createEngine({ root, harnesses: { codex } });
    const client = clientOf('codex', detachedOps(codex, root), (taskId) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Journal).read(taskId);
        }).pipe(Effect.provide(Journal.files(root))),
      ),
    );
    // Said in the brief and nowhere else: only a turn that continues the first thread knows it.
    const secret = `m13-${randomUUID().slice(0, 8)}`;
    const id = await engine.file({
      brief: `Remember the code word ${secret}. Run no command. Give your final answer with word set to ready.`,
      cwd: tmp('m13-work'),
      harness: 'codex',
      closeoutSchema: M13_CLOSEOUT,
      holdOpen: true,
      deadlineSeconds: 300,
      config: { permissionMode: 'read-only', effort: 'low' },
    });
    const until = async (phase: string) => {
      const by = Date.now() + 5 * 60_000;
      let v = await engine.view(id);
      while (v.phase !== phase && !v.state.settled && Date.now() < by) {
        await new Promise((r) => setTimeout(r, 3_000));
        await engine.tick();
        v = await engine.view(id);
      }
      return v;
    };
    await engine.tick();
    const waiting = await until('input-required');
    const first = waiting.state.attempts[0];
    t.diagnostic(`turn 0: ${waiting.phase}, ${JSON.stringify([first?.ended, first?.closeout, first?.nativeId])}`);
    assert.equal(waiting.phase, 'input-required');
    assert.deepEqual(first?.closeout, { word: 'ready' });
    assert.ok(first?.nativeId, 'the worker read a thread id off what Codex printed');
    const held = await client.getTask({ tenant: '', id: nameFor(id, 1), historyLength: undefined });
    assert.equal(held.status!.state, TaskState.TASK_STATE_INPUT_REQUIRED, 'its A2A Task waits on a person');
    assert.equal(held.contextId, first.nativeId, 'in the context of its thread');
    const workerOf = (n: number) =>
      fs
        .readdirSync(path.join(root, 'runs', 'codex'))
        .filter((f) => f.endsWith('.json'))
        .map((f) => JSON.parse(fs.readFileSync(path.join(root, 'runs', 'codex', f), 'utf8')) as { name?: string; pid: number })
        .find((r) => r.name === nameFor(id, n))?.pid;
    const alive = (pid: number | undefined) => {
      try {
        return !!pid && process.kill(pid, 0);
      } catch {
        return false;
      }
    };
    assert.ok(workerOf(1), 'the worker recorded its pid');
    assert.equal(alive(workerOf(1)), false, 'and no worker runs for it while it waits');

    await engine.answer(id, 'Run no command. Give your final answer with word set to the code word I gave you.');
    await engine.tick();
    const answered = await until('input-required');
    const second = answered.state.attempts[1];
    const rollouts = [first.nativeId, second?.nativeId].map((n) => (n ? codexRolloutFile(n) : undefined));
    t.diagnostic(`turn 1: ${answered.phase}, ${JSON.stringify([second?.ended, second?.closeout, second?.resumeFrom, second?.nativeId])}`);
    t.diagnostic(`same thread id: ${second?.nativeId === first.nativeId}; rollouts: ${JSON.stringify(rollouts)}`);
    assert.equal(answered.phase, 'input-required', 'signed again, it waits again');
    assert.equal(second?.resumeFrom, first.nativeId, 'the turn resumed the thread that signed');
    assert.deepEqual(second?.closeout, { word: secret }, 'and it remembered what only that thread was told');
    assert.equal(second?.nativeId, first.nativeId, 'a resumed Codex thread keeps its id: one context across both turns');
    assert.ok(rollouts[0], 'Codex kept a rollout of the thread');
    assert.equal(rollouts[1], rollouts[0], 'and the resume wrote into the same one');
    const resumed = await client.getTask({ tenant: '', id: nameFor(id, 2), historyLength: undefined });
    assert.equal(resumed.contextId, held.contextId, 'the answered turn is a Task in the same context');

    await engine.close(id);
    await engine.tick();
    assert.equal((await engine.view(id)).state.settled, 'succeeded');
  },
);
