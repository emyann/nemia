/**
 * Sightings speak A2A's TaskState: each driver translates its harness's words once, at its edge, into A2A's eight names, and the
 * journal keeps its three end words. A remote registry entry an older runtime wrote may speak its five former words — `working`,
 * `blocked`, `done`, `failed`, `stopped` — which `formerStateOf` reads as their names; so does this suite's helper `asyncOps`
 * (`test/promise-runner.ts`), for a fake written in them.
 *
 * What holds it:
 *
 * 1. the lifecycle corpus in the former words, translated, decides every case as `fixtures/decide-corpus.json` recorded;
 * 2. the three names with no former word — `submitted`, `auth-required`, `rejected` — decide every case as the one they join;
 * 3. each driver's table, word for word, with the words it has no reading of;
 * 4. what a view prints for each name;
 * 5. a journal a runtime wrote in the former words folds and settles as it did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { decide, fold, nameFor, observe, type Action, type Sighting } from '../src/core/domain.ts';
import { endOf, formerStateOf, isSessionState, SESSION_STATES, type SessionState, type TaskPhase } from '../src/core/session.ts';
import { viewOfState } from '../src/core/engine/engine.ts';
import { detachedStateOf } from '../src/harness/detached/detached.ts';
import { Engine } from '../src/index.ts';
import { at, corpusOf, ended, filed, S, spawned, starting, TASK, type Case } from './lifecycle-corpus.ts';
import { scratch } from './scratch.ts';
import { asyncOps, type AsyncRunner } from './promise-runner.ts';
import { builtEngine } from './engine.ts';

type Recorded = { event: string; action: Action };
const RECORDED = JSON.parse(fs.readFileSync(new URL('./fixtures/decide-corpus.json', import.meta.url), 'utf8')) as Record<string, Recorded>;

/** A decision as JSON carries it: the fixture was written so, and a key holding `undefined` is no key there. */
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
const read = (c: Case): Recorded => ({
  event: observe(fold(TASK, c.events), c.observed, c.now).type,
  action: decide(fold(TASK, c.events), c.observed, c.now),
});

/** The corpus's sightings in the five former words, word for word: the sightings `fixtures/decide-corpus.json` was recorded from. */
type FormerSighting = Omit<Sighting, 'sessionId' | 'state'> & { state: string };
const FORMER_SIGHTINGS: Record<string, FormerSighting | undefined> = {
  unseen: undefined,
  working: { state: 'working', busy: true },
  'working, quiet': { state: 'working', quietMs: 90_000, nativeId: 'native-q' },
  'working, quiet, stated': { state: 'working', quietMs: 90_000, closeout: { payload: { outcome: 'done' }, at: 0 } },
  blocked: { state: 'blocked', waitingFor: 'permission prompt' },
  done: { state: 'done', nativeId: 'native-d', closeout: { payload: { outcome: 'done' }, at: 0 } },
  'done, no statement': { state: 'done' },
  failed: { state: 'failed', exitCode: 1 },
  stopped: { state: 'stopped' },
  'blocked, idle, held': { state: 'blocked', busy: false, held: true },
  'done, held': { state: 'done', busy: false, held: true },
  'working, quiet, held': { state: 'working', quietMs: 90_000, nativeId: 'native-q', held: true },
  'blocked, not held': { state: 'blocked', busy: false, held: false, nativeId: 'native-r' },
};

const translated = (by: (s: FormerSighting) => SessionState | undefined) =>
  Object.fromEntries(
    Object.entries(FORMER_SIGHTINGS).map(([k, s]) => {
      if (!s) return [k, undefined];
      const state = by(s);
      assert.ok(state, `${k}: a former word with no name`);
      return [k, { ...s, state }];
    }),
  ) as Record<string, Omit<Sighting, 'sessionId'> | undefined>;

test('the corpus recorded before the words changed: decided as it was through each translation of the former words, and missed through a wrong one', async (t) => {
  await t.test('the corpus as it stood before the words changed, translated, decides every case as it did then, by `formerStateOf`', () => {
    const ways: Array<[string, (s: FormerSighting) => SessionState | undefined]> = [['formerStateOf', (s) => formerStateOf(s.state)]];
    for (const [way, by] of ways) {
      const cases = corpusOf(translated(by));
      assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(RECORDED).sort(), `${way}: every recorded case, and no other`);
      assert.equal(cases.length, 2132, `${way}: every journal shape, deadline, sighting and time`);
      for (const c of cases) assert.deepEqual(asJson(read(c)), asJson(RECORDED[c.name]), `${way}: ${c.name}`);
    }
  });

  await t.test(
    "REFUSED: the recorded corpus is not matched by a translation that reads a word wrong, so the proof above has the fixture's grip",
    () => {
      for (const [word, wrong] of [
        ['done', 'canceled'],
        ['blocked', 'working'],
        ['stopped', 'failed'],
        ['failed', 'completed'],
      ] as const) {
        const cases = corpusOf(translated((s) => (s.state === word ? wrong : formerStateOf(s.state))));
        assert.ok(
          cases.some((c) => JSON.stringify(asJson(read(c))) !== JSON.stringify(asJson(RECORDED[c.name]))),
          `${word} as ${wrong} changes some decision`,
        );
      }
    },
  );
});

