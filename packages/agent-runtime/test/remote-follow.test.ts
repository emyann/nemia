/**
 * A remote A2A agent's session followed live (`a2a/remote-follow.ts`), against the SDK's own server over HTTP (`remote-server.ts`):
 * through the `Engine` at shipped defaults, each moment the agent's own stream carries handed to the follower once and in order, and
 * the transcript read under the same ids; and through the remote harness's ops with its bounds made short, what a stream that drops,
 * fails or says nothing comes to. An agent whose card does not say it streams is followed by reading its Task whole, as is one whose
 * stream keeps dropping; a send in doubt refuses the follow.
 */
import { afterEach, test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Exit, Stream } from 'effect';
import { Engine as EngineService, type EngineShape, type TaskSpec } from '../src/index.ts';
import { remoteOps, SEND_MS, type RemoteOptions } from '../src/a2a/remote.ts';
import { RESUBSCRIBES } from '../src/a2a/remote-follow.ts';
import type { Followed, RunnerError } from '../src/harness/seam.ts';
import { bearer, remoteServer, type Binding, type RemoteServer, type ServerOptions } from './remote-server.ts';
import { scratch } from './scratch.ts';
import { builtEngine } from './engine.ts';
import { bell, until, WAITED } from './waits.ts';
import { elapsedMs } from '../src/core/clock.ts';
import { instantNow } from '../src/core/engine/now.ts';

/** The two bindings a remote agent is followed on: a subscription is `SubscribeToTask` over either. */
const BINDINGS: Binding[] = ['JSONRPC', 'HTTP+JSON'];

const servers: RemoteServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

const serve = async (o: ServerOptions = {}) => {
  const s = await remoteServer({ streaming: true, script: () => [{ state: 'working' }], ...o });
  servers.push(s);
  return s;
};

const task = (o: Partial<TaskSpec> = {}): TaskSpec => ({
  brief: 'paint the fence',
  cwd: '/nowhere/in/particular',
  harness: 'remote',
  closeoutSchema: { type: 'object' },
  ...o,
});

/** Rung on each moment a follower is handed. */
const rung = bell();

/** `stream` run, each moment pushed to `got` as it comes, ringing `rung`; resolves with the stream's exit once it ends. */
const drained = (stream: Stream.Stream<Followed, RunnerError>, got: Followed[]) =>
  Effect.runPromiseExit(
    Stream.runForEach(stream, (m) =>
      Effect.sync(() => {
        got.push(m);
        rung.ring();
      }),
    ),
  );

/** Each moment as a line a reader can compare: its kind, then what it carries; an event by its role and text, its id aside. */
const shown = (ms: readonly Followed[]): string[] =>
  ms.map((m) =>
    m.kind === 'state'
      ? `state ${m.state}`
      : m.kind === 'partial'
        ? `partial ${m.key} ${JSON.stringify(m.text)}${m.append ? ' +' : ''}${m.last ? ' last' : ''}`
        : `events ${m.events.map((e) => `${e.role} ${JSON.stringify(e.text)}`).join(', ')}`,
  );
const ids = (ms: readonly Followed[]) => ms.flatMap((m) => (m.kind === 'events' ? m.events.map((e) => e.id) : []));
const failure = (exit: Exit.Exit<void, RunnerError>) => {
  assert.ok(Exit.isFailure(exit), 'the follow failed');
  return Cause.squash(exit.cause) as RunnerError;
};

/** Waits until `got` holds `n` moments. */
const holds = (t: TestContext, got: readonly Followed[], n: number) =>
  until(
    t,
    () => got.length >= n,
    () => `${n} moments: ${JSON.stringify(shown(got))}`,
    { bell: rung },
  );

