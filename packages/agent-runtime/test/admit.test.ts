/**
 * Queued and admitted: a task filed `queued` starts only once it is given the word, and the pass that starts it is the
 * one after the word. Here the word is `admit`'s, on an engine with no ceiling; the engine's own, under its ceiling and
 * pools, is `admission.test.ts`'s.
 *
 * Each refusal here is made to refuse at shipped defaults, and the counting test proves the word costs no look at any
 * harness: a tick observes each harness once, whatever it hands back, and `admit` observes none.
 */
import { Effect } from 'effect';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Event, FeedEntry, Sighting } from '../src/index.ts';
import { Engine } from '../src/index.ts';
import { admissionOf, awaitsAdmission, decide, fold, nameFor, type State } from '../src/core/domain.ts';
import { asyncStore, asyncOps, type AsyncJournal, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';
import { scratch } from './scratch.ts';

const T0 = new Date('2026-09-25T09:00:00Z');
const at = (ms: number) => new Date(T0.getTime() + ms).toISOString();
const now = (ms = 0) => ({ at: new Date(T0.getTime() + ms), graceMs: 30_000 });
const TASK = 't-q';

const filed = (extra: Partial<Extract<Event, { kind: 'filed' }>> = {}): Event => ({
  kind: 'filed',
  at: at(0),
  brief: 'b',
  cwd: '/r',
  ...extra,
});
const admitted = (ms = 1): Event => ({ kind: 'admitted', at: at(ms) });

test('a task filed queued waits for the word, and starts once it is given', () => {
  const queued = fold(TASK, [filed({ queued: true })]);
  assert.deepEqual(decide(queued, new Map(), now(5)), { do: 'nothing', why: 'queued — waits to be admitted' });
  assert.equal(awaitsAdmission(queued), true);
  assert.equal(admissionOf(queued), 'queued');
  const let_ = fold(TASK, [filed({ queued: true }), admitted()]);
  assert.deepEqual(decide(let_, new Map(), now(5)), { do: 'start', attempt: 1, resumeFrom: undefined });
  assert.equal(awaitsAdmission(let_), false);
  assert.equal(admissionOf(let_), 'admitted', 'a slot handed out, until the pass starts it');
  const started = fold(TASK, [filed({ queued: true }), admitted(), { kind: 'starting', at: at(2), attempt: 1 }]);
  assert.equal(admissionOf(started), undefined, 'started, it says nothing more of admission: its phase does');
});

test('a task filed with `queued: false` starts with no word, and says nothing of admission', () => {
  const s = fold(TASK, [filed({ queued: false })]);
  assert.deepEqual(decide(s, new Map(), now(5)), { do: 'start', attempt: 1, resumeFrom: undefined });
  assert.equal(admissionOf(s), undefined);
});

test('a filing with no `queued` key — a journal an older runtime wrote — reads as queued, so a restarted daemon starts nothing it has not admitted', () => {
  const s = fold(TASK, [filed()]);
  assert.equal(s.queued, undefined, 'folded as written');
  assert.deepEqual(decide(s, new Map(), now(5)), { do: 'nothing', why: 'queued — waits to be admitted' });
  assert.deepEqual(decide(fold(TASK, [filed(), admitted()]), new Map(), now(5)), { do: 'start', attempt: 1, resumeFrom: undefined });
});

test('the wait comes after every terminal answer: a queued task is stopped, and settles, with no word', () => {
  const s = fold(TASK, [filed({ queued: true }), { kind: 'stop-requested', at: at(1) }]);
  assert.deepEqual(decide(s, new Map(), now(5)), { do: 'settle', outcome: 'stopped', note: 'operator' });
  assert.equal(admissionOf(s), undefined, 'asked to stop: nothing to admit');
});

test('a queued task says it is queued, and an admitted one starts: the runtime keeps no ceiling to hold it back', () => {
  assert.deepEqual(decide(fold(TASK, [filed({ queued: true })]), new Map(), now(5)), {
    do: 'nothing',
    why: 'queued — waits to be admitted',
  });
  assert.deepEqual(decide(fold(TASK, [filed({ queued: true }), admitted()]), new Map(), now(5)), {
    do: 'start',
    attempt: 1,
    resumeFrom: undefined,
  });
});

test('a task held open waits for a word before each turn: the one given for its first turn does not start its second', () => {
  const signed: Event[] = [
    filed({ queued: true, holdOpen: true, closeoutSchema: { type: 'object' } }),
    admitted(),
    { kind: 'starting', at: at(2), attempt: 1 },
    { kind: 'spawned', at: at(3), attempt: 1 },
    { kind: 'ended', at: at(4), attempt: 1, sessionId: 's0', observed: 'done', reason: 'harness', nativeId: 'native-1', closeout: {} },
  ];
  const waiting = fold(TASK, signed);
  assert.deepEqual(decide(waiting, new Map(), now(5)), { do: 'nothing', why: 'input-required' });
  assert.equal(admissionOf(waiting), undefined, 'waiting on a person, not on a slot');
  const answered = fold(TASK, [...signed, { kind: 'input', at: at(5), text: 'again' }]);
  assert.deepEqual(decide(answered, new Map(), now(6)), { do: 'nothing', why: 'queued — waits to be admitted' });
  assert.equal(admissionOf(answered), 'queued');
  const early = fold(TASK, [...signed.slice(0, 1), ...signed.slice(2), admitted(4), { kind: 'input', at: at(5), text: 'again' }]);
  assert.equal(early.admitted, 0, "a word written before the answer is the first turn's, and stays so");
  assert.equal(decide(early, new Map(), now(6)).do, 'nothing');
  const let_ = fold(TASK, [...signed, { kind: 'input', at: at(5), text: 'again' }, admitted(6)]);
  assert.deepEqual(decide(let_, new Map(), now(7)), { do: 'start', attempt: 2, resumeFrom: 'native-1', nudge: 'again' });
});

const memoryJournal = (reads: { n: number } = { n: 0 }): AsyncJournal & { tasks: Map<string, Event[]> } => {
  const tasks = new Map<string, Event[]>();
  const feed: FeedEntry[] = [];
  return {
    tasks,
    async append(taskId, event) {
      tasks.set(taskId, [...(tasks.get(taskId) ?? []), event]);
      feed.push({ taskId, event });
    },
    async read(taskId) {
      reads.n++;
      return [...(tasks.get(taskId) ?? [])];
    },
    async list() {
      return [...tasks.keys()].sort();
    },
    async feed(after) {
      return { entries: feed.slice(after), cursor: feed.length };
    },
  };
};

/** A harness that counts how often it is observed. */
const countingHarness = (sessions: Map<string, Sighting>, observes: { n: number }): AsyncRunner => ({
  async spawn(r) {
    sessions.set(r.name, { sessionId: `s-${sessions.size + 1}`, state: 'working' });
  },
  async observe() {
    observes.n++;
    return new Map(sessions);
  },
  async stop(id) {
    for (const [n, s] of sessions) if (s.sessionId === id) sessions.set(n, { ...s, state: 'canceled' });
  },
  async logs() {
    return '';
  },
});

const board = () => {
  const sessions = new Map<string, Sighting>();
  const observes = { n: 0 };
  const reads = { n: 0 };
  const journal = memoryJournal(reads);
  const engine = builtEngine(
    Engine.layer({
      root: scratch('ae-admit-root-'),
      journal: asyncStore(journal),
      harnesses: { fake: asyncOps(countingHarness(sessions, observes)) },
      defaultHarness: 'fake',
    }),
  );
  return { engine, sessions, observes, reads, journal };
};

test('a queued task is started by the pass after the word, not before it and not by the pass that reported it', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file({ brief: 'b', cwd: '/r', queued: true }));
  assert.equal(b.journal.tasks.get(id)![0].kind === 'filed' && (b.journal.tasks.get(id)![0] as { queued?: boolean }).queued, true);
  const first = await Effect.runPromise(b.engine.tick());
  assert.equal(b.sessions.size, 0, 'nothing starts without the word');
  assert.deepEqual(
    first.views.map((v) => [v.id, v.phase, v.admission]),
    [[id, 'pending', 'queued']],
  );
  assert.deepEqual(await Effect.runPromise(b.engine.admit([id])), [id]);
  assert.equal(b.sessions.size, 0, 'the word starts nothing by itself');
  assert.equal((await Effect.runPromise(b.engine.view(id))).admission, 'admitted');
  const second = await Effect.runPromise(b.engine.tick());
  assert.deepEqual([...b.sessions.keys()], [nameFor(id, 1)], 'the next pass starts it');
  assert.deepEqual(
    second.views.map((v) => [v.id, v.phase, v.admission]),
    [[id, 'starting', undefined]],
  );
});

