/** `nemia stats`, an entry of the command table: what the store's runs add up to (`statsRun`). */
import { STATS_KEYS, STATS_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { setting } from '../config/config.store.ts';
import { statsQueryOf, type QueryKey, type Stats } from './index.ts';
import { statsRun } from './stats.verb.ts';
import type { Args } from '../command/command.ts';
import { selectorsIn, type Kept, type Served } from '../command/entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The query keys `nemia stats` takes a flag for, as its words name them (`objects`' `STATS_KEYS`). */
const KEYS = STATS_KEYS as readonly QueryKey[];

/** What a person asked of the stats, by query key: each flag's value given. */
const givenOf = (args: Args): Partial<Record<QueryKey, string>> =>
  Object.fromEntries(KEYS.flatMap((key) => (textOf(args, key) === undefined ? [] : [[key, textOf(args, key)]])));

/**
 * What `nemia stats`' handler takes: each query key's value as given (`--from`, …, `--repo`), the selectors (`-l`, given again for
 * another), and how the CLI prints (`--line`, `--json`).
 */
export const StatsInput = Schema.Struct({
  from: Schema.optionalKey(Schema.String),
  to: Schema.optionalKey(Schema.String),
  by: Schema.optionalKey(Schema.String),
  agent: Schema.optionalKey(Schema.String),
  step: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  workflow: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  selector: Schema.optionalKey(Schema.Array(Schema.String)),
  line: Schema.optionalKey(Schema.Boolean),
  json: Schema.optionalKey(Schema.Boolean),
});
export type StatsInput = typeof StatsInput.Type;

/**
 * `nemia stats`: the flow numbers of every run in the store, as tiles and a row per day, one line (`--line`), or JSON (`--json`). The api
 * answers the same `Stats` on its route, through the memo it keeps (`kept.stats`), verified as its environment says.
 */
export const STATS: Served<Stats, StatsInput> = {
  ...STATS_WORDS,
  input: StatsInput,
  handler: Effect.fnUntraced(function* (args: StatsInput, kept?: Kept) {
    const selectors = yield* selectorsIn(args);
    const query = yield* tried(() => statsQueryOf(givenOf(args), (key) => `--${key}`));
    return yield* statsRun(selectors.length ? { ...query, selectors } : query, new Date(), {
      memo: kept?.stats,
      verify: yield* setting('verifyRest'),
      series: kept?.series,
    });
  }),
};
