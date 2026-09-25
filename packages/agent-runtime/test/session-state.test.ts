/**
 * Sightings speak A2A's TaskState (2026-09-25). Before, a sighting's state was one of five words of the runtime's own —
 * `working`, `blocked`, `done`, `failed`, `stopped` — and each driver handed its harness's words through nearly as they
 * came. Now each driver translates once, at its edge, into A2A's eight names, and the journal keeps its three end words.
 *
 * What holds the change: the lifecycle corpus as it stood before the words changed, translated, decides every case as it
 * did then (`fixtures/decide-corpus.json`, recorded by the commit before the change); the three names that joined —
 * `submitted`, `auth-required`, `rejected` — decide every case as the one they join; each driver's table, word for word,
 * with the words it has no reading of; and a journal written before folds and settles as it did.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import {
  decide, endOf, fold, formerStateOf, isSessionState, nameFor, observe, phaseWordOf, SESSION_STATES,
  type Action, type SessionState, type Sighting,
} from '../src/domain.ts';
import { viewOfState } from '../src/engine.ts';
import { AUTH_WAIT, claudeStateOf } from '../src/runner.ts';
import { detachedStateOf } from '../src/runner-detached.ts';
import { promiseOps } from '../src/runner-promise.ts';
import { createEngine, type PromiseRunner } from '../src/facade.ts';
import { corpusOf, filed, spawned, starting, TASK, type Case } from './lifecycle-corpus.ts';
import { scratch } from './scratch.ts';

type Recorded = { event: string; action: Action };
const RECORDED = JSON.parse(fs.readFileSync(new URL('./fixtures/decide-corpus.json', import.meta.url), 'utf8')) as Record<string, Recorded>;

/** A decision as JSON carries it: the fixture was written so, and a key holding `undefined` is no key there. */
const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as unknown;
const read = (c: Case): Recorded => ({ event: observe(fold(TASK, c.events), c.observed, c.now).type, action: decide(fold(TASK, c.events), c.observed, c.now) });

/** The corpus's sightings as they were written before the words changed, word for word (`lifecycle.test.ts` at f1c7c4f). */
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
};

const translated = (by: (s: FormerSighting) => SessionState | undefined) =>
  Object.fromEntries(Object.entries(FORMER_SIGHTINGS).map(([k, s]) => {
    if (!s) return [k, undefined];
    const state = by(s);
    assert.ok(state, `${k}: a former word with no name`);
    return [k, { ...s, state }];
  })) as Record<string, Omit<Sighting, 'sessionId'> | undefined>;

// ─── the corpus decides as it did ──────────────────────────────────────────

test('the corpus as it stood before the words changed, translated, decides every case as it did then', () => {
  const ways: Array<[string, (s: FormerSighting) => SessionState | undefined]> = [
    ['formerStateOf', (s) => formerStateOf(s.state)],
    // Claude Code's registry said these very words: its runner's table must read them the same.
    ['claudeStateOf', (s) => claudeStateOf(s.state, s.waitingFor)],
  ];
  for (const [way, by] of ways) {
    const cases = corpusOf(translated(by));
    assert.deepEqual(cases.map((c) => c.name).sort(), Object.keys(RECORDED).sort(), `${way}: every recorded case, and no other`);
    assert.equal(cases.length, 1152);
    for (const c of cases) assert.deepEqual(asJson(read(c)), asJson(RECORDED[c.name]), `${way}: ${c.name}`);
  }
});

