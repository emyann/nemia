/**
 * Where a session's transcript stands: the last event `runner` reads of the session `name`, as a mark (`TranscriptMark`). Null when
 * its harness keeps no conversation, has none under the name yet, holds no event, or could not be read. Never fails: a mark is a
 * fact beside what a verb does, never a reason to refuse it.
 */
import { Effect } from 'effect';
import type { SeamOps } from '../a2a/index.ts';

/**
 * The last event `runner` reads of the session `name`, as a mark; null where none could be read. Never fails.
 * @param runner The harness's runner, asked for the session's transcript.
 * @param name The session's name.
 */
export const transcriptEndOf = (runner: SeamOps, name: string) => {
  const read = runner.transcriptOf;
  if (!read) return Effect.succeed(null);
  return read(name).pipe(
    Effect.map((transcript) => {
      const last = transcript?.events.at(-1);
      return last ? { kind: last.kind, id: last.id } : null;
    }),
    Effect.catchCause(() => Effect.succeed(null)),
  );
};
