/**
 * The facade, proven by what this file does NOT import.
 *
 * There is no `import ... from 'effect'` anywhere below, and there must never be: the whole claim
 * of this layer is that a consumer can drive the engine, bring their own store and bring their own
 * harness while knowing nothing about Effect. A test that imported it would be testing something
 * else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createEngine, nameFor, type Event, type FeedEntry, type PromiseJournal, type PromiseRunner, type Sighting } from '../src/facade.ts';

/** A store in twelve lines of plain async — what an application with its own database writes. */
const memoryJournal = (): PromiseJournal => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    async append(taskId, event) { tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]); feed.push({ taskId, event }); },
    async read(taskId) { return [...(tasks.get(taskId) ?? [])]; },
    async list() { return [...tasks.keys()].sort(); },
    async feed(after) { return { entries: feed.slice(after), cursor: feed.length }; },
  };
};

/** A harness in eight. */
const fakeHarness = (sessions: Map<string, Sighting>): PromiseRunner => ({
  async spawn(r) { sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' }); },
  async observe() { return new Map(sessions); },
  async stop(id) { for (const [n, s] of sessions) if (s.sessionId === id) sessions.set(n, { ...s, state: 'stopped' }); },
  async logs() { return 'fake logs'; },
});

test('a consumer can run the whole lifecycle in plain async/await', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({
    journal: memoryJournal(),
    harnesses: { fake: fakeHarness(sessions) },
    defaultHarness: 'fake',
  });

  const id = await engine.file({ brief: 'do the thing', cwd: '/repo' });
  assert.equal((await engine.view(id)).phase, 'pending');

  await engine.tick();
  assert.equal((await engine.view(id)).phase, 'running (working)');
  assert.equal(sessions.size, 1);

  // The harness finishes the work; the engine finds out by asking.
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'done' });
  await engine.tick();
  assert.equal((await engine.view(id)).phase, 'succeeded');
});

test('the feed is enough to build a workflow on, with no Effect anywhere', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const first = await engine.file({ brief: 'implement', cwd: '/repo' });
  await engine.tick();
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'done' });
  await engine.tick();

  // "When something succeeds, file the review." The whole upper-layer pattern, in six lines.
  let cursor = 0;
  const filed: string[] = [];
  const { entries, cursor: next } = await engine.feed(cursor);
  cursor = next;
  for (const { taskId, event } of entries) {
    if (event.kind === 'settled' && event.outcome === 'succeeded') {
      filed.push(await engine.file({ brief: `review ${taskId}`, cwd: '/repo' }));
    }
  }
  assert.equal(filed.length, 1, 'the settled event drove a follow-up task');
  assert.notEqual(filed[0], first);
});

test('the ceiling, the stop and the list all work through the facade', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({
    journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake', maxConcurrent: 2,
  });
  for (let i = 0; i < 5; i++) await engine.file({ brief: `t${i}`, cwd: '/repo', id: `task-${i}` });

  const report = await engine.tick();
  assert.equal(sessions.size, 2, 'the ceiling holds');
  assert.deepEqual(report.running, { fake: 2 }, 'counted under the harness that ran it, not "default"');
  assert.equal((await engine.list()).length, 5);

  await engine.stop('task-0');
  await engine.tick();
  assert.equal(sessions.get(nameFor('task-0', 1))!.state, 'stopped');
});

test('the file-backed default needs no configuration at all', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-facade-'));
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const id = await engine.file({ brief: 'b', cwd: '/repo' });
  await engine.tick();
  assert.ok(fs.existsSync(path.join(root, 'tasks', `${id}.jsonl`)), 'it wrote a journal');
  assert.ok(fs.existsSync(path.join(root, 'feed.jsonl')), 'and a feed');

  // A second engine over the same root sees the same board — the state is on disk, not in memory.
  const reopened = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  assert.equal((await reopened.view(id)).state.brief, 'b');
});

