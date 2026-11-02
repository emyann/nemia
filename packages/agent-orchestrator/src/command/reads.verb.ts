/**
 * The reads of the store, each defined once: `nemia show` (a run's record), `nemia logs` (a step's session output), `nemia stats` (what
 * the store's runs add up to) and `nemia series` (what the system's passes were, kept a minute and an hour at a time; listed in the help
 * beside the passes). Their handlers answer data, and the CLI prints it; the api serves a step's log and the stats on their routes from
 * the same entries, and the board reads a run through a read of its own (`only`). The feed is `nemia watch`'s, which the CLI runs itself.
 */
import { Effect } from 'effect';
import { EngineService, asked, tried } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { rooted } from '../wiring/wire.verb.ts';
import type { StepCloseout, StepTry } from '../resource/tries.verb.ts';
import { runObject, stepCloseout, stepTold, stepTries, stepTry, type TryCloseout } from '../object/run.verb.ts';
import { runStore } from '../record/files.store.ts';
import type { Run } from '../record/record.ts';
import { verifiesRest } from '../config/config.store.ts';
import { BY_KEYS, statsLine, statsLines, statsQueryOf, type QueryKey, type Stats } from '../stats/index.ts';
import { statsRun } from '../stats/stats.verb.ts';
import { RANGE_TAKES, seriesRead } from '../series/series.store.ts';
import { seriesLines, type SeriesRead } from '../series/series.ts';
import type { Args } from './command.ts';
import type { Command, Kept } from './entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `nemia show` and `nemia logs`' refusal of a word or a flag they do not take. */
const takesNo = (verb: string, form: string) => (arg: string) => `nemia ${verb} takes ${form}: not ${arg}.`;

/** The record as `nemia show --raw` prints it: its brief cut at 120 characters and each frozen step's body at 60. */
const rawOf = (run: Run) => {
  const workflow = run.workflow?.map(({ body, ...keys }) => ({ ...keys, body: `${body.slice(0, 60)}…` }));
  return { ...run, brief: `${run.brief.slice(0, 120)}…`, workflow };
};

/**
 * `nemia show`: the run as one object, `nemia/v1`'s `Run` (`runObject`), as JSON, with a line on stderr pointing to `--raw`; `--raw`, the
 * run's record as it printed before, its brief cut at 120 characters and each frozen step's body at 60.
 */