/** The engine over the agent `s`, a task filed on it and ticked until its session runs; its id and the Task the agent made. */
const runningOn = async (t: TestContext, s: RemoteServer) => {
  const e = builtEngine(EngineService.layer({ root: scratch('ae-remote-follow-'), harnesses: { remote: { url: s.url } } }));
  const id = await Effect.runPromise(e.file(task()));
  await until(
    t,
    async () => {
      await Effect.runPromise(e.tick());
      return (await Effect.runPromise(e.view(id))).phase.startsWith('running');
    },
    'the session running',
    { everyMs: 20 },
  );
  return { e, id, taskId: s.tasks()[0] };
};

const followed = async (e: EngineShape, id: string) => {
  const stream = await Effect.runPromise(e.follow(id));
  assert.ok(stream, 'an attempt to follow');
  return stream;
};

/** A test's name, said over JSON-RPC as it always was, and with the binding beside it over another. */
const over = (name: string, binding: Binding) => (binding === 'JSONRPC' ? name : `${name}, over ${binding}`);

/** Whether every subscription to the agent `s` went on `binding`: its JSON-RPC route, or REST's `:subscribe`. */
const subscribedOn = (s: RemoteServer, binding: Binding) => {
  const asked = s.paths.filter((p) => (binding === 'JSONRPC' ? p.endsWith('/a2a/jsonrpc') : p.includes(':subscribe')));
  return binding === 'JSONRPC' ? asked.length > 0 && !s.paths.some((p) => p.includes('/a2a/rest')) : asked.length === s.counts.resubscribe;
};

for (const binding of BINDINGS)
  test(
    over(
      "an agent that streams: its own stream is relayed through the engine's follow, each moment once and in order, and the transcript holds each event under its id",
      binding,
    ),
    WAITED,
    async (t) => {
      const s = await serve({ bindings: [binding] });
      const { e, id, taskId } = await runningOn(t, s);
      const got: Followed[] = [];
      const ended = drained(await followed(e, id), got);
      await holds(t, got, 1);
      s.move(
        taskId,
        { piece: { id: 'a-1', text: 'Hel' } },
        { piece: { id: 'a-1', text: 'lo', append: true, last: true } },
        { state: 'working', words: 'wrote it' },
        { state: 'completed', words: 'done' },
      );
      assert.ok(Exit.isSuccess(await ended), 'the follow ends once the session is over');
      assert.deepEqual(shown(got), [
        'state working',
        'partial artifact:a-1 "Hel"',
        'partial artifact:a-1 "lo" + last',
        'events assistant "Hello"',
        'events assistant "wrote it"',
        'events assistant "done"',
        'state completed',
      ]);
      assert.equal(s.counts.resubscribe, 1, 'one subscription, never dropped');
      assert.ok(subscribedOn(s, binding), `subscribed on ${binding}: ${s.paths.join(', ')}`);
      const read = await Effect.runPromise(e.transcript(id));
      assert.deepEqual(
        read.events.map((ev) => [ev.role, ev.text]),
        [
          ['user', read.events[0].text],
          ['assistant', 'wrote it'],
          ['assistant', 'done'],
          ['assistant', 'Hello'],
        ],
      );
      assert.deepEqual(new Set(read.events.slice(1).map((ev) => ev.id)), new Set(ids(got)), 'what was followed is read under the same ids');
      assert.deepEqual((await Effect.runPromise(e.transcript(id, read.cursor))).events, [], 'nothing after the cursor the read gave');
    },
  );

test(
  'an agent whose card does not say it streams is not subscribed to, nor waited on as a stream that drops: its Task is read whole again and again, each event given once',
  WAITED,
  async (t) => {
    const s = await serve({ streaming: false });
    const ops = await opsOn(s, 'ae/unstreamed/1', { readEveryMs: 10, resubscribeMs: 600_000 });
    const taskId = s.tasks()[0];
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/unstreamed/1'), got);
    await holds(t, got, 1);
    s.move(taskId, { state: 'working', words: 'reading' });
    await holds(t, got, 2);
    s.move(taskId, { state: 'completed', words: 'done' });
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit), `followed to its end: ${Exit.isFailure(exit) ? failure(exit).message : ''}`);
    assert.deepEqual(shown(got), ['state working', 'events assistant "reading"', 'events assistant "done"', 'state completed']);
    assert.equal(s.counts.resubscribe, undefined, 'never subscribed to');
    assert.ok((s.counts.getTask ?? 0) >= 3, 'read whole, again and again');
    assert.deepEqual(ids(got), [...new Set(ids(got))], 'each event once');
  },
);