test('start() ticks on a timer and never overlaps', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/repo' });

  let ticks = 0;
  const loop = engine.start({ intervalMs: 20, onTick: () => { ticks += 1; } });
  await new Promise((r) => setTimeout(r, 200));
  loop.stop();
  const seen = ticks;
  assert.ok(seen >= 2, `expected several ticks, saw ${seen}`);

  await new Promise((r) => setTimeout(r, 100));
  assert.equal(ticks, seen, 'stop() means stopped');
});

test('tasks that name the harness and tasks that do not share ONE pool', async () => {
  // The bug this pins: an unresolved harness counted as its own pool, so one subscription got
  // two ceilings. Three explicit + three implicit, ceiling of two, must admit two in total.
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({
    journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake', maxConcurrent: 2,
  });
  for (let i = 0; i < 3; i++) await engine.file({ brief: `e${i}`, cwd: '/r', id: `a-${i}`, harness: 'fake' });
  for (let i = 0; i < 3; i++) await engine.file({ brief: `i${i}`, cwd: '/r', id: `b-${i}` });

  const report = await engine.tick();
  assert.equal(sessions.size, 2, 'two, not four');
  assert.deepEqual(report.running, { fake: 2 });
});

// ─── watching ───────────────────────────────────────────────────────────────

test('watch delivers every event, in order, once', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const seen: string[] = [];
  const w = engine.watch({ onEntry: (e) => { seen.push(e.event.kind); }, intervalMs: 20 });

  const id = await engine.file({ brief: 'b', cwd: '/r' });
  await engine.tick();
  for (const [k, v] of sessions) sessions.set(k, { ...v, state: 'done' });
  await engine.tick();
  await new Promise((r) => setTimeout(r, 200));
  w.stop();

  assert.deepEqual(seen, ['filed', 'starting', 'spawned', 'ended', 'settled'], 'in order, no repeats');
  void id;
});

test('a watcher starting at 0 replays history, and stop() stops', async () => {
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ journal: memoryJournal(), harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });
  await engine.file({ brief: 'b', cwd: '/r' });
  await engine.tick();

  const seen: string[] = [];
  const w = engine.watch({ onEntry: (e) => { seen.push(e.event.kind); }, intervalMs: 20 });
  await new Promise((r) => setTimeout(r, 120));
  assert.deepEqual(seen, ['filed', 'starting', 'spawned'], 'the cursor never expires — it replays');

  w.stop();
  const before = seen.length;
  await engine.file({ brief: 'another', cwd: '/r' });
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(seen.length, before, 'nothing arrives after stop()');
});

test('the file store pushes: a watcher hears about a write it did not poll for', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-watch-'));
  const sessions = new Map<string, Sighting>();
  const engine = createEngine({ root, harnesses: { fake: fakeHarness(sessions) }, defaultHarness: 'fake' });

  const seen: string[] = [];
  // A deliberately useless timer: anything that arrives quickly came from the push, not the poll.
  const w = engine.watch({ onEntry: (e) => { seen.push(e.event.kind); }, intervalMs: 60_000 });
  await new Promise((r) => setTimeout(r, 50));

  await engine.file({ brief: 'b', cwd: '/r' });
  await new Promise((r) => setTimeout(r, 400));
  w.stop();

  assert.deepEqual(seen, ['filed'], 'delivered without waiting for the interval');
});

/**
 * The one property a test running INSIDE the test runner cannot check.
 *
 * `start()` and `watch()` both used to `unref()` their interval, so neither held the event loop
 * open. Every in-process test passed — the runner was keeping the process alive — while `ae up`
 * printed its banner and exited, doing nothing at all. The only way to see it is from outside,
 * so this spawns a real child and asks whether it is still there.
 */
import { spawn } from 'node:child_process';

