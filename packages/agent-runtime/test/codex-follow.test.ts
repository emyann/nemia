/**
 * A `codex exec --json` session followed live (`RunnerOps.follow`, `followOf`): its run file, the stdout its worker keeps whole and
 * its rollout written by the test as the worker and Codex write them, and what a follower is handed read back in order. Codex
 * prints each message whole, so a follower is handed its state and the rollout's events, never a piece of text.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, Stream } from 'effect';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { codex } from '../src/harness/codex/codex.ts';
import { codexRolloutEvents } from '../src/harness/codex/transcript.ts';
import type { Followed } from '../src/harness/seam.ts';
import type { RunnerError } from '../src/harness/error.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from '../src/waits/index.ts';
import { story } from './checkpoints.ts';

const THREAD = '01a09996-d343-7932-8971-b2f209ba315b';
const line = (o: object) => `${JSON.stringify(o)}\n`;
const STARTED = line({ type: 'thread.started', thread_id: THREAD }) + line({ type: 'turn.started' });
const message = (id: string, text: string) => ({
  id,
  line: line({ type: 'item.completed', item: { id, type: 'agent_message', text } }),
  record: {
    timestamp: '2026-10-07T12:00:00.000Z',
    type: 'event_msg',
    payload: { type: 'item_completed', turn_id: 'turn-1', item: { type: 'AgentMessage', id, content: [{ type: 'Text', text }] } },
  },
});

/** A session `name` as its worker leaves it in a store of its own, in `state`, its stdout `out`, and the reader of its rollout `file`. */
const session = (name: string, out: string, state = 'working', nativeId: string | undefined = THREAD) => {
  const dir = scratch('ae-codex-follow-');
  const runs = path.join(dir, 'runs', 'codex');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const file = path.join(dir, `rollout-${THREAD}.jsonl`);
  const setState = (s: string, named = nativeId) =>
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify({
        name,
        state: s,
        pid: 999999,
        ...(named ? { nativeId: named } : {}),
        logFile: `${base}.log`,
        heartbeatAt: new Date().toISOString(),
      }),
    );
  setState(state);
  fs.writeFileSync(`${base}.stdout`, out);
  const ops = detachedOps({ ...codex, transcript: { file: () => file, events: codexRolloutEvents } }, dir);
  return {
    ops,
    setState,
    stdout: (s: string) => fs.appendFileSync(`${base}.stdout`, s),
    rollout: (o: object) => fs.appendFileSync(file, line(o)),
  };
};

/** Rung on each moment a follower is handed. */
const rung = bell();

/** What `name` is followed as, pushed to `got` as it comes, ringing `rung`; resolves with the stream's exit once it ends. */
const follow = (ops: ReturnType<typeof detachedOps>, name: string, got: Followed[]) =>
  Effect.runPromiseExit(
    Stream.runForEach(ops.follow!(name), (m) =>
      Effect.sync(() => {
        got.push(m);
        rung.ring();
      }),
    ),
  );

/** The moments as their kinds and what each says, an events moment by its events' texts. */
const told = (got: Followed[]) =>
  got.map((m) =>
    m.kind === 'events' ? `events ${m.events.map((e) => e.text).join(' | ')}` : m.kind === 'state' ? `state ${m.state}` : m.kind,
  );