test(
  `REFUSED: a Task that cannot be read ${RESUBSCRIBES + 1} times in a row, where the agent does not stream, says its session cannot be followed`,
  WAITED,
  async () => {
    const s = await serve({ streaming: false });
    const ops = await opsOn(s, 'ae/unread/1', { readEveryMs: 1 }, 100);
    s.hanging.a2a = true;
    const err = failure(await drained(ops.follow!('ae/unread/1'), []));
    assert.equal(err.refused, true);
    assert.equal(
      err.message,
      `the \`remote\` agent's Task \`${s.tasks()[0]}\` could not be read ${RESUBSCRIBES + 1} times in a row (${s.url}/a2a/jsonrpc did not answer within 0.1 s): its session cannot be followed live, and a read of its transcript gives what is new.`,
    );
  },
);

test(
  'a stream cut mid-turn is subscribed to again, and the Task read whole gives what the cut missed: no event lost, none given twice',
  WAITED,
  async (t) => {
    const s = await serve();
    const { e, id, taskId } = await runningOn(t, s);
    const got: Followed[] = [];
    const ended = drained(await followed(e, id), got);
    await holds(t, got, 1);
    s.move(taskId, { piece: { id: 'a-1', text: 'He' } });
    await holds(t, got, 2);
    assert.equal(s.cut(), 1, 'the one subscription cut');
    s.move(taskId, { state: 'working', words: 'reading' });
    await holds(t, got, 3);
    await until(t, () => s.live() === 1, 'a subscription again', { everyMs: 20 });
    s.move(taskId, { piece: { id: 'a-1', text: 'llo', append: true, last: true } }, { state: 'completed' });
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(shown(got), [
      'state working',
      'partial artifact:a-1 "He"',
      'events assistant "reading"',
      'partial artifact:a-1 "llo" + last',
      'events assistant "Hello"',
      'state completed',
    ]);
    assert.equal(s.counts.resubscribe, 2, 'subscribed again once');
    assert.deepEqual(ids(got), [...new Set(ids(got))], 'each event once');
  },
);

/**
 * The remote harness's ops on `s`, its bounds made short, and a session `name` spawned on it. The agent is given its card, read
 * once here with no bound, so no read of it is held to `requestMs`; the spawn waits for the send's answer unless `o` says otherwise.
 */
const opsOn = async (s: RemoteServer, name: string, o: RemoteOptions = {}, requestMs?: number) => {
  const card = (await (await fetch(`${s.url}/.well-known/agent-card.json`)).json()) as Record<string, unknown>;
  const ops = remoteOps('remote', { card }, scratch('ae-remote-follow-'), undefined, requestMs, {
    resubscribeMs: 1,
    spawnWaitMs: SEND_MS,
    ...o,
  });
  await Effect.runPromise(ops.spawn({ name, brief: 'paint the fence', cwd: '/w' }));
  return ops;
};

test(
  `a stream refused ${RESUBSCRIBES} times again in a row is left: the Task is read whole every so often instead, to its end`,
  WAITED,
  async (t) => {
    const s = await serve();
    const ops = await opsOn(s, 'ae/drops/1', { readEveryMs: 10 });
    const taskId = s.tasks()[0];
    s.subscriptions.refuse = true;
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/drops/1'), got);
    await until(t, () => s.counts.resubscribe === RESUBSCRIBES + 1, 'every subscription refused', { everyMs: 20 });
    s.move(taskId, { state: 'working', words: 'reading' });
    await holds(t, got, 2);
    s.move(taskId, { state: 'completed', words: 'done' });
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit), `followed to its end: ${Exit.isFailure(exit) ? failure(exit).message : ''}`);
    assert.equal(s.counts.resubscribe, RESUBSCRIBES + 1, 'the first subscription, then each again, and none after');
    assert.deepEqual(shown(got), ['state working', 'events assistant "reading"', 'events assistant "done"', 'state completed']);
    assert.deepEqual(ids(got), [...new Set(ids(got))], 'each event once');
  },
);