test('a task filed with no `queued` starts on the next pass, as ever, and `file` writes the key on every filing', async () => {
  const b = board();
  const id = await Effect.runPromise(b.engine.file({ brief: 'b', cwd: '/r' }));
  assert.equal((b.journal.tasks.get(id)![0] as { queued?: boolean }).queued, false);
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual([...b.sessions.keys()], [nameFor(id, 1)]);
});

test('a tick reports the view of every task it left unsettled, and none it settled', async () => {
  const b = board();
  const done = await Effect.runPromise(b.engine.file({ brief: 'finishes', cwd: '/r' }));
  const waits = await Effect.runPromise(b.engine.file({ brief: 'waits', cwd: '/r', queued: true }));
  await Effect.runPromise(b.engine.tick());
  b.sessions.set(nameFor(done, 1), { ...b.sessions.get(nameFor(done, 1))!, state: 'completed' });
  const r = await Effect.runPromise(b.engine.tick());
  assert.deepEqual(
    r.views.map((v) => v.id),
    [waits],
  );
  assert.deepEqual(r.views[0], await Effect.runPromise(b.engine.view(waits)), 'the same view `view` gives of it, off the same record');
});

test('admit is idempotent, and writes nothing for a task that waits for no word', async () => {
  const b = board();
  const queued = await Effect.runPromise(b.engine.file({ brief: 'q', cwd: '/r', queued: true }));
  const plain = await Effect.runPromise(b.engine.file({ brief: 'p', cwd: '/r' }));
  assert.deepEqual(await Effect.runPromise(b.engine.admit([queued, plain])), [queued]);
  assert.deepEqual(await Effect.runPromise(b.engine.admit([queued])), [], 'admitted already');
  assert.equal(b.journal.tasks.get(queued)!.filter((e) => e.kind === 'admitted').length, 1);
  assert.equal(
    b.journal.tasks.get(plain)!.some((e) => e.kind === 'admitted'),
    false,
    'not filed queued',
  );
  await Effect.runPromise(b.engine.tick());
  assert.deepEqual(await Effect.runPromise(b.engine.admit([queued])), [], 'started');
  assert.equal(b.journal.tasks.get(queued)!.filter((e) => e.kind === 'admitted').length, 1);
});

