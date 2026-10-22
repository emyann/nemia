/**
 * What the journal says, word for word, for six scripted runs through `builtEngine` — and what the harness was asked.
 *
 * Whatever carries a spawn, an observe or a stop to a harness, the record a run leaves is the same, to the word. Times are
 * masked, since they are the clock's — `at`, and the monotonic `mono` a start, a spawn and an end carry beside it; everything else —
 * ids, names, reasons, a harness's own words — is compared exactly, never by pattern: a word changed on the way from a harness
 * to the journal fails nothing else.
 *
 * The shape pinned: an `ended` carries, off the same sighting as `usage` and `exitCode`, `denials` (the tool calls a harness
 * denied the session), `skills` (the skills it loaded) and `limit` (the limit its harness says it stopped at), and, for a task
 * that asked for a closing statement, `stated`, whether one came; `filed` carries `holdOpen`, and a task held open writes
 * `input` and `closed` — the fifth run; the spend cap is one of the harness's arguments, so `filed`, a spawn and an `input`
 * carry it under `config`.
 *
 * A journal an older runtime wrote may have no `denials`, `stated` or `holdOpen` key and no `input` or `closed` event, and
 * folds and decides the same (`decide.test.ts`, HELD OPEN); it may carry `maxAttempts` and `resume` on `filed`, and folds and
 * decides as if it did not (the last test here; `decide.test.ts`); and it may carry `budgetUsd` beside `config`, or
 * `reason: 'budget'` on an `ended`, which `upgrade` in `journal.ts` reads in this shape (`journal.test.ts`).
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold } from '../src/core/domain.ts';
import type { Event, Sighting, SpawnRequest } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';

/**
 * A store in memory, and a harness whose sessions a test moves by hand, behind the engine as a consumer builds it. Its
 * `record` is the journal of a task, its times masked.
 */
const board = (spawnFails?: Error) => {
  const tasks = new Map<string, Event[]>();
  const journal: AsyncJournal = {
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
    },
    async read(taskId) {
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed() {
      return { entries: [], cursor: 0 };
    },
  };
  const sessions = new Map<string, Sighting>();
  const asked: Array<[string, unknown]> = [];
  let n = 0;
  const fake: AsyncRunner = {
    async spawn(r: SpawnRequest) {
      asked.push(['spawn', r]);
      if (spawnFails) throw spawnFails;
      const id = `s-${++n}`;
      sessions.set(r.name, { sessionId: id, state: 'working', busy: true, nativeId: id });
    },
    async observe() {
      return new Map(sessions);
    },
    async stop(sessionId) {
      asked.push(['stop', sessionId]);
      for (const [name, s] of sessions) if (s.sessionId === sessionId) sessions.set(name, { ...s, state: 'canceled', busy: false });
    },
    async logs() {
      return '';
    },
  };
  const engine = builtEngine(
    Engine.layer({ root: scratch('ae-journal-words-root-'), journal: asyncStore(journal), harnesses: { fake: asyncOps(fake) } }),
  );
  const record = async (id: string) =>
    (await journal.read(id)).map((e) => ({ ...e, at: '<at>', ...('mono' in e ? { mono: '<mono>' } : {}) }));
  return { engine, sessions, asked, record };
};

const filing = {
  id: 't-words',
  brief: 'write the words down',
  cwd: '/repo',
  harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] },
  closeoutSchema: { type: 'object' },
};

const spawnAsked = {
  name: 'ae/t-words/1',
  brief: 'write the words down',
  cwd: '/repo',
  harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] },
  restartPolicy: undefined,
  closeoutSchema: { type: 'object' },
  resumeFrom: undefined,
  resource: { task: 't-words' },
  traceparent: undefined,
};

const filed = {
  kind: 'filed',
  at: '<at>',
  brief: 'write the words down',
  cwd: '/repo',
  harness: 'fake',
  config: { model: 'opus', permissionMode: 'dontAsk', tools: ['Read', 'Edit'] },
  deadlineSeconds: undefined,
  resumeFrom: undefined,
  closeoutSchema: { type: 'object' },
  holdOpen: undefined,
  queued: false,
};

