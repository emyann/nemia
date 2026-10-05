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
 * run of the same workflow folder before it, froze; with the run's keys and the steps and agents the item belongs to.
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
 * The part of the package's `StepRow` the page reads: a step and its agent, its tries, the calls refused it — `deniedCalls` over the
 * `deniedTries` tries measured, each call with its count — and the skills its sessions loaded — `skillLoads` over the `skillTries` tries
 * measured, each skill with its count. A count nothing measured is null; the names come most first, then by name.
 */
export type StatsStep = {
  step: string;
  agent: string | null;
  tries: number;
  deniedCalls: number | null;
  deniedTries: number;
  denials: Array<{ call: string; count: number }>;
  skillLoads: number | null;
  skillTries: number;
  skills: Array<{ skill: string; count: number }>;
};

/**
 * The part of the api's `Stats` the page reads: the days asked for (`from` null where nothing happened), the numbers of every fact kept on
 * each day, a row per step and agent, the tiles, the marks, and the runs left out because a journal of each does not read.
 */
export type Stats = {
  from: string | null;
  to: string;
  all: { days: StatsDay[]; steps: StatsStep[]; tiles: { last: StatsTile; before: StatsTile }; marks: StatsMark[] };
  unreadable: string[];
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
  deniedCalls: known,
  deniedTries: Schema.Number,
  denials: Schema.mutable(Schema.Array(Schema.Struct({ call: Schema.String, count: Schema.Number }))),
  skillLoads: known,
  skillTries: Schema.Number,
  skills: Schema.mutable(Schema.Array(Schema.Struct({ skill: Schema.String, count: Schema.Number }))),
}) satisfies Schema.Schema<StatsStep>;

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
}) satisfies Schema.Schema<Stats>;

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
