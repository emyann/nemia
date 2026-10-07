/**
 * A session followed through the A2A seam (`src/a2a/follow.ts`): the handler's `SubscribeToTask` over a driver's `follow`, and the
 * client's read of it, each moment handed back once and in order; the card that says so; and the refusals, at shipped defaults.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Exit, Stream } from 'effect';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { ServerCallContext } from '@a2a-js/sdk/server';
import { a2aOps } from '../src/a2a/client.ts';
import { HarnessHandler } from '../src/a2a/handler.ts';
import { RunnerError, type Followed, type RunnerOps } from '../src/harness/seam.ts';

const ctx = new ServerCallContext();

/** A driver whose `follow` says `moments` of any session, counting the follows it was asked (`follows`); none when `follows` is not. */
const driver = (moments: Stream.Stream<Followed, RunnerError> | undefined) => {
  const follows: string[] = [];
  const ops: RunnerOps = {
    spawn: () => Effect.void,
    observe: Effect.succeed(new Map()),
    stop: () => Effect.void,
    logs: () => Effect.succeed(''),
    ...(moments
      ? {
          follow: (name: string) => {
            follows.push(name);
            return moments;
          },
        }
      : {}),
  };
  return { ops, follows };
};

const WORKING: Followed = { kind: 'state', state: 'working' };

const SAID: Followed[] = [
  { kind: 'state', state: 'working' },
  { kind: 'partial', key: 'msg_1:0', text: 'Riv', append: false, last: false },
  { kind: 'partial', key: 'msg_1:0', text: 'ers', append: true, last: false },
  { kind: 'partial', key: 'msg_1:0', text: '', append: true, last: true },
  {
    kind: 'events',
    events: [{ id: 'a-1:0', at: '2026-10-07T12:00:00.000Z', role: 'assistant', kind: 'text', text: 'Rivers' }],
    cursor: 'c-1',
  },
  { kind: 'state', state: 'input-required' },
  { kind: 'state', state: 'completed' },
];

/** What `follow` of `name` through `runner` hands back, and how it ended. */
const followed = async (runner: Pick<RunnerOps, 'follow'>, name: string) => {
  const got: Followed[] = [];
  const exit = await Effect.runPromiseExit(Stream.runForEach(runner.follow!(name), (m) => Effect.sync(() => got.push(m))));
  return { got, exit };
};

test("the card says a driver that follows sessions streams, and the seam's runner follows; one that does not, neither", async () => {
  const streaming = a2aOps('fake', driver(Stream.empty).ops, async () => []);
  const not = a2aOps('fake', driver(undefined).ops, async () => []);
  assert.equal((await new HarnessHandler('fake', driver(Stream.empty).ops, async () => []).getAgentCard()).capabilities?.streaming, true);
  assert.equal((await new HarnessHandler('fake', driver(undefined).ops, async () => []).getAgentCard()).capabilities?.streaming, false);
  assert.equal(typeof streaming.follow, 'function');
  assert.equal(not.follow, undefined);
});

test('a session followed through the seam: each moment once, in order, the Task as it stands first, and the stream ends when the session settles', async () => {
  const d = driver(Stream.fromIterable(SAID));
  const first = await new HarnessHandler('fake', d.ops, async () => []).resubscribe({ tenant: '', id: 'ae/t-1/1' }, ctx).next();
  assert.equal(first.value?.payload?.$case, 'task');
  const { got, exit } = await followed(
    a2aOps('fake', d.ops, async () => []),
    'ae/t-1/1',
  );
  assert.ok(Exit.isSuccess(exit));
  assert.deepEqual(got, SAID);
  assert.deepEqual(d.follows, ['ae/t-1/1', 'ae/t-1/1']);
});

test('REFUSED: a subscription to a Task that has ended, in the words that say to read its transcript', async () => {
  const d = driver(Stream.fromIterable<Followed>([{ kind: 'state', state: 'completed' }]));
  const words = 'session `ae/t-1/1` has ended (done): there is nothing to follow. Read its transcript (sessionTranscript).';
  await assert.rejects(
    new HarnessHandler('fake', d.ops, async () => []).resubscribe({ tenant: '', id: 'ae/t-1/1' }, ctx).next(),
    (e) => e instanceof UnsupportedOperationError && e.message === words,
  );
  const { got, exit } = await followed(
    a2aOps('fake', d.ops, async () => []),
    'ae/t-1/1',
  );
  assert.deepEqual(got, []);
  assert.ok(Exit.isFailure(exit));
  const error = Cause.squash(exit.cause) as RunnerError;
  assert.deepEqual([error._tag, error.verb, error.message, error.refused], ['RunnerError', 'follow', words, true]);
});

test("REFUSED: a driver's refusal reaches the follower as a refusal, and its failure as a failure, in its words", async () => {
  const refused = new RunnerError({ verb: 'follow', message: 'fake: this session does not stream.', refused: true });
  const failed = new RunnerError({ verb: 'follow', message: 'fake: the output cannot be read.' });
  const one = await followed(
    a2aOps('fake', driver(Stream.fail(refused)).ops, async () => []),
    'ae/t-1/1',
  );
  const two = await followed(
    a2aOps('fake', driver(Stream.concat(Stream.make(WORKING), Stream.fail(failed))).ops, async () => []),
    'ae/t-1/1',
  );
  const words = (exit: Exit.Exit<void, RunnerError>) => {
    const e = Cause.squash((exit as Exit.Failure<void, RunnerError>).cause) as RunnerError;
    return [e.message, e.refused === true];
  };
  assert.deepEqual(words(one.exit), ['fake: this session does not stream.', true]);
  assert.deepEqual(words(two.exit), ['fake: the output cannot be read.', false]);
  assert.deepEqual(two.got, [{ kind: 'state', state: 'working' }]);
});

test('REFUSED: a subscription where the driver follows no session, asking it nothing', async () => {
  await assert.rejects(
    new HarnessHandler('fake', driver(undefined).ops, async () => []).resubscribe({ tenant: '', id: 'ae/t-1/1' }, ctx).next(),
    (e) => e instanceof UnsupportedOperationError && e.message === 'this agent does not stream: poll getTask.',
  );
});
