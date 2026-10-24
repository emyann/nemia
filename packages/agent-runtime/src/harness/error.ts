/**
 * The one error a harness fails with, whichever verb it was asked: what it was asked, what went wrong, and whether it
 * vouches that nothing started.
 */
import { Cause, Schema } from 'effect';

export class RunnerError extends Schema.TaggedError<RunnerError>()('RunnerError', {
  verb: Schema.String,
  message: Schema.String,
  /**
   * The harness vouches that nothing started, and that waiting will not change that: no session can exist under the name.
   * Set by a spawn, and only when that is certain — the OS would not create the process for a reason that stays (no binary,
   * no cwd, a file it cannot write: `refusedOsError`), or a detached worker was never launched. Absent, a failed spawn may
   * still have left a session running, or failed for a short-lived reason, and the grace window judges it.
   */
  refused: Schema.optionalKey(Schema.Boolean),
}) {}

/** The OS errors a spawn may fail with for a short-lived reason — no process slot, no descriptor, no memory — that waiting can clear. */
export const TRANSIENT_ERRNOS: readonly string[] = ['EAGAIN', 'EMFILE', 'ENFILE', 'ENOMEM'];

/**
 * Whether `cause`, an error a spawn failed with before anything started, refuses it: true unless its `code` is one of
 * `TRANSIENT_ERRNOS`, which a later attempt may not meet.
 */
export const refusedOsError = (cause: unknown): boolean => {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  return typeof code !== 'string' || !TRANSIENT_ERRNOS.includes(code);
};

/**
 * What a failure said, in its own words: the first error's `message` (a `RunnerError`'s), or a defect's text.
 *
 * @param cause Why an Effect failed, as `Effect.catchCause` is handed it.
 * @returns One sentence a person can be shown as it is.
 */
export const causeWords = (cause: Cause.Cause<unknown>): string => {
  const error = Cause.squash(cause);
  return error instanceof Error ? error.message : String(error);
};
