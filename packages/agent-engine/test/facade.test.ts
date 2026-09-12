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
