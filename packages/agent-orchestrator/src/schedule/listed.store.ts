/**
 * The factories' schedules as they read now: each with its fires around now, the tick's kept try and its last run (`schedulesRead`), due
 * or not (`isDue`), and listed as `nemia ls` and the api list them (`schedulesListed`).
 */
import type { Run } from '../record/record.ts';
import type { RecordMemo } from '../rest/index.ts';
import { readFactories } from '../factory/factory.store.ts';
import type { Factory, Schedule } from '../factory/factory.ts';
import { firesOf, readScheduleTry } from './schedule.store.ts';
import { scheduleDue, settledFire, type ScheduleListed, type ScheduleTry } from './schedule.ts';

/** What a schedule reads of a run: which fire of which schedule started it, and the run itself, for its last run's line. */
export type ScheduleRun = Pick<Run, 'id' | 'createdAt' | 'scheduled'>;

/** The memo a caller that polls the factories keeps of what their schedules read of every run. */
export type ScheduleRuns = RecordMemo<ScheduleRun>;

/** A schedule as a pass reads it: its factory and workflow, what the factory's file says, its fires around now, and the tick's kept try. */
export type Read = {
  factory: Factory;
  workflow: string;
  schedule: Schedule;
  fires: { latest: number; next: number } | { error: string };
  kept: ScheduleTry | undefined;
  last: ScheduleRun | undefined;
};

/** The newest run `runs` holds that the schedule of `workflow` in `factory` started, by the fire it was started for. */
const lastRun = (runs: readonly ScheduleRun[], factory: string, workflow: string): ScheduleRun | undefined =>
  runs
    .flatMap((run) => {
      const scheduled = run.scheduled;
      return scheduled?.factory === factory && scheduled.workflow === workflow ? [{ run, due: Date.parse(scheduled.due) }] : [];
    })
    .sort((a, b) => b.due - a.due)[0]?.run;

/** Every schedule of every factory that reads, factories by name, then workflows by name, each read at `now`. */
export function schedulesRead(runs: readonly ScheduleRun[], now: number): Read[] {
  return readFactories()
    .filter((f): f is Factory & { file: string } => !('error' in f))
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((factory) =>
      Object.entries(factory.schedules)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([workflow, schedule]) => {
          return {
            factory,
            workflow,
            schedule,
            fires: firesOf(schedule, now),
            kept: readScheduleTry(factory.name, workflow),
            last: lastRun(runs, factory.name, workflow),
          };
        }),
    );
}

/** Whether the schedule read is due now (`scheduleDue`): never when its cron gives no fire. */
export const isDue = (r: Read): r is Read & { fires: { latest: number; next: number } } =>
  !('error' in r.fires) &&
  scheduleDue({
    latest: r.fires.latest,
    since: Date.parse(r.schedule.since),
    last: r.last?.scheduled ? Date.parse(r.last.scheduled.due) : undefined,
    settled: settledFire(r.kept),
  });

/** The last run of a schedule read: its newest run in the store, else the run its kept try started, when that record is gone. */
function lastOf(r: Read): ScheduleListed['last'] {
  if (r.last) return { run: r.last.id, at: r.last.createdAt };
  return r.kept?.run ? { run: r.kept.run, at: r.kept.at } : null;
}

/** Why the schedule read does not start: its cron gives no fire, or its kept try refused its latest fire; null otherwise. */
function refusedOf(r: Read): string | null {
  if ('error' in r.fires) return r.fires.error;
  return r.kept?.refused && Date.parse(r.kept.due) === r.fires.latest ? (r.kept.why ?? null) : null;
}

/** Every factory's schedules as `nemia ls` and the api list them (`ScheduleListed`), at `now`. */
export function schedulesListed(runs: readonly ScheduleRun[], now: number = Date.now()): ScheduleListed[] {
  return schedulesRead(runs, now).map((r) => ({
    factory: r.factory.name,
    workflow: r.workflow,
    cron: r.schedule.cron,
    tz: r.schedule.tz ?? null,
    brief: r.schedule.brief,
    repo: r.schedule.repo ?? null,
    next: 'error' in r.fires ? null : new Date(r.fires.next).toISOString(),
    last: lastOf(r),
    refused: refusedOf(r),
  }));
}
