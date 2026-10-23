/**
 * A step followed live over HTTP (`GET …/transcript/stream`) on the app's registry (`Followings`): over the api's own engine with its
 * `view`, `transcript` and `follow` the test's, whose attempts' moments the test pushes as they come, and the feed's lines written on
 * the app's runtime, which wake the following between attempts. What it proves: followers of one step share one upstream, a late
 * joiner is handed the message so far, a held task's next turn is followed on the same stream, and a try whose session is not pushed
 * ends it.
 */
import { root } from '../../test/harness.ts';
import { test, type TestContext } from 'node:test';
import { story } from '../../test/checkpoints.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Layer, Logger, Metric, Queue, Stream } from 'effect';
import { emitFeed, engine } from 'agent-orchestrator';
import { appOf, liveOf } from '../app.ts';
import { Beats } from '../layer.ts';
import { Engine } from '../store.ts';
import { STEP_BEAT_MS } from './steps.ts';
import { STEP_FOLLOWS, type TranscriptEvent } from './following.ts';
import { bell, until, WAITED } from '../../test/waits.ts';

/** One moment of a live attempt, as the engine's `follow` hands it. */
type Followed = Stream.Success<NonNullable<Effect.Success<ReturnType<Engine['Service']['follow']>>>>;

const RUN = 'r-follow';
const STEPS = ['implement', 'review', 'late', 'held', 'opened', 'tried', 'drifted', 'lost'];

/** The run's record, each step of `STEPS` on the task `t-<step>`, but those `moved` names on another. */
function writeRun(moved: Record<string, string> = {}): void {
  fs.mkdirSync(path.join(root, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'runs', `${RUN}.json`),
    JSON.stringify({
      id: RUN,
      repo: '/code/app',
      workspace: '/code/app',
      baseRef: 'abc123',
      branch: 'main',
      isolate: true,
      brief: 'Follow it',
      workflowDir: path.join(root, 'no-such-workflow'),
      createdAt: '2026-10-07T12:00:00.000Z',
      workflow: STEPS.map((name) => ({ name, after: [], body: `${name} it.` })),
      steps: Object.fromEntries(STEPS.map((name) => [name, { taskId: moved[name] ?? `t-${name}` }])),
    }),
  );
}
writeRun();

const said = (id: string, text = id): TranscriptEvent => ({ id, at: '2026-10-07T12:00:00.000Z', role: 'assistant', kind: 'text', text });

/**
 * A task on the test's engine: its attempts' live moments, each a queue the test offers to, how many of them have ended, whether it
 * settled, its conversation, whether its harness streams, and the words a stream it had fails with (`lost`), an error as the runtime
 * fails with one: no refusal to stream, but a stream that broke under the follower.
 */
type Task = {
  attempts: Queue.Queue<Followed, Cause.Done>[];
  ended: number;
  settled: string | null;
  history: TranscriptEvent[];
  unstreamed?: true;
  lost?: string;
};

/**
 * An engine over `tasks`, the api's own but for `view`, `transcript` and `follow`, counting each follow and each follow let go. As the
 * runtime does, its view gives each attempt that has ended its `endedAt`, and the stream of a last attempt that has ended fails refused.
 */
