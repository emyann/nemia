/** The engine's `output` verb, and what refuses it: one stream of a task's latest attempt, kept whole by its harness. */
import { Effect, Schema } from 'effect';
import { fold, nameFor, type Event, type State } from '../core/index.ts';
import type { JournalError } from '../core/engine/index.ts';
import type { SeamOps } from '../a2a/index.ts';

/** A stream `output` will not read, and why: a stream that is neither, a count of bytes that is none, a task or harness without one. */
export class OutputRefused extends Schema.TaggedError<OutputRefused>()('OutputRefused', {
  message: Schema.String,
}) {}

/**
 * `output` over the engine's journal and runners: refuses, in this order, a `stream` that is not `stdout` or `stderr`, a
 * `lastBytes` that is not a whole number above 0, a task the journal has no record of, and a harness without `output`. Then
 * the stream of the task's latest attempt, by the name the engine chose for it, or `undefined` before an attempt. Observes nothing.
 */
export const outputVerbOf = (
  read: (taskId: string) => Effect.Effect<readonly Event[], JournalError>,
  runners: Record<string, SeamOps>,
  harnessOf: (state: State) => string,
) =>
  Effect.fn('Engine.output')(function* (taskId: string, stream: 'stdout' | 'stderr', lastBytes?: number) {
    const refuse = (message: string) => Effect.fail(new OutputRefused({ message }));
    if (stream !== 'stdout' && stream !== 'stderr')
      return yield* refuse(`\`${String(stream)}\` is not a stream: ask for \`stdout\` or \`stderr\`.`);
    if (lastBytes !== undefined && !(Number.isSafeInteger(lastBytes) && lastBytes > 0))
      return yield* refuse(
        `\`lastBytes: ${String(lastBytes)}\` is not a count of bytes: give a whole number above 0, or none for the whole stream.`,
      );
    const events = yield* read(taskId);
    if (!events.length) return yield* refuse(`\`${taskId}\` is not a task on this board. \`ae ls\`, or \`list()\`, gives the ones it has.`);
    const state = fold(taskId, events);
    const harness = harnessOf(state);
    const output = runners[harness].output;
    if (!output)
      return yield* refuse(
        `the \`${harness}\` harness keeps no whole streams: it mixes them in one log. \`logs\` gives what its session printed.`,
      );
    const last = state.attempts.at(-1);
    return last ? yield* output(nameFor(taskId, last.n), stream, lastBytes) : undefined;
  });
