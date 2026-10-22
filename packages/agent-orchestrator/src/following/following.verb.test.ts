/**
 * One step followed live (`followStep`) over an engine of the test's own, whose task's attempts, follow streams and history the test sets
 * by hand, and a store of its own, whose run record and feed lines it writes: across a person's answer, across a try, to its end, and a
 * harness that does not stream. A file of its own, since `WF_ROOT` is read as the module loads; the feed's hub is the process's, so a
 * line written wakes a follower at once.
 */
import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit, Layer, Logger, ManagedRuntime, Stream } from 'effect';
import type { Engine } from '../runtime-client.ts';
import { nextOf, type StepMoment } from './following.ts';
import { scratch } from '../../test/scratch.ts';
import { bell, until, WAITED } from 'agent-runtime/testing';

const ROOT = scratch('wf-following-');
process.env.WF_ROOT = ROOT;
const { followStep } = await import('./following.verb.ts');
const { emitFeed, feedHubLayer } = await import('../feed/feed.verb.ts');
const { EngineService } = await import('../runtime-client.ts');

/** The step's record: a run `id` whose step `implement` is on the task `taskId`, or none filed. */
function writeRun(id: string, taskId: string | null): void {
  fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'runs', `${id}.json`),
    JSON.stringify({
      id,
      workspace: ROOT,
      brief: `The brief of ${id}`,
      createdAt: '2026-10-07T12:00:00.000Z',
      workflowDir: path.join(ROOT, 'no-such-workflow'),
      place: { kind: 'folder' },
      workflow: [{ name: 'implement', after: [], body: 'Implement it.' }],
      steps: { implement: { taskId } },
    }),
  );
}

type Event = { id: string; at: string; kind: string; text: string };
const said = (id: string): Event => ({ id, at: '2026-10-07T12:00:00.000Z', kind: 'text', text: id });

/**
 * A task on the test's engine: its attempts' moments, by number, how many of them have ended, its settle, and the history a read from its
 * start gives.
 */
type Task = { attempts: StepMoment<Event>[][]; ended: number; settled: string | null; history: Event[] };

/**
 * An engine over `tasks`, counting each view; a task named in `unstreamed` is refused its follow as a harness that does not stream. As the
 * runtime does, its view gives each attempt that has ended its `endedAt`, and the stream of a last attempt that has ended fails refused.
 */
function engineOver(tasks: Map<string, Task>, unstreamed: string[] = []) {
  const views: string[] = [];
  const e = {
    view: (id: string) =>
      Effect.sync(() => {
        views.push(id);
        const t = tasks.get(id)!;
        return {
          id,
          phase: 'running',
          sessionId: 's',
          state: {
            brief: 'b',
            settled: t.settled,
            said: [],
            attempts: t.attempts.map((_, i) => ({ n: i + 1, endedAt: i < t.ended ? AT : null })),
          },
        };
      }),
    follow: (id: string) => (unstreamed.includes(id) ? Effect.fail(UNSTREAMED) : Effect.succeed(followed(tasks.get(id)!))),
    transcript: (id: string) => Effect.sync(() => ({ events: tasks.get(id)!.history, cursor: `c-${id}` })),
  } as unknown as Engine;
  return { e, views };
}

const AT = '2026-10-07T12:00:01.000Z';
const UNSTREAMED = { _tag: 'FollowRefused', message: 'the `x` harness does not stream its sessions' };

/** The stream of `t`'s last attempt, none before one starts: refused, as the runtime's, once that attempt has ended. */
const followed = (t: Task) =>
  t.attempts.length === 0
    ? undefined
    : t.ended === t.attempts.length
      ? Stream.fail({ _tag: 'RunnerError', refused: true, message: `attempt ${t.ended} has ended: there is no session to follow` })
      : Stream.fromIterable(t.attempts.at(-1)!);

/** A runtime with the feed's hub and no logger, over the engine `e`: let go once the test `t` ends. */
function runtimeOf(t: TestContext, e: Engine) {
  const rt = ManagedRuntime.make(Layer.mergeAll(feedHubLayer(), Logger.layer([]), EngineService.layer(e)));
  t.after(() => rt.dispose());
  return rt;
}

/** A line of the feed for the step `step` of the run `run`, saying `word`, as a pass of the tick writes it. */
const line = (rt: ReturnType<typeof runtimeOf>, run: string, step: string, word: string) =>
  rt.runPromise(emitFeed(new Map([[run, { run: { word: 'running' }, steps: [{ name: step, word }] }]])));

