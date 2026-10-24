/**
 * Against the real harness — skipped unless `AE_LIVE=1`, because it spends money. A fence proven by a flag's help text is the
 * kind of guard that is silently inert, so each is proven by a session that runs, beside a control identical but for the one
 * field, which must do what the fenced one cannot: without the control, a session that never ran would pass too.
 *
 * - `--tools`: a job told to write a file with no tool that can, and which still gives its closing statement.
 * - `--disallowedTools`: a job told to run `npm run build` and `npm run e2e`, in `dontAsk`, in a checkout whose
 *   `.claude/settings.json` allows both; the control must run both. Claude Code gives a session in a directory it does not trust
 *   none of the directory's settings, so the checkouts are made inside this package, and the test is run from a checkout Claude
 *   Code trusts.
 * - The MCP fence: a session filed with no `mcp`, in an empty directory, on a machine whose operator has servers, claude.ai
 *   connectors and Claude in Chrome, reports no MCP server and no MCP tool; the control, given one server, reports that server
 *   and its tool. Servers connect after a session starts, so the brief waits for them.
 * - An attached session's typed options, which only the real Claude Code can answer for (the stand-in pins the SDK's protocol, not
 *   Claude Code's behaviour): a session held on `query()` with its servers on `Options.mcpServers`, its agent prompt on
 *   `Options.systemPrompt`'s `append` and auto-memory off in `Options.settings` reports the one server it was given, the word only
 *   the appended prompt names, Claude Code's own instructions before that prompt, and leaves no `MEMORY.md` behind.
 * - An attached session's skills: given `enabledSkills` naming one plugin skill, Claude Code lists it that skill alone (the transcript's
 *   `skill_listing`, what the model reads, not `init`'s `skills`, which lists every skill either way); its control, on `'default'`, is
 *   listed the built-in ones beside it.
 * - An attached session's cost across its processes: a resumed query's first result carries on the total its parent saved as it
 *   exited, and a session cut by its holder's let-go prints the turn it was cut in, saves its total, and its resume carries it on
 *   (`docs/harness.md`). What it read is said as diagnostics; what the let-go rests on is asserted.
 * - `say`: a job told to wait for a message naming a file is told a name on its stdin, and writes that file and closes with its
 *   name; an identical job never told writes nothing.
 * - A budget: a job stops at its cap after its first response or two.
 * - Claude Code as a job (M1, M2, M3, M5, M7, M11, M12 and M14, docs/open-issues.md, *Claude Code as a job*): every Claude Code
 *   session runs on the Agent SDK, a step as a job; these keep what that rests on measurable on each Claude Code. A resume's result
 *   prints the whole session's cost, and the job takes its parent's off. The bridge a job or a long-lived session opens at init
 *   (`claude.remoteControl`) was measured once by the probe of `docs/harness.md`, and is held by the stand-in's boundary tests.
 * - Codex as an A2A agent (M13, only where `codex` is on PATH): a held Codex task is an A2A context, which rests on a claim no
 *   fake can make — that `codex exec resume <thread>` goes on under the same thread id and in the same rollout, rather than
 *   forking a thread of its own. A task told a word signs, waits with no worker, is answered, and says the word under the
 *   thread id it signed with.
 *
 * Every session a test starts is stopped at its end, whatever happened.
 *
 *   AE_LIVE=1 node --test test/live.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Exit, Scope } from 'effect';
import { nameFor, type EngineShape, type Said, type TaskView } from '../src/index.ts';
import { Engine as EngineService } from '../src/index.ts';
import { builtEngine } from './engine.ts';
import { Journal } from '../src/core/engine/journal.ts';
import { TaskState } from '@a2a-js/sdk';
import { clientOf } from '../src/a2a/client.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { codexRolloutFile } from '../src/harness/codex/transcript.ts';
import { claudeTranscriptFile } from '../src/harness/claude/transcript.ts';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { attachedSessions } from '../src/harness/claude/attached.ts';
import { filesOf, readRun } from '../src/harness/claude/attached-file.ts';
import { claudeStreamOutput } from '../src/harness/detached/output.ts';
import { until as waitUntil } from '../src/waits/index.ts';
import { scratch } from './scratch.ts';

const live = process.env.AE_LIVE === '1';
const skip = live ? false : 'set AE_LIVE=1 to run against Claude Code (spends money)';
const tmp = (label: string) => scratch(`ae-live-${label}-`);

/**
 * Do `act`, tick until every task has settled or ten minutes pass, check, and leave no session behind — one that
 * `act` threw on included. The engine releases a session once its end is on the record; this stops and removes each one that
 * never got that far, and passes over a task with no view, which has nothing known to clean.
 */
