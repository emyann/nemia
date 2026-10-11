/**
 * The `WF_` environment the package reads: where the store lives (`WF_ROOT`), the daemon's two ceilings (`WF_MAX_CONCURRENT`,
 * `WF_MAX_RUNS`), whether a pass judges its runs at rest in full (`WF_VERIFY_REST`), whether a finished run keeps its
 * worktrees (`WF_KEEP_WORKTREES`), and how long the series are kept
 * (`WF_METRICS_MINUTE_DAYS`, `WF_METRICS_HOUR_DAYS`). Each is an Effect `Config` with its default, and
 * each has a plain reader that takes the environment, `process.env` unless given, and answers the value or throws `Invalid`, exit 2, in the
 * variable's own words. A value that is set and not one the variable takes is refused, never read as its default. Reads no disk.
 */
import os from 'node:os';
import path from 'node:path';
import { Config, ConfigProvider, Effect, Result, Schema } from 'effect';
import { Invalid } from '../refusal/refusal.ts';

/** An environment as a reader takes it: `process.env`, or a record a test means. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A whole number from 1, or blank, spaces around it allowed. */
const FROM_ONE = /^\s*(0*[1-9]\d*)?\s*$/;

/** Sessions at work per pool at once when `WF_MAX_CONCURRENT` is unset, empty or blank. */
const SESSIONS = 2;

/** A whole number from 0, or blank for 0, spaces around it allowed. */
const FROM_ZERO = /^\s*\d*\s*$/;

/** `WF_ROOT`: an absolute path; `~/.agent-workflows` when unset. */
const root = Config.schema(Schema.String.check(Schema.makeFilter((value: string) => path.isAbsolute(value))), 'WF_ROOT').pipe(
  Config.withDefault(path.join(os.homedir(), '.agent-workflows')),
);

/** `WF_MAX_CONCURRENT`: sessions at work per pool at once, a whole number from 1; `SESSIONS` when unset, empty or blank. */
const concurrent = Config.schema(Schema.String.check(Schema.isPattern(FROM_ONE)), 'WF_MAX_CONCURRENT').pipe(
  Config.map((value) => (value.trim() ? Number(value.trim()) : SESSIONS)),
  Config.withDefault(SESSIONS),
);

/** `WF_MAX_RUNS`: runs in flight at once, a whole number; 0, for no cap, when unset, empty or blank. */
const runs = Config.schema(Schema.String.check(Schema.isPattern(FROM_ZERO)), 'WF_MAX_RUNS').pipe(
  Config.map((value) => Number(value.trim())),
  Config.withDefault(0),
);

/** `WF_VERIFY_REST`: `1` on, `0` off; off when unset or empty. */
const verifyRest = Config.schema(Schema.Literals(['0', '1']), 'WF_VERIFY_REST').pipe(
  Config.map((value) => value === '1'),
  Config.withDefault(false),
);

/** `WF_KEEP_WORKTREES`: `1` on, `0` off; off when unset or empty. */
const keepWorktrees = Config.schema(Schema.Literals(['0', '1']), 'WF_KEEP_WORKTREES').pipe(
  Config.map((value) => value === '1'),
  Config.withDefault(false),
);

/** Days of minute lines kept when `WF_METRICS_MINUTE_DAYS` is unset or empty. */
const MINUTE_DAYS = 30;

/** `WF_METRICS_MINUTE_DAYS`: days of minute lines kept, a whole number from 2, so a day's range always has yesterday; 30 when unset. */
const minuteDays = Config.schema(Schema.String.check(Schema.isPattern(/^\s*0*([2-9]|[1-9]\d+)\s*$/)), 'WF_METRICS_MINUTE_DAYS').pipe(
  Config.map((value) => Number(value.trim())),
  Config.withDefault(MINUTE_DAYS),
);

/** `WF_METRICS_HOUR_DAYS`: days of hour lines kept, a whole number from 1; undefined, kept until pruned, when unset. */
const hourDays = Config.schema(Schema.String.check(Schema.isPattern(/^\s*0*[1-9]\d*\s*$/)), 'WF_METRICS_HOUR_DAYS').pipe(
  Config.map((value): number | undefined => Number(value.trim())),
  Config.withDefault(undefined),
);

/**
 * `config` read from `env`, or `Invalid` with the words `refusal` gives the value `name` has there. `keepEmpty` reads an empty value as a
 * value, where Effect's provider otherwise reads it as unset.
 */