test(
  `a stream cut ${RESUBSCRIBES + 1} times, each subscription giving something new before its cut, is followed to its end: only drops in a row count`,
  WAITED,
  async (t) => {
    const s = await serve();
    const ops = await opsOn(s, 'ae/cuts/1');
    const taskId = s.tasks()[0];
    const got: Followed[] = [];
    let over: Exit.Exit<void, RunnerError> | undefined;
    const ended = drained(ops.follow!('ae/cuts/1'), got).then((exit) => (over = exit));
    const subscribed = async (n: number) => {
      await until(t, () => over !== undefined || (s.counts.resubscribe === n && s.live() === 1), `subscription ${n}`, { everyMs: 20 });
      assert.equal(over, undefined, `the follow went on to subscription ${n}: ${over && failure(over).message}`);
    };
    for (let n = 1; n <= RESUBSCRIBES + 1; n++) {
      await subscribed(n);
      s.move(taskId, { state: 'working', words: `said before cut ${n}` });
      await holds(t, got, n + 1);
      assert.equal(s.cut(), 1, `cut ${n}`);
    }
    await subscribed(RESUBSCRIBES + 2);
    s.move(taskId, { state: 'completed', words: 'done' });
    assert.ok(Exit.isSuccess(await ended), 'never refused: each drop was the first in a row');
    assert.equal(shown(got).at(-1), 'state completed');
    assert.deepEqual(ids(got), [...new Set(ids(got))], 'each event once');
  },
);

test(
  'a stream cut as its Task ends is read whole, which gives the end the cut missed, and is not subscribed to again',
  WAITED,
  async (t) => {
    const s = await serve();
    const ops = await opsOn(s, 'ae/ends/1', { resubscribeMs: 200 });
    const taskId = s.tasks()[0];
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/ends/1'), got);
    await holds(t, got, 1);
    s.subscriptions.refuse = true;
    assert.equal(s.cut(), 1, 'the one subscription cut');
    s.move(taskId, { state: 'completed', words: 'done' });
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit), `the end read whole: ${Exit.isFailure(exit) ? failure(exit).message : ''}`);
    assert.deepEqual(shown(got), ['state working', 'events assistant "done"', 'state completed']);
    assert.equal(s.counts.resubscribe, 1, 'a Task that has ended is not subscribed to');
  },
);

test(
  'a stream that says nothing is read whole after the quiet bound and subscribed to again: what it kept back is given',
  WAITED,
  async (t) => {
    const s = await serve();
    const ops = await opsOn(s, 'ae/quiet/1', { quietMs: 100 });
    s.subscriptions.mute = true;
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/quiet/1'), got);
    await holds(t, got, 1);
    s.move(s.tasks()[0], { state: 'working', words: 'reading' });
    await holds(t, got, 2);
    s.move(s.tasks()[0], { state: 'completed', words: 'done' });
    assert.ok(Exit.isSuccess(await ended), 'silence is no drop: the follow ends as the session does');
    assert.deepEqual(shown(got), ['state working', 'events assistant "reading"', 'events assistant "done"', 'state completed']);
    assert.ok((s.counts.resubscribe ?? 0) >= 2, 'subscribed again after each silence');
  },
);

test('a session that has ended says its state alone, and ends', WAITED, async () => {
  const s = await serve({ script: () => [{ state: 'completed', words: 'done' }] });
  const ops = await opsOn(s, 'ae/ended/1');
  const got: Followed[] = [];
  assert.ok(Exit.isSuccess(await drained(ops.follow!('ae/ended/1'), got)));
  assert.deepEqual(shown(got), ['state completed']);
});

