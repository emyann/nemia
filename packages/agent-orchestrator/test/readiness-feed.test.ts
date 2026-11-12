/**
 * The store's readiness said on the feed by the tick, a story on the stage (`story.ts`): the daemon hands each pass the readiness its
 * sweep last read (`tickRun({ readiness })`, as `up` hands it `readied`'s read), and the pass writes one `NotReady` line of the store
 * while a piece a run waits on is missing, none while that stands, and one `Ready` line once it is met. The tick is the store's pass, on
 * the stage's engine given a pass of its own that does nothing, as `level-feed.test.ts` gives it. The test's store is its own, at `ROOT`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ReadinessPiece } from 'objects';
import { scratch } from 'test-kit/scratch';
import { staged, story } from './story.ts';
import { tickRun, runWith, readFeed } from '../src/runner.ts';
import { engineOf } from '../src/runtime-client.ts';
import { main } from '../src/cli/main.ts';
import type { Env } from '../src/config/config.store.ts';

const ROOT = scratch('wf-readiness-feed-');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
const ENV: Env = { ...process.env, WF_ROOT: ROOT, WF_VERIFY_REST: '1', WF_MAX_RUNS: undefined, WF_MAX_CONCURRENT: undefined };
const stage = staged({ runWith, main, engineOf, env: ENV });

/** What the engine's own pass answers here: nothing admitted, nothing started, no view. */
const QUIET = { tasks: 0, actions: [], running: {}, views: [] };

/** A piece of the git place a run waits on, in the state given. */
const mise = (state: ReadinessPiece['state']): ReadinessPiece => ({
  name: 'mise',
  area: 'place',
  state,
  message: 'mise is not installed',
  fixes: state === 'missing' ? [{ message: 'install it', command: 'nemia doctor fix mise', startable: true }] : [],
  cost: 'run',
});

/** The feed's readiness lines: each one's reason and note. */
const readinessSaid = () =>
  readFeed(ROOT, 0)
    .lines.filter((l) => l.reason === 'NotReady' || l.reason === 'Ready')
    .map((l) => [l.reason, l.involved?.kind]);

test("the store's readiness the daemon read is said by the tick's pass: NotReady while a piece a run waits on is missing, Ready once it is met", async (t) => {
  const s = story(t);
  const b = stage.board();
  Object.assign(b.e, { tick: () => Effect.succeed(QUIET), tallied: undefined });
  let read: { pieces: ReadinessPiece[] } | undefined;
  const pass = () => stage.runWith(b.e, tickRun({ readiness: () => read }));

  await s.test('a pass handed no read says nothing of the readiness', async () => {
    await pass();
    assert.deepEqual(readinessSaid(), []);
  });
  await s.test('a pass handed a read with mise missing writes one NotReady line of the store, naming its fix', async () => {
    read = { pieces: [mise('missing')] };
    await pass();
    assert.deepEqual(readinessSaid(), [['NotReady', 'Store']]);
    assert.ok(readFeed(ROOT, 0).lines.at(-1)?.note?.includes('nemia doctor fix mise'));
  });
  await s.test('a second pass, the read the same, writes none', async () => {
    await pass();
    assert.equal(readinessSaid().length, 1);
  });
  await s.test('mise met, the next pass writes one Ready line', async () => {
    read = { pieces: [mise('met')] };
    await pass();
    await pass();
    assert.deepEqual(readinessSaid(), [
      ['NotReady', 'Store'],
      ['Ready', 'Store'],
    ]);
  });
});