test('admit refuses a task it has no record of, and a settled one — AdmitRefused, and nothing written for any task in the call', async () => {
  const b = board();
  const queued = await Effect.runPromise(b.engine.file({ brief: 'q', cwd: '/r', queued: true }));
  await assert.rejects(
    Effect.runPromise(b.engine.admit([queued, 'nobody'])),
    (e: Error & { _tag?: string }) => e._tag === 'AdmitRefused' && e.message.startsWith('`nobody` is not a task on this board'),
  );
  assert.equal(
    b.journal.tasks.get(queued)!.some((e) => e.kind === 'admitted'),
    false,
    'the known one was not admitted either',
  );

  const settled = await Effect.runPromise(b.engine.file({ brief: 's', cwd: '/r', queued: true }));
  await Effect.runPromise(b.engine.stop(settled));
  await Effect.runPromise(b.engine.tick());
  assert.equal((await Effect.runPromise(b.engine.view(settled))).state.settled, 'stopped');
  await assert.rejects(
    Effect.runPromise(b.engine.admit([settled])),
    (e: Error & { _tag?: string }) => e._tag === 'AdmitRefused' && /^`[^`]+` has settled \(stopped\)/.test(e.message),
  );
});

test('`file` refuses a `queued` that is not true or false, and journals nothing', async () => {
  const b = board();
  for (const queued of ['yes', 1, null]) {
    await assert.rejects(
      Effect.runPromise(b.engine.file({ brief: 'b', cwd: '/r', queued } as never)),
      (e: Error & { _tag?: string }) => e._tag === 'FileRefused' && /^`queued: .*` is not a yes or a no/.test(e.message),
      String(queued),
    );
  }
  assert.equal(b.journal.tasks.size, 0);
});

test('a tick observes each harness once, whatever it reports, and admit observes none — the word costs no look at a harness', async () => {
  const b = board();
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await Effect.runPromise(b.engine.file({ brief: `t${i}`, cwd: '/r', queued: true })));
  b.observes.n = 0;
  const r = await Effect.runPromise(b.engine.tick());
  assert.equal(b.observes.n, 1, 'one observation for the pass and its report');
  assert.equal(r.views.length, 4);
  b.observes.n = 0;
  const reads = b.reads.n;
  await Effect.runPromise(b.engine.admit(ids.slice(0, 2)));
  assert.equal(b.observes.n, 0, 'admit asks no harness');
  assert.equal(b.reads.n - reads, 2, 'and reads each task it is handed once');
  b.observes.n = 0;
  await Effect.runPromise(b.engine.tick());
  assert.equal(b.observes.n, 1);
  assert.equal(b.sessions.size, 2);
});

test('admissionOf reads the record alone: a state is a plain fold, and it reads nothing else', () => {
  const s: State = fold(TASK, [filed({ queued: true })]);
  assert.equal(admissionOf(structuredClone(s)), 'queued');
});