test('a session that signs off: spawned, ended with its statement and usage, settled succeeded', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  const name = 'ae/t-words/1';
  const began = Date.parse((await Effect.runPromise(b.engine.view(id))).state.attempts[0].startedAt);
  b.sessions.set(name, {
    ...b.sessions.get(name)!,
    state: 'completed',
    busy: false,
    closeout: { payload: { outcome: 'done', summary: 'wrote them' }, at: began + 1_000 },
    usage: { turns: 3, outputTokens: 120, costUsd: 0.25 },
  });
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 1 },
    {
      kind: 'ended',
      at: '<at>',
      mono: '<mono>',
      attempt: 1,
      sessionId: 's-1',
      observed: 'done',
      reason: 'harness',
      nativeId: 's-1',
      closeout: { outcome: 'done', summary: 'wrote them' },
      stated: true,
      usage: { turns: 3, outputTokens: 120, costUsd: 0.25 },
      exitCode: undefined,
      denials: undefined,
      skills: undefined,
      files: undefined,
      limit: undefined,
    },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: undefined },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test("a session that ends with no statement where one was asked: ended as its harness said, `stated: false`, settled succeeded — the judging is the layer above's — and an end without the key folds the same", async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  b.sessions.set('ae/t-words/1', { ...b.sessions.get('ae/t-words/1')!, state: 'completed', busy: false });
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 1 },
    {
      kind: 'ended',
      at: '<at>',
      mono: '<mono>',
      attempt: 1,
      sessionId: 's-1',
      observed: 'done',
      reason: 'harness',
      nativeId: 's-1',
      closeout: undefined,
      stated: false,
      usage: undefined,
      exitCode: undefined,
      denials: undefined,
      skills: undefined,
      files: undefined,
      limit: undefined,
    },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: undefined },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]], 'nothing continued, nobody nudged');

  const events = (await b.record(id)) as Event[];
  const without = events.map((e) => (e.kind === 'ended' ? (({ stated: _, ...rest }) => rest)(e) : e)) as Event[];
  const old = fold(id, without);
  assert.equal('stated' in old.attempts[0], false, 'a journal from before stage 4a carries no key');
  assert.deepEqual(fold(id, events), { ...old, attempts: [{ ...old.attempts[0], stated: false }] });
});

test('a spawn the harness refused: the attempt ends unstartable in its words, and the task settles failed', async () => {
  const b = board(Object.assign(new Error('fake: no binary called `fake` on PATH'), { refused: true }));
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    {
      kind: 'ended',
      at: '<at>',
      mono: '<mono>',
      attempt: 1,
      sessionId: '(never started)',
      observed: 'failed',
      reason: 'unstartable',
      error: 'fake: no binary called `fake` on PATH',
    },
    {
      kind: 'settled',
      at: '<at>',
      outcome: 'failed',
      note: '1 attempt(s), none succeeded: the last could not start: fake: no binary called `fake` on PATH; fix what it names and file the task again',
    },
  ]);
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a spawn that failed without saying nothing started: spawned, with its error, and left to the grace window', async () => {
  const b = board(new Error('fake: the launcher lost its acknowledgement'));
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 1, error: 'fake: the launcher lost its acknowledgement' },
  ]);
  assert.equal((await Effect.runPromise(b.engine.view(id))).phase, 'starting');
  assert.deepEqual(b.asked, [['spawn', spawnAsked]]);
});

test('a person stops it: the session is stopped, its attempt ended by the operator, and the task settles stopped', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.stop(id));
  await Effect.runPromise(b.engine.tick());
  assert.equal(b.sessions.get('ae/t-words/1')?.state, 'canceled', 'the harness was asked to stop the session');
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await b.record(id), [
    filed,
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 1 },
    { kind: 'stop-requested', at: '<at>' },
    {
      kind: 'ended',
      at: '<at>',
      mono: '<mono>',
      attempt: 1,
      sessionId: 's-1',
      observed: 'stopped',
      reason: 'operator',
      nativeId: 's-1',
      closeout: undefined,
      usage: undefined,
      exitCode: undefined,
      denials: undefined,
      skills: undefined,
      files: undefined,
      limit: undefined,
    },
    { kind: 'settled', at: '<at>', outcome: 'stopped', note: 'operator' },
  ]);
  assert.deepEqual(b.asked, [
    ['spawn', spawnAsked],
    ['stop', 's-1'],
  ]);
});

