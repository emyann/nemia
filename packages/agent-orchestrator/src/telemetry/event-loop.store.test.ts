/**
 * The daemon's event loop, watched (`eventLoopWatched`): a stand-in step of a pass that holds the loop past the watch's bound is found in
 * the delay histogram (`EVENT_LOOP_DELAY`) and in the one warning the stall is logged with, which names that step as the span running
 * when the loop came back; and the delays read off Node's percentiles (`delaysOf`).
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Logger, Metric, References } from 'effect';
import { delaysOf, EVENT_LOOP_DELAY, eventLoopWatched } from './event-loop.store.ts';

/** What a capturing logger was handed: each log's level and its annotations. */
type Logged = { level: string; annotations: Record<string, unknown> };

/** Holds the event loop for `ms`, as a synchronous read does: the thread waits on a cell nobody writes. */
const held = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

test('a stand-in step that holds the loop is in the delay histogram and in the one warning the stall is logged with, named', async () => {
  const logs: Logged[] = [];
  const keeper = Logger.make(({ logLevel, fiber }) => {
    logs.push({ level: logLevel, annotations: { ...fiber.getRef(References.CurrentLogAnnotations) } });
  });
  const step = Effect.fn('stand-in step')(function* () {
    yield* Effect.sleep(150);
    yield* Effect.sync(() => held(400));
    yield* Effect.sleep(300);
  });
  const pass = Effect.fn('stand-in pass')(function* () {
    yield* step();
  });
  const before = await Effect.runPromise(Metric.value(EVENT_LOOP_DELAY));
  await Effect.runPromise(
    eventLoopWatched(pass(), { stallMs: 250, everyMs: 200 }).pipe(
      Effect.andThen(Effect.sleep(400)),
      Effect.scoped,
      Effect.provide(Logger.layer([keeper])),
    ),
  );
  const after = await Effect.runPromise(Metric.value(EVENT_LOOP_DELAY));
  const past = (state: typeof after) => state.buckets.find(([bound]) => bound === 200)?.[1] ?? 0;
  assert.ok(after.count - past(after) > before.count - past(before), 'a delay past 200 ms was recorded');
  const stalls = logs.filter((l) => l.level === 'Warn' && l.annotations.span === 'stand-in step');
  assert.equal(stalls.length, 1, 'the stall was logged once, naming the step that held the loop');
  assert.deepEqual(stalls[0].annotations.spans, ['stand-in step', 'stand-in pass']);
  assert.ok(Number(stalls[0].annotations.heldMs) >= 250, 'it says how long the loop was held');
});

test("the delays are read off Node's percentiles, each step's share of the samples at its higher value, in ms", () => {
  const rows: { percentiles: [number, number][]; count: number; delays: number[] }[] = [
    { percentiles: [], count: 0, delays: [] },
    { percentiles: [[100, 2e6]], count: 2, delays: [2, 2] },
    {
      percentiles: [
        [0, 1e6],
        [50, 1e6],
        [75, 3e6],
        [100, 9e6],
      ],
      count: 4,
      delays: [1, 1, 3, 9],
    },
    {
      percentiles: [
        [100, 5e6],
        [50, 1e6],
      ],
      count: 2,
      delays: [1, 5],
    },
  ];
  for (const { percentiles, count, delays } of rows) assert.deepEqual(delaysOf(new Map(percentiles), count), delays);
});
