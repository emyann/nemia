/**
 * Telling a running session something, at shipped defaults — a fake `claude` on PATH that keeps a registry,
 * a real Unix socket standing in for the session's inbox, and the registration Claude Code writes beside it.
 *
 * `say` is a write path into a session a step is running, and the point of it is the trace: the words a person
 * gave a running step are on its record, so a reviewer can tell a change they authorised from a step
 * overstepping. So what is checked is that the words reach the inbox verbatim and land on the journal, and that
 * every refusal refuses — with exit 2, nothing sent and nothing journalled — while a delivery that fails
 * rejects plainly and journals nothing either. The inbox is found as Claude Code 2.1.270 registers it
 * (`<config>/sessions/<pid>.json`, `messagingSocketPath`), measured on a live `--bg` session first.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { Engine, Event, FeedEntry, PromiseJournal, PromiseRunner, Sighting, TaskSpec } from '../src/facade.ts';

const tmp = (label: string) => fs.mkdtempSync(path.join(os.tmpdir(), `ae-say-${label}-`));

// Where Claude Code keeps its registrations is read when a runner is made, and its transcripts when the runner
// is loaded, so both are pointed here before the import.
const config = tmp('config');
process.env.CLAUDE_CONFIG_DIR = config;
const sessions = path.join(config, 'sessions');
const { createEngine } = await import('../src/facade.ts');
const { claudeInbox, claudeInboxLine, claudeInboxPost, inboxSocketRefuses, CLAUDE_INBOX_LINE_MAX } = await import('../src/runner-claude-inbox.ts');

type Row = { name: string; sessionId: string; state: string; status: string; startedAt: number; pid?: number };

/**
 * A fake `claude`. `agents` prints its rows, each with a `pid`, busy, as a session at work is listed; `--bg --name <n>`
 * adds one; `stop` and `rm` do what they do. While `<bin>/agents-fails` exists, `agents` fails.
 */
const fakeClaude = () => {
  const bin = tmp('bin');
  const registry = path.join(bin, 'registry.json');
  const agentsFails = path.join(bin, 'agents-fails');
  fs.writeFileSync(registry, '[]');
  fs.writeFileSync(path.join(bin, 'claude'), `#!${process.execPath}
const fs = require('node:fs');
const args = process.argv.slice(2);
const rows = JSON.parse(fs.readFileSync(${JSON.stringify(registry)}, 'utf8'));
const save = () => fs.writeFileSync(${JSON.stringify(registry)}, JSON.stringify(rows));
if (args[0] === 'agents') {
  if (fs.existsSync(${JSON.stringify(agentsFails)})) { process.stderr.write('could not read the registry\\n'); process.exit(1); }
  process.stdout.write(JSON.stringify(rows)); process.exit(0);
}
if (args[0] === 'stop' || args[0] === 'rm') {
  const at = rows.findIndex((r) => r.sessionId.split('-')[0] === args[1]);
  if (at === -1) { process.stderr.write("No job matching '" + args[1] + "'\\n"); process.exit(1); }
  if (args[0] === 'stop') rows[at].state = 'stopped'; else rows.splice(at, 1);
  save();
  process.exit(0);
}
if (args[0] === '--bg') {
  rows.push({ name: args[args.indexOf('--name') + 1], sessionId: require('node:crypto').randomUUID(), state: 'working', status: 'busy', kind: 'background', startedAt: Date.now(), cwd: process.cwd(), pid: 900000 + rows.length });
  save();
}
`, { mode: 0o755 });
  return {
    bin,
    rows: () => JSON.parse(fs.readFileSync(registry, 'utf8')) as Row[],
    setRows: (rows: Row[]) => fs.writeFileSync(registry, JSON.stringify(rows)),
    agentsFails: (fails: boolean) => (fails ? fs.writeFileSync(agentsFails, '') : fs.rmSync(agentsFails, { force: true })),
  };
};