function engineOver(tasks: Map<string, Task>) {
  const follows: string[] = [];
  const closed: string[] = [];
  const real = engine();
  const e = {
    ...real,
    view: (id: string) =>
      Effect.sync(() => ({
        id,
        phase: 'running',
        sessionId: 's',
        state: { brief: 'b', settled: tasks.get(id)!.settled, said: [], attempts: attemptsOf(tasks.get(id)!) },
      })),
    transcript: (id: string, after?: string) =>
      Effect.sync(() => {
        const { history } = tasks.get(id)!;
        return { events: history.slice(Number(after ?? 0)), cursor: String(history.length) };
      }),
    follow: (id: string) =>
      tasks.get(id)!.unstreamed
        ? Effect.fail({ _tag: 'FollowRefused', message: 'the `x` harness does not stream its sessions' })
        : Effect.sync(() => {
            follows.push(id);
            const t = tasks.get(id)!;
            if (t.lost !== undefined) return Stream.fail(Object.assign(new Error(t.lost), { _tag: 'RunnerError', refused: false }));
            if (t.attempts.length === 0) return undefined;
            if (t.ended === t.attempts.length) return Stream.fail({ _tag: 'RunnerError', refused: true, message: 'the attempt has ended' });
            return Stream.fromQueue(t.attempts.at(-1)!).pipe(Stream.ensuring(Effect.sync(() => closed.push(id))));
          }),
  } as unknown as ReturnType<typeof engine>;
  return { e, follows, closed };
}

/** The attempts of `t` as the runtime's view gives them: by number, each that has ended with its `endedAt`. */
const attemptsOf = (t: Task) => t.attempts.map((_, i) => ({ n: i + 1, endedAt: i < t.ended ? '2026-10-07T12:00:01.000Z' : null }));

/** A live attempt, which says first that it is working, as the runtime's subscription hands its task first. */
const attempt = () => {
  const q = Effect.runSync(Queue.unbounded<Followed, Cause.Done>());
  Queue.offerUnsafe(q, { kind: 'state', state: 'working' });
  return q;
};

/** A task with one attempt in flight, nothing said yet but `history`. */
const working = (history: TranscriptEvent[] = []): Task => ({ attempts: [attempt()], ended: 0, settled: null, history });

/** `m` said by the attempt `n` (from 1) of `task`. */
const push = (task: Task, n: number, m: Followed) => Queue.offerUnsafe(task.attempts[n - 1], m);

/**
 * The beat these tests give a step's stream (`Beats.step`): a stream that falls back to reading again waits it between reads, so at the
 * shipped `STEP_BEAT_MS` every beat a test crossed cost five seconds of every pass of this file.
 */
const BEAT_MS = 100;

test('the beat these tests read again on is shorter than shipped, never longer', () => {
  assert.ok(BEAT_MS < STEP_BEAT_MS);
});

/** An app over the engine `e`, on the short beat, its runtime let go once the test `t` ends. */
function appOver(t: TestContext, e: ReturnType<typeof engine>) {
  const own = appOf(Layer.mergeAll(liveOf(), Layer.succeed(Engine)(e), Layer.succeed(Beats)({ ...Beats.defaultValue(), step: BEAT_MS })));
  t.after(() => own.runtime.dispose());
  return own;
}

type Block = { event?: string; data?: string; id?: string };
const blocks = (text: string): Block[] =>
  text
    .split('\n\n')
    .filter((b) => b.trim())
    .map((b) => {
      const block: Block = {};
      for (const line of b.split('\n')) {
        const at = line.indexOf(':');
        if (at > 0) block[line.slice(0, at) as keyof Block] = line.slice(at + 1).trimStart();
      }
      return block;
    });

/** One follower of the step `step`: what it was sent so far (`said`), waited on until `holds` does, and let go (`leave`). */
async function follower(t: TestContext, app: ReturnType<typeof appOver>['app'], step: string) {
  const res = await app.request(`/api/runs/${RUN}/steps/${step}/transcript/stream`);
  if (res.status !== 200) assert.fail(await res.text());
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  const rung = bell();
  const got = () => blocks(text.slice(0, text.lastIndexOf('\n\n') + 2));
  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) return;
    text += decoder.decode(value, { stream: true });
    rung.ring();
    return pump();
  };
  const finished = pump();
  const wait = (holds: (s: Block[]) => boolean, what: string) =>
    until(
      t,
      () => holds(got()),
      () => `${what}: ${JSON.stringify(got())}`,
      { bell: rung },
    );
  const ended = async () => {
    await finished;
    return got();
  };
  return { said: got, wait, ended, leave: () => reader.cancel() };
}

