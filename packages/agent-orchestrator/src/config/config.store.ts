/**
 * The `WF_` environment the package reads: where the store lives (`WF_ROOT`), the daemon's two ceilings (`WF_MAX_CONCURRENT`,
 * `WF_MAX_RUNS`), whether a pass judges its runs at rest in full (`WF_VERIFY_REST`), whether a finished run keeps its worktrees
 * (`WF_KEEP_WORKTREES`), how long the series are kept (`WF_METRICS_MINUTE_DAYS`, `WF_METRICS_HOUR_DAYS`), and the memory limit each
 * session runs under by default and the slice its scope is made in (`WF_MEMORY_LIMIT`, `WF_CGROUP_PARENT`). Each is an Effect `Config`
 * with its default, and each has a plain reader that takes the environment it is given — never `process.env` by default — and answers the
 * value or throws `Invalid`, exit 2, in the variable's own words. A value that is set and not one the variable takes is refused, never
 * read as its default. Reads no disk.
 *
 * A program reads them as services with no default, given where it is composed: `StoreConfig`, every setting, and `StoreRoot`, the store's
 * directory, both given by `storeConfigLayer(env)` (`root.store.ts`, which imports this file) — `src/cli/main.ts` and the daemon from
 * `process.env`, the api from its own, a test from a record it means. A program given none does not compile, so none silently reads the
 * process's environment, as Effect's default `ConfigProvider` would.
 */
import os from 'node:os';
import path from 'node:path';
import { Config, ConfigProvider, Context, Effect, Layer, Result, Schema } from 'effect';
import { memoryQuantityRefusal } from 'agent-runtime/vocabulary';
import { Invalid } from '../refusal/refusal.ts';

/** An environment as a reader takes it: `process.env`, or a record a test means. */
export type Env = Readonly<Record<string, string | undefined>>;

/** A whole number from 1, or blank, spaces around it allowed. */
const FROM_ONE = /^\s*(0*[1-9]\d*)?\s*$/;

/** Sessions at work per pool at once when `WF_MAX_CONCURRENT` is unset, empty or blank. */
const SESSIONS = 2;

/** A whole number from 0, or blank for 0, spaces around it allowed. */
const FROM_ZERO = /^\s*\d*\s*$/;

/**
 * `WF_ROOT`: an absolute path; `~/.agent-workflows` when unset. Made when read, so the home it defaults under is the one of the moment it
 * is read, never the one this module loaded under.
 */
