/**
 * A Claude Code job's hold at its hooks (`bin/ae-claude-job.ts`): what its `PreToolUse`, `PostToolUse` and `PostToolUseFailure` hooks
 * do under the store's sessions' drain, and the look its process runs every poll. Kept apart from the bin, which runs a session as it
 * is imported, so a test drives the hooks without one.
 */
import type { HookCallbackMatcher, HookEvent } from '@anthropic-ai/claude-agent-sdk';
import { heldAtHook, type HookHold } from './attached-session.ts';
import { firstCall, HOOK_HOLD_S, inside, writeJobHold, type Call, type CallsInFlight, type JobHold } from './job-hold.ts';
import { elapsedMs } from '../../core/clock.ts';
import { sessionDrainOf } from '../../core/engine/drain.ts';
import { instantNow } from '../../core/engine/now.ts';

/** The files and bounds a job is held by (`HarnessIO`): its hold file, the store's sessions' drain, its hold's bound and its poll. */
export type HoldIO = { holdFile: string; drainFile: string; holdMs: number; holdPollMs: number };

/**
 * The job's hold: its calls in flight, kept by its hooks, and the sessions' drain, read off its file on every poll and at every new call.
 *
 * - A new call of the main thread waits at its `PreToolUse` hook while the drain stands and none of the session's calls is in flight
 *   (the attached sessions' rule, `attached.ts`), reading the drain again every `holdPollMs`, through the one hold at a hook a held
 *   session keeps too (`heldAtHook`); a call that belongs to a call in flight — a sub-agent's (`inside`) — is never held, or the call it
 *   belongs to could never end, and a main-thread call that comes or waited as the job parks is answered nothing once its signal aborts.
 *   Its hook's timeout is `HOOK_HOLD_S`, over the job's own bound, so Claude Code never answers for it first.
 * - Every `holdPollMs`, the drain read: past its `at` plus its `graceMs` with a call in flight, the call is cut; past its `at` plus
 *   `holdMs`, the job gives up its hold. Either way it parks (`park`): `parked` written on the hold file, with the call it cut as its
 *   `calling`, and `ended` told to end the session.
 * - The hold file says, as it changes: the earliest call in flight (`calling`), the drain read standing (`draining`, since this process
 *   first read it), a call waiting at its hook (`heldBack`, since the first of them began to wait, and `after`, the main-thread call
 *   that ended last, kept by its `PostToolUse` or `PostToolUseFailure` hook); the last two gone once the drain is read lifted. Once
 *   parked it says `parked`, and nothing after.
 */
export const jobHoldOf = (io: HoldIO, ended: () => void) => {
  const calls: CallsInFlight = new Map();
  const waiting: string[] = [];
  let draining: string | undefined;
  let after: { tool: string } | undefined;
  let parked: JobHold['parked'];
  let written: string | undefined;
  const write = (): void => {
    const first = firstCall(calls);
    const hold: JobHold = {
      ...(first && !parked ? { calling: first } : {}),
      ...(draining ? { draining: { since: draining } } : {}),
      ...(waiting[0] && !parked ? { heldBack: { since: waiting[0], ...(after ? { after } : {}) } } : {}),
      ...(parked ? { parked } : {}),
    };
    const text = JSON.stringify(hold);
    if (text === written) return;
    writeJobHold(io.holdFile, hold);
    written = text;
  };
  const drain = () => {
    const read = sessionDrainOf(io.drainFile);
    draining = read === null ? undefined : (draining ?? new Date().toISOString());
    return read;
  };
  const park = (calling: Call | undefined): void => {
    parked = { at: new Date().toISOString(), ...(calling ? { calling } : {}) };
    write();
    ended();
  };
  const look = (): void => {
    if (parked) return;
    const read = drain();
    if (read !== null) {
      const since = elapsedMs({ at: Date.parse(read.at) }, instantNow());
      if (calls.size > 0 && since >= read.graceMs) return park(firstCall(calls));
      if (since >= io.holdMs) return park(firstCall(calls));
    }
    write();
  };
  const held = (): boolean => !parked && drain() !== null && calls.size === 0;
  const over = async (input: unknown, id: string | undefined) => {
    const ended = id === undefined ? undefined : calls.get(id);
    if (ended && !inside(input)) after = { tool: ended.tool };
    if (id && calls.delete(id) && !parked) write();
    return {};
  };
  const hold: HookHold = {
    held,
    over: () => parked !== undefined,
    waits: (since) => void waiting.push(since),
    waited: (since) => void waiting.splice(waiting.indexOf(since), 1),
    polled: write,
    pollMs: io.holdPollMs,
    calls,
  };
  /**
   * The matchers leave `onFailure` (SDK 0.3.317 and after) at its default, `continue`: a hold is not a fence, so a callback that throws
   * lets its call go on to the permission flow, where `block` would stop every call of the step on one failed read of the drain. Every
   * callback here and in the attached session's (`hooksOf`) returns on every path: one that returns nothing counts as failing.
   */
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {
    PreToolUse: [
      {
        timeout: HOOK_HOLD_S,
        hooks: [
          async (input, id, { signal }) => {
            const cut = await heldAtHook(hold, input, id, signal);
            if (cut) return cut;
            write();
            return {};
          },
        ],
      },
    ],
    PostToolUse: [{ hooks: [over] }],
    PostToolUseFailure: [{ hooks: [over] }],
  };
  return { hooks, look };
};