test('what the harness denied the session is written on its end, as it said it, and an end written before the key folds the same', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  const name = 'ae/t-words/1';
  const denials = [{ tool: 'Skill', what: 'look' }, { tool: 'Bash', what: 'pytest' }, { tool: 'WebFetch' }];
  b.sessions.set(name, { ...b.sessions.get(name)!, state: 'failed', busy: false, denials });
  await Effect.runPromise(b.engine.tick());
  assert.equal((await b.record(id)).filter((e) => e.kind === 'denied').length, 0, 'a session seen only over is written no denied entry');
  const ended = (await b.record(id)).find((e) => e.kind === 'ended');
  assert.deepEqual(ended, {
    kind: 'ended',
    at: '<at>',
    mono: '<mono>',
    attempt: 1,
    sessionId: 's-1',
    observed: 'failed',
    reason: 'harness',
    nativeId: 's-1',
    closeout: undefined,
    stated: false,
    usage: undefined,
    exitCode: undefined,
    denials,
    skills: undefined,
    files: undefined,
    limit: undefined,
  });
  assert.deepEqual((await Effect.runPromise(b.engine.view(id))).state.attempts[0]?.denials, denials);

  const events = (await b.record(id)) as Event[];
  const without = events.map((e) => (e.kind === 'ended' ? (({ denials: _, ...rest }) => rest)(e) : e)) as Event[];
  const none = events.map((e) => (e.kind === 'ended' ? { ...e, denials: undefined } : e)) as Event[];
  const old = fold(id, without);
  assert.equal('denials' in old.attempts[0], false, 'an attempt whose end names no denial carries no key');
  assert.deepEqual(fold(id, none), old, 'a journal an older runtime wrote, with no `denials` key, folds as one written with none denied');
  assert.deepEqual(fold(id, events), { ...old, attempts: [{ ...old.attempts[0], denials }] });
});

test('what the harness denies a session while it works is written as it says it, each denial once, and its end names them all', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  const name = 'ae/t-words/1';
  const working = b.sessions.get(name)!;
  const [ls, glob] = [{ tool: 'Bash', what: 'ls' }, { tool: 'Glob' }];
  const denied = async () => (await b.record(id)).filter((e) => e.kind === 'denied');
  b.sessions.set(name, { ...working, denials: [ls] });
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await denied(), [{ kind: 'denied', at: '<at>', attempt: 1, tool: 'Bash', what: 'ls' }]);
  b.sessions.set(name, { ...working, denials: [ls, glob] });
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await denied(), [
    { kind: 'denied', at: '<at>', attempt: 1, tool: 'Bash', what: 'ls' },
    { kind: 'denied', at: '<at>', attempt: 1, tool: 'Glob' },
  ]);
  assert.deepEqual((await Effect.runPromise(b.engine.view(id))).state.attempts[0]?.denials, [ls, glob], 'the attempt in flight says them');
  b.sessions.set(name, { ...working, state: 'failed', busy: false, denials: [ls, ls, glob] });
  await Effect.runPromise(b.engine.tick());
  assert.equal((await denied()).length, 2, 'the end writes no denied entry');
  assert.deepEqual((await b.record(id)).find((e) => e.kind === 'ended')?.denials, [ls, ls, glob]);
  assert.deepEqual((await Effect.runPromise(b.engine.view(id))).state.attempts[0]?.denials, [ls, ls, glob], 'the end stands');
});

