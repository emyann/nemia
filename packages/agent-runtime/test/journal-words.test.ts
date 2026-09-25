/**
 * What the journal says, word for word, for six scripted runs through `createEngine` — and what the harness was asked.
 *
 * Written before the A2A seam went in beneath the engine's harnesses (thin runtime, stage 1 part 2), and kept unchanged
 * after it: whatever carries a spawn, an observe or a stop to a harness, the record a run leaves is the same, to the
 * word. Times are masked, since they are the clock's; everything else — ids, names, reasons, a harness's own words — is
 * compared exactly, never by pattern: a word changed on the way from a harness to the journal fails nothing else.
 *
 * Changed once, knowingly: stage 2 gave `ended` a `denials` key (the tool calls a harness denied the session), written
 * beside `usage` and `exitCode` off the same sighting. A journal written before it has no such key, and folds the same.
 * And again by stage 2 part 4: `filed` carries `holdOpen`, and a task held open writes `input` and `closed` — the fifth run.
 * A journal written before has neither key nor kind, and folds and decides the same (`decide.test.ts`, HELD OPEN).
 * And by stage 4a: an `ended` read off a sighting of a task that asked for a closing statement carries `stated`, whether one
 * came — the fact the runtime reports where it once judged. A journal written before has no such key, and folds the same.
 * And by stage 4a part 2: `filed` no longer carries `maxAttempts` or `resume` — the runtime makes one attempt per start. A
 * journal written before carries both, and folds and decides as if it did not (the last test here; `decide.test.ts`).
 * And by stage 4b: the spend cap is one of the harness's arguments, so `filed` and a spawn no longer carry `budgetUsd` beside
 * `config` and an `input` carries its turn's under `config`; and an `ended` carries `limit` beside `denials`, the limit its
 * harness says it stopped at, where the runtime once wrote `reason: 'budget'`. A journal written before is read in this shape
 * (`upgrade` in `journal.ts`, `journal.test.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold } from '../src/domain.ts';
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
  resumeFrom: undefined,
};

const filed = {
  kind: 'filed', at: '<at>', brief: 'write the words down', cwd: '/repo', harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] }, deadlineSeconds: undefined,
  resumeFrom: undefined, closeoutSchema: { type: 'object' }, priority: undefined, holdOpen: undefined, queued: false,
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
      closeout: { outcome: 'done', summary: 'wrote them' }, stated: true, usage: { turns: 3, outputTokens: 120, costUsd: 0.25 }, exitCode: undefined, denials: undefined, limit: undefined },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: undefined },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a session that ends with no statement where one was asked: ended as its harness said, `stated: false`, settled succeeded — the judging is the layer above\'s — and an end without the key folds the same', async () => {
  const b = board();
  const id = await b.engine.file(filing);
  await b.engine.tick();
  b.sessions.set('ae/t-words/1', { ...b.sessions.get('ae/t-words/1')!, state: 'done', busy: false });
  await b.engine.tick();
  await b.engine.tick();
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', attempt: 1 },
    { kind: 'ended', at: '<at>', attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 's-1',
      closeout: undefined, stated: false, usage: undefined, exitCode: undefined, denials: undefined, limit: undefined },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: undefined },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]], 'nothing continued, nobody nudged');

  const events = (await b.record(id)) as Event[];
  const without = events.map((e) => (e.kind === 'ended' ? (({ stated: _, ...rest }) => rest)(e) : e)) as Event[];
  const old = fold(id, without);
  assert.equal('stated' in old.attempts[0]!, false, 'a journal from before stage 4a carries no key');
  assert.deepEqual(fold(id, events), { ...old, attempts: [{ ...old.attempts[0]!, stated: false }] });
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
      closeout: undefined, usage: undefined, exitCode: undefined, denials: undefined, limit: undefined },
    { kind: 'settled', at: '<at>', outcome: 'stopped', note: 'operator' },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked], ['stop', 's-1']]);
});

test('what the harness denied the session is written on its end, as it said it, and an end written before the key folds the same', async () => {
  const b = board();
  const id = await b.engine.file(filing);
  await b.engine.tick();
  const name = 'ae/t-words/1';
  const denials = [{ tool: 'Skill', what: 'look' }, { tool: 'Bash', what: 'pytest' }, { tool: 'WebFetch' }];
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'failed', busy: false, denials });
  await b.engine.tick();
  const ended = (await b.record(id)).find((e) => e.kind === 'ended');
  assert.deepEqual(ended, {
    kind: 'ended', at: '<at>', attempt: 1, sessionId: 's-1', observed: 'failed', reason: 'harness', nativeId: 's-1',
    closeout: undefined, stated: false, usage: undefined, exitCode: undefined, denials, limit: undefined,
  });
  assert.deepEqual((await b.engine.view(id)).state.attempts[0]?.denials, denials);

  // The same end as a journal from before stage 2 has it — no `denials` key — and as one written with none denied.
  const events = (await b.record(id)) as Event[];
  const without = events.map((e) => (e.kind === 'ended' ? (({ denials: _, ...rest }) => rest)(e) : e)) as Event[];
  const none = events.map((e) => (e.kind === 'ended' ? { ...e, denials: undefined } : e)) as Event[];
  const old = fold(id, without);
  assert.equal('denials' in old.attempts[0]!, false, 'an attempt whose end names no denial carries no key');
  assert.deepEqual(fold(id, none), old);
  assert.deepEqual(fold(id, events), { ...old, attempts: [{ ...old.attempts[0]!, denials }] });
});

test('a task held open: it signs and waits, an answer is a turn that continues its session, a close settles it', async () => {
  const b = board();
  const id = await b.engine.file({ ...filing, holdOpen: true });
  await b.engine.tick();
  const sign = (n: number, summary: string) => b.sessions.set(`ae/t-words/${n}`, {
    ...b.sessions.get(`ae/t-words/${n}`)!, state: 'done', busy: false,
    closeout: { payload: { outcome: 'done', summary }, at: Date.now() + 60_000 },
  });
  sign(1, 'a first draft');
  await b.engine.tick();
  assert.equal((await b.engine.view(id)).phase, 'input-required');
  await b.engine.answer(id, 'shorter, please', { config: { budgetUsd: 0.5 } });
  await b.engine.tick();
  sign(2, 'a shorter draft');
  await b.engine.tick();
  await b.engine.close(id);
  await b.engine.tick();
  const ended = (n: number, summary: string) => ({ kind: 'ended', at: '<at>', attempt: n, sessionId: `s-${n}`, observed: 'done', reason: 'harness',
    nativeId: `s-${n}`, closeout: { outcome: 'done', summary }, stated: true, usage: undefined, exitCode: undefined, denials: undefined, limit: undefined });
  assert.deepEqual(await b.record(id), [
    { ...filed, holdOpen: true },
    { kind: 'starting', at: '<at>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', attempt: 1 },
    ended(1, 'a first draft'),
    { kind: 'input', at: '<at>', text: 'shorter, please', config: { budgetUsd: 0.5 } },
    { kind: 'starting', at: '<at>', attempt: 2, resumeFrom: 's-1', nudge: 'shorter, please' },
    { kind: 'spawned', at: '<at>', attempt: 2 },
    ended(2, 'a shorter draft'),
    { kind: 'closed', at: '<at>' },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: 'closed' },
  ]);
  assert.deepEqual(b.asked, [
    ['spawn', spawnAsked],
    ['spawn', { ...spawnAsked, name: 'ae/t-words/2', brief: 'shorter, please', resumeFrom: 's-1', config: { ...spawnAsked.config, budgetUsd: 0.5 } }],
  ]);
});

test('a journal filed before stage 4a part 2, with `maxAttempts` and `resume`, folds as one without them, and a refused spawn settles it on its first attempt', async () => {
  const b = board(Object.assign(new Error('fake: no binary called `fake` on PATH'), { refused: true }));
  const id = await b.engine.file(filing);
  await b.engine.tick();
  const now = (await b.record(id)) as Event[];
  const before = now.map((e) => (e.kind === 'filed' ? { ...e, maxAttempts: 3, resume: 'always' } : e)) as Event[];
  assert.deepEqual(fold(id, before), fold(id, now));
});