test(
  'a session whose message is still being sent is `submitted`, then followed from its Task, its first words given',
  WAITED,
  async (t) => {
    let open: () => void = () => {};
    const shut = new Promise<void>((resolve) => (open = resolve));
    const s = await serve({ script: (turn) => (turn.turn === 1 ? [{ until: shut, state: 'working' }] : []) });
    const ops = await opsOn(s, 'ae/sending/1', { spawnWaitMs: 10 });
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/sending/1'), got);
    await holds(t, got, 1);
    assert.deepEqual(shown(got), ['state submitted']);
    open();
    await holds(t, got, 3);
    s.move(s.tasks()[0], { state: 'completed' });
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(shown(got), ['state submitted', 'events user "paint the fence"', 'state working', 'state completed']);
  },
);

test(
  "a session still being sent that the agent answers with a Message is `submitted`, then given the reply under its transcript's id, then its state; nothing is subscribed to",
  WAITED,
  async (t) => {
    let open: () => void = () => {};
    const shut = new Promise<void>((resolve) => (open = resolve));
    const s = await serve({ script: (turn) => (turn.turn === 1 ? [{ until: shut, reply: 'It is right.' }] : []) });
    const ops = await opsOn(s, 'ae/reply/1', { spawnWaitMs: 10 });
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/reply/1'), got);
    await holds(t, got, 1);
    open();
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit), `the follow ends with the reply: ${Exit.isFailure(exit) ? failure(exit).message : ''}`);
    assert.equal(s.replies(), 1, 'the agent answered with a Message');
    assert.deepEqual(shown(got), ['state submitted', 'events assistant "It is right."', 'state completed']);
    assert.equal(s.counts.resubscribe, undefined, 'no Task, so nothing subscribed to');
    const read = await Effect.runPromise(ops.transcriptOf!('ae/reply/1'));
    assert.ok(read);
    assert.deepEqual(ids(got), ids([{ kind: 'events', ...read }]), 'the reply followed is the one read, under the same id');
    assert.deepEqual(got[1].kind === 'events' && got[1].cursor, read.cursor, 'and a reader after it reads nothing again');
  },
);

test(
  'a session still being sent whose send the agent refuses is `submitted`, then `rejected`; nothing is subscribed to',
  WAITED,
  async (t) => {
    const s = await serve({ security: bearer('right'), slowMs: 300 });
    const ops = remoteOps('remote', { url: s.url }, scratch('ae-remote-follow-'), () => 'wrong', undefined, {
      spawnWaitMs: 10,
      resubscribeMs: 1,
    });
    await Effect.runPromise(ops.spawn({ name: 'ae/refused/1', brief: 'paint the fence', cwd: '/w' }));
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/refused/1'), got);
    await holds(t, got, 1);
    const exit = await ended;
    assert.ok(Exit.isSuccess(exit), `the follow ends with the refusal: ${Exit.isFailure(exit) ? failure(exit).message : ''}`);
    assert.deepEqual(shown(got), ['state submitted', 'state rejected']);
    assert.equal(s.counts.resubscribe, undefined, 'no Task, so nothing subscribed to');
  },
);

test(
  'REFUSED: a session still being sent whose send falls into doubt is `submitted`, then refused: there is no Task to follow',
  WAITED,
  async (t) => {
    const s = await serve({ slowMs: 300 });
    const ops = await opsOn(s, 'ae/doubt/1', { spawnWaitMs: 10, sendMs: 50 });
    const got: Followed[] = [];
    const ended = drained(ops.follow!('ae/doubt/1'), got);
    await holds(t, got, 1);
    const err = failure(await ended);
    assert.equal(err.refused, true);
    assert.equal(
      err.message,
      'the send of `ae/doubt/1` to the `remote` agent is in doubt: there is no Task to follow, and `logs` says why.',
    );
    assert.deepEqual(shown(got), ['state submitted']);
    assert.equal(s.counts.resubscribe, undefined, 'no Task, so nothing subscribed to');
  },
);