/** Every field a sighting carries beside its state, alone and together: what the equivalences below walk. */
const BESIDE: Record<string, Omit<Sighting, 'sessionId' | 'state'>> = {
  bare: {},
  busy: { busy: true },
  idle: { busy: false },
  quiet: { quietMs: 90_000, nativeId: 'native-q' },
  'quiet, stated': { quietMs: 90_000, closeout: { payload: { outcome: 'done' }, at: 0 } },
  stated: { nativeId: 'native-d', closeout: { payload: { outcome: 'done' }, at: 0 } },
  waiting: { waitingFor: 'authentication' },
  exited: { exitCode: 1, limit: 'budget' },
};
const corpusIn = (state: SessionState) =>
  corpusOf({ unseen: undefined, ...Object.fromEntries(Object.entries(BESIDE).map(([k, b]) => [k, { ...b, state }])) });

test("every name over the corpus: the three that joined decide as the one they join, and every end recorded is one of the journal's three words", async (t) => {
  await t.test(
    'the three names that joined decide every case as the one they join: no new event, no new edge (submitted runs as working, auth-required waits as input-required, rejected ends as failed)',
    () => {
      for (const [joined, as] of [
        ['submitted', 'working'],
        ['auth-required', 'input-required'],
        ['rejected', 'failed'],
      ] as const) {
        const [mine, theirs] = [corpusIn(joined), corpusIn(as)];
        assert.equal(mine.length, theirs.length, `${joined} and ${as}: the same cases`);
        mine.forEach((c, i) => assert.deepEqual(read(c), read(theirs[i]), `${joined} as ${as}: ${c.name}`));
      }
    },
  );

  await t.test(
    "every end recorded off any sighting is one of the journal's three words, and no edge records a wait on a person as an end (decide throws on an end with no word)",
    () => {
      let ends = 0;
      for (const state of SESSION_STATES) {
        for (const c of corpusIn(state)) {
          const a = decide(fold(TASK, c.events), c.observed, c.now);
          if (a.do !== 'record-end') continue;
          ends++;
          assert.ok(['succeeded', 'failed', 'stopped'].includes(a.observed), `${state}: ${c.name} recorded ${a.observed}`);
          if (a.reason === 'harness') assert.equal(a.observed, endOf(state), `${state}: ${c.name}`);
        }
      }
      assert.ok(ends > 0, 'some sighting ends an attempt');
    },
  );
});

