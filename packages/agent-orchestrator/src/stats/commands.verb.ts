/** `nemia stats`, an entry of the command table: what the store's runs add up to (`statsRun`). */
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { setting } from '../config/config.store.ts';
import { BY_KEYS, statsLine, statsLines, statsQueryOf, type QueryKey, type Stats } from './index.ts';
import { statsRun } from './stats.verb.ts';
import type { Args } from '../command/command.ts';
import { selectorCheck, selectorFlag, selectorsIn, type Command, type Kept } from '../command/entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The value flags `nemia stats` takes, by the query key each sets, and what each takes. */
const TAKES: Readonly<Record<QueryKey, string>> = {
  from: 'a day, YYYY-MM-DD in UTC: the first day counted',
  to: 'a day, YYYY-MM-DD in UTC: the last day counted',
  by: `what the rows go by: ${BY_KEYS.join(', ')}`,
  agent: "an agent's name: only the steps it fills",
  step: "a step's name: only that step",
  factory: "a factory's name: only its runs",
  workflow: "a workflow folder's name: only its runs",
  repo: "a repository's path, as a run's record names it: only its runs",
};

/** The query keys `nemia stats` takes a flag for, in the order its help says them. */
const KEYS = Object.keys(TAKES) as QueryKey[];

/** A `nemia stats` flag's refusal of a value left out, empty, or given apart as a flag. */
const statsTakes = (key: string): string => `--${key} takes ${TAKES[key as QueryKey]}`;

/** What `nemia stats --help` prints: what it counts, each flag and what it takes, and how it prints. */
export const STATS_HELP = `nemia stats [--from <day>] [--to <day>] [--by <key>] [--agent|--step|--factory|--workflow|--repo <value>] [-l <selector>] [--line|--json]

The flow numbers of every run in the store, of every factory and repository: the runs finished and landed, the rounds
a loop took to be accepted, the share of landed runs that landed on their first try, the cost and wall time of a landed
run, and per step its tries, their time and cost, its checks' verdicts and its waits at a gate. It prints tiles, the
last 14 days against the 14 before, a row per UTC day, and a row per step and agent. A number nothing measured is
absent, "—" in words and null in JSON, never 0.

${KEYS.map((key) => `  --${key.padEnd(10)}${TAKES[key]}`).join('\n')}
  -l          the runs whose labels a selector takes, given again for another (-l team=core)
  --line      one line, for a recap
  --json      the whole answer, as GET /api/stats gives it`;

/** What a person asked of the stats, by query key: each flag's value given. */
const givenOf = (args: Args): Partial<Record<QueryKey, string>> =>
  Object.fromEntries(KEYS.flatMap((key) => (textOf(args, key) === undefined ? [] : [[key, textOf(args, key)]])));

/**
 * Refused of `nemia stats`' flags before anything is read: a value empty or starting `--`, which reads as the value left out, in what the
 * flag takes; then what `statsQueryOf` refuses of the query, in the flags' names.
 */
function statsRefusal(args: Args): string | null {
  const left = KEYS.find((key) => {
    const value = textOf(args, key);
    return value !== undefined && (!value || value.startsWith('--'));
  });
  if (left) return statsTakes(left);
  const selector = selectorCheck(args);
  if (selector !== null) return selector;
  try {
    statsQueryOf(givenOf(args), (key) => `--${key}`);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

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
export const STATS: Command<Stats, StatsInput> = {
  name: 'stats',
  served: [{ endpoint: 'server.stats' }],
  usage:
    '[--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [-l <selector>] [--line|--json]',
  help: [
    'what every run in the store adds up to, by UTC day: rounds to',
    'acceptance of each loop: step, landings of the workspace: base step',
    "and on which try, cost and time per landed run, and each step's",
    'tries, time, cost, checks and gate waits; first the last 14 days',
    'against the 14 before. A number nothing measured reads —, never 0.',
    '--line: one line, for a recap; --json: the whole answer; -l: the',
    'runs whose labels a selector takes, as nemia ls -l takes them',
  ],
  manual: STATS_HELP,
  spec: {
    positionals: [],
    flags: [
      ...KEYS.map((key) => ({
        flag: `--${key}`,
        kind: 'text' as const,
        key,
        takes: statsTakes(key),
        twice: `nemia stats takes --${key} once.`,
      })),
      selectorFlag('nemia stats'),
      { flag: '--line', kind: 'switch', key: 'line' },
      { flag: '--json', kind: 'switch', key: 'json' },
    ],
    unknown: (arg) =>
      `nemia stats does not take ${arg}. It takes ${KEYS.map((k) => `--${k}`).join(', ')}, -l <selector>, and --line or --json.`,
    apart: (_value, flag) => (flag === '-l' ? selectorFlag('nemia stats').takes : undefined) ?? statsTakes(flag.slice(2)),
  },
  check: statsRefusal,
  writes: false,
  class: 'read',
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
  print: (s, args) => (args.json === true ? [JSON.stringify(s, null, 2)] : args.line === true ? [statsLine(s)] : statsLines(s)),
};
