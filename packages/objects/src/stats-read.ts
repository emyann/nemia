/**
 * What a reader of `GET /api/stats` reads off a group and the health it answers as JSON (`Stats`' `all`, `groups` and `health`): the
 * headline numbers, a row per day, per step, per change and per tally, the landing checks over half their deadline, and the system's
 * health over the range. `nemia stats` decodes its answer's groups by these to print them; the `Stats` answer keeps them as JSON, so
 * these say what a reader takes of it and never narrow what the api sends. A number nothing measured is null, never 0. Pure.
 */
import { Schema } from 'effect';

/** A number, or null where nothing measured it. */
const Measured = Schema.NullOr(Schema.Number);

/** The numbers of a group, a day or a tile: runs, landings, rounds, first tries, cost and time per landed run, tries and waits. */
export const StatsHeadline = Schema.Struct({
  runs: Schema.Number,
  landed: Measured,
  rounds: Measured,
  firstTry: Measured,
  costPerLanded: Measured,
  timePerLanded: Measured,
  tries: Schema.Number,
  refused: Schema.Number,
  gateWaitMs: Measured,
  deniedPerTry: Measured,
  skillsPerTry: Measured,
});
export type StatsHeadline = typeof StatsHeadline.Type;

/** A tile: a headline over the days from `from` to `to`. */
const StatsTile = Schema.Struct({ ...StatsHeadline.fields, from: Schema.String, to: Schema.String });

/** The kinds of what a run froze that a change mark names. */
export const STATS_MARK_KINDS = ['step', 'agent', 'skill'] as const;

/** A step and agent's row: its tries, their time and cost, its checks' verdicts, its gate wait, the calls it was refused and its skills. */
export const StatsStepRow = Schema.Struct({
  step: Schema.String,
  agent: Schema.NullOr(Schema.String),
  tries: Schema.Number,
  ranMs: Measured,
  checkMs: Measured,
  costUsd: Measured,
  costTries: Schema.Number,
  checks: Schema.Struct({ passed: Schema.Number, refused: Schema.Number, unfinished: Schema.Number }),
  gateWaitMs: Measured,
  deniedCalls: Measured,
  deniedTries: Schema.Number,
  denials: Schema.Array(Schema.Struct({ call: Schema.String, count: Schema.Number })),
  skillLoads: Measured,
  skillTries: Schema.Number,
  skills: Schema.Array(
    Schema.Struct({
      skill: Schema.String,
      count: Schema.Number,
      tries: Schema.Number,
      touched: Measured,
      loadedWhenTouched: Measured,
    }),
  ),
  rules: Schema.Array(Schema.Struct({ skill: Schema.String, rule: Schema.String, kept: Schema.Number, broken: Schema.Number })),
});
export type StatsStepRow = typeof StatsStepRow.Type;

/** A tally's cell: its sum, null where no try measured it, and the tries it was measured on. */
const TallyCell = Schema.Struct({ sum: Measured, tries: Schema.Number });

/** A group of runs' stats: its headline, a row per day, per step, the tiles, the change marks, the tallies and the slow landings. */
export const StatsGroup = Schema.Struct({
  total: StatsHeadline,
  days: Schema.Array(Schema.Struct({ ...StatsHeadline.fields, day: Schema.String })),
  steps: Schema.Array(StatsStepRow),
  tiles: Schema.Struct({ last: StatsTile, before: StatsTile }),
  marks: Schema.Array(
    Schema.Struct({
      day: Schema.String,
      kind: Schema.Literals(STATS_MARK_KINDS),
      name: Schema.String,
      run: Schema.String,
      since: Schema.String,
    }),
  ),
  tallies: Schema.Array(
    Schema.Struct({
      step: Schema.String,
      tally: Schema.String,
      total: TallyCell,
      days: Schema.Array(Schema.Struct({ ...TallyCell.fields, day: Schema.String })),
    }),
  ),
  slowLandings: Schema.Array(
    Schema.Struct({
      day: Schema.String,
      run: Schema.String,
      step: Schema.String,
      try: Schema.Number,
      checkMs: Schema.Number,
      deadlineMs: Schema.Number,
      share: Schema.Number,
    }),
  ),
});
export type StatsGroup = typeof StatsGroup.Type;

/** A group of `by`'s, under its key: null where its runs have none. */
export const StatsKeyedGroup = Schema.Struct({ ...StatsGroup.fields, key: Schema.NullOr(Schema.String) });
export type StatsKeyedGroup = typeof StatsKeyedGroup.Type;

/** The system's health over the range: a pass's time, the store, the queue, the load, and each quota window. */
export const StatsHealth = Schema.Struct({
  pass: Schema.Struct({ p50: Measured, p95: Measured }),
  runs: Measured,
  reads: Measured,
  load: Schema.Struct({ p95: Measured, max: Measured }),
  queued: Measured,
  waitMs: Measured,
  checkLoad: Measured,
  quota: Schema.Array(Schema.Struct({ harness: Schema.String, window: Schema.String, latest: Schema.Number, peak: Schema.Number })),
});
export type StatsHealth = typeof StatsHealth.Type;
