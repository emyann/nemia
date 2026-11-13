/**
 * The factories' schedules (`schedulesRead`): started when due by the tick (`startDue`, through `startRun`, the start a person's takes),
 * and written by `nemia factory schedule` and `unschedule`, entries of the command table the api serves as a Schedule's writes,
 * `/api/namespaces/:namespace/schedules/:name`. No level is read here: a schedule is the daemon's, and starts at every level.
 */
import { StoreRoot } from '../../config/root.store.ts';
import path from 'node:path';
import { Cause, Effect, Exit, Schema } from 'effect';
import { FACTORY_SCHEDULE_WORDS, FACTORY_UNSCHEDULE_WORDS, ScheduleWrite } from 'objects';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import type { Run } from '../../record/record.ts';
import { isDue, schedulesRead, type Read } from './listed.store.ts';
import { workflowFolder } from '../../folder/folder.store.ts';
import { scheduleOf, scheduleRefused } from '../door/factories.store.ts';
import { wire } from '../wiring/wire.verb.ts';
import { unscheduledRefusal } from '../factory.ts';
import { Missing } from '../../refusal/refusal.ts';
import type { Schedule } from '../factory.ts';
import { startRun, wiredRepoFor } from '../../start/start.verb.ts';
import { putScheduleTry } from './schedule.store.ts';
import type { ScheduleStarted, ScheduleTry } from './schedule.ts';

/** A failure in one line, its lines joined by ` / `. */
const oneLine = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join(' / ');

/**
 * The start of the schedule read `r` for its fire `due`, as a person's `nemia start --factory` is: on the repository the factory's wiring
 * names for its workflow, else its only one (`wiredRepoFor`), whatever retired `repo` an old schedule names; its folder the factory's
 * tree's before the repository's `workflows/` when it is made from a template. Refused, `Invalid`, naming the attach, where the wiring
 * places the workflow on none of its repositories, and `Missing` where the factory is no longer filed.
 */
const started = (home: string, r: Read, due: string) =>
  Effect.suspend(() => {
    const repo = wiredRepoFor(home, r.factory.name, r.workflow);
    if (repo === undefined)
      return Effect.fail(
        new Missing({
          message: `The factory ${r.factory.name} is no longer filed, so its schedule of ${r.workflow} starts nothing: see the factories with nemia factory ls. Nothing was started.`,
        }),
      );
    return startRun({
      brief: r.schedule.brief,
      repo,
      repoNamed: false,
      workflowDir: workflowFolder(r.workflow, path.join(r.factory.tree ?? repo, 'workflows'), repo, r.factory.tree),
      factory: r.factory.name,
      scheduled: { factory: r.factory.name, workflow: r.workflow, due },
    });
  });

/**
 * The tick's scheduled start: the first schedule due (`scheduleDue`), factories by name, then workflows by name, started through `startRun`
 * on the repository the factory's wiring names for the workflow (`started`); one a pass, none when none is due. Its try is kept for its
 * fire (`putScheduleTry`): a start, so a removed run does not bring its fire back; a refusal (exit 2), not tried again until the next
 * fire; a failure, tried again on the next pass and said as `again` while it reads the same. A try that cannot be written is said all the
 * same.
 */
export const startDue = Effect.fn('startDue')(function* (runs: readonly Run[], now: number = Date.now()) {
  const home = yield* StoreRoot;
  const due = schedulesRead(home, runs, now).find(isDue);
  if (!due) return undefined;
  const at = { factory: due.factory.name, workflow: due.workflow, due: new Date(due.fires.latest).toISOString() };
  const exit = yield* Effect.exit(started(home, due, at.due));
  const keep = (tried: ScheduleTry): void => {
    try {
      putScheduleTry(home, at.factory, at.workflow, tried);
    } catch {}
  };
  if (Exit.isSuccess(exit)) {
    keep({ due: at.due, at: new Date().toISOString(), run: exit.value.id });
    return { ...at, run: exit.value.id } satisfies ScheduleStarted;
  }
  const err = Cause.squash(exit.cause);
  const why = oneLine(err);
  const refused = (err as { exitCode?: number }).exitCode === 2;
  const last = due.kept;
  if (!refused && last && !last.refused && last.run === undefined && last.due === at.due && last.why === why)
    return { ...at, failed: why, again: true } satisfies ScheduleStarted;
  keep({ due: at.due, at: new Date().toISOString(), why, refused });
  return (refused ? { ...at, refused: why } : { ...at, failed: why, again: false }) satisfies ScheduleStarted;
});

/** What `nemia factory schedule` answers: the file written, the schedule, and the one it replaced, or null. */
type Scheduled = { file: string; schedule: Schedule; replaced: Schedule | null };

/** What `nemia factory schedule` takes: the factory, the workflow, and the Schedule's write (`objects`' `ScheduleWrite`). */
export const ScheduleInput = Schema.Struct({ ...ScheduleWrite.fields, factory: Schema.String, workflow: Schema.String });
export type ScheduleInput = typeof ScheduleInput.Type;

/** What `nemia factory unschedule` takes: the factory, and the workflow whose schedule is taken back. */
export const UnscheduleInput = Schema.Struct({ factory: Schema.String, workflow: Schema.String });
export type UnscheduleInput = typeof UnscheduleInput.Type;

/** `nemia factory schedule`: a workflow the factory has attached, started by the daemon at each fire of its cron. */
export const FACTORY_SCHEDULE: Served<Scheduled, ScheduleInput> = {
  ...FACTORY_SCHEDULE_WORDS,
  input: ScheduleInput,
  handler: ({ factory, workflow, cron, brief, repo, tz }) => {
    const opts = { workflow, cron, brief, ...(repo ? { repo } : {}), ...(tz ? { tz } : {}) };
    const schedule = scheduleOf(opts);
    return Effect.map(
      wire(factory, { verb: 'schedule', workflow, schedule }, (named) => scheduleRefused(named, opts)),
      ({ was, file }) => ({ file, schedule, replaced: was.schedules[workflow] ?? null }),
    );
  },
};

/** `nemia factory unschedule`: a workflow's schedule taken back. */
export const FACTORY_UNSCHEDULE: Served<{ file: string; cleared: Schedule }, UnscheduleInput> = {
  ...FACTORY_UNSCHEDULE_WORDS,
  input: UnscheduleInput,
  handler: ({ factory, workflow }) => {
    return Effect.gen(function* () {
      const { was, file } = yield* wire(factory, { verb: 'unschedule', workflow });
      const cleared = was.schedules[workflow];
      if (cleared === undefined)
        return yield* Effect.fail(new Missing({ message: unscheduledRefusal(factory, workflow, Object.keys(was.schedules)) }));
      return { file, cleared };
    });
  },
};

/** `nemia factory schedule` and `unschedule`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_SCHEDULES: readonly Served[] = [tableEntry(FACTORY_SCHEDULE), tableEntry(FACTORY_UNSCHEDULE)];