export const SHOW: Command = {
  name: 'show',
  usage: '<runId> [--raw]',
  help: ['the run as one object (nemia/v1 Run); --raw: its record, and', 'what each step was told'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [{ flag: '--raw', kind: 'switch', key: 'raw' }],
    unknown: takesNo('show', "one run's id, and --raw"),
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the board's run page is the api's judged view of a run (GET /api/runs/:id), not its record" },
  handler: (args, _env, home, kept?: Kept) =>
    Effect.flatMap(
      tried(() => runStore.runs.read(textOf(args, 'runId') ?? '')),
      (run): Effect.Effect<Readonly<Record<string, unknown>>, Refusal, EngineService | PlaceService> =>
        args.raw === true
          ? Effect.succeed(rawOf(run))
          : rooted(home, 'show', runObject(run, { memo: { filings: kept?.filings ?? { filed: new Map(), cursor: 0 }, said: new Map() } })),
    ),
  print: (data) => [JSON.stringify(data, null, 2)],
  note: (_data, args) =>
    args.raw === true
      ? []
      : [`nemia show prints the run as one object; \`nemia show --raw ${textOf(args, 'runId') ?? '<runId>'}\` prints its record.`],
};

/** The run and the step a sub-resource names. */
const stepNamed = (args: Args): [string, string] => [textOf(args, 'runId') ?? '', textOf(args, 'step') ?? ''];

/** The positionals of a step's sub-resource: the run's id and the step's name. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** What the sub-resources the api alone serves say of the command line. */
const API_ONLY = 'a sub-resource of the run object, for a client; at the command line `nemia show <run>` prints the run whole';

/** `GET /api/runs/:runId/steps/:step/tries`: a step's tries, earliest first, the current one last (`StepTry`). */
export const TRIES: Command<{ tries: StepTry[] }> = {
  name: 'tries',
  usage: '<runId> <step>',
  help: ["a step's tries"],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('tries', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/tries', status: 200 },
  handler: (args, _env, home) => rooted(home, 'tries', stepTries(...stepNamed(args))),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/** `GET /api/runs/:runId/steps/:step/tries/:try`: one try of a step (`StepTry`). */
export const TRY: Command<StepTry> = {
  name: 'try',
  usage: '<runId> <step> <try>',
  help: ['one try of a step'],
  spec: {
    positionals: [...RUN_STEP, { key: 'try', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: takesNo('try', "one run's id, one step's name and one try's number"),
  },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/tries/:try', status: 200 },
  handler: (args, _env, home) => rooted(home, 'try', stepTry(...stepNamed(args), textOf(args, 'try'))),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/** A field's value on one line: a string as it is, anything else as JSON. */
const valueLine = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/**
 * A closeout as a person reads it at the command line: its outcome and summary, the question a blocked step asks (`needs`), its body,
 * the files and values it handed on, the fields its workflow asked for (`output`, a review's findings among them), each reply to a finding
 * with its why under it, and what it left out or was refused — everything the api's route answers but the closeout as it came (`raw`) and
 * the schema it was read by.
 */
const closeoutLines = (n: number, c: StepCloseout): string[] => [
  `try ${n}: ${c.outcome}: ${c.summary}`,
  ...(c.needs ? [`needs: ${c.needs}`] : []),
  ...(c.body && c.body !== c.summary ? ['', c.body] : []),
  ...(c.artifacts.length ? ['', 'artifacts:', ...c.artifacts.map((a) => `  ${a.path}`)] : []),
  ...(c.values.length ? ['', 'values:', ...c.values.map((v) => `  ${v.name}: ${v.value}`)] : []),
  ...(Object.keys(c.output).length ? ['', 'output:', ...Object.entries(c.output).map(([k, v]) => `  ${k}: ${valueLine(v)}`)] : []),
  ...(c.questions.length ? ['', `questions: ${c.questions.flatMap((q) => q.questions.map((x) => x.title)).join(' · ')}`] : []),
  ...(c.replies?.length ? ['', 'replies:', ...c.replies.flatMap((r) => [`  ${r.answer}: ${r.finding}`, `    ${r.why}`])] : []),
  ...(c.missing.length ? ['', `missing: ${c.missing.join(', ')}`] : []),
  ...(c.refused.length ? ['', 'refused:', ...c.refused.map((r) => `  ${r}`)] : []),
];

/**
 * `nemia closeout <run> <step> [--try n]`, `GET /api/runs/:runId/steps/:step/tries/:try/closeout`: what a try of a step signed off with,
 * its latest by default (`TryCloseout`).
 */
export const CLOSEOUT: Command<TryCloseout> = {
  name: 'closeout',
  usage: '<runId> <step> [--try <n>]',
  help: ["what a step's try signed off with: its latest, or --try <n>"],
  spec: {
    positionals: [...RUN_STEP],
    flags: [{ flag: '--try', kind: 'text', key: 'try', takes: "a try's number", twice: 'nemia closeout takes --try once.' }],
    unknown: takesNo('closeout', "one run's id, one step's name, and --try <n>"),
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/tries/:try/closeout', status: 200 },
  handler: (args, _env, home) => rooted(home, 'closeout', stepCloseout(...stepNamed(args), textOf(args, 'try'))),
  print: ({ try: n, closeout, unreadable }, args) =>
    closeout
      ? closeoutLines(n, closeout)
      : [
          `try ${n} of ${textOf(args, 'step') ?? ''}: ${unreadable ? `its closeout does not read: ${unreadable.error}` : 'no closeout yet'}`,
        ],
};

/** `GET /api/runs/:runId/steps/:step/told`: what a step was told, its brief by layer and its task by part (`toldOf`). */
export const TOLD: Command<Effect.Success<ReturnType<typeof stepTold>>> = {
  name: 'told',
  usage: '<runId> <step>',
  help: ['what a step was told'],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('told', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/told', status: 200 },
  handler: (args, _env, home) => rooted(home, 'told', stepTold(...stepNamed(args))),
  print: (data) => [JSON.stringify(data, null, 2)],
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
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:runId/steps/:step/log', status: 200 },
  handler: Effect.fnUntraced(function* (args: Args) {
    const e = yield* EngineService;
    const taskId = runStore.runs.read(textOf(args, 'runId') ?? '').steps[textOf(args, 'step') ?? '']?.taskId;
    return taskId ? { taskId, output: yield* asked('logs', e.logs(taskId)) } : {};
  }),
  print: ({ output }, args) => [output ?? `${textOf(args, 'step') ?? ''} has not run yet`],
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
    'acceptance of each loop: step, landings of the workspace: base step',
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
  class: 'read',
  route: { method: 'GET', path: '/api/stats', status: 200 },
  handler: (args, env, _home, kept?: Kept) =>
    statsRun(
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

/** `nemia series`: the system's series over a range, a point a minute, an hour or a day. */
export const SERIES: Command<SeriesRead> = {
  name: 'series',
  usage: '[--range 24h|7d|30d|all] [--json]',
  help: [
    "the system's series over a range: a pass's time and its phases, its",
    'journal reads, the runs in the store, the sessions queued and admitted',
    'and the longest wait, the load, and the quota used. --range: 24h (a',
    'point a minute, the default), 7d or 30d (an hour), all (a day);',
    '--json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--range', kind: 'text', key: 'range', takes: RANGE_TAKES, twice: 'nemia series takes --range once.' },
      { flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole answer, as JSON' } },
    ],
    unknown: (arg) => `nemia series does not take ${arg}. It takes --range <range> and --json.`,
    apart: () => RANGE_TAKES,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/series', status: 200 },
  handler: (args, _env, _home, kept?: Kept) => tried(() => seriesRead(textOf(args, 'range'), kept?.series)),
  print: (read, args) => (args.json === true ? [JSON.stringify(read, null, 2)] : seriesLines(read)),
};

/** The reads, in the order `nemia`'s help lists them. */
export const READS: readonly Command[] = [SHOW, CLOSEOUT, TRIES, TRY, TOLD, LOGS, STATS];
