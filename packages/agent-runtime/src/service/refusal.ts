/** A verb's refusal in words: what a caller that answers with a sentence and an exit code — `ae`, a layer above — says of one. */

/** The tags of the verbs' refusals: each worded as an `Error` whose `exitCode` is 2, its message led by the verb. */
const REFUSALS = new Set([
  'FileRefused',
  'TickRefused',
  'AdmitRefused',
  'InputRefused',
  'StopRefused',
  'ListRefused',
  'TranscriptRefused',
  'OutputRefused',
  'FollowRefused',
  'SayRefused',
  'QuotaRefused',
  'EngineRefused',
  'BodyRefused',
  'ForgetRefused',
  'KeptRefused',
  'CompactRefused',
  'DrainRefused',
]);

/**
 * What `verb` failed with, `e`, in words: a refusal as an `Error` whose `exitCode` is 2 and whose message is led by the verb, `SayUnsent`
 * as an `Error` led by the verb with its `cause` and no `exitCode`, and anything else — a `JournalError`, a `RunnerError` — as it is.
 */
export const refusalWords =
  (verb: string) =>
  (e: unknown): unknown => {
    const { _tag, message, cause } = (e ?? {}) as { _tag?: unknown; message?: unknown; cause?: unknown };
    if (typeof _tag !== 'string' || typeof message !== 'string') return e;
    if (REFUSALS.has(_tag)) return Object.assign(new Error(`${verb}: ${message}`), { exitCode: 2 });
    if (_tag === 'SayUnsent') return new Error(`${verb}: ${message}`, cause === undefined ? undefined : { cause });
    return e;
  };
