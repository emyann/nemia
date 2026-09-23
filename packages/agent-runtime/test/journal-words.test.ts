/**
 * What the journal says, word for word, for four scripted runs through `createEngine` — and what the harness was asked.
 *
 * Written before the A2A seam went in beneath the engine's harnesses (thin runtime, stage 1 part 2), and kept unchanged
 * after it: whatever carries a spawn, an observe or a stop to a harness, the record a run leaves is the same, to the
 * word. Times are masked, since they are the clock's; everything else — ids, names, reasons, a harness's own words — is
 * compared exactly, never by pattern: a word changed on the way from a harness to the journal fails nothing else.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEngine, type Event, type PromiseJournal, type PromiseRunner, type Sighting, type SpawnRequest } from '../src/facade.ts';

/** A store in memory, and a harness whose sessions a test moves by hand, behind the engine as a consumer builds it. */
const board = (spawnFails?: Error) => {
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
      asked.push(['spawn', r]);
      if (spawnFails) throw spawnFails;
      const id = `s-${++n}`;
      sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id });
    },
    async observe() { return new Map(sessions); },
    async stop(sessionId) {
      asked.push(['stop', sessionId]);
      for (const [name, s] of sessions) if (s.sessionId === sessionId) sessions.set(name, { ...s, state: 'stopped', busy: false });
    },
    async logs() { return ''; },
  };
  const engine = createEngine({ journal, harnesses: { fake } });
  /** The journal of `id`, its times masked. */
  const record = async (id: string) => (await journal.read(id)).map((e) => ({ ...e, at: '<at>' }));
  return { engine, sessions, asked, record };
};

const filing = {
  id: 't-words', brief: 'write the words down', cwd: '/repo', harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] }, closeoutSchema: { type: 'object' },
};

const spawnAsked = {
  name: 'ae/t-words/1', brief: 'write the words down', cwd: '/repo', harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] }, closeoutSchema: { type: 'object' },
  budgetUsd: undefined, resumeFrom: undefined,
};

const filed = {
  kind: 'filed', at: '<at>', brief: 'write the words down', cwd: '/repo', maxAttempts: 1, harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] }, deadlineSeconds: undefined, resume: undefined,
  resumeFrom: undefined, closeoutSchema: { type: 'object' }, budgetUsd: undefined, priority: undefined,
};

test('a session that signs off: spawned, ended with its statement and usage, settled succeeded', async () => {
  const b = board();
  const id = await b.engine.file(filing);
  await b.engine.tick();
  const name = 'ae/t-words/1';
  b.sessions.set(name, {
    ...b.sessions.get(name)!, state: 'done', busy: false,
    closeout: { payload: { outcome: 'done', summary: 'wrote them' }, at: Date.now() + 60_000 },
    usage: { turns: 3, outputTokens: 120, costUsd: 0.25 },
  });
  await b.engine.tick();
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', attempt: 1 },
    { kind: 'ended', at: '<at>', attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 's-1',
      closeout: { outcome: 'done', summary: 'wrote them' }, usage: { turns: 3, outputTokens: 120, costUsd: 0.25 }, exitCode: undefined },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: undefined },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a spawn the harness refused: the attempt ends unstartable in its words, and the task settles failed', async () => {
  const b = board(Object.assign(new Error('fake: no binary called `fake` on PATH'), { refused: true }));
  const id = await b.engine.file(filing);
  await b.engine.tick();
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'ended', at: '<at>', attempt: 1, sessionId: '(never started)', observed: 'failed', reason: 'unstartable',
      error: 'fake: no binary called `fake` on PATH' },
    { kind: 'settled', at: '<at>', outcome: 'failed', note: '1 attempt(s), none succeeded' },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a spawn that failed without saying nothing started: spawned, with its error, and left to the grace window', async () => {
  const b = board(new Error('fake: the launcher lost its acknowledgement'));
  const id = await b.engine.file(filing);
  await b.engine.tick();
  await b.engine.tick();
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', attempt: 1, error: 'fake: the launcher lost its acknowledgement' },
  ]);
  assert.equal((await b.engine.view(id)).phase, 'starting');
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a person stops it: the session is stopped, its attempt ended by the operator, and the task settles stopped', async () => {
  const b = board();
  const id = await b.engine.file(filing);
  await b.engine.tick();
  await b.engine.stop(id);
  await b.engine.tick();
  assert.equal(b.sessions.get('ae/t-words/1')?.state, 'stopped', 'the harness was asked to stop the session');
  await b.engine.tick();
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', attempt: 1 },
    { kind: 'stop-requested', at: '<at>' },
    { kind: 'ended', at: '<at>', attempt: 1, sessionId: 's-1', observed: 'stopped', reason: 'operator', nativeId: 's-1',
      closeout: undefined, usage: undefined, exitCode: undefined },
    { kind: 'settled', at: '<at>', outcome: 'stopped', note: 'operator' },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked], ['stop', 's-1']]);
});
