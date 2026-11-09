/** A verb's refusal in words: what a caller that answers with a sentence and an exit code — `ae`, a layer above — says of one. */
import { AdmitRefused, FileRefused, InputRefused, StopRefused } from '../core/engine/filing.ts';
import { ReconcileRefused, TickRefused } from '../core/engine/engine.ts';
import { BodyRefused } from '../core/engine/bodies.ts';
import { OutputRefused } from './output.ts';
import { FollowRefused } from './follow.ts';
import { SayRefused, SayUnsent } from './say.ts';
import { InterruptRefused, InterruptUnsent } from './interrupt.ts';
import { AnswerRefused, AnswerUnsent } from './answer.ts';
import { McpStateRefused } from './mcp-state.ts';
import { McpSignInRefused } from './mcp-sign-in.ts';
import { EngineRefused, ListRefused, QuotaRefused, TranscriptRefused } from './engine.ts';
import { ForgetRefused } from './forget.ts';
import { KeptRefused } from './kept.ts';
import { CompactRefused } from './compact.ts';
import { DrainRefused } from './drain.ts';

/**
 * The tags of the verbs' refusals, read off their classes: each worded as an `Error` whose `exitCode` is 2, its message led by the
 * verb. A `*Refused` of the source left out of this list is named by `test/verb-refusals.test.ts`, which reads every one there.
 */
const REFUSALS = new Set(
  [
    FileRefused,
    TickRefused,
    ReconcileRefused,
    AdmitRefused,
    InputRefused,
    StopRefused,
    ListRefused,
    TranscriptRefused,
    OutputRefused,
    FollowRefused,
    SayRefused,
    InterruptRefused,
    AnswerRefused,
    QuotaRefused,
    McpStateRefused,
    McpSignInRefused,
    EngineRefused,
    BodyRefused,
    ForgetRefused,
    KeptRefused,
    CompactRefused,
    DrainRefused,
  ].map((refused) => refused.identifier),
);

/** The tags of a reach that failed and may pass, read off their classes: each worded with its `cause` and no `exitCode`. */
const UNSENT = new Set([SayUnsent, InterruptUnsent, AnswerUnsent].map((unsent) => unsent.identifier));

/**
 * What `verb` failed with, `e`, in words: a refusal as an `Error` whose `exitCode` is 2 and whose message is led by the verb, a reach
 * that failed and may pass (`SayUnsent`, `InterruptUnsent`, `AnswerUnsent`) as an `Error` led by the verb with its `cause` and no
 * `exitCode`, and anything else — a `JournalError`, a `RunnerError` — as it is.
 */
export const refusalWords =
  (verb: string) =>
  (e: unknown): unknown => {
    const { _tag, message, cause } = (e ?? {}) as { _tag?: unknown; message?: unknown; cause?: unknown };
    if (typeof _tag !== 'string' || typeof message !== 'string') return e;
    if (REFUSALS.has(_tag)) return Object.assign(new Error(`${verb}: ${message}`), { exitCode: 2 });
    if (UNSENT.has(_tag)) return new Error(`${verb}: ${message}`, cause === undefined ? undefined : { cause });
    return e;
  };
