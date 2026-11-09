/**
 * What a held session and a held job share: how long a call may wait at its `PreToolUse` hook, which call belongs to a sub-agent and is
 * never held, the calls in flight a session keeps, and the two files a Claude Code job holds by — the store's sessions' drain, which says
 * every session, job or attached, is to stop at its call's end, and the job's own hold file, which says what it is doing about it.
 *
 * The sessions' drain is the runtime's record (`core/engine/drain.ts`), apart from the holder's. It carries when it was put and its
 * grace, so a job that reads it judges by itself, on every poll, whether its call has outlived the grace or its hold the bound
 * (`bin/ae-claude-job.ts`), and a holder, on every look, whether an attached session's call has (`attached.ts`): nothing is carried
 * between two reads but the file.
 *
 * The hold file is the job's word on what it was doing, written whole as it changes (`replaceFile`), and read by the
 * runner's look beside its run: a call in flight (`calling`), a drain read standing (`draining`), a call waiting at its hook
 * (`heldBack`), and its end under the drain (`parked`, with the call it cut). Both files are decoded by their schema, and one that does
 * not decode is read as absent.
 */
import { Schema } from 'effect';
import { decodedFile, writeWhole } from '../../core/engine/drain.ts';

/** How long a call is held at its hook before Claude Code answers for it, in seconds: a day, longer than any drain. */
export const HOOK_HOLD_S = 86_400;

/**
 * How long a job is held under a drain before it gives up and parks, in milliseconds: 23 h, an hour under `HOOK_HOLD_S`, so Claude
 * Code's own timeout of the hook never fires first and lets a held call run under a pause. A job's request shortens it (`holdMs`).
 */
export const JOB_HOLD_MS = 23 * 3_600_000;

/** How often a job reads the drain file, in milliseconds, held or not. A job's request shortens it (`holdPollMs`). */
export const JOB_HOLD_POLL_MS = 250;

/**
 * Whether the call a `PreToolUse` hook was given belongs to a call already in flight: the SDK marks a sub-agent's call with
 * `agent_id`, and absent for the main thread (the SDK's hook input), so such a call is answered however the session's calls are held.
 */
export const inside = (input: unknown): boolean => typeof (input as { agent_id?: unknown }).agent_id === 'string';

/** A call in flight: the tool it calls, and since when (ISO). */
export type Call = { tool: string; since: string };

/** A session's calls in flight, by the call's id, as its hooks keep them. */
export type CallsInFlight = Map<string, Call>;

/** The earliest of `calls`: what a file names as `calling`; nothing where none is in flight. */
export const firstCall = (calls: CallsInFlight): Call | undefined => [...calls.values()].sort((a, b) => a.since.localeCompare(b.since))[0];

/** The call a `PreToolUse` hook was given, written in flight under `id` with its tool, as its hook names it. */
export const callStarted = (calls: CallsInFlight, id: string | undefined, input: unknown): void => {
  const tool = (input as { tool_name?: unknown }).tool_name;
  if (id) calls.set(id, { tool: typeof tool === 'string' ? tool : 'a tool', since: new Date().toISOString() });
};

const CallSchema = Schema.Struct({ tool: Schema.String, since: Schema.String });

const JobHoldSchema = Schema.Struct({
  calling: Schema.optional(CallSchema),
  draining: Schema.optional(Schema.Struct({ since: Schema.String })),
  heldBack: Schema.optional(Schema.Struct({ since: Schema.String, after: Schema.optional(Schema.Struct({ tool: Schema.String })) })),
  parked: Schema.optional(Schema.Struct({ at: Schema.String, calling: Schema.optional(CallSchema) })),
});

/** A job's hold file: its call in flight, the drain it read standing, a call waiting at its hook, and its end under the drain. */
export type JobHold = typeof JobHoldSchema.Type;

const decodeHold = Schema.decodeUnknownOption(JobHoldSchema);

/** The job's hold file `file`; `null` where it is absent or does not decode. */
export const readJobHold = (file: string): JobHold | null => decodedFile(file, decodeHold);

/** Writes `hold` whole on the job's hold file `file`. */
export const writeJobHold = (file: string, hold: JobHold): void => writeWhole(file, hold);
