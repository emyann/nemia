/**
 * When a factory's schedule of a workflow is due, and the words its starts and its listing say: pure, over instants in milliseconds the
 * caller read off the cron (`schedule.store.ts`), the factory's file, the run records and the tick's kept try.
 */
import { durationWord } from '../status/status.ts';

/**
 * What the tick keeps of a schedule's last try (`schedules/<factory>/<workflow>.json`): the fire it was for (`due`), when (`at`), and the
 * run it started, or why it did not — `refused` a lasting refusal, kept until the next fire, else a failure tried again next pass.
 */
export type ScheduleTry = { due: string; at: string; run?: string; why?: string; refused?: boolean };

/** The fire a kept try settled, a start or a lasting refusal, in milliseconds; none for a failure, which the next pass tries again. */
export const settledFire = (kept: ScheduleTry | undefined): number | undefined =>
  kept && (kept.run !== undefined || kept.refused === true) ? Date.parse(kept.due) : undefined;

/**
 * Whether a schedule starts a run on this pass: its latest fire (`latest`) is later than when it was written (`since`), than the newest run
 * it started (`last`, by the fire that run was for), and than the fire its kept try settled (`settled`). Only the latest fire is compared,
 * so a daemon down across three fires starts one run, and a run removed from the store does not bring its fire back while its try stands.
 */
export function scheduleDue(at: { latest: number; since: number; last?: number; settled?: number }): boolean {
  return at.latest > at.since && at.latest > (at.last ?? -Infinity) && at.latest > (at.settled ?? -Infinity);
}

/**
 * What one pass did with the schedules: started one, kept a lasting refusal, or failed and tries again on the next pass (`again`: the
 * same failure as the last try's, said once).
 */
export type ScheduleStarted =
  | { factory: string; workflow: string; due: string; run: string }
  | { factory: string; workflow: string; due: string; refused: string }
  | { factory: string; workflow: string; due: string; failed: string; again: boolean };

/** The line `nemia up` says of a pass's scheduled start. */
export function scheduleLine(s: ScheduleStarted): string {
  const named = `${s.factory}/${s.workflow}`;
  if ('refused' in s) {
    return `${named} not started for its fire at ${s.due}: ${s.refused} — not tried again until its next fire: fix what it says, or nemia factory unschedule ${s.factory} ${s.workflow}`;
  }
  if ('failed' in s) {
    return `${named} not started for its fire at ${s.due}: ${s.failed} — not a refusal: tried again on the next pass, and said again only if it fails otherwise`;
  }
  return `started ${named} as ${s.run}, for its fire at ${s.due}`;
}

/** A schedule as `nemia ls` and the api list it: its next fire and last scheduled run, and the kept refusal of its latest fire. */
export type ScheduleListed = {
  factory: string;
  workflow: string;
  cron: string;
  tz: string | null;
  brief: string;
  repo: string | null;
  next: string | null;
  last: { run: string; at: string } | null;
  refused: string | null;
};

/** An instant `iso` as `nemia ls` says a schedule's fire or run at `now`: the instant, and how far off it is (`in 3d23h`, `2h05m ago`). */
export function fireWord(iso: string, now: number): string {
  const ms = Date.parse(iso) - now;
  return `${iso}, ${ms >= 0 ? `in ${durationWord(ms)}` : `${durationWord(-ms)} ago`}`;
}

/**
 * The lines `nemia ls` prints after the runs, one per schedule and a second for a kept refusal; none without a schedule. `clock` words an
 * instant as the listing does.
 */
export function scheduleLines(schedules: readonly ScheduleListed[], clock: (iso: string) => string): string[] {
  return schedules.flatMap((s) => [
    `scheduled  ${s.factory}/${s.workflow}  ${s.cron}${s.tz ? ` (${s.tz})` : ''}  next ${s.next ? clock(s.next) : 'never'}  last ${s.last ? `${s.last.run} (${clock(s.last.at)})` : 'none'}`,
    ...(s.refused ? [`  refused: ${s.refused}`] : []),
  ]);
}