test('the skills the session loaded are written on its end as its harness said them, an empty list kept, and an end without the key folds with none', async () => {
  const endWith = async (skills: string[]) => {
    const b = board();
    const id = await Effect.runPromise(b.engine.file(filing));
    await Effect.runPromise(b.engine.tick());
    const name = 'ae/t-words/1';
    b.sessions.set(name, { ...b.sessions.get(name)!, state: 'failed', busy: false, skills });
    await Effect.runPromise(b.engine.tick());
    const events = (await b.record(id)) as Event[];
    return {
      id,
      events,
      ended: events.find((e) => e.kind === 'ended'),
      attempt: (await Effect.runPromise(b.engine.view(id))).state.attempts[0],
    };
  };
  const loaded = await endWith(['look', 'look']);
  assert.deepEqual(loaded.ended && 'skills' in loaded.ended && loaded.ended.skills, ['look', 'look'], 'one per load, as said');
  assert.deepEqual(loaded.attempt?.skills, ['look', 'look']);
  const none = await endWith([]);
  assert.deepEqual(none.ended && 'skills' in none.ended && none.ended.skills, [], 'none loaded is a measure, kept');
  assert.deepEqual(none.attempt?.skills, [], 'and folds as one');

  const without = none.events.map((e) => (e.kind === 'ended' ? (({ skills: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.equal('skills' in fold(none.id, without).attempts[0], false, 'an end from before the key, or a harness that cannot say: none');
});

test('the files the session touched are written on its end as its harness said them, an empty list kept, and an end without the key folds with none', async () => {
  const endWith = async (files: string[]) => {
    const b = board();
    const id = await Effect.runPromise(b.engine.file(filing));
    await Effect.runPromise(b.engine.tick());
    const name = 'ae/t-words/1';
    b.sessions.set(name, { ...b.sessions.get(name)!, state: 'failed', busy: false, files });
    await Effect.runPromise(b.engine.tick());
    const events = (await b.record(id)) as Event[];
    return {
      id,
      events,
      ended: events.find((e) => e.kind === 'ended'),
      attempt: (await Effect.runPromise(b.engine.view(id))).state.attempts[0],
    };
  };
  const touched = await endWith(['apps/web/a.tsx', 'b.ts']);
  assert.deepEqual(touched.ended && 'files' in touched.ended && touched.ended.files, ['apps/web/a.tsx', 'b.ts']);
  assert.deepEqual(touched.attempt?.files, ['apps/web/a.tsx', 'b.ts']);
  const none = await endWith([]);
  assert.deepEqual(none.attempt?.files, [], 'none touched is a measure, kept');
  const without = none.events.map((e) => (e.kind === 'ended' ? (({ files: _, ...rest }) => rest)(e) : e)) as Event[];
  assert.equal('files' in fold(none.id, without).attempts[0], false, 'an end from before the key, or a harness that cannot say: none');
});

test('a task held open: it signs and waits, an answer is a turn that continues its session, a close settles it', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file({ ...filing, holdOpen: true }));
  await Effect.runPromise(b.engine.tick());
  const sign = async (n: number, summary: string) => {
    const began = Date.parse((await Effect.runPromise(b.engine.view(id))).state.attempts[n - 1].startedAt);
    b.sessions.set(`ae/t-words/${n}`, {
      ...b.sessions.get(`ae/t-words/${n}`)!,
      state: 'completed',
      busy: false,
      closeout: { payload: { outcome: 'done', summary }, at: began + 1_000 },
    });
  };
  await sign(1, 'a first draft');
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view(id))).phase, 'input-required');
  await Effect.runPromise(b.engine.answer(id, 'shorter, please', { config: { budgetUsd: 0.5 } }));
  await Effect.runPromise(b.engine.tick());
  await sign(2, 'a shorter draft');
  await Effect.runPromise(b.engine.tick());
  await Effect.runPromise(b.engine.close(id));
  await Effect.runPromise(b.engine.tick());
  const ended = (n: number, summary: string) => ({
    kind: 'ended',
    at: '<at>',
    mono: '<mono>',
    attempt: n,
    sessionId: `s-${n}`,
    observed: 'done',
    reason: 'harness',
    nativeId: `s-${n}`,
    closeout: { outcome: 'done', summary },
    stated: true,
    usage: undefined,
    exitCode: undefined,
    denials: undefined,
    skills: undefined,
    files: undefined,
    limit: undefined,
  });
  assert.deepEqual(await b.record(id), [
    { ...filed, holdOpen: true },
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 1, resumeFrom: undefined, nudge: undefined },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 1 },
    ended(1, 'a first draft'),
    { kind: 'input', at: '<at>', text: 'shorter, please', config: { budgetUsd: 0.5 } },
    { kind: 'starting', at: '<at>', mono: '<mono>', attempt: 2, resumeFrom: 's-1', nudge: 'shorter, please' },
    { kind: 'spawned', at: '<at>', mono: '<mono>', attempt: 2 },
    ended(2, 'a shorter draft'),
    { kind: 'closed', at: '<at>' },
    { kind: 'settled', at: '<at>', outcome: 'succeeded', note: 'closed' },
  ]);
  assert.deepEqual(b.asked, [
    ['spawn', spawnAsked],
    [
      'spawn',
      {
        ...spawnAsked,
        name: 'ae/t-words/2',
        brief: 'shorter, please',
        resumeFrom: 's-1',
        config: { ...spawnAsked.config, budgetUsd: 0.5 },
      },
    ],
  ]);
});

test('a journal an older runtime filed, with `maxAttempts` and `resume`, folds as one without them, and a refused spawn settles it on its first attempt', async () => {
  const b = board(Object.assign(new Error('fake: no binary called `fake` on PATH'), { refused: true }));
  const id = await Effect.runPromise(b.engine.file(filing));
  await Effect.runPromise(b.engine.tick());
  const now = (await b.record(id)) as Event[];
  const before = now.map((e) => (e.kind === 'filed' ? { ...e, maxAttempts: 3, resume: 'always' } : e)) as Event[];
  assert.deepEqual(fold(id, before), fold(id, now));
});