test(
  "a Codex session is followed live: its state, then each of its rollout's messages once and in order as Codex writes them, never a piece of text, and it ends when it settles",
  WAITED,
  async (t) => {
    const s = story(t);
    const first = message('msg_1', 'Reading the note.');
    const second = message('msg_2', 'It is right.');
    const third = message('msg_3', 'Done.');
    const c = session('ae/c1/1', STARTED, 'working', THREAD);
    const got: Followed[] = [];
    let ended: ReturnType<typeof follow>;
    await s.test('the codex harness follows a session live: its spec keeps its streams, reads its stdout and its rollout', () => {
      assert.equal(typeof c.ops.follow, 'function');
    });
    await s.test('a followed Codex session says its state, and waits for its rollout', async () => {
      c.rollout(first.record);
      ended = follow(c.ops, 'ae/c1/1', got);
      await until(
        t,
        () => got.length >= 1,
        () => `the state: ${JSON.stringify(got)}`,
        { bell: rung },
      );
      assert.deepEqual(told(got), ['state working']);
    });
    await s.test('each message it writes is said once and in order; what was written before the follow is not', async () => {
      c.stdout(first.line);
      c.setState('working', THREAD);
      c.stdout(second.line);
      c.rollout(second.record);
      await until(
        t,
        () => got.some((m) => m.kind === 'events'),
        () => `the second message: ${JSON.stringify(got)}`,
        { bell: rung },
      );
      c.rollout(third.record);
      c.stdout(third.line + line({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 3 } }));
      await until(
        t,
        () => told(got).includes('events Done.'),
        () => `the third message: ${JSON.stringify(got)}`,
        { bell: rung },
      );
      assert.deepEqual(told(got), ['state working', 'events It is right.', 'events Done.']);
    });
    await s.test('it ends when the session settles, having said no piece of text', async () => {
      c.setState('done', THREAD);
      assert.ok(Exit.isSuccess(await ended), 'ends once the session settles');
      assert.deepEqual(
        told(got),
        ['state working', 'events It is right.', 'events Done.', 'state completed'],
        'the message written before the follow is not said: a reader of the rollout reads it; no piece of text is said',
      );
    });
  },
);

test(
  'a Codex session that has not named its thread yet says its state and waits, reads its rollout from the start once it names it, and ends when it settles',
  WAITED,
  async (t) => {
    const s = story(t);
    const first = message('msg_1', 'Reading the note.');
    const c = session('ae/c2/1', STARTED, 'working', '');
    c.rollout(first.record);
    const got: Followed[] = [];
    const ended = follow(c.ops, 'ae/c2/1', got);
    await s.test('unnamed, it says its state and nothing of a rollout it cannot know is its own', async () => {
      await until(
        t,
        () => got.length >= 1,
        () => `the state: ${JSON.stringify(got)}`,
        { bell: rung },
      );
      c.stdout(first.line);
      c.stdout(line({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } }));
      assert.deepEqual(told(got), ['state working']);
    });
    await s.test('once it names its thread, its rollout is read from the start', async () => {
      c.setState('working', THREAD);
      await until(
        t,
        () => got.some((m) => m.kind === 'events'),
        () => `the rollout: ${JSON.stringify(got)}`,
        { bell: rung },
      );
      assert.deepEqual(told(got), ['state working', 'events Reading the note.']);
    });
    await s.test('it ends when the session settles', async () => {
      c.setState('done', THREAD);
      assert.ok(Exit.isSuccess(await ended));
      assert.deepEqual(told(got), ['state working', 'events Reading the note.', 'state completed']);
    });
  },
);

test('a Codex session that settles having never named its thread is followed to its end: its state, then completed', WAITED, async (t) => {
  const c = session('ae/c4/1', STARTED, 'working', '');
  const got: Followed[] = [];
  const ended = follow(c.ops, 'ae/c4/1', got);
  await until(
    t,
    () => got.length >= 1,
    () => `the state: ${JSON.stringify(got)}`,
    { bell: rung },
  );
  c.setState('done');
  assert.ok(Exit.isSuccess(await ended));
  assert.deepEqual(told(got), ['state working', 'state completed']);
});

test('REFUSED: a Codex session whose stdout says a line that does not decode fails the follow, naming the line, its field and the schema', async () => {
  const s = session('ae/c3/1', STARTED + line({ type: 'turn.completed', usage: { input_tokens: 'many' } }), 'done');
  const exit = await follow(s.ops, 'ae/c3/1', []);
  assert.ok(Exit.isFailure(exit));
  const err = Cause.squash(exit.cause) as RunnerError;
  assert.equal(err._tag, 'RunnerError');
  assert.deepEqual([err.verb, err.refused], ['follow', undefined]);
  assert.match(err.message, /^codex: `ae\/c3\/1`'s output cannot be followed: /);
  for (const name of ['line 3', '`turn.completed`', '`usage', '`CodexEventSchema`'])
    assert.ok(err.message.includes(name), `${name}: ${err.message}`);
});