test("a session's words, name by name: its journal and view words, the former words read, the detached worker's run file, and what a view prints", async (t) => {
  await t.test('formerStateOf reads the five former words, and nothing else', () => {
    assert.deepEqual(['working', 'blocked', 'done', 'failed', 'stopped'].map(formerStateOf), [
      'working',
      'input-required',
      'completed',
      'failed',
      'canceled',
    ]);
    for (const word of ['completed', 'canceled', 'submitted', 'idle', 'busy', 'constructor', 'toString', '', undefined, 3, null]) {
      assert.equal(formerStateOf(word), undefined, String(word));
    }
    assert.equal(isSessionState('blocked'), false);
    assert.equal(isSessionState('constructor'), false);
    for (const state of SESSION_STATES) assert.equal(isSessionState(state), true, state);
  });

  await t.test(
    "the detached worker's words on its run file: each is one name, a lease gone is failed, and a word no worker writes is failed",
    () => {
      const now = Date.parse('2026-09-25T12:00:00Z');
      const fresh = new Date(now - 1_000).toISOString();
      const stale = new Date(now - 60 * 60_000).toISOString();
      const rows: Array<[string, string, SessionState]> = [
        ['working', fresh, 'working'],
        ['working', stale, 'failed'],
        ['done', fresh, 'completed'],
        ['done', stale, 'completed'],
        ['failed', fresh, 'failed'],
        ['stopped', stale, 'canceled'],
        ['blocked', fresh, 'failed'],
        ['completed', fresh, 'failed'],
        ['constructor', fresh, 'failed'],
        ['toString', fresh, 'failed'],
      ];
      for (const [state, heartbeatAt, name] of rows)
        assert.equal(detachedStateOf({ state, heartbeatAt }, { at: now }), name, `${state} at ${heartbeatAt}`);
    },
  );

  await t.test("a view's phase for each name, and the session's own state beside it while an attempt is in flight", () => {
    const inFlight = fold(TASK, [filed(), starting(1), spawned(1)]);
    const expected: Record<SessionState, TaskPhase> = {
      submitted: 'working',
      working: 'working',
      'input-required': 'needs-human',
      'auth-required': 'needs-human',
      completed: 'ending',
      failed: 'ending',
      rejected: 'ending',
      canceled: 'ending',
    };
    for (const state of SESSION_STATES) {
      const v = viewOfState(inFlight, new Map([[nameFor(TASK, 1), { sessionId: 's', state, busy: true, waitingFor: 'authentication' }]]));
      assert.deepEqual([v.phase, v.session], [expected[state], state], state);
      assert.equal(v.waitingFor, v.phase === 'needs-human' ? 'authentication' : undefined, state);
    }
    for (const state of ['submitted', 'working'] as const) {
      const v = viewOfState(inFlight, new Map([[nameFor(TASK, 1), { sessionId: 's', state, busy: false }]]));
      assert.deepEqual([v.phase, v.session], ['quiescent', state], state);
    }
    const unseen = viewOfState(inFlight, new Map());
    assert.deepEqual([unseen.phase, unseen.session], ['starting', undefined], 'spawned, not yet seen');
    const between = viewOfState(fold(TASK, [filed(), starting(1), spawned(1), ended(1, 'failed', 'lost')]), new Map());
    assert.deepEqual([between.phase, between.session], ['between-attempts', undefined], 'an attempt ended, the task filed');
    const settled = fold(TASK, [
      filed(),
      starting(1),
      spawned(1),
      ended(1, 'succeeded', 'harness'),
      { kind: 'settled', at: at(3 * S), outcome: 'succeeded' },
    ]);
    const done = viewOfState(settled, new Map([[nameFor(TASK, 1), { sessionId: 's', state: 'completed', busy: false }]]));
    assert.deepEqual([done.phase, done.session], ['succeeded', undefined], 'a settled task carries no session');
  });
});

const reporting = (states: Record<string, string>): AsyncRunner => ({
  async spawn() {},
  async observe() {
    return new Map(Object.entries(states).map(([name, state]) => [name, { sessionId: `s-${name}`, state } as never]));
  },
  async stop() {},
  async logs() {
    return '';
  },
});

test("the helper asyncOps: a fake's words read as their names, and a word neither vocabulary has refused", async (t) => {
  await t.test("the helper asyncOps reads a fake's A2A names as they are, and the five former words as their names", async () => {
    const names = Object.fromEntries(SESSION_STATES.map((s) => [s, s]));
    const seen = await Effect.runPromise(asyncOps(reporting(names)).observe);
    for (const s of SESSION_STATES) assert.equal(seen.get(s)?.state, s);
    const former = await Effect.runPromise(
      asyncOps(reporting({ a: 'working', b: 'blocked', c: 'done', d: 'failed', e: 'stopped' })).observe,
    );
    assert.deepEqual(
      [...former.values()].map((s) => s.state),
      ['working', 'input-required', 'completed', 'failed', 'canceled'],
    );
  });

  await t.test(
    'REFUSED: through the helper asyncOps, a fake that reports a word neither vocabulary has fails the observe, naming the words it takes',
    async () => {
      for (const word of ['finished', 'idle', 'constructor', '']) {
        const err = await Effect.runPromise(Effect.flip(asyncOps(reporting({ 'ae/t-1/1': 'working', 'ae/t-2/1': word })).observe));
        assert.equal(err._tag, 'RunnerError');
        assert.equal(err.verb, 'observe');
        assert.match(err.message, new RegExp(`session \`ae/t-2/1\` as \`${word}\``));
        assert.match(err.message, /submitted, working, input-required, auth-required, completed, failed, canceled, rejected/);
        assert.match(err.message, /working, blocked, done, failed, stopped/);
      }
    },
  );
});