const root = () =>
  Config.schema(Schema.String.check(Schema.makeFilter((value: string) => path.isAbsolute(value))), 'WF_ROOT').pipe(
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

/** `WF_MEMORY_LIMIT`: a Kubernetes quantity the runtime reads (`memoryQuantityRefusal`), trimmed; undefined, no limit, unset or blank. */
const memory = Config.schema(
  Schema.String.check(Schema.makeFilter((value: string) => !value.trim() || memoryQuantityRefusal(value.trim()) === undefined)),
  'WF_MEMORY_LIMIT',
).pipe(
  Config.map((value): string | undefined => value.trim() || undefined),
  Config.withDefault(undefined),
);

/** A systemd slice's unit name: letters, digits, `_`, `-`, `.`, `:` and `@`, ending `.slice`, as `systemd-run --slice=` takes one. */
const SLICE = /^[\w:@.-]*[\w:@-]\.slice$/;

/** `WF_CGROUP_PARENT`: a slice's unit name (`SLICE`); undefined, the user manager's root slice, when unset or empty. */
const slice = Config.schema(Schema.String.check(Schema.isPattern(SLICE)), 'WF_CGROUP_PARENT').pipe(
  Config.map((value): string | undefined => value),
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
export const wfRoot = (env: Env): string =>
  read(
    root(),
    'WF_ROOT',
    env,
    (value) =>
      `WF_ROOT=${value} is not an absolute path. It is the directory where runs and the engine's board live, the same for every process that reads them: WF_ROOT=/srv/wf — or unset, for ~/.agent-workflows.`,
    true,
  );

/** `WF_MAX_CONCURRENT`, sessions at work per pool at once: a whole number from 1, or 2 when unset, empty or blank. */
export const maxConcurrent = (env: Env): number =>
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
export const maxRuns = (env: Env): number =>
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
export const keepsWorktrees = (env: Env): boolean =>
  read(
    keepWorktrees,
    'WF_KEEP_WORKTREES',
    env,
    (value) =>
      `WF_KEEP_WORKTREES=${value} is neither 1 nor 0. It keeps the worktrees of every finished run, which the daemon otherwise removes: WF_KEEP_WORKTREES=1 — or 0, or unset, to have them freed.`,
  );

/** `WF_VERIFY_REST`, whether a pass judges in full each run it answers from its memo of runs at rest: `1` on; `0`, unset or empty off. */
export const verifiesRest = (env: Env): boolean =>
  read(
    verifyRest,
    'WF_VERIFY_REST',
    env,
    (value) =>
      `WF_VERIFY_REST=${value} is neither 1 nor 0. It judges in full each run a pass answers from its memo of runs at rest, which costs all the memo saves: WF_VERIFY_REST=1 — or 0, or unset, for off.`,
  );

/** `WF_METRICS_MINUTE_DAYS`, the days of minute lines the series keep: a whole number from 2, or 30 when unset or empty. */
export const metricsMinuteDays = (env: Env): number =>
  read(
    minuteDays,
    'WF_METRICS_MINUTE_DAYS',
    env,
    (value) =>
      `WF_METRICS_MINUTE_DAYS=${value} is not a whole number from 2. It is how many days of the series' minute lines are kept, two at least so a day's range has yesterday: WF_METRICS_MINUTE_DAYS=30 — or unset, for 30.`,
  );

/** `WF_METRICS_HOUR_DAYS`, the days of hour lines the series keep: a whole number from 1, or undefined — kept until pruned — when unset. */
export const metricsHourDays = (env: Env): number | undefined =>
  read(
    hourDays,
    'WF_METRICS_HOUR_DAYS',
    env,
    (value) =>
      `WF_METRICS_HOUR_DAYS=${value} is not a whole number from 1. It is how many days of the series' hour lines are kept: WF_METRICS_HOUR_DAYS=365 — or unset, to keep them until you delete them.`,
  );

/**
 * `WF_MEMORY_LIMIT`, the memory limit every session and check the daemon files runs under when its step names none (the engine's
 * `defaultLimits`): a Kubernetes quantity, `8Gi`, `512Mi`, `4G`, as written, or undefined — no limit — when unset, empty or blank. Refused
 * in the runtime's words when it is anything else: read as no limit, a mistyped value would lift the bound it was set to hold.
 */
export const memoryLimit = (env: Env): string | undefined =>
  read(
    memory,
    'WF_MEMORY_LIMIT',
    env,
    (value) =>
      `WF_MEMORY_LIMIT=${value} is not a memory limit: ${memoryQuantityRefusal(value.trim()) ?? ''} It is what each session runs under when its step names no \`memory:\`, a Kubernetes quantity: WF_MEMORY_LIMIT=8Gi — or unset, for no limit.`,
  );

/**
 * `WF_CGROUP_PARENT`, the systemd slice every limited session's scope is made in, as Docker's `--cgroup-parent`: a unit name ending
 * `.slice`, which an operator caps to bound the sessions together, or undefined — the user manager's root slice — when unset or empty.
 */
export const cgroupParent = (env: Env): string | undefined =>
  read(
    slice,
    'WF_CGROUP_PARENT',
    env,
    (value) =>
      `WF_CGROUP_PARENT=${value} is not a slice's name. It is the systemd slice each limited session's scope is made in, a unit name of letters, digits and dashes ending .slice: WF_CGROUP_PARENT=sessions.slice — or unset, for the user manager's own.`,
  );

/**
 * `WF_DEFAULT_FACTORY_STARTS`, whether a start may go to the default factory when it names none and no factory holds its folder, or when
 * it starts a card that names none: only with `1`, which the package's and the api's tests set for the starts they make in scratch
 * folders. Unset, by default, every such start is refused.
 */
export const defaultFactoryStarts = (env: Env): boolean => env.WF_DEFAULT_FACTORY_STARTS === '1';

/**
 * `WF_EXPOSED`, whether the store is marked exposed — reached from beyond this machine, through a bind, a proxy or a tunnel — so that the
 * api refuses every request that presents no token (`callerGate`): only with `1`, which whoever exposes the store sets. Unset, by
 * default, a request with no token is the person.
 */
export const exposedStore = (env: Env): boolean => env.WF_EXPOSED === '1';

/**
 * `WF_SESSION_TOKEN`, the token of the session a command runs in, which says who calls a verb that proposes in its place
 * (`sessionCaller`; `nemia factory resolve`): undefined, the person, where it is unset or empty.
 */
export const sessionToken = (env: Env): string | undefined => env.WF_SESSION_TOKEN || undefined;

/**
 * The daemon's per-session variables: what it sets on each session it starts, and so what no process but a session's starts with — the
 * session's token, and the memory limit and slice a limited session runs under. A test seat drops them, so a test reads what CI reads.
 */
export const SESSION_VARIABLES = ['WF_SESSION_TOKEN', 'WF_MEMORY_LIMIT', 'WF_CGROUP_PARENT'] as const;

/** Every `WF_` setting a program reads besides the root, each as its reader answers it. */
export type Settings = {
  readonly maxConcurrent: number;
  readonly maxRuns: number;
  readonly verifyRest: boolean;
  readonly keepWorktrees: boolean;
  readonly metricsMinuteDays: number;
  readonly metricsHourDays: number | undefined;
  readonly memoryLimit: string | undefined;
  readonly cgroupParent: string | undefined;
  readonly defaultFactoryStarts: boolean;
  readonly sessionToken: string | undefined;
  readonly exposed: boolean;
};

/**
 * `env`'s settings, each read by its reader when it is read, so a value set wrong is refused (`Invalid`, exit 2) by the program that
 * reads it and by no other: a command that never reads `WF_MAX_RUNS` runs whatever it holds, as it did when each read its own.
 */
export const settingsOf = (env: Env): Settings => ({
  get maxConcurrent() {
    return maxConcurrent(env);
  },
  get maxRuns() {
    return maxRuns(env);
  },
  get verifyRest() {
    return verifiesRest(env);
  },
  get keepWorktrees() {
    return keepsWorktrees(env);
  },
  get metricsMinuteDays() {
    return metricsMinuteDays(env);
  },
  get metricsHourDays() {
    return metricsHourDays(env);
  },
  get memoryLimit() {
    return memoryLimit(env);
  },
  get cgroupParent() {
    return cgroupParent(env);
  },
  get defaultFactoryStarts() {
    return defaultFactoryStarts(env);
  },
  get sessionToken() {
    return sessionToken(env);
  },
  get exposed() {
    return exposedStore(env);
  },
});

/**
 * The store's configuration a program asks for, given by whoever composes it, as `StoreRoot` is. It has no default: a program that asks
 * it and is given none does not compile.
 */
export class StoreConfig extends Context.Service<StoreConfig, Settings>()('orchestrator/StoreConfig') {
  /** `settings` as the layer that gives them to a program. */
  static readonly layer = (settings: Settings): Layer.Layer<StoreConfig> => Layer.succeed(StoreConfig)(StoreConfig.of(settings));
}

/** The setting `key` of the configuration the program was given, or the `Invalid` its reader refuses a value set wrong with. */
export const setting = <K extends keyof Settings>(key: K): Effect.Effect<Settings[K], Invalid, StoreConfig> =>
  Effect.flatMap(StoreConfig, (config) =>
    Effect.try({ try: () => config[key], catch: (error) => (error instanceof Invalid ? error : new Invalid({ message: String(error) })) }),
  );
