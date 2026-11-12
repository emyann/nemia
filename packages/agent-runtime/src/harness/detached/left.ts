/**
 * What a detached run left behind once its worker has ended or is gone, and the signal it is sent (`leftSignal`): the processes still
 * in its harness's process group (`groupLeft`), which nobody else is left to stop. A stop's grace is measured from the first time one
 * was asked, an instant kept in the run's `.stop` file (`firstAsked`), so a pass carries nothing in memory and a restart loses nothing.
 * What `stop` and `release` share (`detached.ts`, `stopRunOf`).
 */
import fs from 'node:fs';
import { Option, Schema } from 'effect';
import type { LeftSignalOf } from '../../../contracts/left.contract.ts';
import { alive, processStart } from '../../process/alive.ts';
import type { Instant } from '../../core/clock.ts';

/**
 * The signal sent to what a run left (`left.contract.ts`): nothing where nothing is left; SIGTERM at the first ask and within the
 * grace since it; SIGKILL past it, an age that cannot be read (`NaN`) included.
 */
export const leftSignal: LeftSignalOf = (left, askedAgoMs, graceMs) =>
  !left ? 'none' : askedAgoMs === undefined || askedAgoMs <= graceMs ? 'SIGTERM' : 'SIGKILL';

/**
 * The process group `harness` led that still holds a process, to signal; `undefined` where none is recorded, its group is empty or
 * another user's, or its leader's pid is another process's now: alive, and started at another time than the recorded one. A leader
 * gone leaves its group's number to its members, never to a new process, so a group whose leader died is still the run's.
 */
export const groupLeft = (harness: { pid: number; start?: string } | undefined): number | undefined => {
  if (harness === undefined || !Number.isInteger(harness.pid) || harness.pid <= 1) return undefined;
  const { pid, start } = harness;
  if (start !== undefined && alive(pid) && processStart(pid) !== start) return undefined;
  try {
    process.kill(-pid, 0);
    return pid;
  } catch {
    return undefined;
  }
};

/** A stop's first ask, as the `.stop` file keeps it: an instant on both clocks. */
const AskedSchema = Schema.Struct({
  at: Schema.Finite,
  mono: Schema.optional(Schema.Struct({ boot: Schema.String, ms: Schema.Finite })),
});
const decodeAsked = Schema.decodeUnknownOption(AskedSchema);

/** The first ask `file` keeps; `undefined` where there is no file, or it is empty (as a stop wrote it before) or unreadable. */
const askedIn = (file: string): Instant | undefined => {
  try {
    const decoded = decodeAsked(JSON.parse(fs.readFileSync(file, 'utf8')));
    return Option.isSome(decoded) ? decoded.value : undefined;
  } catch {
    return undefined;
  }
};

/**
 * The first time a stop was asked of the run whose stop file is `file`, and whether that is `now`: the instant kept there, else `now`,
 * written there. The worker reads the file by its existence alone, so what it holds is the runner's.
 */
export const firstAsked = (file: string, now: Instant): { at: Instant; first: boolean } => {
  const kept = askedIn(file);
  if (kept) return { at: kept, first: false };
  fs.writeFileSync(file, JSON.stringify(now));
  return { at: now, first: true };
};
