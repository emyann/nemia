/**
 * What an append says of itself (`appendSaid`, through `Journal.layer`): a span of its own, `append`, under the verb that wrote it, and a
 * `Debug` log of the event's kind, each annotated with the task, the kind and the attempt — the runtime's words, never a caller's.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Logger, Option, References, Tracer } from 'effect';
import { appendFields, Journal } from './journal.ts';
import type { Event } from '../domain.ts';
import { TaskId } from '../model.ts';

/** What a capturing logger was handed: each log's level, its message's text and its annotations. */
type Logged = { level: string; text: string; annotations: Record<string, unknown> };

/**
 * Runs `program` over the in-memory journal, logging at `Debug` to a logger that keeps what it is handed, and tracing to one that keeps
 * its spans.
 */
async function traced(program: Effect.Effect<void, unknown, Journal>): Promise<{ logs: Logged[]; spans: Tracer.NativeSpan[] }> {
  const logs: Logged[] = [];
  const spans: Tracer.NativeSpan[] = [];
  const keeper = Logger.make(({ message, logLevel, fiber }) => {
    logs.push({
      level: logLevel,
      text: (Array.isArray(message) ? message : [message]).join(' '),
      annotations: { ...fiber.getRef(References.CurrentLogAnnotations) },
    });
  });
  const tracer = Tracer.make({
    span(options) {
      const span = new Tracer.NativeSpan(options);
      spans.push(span);
      return span;
    },
  });
  await Effect.runPromise(
    program.pipe(
      Effect.provide(Journal.test()),
      Effect.provide(Logger.layer([keeper])),
      Effect.provideService(References.MinimumLogLevel, 'Debug'),
      Effect.withTracer(tracer),
    ),
  );
  return { logs, spans };
}

const starting: Event = { kind: 'starting', at: '2026-10-05T08:00:00.000Z', attempt: 1 };
const filed = { kind: 'filed', at: '2026-10-05T08:00:00.000Z', brief: 'b', cwd: '/w' } as Event;

test('an append is said at Debug, its kind, annotated with its task, its kind and its attempt where it has one', async () => {
  const { logs } = await traced(
    Effect.gen(function* () {
      const journal = yield* Journal;
      yield* journal.append(TaskId.read('t-1'), filed);
      yield* journal.append(TaskId.read('t-1'), starting);
    }),
  );
  assert.deepEqual(logs, [
    { level: 'Debug', text: 'filed', annotations: { task: 't-1', kind: 'filed' } },
    { level: 'Debug', text: 'starting', annotations: { task: 't-1', kind: 'starting', attempt: 1 } },
  ]);
  assert.deepEqual(appendFields('t-1', starting), { task: 't-1', kind: 'starting', attempt: 1 });
});

test('an append is a span of its own, append, under the span of the verb that wrote it, its attributes the same fields', async () => {
  const { spans } = await traced(
    Effect.gen(function* () {
      const journal = yield* Journal;
      yield* journal.append(TaskId.read('t-1'), filed);
      yield* journal.append(TaskId.read('t-1'), starting);
    }).pipe(Effect.withSpan('file')),
  );
  const append = spans.find((s) => s.name === 'append' && Object.fromEntries(s.attributes).kind === 'starting');
  assert.ok(append, `no append span among ${spans.map((s) => s.name).join(', ')}`);
  assert.equal(Option.getOrUndefined(append.parent)?.spanId, spans.find((s) => s.name === 'file')?.spanId);
  assert.deepEqual(Object.fromEntries(append.attributes), { task: 't-1', kind: 'starting', attempt: 1 });
});