const fake = fakeClaude();
process.env.PATH = `${fake.bin}:${process.env.PATH}`;
const work = tmp('work');

/**
 * A session's inbox: a Unix socket that reads each connection's lines, answers nothing, and closes its end once the
 * sender has, as Claude Code's does. `neverCloses` reads the line and keeps its end open, as a process busy past the
 * post's deadline would; `neverReads` takes the connection and reads nothing.
 */
const inbox = async (o: { neverCloses?: boolean; neverReads?: boolean } = {}) => {
  const at = path.join(tmp('sock'), 'in.sock');
  const lines: Array<{ type?: string; session_id?: string; message?: { role?: string; content?: string } }> = [];
  const open = new Set<net.Socket>();
  const server = net.createServer({ allowHalfOpen: true, pauseOnConnect: o.neverReads === true }, (c) => {
    open.add(c);
    c.on('close', () => open.delete(c));
    if (o.neverReads) return;
    let got = '';
    c.setEncoding('utf8');
    c.on('data', (d) => { got += d; });
    c.on('end', () => {
      for (const l of got.split('\n')) if (l.trim()) lines.push(JSON.parse(l));
      if (!o.neverCloses) c.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(at, resolve));
  server.unref();
  return {
    path: at, lines,
    close: () => new Promise<void>((resolve) => { for (const c of open) c.destroy(); server.close(() => resolve()); }),
  };
};

/** The registration Claude Code writes for a running session, by its pid. */
const register = (row: Row, fields: Record<string, unknown>) => {
  fs.mkdirSync(sessions, { recursive: true });
  fs.writeFileSync(path.join(sessions, `${row.pid}.json`), JSON.stringify({ pid: row.pid, sessionId: row.sessionId, name: row.name, kind: 'bg', ...fields }));
};

/** A task filed and ticked once, so its session is listed working — and, unless told not to, registered with an inbox. */
const running = async (engine: Engine, spec: Partial<TaskSpec> = {}, withInbox = true) => {
  const id = await engine.file({ brief: 'do the work', cwd: work, ...spec });
  await engine.tick();
  const row = fake.rows().find((r) => r.name === `ae/${id}/1`)!;
  assert.ok(row, 'the fake listed the session');
  const box = await inbox();
  if (withInbox) register(row, { messagingSocketPath: box.path });
  return { id, row, box };
};

const entries = async (engine: Engine, id: string) => (await engine.feed(0)).entries.filter((e) => e.taskId === id);

type Refusal = Error & { exitCode?: number };

/** Refused: exit 2, the sentence matched, and neither the journal nor the inbox moved. */
const refused = async (engine: Engine, id: string, text: string, pattern: RegExp, box?: { lines: unknown[] }) => {
  const before = (await entries(engine, id)).length;
  const heard = box?.lines.length ?? 0;
  await assert.rejects(engine.say(id, text), (e: Refusal) => {
    assert.equal(e.exitCode, 2, `a refusal, exit 2: ${e.message}`);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal((await entries(engine, id)).length, before, 'nothing journalled');
  if (box) assert.equal(box.lines.length, heard, 'nothing sent');
};

/** Failed: no exit code — not a refusal, so ask again — the sentence matched, and nothing journalled. */
const failed = async (engine: Engine, id: string, pattern: RegExp) => {
  const before = (await entries(engine, id)).length;
  await assert.rejects(engine.say(id, 'are you there'), (e: Refusal) => {
    assert.equal(e.exitCode, undefined, `not a refusal: ${e.message}`);
    assert.match(e.message, pattern);
    return true;
  });
  assert.equal((await entries(engine, id)).length, before, 'nothing journalled');
  assert.deepEqual((await engine.view(id)).state.said, []);
};

// ─── delivery ───────────────────────────────────────────────────────────────

test("at shipped defaults, say hands the words verbatim to the running session's inbox, addressed to its session, then journals them", async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row, box } = await running(engine);
  const text = 'Widen the scope to `apps/api` too.\nAnd answer: yes, "keep" the old route — ça va.';

  const said = await engine.say(id, text);

  assert.deepEqual(box.lines, [{ type: 'user', session_id: row.sessionId, message: { role: 'user', content: text } }], 'one line, the words as given, for this session');
  assert.equal(said.attempt, 1);
  assert.equal(said.text, text);
  assert.ok(Number.isFinite(Date.parse(said.at)), 'dated');
  assert.deepEqual((await engine.view(id)).state.said, [said], 'view carries it');
  const last = (await entries(engine, id)).at(-1)!.event;
  assert.deepEqual(last, { kind: 'said', ...said }, 'and the feed has it, last');

  // Said twice, journalled twice, in order: the record keeps what a person did, not what is new.
  const again = await engine.say(id, 'and the web app');
  assert.deepEqual((await engine.view(id)).state.said.map((s) => s.text), [text, 'and the web app']);
  assert.equal(again.attempt, 1);
  assert.equal(box.lines.length, 2);
  await box.close();
});

test('a session its harness lists blocked is running, and its inbox is handed the words as a working one is', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'blocked', status: 'idle' } : r)));
  await engine.say(id, 'you may run the migration');
  assert.equal(box.lines.length, 1);
  assert.equal((await engine.view(id)).state.said.length, 1);
  await box.close();
});