test(
  'a Task the agent no longer has ends the follow: not read again where it was never subscribed to, and not subscribed to again once read',
  WAITED,
  async (t) => {
    const s = await serve();
    const ops = await opsOn(s, 'ae/forgotten/1');
    s.forgotten.add(s.tasks()[0]);
    const reads = s.counts.getTask ?? 0;
    const none: Followed[] = [];
    assert.ok(Exit.isSuccess(await drained(ops.follow!('ae/forgotten/1'), none)), 'no refusal: nothing is left to follow');
    assert.deepEqual(shown(none), []);
    assert.equal(s.counts.resubscribe, 1, 'subscribed to once');
    assert.equal(s.counts.getTask ?? 0, reads, 'a Task not found is no drop: it is not read whole after');

    const cut = await opsOn(s, 'ae/forgotten/2');
    const got: Followed[] = [];
    const ended = drained(cut.follow!('ae/forgotten/2'), got);
    await holds(t, got, 1);
    s.forgotten.add(s.tasks()[1]);
    assert.equal(s.cut(), 1, 'the one subscription cut');
    assert.ok(Exit.isSuccess(await ended), 'no refusal: the Task read after the cut is gone');
    assert.deepEqual(shown(got), ['state working']);
    assert.equal(s.counts.resubscribe, 2, 'the second Task subscribed to once, never again after the read that found it gone');
    assert.equal(s.counts.getTask ?? 0, reads + 1, 'read once, after the cut');
  },
);

test('REFUSED: no session goes by the name: nothing is subscribed to', WAITED, async () => {
  const s = await serve();
  const ops = await opsOn(s, 'ae/known/1');
  const err = failure(await drained(ops.follow!('ae/other/1'), []));
  assert.equal(err.refused, true);
  assert.equal(err.message, 'no session goes by `ae/other/1` on the `remote` harness: follow it once it is sent.');
  assert.equal(s.counts.resubscribe, undefined);
});

for (const binding of BINDINGS)
  test(
    over('a subscription outlives the request bound: its headers alone are bounded, and one held without them is late', binding),
    WAITED,
    async (t) => {
      const s = await serve({ bindings: [binding] });
      const ops = await opsOn(s, 'ae/long/1', {}, 100);
      const got: Followed[] = [];
      const ended = drained(ops.follow!('ae/long/1'), got);
      await holds(t, got, 1);
      let warm = 0;
      await until(
        t,
        async () => {
          const asked = s.paths.length;
          const had = got.length;
          s.move(s.tasks()[0], { state: 'working', words: `warm ${++warm}` });
          await holds(t, got, had + 1);
          return s.paths.length === asked;
        },
        () => `a moment carried by a subscription already held: ${s.paths.join(', ')}`,
        { everyMs: 20 },
      );
      const mark = s.paths.length;
      const since = instantNow();
      await until(t, () => elapsedMs(since, instantNow()) > 300, 'three request bounds gone by', { everyMs: 20 });
      s.move(s.tasks()[0], { state: 'completed', words: 'done' });
      assert.ok(Exit.isSuccess(await ended));
      assert.deepEqual(s.paths.slice(mark), [], 'the subscription held before the bound carried the end, and nothing was asked after');
      assert.deepEqual(shown(got).slice(-3), [`events assistant "warm ${warm}"`, 'events assistant "done"', 'state completed']);
      assert.equal(shown(got)[0], 'state working');
      assert.deepEqual(ids(got), [...new Set(ids(got))], 'each event once');
      assert.ok(subscribedOn(s, binding), `subscribed on ${binding}: ${s.paths.join(', ')}`);

      const held = await opsOn(s, 'ae/held/1', {}, 100);
      s.hanging.a2a = true;
      const err = failure(await drained(held.follow!('ae/held/1'), []));
      assert.equal(err.refused, true);
      assert.match(
        err.message,
        /could not be read 6 times in a row \(.*did not answer within 0\.1 s\): its session cannot be followed live/,
      );
    },
  );