const kinds = (s: Block[]) => s.map((b) => (b.event === 'transcript' ? `transcript ${JSON.parse(b.data!).id}` : `${b.event} ${b.data}`));
const follows = () => Effect.runSync(Metric.value(STEP_FOLLOWS)).count;

/** A line of the feed for the step `step`, saying `word`, as a pass of the tick writes it, on the app's runtime, unlogged. */
const line = (own: ReturnType<typeof appOver>, step: string, word: string) =>
  own.runtime.runPromise(
    emitFeed(new Map([[RUN, { run: { word: 'running' }, steps: [{ name: step, word }] }]])).pipe(Effect.provide(Logger.layer([]))),
  );

test(
  "Boards follow a step live: two share one upstream, one joins mid-message, a held task's stream stays open across the person's answer, and a try not pushed is sent from its start",
  WAITED,
  async (t) => {
    const s = story(t);
    await s.test(
      'two followers of a step share one upstream, both handed each moment; another step opens its own; both gone, it is let go',
      async (t) => {
        const implement = working([said('a-1')]);
        const tasks = new Map([
          ['t-implement', implement],
          ['t-review', working()],
        ]);
        const { e, follows: asked, closed } = engineOver(tasks);
        const own = appOver(t, e);
        const before = follows();
        const one = await follower(t, own.app, 'implement');
        const two = await follower(t, own.app, 'implement');
        for (const f of [one, two]) await f.wait((s) => s.length >= 2, 'following, then the history');
        push(implement, 1, { kind: 'partial', key: 'k', text: 'Hel', append: true, last: false });
        implement.history.push(said('a-2'));
        push(implement, 1, { kind: 'events', events: [said('a-2')], cursor: '2' });
        for (const f of [one, two]) await f.wait((s) => kinds(s).includes('transcript a-2'), 'the moments pushed');
        assert.deepEqual(kinds(one.said()), kinds(two.said()), 'both handed the same');
        assert.deepEqual(kinds(one.said()), [
          'following {"streamed":true}',
          'transcript a-1',
          'partial {"key":"k","delta":"Hel","last":false}',
          'transcript a-2',
        ]);
        assert.equal(follows() - before, 1, 'one upstream opened for the two followers');
        assert.deepEqual(asked, ['t-implement'], "the engine's follow asked once");
        const other = await follower(t, own.app, 'review');
        await other.wait((s) => s.length >= 1, 'following');
        assert.equal(follows() - before, 2, 'a follower of another step opens its own');
        await one.leave();
        await two.leave();
        await until(
          t,
          () => closed.includes('t-implement'),
          () => `the upstream let go once both left: ${closed}`,
        );
        assert.ok(!closed.includes('t-review'), 'the other step still followed');
        await other.leave();
      },
    );
    await s.test(
      'a follower who joins mid-message is handed the text so far as one piece, then the rest live, then the whole message',
      async (t) => {
        const late = working([said('a-1')]);
        const { e } = engineOver(new Map([['t-late', late]]));
        const own = appOver(t, e);
        const first = await follower(t, own.app, 'late');
        await first.wait((s) => s.length >= 2, 'following, then the history');
        push(late, 1, { kind: 'partial', key: 'k', text: 'Hel', append: true, last: false });
        push(late, 1, { kind: 'partial', key: 'k', text: 'lo', append: true, last: false });
        await first.wait((s) => s.filter((b) => b.event === 'partial').length === 2, 'the two pieces');
        const joiner = await follower(t, own.app, 'late');
        await joiner.wait((s) => s.some((b) => b.event === 'partial'), 'the message so far');
        push(late, 1, { kind: 'partial', key: 'k', text: ' there', append: true, last: false });
        push(late, 1, { kind: 'partial', key: 'k', text: '', append: true, last: true });
        late.history.push(said('a-2', 'Hello there'));
        push(late, 1, { kind: 'events', events: [said('a-2', 'Hello there')], cursor: '2' });
        await joiner.wait((s) => kinds(s).includes('transcript a-2'), 'the whole message');
        assert.deepEqual(kinds(joiner.said()), [
          'following {"streamed":true}',
          'transcript a-1',
          'partial {"key":"k","delta":"Hello","last":false}',
          'partial {"key":"k","delta":" there","last":false}',
          'partial {"key":"k","delta":"","last":true}',
          'transcript a-2',
        ]);
        await first.leave();
        await joiner.leave();
      },
    );
    await s.test(
      "a held task's stream stays open while it waits on a person, then says moved and follows its next turn to its end",
      async (t) => {
        const held = working([said('a-1')]);
        const { e } = engineOver(new Map([['t-held', held]]));
        const own = appOver(t, e);
        const f = await follower(t, own.app, 'held');
        push(held, 1, { kind: 'state', state: 'input-required' });
        Queue.endUnsafe(held.attempts[0]);
        await f.wait((s) => s.length >= 2, 'following, then the history');
        held.ended = 1;
        held.history.push(said('u-2'), said('a-3'));
        held.attempts.push(attempt());
        await line(own, 'held', 'running');
        await f.wait((s) => kinds(s).includes('transcript a-3'), "the next turn's history");
        held.history.push(said('a-4'));
        push(held, 2, { kind: 'events', events: [said('a-4')], cursor: '4' });
        Queue.endUnsafe(held.attempts[1]);
        held.settled = 'succeeded';
        await line(own, 'held', 'verified');
        assert.deepEqual(kinds(await f.ended()), [
          'following {"streamed":true}',
          'transcript a-1',
          'moved {"taskId":"t-held"}',
          'transcript a-1',
          'transcript u-2',
          'transcript a-3',
          'transcript a-4',
          'settled {"cursor":"4"}',
        ]);
      },
    );
    await s.test(
      "a held task's stream opened once its attempt has ended says following and its history, then moved and its next turn from the start",
      async (t) => {
        const opened = working([said('a-1')]);
        Queue.endUnsafe(opened.attempts[0]);
        opened.ended = 1;
        const { e } = engineOver(new Map([['t-opened', opened]]));
        const own = appOver(t, e);
        const f = await follower(t, own.app, 'opened');
        await f.wait((s) => s.length >= 2, 'following, then the history');
        opened.history.push(said('u-2'));
        opened.attempts.push(attempt());
        await line(own, 'opened', 'running');
        await f.wait((s) => kinds(s).includes('transcript u-2'), "the next turn's history");
        Queue.endUnsafe(opened.attempts[1]);
        opened.settled = 'succeeded';
        await line(own, 'opened', 'verified');
        assert.deepEqual(kinds(await f.ended()), [
          'following {"streamed":true}',
          'transcript a-1',
          'moved {"taskId":"t-opened"}',
          'transcript a-1',
          'transcript u-2',
          'settled {"cursor":"2"}',
        ]);
      },
    );
    await s.test(
      'a step moved to a try whose session is not pushed is sent what the try has said from its start, not the task it was opened on, then `unreadable` retrying: the stream stays open and reads the try again on a beat',
      async (t) => {
        const first = working([said('a-1')]);
        const tried: Task = { ...working([said('b-1')]), unstreamed: true };
        const { e } = engineOver(
          new Map([
            ['t-tried', first],
            ['t-tried-try2', tried],
          ]),
        );
        const own = appOver(t, e);
        t.after(() => writeRun());
        const f = await follower(t, own.app, 'tried');
        await f.wait((s) => s.length >= 2, 'following, then the history');
        Queue.endUnsafe(first.attempts[0]);
        first.ended = 1;
        first.settled = 'failed';
        writeRun({ tried: 't-tried-try2' });
        await line(own, 'tried', 'running');
        await f.wait((s) => kinds(s).includes('transcript b-1'), "the try's own history, read from its start");
        const sent = f.said();
        assert.deepEqual(
          kinds(sent).filter((k) => !k.startsWith('unreadable ')),
          [
            'following {"streamed":true}',
            'transcript a-1',
            'moved {"taskId":"t-tried-try2"}',
            'following {"streamed":false}',
            'transcript b-1',
          ],
        );
        assert.deepEqual(JSON.parse(sent.find((b) => b.event === 'unreadable')!.data!), {
          error: `Step 'tried' of run '${RUN}' runs a session its harness does not push as it is written: what it said so far is sent, and it is read again every few seconds.`,
          retrying: true,
        });
        assert.equal(sent.filter((b) => b.event === 'settled').length, 0, 'the try is still live, and the stream is not ended');
        await f.leave();
      },
    );
  },
);