// ─── refusals: exit 2, nothing sent, nothing journalled ─────────────────────

test('refused: empty words, and words that are only whitespace', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, box } = await running(engine);
  await refused(engine, id, '', /`text` is empty/, box);
  await refused(engine, id, ' \n\t ', /`text` is empty/, box);
  await box.close();
});

test('refused: a task the engine has no record of', async () => {
  const engine = createEngine({ root: tmp('board') });
  await refused(engine, 'no-such-task', 'hello', /`no-such-task` is not a task on this board/);
});

test('refused: a Codex task, in its own words — `codex exec` takes nothing while it runs', async () => {
  const engine = createEngine({ root: tmp('board') });
  const id = await engine.file({ brief: 'review', cwd: work, harness: 'codex' });
  await refused(engine, id, 'hello', /`codex exec` reads its prompt once and takes nothing while it runs/);
});

test('refused: a claude-detached task, in its own words — no session id to address until it exits', async () => {
  const engine = createEngine({ root: tmp('board') });
  const id = await engine.file({ brief: 'review', cwd: work, harness: 'claude-detached' });
  await refused(engine, id, 'hello', /learns its session's id only from what it prints as it exits/);
});

test('refused: a Claude task in bypassPermissions, though its session runs and has an inbox — the words would wait for an approval nobody gives', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, box } = await running(engine, { permissionMode: 'bypassPermissions' });
  await refused(engine, id, 'hello', /permissionMode: bypassPermissions`, and Claude Code holds a message/, box);
  await box.close();
});

test("refused: words longer than Claude Code's inbox reads", async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, box } = await running(engine);
  await refused(engine, id, 'x'.repeat(CLAUDE_INBOX_LINE_MAX), /inbox drops a line over 1048576/, box);
  await box.close();
});

test('refused: a task that has not started an attempt', async () => {
  const engine = createEngine({ root: tmp('board') });
  const id = await engine.file({ brief: 'queued', cwd: work });
  await refused(engine, id, 'hello', /has not started an attempt yet/);
});

test('refused: a task that has settled', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'done' } : r)));
  for (let i = 0; i < 5 && !(await engine.view(id)).state.settled; i++) await engine.tick();
  assert.equal((await engine.view(id)).state.settled, 'succeeded');
  await refused(engine, id, 'hello', /has settled \(succeeded\).*`resumeFrom`/, box);
  await box.close();
});

test('refused: a task asked to stop, before its session has', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, box } = await running(engine);
  await engine.stop(id);
  await refused(engine, id, 'hello', /has been asked to stop/, box);
  await box.close();
});

test('refused: an attempt that has ended, with another still to come', async () => {
  const root = tmp('board');
  const engine = createEngine({ root });
  const { id, row, box } = await running(engine, { maxAttempts: 2 });
  const other = await running(engine);
  // A pass that writes an end starts the next attempt in the same breath, unless the ceiling is full. So the same
  // board with a ceiling of one, which the other session fills: the window in which the attempt has ended and
  // nothing runs to hear anything.
  const full = createEngine({ root, maxConcurrent: 1 });
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, state: 'failed' } : r)));
  await full.tick();
  const { state } = await full.view(id);
  assert.deepEqual(state.attempts.map((a) => a.ended), ['failed'], 'the end is written and the next attempt not started');
  assert.equal(state.settled, null);
  await refused(full, id, 'hello', /has no attempt running: attempt 1 ended `failed`/, box);
  await box.close();
  await other.box.close();
});

test('refused: an attempt its harness does not list, and one it lists as no longer running', async () => {
  const engine = createEngine({ root: tmp('board') });
  const gone = await running(engine);
  fake.setRows(fake.rows().filter((r) => r.sessionId !== gone.row.sessionId));
  await refused(engine, gone.id, 'hello', /its harness lists no `ae\/.+\/1`/, gone.box);

  const quiet = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === quiet.row.sessionId ? { ...r, state: 'done' } : r)));
  await refused(engine, quiet.id, 'hello', /session is `done` on its harness, not running/, quiet.box);
  await gone.box.close();
  await quiet.box.close();
});

// ─── deliveries that fail: rejected plainly, nothing journalled ─────────────

test('a registry that cannot be read rejects, not refuses: ask again', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, box } = await running(engine);
  fake.agentsFails(true);
  try {
    await failed(engine, id, /the `claude` registry could not be read/);
  } finally { fake.agentsFails(false); }
  assert.equal(box.lines.length, 0);
  await box.close();
});

test('a session with no registration, one registered to another session, one with no inbox, and one whose inbox is gone: rejected, nothing journalled', async () => {
  // A board each: four running sessions on one would wait on the shipped ceiling of three.
  const board = () => createEngine({ root: tmp('board') });

  const e1 = board();
  const unregistered = await running(e1, {}, false);
  await failed(e1, unregistered.id, /was not given the words.*registration.*cannot be read/);

  const e2 = board();
  const reused = await running(e2, {}, false);
  register(reused.row, { sessionId: '11111111-2222-3333-4444-555555555555', messagingSocketPath: reused.box.path });
  await failed(e2, reused.id, /is registered to 11111111-2222-3333-4444-555555555555 now/);
  assert.equal(reused.box.lines.length, 0, 'the socket of a pid that passed to another session hears nothing');

  const e3 = board();
  const noInbox = await running(e3, {}, false);
  register(noInbox.row, {});
  await failed(e3, noInbox.id, /has no inbox/);

  const e4 = board();
  const closed = await running(e4);
  await closed.box.close();
  fs.rmSync(closed.box.path, { force: true });
  await failed(e4, closed.id, /inbox, .* is not there/);

  for (const r of [unregistered, reused, noInbox]) await r.box.close();
});

test('a session listed with no process — exited — rejects: nothing to find its inbox by', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row, box } = await running(engine);
  fake.setRows(fake.rows().map((r) => (r.sessionId === row.sessionId ? { ...r, pid: undefined } : r)));
  await failed(engine, id, /`claude agents` lists no process for/);
  assert.equal(box.lines.length, 0);
  await box.close();
});

test('an inbox that is a symlink to a real socket is refused before anything is sent — so is a registration another user owns, or a plain file in the socket\'s place', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row, box } = await running(engine, {}, false);
  const link = path.join(tmp('link'), 'in.sock');
  fs.symlinkSync(box.path, link);
  register(row, { messagingSocketPath: link });
  await failed(engine, id, /is not a socket — a symlink, or something else in its place\. Refusing to send/);
  assert.equal(box.lines.length, 0, 'the socket behind the link heard nothing');

  const file = path.join(tmp('plain'), 'in.sock');
  fs.writeFileSync(file, '');
  register(row, { messagingSocketPath: file });
  await assert.rejects(claudeInbox(sessions, row.pid!, row.sessionId), (e: Error) => /is not a socket/.test(e.message));

  register(row, { messagingSocketPath: box.path });
  assert.equal(await claudeInbox(sessions, row.pid!, row.sessionId), box.path, 'the real socket, registered, is found');
  const me = process.getuid!();
  await assert.rejects(claudeInbox(sessions, row.pid!, row.sessionId, me + 1), (e: Error) => /cannot be read \(not a file of yours\)/.test(e.message));
  await box.close();
});

test("a socket another user owns is refused — the check on what lstat said, handed another uid, since no test can make a socket another user's", async () => {
  const box = await inbox();
  const me = process.getuid!();
  const stat = fs.lstatSync(box.path);
  assert.equal(inboxSocketRefuses(box.path, stat, me), undefined, 'a socket of mine is sent to');
  assert.equal(inboxSocketRefuses(box.path, stat, undefined), undefined, 'and one on a platform with no uids');
  assert.match(inboxSocketRefuses(box.path, stat, me + 1) ?? '', new RegExp(`is owned by uid ${me}, not by you\\. Refusing to send`));
  const link = path.join(tmp('link'), 'in.sock');
  fs.symlinkSync(box.path, link);
  assert.match(inboxSocketRefuses(link, fs.lstatSync(link), me) ?? '', /is not a socket — a symlink/, 'a link to my own socket, all the same');
  await box.close();
});

// ─── the post: given once the whole line is written ─────────────────────────

test('an inbox that reads the words and never closes its end — a process busy past the deadline — was given them: said, and journalled', async () => {
  const engine = createEngine({ root: tmp('board') });
  const { id, row } = await running(engine, {}, false);
  const box = await inbox({ neverCloses: true });
  register(row, { messagingSocketPath: box.path });
  // Waits out the post's whole deadline, five seconds: the inbox never closes.
  const said = await engine.say(id, 'are you there');
  assert.deepEqual(box.lines.map((l) => l.message?.content), ['are you there'], 'the inbox has the words');
  assert.deepEqual((await engine.view(id)).state.said, [said], 'and so does the record');
  await box.close();
});

test('the post resolves once the whole line is written, closed or not; it rejects when the line is still being written at the deadline, which an inbox drops', async () => {
  const slow = await inbox({ neverCloses: true });
  await claudeInboxPost(slow.path, claudeInboxLine('s', 'hello'), 200);
  assert.equal(slow.lines.length, 1);

  // Bigger than a socket's buffer, to an inbox that reads nothing: most of it never leaves this process.
  const deaf = await inbox({ neverReads: true });
  await assert.rejects(claudeInboxPost(deaf.path, claudeInboxLine('s', 'x'.repeat(4 * 1024 * 1024)), 200),
    (e: Error) => /took only part of the line within 200 ms, and an inbox drops a line cut short/.test(e.message));

  const gone = path.join(tmp('gone'), 'in.sock');
  await assert.rejects(claudeInboxPost(gone, claudeInboxLine('s', 'hello'), 200), (e: NodeJS.ErrnoException) => e.code === 'ENOENT');
  await slow.close();
  await deaf.close();
});

// ─── a harness brought as a PromiseRunner ───────────────────────────────────

const memoryJournal = (failOn?: Event['kind']): PromiseJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) {
      if (event.kind === failOn) throw new Error('the store is read-only now');
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]); feed.push({ taskId, event });
    },
    async read(taskId) { return [...(tasks.get(taskId) ?? [])]; },
    async list() { return [...tasks.keys()]; },
    async feed(after) { return { entries: feed.slice(after), cursor: feed.length }; },
  };
};

const promiseHarness = (heard?: Array<{ session: { name: string; sessionId: string }; text: string }>, rejectWith?: string): PromiseRunner => {
  const sessions = new Map<string, Sighting>();
  return {
    async spawn(r) { sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' }); },
    async observe() { return new Map(sessions); },
    async stop() {},
    async logs() { return ''; },
    ...(heard ? {
      async say(session: { name: string; sessionId: string }, text: string) {
        if (rejectWith) throw new Error(rejectWith);
        heard.push({ session, text });
      },
    } : {}),
  };
};

test("a PromiseRunner's own say is handed the session as observed and the words; without one, its tasks are refused", async () => {
  const heard: Array<{ session: { name: string; sessionId: string }; text: string }> = [];
  const engine = createEngine({ journal: memoryJournal(), harnesses: { mine: promiseHarness(heard) } });
  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  const said = await engine.say(id, 'hello');
  assert.deepEqual(heard, [{ session: { name: `ae/${id}/1`, sessionId: 's-1' }, text: 'hello' }]);
  assert.deepEqual((await engine.view(id)).state.said, [said]);

  const mute = createEngine({ journal: memoryJournal(), harnesses: { mine: promiseHarness() } });
  const muteId = await mute.file({ brief: 'b', cwd: '/repo' });
  await mute.tick();
  await refused(mute, muteId, 'hello', /the `mine` harness has no channel into a running session/);
});

test("a PromiseRunner's say that rejects journals nothing; a journal that fails after the words were taken says so", async () => {
  const engine = createEngine({ journal: memoryJournal(), harnesses: { mine: promiseHarness([], 'the line is down') } });
  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  await failed(engine, id, /ae\/.+\/1 was not given the words \(the line is down\)\. Nothing was journalled/);

  const heard: Array<{ session: { name: string; sessionId: string }; text: string }> = [];
  const readOnly = createEngine({ journal: memoryJournal('said'), harnesses: { mine: promiseHarness(heard) } });
  const roId = await readOnly.file({ brief: 'b', cwd: '/repo' });
  await readOnly.tick();
  await assert.rejects(readOnly.say(roId, 'hello'), (e: Refusal) =>
    e.exitCode === undefined && /was given the words, but they could not be journalled \(the store is read-only now\)/.test(e.message));
  assert.equal(heard.length, 1, 'the words did go');
});

// ─── ae say ─────────────────────────────────────────────────────────────────

const ae = fileURLToPath(new URL('../bin/ae.ts', import.meta.url));

/**
 * `ae`, run as a child — and not with `spawnSync`: the inbox is a socket in this process, and a process blocked
 * in `spawnSync` accepts no connection, so the child's words wait out their timeout (found writing this test).
 */
const aeRun = (args: string[], env: NodeJS.ProcessEnv) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
  const child = spawn(process.execPath, [ae, ...args], { env });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
  child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

test('ae say <id> prints the line it journalled, the words being everything after the id; ae say <id> "" exits 2 and journals nothing', async () => {
  const root = tmp('cli-board');
  const engine = createEngine({ root });
  const { id, box } = await running(engine);
  const env = { ...process.env, AE_ROOT: root };

  const ok = await aeRun(['say', id, 'widen', 'the scope to the api'], env);
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, new RegExp(`${id}\\s+said\\s+to attempt 1: widen the scope to the api`));
  assert.equal(box.lines.at(-1)?.message?.content, 'widen the scope to the api');

  const empty = await aeRun(['say', id, ''], env);
  assert.equal(empty.status, 2, empty.stderr);
  assert.match(empty.stderr, /`text` is empty/);
  assert.equal((await engine.view(id)).state.said.length, 1, 'only the first was journalled');
  assert.equal(box.lines.length, 1);
  await box.close();
});