const survives = (body: string) => new Promise<boolean>((resolve) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-alive-'));
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createEngine } from '${path.resolve('src/facade.ts')}';
    const engine = createEngine({ root: ${JSON.stringify(root)} });
    ${body}
  `], { stdio: 'ignore' });
  let exited = false;
  child.on('exit', () => { exited = true; });
  setTimeout(() => { const alive = !exited; child.kill(); resolve(alive); }, 1_200);
});

test('start() keeps its host process alive — a loop that lets you exit is not a loop', async () => {
  assert.equal(await survives('engine.start({ intervalMs: 200 });'), true);
});

test('watch() keeps its host process alive, even with a store that cannot push', async () => {
  // The file store's fs.watch holds the loop open by accident, which is how this hid. A store
  // with no `subscribe` — the kind a consumer brings — has only the interval.
  assert.equal(await survives(`
    const store = {
      append: async () => {}, read: async () => [], list: async () => [],
      feed: async () => ({ entries: [], cursor: 0 }),
    };
    createEngine({ journal: store }).watch({ onEntry: () => {} });
  `), true);
});

// ─── the door refuses what the loop cannot run ──────────────────────────────

import { type Engine, type HarnessSpec, type ResumePolicy, type TaskSpec } from '../src/facade.ts';

/** An engine at shipped defaults — the three built-in harnesses — over a store a test can read. */
const shipped = () => {
  const journal = memoryJournal();
  return { journal, engine: createEngine({ journal }) };
};

/** Rejected with exit code 2 and a sentence that matches. */
const refused = (engine: Engine, spec: TaskSpec, says: RegExp) =>
  assert.rejects(engine.file(spec), (e: Error & { exitCode?: number }) => {
    assert.equal(e.exitCode, 2, e.message);
    assert.match(e.message, says);
    return true;
  });

test('file() refuses a harness the engine does not have — it used to run on the fallback', async () => {
  const { journal, engine } = shipped();
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'banana' }, /`harness: banana` is not a harness this engine has.*claude, codex, claude-detached/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test('file() refuses counts and seconds the loop cannot use — NaN was journalled as null', async () => {
  const { journal, engine } = shipped();
  for (const deadlineSeconds of [Number.NaN, 0, -5, Infinity]) {
    await refused(engine, { brief: 'b', cwd: '/r', deadlineSeconds }, /is not a number of seconds/);
  }
  for (const maxAttempts of [0, 1.5, Number.NaN]) {
    await refused(engine, { brief: 'b', cwd: '/r', maxAttempts }, /is not a number of attempts/);
  }
  await refused(engine, { brief: 'b', cwd: '/r', resume: 'sometimes' as ResumePolicy }, /is not a retry policy/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');
});

test("file() refuses a permission mode outside its harness's own words", async () => {
  const { journal, engine } = shipped();
  await refused(engine, { brief: 'b', cwd: '/r', permissionMode: 'yolo' }, /`permissionMode: yolo` is not a mode Claude Code has/);
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'claude-detached', permissionMode: 'read-only' }, /not a mode Claude Code has/);
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'codex', permissionMode: 'auto' }, /`permissionMode: auto` is not a sandbox Codex has/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  // The words each harness does have are filed.
  await engine.file({ brief: 'b', cwd: '/r', harness: 'codex', permissionMode: 'read-only' });
  await engine.file({ brief: 'b', cwd: '/r', permissionMode: 'default' });
  assert.equal((await journal.list()).length, 2);
});

test('file() refuses an empty brief, cwd, model or resumeFrom', async () => {
  const { engine } = shipped();
  await refused(engine, { brief: '  ', cwd: '/r' }, /`brief` is empty/);
  await refused(engine, { brief: 'b', cwd: '' }, /`cwd` is empty/);
  await refused(engine, { brief: 'b', cwd: '/r', model: '' }, /`model` is empty/);
  await refused(engine, { brief: 'b', cwd: '/r', resumeFrom: '' }, /`resumeFrom` is empty/);
});

test('file() refuses a cwd that is not absolute, naming it resolved — on every harness, so no detached worker is launched into repo/repo', async () => {
  // The process that ticks resolves a relative cwd, and it need not be the one that filed it. A
  // detached worker resolved it twice, from inside itself: `cwd: 'repo'` failed with `spawn sh ENOENT`.
  const { journal, engine } = shipped();
  for (const harness of ['claude', 'codex', 'claude-detached']) {
    await refused(engine, { brief: 'b', cwd: 'repo', harness }, new RegExp(`\`cwd: repo\` is not an absolute path.*from here that is ${path.resolve('repo')}`));
  }
  await refused(engine, { brief: 'b', cwd: './repo' }, /`cwd: \.\/repo` is not an absolute path/);
  await refused(engine, { brief: 'b', cwd: '~/repo' }, /`cwd: ~\/repo` is not an absolute path/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled, so no tick can spawn it');
  assert.ok(await engine.file({ brief: 'b', cwd: path.resolve('repo') }), 'the same directory, resolved, is filed');
});

