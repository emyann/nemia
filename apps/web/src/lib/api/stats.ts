/** The flow numbers the Stats page draws (`GET /api/stats`, apps/api/src/stats/stats.ts): what the CLI's `stats --json` prints. */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';

/**
 * Mirrors the package's `Headline`: the runs finished and those landed, the mean rounds to acceptance, the share landed on the first try,
 * the mean cost and wall time of a landed run, the tries, the checks refused, the mean gate wait, the mean calls refused per try over
 * the tries whose harness records them (`deniedPerTry`), and the mean skills loaded per try over the tries whose sessions' ends say
 * (`skillsPerTry`). A number nothing measured is null.
 */
export type StatsHeadline = {
  runs: number;
  landed: number | null;
  rounds: number | null;
  firstTry: number | null;
  costPerLanded: number | null;
  timePerLanded: number | null;
  tries: number;
  refused: number;
  gateWaitMs: number | null;
  deniedPerTry: number | null;
  skillsPerTry: number | null;
};

/** The numbers of one UTC day of the period. */
export type StatsDay = StatsHeadline & { day: string };

/** The numbers of one tile's 14 days, by their first and last day. */
export type StatsTile = StatsHeadline & { from: string; to: string };

/**
 * Mirrors the package's `Mark`: a day a run froze a step, an agent's instructions or a rendered skill that differs from what `since`, the
 * run of the same factory and workflow folder before it, froze; with the run's keys and the steps and agents the item belongs to.
 */
export type StatsMark = {
  day: string;
  kind: 'step' | 'agent' | 'skill';
  name: string;
  run: string;
  since: string;
  factory: string;
  workflow: string;
  repo: string | null;
  steps: string[];
  agents: Array<string | null>;
};

/**
 * The part of the package's `StepRow` the page reads: a step and its agent, its tries, its checks' run time over them (null with no check
 * measured; absent from an older api), the calls refused it — `deniedCalls` over the
 * `deniedTries` tries measured, each call with its count — and the skills its sessions loaded — `skillLoads` over the `skillTries` tries
 * measured, each skill with its count. A count nothing measured is null; the names come most first, then by name.
 */
export type StatsStep = {
  step: string;
  agent: string | null;
  tries: number;
  checkMs?: number | null;
  deniedCalls: number | null;
  deniedTries: number;
  denials: Array<{ call: string; count: number }>;
  skillLoads: number | null;
  skillTries: number;
  skills: Array<{ skill: string; count: number }>;
};

/**
 * Mirrors the package's `Health`: the system's over the days of the stats, off the series the daemon kept — a pass's time (p50, p95), the
 * most runs in the store, journal reads a pass (p95), the load per core (p95, most), the most sessions queued and the longest wait, the
 * load at a check's start (p50), and each quota window's latest and peak use. A figure nothing kept is null.
 */
export type StatsHealth = {
  pass: { p50: number | null; p95: number | null };
  runs: number | null;
  reads: number | null;
  load: { p95: number | null; max: number | null };
  queued: number | null;
  waitMs: number | null;
  checkLoad: number | null;
  quota: Array<{ harness: string; window: string; latest: number; peak: number }>;
};

/**
 * The part of the api's `Stats` the page reads: the days asked for (`from` null where nothing happened), the numbers of every fact kept on
 * each day, a row per step and agent, the tiles, the marks, the runs left out because a journal of each does not read, and the system's
 * health over the same days (absent from an older api).
 */
export type Stats = {
  from: string | null;
  to: string;
  all: { days: StatsDay[]; steps: StatsStep[]; tiles: { last: StatsTile; before: StatsTile }; marks: StatsMark[] };
  unreadable: string[];
  health?: StatsHealth;
};

const known = Schema.NullOr(Schema.Number);

/** The fields of a `StatsHeadline`, which a day and a tile carry too. */
const HeadlineFields = {
  runs: Schema.Number,
  landed: known,
  rounds: known,
  firstTry: known,
  costPerLanded: known,
  timePerLanded: known,
  tries: Schema.Number,
  refused: Schema.Number,
  gateWaitMs: known,
  deniedPerTry: known,
  skillsPerTry: known,
};

/** Decodes a tile. */
const TileSchema = Schema.Struct({ ...HeadlineFields, from: Schema.String, to: Schema.String }) satisfies Schema.Schema<StatsTile>;

