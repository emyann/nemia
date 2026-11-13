/**
 * The plan's utilization as Claude Code's sessions heard it: the newest `rate_limit_event` any session this store runs received, kept in
 * one file of the store (`claudeHeardFile`) and read by the quota (`claudeQuota`) where `get_usage` has no limits to give — a machine
 * signed in by a long-lived token, whose `get_usage` answers `rate_limits_available: false` (`docs/harness.md`, *The quota of a token*).
 * The event comes with a model turn, whatever the token's scopes, so a session that spends anyway says it for free.
 *
 * A job's own process keeps it (`bin/ae-claude-job.ts`, on the file its runner names, `HarnessIO.heardFile`), and so does a session held
 * in the holder's process (`attached-session.ts`). Nothing is kept per run: one file, the newest event that names a window, and the time
 * it was received, which the event itself does not carry. What is read from it is decoded by its schema first; what does not decode is
 * unread, never absent.
 */
import path from 'node:path';
import { Option, Schema } from 'effect';
import { decodedFile, writeWhole } from '../../core/engine/drain.ts';
import type { HeardLimit, HeardQuota } from '../seam.ts';

/** A window's status, as the SDK words the event's own (`SDKRateLimitInfo.status`, `sdk.d.ts:6094`). */
const Status = Schema.Literals(['allowed', 'allowed_warning', 'rejected']);

/**
 * One window of `unifiedWindows`: its use as a fraction (0.4 is 40%), when it begins again in seconds since the epoch, and its status.
 * The SDK's type (`SDKRateLimitInfo`, `sdk.d.ts:6093`) does not declare `unifiedWindows`; Claude Code sends it all the same (measured,
 * `docs/harness.md`, *The plan's utilization a session hears*).
 */
const UnifiedWindow = Schema.Struct({
  utilization: Schema.Finite.check(Schema.isGreaterThanOrEqualTo(0)),
  resetsAt: Schema.optional(Schema.Finite),
  status: Status,
});

/** The fields of an event's `rate_limit_info` the runtime reads: its windows, by Claude Code's key (`five_hour`, `seven_day`, …). */
export const RateLimitInfoSchema = Schema.Struct({
  unifiedWindows: Schema.optional(Schema.Record(Schema.String, UnifiedWindow)),
});

/** The kept reading, as its file holds it (`HeardQuota`). */
const HeardSchema = Schema.Struct({
  at: Schema.String.check(Schema.makeFilter((t: string) => Number.isFinite(Date.parse(t)) || 'Expected a date and time')),
  limits: Schema.Array(
    Schema.Struct({ key: Schema.String, usedPercentage: Schema.Finite, resetsAt: Schema.NullOr(Schema.String), status: Status }),
  ),
});

const decodeInfo = Schema.decodeUnknownOption(RateLimitInfoSchema);
const decodeHeard = Schema.decodeUnknownOption(HeardSchema);

/** Where the store at `root` keeps the newest event its Claude Code sessions heard: one file, for every session. */
export const claudeHeardFile = (root: string): string => path.join(root, 'quota', 'claude.json');

/**
 * What an event's `rate_limit_info` says, received at `at` (ms since the epoch): each window of its `unifiedWindows`, its use in percent
 * to a tenth, its reset ISO or null, and its status. Null where it does not decode, or names no window. Pure.
 */
export function heardOf(info: unknown, at: number): HeardQuota | null {
  const decoded = Option.getOrNull(decodeInfo(info));
  const windows = Object.entries(decoded?.unifiedWindows ?? {});
  if (!windows.length) return null;
  const limits = windows.map(([key, w]): HeardLimit => ({
    key,
    usedPercentage: Math.round(w.utilization * 1000) / 10,
    resetsAt: w.resetsAt === undefined ? null : new Date(w.resetsAt * 1000).toISOString(),
    status: w.status,
  }));
  return { at: new Date(at).toISOString(), limits };
}

/** The newest reading the store's sessions heard, kept on `file`; null where none is, or it does not decode. */
export const readHeard = (file: string): HeardQuota | null => {
  const held = decodedFile(file, decodeHeard);
  return held && { at: held.at, limits: held.limits.map((l) => ({ ...l })) };
};

/**
 * Keeps the event `info` a session received at `at` on `file`, written whole, where it names a window (`heardOf`) and no reading received
 * later is kept there already: sessions run side by side, and the newest is the one the plan is at. Answers whether it was kept. Never
 * throws: what a session hears of the plan is not worth its turn, so a write that fails answers `false` and leaves the reading before it.
 */
export const keepHeard = (file: string, info: unknown, at: number): boolean => {
  const heard = heardOf(info, at);
  if (heard === null) return false;
  const held = readHeard(file);
  if (held !== null && Date.parse(held.at) > at) return false;
  try {
    writeWhole(file, heard);
    return true;
  } catch {
    return false;
  }
};