/** `followStep` of the step `implement` of `run` on `rt`: each moment pushed to `got` as it comes, ringing `rung`; its end. */
function follow(rt: ReturnType<typeof runtimeOf>, run: string, got: StepMoment<Event>[]) {
  const rung = bell();
  const ended = rt.runPromiseExit(
    Stream.runForEach(followStep(run, 'implement'), (m) =>
      Effect.sync(() => {
        got.push(m as StepMoment<Event>);
        rung.ring();
      }),
    ),
  );
  return { ended, rung };
}

const ids = (got: StepMoment<Event>[]) =>
  got.map((m) =>
    m.kind === 'events'
      ? `events ${m.events.map((ev) => ev.id).join(',')}`
      : m.kind === 'state'
        ? `state ${m.state}`
        : m.kind === 'streamed'
          ? `streamed ${m.yes}`
          : m.kind === 'moved'
            ? `moved ${m.taskId}`
            : m.kind,
  );

test(
  "a step followed goes on to its task's next attempt after the step's line of the feed, saying moved, and ends once its task settles",
  WAITED,
  async (t) => {
    writeRun('r-1', 'r-1-implement');
    const task: Task = {
      attempts: [
        [
          { kind: 'state', state: 'working' },
          { kind: 'events', events: [said('a-1')], cursor: 'c1' },
          { kind: 'state', state: 'completed' },
        ],
      ],
      ended: 0,
      settled: null,
      history: [],
    };
    const { e, views } = engineOver(new Map([['r-1-implement', task]]));
    const rt = runtimeOf(t, e);
    const got: StepMoment<Event>[] = [];
    const { ended, rung } = follow(rt, 'r-1', got);
    await until(
      t,
      () => got.length === 4,
      () => `the first attempt: ${ids(got)}`,
      { bell: rung },
    );
    await line(rt, 'r-1', 'other', 'running');
    await line(rt, 'r-2', 'implement', 'running');
    task.ended = 1;
    task.attempts.push([
      { kind: 'state', state: 'working' },
      { kind: 'events', events: [said('a-3')], cursor: 'c3' },
    ]);
    task.history = [said('a-1'), said('u-2'), said('a-3')];
    await line(rt, 'r-1', 'implement', 'running');
    await until(
      t,
      () => got.length === 7,
      () => `the next attempt: ${ids(got)}`,
      { bell: rung },
    );
    assert.equal(views.length, 2, `read on opening, and once woken by the step's own line, not by another's: ${views}`);
    task.settled = 'succeeded';
    await line(rt, 'r-1', 'implement', 'verified');
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(ids(got), [
      'streamed true',
      'state working',
      'events a-1',
      'state completed',
      'moved r-1-implement',
      'state working',
      'events a-1,u-2,a-3',
      'settled',
    ]);
  },
);

test("a step followed goes on to its try's task, saying moved, once the step's line says so", WAITED, async (t) => {
  writeRun('r-3', 'r-3-implement');
  const first: Task = {
    attempts: [
      [
        { kind: 'state', state: 'working' },
        { kind: 'state', state: 'failed' },
      ],
    ],
    ended: 0,
    settled: null,
    history: [],
  };
  const tried: Task = { attempts: [[{ kind: 'state', state: 'working' }]], ended: 0, settled: null, history: [said('b-1')] };
  const { e } = engineOver(
    new Map([
      ['r-3-implement', first],
      ['r-3-implement-try2', tried],
    ]),
  );
  const rt = runtimeOf(t, e);
  const got: StepMoment<Event>[] = [];
  const { ended, rung } = follow(rt, 'r-3', got);
  await until(
    t,
    () => got.length === 3,
    () => `the first try: ${ids(got)}`,
    { bell: rung },
  );
  first.ended = 1;
  first.settled = 'failed';
  writeRun('r-3', 'r-3-implement-try2');
  await line(rt, 'r-3', 'implement', 'running');
  await until(
    t,
    () => got.length === 6,
    () => `the try: ${ids(got)}`,
    { bell: rung },
  );
  tried.settled = 'succeeded';
  await line(rt, 'r-3', 'implement', 'verified');
  assert.ok(Exit.isSuccess(await ended));
  assert.deepEqual(ids(got), [
    'streamed true',
    'state working',
    'state failed',
    'moved r-3-implement-try2',
    'state working',
    'events b-1',
    'settled',
  ]);
});

