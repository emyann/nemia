/**
 * Letting a finished session go, at shipped defaults — a fake `claude` on PATH that keeps a registry.
 *
 * Claude Code keeps every `--bg` session in `claude agents` until something removes it, and one that
 * has given its closeout stays `working/idle` there for good: every run left its sessions behind, to
 * be cleared by hand (open issue 3). So once an attempt's end is on the record, the engine releases its
 * session. What is checked is what `createEngine()` really runs: the fake writes down every call, and
 * keeps its rows the way `claude agents --all --json` prints them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-release-${label}-`));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Where Claude Code keeps transcripts is read when the runner is loaded, so it is set before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const { createEngine } = await import('../src/facade.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number };

/**
 * A fake `claude`. `agents` prints its rows; `--bg --name <n>` adds one, working and idle; `stop <short>`
 * marks one stopped and `rm <short>` deletes it, each refusing an id it does not have as 2.1.270 does
 * ("No job matching"). While `<bin>/rm-fails` exists, `rm` fails. Every call is written down.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const calls = path.join(bin, 'calls.jsonl');
  const rmFails = path.join(bin, 'rm-fails');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)}, JSON.stringify(args) + '\\n');
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') { process.stdout.write(JSON.stringify(rows)); process.exit(0); }
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'rm' && fs.existsSync(${JSON.stringify(rmFails)})) { process.stderr.write('could not remove\\n'); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'idle', kind: 'background', startedAt: Date.now(), cwd: process.cwd() });
  save();
}
`, { mode: 0o755 });
  return {
    bin,
    rows: () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[],
    setRows: (rows: Row[]) => fs.writeFileSync(registry, JSON.stringify(rows)),
    /** The calls that let a session go, in order, with the short id each was given. */
    releases: () => fs.readFileSync(calls, 'utf8').split('\n').filter(Boolean)
      .map((l) => JSON.parse(l) as string[]).filter((a) => a[0] === 'stop' || a[0] === 'rm'),
    rmFails: (fails: boolean) => (fails ? fs.writeFileSync(rmFails, '') : fs.rmSync(rmFails, { force: true })),
  };
};

const onPath = async <T>(bin: string, f: () => Promise<T>): Promise<T> => {
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try { return await f(); } finally { process.env.PATH = prev; }
};

/** The session's transcript, in which it called StructuredOutput just now: where the runner reads a statement. */
const said = (row: Row, payload: object) => {
  const dir = path.join(config, 'projects', 'fake-project');
  fs.mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  fs.writeFileSync(path.join(dir, `${row.sessionId}.jsonl`), [
    { type: 'user', uuid: 'u-1', parentUuid: null, sessionId: row.sessionId, timestamp: at, message: { role: 'user', content: 'the prompt' } },
    { type: 'assistant', uuid: 'a-1', parentUuid: 'u-1', sessionId: row.sessionId, timestamp: at, message: { id: 'msg_1', role: 'assistant', content: [{ type: 'tool_use', id: 'tu_1', name: 'StructuredOutput', input: payload }] } },
  ].map((e) => JSON.stringify(e)).join('\n') + '\n');
};

const short = (row: Row) => row.sessionId.split('-')[0]!;

test('a task that gave its closeout settles, and its session is stopped and removed in that pass — the next tick does not see it', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), closeoutSchema: { type: 'object' } });
    await engine.tick();
    const [row] = claude.rows();
    assert.equal(row?.name, `ae/${id}/1`, 'spawned');
    // Made after the attempt began, as a statement of its own must be.
    await sleep(10);
    said(row!, { outcome: 'done' });

    await engine.tick();
    assert.equal((await engine.view(id)).state.settled, 'succeeded');
    assert.deepEqual(claude.releases(), [['stop', short(row!)], ['rm', short(row!)]], 'stopped, since it still ran, then removed');
    assert.deepEqual(claude.rows(), [], 'gone from claude agents');

    await engine.tick();
    assert.equal(claude.releases().length, 2, 'the next tick does not see it, and asks nothing more');
    const v = await engine.view(id);
    assert.equal(v.phase, 'succeeded');
    assert.equal(v.sessionId, row!.sessionId, 'its id, as recorded when its attempt ended');
    assert.match(await engine.logs(id), /the prompt/, "and its transcript still read, through the task's own harness");
  });
});

test('a task that asked for a worktree has its session stopped and never removed — claude rm deletes the worktree, with the work in it', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd'), worktree: true, closeoutSchema: { type: 'object' } });
    await engine.tick();
    const [row] = claude.rows();
    await sleep(10);
    said(row!, { outcome: 'done' });

    for (let i = 0; i < 3; i++) await engine.tick();
    assert.equal((await engine.view(id)).state.settled, 'succeeded');
    assert.deepEqual(claude.releases(), [['stop', short(row!)]], 'stopped once, and no rm on any pass');
    assert.deepEqual(claude.rows().map((r) => r.state), ['stopped'], 'still listed');
  });
});

test('no session is released while its attempt runs, nor when a person stopped its task and no end was written', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const id = await engine.file({ brief: 'the prompt', cwd: tmp('cwd') });
    for (let i = 0; i < 3; i++) await engine.tick();
    assert.equal((await engine.view(id)).phase, 'working (quiescent)');
    assert.deepEqual(claude.releases(), [], 'running: nothing stopped, nothing removed');

    await engine.stop(id);
    for (let i = 0; i < 3; i++) await engine.tick();
    const v = await engine.view(id);
    assert.equal(v.state.settled, 'stopped');
    assert.equal(v.state.attempts[0]?.ended, null, 'settled with no end on the record');
    assert.deepEqual(claude.releases().map((c) => c[0]), ['stop'], "the person's stop, and no rm: its id was never journalled, and logs would lose it");
    assert.equal(claude.rows().length, 1);
  });
});

test('a release the harness refuses fails nothing else in the pass, and is asked again until it succeeds', async () => {
  const claude = fakeClaude();
  await onPath(claude.bin, async () => {
    const engine = createEngine({ root: tmp('root') });
    const done = await engine.file({ brief: 'exits on its own', cwd: tmp('cwd') });
    await engine.tick();
    claude.setRows(claude.rows().map((r) => ({ ...r, state: 'done' })));
    claude.rmFails(true);
    const next = await engine.file({ brief: 'filed after', cwd: tmp('cwd') });

    await engine.tick();
    assert.equal((await engine.view(done)).state.settled, 'succeeded');
    assert.equal((await engine.view(next)).state.attempts.length, 1, 'the other task was still started');
    await engine.tick();
    const row = claude.rows().find((r) => r.name === `ae/${done}/1`)!;
    assert.deepEqual(claude.releases(), [['rm', short(row)], ['rm', short(row)]], 'it had exited, so no stop; removal asked on each pass');

    claude.rmFails(false);
    await engine.tick();
    assert.equal(claude.rows().some((r) => r.name === `ae/${done}/1`), false, 'and removed once the harness allows it');
  });
});