test('REFUSED: the recorded corpus is not matched by a translation that reads a word wrong', () => {
  // The proof above is only as good as the fixture's grip: `done` read as `canceled`, or `blocked` as `working`, must fail it.
  for (const [word, wrong] of [['done', 'canceled'], ['blocked', 'working'], ['stopped', 'failed'], ['failed', 'completed']] as const) {
    const cases = corpusOf(translated((s) => (s.state === word ? wrong : formerStateOf(s.state))));
    assert.ok(cases.some((c) => JSON.stringify(asJson(read(c))) !== JSON.stringify(asJson(RECORDED[c.name]))), `${word} as ${wrong} changes some decision`);
  }
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

test('the three names that joined decide every case as the one they join: no new event, no new edge', () => {
  // submitted runs as working (SESSION_LIVE, or SESSION_QUIET), auth-required waits as input-required (SESSION_BLOCKED),
  // and rejected ends as failed (SESSION_ENDED, recorded `failed`).
  for (const [joined, as] of [['submitted', 'working'], ['auth-required', 'input-required'], ['rejected', 'failed']] as const) {
    const [mine, theirs] = [corpusIn(joined), corpusIn(as)];
    assert.equal(mine.length, theirs.length);
    mine.forEach((c, i) => assert.deepEqual(read(c), read(theirs[i]!), `${joined} as ${as}: ${c.name}`));
  }
});

test('every end recorded off any sighting is one of the journal\'s three words, and no edge records a wait on a person as an end', () => {
  let ends = 0;
  for (const state of SESSION_STATES) {
    for (const c of corpusIn(state)) {
      const a = decide(fold(TASK, c.events), c.observed, c.now);  // harnessEnd throws on an end with no word: none here
      if (a.do !== 'record-end') continue;
      ends++;
      assert.ok(['done', 'failed', 'stopped'].includes(a.observed), `${state}: ${c.name} recorded ${a.observed}`);
      if (a.reason === 'harness') assert.equal(a.observed, endOf(state), `${state}: ${c.name}`);
    }
  }
  assert.ok(ends > 0);
});

// ─── the tables ─────────────────────────────────────────────────────────────

test('endOf and phaseWordOf: each name\'s journal word and view word, exactly', () => {
  const expected: Record<SessionState, [ReturnType<typeof endOf>, ReturnType<typeof phaseWordOf>]> = {
    submitted: ['done', 'working'],
    working: ['done', 'working'],
    'input-required': [undefined, 'blocked'],
    'auth-required': [undefined, 'blocked'],
    completed: ['done', 'done'],
    failed: ['failed', 'failed'],
    rejected: ['failed', 'failed'],
    canceled: ['stopped', 'stopped'],
  };
  assert.deepEqual(Object.keys(expected).sort(), [...SESSION_STATES].sort());
  for (const state of SESSION_STATES) assert.deepEqual([endOf(state), phaseWordOf(state)], expected[state], state);
});

test('formerStateOf reads the five former words, and nothing else', () => {
  assert.deepEqual(
    ['working', 'blocked', 'done', 'failed', 'stopped'].map(formerStateOf),
    ['working', 'input-required', 'completed', 'failed', 'canceled'],
  );
  for (const word of ['completed', 'canceled', 'submitted', 'idle', 'busy', 'constructor', 'toString', '', undefined, 3, null]) {
    assert.equal(formerStateOf(word), undefined, String(word));
  }
  assert.equal(isSessionState('blocked'), false);
  assert.equal(isSessionState('constructor'), false);
  for (const state of SESSION_STATES) assert.equal(isSessionState(state), true, state);
});

test('Claude Code\'s registry words: each is one name, a blocked session\'s wait says which, and a word it has no reading of is failed', () => {
  const rows: Array<[string, string | undefined, SessionState]> = [
    ['working', undefined, 'working'],
    ['done', undefined, 'completed'],
    ['failed', undefined, 'failed'],
    ['stopped', undefined, 'canceled'],
    ['blocked', undefined, 'input-required'],
    ['blocked', 'permission prompt', 'input-required'],
    ['blocked', 'workspace trust dialog', 'input-required'],
    ['idle', undefined, 'failed'],
    ['completed', undefined, 'failed'],
    ['constructor', undefined, 'failed'],
    ['', undefined, 'failed'],
  ];
  for (const [word, waitingFor, state] of rows) assert.equal(claudeStateOf(word, waitingFor), state, `${word} / ${waitingFor}`);
});

test('AUTH_WAIT: a wait that names signing in is auth-required, and one that only contains the letters is not', () => {
  for (const wait of ['authentication', 'auth', 'AUTH token', 'login', 'log in', 'log-in', 'Sign-in', 'sign in to continue', 'authenticating', 'authenticate']) {
    assert.equal(claudeStateOf('blocked', wait), 'auth-required', wait);
    assert.match(wait, AUTH_WAIT);
  }
  for (const wait of ['permission prompt', 'the author', 'authority check', 'authorize this tool', 'authorization', 'oauth-proxy settings', 'blogin', 'signing', 'logins']) {
    assert.equal(claudeStateOf('blocked', wait), 'input-required', wait);
  }
  // Only a blocked session's wait: a working one that names login is at work.
  assert.equal(claudeStateOf('working', 'login'), 'working');
});

test('the detached worker\'s words on its run file: each is one name, a lease gone is failed, and a word no worker writes is failed', () => {
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
  for (const [state, heartbeatAt, name] of rows) assert.equal(detachedStateOf({ state, heartbeatAt }, now), name, `${state} at ${heartbeatAt}`);
});

// ─── a PromiseRunner ────────────────────────────────────────────────────────

const reporting = (states: Record<string, string>): PromiseRunner => ({
  async spawn() {},
  async observe() { return new Map(Object.entries(states).map(([name, state]) => [name, { sessionId: `s-${name}`, state } as never])); },
  async stop() {},
  async logs() { return ''; },
});

test('a PromiseRunner reports in A2A\'s names, or in the five former words, which are read as their names', async () => {
  const names = Object.fromEntries(SESSION_STATES.map((s) => [s, s]));
  const seen = await Effect.runPromise(promiseOps(reporting(names)).observe);
  for (const s of SESSION_STATES) assert.equal(seen.get(s)?.state, s);
  const former = await Effect.runPromise(promiseOps(reporting({ a: 'working', b: 'blocked', c: 'done', d: 'failed', e: 'stopped' })).observe);
  assert.deepEqual([...former.values()].map((s) => s.state), ['working', 'input-required', 'completed', 'failed', 'canceled']);
});

test('REFUSED: a PromiseRunner that reports a word neither vocabulary has fails the observe, naming the words it takes', async () => {
  for (const word of ['finished', 'idle', 'constructor', '']) {
    const err = await Effect.runPromise(Effect.flip(promiseOps(reporting({ 'ae/t-1/1': 'working', 'ae/t-2/1': word })).observe));
    assert.equal(err._tag, 'RunnerError');
    assert.equal(err.verb, 'observe');
    assert.match(err.message, new RegExp(`session \`ae/t-2/1\` as \`${word}\``));
    assert.match(err.message, /submitted, working, input-required, auth-required, completed, failed, canceled, rejected/);
    assert.match(err.message, /working, blocked, done, failed, stopped/);
  }
});

test('an engine over a PromiseRunner that speaks the former words settles its tasks as it did', async () => {
  const sessions = new Map<string, { sessionId: string; state: string }>();
  const fake: PromiseRunner = {
    async spawn(r) { sessions.set(r.name, { sessionId: `s-${r.name}`, state: 'working' }); },
    async observe() { return new Map(sessions) as never; },
    async stop(id) { for (const [k, s] of sessions) if (s.sessionId === id) sessions.set(k, { ...s, state: 'stopped' }); },
    async logs() { return ''; },
  };
  const engine = createEngine({ root: scratch('ae-state-root-'), harnesses: { fake } });
  const cwd = scratch('ae-state-cwd-');
  const [done, stopped, blocked] = [await engine.file({ brief: 'a', cwd, harness: 'fake' }), await engine.file({ brief: 'b', cwd, harness: 'fake' }), await engine.file({ brief: 'c', cwd, harness: 'fake' })];
  await engine.tick();
  await engine.tick();
  assert.equal((await engine.view(done)).phase, 'running (working)');
  sessions.set(nameFor(done, 1), { sessionId: 's-d', state: 'done' });
  sessions.set(nameFor(blocked, 1), { sessionId: 's-b', state: 'blocked' });
  await engine.stop(stopped);
  for (let i = 0; i < 3; i++) await engine.tick();
  assert.equal((await engine.view(done)).state.settled, 'succeeded');
  assert.equal((await engine.view(stopped)).state.settled, 'stopped');
  assert.equal((await engine.view(blocked)).phase, 'needs-human');
});

// ─── what a view prints ─────────────────────────────────────────────────────

test('a view prints each name in the words views have always printed: A2A\'s names stop at the runtime', () => {
  const inFlight = fold(TASK, [filed(), starting(1), spawned(1)]);
  const expected: Record<SessionState, string> = {
    submitted: 'running (working)',
    working: 'running (working)',
    'input-required': 'needs-human',
    'auth-required': 'needs-human',
    completed: 'running (done)',
    failed: 'running (failed)',
    rejected: 'running (failed)',
    canceled: 'running (stopped)',
  };
  for (const state of SESSION_STATES) {
    const v = viewOfState(inFlight, new Map([[nameFor(TASK, 1), { sessionId: 's', state, busy: true, waitingFor: 'authentication' }]]));
    assert.equal(v.phase, expected[state], state);
    assert.equal(v.waitingFor, v.phase === 'needs-human' ? 'authentication' : undefined, state);
  }
  for (const state of ['submitted', 'working'] as const) {
    assert.equal(viewOfState(inFlight, new Map([[nameFor(TASK, 1), { sessionId: 's', state, busy: false }]])).phase, 'working (quiescent)', state);
  }
});

// ─── a journal written before ───────────────────────────────────────────────

test('a journal written before the words changed folds and settles as it did: its end words are the journal\'s still', async () => {
  const root = scratch('ae-state-old-');
  const cwd = scratch('ae-state-old-cwd-');
  const fake: PromiseRunner = { async spawn() {}, async observe() { return new Map(); }, async stop() {}, async logs() { return ''; } };
  const first = createEngine({ root, harnesses: { fake } });
  const ids = [await first.file({ brief: 'a', cwd, harness: 'fake' }), await first.file({ brief: 'b', cwd, harness: 'fake' }), await first.file({ brief: 'c', cwd, harness: 'fake' })];
  // Each journal's filing as this engine wrote it, then what a runtime before 2026-09-25 went on to write, word for word.
  const file = (id: string) => path.join(root, 'tasks', `${id}.jsonl`);
  const then = (id: string, ...lines: object[]) => fs.appendFileSync(file(id), lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  const at = (s: number) => new Date(Date.parse('2026-09-20T10:00:00Z') + s * 1_000).toISOString();
  const [done, stopped, failed] = ids as [string, string, string];
  then(done, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 },
    { kind: 'ended', at: at(3), attempt: 1, sessionId: 's-1', observed: 'done', reason: 'harness', nativeId: 'native-1', closeout: { outcome: 'done' } });
  then(stopped, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 }, { kind: 'stop-requested', at: at(3) },
    { kind: 'ended', at: at(4), attempt: 1, sessionId: 's-2', observed: 'stopped', reason: 'operator' });
  then(failed, { kind: 'starting', at: at(1), attempt: 1 }, { kind: 'spawned', at: at(2), attempt: 1 },
    { kind: 'ended', at: at(3), attempt: 1, sessionId: 's-3', observed: 'failed', reason: 'harness', exitCode: 1 });
  const before = ids.map((id) => fs.readFileSync(file(id), 'utf8'));

  // A new process reads what the old one wrote.
  const engine = createEngine({ root, harnesses: { fake } });
  await engine.tick();
  const views = await Promise.all(ids.map((id) => engine.view(id)));
  assert.deepEqual(views.map((v) => v.state.settled), ['succeeded', 'stopped', 'failed']);
  assert.deepEqual(views.map((v) => v.state.attempts[0]!.ended), ['done', 'stopped', 'failed'], 'the ends are read in the words they were written in');
  assert.deepEqual(views[0]!.state.attempts[0]!.closeout, { outcome: 'done' });
  ids.forEach((id, i) => {
    const now = fs.readFileSync(file(id), 'utf8');
    assert.ok(now.startsWith(before[i]!), `${id}: nothing written before is rewritten`);
    assert.doesNotMatch(now.slice(before[i]!.length), /"observed"/, `${id}: and no end written again`);
  });
});
