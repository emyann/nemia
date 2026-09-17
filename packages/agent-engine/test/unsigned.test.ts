/**
 * A session that goes quiet without the closing statement its task asked for, at shipped defaults — a fake `claude`
 * that keeps a registry and records what it was asked to run, and a transcript file where Claude Code keeps one.
 *
 * Bug 1 of the evaluation. The Claude runner reported a `working` session, not busy, whose transcript had been quiet
 * for ninety seconds as `done`, whether or not its task had asked for a closeout, and the engine settled such a task
 * `succeeded` with nothing said: measured this way before the fix, `ended: done`, `reason: harness`, `settled:
 * succeeded`, no closeout. Now the runner reports how long a session has been quiet, and `decide` — which alone knows
 * whether a statement was asked for — ends that attempt unsigned: its session continued with a nudge while attempts
 * remain, and the task settled `failed`, saying why, when they run out. A task that asked for nothing ends on quiet as
 * it always did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-unsigned-${label}-`));

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { createEngine } = await import('../src/facade.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

const MINUTES = 60_000;
const SCHEMA = { type: 'object', properties: { outcome: { type: 'string' } } };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` records its arguments and adds a row, working and idle,
 * started now — under the id `--resume` names, as Claude Code keeps it, or a new one; `stop` and `rm` take a short id.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const spawns = path.join(bin, 'spawns.jsonl');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(spawns, '');
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
  fs.appendFileSync(${JSON.stringify(spawns)}, JSON.stringify(args) + '\\n');
  const resumed = args.indexOf('--resume');
  const sessionId = resumed === -1 ? require('node:crypto').randomUUID() : args[resumed + 1];
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId, state: 'working', status: 'idle', kind: 'background', startedAt: Date.now() });
  save();
}
`, { mode: 0o755 });
  const rows = () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[];
  return {
    bin,
    rows,
    set: (name: string, change: Partial<Row>) =>
      fs.writeFileSync(registry, JSON.stringify(rows().map((r) => (r.name === name ? { ...r, ...change } : r)))),
    /** The arguments of every `claude --bg`, in order. */
    spawns: () => fs.readFileSync(spawns, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as string[]),
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

/** Lines appended to the session's transcript, then its mtime put back `ago` milliseconds. Each line carries its own time. */
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
const closes = (id: string, payload: object) =>
  ({ type: 'assistant', message: { id, role: 'assistant', content: [{ type: 'tool_use', id: `tu_${id}`, name: 'StructuredOutput', input: payload }] } });

const settledNote = async (engine: ReturnType<typeof createEngine>, id: string) => {
  const entry = (await engine.feed(0)).entries.find((e) => e.taskId === id && e.event.kind === 'settled');
  return entry?.event.kind === 'settled' ? entry.event.note : undefined;
};

test('a task that asked for a closeout, whose session goes quiet without one, does not succeed: its session is continued with a nudge, and the task settles failed saying why', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA, maxAttempts: 2 });
    await engine.tick();
    const [row] = claude.rows();

    // It ended its turn with words and no StructuredOutput, and has written nothing for ten minutes.
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), says('msg_1', 'I have finished.'));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();

    let v = await engine.view(id);
    assert.notEqual(v.state.settled, 'succeeded', 'not a success');
    const [first] = v.state.attempts;
    assert.equal(first?.ended, 'failed');
    assert.equal(first?.reason, 'unsigned', 'ended unsigned: it stopped without saying it had finished');
    assert.equal(first?.closeout, undefined);
    assert.deepEqual(claude.rows(), [], 'its session let go before it is continued');

    await engine.tick();
    v = await engine.view(id);
    const second = v.state.attempts[1];
    assert.equal(second?.resumeFrom, row!.sessionId, 'the next attempt continues that session');
    assert.match(second?.nudge ?? '', /^You ended without calling StructuredOutput, and this task asks for a closing statement\./, 'with a nudge naming the tool, on the record');
    assert.match(second?.nudge ?? '', /Change nothing: the work you did stands/, 'and saying the work stands');
    const spawn = claude.spawns().at(-1)!;
    assert.equal(spawn[spawn.indexOf('--resume') + 1], row!.sessionId);
    assert.equal(spawn.at(-1), second?.nudge, 'the nudge is what the session is told, not the brief again');
    assert.equal(claude.spawns()[0]!.at(-1), 'the prompt', 'where the first attempt was told the brief');

    // Continued, it is listed idle over a transcript cold for ten minutes. It started just now: not quiet yet.
    const [resumed] = claude.rows();
    await engine.tick();
    assert.equal((await engine.view(id)).state.attempts[1]?.ended, null, 'quiet is counted from its own start, too');

    // Quiet again, nothing said, and no attempt left.
    claude.set(resumed!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();
    v = await engine.view(id);
    assert.equal(v.state.settled, 'failed');
    assert.equal(v.state.attempts[1]?.reason, 'unsigned');
    assert.equal(await settledNote(engine, id), '2 attempt(s), none succeeded: the last went quiet without the closing statement it was asked for');
    assert.deepEqual(claude.rows(), [], 'and its session let go');
  });
});

test('a task that asked for no closeout ends on quiet as it always did: succeeded, and nothing continued', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), maxAttempts: 2 });
    await engine.tick();
    const [row] = claude.rows();
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), says('msg_1', 'Done.'));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });

    await engine.tick();
    const v = await engine.view(id);
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts.map((a) => [a.ended, a.reason]), [['done', 'harness']]);
    assert.equal(claude.spawns().length, 1, 'nothing continued');
  });
});

test('quiet after a statement of its own succeeds with it; quiet after only a statement made before the attempt began is unsigned', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });

    const said = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const [row] = claude.rows();
    wrote(row!.sessionId, 10 * MINUTES, prompt('the prompt'), closes('msg_1', { outcome: 'done' }));
    claude.set(row!.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();
    const v = await engine.view(said);
    assert.equal(v.state.settled, 'succeeded');
    assert.deepEqual(v.state.attempts[0]?.closeout, { outcome: 'done' });

    // A continuation whose transcript holds only its parent's conversation, statement included, from an hour before it began.
    const inherited = await engine.file({ brief: 'go on', cwd: tmp('cwd'), closeoutSchema: SCHEMA });
    await engine.tick();
    const other = claude.rows().find((r) => r.name === `ae/${inherited}/1`)!;
    const anHourAgo = new Date(Date.now() - 60 * MINUTES).toISOString();
    wrote(other.sessionId, 10 * MINUTES,
      { ...prompt('the parent prompt'), timestamp: anHourAgo },
      { ...closes('msg_0', { outcome: 'done', by: 'parent' }), timestamp: anHourAgo });
    claude.set(other.name, { startedAt: Date.now() - 20 * MINUTES });
    await engine.tick();
    const w = await engine.view(inherited);
    assert.equal(w.state.settled, 'failed', "a parent's statement is not this attempt's: unsigned, not succeeded");
    assert.equal(w.state.attempts[0]?.reason, 'unsigned');
    assert.equal(w.state.attempts[0]?.closeout, undefined);
    assert.equal(await settledNote(engine, inherited), '1 attempt(s), none succeeded: the last went quiet without the closing statement it was asked for');
  });
});