test('a harness brought as a spec is asked its own refusals; one brought as a runner is asked nothing', async () => {
  const picky: HarnessSpec = {
    name: 'picky',
    command: () => ({ cmd: 'true', args: [] }),
    refuses: (task) => (task.model === 'huge' ? 'picky runs no huge models' : undefined),
  };
  const engine = createEngine({ journal: memoryJournal(), harnesses: { picky, fake: fakeHarness(new Map()) }, defaultHarness: 'picky' });
  await refused(engine, { brief: 'b', cwd: '/r', model: 'huge' }, /picky runs no huge models/);
  assert.ok(await engine.file({ brief: 'b', cwd: '/r', harness: 'fake', permissionMode: 'anything' }));
});

test('file() refuses an effort its harness does not have — Claude Code would have ignored it', async () => {
  const { journal, engine } = shipped();
  await refused(engine, { brief: 'b', cwd: '/r', effort: 'extreme' }, /`effort: extreme` is not an effort Claude Code has/);
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'codex', effort: 'extreme' }, /not a reasoning effort Codex has/);
  await refused(engine, { brief: 'b', cwd: '/r', effort: '' }, /`effort` is empty/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  await engine.file({ brief: 'b', cwd: '/r', effort: 'xhigh' });
  await engine.file({ brief: 'b', cwd: '/r', harness: 'codex', effort: 'minimal' });
  assert.equal((await journal.list()).length, 2);
});

test('file() refuses a tool list that is not a list of names, and journals one that is', async () => {
  const { journal, engine } = shipped();
  for (const tools of [['Read,Grep'], [''], [' Read'], 'Read' as unknown as string[]]) {
    await refused(engine, { brief: 'b', cwd: '/r', tools }, /is not a list of tool names/);
  }
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const id = await engine.file({ brief: 'b', cwd: '/r', tools: ['Read', 'Grep', 'Glob'] });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { tools?: string[] }).tools, ['Read', 'Grep', 'Glob'], 'on the record, for the runner');
});

test('file() refuses a disallowedTools that is not a list of permission rules, and a deny list on codex, and journals one that is', async () => {
  const { journal, engine } = shipped();
  const notRules: unknown[] = [
    'SendMessage', [''], [' SendMessage'], [42], ['SendMessage,CronCreate'], ['Bash npm run build'],
    ['Bash(npm run build'], ['Bash()'], ['(npm run build)'], ['-p'],
  ];
  for (const disallowedTools of notRules) {
    await refused(engine, { brief: 'b', cwd: '/r', disallowedTools: disallowedTools as string[] }, /is not a list of permission rules\. Give one rule per entry/);
  }
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'codex', disallowedTools: ['SendMessage'] }, /is a deny list, and Codex has no tool list/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  const rules = ['SendMessage', 'Bash(npm run build)', 'mcp__playwright__browser_run_code_unsafe', 'Read(//home/**)'];
  const id = await engine.file({ brief: 'b', cwd: '/r', disallowedTools: rules });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { disallowedTools?: string[] }).disallowedTools, rules, 'on the record, for the runner');
});