/** Decodes a `StatsMark`. */
const MarkSchema = Schema.Struct({
  day: Schema.String,
  kind: Schema.Literals(['step', 'agent', 'skill']),
  name: Schema.String,
  run: Schema.String,
  since: Schema.String,
  factory: Schema.String,
  workflow: Schema.String,
  repo: Schema.NullOr(Schema.String),
  steps: Schema.mutable(Schema.Array(Schema.String)),
  agents: Schema.mutable(Schema.Array(Schema.NullOr(Schema.String))),
}) satisfies Schema.Schema<StatsMark>;

/** Decodes a `StatsStep`: the step row's other numbers are dropped. */
const StepSchema = Schema.Struct({
  step: Schema.String,
  agent: Schema.NullOr(Schema.String),
  tries: Schema.Number,
  checkMs: Schema.optionalKey(known),
  deniedCalls: known,
  deniedTries: Schema.Number,
  denials: Schema.mutable(Schema.Array(Schema.Struct({ call: Schema.String, count: Schema.Number }))),
  skillLoads: known,
  skillTries: Schema.Number,
  skills: Schema.mutable(Schema.Array(Schema.Struct({ skill: Schema.String, count: Schema.Number }))),
}) satisfies Schema.Schema<StatsStep>;

/** Decodes a `StatsHealth`. */
const HealthSchema = Schema.Struct({
  pass: Schema.Struct({ p50: known, p95: known }),
  runs: known,
  reads: known,
  load: Schema.Struct({ p95: known, max: known }),
  queued: known,
  waitMs: known,
  checkLoad: known,
  quota: Schema.mutable(
    Schema.Array(Schema.Struct({ harness: Schema.String, window: Schema.String, latest: Schema.Number, peak: Schema.Number })),
  ),
}) satisfies Schema.Schema<StatsHealth>;

/** Decodes the part of `Stats` the page reads; the groups and the total are dropped. */
export const StatsSchema = Schema.Struct({
  from: Schema.NullOr(Schema.String),
  to: Schema.String,
  all: Schema.Struct({
    days: Schema.mutable(Schema.Array(Schema.Struct({ ...HeadlineFields, day: Schema.String }))),
    steps: Schema.mutable(Schema.Array(StepSchema)),
    tiles: Schema.Struct({ last: TileSchema, before: TileSchema }),
    marks: Schema.mutable(Schema.Array(MarkSchema)),
  }),
  unreadable: Schema.mutable(Schema.Array(Schema.String)),
  health: Schema.optionalKey(HealthSchema),
}) satisfies Schema.Schema<Stats>;

/** A factory's landings on each day: how many runs landed, and the mean cost of a landed run, each null where nothing measured it. */
export type FactoryDays = { key: string | null; days: Array<{ day: string; landed: number | null; costPerLanded: number | null }> };

/** Decodes the groups of an answer that went `by=factory`, each day's landings and cost alone. */
const FactoryDaysSchema = Schema.Struct({
  groups: Schema.mutable(
    Schema.Array(
      Schema.Struct({
        key: Schema.NullOr(Schema.String),
        days: Schema.mutable(Schema.Array(Schema.Struct({ day: Schema.String, landed: known, costPerLanded: known }))),
      }),
    ),
  ),
}) satisfies Schema.Schema<{ groups: FactoryDays[] }>;

/** Each factory's landings and their cost a day, from `from` (every day kept, for null): the system section's chart of what landed. */
export const factoryDaysQuery = (from: string | null) =>
  queryOptions({
    queryKey: ['stats', 'factories', from],
    queryFn: async () => (await get(`/api/stats?by=factory${from ? `&from=${from}` : ''}`, FactoryDaysSchema)).groups,
  });

/** Decodes the values of the key an answer went by: each group's key, null for a step with no agent or a run with no repository. */
const KeysSchema = Schema.Struct({
  groups: Schema.mutable(Schema.Array(Schema.Struct({ key: Schema.NullOr(Schema.String) }))),
}) satisfies Schema.Schema<{ groups: Array<{ key: string | null }> }>;

/** The stats for `query`, the api's query string (`apiQueryOf` in lib/stats.ts), keyed by it. */
export const statsQuery = (query: string) =>
  queryOptions({
    queryKey: ['stats', query],
    queryFn: () => get(`/api/stats?${query}`, StatsSchema),
  });

/**
 * The values a filter can keep, for `query`, a query string that goes `by` that filter's key: each group's key, the null group left out,
 * which no filter can ask for.
 */
export const statsKeysQuery = (query: string) =>
  queryOptions({
    queryKey: ['stats', 'keys', query],
    queryFn: async () => {
      const { groups } = await get(`/api/stats?${query}`, KeysSchema);
      return groups.flatMap(({ key }) => (key === null ? [] : [key]));
    },
  });
