/**
 * The reads of the store, each defined once: `nemia show` (a run's record), `nemia logs` (a step's session output), `nemia stats` (what
 * the store's runs add up to) and `nemia series` (what the system's passes were, kept a minute and an hour at a time; listed in the help
 * beside the passes). Their handlers answer data, and the CLI prints it; the api serves the run object, a step's log and the stats on their
 * routes from the same entries. The feed is `nemia watch`'s, which the CLI runs itself.
 */
import { Effect, Schema } from 'effect';
import { Run as RunObject } from 'objects';
import { EngineService, asked, tried } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { rooted } from '../factory/wiring/wire.verb.ts';
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
import { selectorCheck, selectorFlag, selectorsIn } from './pages.verb.ts';
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
 * `nemia show`: the run as one object, `nemia/v1`'s `Run` (`runObject`), encoded by the objects' `Run` as the api encodes it, so both
 * print the same keys in the same order, as JSON, with a line on stderr pointing to `--raw`; `--raw`, the
 * run's record as it printed before, its brief cut at 120 characters and each frozen step's body at 60. The api serves the object on
 * `GET /api/runs/:runId`, by hand, handed the app's memo, as one judgement for both sides, and the record on `?raw=true`, for `nemia`.
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
  route: { method: 'GET', path: '/api/runs/:runId', status: 200 },
  handler: (args, _env, home, kept?: Kept) =>
    Effect.flatMap(
      tried(() => runStore.runs.read(textOf(args, 'runId') ?? '')),
      (run): Effect.Effect<Readonly<Record<string, unknown>>, Refusal, EngineService | PlaceService> =>
        args.raw === true
          ? Effect.succeed(rawOf(run))
          : Effect.map(
              rooted(
                home,
                'show',
                runObject(run, { memo: { filings: kept?.filings ?? { filed: new Map(), cursor: 0 }, said: new Map() } }),
              ),
              (object) => ('unjudged' in object ? object : Schema.encodeSync(RunObject)(object)),
            ),
    ),
  print: (data) => [JSON.stringify(data, null, 2)],
  note: (_data, args) =>
    args.raw === true
      ? []
      : [`nemia show prints the run as one object; \`nemia show --raw ${textOf(args, 'runId') ?? '<runId>'}\` prints its record.`],
};

/** What a read of a run's step takes: the run's id and the step's name, as the CLI's positionals and the api's path name them. */
export const StepInput = Schema.Struct({ runId: Schema.String, step: Schema.String });
export type StepInput = typeof StepInput.Type;

/** What a read of one try of a step takes: the step's, and the try's number as the path or the command line says it. */
export const TryInput = Schema.Struct({ ...StepInput.fields, try: Schema.String });
export type TryInput = typeof TryInput.Type;

/** What `nemia closeout` takes: the step's, and the try's number, none for its latest. */
export const CloseoutInput = Schema.Struct({ ...StepInput.fields, try: Schema.optionalKey(Schema.String) });
export type CloseoutInput = typeof CloseoutInput.Type;

/** The positionals of a step's sub-resource: the run's id and the step's name. */
const RUN_STEP = [
  { key: 'runId', takes: 'required', kind: 'name' },
  { key: 'step', takes: 'required', kind: 'name' },
] as const;

/** What the sub-resources the api alone serves say of the command line. */
const API_ONLY = 'a sub-resource of the run object, for a client; at the command line `nemia show <run>` prints the run whole';

/** A step's tries, earliest first, the current one last (`StepTry`): the api's `steps` group serves it (`tries`). */
export const TRIES: Command<{ tries: StepTry[] }, StepInput> = {
  name: 'tries',
  usage: '<runId> <step>',
  help: ["a step's tries"],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('tries', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  input: StepInput,
  handler: ({ runId, step }, _env, home) => rooted(home, 'tries', stepTries(runId, step)),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/** One try of a step (`StepTry`): the api's `steps` group serves it (`try`). */
export const TRY: Command<StepTry, TryInput> = {
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
  input: TryInput,
  handler: ({ runId, step, try: n }, _env, home) => rooted(home, 'try', stepTry(runId, step, n)),
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
 * `nemia closeout <run> <step> [--try n]`: what a try of a step signed off with, its latest by default (`TryCloseout`); the api's `steps`
 * group serves it too (`closeout`), calling this handler.
 */
export const CLOSEOUT: Command<TryCloseout, CloseoutInput> = {
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
  only: { side: 'cli', why: "the api serves it as the `closeout` of `objects`' steps group, calling this handler" },
  input: CloseoutInput,
  handler: ({ runId, step, try: n }, _env, home) => rooted(home, 'closeout', stepCloseout(runId, step, n)),
  print: ({ try: n, closeout, unreadable }, { step }) =>
    closeout
      ? closeoutLines(n, closeout)
      : [`try ${n} of ${step}: ${unreadable ? `its closeout does not read: ${unreadable.error}` : 'no closeout yet'}`],
};

/** What a step was told, its brief by layer and its task by part (`toldOf`): the api's `steps` group serves it (`told`). */
export const TOLD: Command<Effect.Success<ReturnType<typeof stepTold>>, StepInput> = {
  name: 'told',
  usage: '<runId> <step>',
  help: ['what a step was told'],
  spec: { positionals: [...RUN_STEP], flags: [], unknown: takesNo('told', "one run's id and one step's name") },
  writes: false,
  class: 'read',
  only: { side: 'api', why: API_ONLY },
  input: StepInput,
  handler: ({ runId, step }, _env, home) => rooted(home, 'told', stepTold(runId, step)),
  print: (data) => [JSON.stringify(data, null, 2)],
};

/**
 * `nemia logs`: the session output of a step's current task, read from the engine whole, or nothing for a step with no task filed — one not
 * run yet, or one the run does not have. The api's `steps` group serves its end (`log`), calling this handler.
 */
export const LOGS: Command<{ taskId?: string; output?: string }, StepInput> = {
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
  only: { side: 'cli', why: "the api serves its end as the `log` of `objects`' steps group, calling this handler" },
  input: StepInput,
  handler: Effect.fnUntraced(function* ({ runId, step }: StepInput) {
    const e = yield* EngineService;
    const taskId = runStore.runs.read(runId).steps[step]?.taskId;
    return taskId ? { taskId, output: yield* asked('logs', e.logs(taskId)) } : {};
  }),
  print: ({ output }, { step }) => [output ?? `${step} has not run yet`],
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
 * `nemia stats`: the flow numbers of every run in the store, as tiles and a row per day, one line (`--line`), or JSON (`--json`). The api
 * answers the same `Stats` on its route, through the memo it keeps (`kept.stats`), verified as its environment says.
 */
export const STATS: Command<Stats> = {
  name: 'stats',
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
  route: { method: 'GET', path: '/api/stats', status: 200 },
  handler: Effect.fnUntraced(function* (args: Args, env?: NodeJS.ProcessEnv, _home?: string, kept?: Kept) {
    const selectors = yield* selectorsIn(args);
    const query = yield* tried(() => statsQueryOf(givenOf(args), (key) => `--${key}`));
    return yield* statsRun(selectors.length ? { ...query, selectors } : query, new Date(), {
      memo: kept?.stats,
      verify: env ? verifiesRest(env) : undefined,
      series: kept?.series,
    });
  }),
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
