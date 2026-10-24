/**
 * The claude.ai bridge of a Claude Code session on the Agent SDK, behind one door: a job's, in its own process (`bin/ae-claude-job.ts`),
 * and a session held attached (`attached-session.ts`) alike.
 *
 * The Agent SDK's `query()` object carries a control request the SDK does not declare on its `Query` type:
 * `enableRemoteControl(enabled, name?, { reattachSessionId?, keepSessionOnExit?, workSecret? })`, which answers the bridge's facts and
 * drives `system` `bridge_state` messages onto the session's stream. Because it is undeclared, it is read off the object here and
 * nowhere else, its answer decoded by a schema of its own before anything is written from it, and refused in words where the method is
 * not there: the session runs on with no bridge, and its file says why.
 *
 * It is asked on the session's `system`/`init` message (`bridgeDue`), so the bridge is up before a job's one turn ends: measured on
 * Agent SDK 0.3.308 and Claude Code 2.1.308, the answer comes about half a second after `init`, mid-turn, never queued behind the turn
 * (`docs/harness.md`, *The claude.ai bridge*).
 */
import { Result, Schema } from 'effect';
import type { Sighting } from '../../core/index.ts';

/**
 * What a session's claude.ai bridge came to, as the SDK's control request answered it: its link and the facts a resume re-attaches
 * with, and `state` as the stream's `bridge_state` messages last said it. Or `why` alone, where the SDK this runtime runs on has no
 * such control request, its answer did not decode, or it failed: the session runs on with no bridge. Kept on a held session's run file
 * (`attached-file.ts`) and on a job's bridge file (`HarnessIO.bridgeFile`), and decoded by this schema wherever it is read.
 */
export const BridgeFactsSchema = Schema.Struct({
  url: Schema.optional(Schema.String),
  connectUrl: Schema.optional(Schema.String),
  environmentId: Schema.optional(Schema.String),
  epoch: Schema.optional(Schema.Finite),
  bridgeSessionId: Schema.optional(Schema.String),
  state: Schema.optional(Schema.String),
  why: Schema.optional(Schema.String),
});

/** A session's bridge as its file keeps it. */
export type AttachedBridge = typeof BridgeFactsSchema.Type;

/** What the control request answers, as the SDK's bridge gives it. Every field is read; one missing is a refusal. */
const AnswerSchema = Schema.Struct({
  session_url: Schema.String,
  connect_url: Schema.String,
  environment_id: Schema.String,
  bridge_epoch: Schema.Finite,
  bridge_session_id: Schema.String,
});

const decode = Schema.decodeUnknownResult(AnswerSchema);

/** What a run file says where the SDK this runtime runs on has no such control request. */
export const BRIDGE_ABSENT =
  'this Agent SDK has no `enableRemoteControl` on its `query()` object, so the session is not bridged to claude.ai: it runs on without one.';

/** What a run file says where the control request answered something this runtime does not read. */
export const bridgeUnread = (why: string): string =>
  `the \`enableRemoteControl\` control request answered what this runtime does not read (${why}): the session runs on with no bridge.`;

/** What a run file says where the control request itself failed. */
export const bridgeFailed = (why: string): string => `the claude.ai bridge was not opened (${why}): the session runs on without one.`;

/** How a resume re-attaches the bridge the run file kept, and whether its claude.ai session outlives this process. */
type Options = { reattachSessionId?: string; keepSessionOnExit?: boolean };

/**
 * How a session's bridge is opened: `keepSessionOnExit`, whether its claude.ai session outlives the process — true for a long-lived
 * session, which a later holder resumes and re-attaches, false for a job, whose claude.ai session ends with it — and `reattach`, the
 * claude.ai session a resume re-attaches, given only where it is kept.
 */
export type BridgeAsk = { keepSessionOnExit: boolean; reattach?: string };

/** The undeclared control request, as it is read off a `query()` object. */
type Enable = (enabled: boolean, name?: string, options?: Options) => Promise<unknown>;

/**
 * The control request read off `q`, or `undefined` where the SDK does not carry it. The one cast of the undeclared method, kept here so
 * it spreads no further.
 */
const enableOf = (q: unknown): Enable | undefined => {
  const found = (q as { enableRemoteControl?: unknown } | null | undefined)?.enableRemoteControl;
  return typeof found === 'function' ? (found as Enable).bind(q as object) : undefined;
};

/** Whether the SDK's `query()` object `q` can be bridged at all: the guard a caller asks before it asks for a bridge. */
export const bridgeable = (q: unknown): boolean => enableOf(q) !== undefined;

/**
 * Whether the bridge is due on the session's message `m`: its `system`/`init`, the first message a session gives, so a bridge asked
 * for is up before a job's one turn can end. False on any other message, and on what is no message.
 */
export const bridgeDue = (m: unknown): boolean => {
  const line = m as { type?: unknown; subtype?: unknown } | null | undefined;
  return line?.type === 'system' && line.subtype === 'init';
};

/**
 * Opens the claude.ai bridge of the session `name` on the `query()` object `q`, as `ask` says (`BridgeAsk`), and answers the facts
 * for its file: the bridge's links and ids, or `why` alone where the SDK has no such control request, where its answer does not
 * decode, or where it failed. Never throws: a session is not failed for want of a bridge.
 */
export const enableBridge = async (q: unknown, name: string, ask: BridgeAsk): Promise<AttachedBridge> => {
  const enable = enableOf(q);
  if (enable === undefined) return { why: BRIDGE_ABSENT };
  let answer: unknown;
  try {
    answer = await enable(true, name, {
      keepSessionOnExit: ask.keepSessionOnExit,
      ...(ask.reattach ? { reattachSessionId: ask.reattach } : {}),
    });
  } catch (err) {
    return { why: bridgeFailed(err instanceof Error ? err.message : String(err)) };
  }
  const read = decode(answer);
  if (Result.isFailure(read)) return { why: bridgeUnread(read.failure.message) };
  const { session_url: url, connect_url: connectUrl, environment_id: environmentId } = read.success;
  const { bridge_epoch: epoch, bridge_session_id: bridgeSessionId } = read.success;
  return { url, connectUrl, environmentId, epoch, bridgeSessionId };
};

/**
 * The bridge's state a `system` message says, as the stream carries it (`ready`, then `connected`), or `undefined` for any other
 * message: a value a harness gives, read as it is and never trusted to be a string.
 */
export const bridgeStateOf = (m: unknown): string | undefined => {
  const line = m as { type?: unknown; subtype?: unknown; state?: unknown } | null | undefined;
  if (line?.type !== 'system' || line.subtype !== 'bridge_state') return undefined;
  return typeof line.state === 'string' ? line.state : undefined;
};

/** The bridge a session's file kept, as a sighting says it: the link where one was opened, else why there is none, else nothing. */
export const bridgeOf = (bridge: AttachedBridge | undefined): Pick<Sighting, 'bridge'> => {
  if (bridge === undefined) return {};
  if (bridge.url !== undefined) return { bridge: { url: bridge.url } };
  return bridge.why === undefined ? {} : { bridge: { url: null, why: bridge.why } };
};
