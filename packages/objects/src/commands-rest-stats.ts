/**
 * The words of `nemia stats`: the flow numbers of every run in the store. Its check refuses what the stats' query refuses of a command
 * line before anything is read, in the flags' names: a value left out, a key to go by that is none, a day that is none, days out of
 * order. A label query's grammar is the api's to judge. Pure.
 */
import type { Args, CommandWords } from './command.ts';
import { selectorFlag } from './commands-flags.ts';
import { STATS_BY } from './words.ts';

/** A key of what `nemia stats` is given a flag for: the days, the key to go by, and a filter per key. */
type StatsKey = 'from' | 'to' | 'by' | (typeof STATS_BY)[number];

/** The value flags `nemia stats` takes, by the query key each sets, and what each takes. */
const TAKES: Readonly<Record<StatsKey, string>> = {
  from: 'a day, YYYY-MM-DD in UTC: the first day counted',
  to: 'a day, YYYY-MM-DD in UTC: the last day counted',
  by: `what the rows go by: ${STATS_BY.join(', ')}`,
  agent: "an agent's name: only the steps it fills",
  step: "a step's name: only that step",
  factory: "a factory's name: only its runs",
  workflow: "a workflow folder's name: only its runs",
  repo: "a repository's path, as a run's record names it: only its runs",
};

/** The query keys `nemia stats` takes a flag for, in the order its help says them. */
export const STATS_KEYS = Object.keys(TAKES) as readonly StatsKey[];

/** A `nemia stats` flag's refusal of a value left out, empty, or given apart as a flag. */
const statsTakes = (key: string): string => `--${key} takes ${TAKES[key as StatsKey] ?? 'a value'}`;

/** What `nemia stats --help` prints: what it counts, each flag and what it takes, and how it prints. */
export const STATS_MANUAL = `nemia stats [--from <day>] [--to <day>] [--by <key>] [--agent|--step|--factory|--workflow|--repo <value>] [-l <key>=<value>] [--line|--json]

The flow numbers of every run in the store, of every factory and repository: the runs finished and landed, the rounds
a loop took to its approval, the share of landed runs that landed on their first try, the cost and wall time of a landed
run, and per step its tries, their time and cost, its checks' verdicts and its waits at a gate. It prints tiles, the
last 14 days against the 14 before, a row per UTC day, and a row per step and agent. A number nothing measured is
absent, "—" in words and null in JSON, never 0.

${STATS_KEYS.map((key) => `  --${key.padEnd(10)}${TAKES[key]}`).join('\n')}
  -l          the runs whose labels it takes, given again for another (-l team=core)
  --line      one line, for a recap
  --json      the whole answer, as GET /api/stats gives it`;

/** The text under `key`, or undefined where none was given. */
const textIn = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** Whether `text` is a real day, `YYYY-MM-DD`, in UTC. */
const isDay = (text: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && new Date(text).toISOString().slice(0, 10) === text;

/**
 * What `nemia stats` refuses of its flags before anything is read, or null: a value empty or starting `--`, in what the flag takes; a key
 * to go by that is not one of `STATS_BY`; a day that is not a real `YYYY-MM-DD`; a `--from` after the `--to`.
 */
export function statsRefusal(args: Args): string | null {
  const left = STATS_KEYS.find((key) => {
    const value = textIn(args, key);
    return value !== undefined && (!value || value.startsWith('--'));
  });
  if (left) return statsTakes(left);
  const by = textIn(args, 'by');
  if (by !== undefined && !(STATS_BY as readonly string[]).includes(by))
    return `--by takes one of ${STATS_BY.join(', ')}, not ${JSON.stringify(by)}.`;
  for (const key of ['from', 'to'] as const) {
    const day = textIn(args, key);
    if (day !== undefined && !isDay(day))
      return `--${key} takes a day as YYYY-MM-DD, in UTC, such as 2026-09-30 — not ${JSON.stringify(day)}.`;
  }
  const [from, to] = [textIn(args, 'from'), textIn(args, 'to')];
  if (from && to && from > to) return `--from ${from} is after --to ${to}: give the earlier day first.`;
  return null;
}

/** `nemia stats`: the flow numbers of every run in the store, as tiles and a row per day, one line (`--line`), or JSON (`--json`). */
export const STATS_WORDS = {
  name: 'stats',
  served: [{ endpoint: 'server.stats' }],
  usage:
    '[--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [-l <key>=<value>] [--line|--json]',
  help: [
    'what every run in the store adds up to, by UTC day: rounds to',
    'acceptance of each loop: step, landings of the workspace: base step',
    "and on which try, cost and time per landed run, and each step's",
    'tries, time, cost, checks and gate waits; first the last 14 days',
    'against the 14 before. A number nothing measured reads —, never 0.',
    '--line: one line, for a recap; --json: the whole answer; -l: the',
    'runs whose labels it takes, as nemia ls -l takes them',
  ],
  manual: STATS_MANUAL,
  spec: {
    positionals: [],
    flags: [
      ...STATS_KEYS.map((key) => ({
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
      `nemia stats does not take ${arg}. It takes ${STATS_KEYS.map((k) => `--${k}`).join(', ')}, -l <key>=<value>, and --line or --json.`,
    apart: (_value, flag) => (flag === '-l' ? selectorFlag('nemia stats').takes : undefined) ?? statsTakes(flag.slice(2)),
  },
  check: statsRefusal,
  writes: false,
  class: 'read',
} as const satisfies CommandWords;
