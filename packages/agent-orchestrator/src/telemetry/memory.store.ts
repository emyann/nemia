/**
 * The daemon's memory, recorded while it lasts (`memoryWatched`): its V8 heap and its resident size, read from Node every few seconds
 * (`process.memoryUsage()`, `v8.getHeapStatistics()`) into gauges the process exports with its other series, so a leak or a burst shows
 * as a line beside the event loop's delay. A reading costs a few microseconds (`memoryUsage()` walks the process's mappings for its
 * resident size; `getHeapStatistics()` sums V8's spaces).
 */
import { getHeapStatistics } from 'node:v8';
import { Effect, Metric, Schedule } from 'effect';

/**
 * The gauges of the daemon's memory, each in bytes, named by OpenTelemetry's semantic conventions for a Node runtime where one exists:
 * `v8js.memory.heap.used` and `v8js.memory.heap.space.size`, the heap allocated and the heap pre-allocated, each summed over V8's spaces
 * here, where the convention keeps a series per space (`v8js.heap.space.name`), and `process.memory.usage` for the resident size. The
 * heap's limit, the external and the array-buffer memory have none, so they are named in the same family: the limit after V8's own
 * `heap_size_limit`, since the convention's `v8js.memory.heap.limit` is the deprecated name of `v8js.memory.heap.space.size`.
 */
export const MEMORY = {
  heapUsed: Metric.gauge('v8js.memory.heap.used', { description: "the bytes the daemon's V8 heap holds live, over all its spaces" }),
  heapCommitted: Metric.gauge('v8js.memory.heap.space.size', {
    description: "the bytes V8 has committed for the daemon's heap, live or not, over all its spaces",
  }),
  heapLimit: Metric.gauge('v8js.memory.heap.size_limit', { description: "the bytes the daemon's V8 heap may grow to before it fails" }),
  external: Metric.gauge('v8js.memory.external', {
    description: 'the bytes held outside the V8 heap by objects it tracks, array buffers among them',
  }),
  arrayBuffers: Metric.gauge('v8js.memory.array_buffers', {
    description: "the bytes the daemon's ArrayBuffers and SharedArrayBuffers hold, Node's Buffers among them",
  }),
  resident: Metric.gauge('process.memory.usage', { description: "the daemon's resident set size, in bytes: the memory it holds in RAM" }),
};

/** How often the daemon's memory is read: as often as the process exports its series. */
const DAEMON_EVERY_MS = 10_000;

/** One reading of the process's memory, recorded into each gauge of `MEMORY`. */
export const memoryRead = Effect.gen(function* () {
  const usage = process.memoryUsage();
  const heap = getHeapStatistics();
  yield* Metric.update(MEMORY.heapUsed, heap.used_heap_size);
  yield* Metric.update(MEMORY.heapCommitted, heap.total_heap_size);
  yield* Metric.update(MEMORY.heapLimit, heap.heap_size_limit);
  yield* Metric.update(MEMORY.external, usage.external);
  yield* Metric.update(MEMORY.arrayBuffers, usage.arrayBuffers);
  yield* Metric.update(MEMORY.resident, usage.rss);
});

/**
 * `program` run with the process's memory read into `MEMORY` at once and every `everyMs` after, on a fiber of the scope's: what the
 * daemon (`up`) runs in.
 * @param program What runs with its memory recorded: the daemon.
 * @param everyMs How often the memory is read, in ms; the daemon's (`DAEMON_EVERY_MS`) unless given.
 */
export const memoryWatched = <A, E, R>(program: Effect.Effect<A, E, R>, everyMs: number = DAEMON_EVERY_MS) =>
  Effect.gen(function* () {
    yield* Effect.forkScoped(Effect.repeat(memoryRead, Schedule.spaced(everyMs)));
    return yield* program;
  });