test(
  'a beat that moves to another try reads that try from its start once, and from its cursor on every beat after: nothing is sent twice',
  { timeout: 60_000 },
  async (t) => {
    const first: Task = { ...working([said('a-1')]), unstreamed: true };
    const tried: Task = { ...working([said('c-1')]), unstreamed: true };
    const { e } = engineOver(
      new Map([
        ['t-drifted', first],
        ['t-drifted-try2', tried],
      ]),
    );
    const own = appOver(t, e);
    t.after(() => writeRun());
    const f = await follower(t, own.app, 'drifted');
    await f.wait((s) => s.some((b) => b.event === 'unreadable'), 'not pushed: read again on a beat');
    delete first.unstreamed;
    await f.wait((s) => s.some((b) => b.event === 'readable'), 'a harness that starts pushing is relayed live on the next beat');
    Queue.endUnsafe(first.attempts[0]);
    first.ended = 1;
    first.settled = 'failed';
    writeRun({ drifted: 't-drifted-try2' });
    await line(own, 'drifted', 'running');
    await f.wait((s) => kinds(s).includes('transcript c-1'), "the try's own history, read from its start");
    tried.history.push(said('c-2'));
    await f.wait((s) => kinds(s).includes('transcript c-2'), 'what the try says next, on the beat after');
    assert.equal(
      kinds(f.said()).filter((k) => k === 'transcript c-1').length,
      1,
      "the try's history is read from its start at the move alone: the beats after it read from the cursor",
    );
    await f.leave();
  },
);

