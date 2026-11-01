/**
 * The factories' schedules (`schedulesRead`): started when due by the tick (`startDue`, through `startRun`, the start a person's takes),
 * and written by `nemia factory schedule` and `unschedule`, entries of the command table the api serves on
 * `/api/factories/:factory/schedules/:workflow`. No level is read here: a schedule is the daemon's, and starts at every level.
 */
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import type { Run } from '../record/record.ts';
import { isDue, schedulesRead, type Read } from './listed.store.ts';
import { workflowFolder } from '../folder/folder.store.ts';
import { scheduleOf, scheduleRefused } from '../factory/factory.store.ts';
import { rooted, wire } from '../factory/wire.verb.ts';
import { unscheduledRefusal } from '../factory/factory.ts';
import { Missing } from '../refusal/refusal.ts';
import type { Schedule } from '../factory/factory.ts';
import { repoFor, startRun } from '../start/start.verb.ts';
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
 * The start of the schedule read `r` for its fire `due`, as a person's `nemia start --factory` is: its repository and folder first, the
 * factory's tree before the repository's `workflows/` when it is made from a template.
 */
const started = (r: Read, due: string, daemonRepo: string) =>
  Effect.suspend(() => {
    const repo = repoFor(r.factory.name, r.schedule.repo, daemonRepo);
    return startRun({
      brief: r.schedule.brief,
      repo,
      repoNamed: r.schedule.repo !== undefined,
      workflowDir: workflowFolder(r.workflow, path.join(r.factory.tree ?? repo, 'workflows'), repo, r.factory.tree),
      factory: r.factory.name,
      scheduled: { factory: r.factory.name, workflow: r.workflow, due },
    });
  });

/**
 * The tick's scheduled start: the first schedule due (`scheduleDue`), factories by name, then workflows by name, started through `startRun`
 * on the schedule's repository, else the factory's one, else `repo`, the daemon's; one a pass, none when none is due. Its try is kept for
 * its fire (`putScheduleTry`): a start, so a removed run does not bring its fire back; a refusal (exit 2), not tried again until the next
 * fire; a failure, tried again on the next pass and said as `again` while it reads the same. A try that cannot be written is said all the
 * same.
 */
export const startDue = Effect.fn('startDue')(function* (repo: string, runs: readonly Run[], now: number = Date.now()) {
  const due = schedulesRead(runs, now).find(isDue);
  if (!due) return undefined;
  const at = { factory: due.factory.name, workflow: due.workflow, due: new Date(due.fires.latest).toISOString() };
  const exit = yield* Effect.exit(started(due, at.due, repo));
  const keep = (tried: ScheduleTry): void => {
    try {
      putScheduleTry(at.factory, at.workflow, tried);
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

const USAGE = '<factory> <workflow> --cron <expr> --brief <text> [--repo <path>] [--tz <zone>]';

const SCHEDULE_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
  ],
  flags: [
    valueFlag('--cron', 'cron', 'a cron expression of five or six fields'),
    valueFlag('--brief', 'brief', 'what each run is asked'),
    valueFlag('--repo', 'repo', "one of the factory's repositories"),
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

/** `nemia factory schedule`: a workflow the factory has attached, started by the daemon at each fire of its cron. */
export const FACTORY_SCHEDULE: Command<Scheduled> = {
  name: 'factory schedule',
  usage: USAGE,
  help: ['start a run of an attached workflow at each fire of a cron, by the', 'daemon, at every level; a second replaces the first'],
  spec: SCHEDULE_SPEC,
  check: scheduleCheck,
  writes: true,
  class: 'ask',
  route: { method: 'PUT', path: '/api/factories/:factory/schedules/:workflow', status: 200 },
  handler: (args, _env, home) => {
    const repo = textOf(args, 'repo');
    const tz = textOf(args, 'tz');
    const workflow = textOf(args, 'workflow');
    const opts = { workflow, cron: textOf(args, 'cron'), brief: textOf(args, 'brief'), ...(repo ? { repo } : {}), ...(tz ? { tz } : {}) };
    const schedule = scheduleOf(opts);
    return rooted(
      home,
      'factory schedule',
      Effect.map(
        wire(textOf(args, 'factory'), { verb: 'schedule', workflow, schedule }, (factory) => scheduleRefused(factory, opts)),
        ({ was, file }) => ({ file, schedule, replaced: was.schedules[workflow] ?? null }),
      ),
    );
  },
  print: ({ file, schedule, replaced }, args) => [
    `${textOf(args, 'factory')}  ${textOf(args, 'workflow')} at ${schedule.cron}${schedule.tz ? ` (${schedule.tz})` : ''}${replaced ? ` (was ${replaced.cron})` : ''}`,
    `scheduled: ${file} — its first run starts at its next fire`,
  ],
};

const UNSCHEDULE_USAGE = '<factory> <workflow>';

/** `nemia factory unschedule`: a workflow's schedule taken back. */
export const FACTORY_UNSCHEDULE: Command<{ file: string; cleared: Schedule }> = {
  name: 'factory unschedule',
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
  route: { method: 'DELETE', path: '/api/factories/:factory/schedules/:workflow', status: 200 },
  handler: (args, _env, home) => {
    const factory = textOf(args, 'factory');
    const workflow = textOf(args, 'workflow');
    return rooted(
      home,
      'factory unschedule',
      Effect.gen(function* () {
        const { was, file } = yield* wire(factory, { verb: 'unschedule', workflow });
        const cleared = was.schedules[workflow];
        if (cleared === undefined)
          return yield* Effect.fail(new Missing({ message: unscheduledRefusal(factory, workflow, Object.keys(was.schedules)) }));
        return { file, cleared };
      }),
    );
  },
  print: ({ file, cleared }, args) => [
    `${textOf(args, 'factory')}  ${textOf(args, 'workflow')} no longer at ${cleared.cron}`,
    `unscheduled: ${file}`,
  ],
};
