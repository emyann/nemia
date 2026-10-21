/**
 * A `claude -p` job followed live (`RunnerOps.follow`, `followOf`): its run file, the stdout its worker keeps whole and its
 * transcript written by the test as the worker and Claude Code write them, and what a follower is handed read back in order.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, Stream } from 'effect';
import { detachedOps } from '../src/harness/detached/detached.ts';
import { claudeCodeOps, claudeJob } from '../src/harness/claude/code.ts';
import type { RunnerError } from '../src/harness/error.ts';
import { claudeTranscriptEvents } from '../src/harness/claude/transcript.ts';
import type { Followed } from '../src/harness/seam.ts';
import { scratch } from './scratch.ts';
import { bell, until, WAITED } from '../src/waits/index.ts';

const line = (o: object) => `${JSON.stringify(o)}\n`;
const event = (e: object) => line({ type: 'stream_event', event: e, session_id: 'sid-1' });
const delta = (index: number, text: string) => event({ type: 'content_block_delta', index, delta: { type: 'text_delta', text } });
const said = (uuid: string, text: string) => ({
  type: 'assistant',
  uuid,
  timestamp: '2026-10-07T12:00:00.000Z',
  message: { id: 'msg_1', role: 'assistant', content: [{ type: 'text', text }] },
});

/** A job `name` as its worker leaves it in a store of its own, in `state`, its stdout `out`, and the reader of its transcript `file`. */
const job = (name: string, out: string, state = 'working') => {
  const dir = scratch('ae-follow-');
  const runs = path.join(dir, 'runs', 'claude');
  fs.mkdirSync(runs, { recursive: true });
  const base = path.join(runs, name.replace(/[^a-zA-Z0-9]+/g, '_'));
  const file = path.join(dir, 'sid-1.jsonl');
  const setState = (s: string) =>
    fs.writeFileSync(
      `${base}.json`,
      JSON.stringify({ name, state: s, pid: 999999, nativeId: 'sid-1', logFile: `${base}.log`, heartbeatAt: new Date().toISOString() }),
    );
  setState(state);
  fs.writeFileSync(`${base}.stdout`, out);
  const ops = detachedOps({ ...claudeJob, transcript: { file: () => file, events: claudeTranscriptEvents } }, dir);
  return {
    ops,
    setState,
    stdout: (s: string) => fs.appendFileSync(`${base}.stdout`, s),
    transcript: (o: object) => fs.appendFileSync(file, line(o)),
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

const OPENED = line({ type: 'system', subtype: 'init', session_id: 'sid-1' }) + event({ type: 'message_start', message: { id: 'msg_1' } });

test(
  'a followed job says its state, the text so far, then each piece once and in order though its run file is rewritten between them, each whole event once, and ends when it settles',
  WAITED,
  async (t) => {
    const j = job('ae/f1/1', OPENED + event({ type: 'content_block_start', index: 0 }) + delta(0, 'Riv'));
    j.transcript({ type: 'user', uuid: 'u-1', timestamp: '2026-10-07T11:59:59.000Z', message: { role: 'user', content: 'Say it.' } });
    const got: Followed[] = [];
    const ended = follow(j.ops, 'ae/f1/1', got);
    await until(
      t,
      () => got.length >= 2,
      () => `the state and the text so far: ${JSON.stringify(got)}`,
      { bell: rung },
    );
    j.stdout(delta(0, 'ers'));
    j.setState('working');
    j.stdout(delta(0, ' run.') + event({ type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 's' } }));
    await until(
      t,
      () => got.length >= 4,
      () => `each piece: ${JSON.stringify(got)}`,
      { bell: rung },
    );
    j.stdout(line(said('a-1', 'Rivers run.')) + event({ type: 'content_block_stop', index: 0 }));
    j.transcript(said('a-1', 'Rivers run.'));
    await until(
      t,
      () => got.some((m) => m.kind === 'events'),
      () => `the whole message: ${JSON.stringify(got)}`,
      { bell: rung },
    );
    j.setState('done');
    assert.ok(Exit.isSuccess(await ended), 'ends once the job settles');
    const events = got.find((m) => m.kind === 'events');
    assert.deepEqual(
      got.map((m) => (m.kind === 'events' ? { kind: 'events', ids: m.events.map((e) => e.id) } : m)),
      [
        { kind: 'state', state: 'working' },
        { kind: 'partial', key: 'msg_1:0', text: 'Riv', append: false, last: false },
        { kind: 'partial', key: 'msg_1:0', text: 'ers', append: true, last: false },
        { kind: 'partial', key: 'msg_1:0', text: ' run.', append: true, last: false },
        { kind: 'partial', key: 'msg_1:0', text: '', append: true, last: true },
        { kind: 'events', ids: ['a-1:0'] },
        { kind: 'state', state: 'completed' },
      ],
      'the prompt written before the follow is not said: a reader of the transcript reads it',
    );
    assert.equal(events?.kind === 'events' && events.events[0]?.text, 'Rivers run.');
  },
);

test('a job followed once it has settled says its state alone, and ends', async () => {
  const j = job('ae/f3/1', OPENED + delta(0, 'half'), 'done');
  const got: Followed[] = [];
  assert.ok(Exit.isSuccess(await follow(j.ops, 'ae/f3/1', got)));
  assert.deepEqual(got.slice(0, 1), [{ kind: 'state', state: 'completed' }]);
});

test('REFUSED: a job whose stdout says a piece of text under no number fails the follow, in words naming the line and the fix', async () => {
  const j = job('ae/f2/1', OPENED + event({ type: 'content_block_delta', index: 'one', delta: { type: 'text_delta', text: 'x' } }), 'done');
  const exit = await follow(j.ops, 'ae/f2/1', []);
  assert.ok(Exit.isFailure(exit));
  const message = (Cause.squash(exit.cause) as Error).message;
  assert.match(
    message,
    /^claude: `ae\/f2\/1`'s output cannot be followed: line 3 of the session's output is a `stream_event` line whose `event/,
  );
  assert.match(message, /run a Claude Code whose output this runtime reads/);
});

test('REFUSED: a name with no run is not followed', async () => {
  const j = job('ae/f4/1', '');
  const exit = await follow(j.ops, 'ae/f4/2', []);
  assert.ok(Exit.isFailure(exit));
  assert.equal((Cause.squash(exit.cause) as Error).message, 'claude: no session `ae/f4/2` is there to follow: there is no run of it.');
});

test("a name under the engine's that no job's run file answers is followed as a background session, from `claude agents`", async () => {
  const bin = scratch('ae-follow-bin-');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\n[ "$1" = agents ] && echo '[]'\n`, { mode: 0o755 });
  const prev = process.env.PATH;
  process.env.PATH = `${bin}:${prev}`;
  try {
    const exit = await Effect.runPromiseExit(Stream.runDrain(claudeCodeOps({ root: scratch('ae-follow-') }).follow!('ae/f5/1')));
    assert.ok(Exit.isFailure(exit));
    const err = Cause.squash(exit.cause) as RunnerError;
    assert.deepEqual([err.verb, err.refused], ['follow', undefined], 'no refusal to stream: the name is wrong');
    assert.equal(err.message, "claude: no session `ae/f5/1` is there to follow: neither a job's run file nor `claude agents` lists it.");
  } finally {
    process.env.PATH = prev;
  }
});
