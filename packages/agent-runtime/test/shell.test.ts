/**
 * A session held by something that is not the work, at shipped defaults — a fake `claude` that keeps a registry, and
 * a transcript file where Claude Code keeps one.
 *
 * Issue 24, measured on 2026-09-17: an implement step signed off with `StructuredOutput` at 02:53Z, every commit in,
 * and left a `run_in_background` loop running. Its registration read `status: shell`, the registry listed the session
 * busy, and its journal shows nothing written for the next seventy minutes — no end, no check, no review — while its
 * transcript stayed exactly as its closing turn left it. `busy` was the gate: it stops the runner reading a statement,
 * and stops `closedOut` acting on one. Now the last word in the conversation answers the question `busy` cannot: a
 * session whose own closeout is the last thing in it, and which has written nothing since for the quiescence floor,
 * has finished, whatever its process is still doing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-shell-${label}-`));

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { createEngine } = await import('../src/facade.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

const MINUTES = 60_000;
const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } } };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and **busy** — a session with a
 * background shell of its own, as the registry lists it; `stop` and `rm` take a short id.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now() });
  save();
}
`, { mode: 0o755 });
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

/**
 * Lines appended to the session's transcript, then its mtime put back `ago` milliseconds.
 *
 * Each line carries the time it was written, not `ago`: a statement made before its attempt began is one the
 * session inherited, and the attempt here began a moment ago. How long the session has been quiet is the file's
 * mtime, which is what `ago` moves.
 */
const wrote = (sessionId: string, ago: number, ...entries: object[]) => {
  const file = path.join(config, 'projects', 'fake-project', `${sessionId}.jsonl`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const timestamp = new Date().toISOString();
  fs.appendFileSync(file, entries.map((e) => `${JSON.stringify({ sessionId, timestamp, ...e })}\n`).join(''));
  const at = new Date(Date.now() - ago);
  fs.utimesSync(file, at, at);
};
const prompt = (content: string) => ({ type: 'user', message: { role: 'user', content } });
const says = (id: string, text: string) => ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'text', text }] } });
/** A closing turn as Claude Code writes one: the call, its attachment, its result, and the turn's duration. */
const closingTurn = (id: string, payload: object) => [
  { type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'tool_use', id: `tu_${id}`, name: 'StructuredOutput', input: payload }] } },
  { attachment: { type: 'structured_output', data: payload } },
  { type: 'user', message: { role: 'user', content: [{ tool_use_id: `tu_${id}`, type: 'tool_result', content: 'Structured output provided successfully' }] } },
  { type: 'system', subtype: 'turn_duration', durationMs: 11_545 },
];

test('a session held busy by a background shell, its closeout the last word in its transcript, is read as quiet: its closeout is recorded, the task settles, and the session is let go', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const [row] = claude.rows();
    assert.equal(row?.status, 'busy', 'its process is doing something: the shell it left running');

    // It ran for ten minutes, signed off ten minutes ago, and has written nothing since; the shell loops on.
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();

    const v = await engine.view(id);
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' }, 'the closeout on the record, seventy minutes earlier than a person could have read it');
    assert.equal(v.state.attempts[0]?.reason, 'harness');
    assert.deepEqual(claude.rows(), [], 'and the session let go, which is what ends the shell');
  });
});

test('a session held busy whose transcript is still advancing is left alone — nothing about a working session is quiet', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const [row] = claude.rows();

    // A statement it may yet revise: it gave one a second ago and is still going.
    wrote(row!.sessionId, 1_000, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();

    const v = await engine.view(id);
    assert.equal(v.state.settled, null, 'still running');
    assert.equal(v.state.attempts[0]?.ended, null);
    assert.equal(claude.rows().length, 1, 'and its session untouched');
  });
});

test('a session held busy that gave no closeout is left where it was: the existing rule takes it once the registry lists it idle', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const [row] = claude.rows();

    // It ended its turn with words and nothing else, ten minutes ago, and its process is still busy.
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), says('msg_1', 'I have finished.'));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();
    assert.equal((await engine.view(id)).state.attempts[0]?.ended, null, 'a busy session with nothing said is not quiet');

    // Idle, the quiescence floor reads it as it always has: quiet, with no statement — unsigned.
    claude.set(row!.name, { status: 'idle' });
    await engine.tick();
    const v = await engine.view(id);
    assert.equal(v.state.attempts[0]?.reason, 'unsigned');
    assert.equal(v.state.settled, 'failed');
  });
});

test('a session the registry lists `shell` is not busy at all: the quiescence floor reads it quiet, closeout or not', async () => {
  // `shell` is the registration's own word for a session held by a background shell, beside `busy`, `idle` and
  // `waiting` (2.1.274's vocabulary). It is not a turn, so the floor already ends such a session — the reading the
  // measured one did not get, because the registry listed it busy.
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ config: { background: true }, brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const [row] = claude.rows();
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), ...closingTurn('msg_1', { outcome: 'done' }));
    claude.set(row!.name, { status: 'shell', startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();

    const v = await engine.view(id);
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });
  });
});
