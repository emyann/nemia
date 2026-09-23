/**
 * The A2A seam's task store is a view: a runtime restarted mid-session answers for sessions it never started, before its
 * first tick, off the harness and the journal alone — and stops them, and settles them, as the one that died would have.
 *
 * Two engines on one journal and one fake harness stand for a runtime before and after a restart; a client built fresh
 * over the same two stands for anyone asking the restarted one's agent, with nothing in its memory.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { TaskState } from '@a2a-js/sdk';
import { clientOf } from '../src/a2a-client.ts';
import { sightingOf } from '../src/a2a-map.ts';
import { createEngine, type Event, type PromiseJournal, type PromiseRunner, type Sighting, type SpawnRequest } from '../src/facade.ts';
import type { RunnerOps } from '../src/runner.ts';

/** A journal in memory and a harness whose sessions a test moves by hand: what outlives a runtime's process. */
const world = (o: { spawnHangs?: boolean } = {}) => {
  const tasks = new Map<string, Event[]>();
  const journal: PromiseJournal = {
    async append(taskId, event) { tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]); },
    async read(taskId) { return [...(tasks.get(taskId) ?? [])]; },
    async list() { return [...tasks.keys()].sort(); },
    async feed() { return { entries: [], cursor: 0 }; },
  };
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, unknown]> = [];
  let n = 0;
  const fake: PromiseRunner = {
    async spawn(r: SpawnRequest) {
      asked.push(['spawn', r.name]);
      const id = `s-${++n}`;
      sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id });
      // The runtime dies with the session registered and the spawn not yet answered.
      if (o.spawnHangs) await new Promise(() => {});
    },
    async observe() { asked.push(['observe', undefined]); return new Map(sessions); },
    async stop(sessionId) {
      asked.push(['stop', sessionId]);
      for (const [name, s] of sessions) if (s.sessionId === sessionId) sessions.set(name, { ...s, state: 'stopped', busy: false });
    },
    async logs() { return ''; },
  };
  /** A runtime's process, started on what outlives it. */
  const runtime = () => createEngine({ journal, harnesses: { fake } });
  /** The fake's agent as a new process builds it: a client over a handler with nothing in its memory. */
  const ops: RunnerOps = {
    spawn: (r) => Effect.promise(() => fake.spawn(r)),
    observe: Effect.promise(() => fake.observe()),
    stop: (id) => Effect.promise(() => fake.stop(id)),
    logs: (id) => Effect.promise(() => fake.logs(id)),
  };
  const client = () => clientOf('fake', ops, (taskId) => journal.read(taskId));
  return { runtime, client, sessions, asked, journal };
};

const filing = { id: 't-r', brief: 'keep at it', cwd: '/repo', harness: 'fake' };
const listing = { tenant: '', contextId: 't-r', status: TaskState.TASK_STATE_UNSPECIFIED, pageSize: 50, pageToken: '', historyLength: undefined, statusTimestampAfter: undefined, includeArtifacts: false };

test('a restarted runtime answers for a session it never started, then stops it and settles, before and after a tick', async () => {
  const w = world();
  const a = w.runtime();
  const id = await a.file(filing);
  await a.tick();
  assert.deepEqual(w.sessions.get('ae/t-r/1'), { sessionId: 's-1', state: 'working', busy: true, nativeId: 's-1' });

  // The first runtime is gone. The second has not ticked, and its agent holds nothing.
  const b = w.runtime();
  const fresh = w.client();
  const task = await fresh.getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
  assert.equal(task.status!.state, TaskState.TASK_STATE_WORKING);
  assert.deepEqual(sightingOf(task), w.sessions.get('ae/t-r/1'));
  const listed = await fresh.listTasks(listing);
  assert.deepEqual(listed.tasks.map((t) => [t.id, t.contextId, t.status!.state]), [['ae/t-r/1', 't-r', TaskState.TASK_STATE_WORKING]]);

  // Stopped by the second runtime: its tick cancels the session through its agent, which stops it on the harness.
  await b.stop(id);
  w.asked.length = 0;
  await b.tick();
  // The pass observes; then the agent asked to cancel observes to find the session, and stops it: the seam's path.
  assert.deepEqual(w.asked, [['observe', undefined], ['observe', undefined], ['stop', 's-1']]);
  assert.equal(w.sessions.get('ae/t-r/1')!.state, 'stopped');
  await b.tick();
  assert.equal((await b.view(id)).phase, 'stopped');

  // The harness lets the session go; the journal still answers for it.
  w.sessions.delete('ae/t-r/1');
  const after = await w.client().getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
  assert.equal(after.status!.state, TaskState.TASK_STATE_CANCELED);
  assert.equal((after.metadata!.attempt as { reason: string }).reason, 'operator');
});

test('a spawn the runtime died inside is adopted by the next one by name, never started twice', async () => {
  const w = world({ spawnHangs: true });
  const a = w.runtime();
  const id = await a.file(filing);
  // Never answered: the session exists, and the journal says only that its attempt was starting.
  void a.tick();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(w.asked.filter(([verb]) => verb === 'spawn'), [['spawn', 'ae/t-r/1']]);
  assert.deepEqual((await w.journal.read(id)).map((e) => e.kind), ['filed', 'starting']);

  const b = w.runtime();
  const task = await w.client().getTask({ tenant: '', id: 'ae/t-r/1', historyLength: undefined });
  assert.equal(task.status!.state, TaskState.TASK_STATE_WORKING, 'the agent answers off the harness before any tick');
  await b.tick();
  assert.deepEqual(w.asked.filter(([verb]) => verb === 'spawn'), [['spawn', 'ae/t-r/1']], 'adopted, not spawned again');
  assert.equal((await b.view(id)).phase, 'running (working)');

  w.sessions.set('ae/t-r/1', { ...w.sessions.get('ae/t-r/1')!, state: 'done', busy: false });
  await b.tick();
  assert.equal((await b.view(id)).phase, 'succeeded');
});
