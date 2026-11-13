/**
 * The factories' schedules (`schedulesRead`): started when due by the tick (`startDue`, through `startRun`, the start a person's takes),
 * and written by `nemia factory schedule` and `unschedule`, entries of the command table the api serves as a Schedule's writes,
 * `/api/namespaces/:namespace/schedules/:name`. No level is read here: a schedule is the daemon's, and starts at every level.
 */
import { renamed } from '../../command/requests.verb.ts';
import { StoreRoot } from '../../config/root.store.ts';
import path from 'node:path';
import { Cause, Effect, Exit, Schema } from 'effect';
import { ScheduleWrite } from 'objects';
import { leftOut, type Args, type Flag, type Spec } from '../../command/command.ts';
import type { Command } from '../../command/entry.verb.ts';
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

/** The text under `key`: what the spec read there, or empty. */
const textOf = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/** A value flag of `nemia factory schedule`, named in its refusals as `takes` says. */
const valueFlag = (flag: string, key: string, takes: string): Flag => ({
  flag,
  kind: 'text',
  key,
  takes: `${flag} takes ${takes}: nemia factory schedule <factory> <workflow> --cron "0 9 * * 1" --brief "Read the stats"`,
  twice: `nemia factory schedule takes ${flag} once: a workflow has one schedule in a factory.`,
});

/**
 * `--repo`, retired and out of the usage: kept so a schedule that names one is read and refused naming the attach that places its runs
 * (`scheduleRepoRefusal`), never refused as a flag the command does not take.
 */
const RETIRED_REPO: Flag = {
  flag: '--repo',
  kind: 'text',
  key: 'repo',
  takes: `--repo is retired: a scheduled run works on the repository the factory's wiring names for its workflow. Leave it out, and place its runs with nemia factory attach <factory> <workflow> --repo <name>.`,
  twice: `--repo is retired: leave it out, and place a schedule's runs with nemia factory attach <factory> <workflow> --repo <name>.`,
};

const USAGE = '<factory> <workflow> --cron <expr> --brief <text> [--tz <zone>]';

const SCHEDULE_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
  ],
  flags: [
    valueFlag('--cron', 'cron', 'a cron expression of five or six fields'),
    valueFlag('--brief', 'brief', 'what each run is asked'),
    RETIRED_REPO,
    valueFlag('--tz', 'tz', 'an IANA time zone, such as America/Montreal'),
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory schedule does not take ${arg}: nemia factory schedule ${USAGE}.`
      : `nemia factory schedule takes one workflow, and ${arg} is a second: nemia factory schedule ${USAGE}, once per workflow.`,
  apart: (_value, flag) => `${flag} is given no value: nemia factory schedule ${USAGE}.`,
  missing: `nemia factory schedule takes the factory, then the workflow, by its folder's name: nemia factory schedule ${USAGE}. Nothing was scheduled.`,
};

/** Why `nemia factory schedule`'s arguments are refused before anything is read: a `--cron` or a `--brief` left out, or a value empty. */
function scheduleCheck(args: Args): string | null {
  for (const key of ['cron', 'brief'])
    if (!textOf(args, key)) return `nemia factory schedule takes --${key}: nemia factory schedule ${USAGE}. Nothing was scheduled.`;
  return leftOut(SCHEDULE_SPEC, args);
}

/** What `nemia factory schedule` answers: the file written, the schedule, and the one it replaced, or null. */
type Scheduled = { file: string; schedule: Schedule; replaced: Schedule | null };

/** What `nemia factory schedule` takes: the factory, the workflow, and the Schedule's write (`objects`' `ScheduleWrite`). */
export const ScheduleInput = Schema.Struct({ ...ScheduleWrite.fields, factory: Schema.String, workflow: Schema.String });
export type ScheduleInput = typeof ScheduleInput.Type;

/** What `nemia factory unschedule` takes: the factory, and the workflow whose schedule is taken back. */
export const UnscheduleInput = Schema.Struct({ factory: Schema.String, workflow: Schema.String });
export type UnscheduleInput = typeof UnscheduleInput.Type;

/** `nemia factory schedule`: a workflow the factory has attached, started by the daemon at each fire of its cron. */
export const FACTORY_SCHEDULE: Command<Scheduled, ScheduleInput> = {
  name: 'factory schedule',
  served: [{ endpoint: 'schedules.put', request: renamed({ factory: 'namespace', workflow: 'name' }) }],
  usage: USAGE,
  help: ['start a run of an attached workflow at each fire of a cron, by the', 'daemon, at every level; a second replaces the first'],
  spec: SCHEDULE_SPEC,
  check: scheduleCheck,
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Schedule's `put`, whose handler calls this one by its `input`",
  },
  input: ScheduleInput,
  handler: ({ factory, workflow, cron, brief, repo, tz }) => {
    const opts = { workflow, cron, brief, ...(repo ? { repo } : {}), ...(tz ? { tz } : {}) };
    const schedule = scheduleOf(opts);
    return Effect.map(
      wire(factory, { verb: 'schedule', workflow, schedule }, (named) => scheduleRefused(named, opts)),
      ({ was, file }) => ({ file, schedule, replaced: was.schedules[workflow] ?? null }),
    );
  },
  print: ({ file, schedule, replaced }, { factory, workflow }) => [
    `${factory}  ${workflow} at ${schedule.cron}${schedule.tz ? ` (${schedule.tz})` : ''}${replaced ? ` (was ${replaced.cron})` : ''}`,
    `scheduled: ${file} — its first run starts at its next fire`,
  ],
};

const UNSCHEDULE_USAGE = '<factory> <workflow>';

/** `nemia factory unschedule`: a workflow's schedule taken back. */
export const FACTORY_UNSCHEDULE: Command<{ file: string; cleared: Schedule }, UnscheduleInput> = {
  name: 'factory unschedule',
  served: [{ endpoint: 'schedules.delete', request: renamed({ factory: 'namespace', workflow: 'name' }) }],
  usage: UNSCHEDULE_USAGE,
  help: ["take a workflow's schedule back: the daemon starts it no more"],
  spec: {
    positionals: SCHEDULE_SPEC.positionals,
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory unschedule does not take ${arg}: nemia factory unschedule ${UNSCHEDULE_USAGE}.`
        : `nemia factory unschedule takes one workflow, and ${arg} is a second: nemia factory unschedule ${UNSCHEDULE_USAGE}, once per workflow.`,
    missing: `nemia factory unschedule takes the factory, then the workflow: nemia factory unschedule ${UNSCHEDULE_USAGE}. Nothing was unscheduled.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Schedule's `delete`, whose handler calls this one by its `input`",
  },
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
  print: ({ file, cleared }, { factory, workflow }) => [`${factory}  ${workflow} no longer at ${cleared.cron}`, `unscheduled: ${file}`],
};

/** `nemia factory schedule` and `unschedule`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_SCHEDULES: readonly Command[] = [FACTORY_SCHEDULE, FACTORY_UNSCHEDULE] as readonly Command[];