function read<T>(config: Config.Config<T>, name: string, env: Env, refusal: (value: string) => string, keepEmpty = false): T {
  const provider = ConfigProvider.fromEnvRecord({ ...env }, { preserveEmptyStrings: keepEmpty });
  const parsed = Effect.runSync(Effect.result(config.parse(provider)));
  if (Result.isSuccess(parsed)) return parsed.success;
  throw new Invalid({ message: refusal(env[name] ?? '') });
}

/**
 * `WF_ROOT`, the store's directory: an absolute path, or `~/.agent-workflows` when unset. Refused when relative, since each process would
 * read a store of its own under its working directory, and when empty, which would read the working directory itself.
 */
export const wfRoot = (env: Env = process.env): string =>
  read(
    root,
    'WF_ROOT',
    env,
    (value) =>
      `WF_ROOT=${value} is not an absolute path. It is the directory where runs and the engine's board live, the same for every process that reads them: WF_ROOT=/srv/wf — or unset, for ~/.agent-workflows.`,
    true,
  );

/** `WF_MAX_CONCURRENT`, sessions at work per pool at once: a whole number from 1, or 2 when unset, empty or blank. */
export const maxConcurrent = (env: Env = process.env): number =>
  read(
    concurrent,
    'WF_MAX_CONCURRENT',
    env,
    (value) =>
      `WF_MAX_CONCURRENT=${value} is not a count from 1. It is the most sessions at work per pool at once, a whole number: WF_MAX_CONCURRENT=4 — or unset, for 2.`,
  );

/**
 * `WF_MAX_RUNS`, the cap on runs in flight: a whole number, or 0 — unset, empty or blank too — for none. Refused when it is anything else:
 * read as no cap, a mistyped value would lift the cap it was set to hold.
 */
export const maxRuns = (env: Env = process.env): number =>
  read(
    runs,
    'WF_MAX_RUNS',
    env,
    (value) =>
      `WF_MAX_RUNS=${value} is not a count. It is the most runs in flight at once, a whole number: WF_MAX_RUNS=2 — or 0, or unset, for no cap.`,
  );

/**
 * `WF_KEEP_WORKTREES`, whether the daemon leaves every finished run its worktrees, for a person to prune by hand: `1` keeps them; `0`,
 * unset or empty and a finished run is freed. Refused when it is anything else: read as off, a mistyped value would free what it was
 * set to keep.
 */
export const keepsWorktrees = (env: Env = process.env): boolean =>
  read(
    keepWorktrees,
    'WF_KEEP_WORKTREES',
    env,
    (value) =>
      `WF_KEEP_WORKTREES=${value} is neither 1 nor 0. It keeps the worktrees of every finished run, which the daemon otherwise removes: WF_KEEP_WORKTREES=1 — or 0, or unset, to have them freed.`,
  );

/** `WF_VERIFY_REST`, whether a pass judges in full each run it answers from its memo of runs at rest: `1` on; `0`, unset or empty off. */
export const verifiesRest = (env: Env = process.env): boolean =>
  read(
    verifyRest,
    'WF_VERIFY_REST',
    env,
    (value) =>
      `WF_VERIFY_REST=${value} is neither 1 nor 0. It judges in full each run a pass answers from its memo of runs at rest, which costs all the memo saves: WF_VERIFY_REST=1 — or 0, or unset, for off.`,
  );

/** `WF_METRICS_MINUTE_DAYS`, the days of minute lines the series keep: a whole number from 2, or 30 when unset or empty. */
export const metricsMinuteDays = (env: Env = process.env): number =>
  read(
    minuteDays,
    'WF_METRICS_MINUTE_DAYS',
    env,
    (value) =>
      `WF_METRICS_MINUTE_DAYS=${value} is not a whole number from 2. It is how many days of the series' minute lines are kept, two at least so a day's range has yesterday: WF_METRICS_MINUTE_DAYS=30 — or unset, for 30.`,
  );

/** `WF_METRICS_HOUR_DAYS`, the days of hour lines the series keep: a whole number from 1, or undefined — kept until pruned — when unset. */
export const metricsHourDays = (env: Env = process.env): number | undefined =>
  read(
    hourDays,
    'WF_METRICS_HOUR_DAYS',
    env,
    (value) =>
      `WF_METRICS_HOUR_DAYS=${value} is not a whole number from 1. It is how many days of the series' hour lines are kept: WF_METRICS_HOUR_DAYS=365 — or unset, to keep them until you delete them.`,
  );
