/**
 * The claude.ai bridge of an attached session, behind one door.
 *
 * The Agent SDK's `query()` object carries a control request the SDK does not declare on its `Query` type:
 * `enableRemoteControl(enabled, name?, { reattachSessionId?, keepSessionOnExit?, workSecret? })`, which answers the bridge's facts and
 * drives `system` `bridge_state` messages onto the session's stream. Because it is undeclared, it is read off the object here and
 * nowhere else, its answer decoded by a schema of its own before anything is written from it, and refused in words where the method is
 * not there: the session runs on with no bridge, and its run file says why.
 */
import { Result, Schema } from 'effect';
import type { AttachedBridge } from './attached-file.ts';

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

/** How a resume re-attaches the bridge the run file kept, and keeps its claude.ai session alive past this process. */
type Options = { reattachSessionId?: string; keepSessionOnExit?: boolean };

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
 * Opens the claude.ai bridge of the session `name` on the `query()` object `q`, re-attaching the claude.ai session `reattach` where the
 * run file kept one, and answers the facts for its run file: the bridge's links and ids, or `why` alone where the SDK has no such
 * control request, where its answer does not decode, or where it failed. Never throws: a session is not failed for want of a bridge.
 */
export const enableBridge = async (q: unknown, name: string, reattach?: string): Promise<AttachedBridge> => {
  const enable = enableOf(q);
  if (enable === undefined) return { why: BRIDGE_ABSENT };
  let answer: unknown;
  try {
    answer = await enable(true, name, { keepSessionOnExit: true, ...(reattach ? { reattachSessionId: reattach } : {}) });
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