test('file() refuses an mcp map whose entries are not .mcp.json servers, and journals one that is', async () => {
  const { journal, engine } = shipped();
  const bad: Array<[unknown, RegExp]> = [
    [[], /`mcp: \[\]` is not a map of MCP servers by name/],
    [null, /`mcp: null` is not a map of MCP servers by name/],
    ['npx @playwright/mcp', /is not a map of MCP servers by name/],
    [{ 'my server': { command: 'x' } }, /`mcp: "my server"` is not a server name/],
    [{ web: 'npx server' }, /`mcp.web` is not a server\. An entry is/],
    [{ web: {} }, /`mcp.web` has neither `command` nor `url`/],
    [{ web: { command: 'x', url: 'https://h/mcp' } }, /`mcp.web` has both `command` and `url`/],
    [{ web: { command: '' } }, /`mcp.web.command` is not a program to run/],
    [{ web: { command: 'x', args: '-y server' } }, /`mcp.web.args` is not a list of strings/],
    [{ web: { command: 'x', env: { PORT: 3000 } } }, /`mcp.web.env` is not a map of strings/],
    [{ web: { command: 'x', cwd: '/r' } }, /`mcp.web` has `cwd`, which a server with a `command` does not take/],
    [{ web: { command: 'x', type: 'http' } }, /`mcp.web` has a `command` and `type: "http"`/],
    // Claude Code would load nothing from this, and say nothing.
    [{ web: { url: 'https://h/mcp' } }, /`mcp.web` has a `url` and no `type`.*Claude Code loads no server/],
    [{ web: { type: 'ws', url: 'https://h/mcp' } }, /`mcp.web` has a `url` and `type: "ws"`/],
    [{ web: { type: 'http', url: 7 } }, /`mcp.web.url` is not an address/],
    [{ web: { type: 'http', url: 'https://h/mcp', env: {} } }, /`mcp.web` has `env`, which a server with a `url` does not take/],
    [{ web: { type: 'http', url: 'https://h/mcp', headers: { Authorization: 1 } } }, /`mcp.web.headers` is not a map of strings/],
  ];
  for (const [mcp, says] of bad) await refused(engine, { brief: 'b', cwd: '/r', mcp: mcp as TaskSpec['mcp'] }, says);
  // Codex's own words: it connects to no SSE server. Claude Code does.
  const sse = { docs: { type: 'sse' as const, url: 'https://h/sse' } };
  await refused(engine, { brief: 'b', cwd: '/r', harness: 'codex', mcp: sse }, /`mcp.docs` is an SSE server, and Codex connects only to stdio and streamable HTTP/);
  assert.deepEqual(await journal.list(), [], 'nothing was journalled');

  await engine.file({ brief: 'b', cwd: '/r', harness: 'claude-detached', mcp: sse });
  const mcp = { browser: { command: 'npx', args: ['-y', '@playwright/mcp'], env: { HEADLESS: '1' } }, docs: { type: 'http' as const, url: 'https://h/mcp' } };
  const id = await engine.file({ brief: 'b', cwd: '/r', mcp });
  const [filed] = await journal.read(id);
  assert.deepEqual((filed as { mcp?: unknown }).mcp, mcp, 'on the record, for the runner');
});

test('a PromiseRunner whose spawn rejects is not taken to have started nothing — unless it says so', async () => {
  const sessions = new Map<string, Sighting>();
  const launcher: PromiseRunner = {
    ...fakeHarness(sessions),
    async spawn(r) {
      if (r.brief === 'refuse') throw Object.assign(new Error('quota: no sessions today'), { refused: true });
      sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
      throw new Error('launcher: lost the acknowledgement');
    },
  };
  const engine = createEngine({ journal: memoryJournal(), harnesses: { launcher }, defaultHarness: 'launcher' });
  const maybe = await engine.file({ brief: 'start', cwd: '/r' });
  const no = await engine.file({ brief: 'refuse', cwd: '/r' });

  await engine.tick();
  assert.equal((await engine.view(no)).state.settled, 'failed', 'said nothing started: unstartable');
  assert.equal((await engine.view(no)).state.attempts[0]?.reason, 'unstartable');
  assert.equal((await engine.view(maybe)).state.settled, null, 'said nothing: not failed');

  await engine.tick();
  assert.equal((await engine.view(maybe)).phase, 'running (working)', 'and its session is adopted');
});