const settleThenCheck = async (
  engine: EngineShape,
  ids: Record<string, string>,
  check: (views: Record<string, TaskView>) => void,
  act?: () => Promise<void>,
) => {
  const views: Record<string, TaskView> = {};
  try {
    await act?.();
    const until = Date.now() + 10 * 60_000;
    while (Date.now() < until) {
      await Effect.runPromise(engine.tick());
      for (const [k, id] of Object.entries(ids)) views[k] = await Effect.runPromise(engine.view(id));
      if (Object.values(views).every((v) => v.state.settled)) break;
      await new Promise((r) => setTimeout(r, 5_000));
    }
    check(views);
  } finally {
    for (const [k, id] of Object.entries(ids)) {
      if (!views[k]) {
        try {
          views[k] = await Effect.runPromise(engine.view(id));
        } catch {}
      }
    }
    for (const v of Object.values(views)) {
      if (!v.sessionId) continue;
      const short = v.sessionId.split('-')[0];
      for (const verb of ['stop', 'rm']) {
        try {
          execFileSync('claude', [verb, short], { stdio: 'ignore', timeout: 30_000 });
        } catch {}
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
  'a job with tools: Read, Grep, Glob cannot write a file; the same brief without them does',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    const engine = builtEngine(EngineService.layer({ root: tmp('board') }));
    const fenced = tmp('fenced');
    const open = tmp('open');
    const common = { brief: BRIEF, closeoutSchema: CLOSEOUT, deadlineSeconds: 480, config: { effort: 'low' } };
    const ids = {
      fenced: await Effect.runPromise(
        engine.file({ ...common, cwd: fenced, config: { ...common.config, tools: ['Read', 'Grep', 'Glob'] } }),
      ),
      open: await Effect.runPromise(engine.file({ ...common, cwd: open })),
    };

    await settleThenCheck(engine, ids, (views) => {
      assert.equal(views.open?.state.settled, 'succeeded', `control settled: ${views.open?.phase}`);
      assert.ok(fs.existsSync(path.join(open, 'PROOF.txt')), 'control: the brief does get a file written when a tool can');

      assert.equal(views.fenced?.state.settled, 'succeeded', `fenced settled: ${views.fenced?.phase}`);
      assert.equal(fs.existsSync(path.join(fenced, 'PROOF.txt')), false, 'the fence held: no tool, no file');
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

/** A folder inside this package, not under the machine's temp directory, whose directories Claude Code does not trust. */
const trusted = (label: string) => fs.mkdtempSync(path.join(import.meta.dirname, '..', `.ae-live-${label}-`));

/** A checkout as this repository's review has one, made `trusted`: its settings allow both commands, and each writes a file into it. */
const allowingCheckout = (label: string) => {
  const dir = trusted(label);
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
  'a job in dontAsk, in a checkout whose settings allow npm run build and npm run e2e, runs neither when disallowedTools names both; the same session without it runs both',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    const engine = builtEngine(EngineService.layer({ root: tmp('deny-board') }));
    const fenced = allowingCheckout('deny-fenced');
    const open = allowingCheckout('deny-open');
    const common = {
      brief: DENY_BRIEF,
      closeoutSchema: DENY_CLOSEOUT,
      deadlineSeconds: 480,
      config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Bash'] },
    };
    try {
      const ids = {
        fenced: await Effect.runPromise(
          engine.file({
            ...common,
            cwd: fenced,
            config: { ...common.config, disallowedTools: ['Bash(npm run build)', 'Bash(npm run e2e)'] },
          }),
        ),
        open: await Effect.runPromise(engine.file({ ...common, cwd: open })),
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

/**
 * The smallest MCP server: newline-delimited JSON-RPC on stdio, with one tool, `ping`. Given a first argument, it writes the arguments
 * after it to that file as it starts, which is how the attached case below reads what Claude Code made of a `${NAME:-default}` in them.
 */
const PROBE_SERVER = `
import fs from 'node:fs';
import readline from 'node:readline';
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(process.argv.slice(3)));
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
  "a job filed with no mcp, in an empty directory, has no MCP tools — not the operator's; one given a server has its tool",
  {
    skip,
    timeout: 12 * 60_000,
  },
  async () => {
    const engine = builtEngine(EngineService.layer({ root: tmp('mcp-board') }));
    const server = path.join(tmp('mcp-server'), 'server.mjs');
    fs.writeFileSync(server, PROBE_SERVER);
    const common = { brief: MCP_BRIEF, closeoutSchema: MCP_CLOSEOUT, deadlineSeconds: 480, config: { effort: 'low' } };
    const ids = {
      bare: await Effect.runPromise(engine.file({ ...common, cwd: tmp('mcp-bare') })),
      given: await Effect.runPromise(
        engine.file({
          ...common,
          cwd: tmp('mcp-given'),
          config: { ...common.config, mcp: { aeprobe: { command: process.execPath, args: [server] } } },
        }),
      ),
    };

    await settleThenCheck(engine, ids, (views) => {
      const said = (k: string) => views[k]?.state.attempts.at(-1)?.closeout as { mcpServers?: string[]; mcpTools?: string[] } | undefined;
      assert.equal(views.given?.state.settled, 'succeeded', `control settled: ${views.given?.phase}`);
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
 * Told a file name while it works, a session writes that file; the same session never told writes none. A job is told
 * on its stdin, by its worker. Both are filed at shipped defaults, with Bash to wait with and Write to answer with.
 *
 * - The told session is told once it is seen at work, listed running in its sleep loop, inside `settleThenCheck`, so a `say`
 *   that rejects still leaves no session behind.
 * - Its own record then carries the words once, as the transcript reader gives them to a board, never as the model's mention
 *   of the file's name, which would pass with the reader of words sent in broken: as the person's words, since Claude Code keeps a
 *   user message said on its stdin while it works as an attachment the reader gives as the user's, as the brief is.
 */
const sayReaches = async () => {
  const engine = builtEngine(EngineService.layer({ root: tmp('say-board') }));
  const told = tmp('say-told');
  const control = tmp('say-control');
  const common = {
    brief: SAY_BRIEF,
    closeoutSchema: NAME_CLOSEOUT,
    deadlineSeconds: 600,
    config: { effort: 'low', tools: ['Bash', 'Write'] },
  };
  const ids = {
    told: await Effect.runPromise(engine.file({ ...common, cwd: told })),
    control: await Effect.runPromise(engine.file({ ...common, cwd: control })),
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
      const until = Date.now() + 5 * 60_000;
      while (!said && Date.now() < until) {
        await Effect.runPromise(engine.tick());
        const { phase } = await Effect.runPromise(engine.view(ids.told));
        if (phase === 'working' || phase === 'quiescent') said = await Effect.runPromise(engine.say(ids.told, words));
        else await new Promise((r) => setTimeout(r, 5_000));
      }
      assert.ok(said, 'the told session was seen working within five minutes, and told');
    },
  );

  const { events } = await Effect.runPromise(engine.transcript(ids.told));
  const arrived = events.filter((e) => e.role === 'user' && e.kind === 'text' && e.text === words);
  assert.equal(
    arrived.length,
    1,
    `the told job's transcript carries the words once, as the person's: ${JSON.stringify(events.filter((e) => e.role === 'user'))}`,
  );
};

test(
  'say reaches a working job on its stdin: told a file name, it writes that file; the same job never told writes none — and the journal has what was said',
  {
    skip,
    timeout: 15 * 60_000,
  },
  sayReaches,
);

const WORD_CLOSEOUT = {
  type: 'object',
  properties: { word: { type: 'string' } },
  required: ['word'],
  additionalProperties: false,
};

const NOTES = Array.from(
  { length: 2000 },
  (_, i) =>
    `line ${i + 1}: ${i % 7 === 0 ? 'a note' : 'nothing here'} — the quick brown fox jumps over the lazy dog, again and again and again`,
).join('\n');
/**
 * A session that spends: a long file, read fifty lines a call, so that every call reads lines it has not read. Told to read one
 * short file over and over, haiku can decline it as a waste and ask what was wanted, which Claude Code lists `blocked`.
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
  'a job given a $0.01 budget stops at it: the attempt ends failed at the limit `budget`, with what it cost — and its task settles failed, with no attempt 2',
  {
    skip,
    timeout: 12 * 60_000,
  },
  async (t) => {
    const engine = builtEngine(EngineService.layer({ root: tmp('budget-board') }));
    const ids = {
      capped: await Effect.runPromise(
        engine.file({
          brief: LOOP_BRIEF,
          cwd: notesIn('budget-p'),
          harness: 'claude',
          config: { model: 'haiku', tools: ['Read'], budgetUsd: 0.01 },
          deadlineSeconds: 480,
        }),
      ),
    };
    await settleThenCheck(engine, ids, (views) => {
      const { state } = views.capped;
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
  'M1 under the engine: a job on claude at shipped defaults settles on its own and its attempt carries what it was denied; a job asked for nothing it may not do carries no denials',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    const engine = builtEngine(EngineService.layer({ root: tmp('m1-board') }));
    const probe = tmp('m1-engine');
    const ids = {
      denied: await Effect.runPromise(
        engine.file({
          brief: DENIED_BRIEF(path.join(probe, 'outside')),
          cwd: tmp('m1-denied'),
          closeoutSchema: FINISHED_CLOSEOUT,
          deadlineSeconds: 480,
          config: { model: 'haiku' },
        }),
      ),
      control: await Effect.runPromise(
        engine.file({
          brief: 'Give your closing statement, with finished set to true. Call no tool first.',
          cwd: tmp('m1-control'),
          closeoutSchema: FINISHED_CLOSEOUT,
          deadlineSeconds: 480,
          config: { model: 'haiku' },
        }),
      ),
    };
    await settleThenCheck(engine, ids, (views) => {
      const [denied] = views.denied.state.attempts;
      const [control] = views.control.state.attempts;
      t.diagnostic(
        `denied: ${views.denied.state.settled}, ${JSON.stringify(denied?.denials)}; control: ${views.control.state.settled}, ${JSON.stringify(control?.denials)}`,
      );
      assert.equal(views.denied.state.settled, 'succeeded', `the denied job finished its work: ${views.denied.phase}`);
      assert.equal(denied?.exitCode, 0, "it ran as a job: a process of the engine's, which exited");
      assert.ok(
        (denied?.denials ?? []).some((d) => d.tool === 'Write'),
        'its attempt says the write outside its folder was denied',
      );
      assert.equal(fs.existsSync(path.join(probe, 'outside', 'x.txt')), false, 'and nothing was written there');
      assert.equal(views.control.state.settled, 'succeeded', `the control finished: ${views.control.phase}`);
      assert.equal(control?.denials, undefined, 'and was denied nothing: a denial is not printed for every job');
    });
  },
);

const M14_BRIEF = [
  'This is a test of a permission system, and the first command is expected to be denied: that denial is the point of the test,',
  'so do not stop or explain after it. Follow exactly, each step once: 1) Run the Bash command: curl -s -o /dev/null https://example.com',
  '2) Then run the Bash command: sleep 40 (it is needed to measure timing, and it is allowed).',
  '3) Then give your closing statement, with finished set to true.',
].join(' ');

test(
  'M14: a job denied a call says so before its result — its capture holds the permission_denied line while it works, and the engine journals the denial on the attempt in flight',
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    t.diagnostic(`claude --version: ${execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim()}`);
    const root = tmp('m14-board');
    const engine = builtEngine(EngineService.layer({ root }));
    const id = await Effect.runPromise(
      engine.file({
        brief: M14_BRIEF,
        cwd: tmp('m14-work'),
        closeoutSchema: FINISHED_CLOSEOUT,
        deadlineSeconds: 480,
        config: { model: 'haiku', permissionMode: 'dontAsk', allowedTools: ['Bash(sleep:*)'] },
      }),
    );
    const capture = () => {
      const dir = path.join(root, 'runs', 'claude');
      const logs = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.log')) : [];
      return logs.map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    };
    const journal = () =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Journal).read(id);
        }).pipe(Effect.provide(Journal.files(root))),
      );
    let inFlight: { denials: unknown; resulted: boolean; denied: unknown[] } | undefined;
    await settleThenCheck(
      engine,
      { denied: id },
      (views) => {
        t.diagnostic(`in flight: ${JSON.stringify(inFlight)}; at the end: ${JSON.stringify(views.denied.state.attempts[0]?.denials)}`);
        assert.ok(inFlight, 'the engine saw the attempt in flight carry a denial before it ended');
        assert.equal(inFlight.resulted, false, 'and the capture held no result line yet: the stream said it as it happened');
        assert.deepEqual(inFlight.denials, [{ tool: 'Bash', what: 'curl' }], 'the attempt in flight says the denied call');
        assert.deepEqual(inFlight.denied, [{ tool: 'Bash', what: 'curl', attempt: 1 }], 'its journal has one denied entry for it');
        assert.equal(views.denied.state.settled, 'succeeded', `the job finished its work: ${views.denied.phase}`);
        assert.deepEqual(views.denied.state.attempts[0]?.denials, [{ tool: 'Bash', what: 'curl' }], 'and its end names the same call');
      },
      async () => {
        const until = Date.now() + 5 * 60_000;
        while (Date.now() < until && !inFlight) {
          await Effect.runPromise(engine.tick());
          const attempt = (await Effect.runPromise(engine.view(id))).state.attempts[0];
          if (attempt?.ended != null) return;
          if (attempt?.denials?.length) {
            const denied = (await journal()).flatMap((e) =>
              e.kind === 'denied' ? [{ tool: e.tool, what: e.what, attempt: e.attempt }] : [],
            );
            inFlight = { denials: attempt.denials, resulted: /"type"\s*:\s*"result"/.test(capture()), denied };
          }
          await new Promise((r) => setTimeout(r, 1_000));
        }
      },
    );
  },
);

test(
  "M3, M5: a job resumed from a job remembers it and is charged its own spend, not its parent's again; a budget on a resume caps its own spend",
  {
    skip,
    timeout: 40 * 60_000,
  },
  async (t) => {
    const engine = builtEngine(EngineService.layer({ root: tmp('m2-board') }));
    const cwd = tmp('m2');
    const settled = async (id: string) => {
      const end = Date.now() + 10 * 60_000;
      while (Date.now() < end) {
        await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(id));
        if (v.state.settled) return v;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      return Effect.runPromise(engine.view(id));
    };
    const common = { cwd, deadlineSeconds: 480, closeoutSchema: WORD_CLOSEOUT };
    const tell = (word: string) =>
      `The code word is ${word}. Remember it, and do nothing else. Then give your closing statement, with word set to ok.`;
    const ask = 'What was the code word you were given? Give it as word in your closing statement.';
    const last = (v: TaskView) => v.state.attempts.at(-1);

    const word = `ae${randomUUID().slice(0, 8)}`;
    const first = await settled(await Effect.runPromise(engine.file({ ...common, config: { model: 'haiku' }, brief: tell(word) })));
    assert.equal(first.state.settled, 'succeeded', `the first job settled: ${first.phase}`);
    const second = await settled(
      await Effect.runPromise(engine.file({ ...common, config: { model: 'haiku' }, resumeFrom: last(first)!.nativeId!, brief: ask })),
    );
    const [one, two] = [last(first)?.usage?.costUsd, last(second)?.usage?.costUsd];
    t.diagnostic(`costs: first job ${one}, the job resumed from it ${two}`);
    assert.deepEqual(last(second)?.closeout, { word }, 'a job resumed from a job remembers');
    assert.ok(one !== undefined && one > 0 && two !== undefined && two > 0, 'and both were charged something');
    assert.ok(
      two < one,
      "the resume, a short question on a warm cache, was charged less than the job it continued: not that job's spend again",
    );

    const cap = Math.max(0.01, Math.round((one + two) * 50) / 100);
    const capped = await settled(
      await Effect.runPromise(
        engine.file({ ...common, config: { model: 'haiku', budgetUsd: cap }, resumeFrom: last(second)!.nativeId!, brief: ask }),
      ),
    );
    t.diagnostic(
      `a resume capped at $${cap}, under its session's $${(one + two).toFixed(4)}: ${capped.state.settled}, ${last(capped)?.reason}, cost ${last(capped)?.usage?.costUsd}`,
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
    const engine = builtEngine(EngineService.layer({ root: tmp('m7-board') }));
    const probe = tmp('m7');
    const common = { cwd: tmp('m7-work'), deadlineSeconds: 480, closeoutSchema: FINISHED_CLOSEOUT, config: { model: 'haiku' } };
    const settled = async (id: string) => {
      const end = Date.now() + 10 * 60_000;
      while (Date.now() < end) {
        await Effect.runPromise(engine.tick());
        const v = await Effect.runPromise(engine.view(id));
        if (v.state.settled) return v;
        await new Promise((r) => setTimeout(r, 5_000));
      }
      return Effect.runPromise(engine.view(id));
    };
    const denied = await settled(await Effect.runPromise(engine.file({ ...common, brief: DENIED_BRIEF(path.join(probe, 'outside')) })));
    const parent = denied.state.attempts.at(-1);
    assert.equal(denied.state.settled, 'succeeded', `the denied job settled: ${denied.phase}`);
    assert.ok(
      (parent?.denials ?? []).some((d) => d.tool === 'Write'),
      'and its attempt says what it was denied',
    );
    const resumed = await settled(
      await Effect.runPromise(
        engine.file({
          ...common,
          resumeFrom: parent!.nativeId!,
          brief: 'Give your closing statement, with finished set to true. Call no tool first.',
        }),
      ),
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

/**
 * M11 measures a job's fence: the planner and the reviewers run `dontAsk` with no allow list of
 * their own, fenced by the checkout's `.claude/settings.json` alone, so a job that read no project settings would be denied every
 * command they run. A denial names a command by its first word (`denialOf`), so the two are told apart by count.
 *
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
  "M11: a job in dontAsk honours the checkout's settings — the allowed command runs, the unlisted one is denied, and the job records the denial",
  {
    skip,
    timeout: 15 * 60_000,
  },
  async (t) => {
    const version = execFileSync('claude', ['--version'], { encoding: 'utf8' }).trim();
    t.diagnostic(`claude --version: ${version}`);
    const engine = builtEngine(EngineService.layer({ root: tmp('m11-board') }));
    const job = oneAllowedCheckout('m11-job');
    t.diagnostic(`allowed: npm run ${M11_ALLOWED}; unlisted: npm run ${M11_UNLISTED}`);
    const common = {
      brief: M11_BRIEF,
      closeoutSchema: DENY_CLOSEOUT,
      deadlineSeconds: 480,
      config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Bash'] },
    };
    try {
      const ids = {
        job: await Effect.runPromise(engine.file({ ...common, cwd: job })),
      };
      await settleThenCheck(engine, ids, (views) => {
        const last = (k: string) => views[k]?.state.attempts.at(-1);
        t.diagnostic(
          `job: ${views.job?.state.settled}, exit ${last('job')?.exitCode}, said ${JSON.stringify(last('job')?.closeout)}, denied ${JSON.stringify(last('job')?.denials)}, wrote ${M11_WRITTEN.filter((f) => fs.existsSync(path.join(job, f)))}`,
        );
        assert.equal(views.job?.state.settled, 'succeeded', `the job settled: ${views.job?.phase}`);
        assert.equal(typeof last('job')?.exitCode, 'number', 'it ran as a job: a process that exited');
        assert.deepEqual(
          M11_WRITTEN.filter((f) => fs.existsSync(path.join(job, f))),
          ['ALLOWED'],
          'the job ran the command its settings allow, and not the one they do not list',
        );
        assert.deepEqual(
          last('job')?.denials,
          [{ tool: 'Bash', what: 'npm' }],
          'and its attempt records one denial, the unlisted command: the allowed one ran',
        );
      });
    } finally {
      for (const dir of [job]) fs.rmSync(dir, { recursive: true, force: true });
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
    const engine = builtEngine(EngineService.layer({ root }));
    const secret = `m12-${randomUUID().slice(0, 8)}`;
    const id = await Effect.runPromise(
      engine.file({
        brief: `Remember the code word ${secret}. Call no tool but StructuredOutput, and give your closing statement with word set to ready.`,
        cwd: tmp('m12-work'),
        closeoutSchema: M12_CLOSEOUT,
        holdOpen: true,
        deadlineSeconds: 300,
        config: { model: 'haiku', permissionMode: 'dontAsk', tools: ['Read'], budgetUsd: 0.5 },
      }),
    );
    const until = async (phase: string) => {
      const by = Date.now() + 5 * 60_000;
      let v = await Effect.runPromise(engine.view(id));
      while (v.phase !== phase && !v.state.settled && Date.now() < by) {
        await new Promise((r) => setTimeout(r, 3_000));
        await Effect.runPromise(engine.tick());
        v = await Effect.runPromise(engine.view(id));
      }
      return v;
    };
    await Effect.runPromise(engine.tick());
    const waiting = await until('input-required');
    t.diagnostic(`turn 0: ${waiting.phase}, ${JSON.stringify(waiting.state.attempts.map((a) => [a.ended, a.closeout, a.nativeId]))}`);
    assert.equal(waiting.phase, 'input-required');
    assert.deepEqual(waiting.state.attempts[0]?.closeout, { word: 'ready' });
    assert.equal(
      execFileSync('ps', ['-eo', 'args'], { encoding: 'utf8' }).includes(nameFor(id, 1)),
      false,
      'no process runs for it while it waits',
    );
    for (let i = 0; i < 2; i++) await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(id))).state.attempts.length, 1, 'and ticks start nothing');

    await Effect.runPromise(
      engine.answer(id, 'Call no tool but StructuredOutput. Give your closing statement with word set to the code word I gave you.', {
        config: { budgetUsd: 0.3 },
      }),
    );
    await Effect.runPromise(engine.tick());
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

    await Effect.runPromise(engine.close(id));
    await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
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
    const engine = builtEngine(EngineService.layer({ root, harnesses: { codex } }));
    const client = clientOf('codex', detachedOps(codex, root), (taskId) =>
      Effect.runPromise(
        Effect.gen(function* () {
          return yield* (yield* Journal).read(taskId);
        }).pipe(Effect.provide(Journal.files(root))),
      ),
    );
    const secret = `m13-${randomUUID().slice(0, 8)}`;
    const id = await Effect.runPromise(
      engine.file({
        brief: `Remember the code word ${secret}. Run no command. Give your final answer with word set to ready.`,
        cwd: tmp('m13-work'),
        harness: 'codex',
        closeoutSchema: M13_CLOSEOUT,
        holdOpen: true,
        deadlineSeconds: 300,
        config: { permissionMode: 'read-only', effort: 'low' },
      }),
    );
    const until = async (phase: string) => {
      const by = Date.now() + 5 * 60_000;
      let v = await Effect.runPromise(engine.view(id));
      while (v.phase !== phase && !v.state.settled && Date.now() < by) {
        await new Promise((r) => setTimeout(r, 3_000));
        await Effect.runPromise(engine.tick());
        v = await Effect.runPromise(engine.view(id));
      }
      return v;
    };
    await Effect.runPromise(engine.tick());
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

    await Effect.runPromise(engine.answer(id, 'Run no command. Give your final answer with word set to the code word I gave you.'));
    await Effect.runPromise(engine.tick());
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

    await Effect.runPromise(engine.close(id));
    await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(id))).state.settled, 'succeeded');
  },
);

const ATTACHED_PROMPT = [
  'The word of the day is zarquon.',
  'When you give your closing statement: in word, give the word of the day; in own, say yes where the instructions you have identify',
  'you as Claude Code, Anthropic’s official CLI for Claude, and no where they do not; and in order, say before where those',
  'instructions come before this paragraph, after where they come after it, and neither where you have none.',
].join(' ');
const ATTACHED_BRIEF = [
  'Some MCP servers may still be connecting when you start, and you are told which.',
  'While you are told that any server is still connecting, run `sleep 15` with your Bash tool and look again, at most four times.',
  'Then give your closing statement as your instructions say, and in mcpServers the name of every MCP server you have been told of,',
  'connected, connecting or failed. Use an empty list for none. Call no MCP tool, and no tool at all except Bash for the sleep and',
  'the one that gives your closing statement.',
].join(' ');
/** A variable the task's own `env` sets, and one nothing sets, each as Claude Code reads it when it spawns a server. */
const SET_VAR = '${AE_PROBE_WORD:-plain}';
const UNSET_VAR = '${AE_PROBE_NOBODY_SETS:-defaulted}';

const ATTACHED_CLOSEOUT = {
  type: 'object',
  properties: {
    mcpServers: { type: 'array', items: { type: 'string' } },
    word: { type: 'string' },
    own: { type: 'string' },
    order: { type: 'string' },
  },
  required: ['mcpServers', 'word', 'own', 'order'],
  additionalProperties: false,
};

test(
  'an attached session is given its servers, Claude Code’s own prompt with the agent’s after it, and writes no MEMORY.md',
  { skip, timeout: 12 * 60_000 },
  async (t) => {
    const root = tmp('attached-options');
    const cwd = tmp('attached-cwd');
    const server = path.join(tmp('attached-server'), 'server.mjs');
    fs.writeFileSync(server, PROBE_SERVER);
    const prompt = path.join(cwd, 'agent.md');
    fs.writeFileSync(prompt, ATTACHED_PROMPT);
    const argv = path.join(cwd, 'server-argv.json');
    const name = 'ae/live-attached/1';
    const attached = attachedSessions(root);
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(Scope.provide(attached.hold, scope));
    const said = () => {
      const out = filesOf(root, name).out;
      return fs.existsSync(out) ? claudeStreamOutput(fs.readFileSync(out, 'utf8')) : {};
    };
    try {
      await Effect.runPromise(
        attached.ops.spawn({
          name,
          brief: ATTACHED_BRIEF,
          cwd,
          closeoutSchema: ATTACHED_CLOSEOUT,
          config: {
            effort: 'low',
            budgetUsd: 2,
            mcp: { aeprobe: { command: process.execPath, args: [server, argv, SET_VAR, UNSET_VAR] } },
            claude: { appendSystemPromptFile: prompt },
            env: { AE_PROBE_WORD: 'expanded' },
          },
        }),
      );
      const state = await waitUntil(
        t,
        () => {
          const s = readRun(filesOf(root, name).run)?.state;
          return s === undefined || s === 'working' || s === 'idle' ? undefined : s;
        },
        'the attached session ended',
        { everyMs: 5_000 },
      );
      const closeout = (said().closeout?.payload ?? {}) as Record<string, unknown>;
      t.diagnostic(`${state}: ${JSON.stringify(closeout)}`);
      assert.equal(state, 'completed', `the session ran to its end; it was ${state}`);
      assert.deepEqual(closeout.mcpServers, ['aeprobe'], 'the servers `Options.mcpServers` gave it, and no other');
      assert.equal(closeout.word, 'zarquon', 'the agent’s own prompt reached it, as `systemPrompt`’s `append` and not a file’s path');
      assert.equal(closeout.own, 'yes', 'with Claude Code’s own instructions, which the `claude_code` preset renders');
      assert.equal(closeout.order, 'before', 'and those come first: the agent’s prompt is appended after them');
      assert.equal(fs.existsSync(path.join(cwd, 'MEMORY.md')), false, 'auto-memory is off in the one settings object: no MEMORY.md');
      const given = JSON.parse(fs.readFileSync(argv, 'utf8')) as string[];
      t.diagnostic(`the server's own arguments: ${JSON.stringify(given)}`);
      assert.deepEqual(
        given,
        ['expanded', 'defaulted'],
        'a `${NAME:-default}` in a server\u2019s arguments is expanded where the servers ride `Options.mcpServers` inline, as it is ' +
          'from a config file: the repository\u2019s own `${WF_STEP_FILES:-/tmp/playwright-mcp}` still names a folder outside the workspace',
      );
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      const id = readRun(filesOf(root, name).run)?.sessionId;
      if (id) {
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, id.split('-')[0]], { stdio: 'ignore', timeout: 30_000 });
          } catch {}
        }
      }
    }
  },
);

const SKILLS_BRIEF =
  'Call no tool but the one that gives your closing statement. In skills, give the name of every skill you are told you can use, as ' +
  'you are told it; an empty list for none.';
const SKILLS_CLOSEOUT = {
  type: 'object',
  properties: { skills: { type: 'array', items: { type: 'string' } } },
  required: ['skills'],
  additionalProperties: false,
};
/** The one plugin skill both sessions are given: the frozen copy's shape, `nemia-<agent>:<name>`. */
const PLUGIN_SKILL = 'nemia-aeprobe:say-the-word';

/** The skills Claude Code listed to the model in the session `id`'s transcript (its `skill_listing`), and how many it counted. */
const skillListing = (id: string | undefined): { count?: number; names: string[] } | undefined => {
  const file = id ? claudeTranscriptFile(id) : undefined;
  if (file === undefined || !fs.existsSync(file)) return undefined;
  for (const l of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const a = (JSON.parse(l) as { attachment?: { type?: string; content?: string; skillCount?: number } }).attachment;
    if (a?.type !== 'skill_listing') continue;
    const names = (a.content ?? '').split('\n').flatMap((line) => /^- ([^:\s]+(?::[^:\s]+)?):/.exec(line)?.[1] ?? []);
    return { count: a.skillCount, names };
  }
  return { names: [] };
};

test(
  'an attached session given a closed list of skills is listed those alone; its control, on the default, lists the built-in ones too',
  { skip, timeout: 12 * 60_000 },
  async (t) => {
    const plugin = path.join(tmp('skills-plugin'), 'nemia-aeprobe');
    fs.mkdirSync(path.join(plugin, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'nemia-aeprobe', version: '0.0.0' }));
    fs.mkdirSync(path.join(plugin, 'skills', 'say-the-word'), { recursive: true });
    fs.writeFileSync(
      path.join(plugin, 'skills', 'say-the-word', 'SKILL.md'),
      '---\nname: say-the-word\ndescription: Say the word of the day when asked for it.\n---\n\nThe word of the day is zarquon.\n',
    );
    const root = tmp('skills-root');
    const attached = attachedSessions(root);
    const scope = Scope.makeUnsafe();
    await Effect.runPromise(Scope.provide(attached.hold, scope));
    const rows = { closed: [PLUGIN_SKILL], control: 'default' as const };
    const ids: Record<string, string | undefined> = {};
    try {
      await Promise.all(
        Object.entries(rows).map(async ([k, enabledSkills]) => {
          const name = `ae/live-skills/${k}`;
          await Effect.runPromise(
            attached.ops.spawn({
              name,
              brief: SKILLS_BRIEF,
              cwd: tmp(`skills-cwd-${k}`),
              closeoutSchema: SKILLS_CLOSEOUT,
              config: { effort: 'low', budgetUsd: 1, enabledSkills, claude: { pluginDir: [plugin] } },
            }),
          );
          const state = await waitUntil(
            t,
            () => {
              const s = readRun(filesOf(root, name).run)?.state;
              return s === undefined || s === 'working' || s === 'idle' ? undefined : s;
            },
            `the ${k} session ended`,
            { everyMs: 5_000 },
          );
          ids[k] = readRun(filesOf(root, name).run)?.sessionId;
          assert.equal(state, 'completed', `the ${k} session ran to its end; it was ${state}`);
        }),
      );
      const closed = skillListing(ids.closed);
      const control = skillListing(ids.control);
      t.diagnostic(`closed: ${JSON.stringify(closed)}`);
      t.diagnostic(`control: ${JSON.stringify(control)}`);
      assert.deepEqual(closed?.names, [PLUGIN_SKILL], 'the closed session is listed the one skill on its list, and no built-in one');
      assert.ok(control?.names.includes(PLUGIN_SKILL), 'the control is listed the plugin skill too');
      assert.ok((control?.names.length ?? 0) > 1, 'and others besides it: what the closed list hides is there to hide');
    } finally {
      await Effect.runPromise(Scope.close(scope, Exit.void));
      for (const id of Object.values(ids)) {
        if (!id) continue;
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, id.split('-')[0]], { stdio: 'ignore', timeout: 30_000 });
          } catch {}
        }
      }
    }
  },
);

/** The running totals Claude Code saved in the session `id`'s transcript as each of its processes exited, in order. */
const savedTotals = (id: string | undefined): number[] => {
  const file = id ? claudeTranscriptFile(id) : undefined;
  if (file === undefined || !fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      const line = JSON.parse(l) as { type?: string; totalCostUSD?: number };
      return line.type === 'cost-state' && typeof line.totalCostUSD === 'number' ? [line.totalCostUSD] : [];
    });
};