test(
  "a step whose task is filed with no attempt yet waits for the step's next line of the feed, then follows its first attempt to its end",
  WAITED,
  async (t) => {
    writeRun('r-6', 'r-6-implement');
    const task: Task = { attempts: [], ended: 0, settled: null, history: [] };
    const { e, views } = engineOver(new Map([['r-6-implement', task]]));
    const rt = runtimeOf(t, e);
    const got: StepMoment<Event>[] = [];
    const { ended, rung } = follow(rt, 'r-6', got);
    await until(
      t,
      () => views.length === 1,
      () => `the step read once, its feed's cursor taken: ${views}`,
      { everyMs: 10 },
    );
    task.attempts.push([
      { kind: 'state', state: 'working' },
      { kind: 'events', events: [said('a-1')], cursor: 'c1' },
    ]);
    await line(rt, 'r-6', 'implement', 'running');
    await until(
      t,
      () => got.length === 3 || got.some((m) => m.kind === 'settled'),
      () => `the first attempt: ${ids(got)}`,
      { bell: rung },
    );
    task.settled = 'succeeded';
    await line(rt, 'r-6', 'implement', 'verified');
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(ids(got), ['streamed true', 'state working', 'events a-1', 'settled']);
  },
);

test(
  "a step opened held on a person, its attempt ended, is said streamed, then follows the next attempt from its task's start, saying moved",
  WAITED,
  async (t) => {
    writeRun('r-7', 'r-7-implement');
    const task: Task = {
      attempts: [[{ kind: 'events', events: [said('a-1')], cursor: 'c1' }]],
      ended: 1,
      settled: null,
      history: [said('a-1')],
    };
    const { e, views } = engineOver(new Map([['r-7-implement', task]]));
    const rt = runtimeOf(t, e);
    const got: StepMoment<Event>[] = [];
    const { ended, rung } = follow(rt, 'r-7', got);
    await until(
      t,
      () => got.length === 1 && views.length === 1,
      () => `said streamed, the ended attempt not followed: ${ids(got)}`,
      { bell: rung },
    );
    task.attempts.push([{ kind: 'state', state: 'working' }]);
    task.history = [said('a-1'), said('u-2')];
    await line(rt, 'r-7', 'implement', 'running');
    await until(
      t,
      () => got.some((m) => m.kind === 'state'),
      () => `the next attempt: ${ids(got)}`,
      { bell: rung },
    );
    task.settled = 'succeeded';
    await line(rt, 'r-7', 'implement', 'verified');
    assert.ok(Exit.isSuccess(await ended));
    assert.deepEqual(ids(got), ['streamed true', 'moved r-7-implement', 'state working', 'events a-1,u-2', 'settled']);
  },
);

test("a try whose attempt has ended is not followed: the following waits for the try's next attempt", () => {
  const at = { taskId: 'r-8-implement', attempt: 1 };
  assert.equal(nextOf(at, { taskId: 'r-8-implement-try2', attempt: 1, live: false, settled: false }), 'wait');
  assert.deepEqual(nextOf(at, { taskId: 'r-8-implement-try2', attempt: 2, live: true, settled: false }), {
    follow: { taskId: 'r-8-implement-try2', attempt: 2 },
  });
});

test('a step whose harness does not stream is said not streamed, and the following ends there', async (t) => {
  writeRun('r-4', 'r-4-implement');
  const { e } = engineOver(new Map([['r-4-implement', { attempts: [[]], ended: 0, settled: null, history: [] }]]), ['r-4-implement']);
  const got: StepMoment<Event>[] = [];
  assert.ok(Exit.isSuccess(await follow(runtimeOf(t, e), 'r-4', got).ended));
  assert.deepEqual(ids(got), ['streamed false']);
});

test('REFUSED: a step with no task filed, as Missing, in words saying when to follow it', async (t) => {
  writeRun('r-5', null);
  const { e } = engineOver(new Map());
  const exit = await follow(runtimeOf(t, e), 'r-5', []).ended;
  assert.ok(Exit.isFailure(exit));
  const err = Cause.squash(exit.cause) as Error & { _tag?: string };
  assert.equal(err._tag, 'Missing');
  assert.ok(err.message.startsWith('run r-5 '), err.message);
  assert.ok(err.message.includes('`implement`'), err.message);
  assert.ok(err.message.includes('`nemia ls`'), err.message);
});