test('an engine over the former words: a fake that speaks them, and a journal written in them, settle as they did', async (t) => {
  await t.test('an engine over a fake in the former words, read through the helper asyncOps, settles its tasks as it did', async () => {
    const sessions = new Map<string, { sessionId: string; state: string }>();
    const fake: AsyncRunner = {
      async spawn(r) {
        sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' });
      },
      async observe() {
        return new Map(sessions) as never;
      },
      async stop(id) {
        for (const [k, s] of sessions) if (s.sessionId === id) sessions.set(k, { ...s, state: 'stopped' });
      },
      async logs() {
        return '';
      },
    };
    const engine = builtEngine(Engine.layer({ root: scratch('ae-state-root-'), harnesses: { fake: asyncOps(fake) } }));
    const cwd = scratch('ae-state-cwd-');
    const [done, stopped, blocked] = [
      await Effect.runPromise(engine.file({ brief: 'a', cwd, harness: 'fake' })),
      await Effect.runPromise(engine.file({ brief: 'b', cwd, harness: 'fake' })),
      await Effect.runPromise(engine.file({ brief: 'c', cwd, harness: 'fake' })),
    ];
    await Effect.runPromise(engine.tick());
    await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(done))).phase, 'working');
    sessions.set(nameFor(done, 1), { sessionId: 's-d', state: 'done' });
    sessions.set(nameFor(blocked, 1), { sessionId: 's-b', state: 'blocked' });
    await Effect.runPromise(engine.stop(stopped));
    for (let i = 0; i < 3; i++) await Effect.runPromise(engine.tick());
    assert.equal((await Effect.runPromise(engine.view(done))).state.settled, 'succeeded');
    assert.equal((await Effect.runPromise(engine.view(stopped))).state.settled, 'stopped');
    assert.equal((await Effect.runPromise(engine.view(blocked))).phase, 'needs-human');
  });

  await t.test(
    "a journal written before the words changed folds and settles as it did: its end words are the journal's still (each filing as this engine writes it, then what a runtime in the former words wrote, word for word, read by a new process)",
    async () => {
      const root = scratch('ae-state-old-');
      const cwd = scratch('ae-state-old-cwd-');
      const fake: AsyncRunner = {
        async spawn() {},
        async observe() {
          return new Map();
        },
        async stop() {},
        async logs() {
          return '';
        },
      };
      const first = builtEngine(Engine.layer({ root, harnesses: { fake: asyncOps(fake) } }));
      const ids = [
        await Effect.runPromise(first.file({ brief: 'a', cwd, harness: 'fake' })),
        await Effect.runPromise(first.file({ brief: 'b', cwd, harness: 'fake' })),
        await Effect.runPromise(first.file({ brief: 'c', cwd, harness: 'fake' })),
      ];
      const file = (id: string) => path.join(root, 'tasks', `${id}.jsonl`);
      const then = (id: string, ...lines: object[]) => fs.appendFileSync(file(id), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
      const at = (s: number) => new Date(Date.parse('2026-09-20T10:00:00Z') + s * 1_000).toISOString();
      const [done, stopped, failed] = ids as [string, string, string];
      then(
        done,
        { kind: 'starting', at: at(1), attempt: 1 },
        { kind: 'spawned', at: at(2), attempt: 1 },
        {
          kind: 'ended',
          at: at(3),
          attempt: 1,
          sessionId: 's-1',
          observed: 'done',
          reason: 'harness',
          nativeId: 'native-1',
          closeout: { outcome: 'done' },
        },
      );
      then(
        stopped,
        { kind: 'starting', at: at(1), attempt: 1 },
        { kind: 'spawned', at: at(2), attempt: 1 },
        { kind: 'stop-requested', at: at(3) },
        { kind: 'ended', at: at(4), attempt: 1, sessionId: 's-2', observed: 'stopped', reason: 'operator' },
      );
      then(
        failed,
        { kind: 'starting', at: at(1), attempt: 1 },
        { kind: 'spawned', at: at(2), attempt: 1 },
        { kind: 'ended', at: at(3), attempt: 1, sessionId: 's-3', observed: 'failed', reason: 'harness', exitCode: 1 },
      );
      const before = ids.map((id) => fs.readFileSync(file(id), 'utf8'));

      const engine = builtEngine(Engine.layer({ root, harnesses: { fake: asyncOps(fake) } }));
      await Effect.runPromise(engine.tick());
      const views = await Promise.all(ids.map((id) => Effect.runPromise(engine.view(id))));
      assert.deepEqual(
        views.map((v) => v.state.settled),
        ['succeeded', 'stopped', 'failed'],
        'a new process settles what the old one wrote',
      );
      assert.deepEqual(
        views.map((v) => v.state.attempts[0].ended),
        ['succeeded', 'stopped', 'failed'],
        'the ends are read as written, a former `done` as `succeeded`',
      );
      assert.deepEqual(views[0].state.attempts[0].closeout, { outcome: 'done' });
      ids.forEach((id, i) => {
        const now = fs.readFileSync(file(id), 'utf8');
        assert.ok(now.startsWith(before[i]), `${id}: nothing written before is rewritten`);
        assert.doesNotMatch(now.slice(before[i].length), /"observed"/, `${id}: and no end written again`);
      });
    },
  );
});
