/**
 * Nemia's custom instruction, written while her long-lived session runs, told to that session on the runtime by the keeper's next beat:
 * the words reach its inbox, while her task keeps its one attempt, never settles and is never asked to stop. On the runtime itself, with
 * a fake `claude` on PATH whose `--bg` lists the session working under a live process and registers it with an inbox, a Unix socket the
 * test reads, where Claude Code registers one (`<config>/sessions/<pid>.json`).
 *
 * `WF_ROOT` and `CLAUDE_CONFIG_DIR` are set before the imports, which read them as the modules load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Effect } from 'effect';
import { nameFor } from 'agent-runtime';
import { scratch } from './scratch.ts';
import { until, WAITED } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runOver } from './placed.ts';

const ROOT = scratch('wf-nemia-told-');
process.env.WF_ROOT = ROOT;
const CONFIG = scratch('wf-nemia-told-config-');
process.env.CLAUDE_CONFIG_DIR = CONFIG;
delete process.env.WF_MAX_RUNS;
process.env.WF_MAX_CONCURRENT = '2';
const { keepOnce } = await import('../src/nemia/keep.verb.ts');
const { LEVEL } = await import('../src/nemia/level.verb.ts');
const { nemiaDir, promptFile } = await import('../src/nemia/level.store.ts');
const { customInstructionsFile } = await import('../src/agents/read.store.ts');
const { DEFAULT_HARNESS } = await import('../src/harness/harness.ts');
const { engine, runWith: runEngine } = await import('../src/runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);

/** The inbox her session is registered with: a Unix socket that keeps every line it reads, and closes its end once the sender has. */
const inbox = async () => {
  const at = path.join(scratch('wf-nemia-told-sock-'), 'in.sock');
  const lines: { type?: string; session_id?: string; message?: { role?: string; content?: string } }[] = [];
  const server = net.createServer({ allowHalfOpen: true }, (c) => {
    let got = '';
    c.setEncoding('utf8');
    c.on('data', (d) => {
      got += d;
    });
    c.on('end', () => {
      for (const l of got.split('\n')) if (l.trim()) lines.push(JSON.parse(l));
      c.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(at, resolve));
  server.unref();
  return { at, lines, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
};

/** A live process for her session's row to hold, bounded: it ends of itself after two minutes, and the test ends it before. */
const holder = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120_000)'], { stdio: 'ignore' });

/**
 * A fake `claude`: `agents` prints its rows; `--bg --name <n>` adds one, working, under the holder's pid, and registers it with the inbox
 * `sock`, its `procStart` read off `/proc` as Claude Code writes it; `stop` and `rm` are no-ops a test would see as a stop it never asks.
 */
const fakeClaude = (sock: string) => {
  const bin = scratch('wf-nemia-told-bin-');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(
    path.join(bin, 'claude'),
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') process.exit(0);
if (args[0] === '--bg') {
  const pid = ${holder.pid};
  const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
  const procStart = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
  const name = args[args.indexOf('--name') + 1];
  const sessionId = require('node:crypto').randomUUID();
  rows.push({ name, sessionId, state: 'working', status: 'busy', kind: 'background', startedAt: Date.now(), cwd: process.cwd(), pid });
  fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
  const sessions = path.join(${JSON.stringify(CONFIG)}, 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  const registration = { pid, sessionId, name, kind: 'bg', procStart, messagingSocketPath: ${JSON.stringify(sock)} };
  fs.writeFileSync(path.join(sessions, pid + '.json'), JSON.stringify(registration));
}
`,
    { mode: 0o755 },
  );
  process.env.PATH = `${bin}${path.delimiter}${process.env.PATH}`;
};

test(
  'a custom instruction written while her long-lived session runs reaches its inbox at the next beat, with no restart and no stop',
  WAITED,
  async (t) => {
    t.after(() => holder.kill());
    const box = await inbox();
    t.after(() => box.close());
    fakeClaude(box.at);
    fs.writeFileSync(
      path.join(CONFIG, `.${DEFAULT_HARNESS}.json`),
      JSON.stringify({ projects: { [nemiaDir()]: { hasTrustDialogAccepted: true } } }),
    );
    const e = engine();
    const beat = () => runWith(e, keepOnce());
    const { task } = (await runWith(e, LEVEL.handler({ level: 'semi-auto' }))) as { task: string };
    assert.deepEqual(await beat(), ['file']);
    const view = () => Effect.runPromise(e.view(task));
    await until(
      t,
      async () => {
        await Effect.runPromise(e.tick());
        const { state } = await view();
        return state.attempts.length === 1 && state.attempts[0].ended === null;
      },
      `${nameFor(task, 1)} running`,
      { everyMs: 50 },
    );
    assert.deepEqual(await beat(), ['subscribe']);
    assert.deepEqual(await beat(), []);
    const filed = fs.readFileSync(promptFile(), 'utf8');

    fs.mkdirSync(path.dirname(customInstructionsFile(ROOT, 'nemia')), { recursive: true });
    fs.writeFileSync(customInstructionsFile(ROOT, 'nemia'), 'Answer in French. Times in Montreal.\n');
    assert.deepEqual(await beat(), ['tell']);

    await until(t, () => box.lines.length === 1, 'the words in her inbox', { everyMs: 20 });
    const content = box.lines[0].message?.content ?? '';
    assert.ok(content.includes('Answer in French. Times in Montreal.'), content);
    const { state } = await view();
    assert.equal(state.attempts.length, 1, 'her one attempt: no restart');
    assert.equal(state.attempts[0].ended, null, 'still running');
    assert.equal(state.settled, null);
    assert.equal(state.stopRequested, false, 'never asked to stop');
    assert.deepEqual(
      state.said.map((s) => s.text),
      [content],
      'the words on her record, as the runtime journals what it said',
    );
    assert.notEqual(fs.readFileSync(promptFile(), 'utf8'), filed);
    assert.deepEqual(await beat(), [], 'told once');
  },
);
