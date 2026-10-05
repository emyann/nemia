/**
 * The reads of the store, each defined once: `nemia show` (a run's record), `nemia logs` (a step's session output), `nemia feed` (what the
 * tick judged, from a cursor) and `nemia stats` (what the store's runs add up to). Their handlers answer data, and the CLI prints it; the
 * api serves a step's log and the stats on their routes from the same entries, and the board reads a run and the feed through reads of its
 * own (`only`).
 */
import { runStore } from '../record/files.store.ts';
import type { Run } from '../record/record.ts';
import { cursorTakes, feedLineWords, type FeedLine } from '../feed/feed.ts';
import { readFeed } from '../feed/feed.store.ts';
import { verifiesRest } from '../config/config.store.ts';
import { pausedWords, type Paused } from '../pause/pause.ts';
import { pausedRead } from '../list/list.verb.ts';
import { BY_KEYS, statsLine, statsLines, statsQueryOf, type QueryKey, type Stats } from '../stats/index.ts';
import { stats } from '../stats/stats.verb.ts';
import type { Args } from './command.ts';
import type { Command } from './entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `nemia show` and `nemia logs`' refusal of a word or a flag they do not take. */
const takesNo = (verb: string, form: string) => (arg: string) => `nemia ${verb} takes ${form}: not ${arg}.`;

/** `nemia show`: the run's record, its brief cut at 120 characters and each frozen step's body at 60, as JSON. */
export const SHOW: Command<Run> = {
  name: 'show',
  usage: '<runId>',
  help: ['the run, and what each step was told'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: takesNo('show', "one run's id"),
  },
  writes: false,
  only: { side: 'cli', why: "the board's run page is the api's judged view of a run (GET /api/runs/:id), not its record" },
  async handler(_e, args) {
    const run = runStore.runs.read(textOf(args, 'runId') ?? '');
    const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
    return { ...run, brief: `${run.brief.slice(0, 120)}…`, workflow };
  },
  print: (run) => [JSON.stringify(run, null, 2)],
};

/**
 * `nemia logs`: the session output of a step's current task, read from the engine whole, or nothing for a step with no task filed — one not
 * run yet, or one the run does not have.
 */
export const LOGS: Command<{ taskId?: string; output?: string }> = {
  name: 'logs',
  usage: '<runId> <step>',
  help: ["that step's session output"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: takesNo('logs', "one run's id and one step's name"),
  },
  writes: false,
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/log', status: 200 },
  async handler(e, args) {
    const taskId = runStore.runs.read(textOf(args, 'runId') ?? '').steps[textOf(args, 'step') ?? '']?.taskId;
    return taskId ? { taskId, output: await e.logs(taskId) } : {};
  },
  print: ({ output }, args) => [output ?? `${textOf(args, 'step') ?? ''} has not run yet`],
};

/**
 * `nemia feed`: the store's pause while one stands, the feed's lines after a cursor, 0 when none is given, and the cursor to read on from;
 * printed in that order.
 */
export const FEED: Command<{ pause: Paused; lines: FeedLine[]; cursor: number }> = {
  name: 'feed',
  usage: '[cursor]',
  help: [
    "what the tick judged, a line each time it changed: a run's status, a",
    "step's word as nemia ls says it, and what a person's word changed — then",
    'cursor: <n>, to read on from with nemia feed <n>; from the start with none',
  ],
  spec: {
    positionals: [{ key: 'cursor', takes: 'optional', kind: 'text' }],
    flags: [],
    unknown: () => cursorTakes('feed'),
  },
  check: (args) => {
    const cursor = textOf(args, 'cursor');
    return cursor === undefined || /^\d+$/.test(cursor) ? null : cursorTakes('feed');
  },
  writes: false,
  only: { side: 'cli', why: 'the board follows the feed through GET /api/feed/stream, the counterpart of nemia watch' },
  handler: async (e, args) => ({ ...readFeed(Number(textOf(args, 'cursor') ?? 0)), pause: await pausedRead(e) }),
  print: ({ pause, lines, cursor }) => {
    const paused = pausedWords(pause);
    return [...(paused ? [paused] : []), ...lines.map(feedLineWords), `cursor: ${cursor}`];
  },
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
export const STATS_HELP = `nemia stats [--from <day>] [--to <day>] [--by <key>] [--agent|--step|--factory|--workflow|--repo <value>] [--line|--json]

The flow numbers of every run in the store, of every factory and repository: the runs finished and landed, the rounds
a loop took to be accepted, the share of landed runs that landed on their first try, the cost and wall time of a landed
run, and per step its tries, their time and cost, its checks' verdicts and its waits at a gate. It prints tiles, the
last 14 days against the 14 before, a row per UTC day, and a row per step and agent. A number nothing measured is
absent, "—" in words and null in JSON, never 0.

${KEYS.map((key) => `  --${key.padEnd(10)}${TAKES[key]}`).join('\n')}
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
  try {
    statsQueryOf(givenOf(args), (key) => `--${key}`);
    return null;
  } catch (err) {
    return (err as Error).message;
  }
}

/**
 * `nemia stats`: the flow numbers of every run in the store, as tiles and a row per day, one line (`--line`), or JSON (`--json`). The api
 * answers the same `Stats` on its route, through the memo it keeps (`kept.stats`), verified as its environment says.
 */
export const STATS: Command<Stats> = {
  name: 'stats',
  usage:
    '[--from <day>] [--to <day>] [--by agent|step|factory|workflow|repo] [--agent|--step|--factory|--workflow|--repo <v>] [--line|--json]',
  help: [
    'what every run in the store adds up to, by UTC day: rounds to',
    'acceptance of each loop: step, landings of the workspace: main step',
    "and on which try, cost and time per landed run, and each step's",
    'tries, time, cost, checks and gate waits; first the last 14 days',
    'against the 14 before. A number nothing measured reads —, never 0.',
    '--line: one line, for a recap; --json: the whole answer',
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
      { flag: '--line', kind: 'switch', key: 'line' },
      { flag: '--json', kind: 'switch', key: 'json' },
    ],
    unknown: (arg) => `nemia stats does not take ${arg}. It takes ${KEYS.map((k) => `--${k}`).join(', ')}, and --line or --json.`,
    apart: (_value, flag) => statsTakes(flag.slice(2)),
  },
  check: statsRefusal,
  writes: false,
  route: { method: 'GET', path: '/api/stats', status: 200 },
  handler: (e, args, env, _home, kept) =>
    stats(
      e,
      statsQueryOf(givenOf(args), (key) => `--${key}`),
      new Date(),
      {
        memo: kept?.stats,
        verify: env ? verifiesRest(env) : undefined,
        series: kept?.series,
      },
    ),
  print: (s, args) => (args.json === true ? [JSON.stringify(s, null, 2)] : args.line === true ? [statsLine(s)] : statsLines(s)),
};

/** The reads, in the order `nemia`'s help lists them. */
export const READS: readonly Command[] = [SHOW, LOGS, FEED, STATS];