test(
  'a step whose live stream fails is given up on no more than one its harness never pushed: the stream says why, retrying, and the beat reads the conversation again',
  { timeout: 60_000 },
  async (t) => {
    const lost: Task = { ...working([said('a-1')]), lost: 'the runner lost the session' };
    const { e } = engineOver(new Map([['t-lost', lost]]));
    const own = appOver(t, e);
    const f = await follower(t, own.app, 'lost');
    let reading = true;
    const over = f.ended().then((s) => {
      if (reading) assert.fail(`the stream ended on the failed upstream instead of saying why: ${JSON.stringify(kinds(s))}`);
    });
    await Promise.race([f.wait((s) => s.some((b) => b.event === 'unreadable'), 'the upstream failed, and the stream says so'), over]);
    reading = false;
    const notice = JSON.parse(f.said().find((b) => b.event === 'unreadable')!.data!) as { error: string; retrying: boolean };
    assert.match(notice.error, /the runner lost the session/, "the upstream's own words say why no live stream can be had");
    assert.equal(notice.retrying, true, 'and they are a notice, not an end: the api goes on reading');
    assert.equal(f.said().filter((b) => b.event === 'settled').length, 0, 'nothing settled it: the stream stays open');
    assert.ok(kinds(f.said()).includes('transcript a-1'), 'what the session said before the stream broke is sent all the same');
    lost.history.push(said('a-2'));
    await f.wait((s) => kinds(s).includes('transcript a-2'), 'and what it says after it arrives on the beat that follows');
    await f.leave();
    await over;
  },
);