/** The `total_cost_usd` of each result an attached session's capture holds, in order, its processes one after another. */
const totalsOf = (root: string, name: string): number[] => {
  const out = filesOf(root, name).out;
  if (!fs.existsSync(out)) return [];
  return fs
    .readFileSync(out, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      const line = JSON.parse(l) as { type?: string; total_cost_usd?: number };
      return line.type === 'result' && typeof line.total_cost_usd === 'number' ? [line.total_cost_usd] : [];
    });
};

const CUT_BRIEF =
  'First say hello in one word. Then run the shell command `sleep 120` with your Bash tool and wait for it to end. Then say done.';
const BACK_CLOSEOUT = { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false };

test(
  "an attached session's cost: a resumed query carries on the total its parent saved, and a session cut by a let-go saves its own",
  { skip, timeout: 10 * 60_000 },
  async (t) => {
    const root = tmp('attached-cost');
    const cwd = tmp('attached-cost-cwd');
    const config = { model: 'haiku', effort: 'low' as const, budgetUsd: 1, allowedTools: ['Bash'], permissionMode: 'dontAsk' };
    const ended = (name: string) =>
      waitUntil(
        t,
        () => {
          const s = readRun(filesOf(root, name).run)?.state;
          return s === undefined || s === 'working' || s === 'idle' ? undefined : s;
        },
        `${name} ended`,
        { everyMs: 2_000 },
      );
    const ids: string[] = [];
    try {
      const first = attachedSessions(root);
      const firstScope = Scope.makeUnsafe();
      await Effect.runPromise(Scope.provide(first.hold, firstScope));
      await Effect.runPromise(
        first.ops.spawn({ name: 'ae/live-cost/1', brief: 'Say the word alpha.', cwd, closeoutSchema: BACK_CLOSEOUT, config }),
      );
      assert.equal(await ended('ae/live-cost/1'), 'completed');
      const parentId = readRun(filesOf(root, 'ae/live-cost/1').run)?.sessionId;
      if (parentId) ids.push(parentId);
      await Effect.runPromise(
        first.ops.spawn({
          name: 'ae/live-cost/2',
          brief: 'Say the word you said before.',
          cwd,
          closeoutSchema: BACK_CLOSEOUT,
          config,
          resumeFrom: parentId,
        }),
      );
      assert.equal(await ended('ae/live-cost/2'), 'completed');
      const [parentTotal] = totalsOf(root, 'ae/live-cost/1');
      const [resumedTotal] = totalsOf(root, 'ae/live-cost/2');
      t.diagnostic(
        `(a) parent printed ${parentTotal}, saved ${JSON.stringify(savedTotals(parentId))}; its resume's first result printed ` +
          `${resumedTotal}`,
      );
      assert.ok(parentTotal !== undefined && resumedTotal !== undefined && resumedTotal > parentTotal, 'a resume carries its parent on');

      const cutter = attachedSessions(root, undefined, { letGoMs: 30_000 });
      const cutScope = Scope.makeUnsafe();
      await Effect.runPromise(Scope.provide(cutter.hold, cutScope));
      await Effect.runPromise(Scope.close(firstScope, Exit.void));
      const name = 'ae/live-cost/3';
      await Effect.runPromise(cutter.ops.spawn({ name, brief: CUT_BRIEF, cwd, closeoutSchema: BACK_CLOSEOUT, config }));
      await waitUntil(t, () => readRun(filesOf(root, name).run)?.calling?.tool === 'Bash', 'the session in its sleep', {
        everyMs: 1_000,
      });
      const cutAt = Date.now();
      await Effect.runPromise(Scope.close(cutScope, Exit.void));
      const letGoMs = Date.now() - cutAt;
      const cut = readRun(filesOf(root, name).run);
      if (cut?.sessionId) ids.push(cut.sessionId);
      const cutTotals = totalsOf(root, name);
      const cutSaved = savedTotals(cut?.sessionId);
      t.diagnostic(`(b) cut: ${cut?.state}, printed ${JSON.stringify(cutTotals)}, saved ${JSON.stringify(cutSaved)}, let-go ${letGoMs} ms`);
      assert.equal(cut?.state, 'parked');
      assert.equal(cutTotals.length, 1, 'the cut process printed the turn it was cut in as a result');
      assert.equal(cutSaved.length, 1, 'and saved its running total as it exited');
      const next = attachedSessions(root);
      const nextScope = Scope.makeUnsafe();
      await Effect.runPromise(Scope.provide(next.hold, nextScope));
      try {
        await Effect.runPromise(next.ops.observe);
        await waitUntil(
          t,
          () => totalsOf(root, name).length >= 2 && readRun(filesOf(root, name).run)?.state !== 'working',
          'the resume ended',
          {
            everyMs: 2_000,
          },
        );
      } finally {
        await Effect.runPromise(Scope.close(nextScope, Exit.void));
      }
      const all = totalsOf(root, name);
      t.diagnostic(`(b) resumed: printed ${JSON.stringify(all)}, saved ${JSON.stringify(savedTotals(cut?.sessionId))}`);
      assert.ok((all.at(-1) ?? 0) >= (cutTotals[0] ?? Infinity), "the resume's total carries the cut process's spend on");
    } finally {
      for (const id of ids)
        for (const verb of ['stop', 'rm']) {
          try {
            execFileSync('claude', [verb, id.split('-')[0]], { stdio: 'ignore', timeout: 30_000 });
          } catch {}
        }
    }
  },
);
