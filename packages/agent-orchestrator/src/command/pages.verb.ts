/**
 * The board's reads of its runs, each an entry of the command table served on the api alone: every run's summary for its list (`RUNS`),
 * the runs that wait or move with the counts (`RUNS_OPEN`), a page of the finished runs (`RUNS_FINISHED`),
 * the run for its page (`RUN`), and of one of
 * its steps a file of its files directory (`STEP_ARTIFACT`) or of its own folder (`STEP_FILE`), the path of one of its tasks through the
 * runtime's lifecycle (`STEP_PATH`), and a read of that task's conversation (`STEP_TRANSCRIPT`). A run is found among those the store
 * lists, never by a path made of its id, and a file by its name, never by a path. The api resolves the task a request names, words the
 * answer for what is not there, and judges what it is handed.
 */
import { Effect } from 'effect';
import { EngineService, asked, tried, type Engine } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from './command.ts';
import type { Command, Kept } from './entry.verb.ts';
import { artifactFile, fileIn } from '../artifacts/artifacts.store.ts';
import { runStore } from '../record/files.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { verifiesRest } from '../config/config.store.ts';
import { restingMemo } from '../rest/resting.verb.ts';
import { HOME } from '../record/record.store.ts';
import { type FinishedPage, type OpenRuns, runsFinished, runsOpen } from '../runlist/runlist.verb.ts';
import { type RunSummary, runsSummarized, type SummaryHow } from '../summary/summary.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of a read of a step: the run's id and the step's name, then `more`, and its text flags by key. */
const stepSpec = (more: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals: [{ key: 'id', takes: 'required', kind: 'name' }, { key: 'step', takes: 'required', kind: 'name' }, ...more],
  flags: keys.map(keyed),
  unknown: (arg) => `the board's reads of a step take no ${arg}.`,
});

/** The file's name, as the api's path names it. */
const NAME: readonly Positional[] = [{ key: 'name', takes: 'required', kind: 'name' }];

/** The run `id` names, found among the ids the store lists (`runs.find`); undefined for one it does not have. */
const runOf = (args: Args): Run | undefined => runStore.runs.find(textOf(args, 'id') ?? '');

/** The run `id`, found among the runs the store lists, never read by a path made of the id; null for one the store does not have. */
export const RUN: Command<{ run: Run | null }> = {
  name: 'run',
  usage: '<id>',
  help: ['one run, read for its page'],
  spec: {
    positionals: [{ key: 'id', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `the board's run page reads one run, and ${arg} is a second.`,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:id', status: 200 },
  only: {
    side: 'api',
    why: "the board's run page is a run judged, with its steps and their files; at the command line, nemia show reads its record",
  },
  handler: (args) => tried(() => ({ run: runOf(args) ?? null })),
  print: () => [],
};

/**
 * Every run's summary, in the store's order (`runsSummarized`): read off the memo of runs at rest and the feed's filing times the caller
 * keeps (`kept.runs`, `kept.filings`), verified as its environment says (`verifiesRest`); a caller that keeps neither judges every run.
 */
export const RUNS: Command<RunSummary[]> = {
  name: 'runs',
  usage: '',
  help: ["every run's summary, for the board's list"],
  spec: { positionals: [], flags: [], unknown: (arg) => `the board's list of runs takes no ${arg}.` },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs', status: 200 },
  only: {
    side: 'api',
    why: "the board's list is every run judged into a summary, kept between its polls while the run rests; the command line prints each run's lines",
  },
  handler: Effect.fnUntraced(function* (_args: Args, env?: NodeJS.ProcessEnv, home?: string, kept?: Kept) {
    return yield* runsSummarized(yield* EngineService, {
      home: home ?? HOME,
      memo: kept?.runs ?? restingMemo(),
      filings: kept?.filings ?? { filed: new Map(), cursor: 0 },
      verify: env ? verifiesRest(env) : false,
    });
  }),
  print: () => [],
};

/**
 * How a read of the list reads, as `RUNS` does: the memo of runs at rest and the feed's filing times its caller keeps, verified as its
 * environment says; a caller that keeps neither judges every run.
 */
const howOf = (env?: NodeJS.ProcessEnv, home?: string, kept?: Kept): SummaryHow => ({
  home: home ?? HOME,
  memo: kept?.runs ?? restingMemo(),
  filings: kept?.filings ?? { filed: new Map(), cursor: 0 },
  verify: env ? verifiesRest(env) : false,
});

/**
 * The runs that wait on a person and the runs in flight, with the counts of each and of the finished runs (`runsOpen`), read now: of
 * the factory `factory`, or of every factory where none is given. The waiting runs carry the cost of each step, their clock's parts and
 * when their present wait began.
 */
export const RUNS_OPEN: Command<OpenRuns> = {
  name: 'runs open',
  usage: '',
  help: ['the runs that wait on a person and the runs in flight, with the counts of each and of the finished'],
  spec: { positionals: [], flags: [keyed('factory')], unknown: (arg) => `the board's read of the open runs takes no ${arg}.` },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs-open', status: 200 },
  only: {
    side: 'api',
    why: "the board's bell and its runs page poll what waits and what moves, apart from the finished runs; the command line lists every run",
  },
  handler: Effect.fnUntraced(function* (args: Args, env?: NodeJS.ProcessEnv, home?: string, kept?: Kept) {
    return yield* runsOpen(yield* EngineService, howOf(env, home, kept), { factory: textOf(args, 'factory'), now: Date.now() });
  }),
  print: () => [],
};

/**
 * One page of the finished runs, newest first by when their work stopped (`runsFinished`), read now: of the factory `factory`, or of
 * every factory; page `page`, from 1, of `size` rows, 9 where none is said. Refused (`Invalid`): a page or a size asked wrongly.
 */
export const RUNS_FINISHED: Command<FinishedPage> = {
  name: 'runs finished',
  usage: '',
  help: ['one page of the finished runs, newest first by when their work stopped'],
  spec: {
    positionals: [],
    flags: ['factory', 'page', 'size'].map(keyed),
    unknown: (arg) => `the board's read of the finished runs takes no ${arg}.`,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs-finished', status: 200 },
  only: {
    side: 'api',
    why: "the board's runs page reads the finished runs a page at a time; the command line lists every run",
  },
  handler: Effect.fnUntraced(function* (args: Args, env?: NodeJS.ProcessEnv, home?: string, kept?: Kept) {
    return yield* runsFinished(yield* EngineService, howOf(env, home, kept), {
      factory: textOf(args, 'factory'),
      page: textOf(args, 'page'),
      size: textOf(args, 'size'),
      now: Date.now(),
    });
  }),
  print: () => [],
};

/** The file `name` of the files directory of the step `step` of the run `id` (`artifactFile`), or null where there is none. */
export const STEP_ARTIFACT: Command<{ file: Buffer | null }> = {
  name: 'step artifact',
  usage: '<id> <step> <name>',
  help: ["one file of a step's files directory"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/artifacts/:name', status: 200 },
  only: { side: 'api', why: "the board links each file a step's closeout named; at the command line a person opens the file" },
  handler: (args) =>
    tried(() => {
      const run = runOf(args);
      return { file: run ? artifactFile(run, textOf(args, 'step') ?? '', textOf(args, 'name') ?? '') : null };
    }),
  print: () => [],
};

/**
 * The folder the step `step` of the run `id` works in — null for a step of a repository run, which works on a branch, and for one not filed
 * yet — and its file `name` (`fileIn`), or null where there is none.
 */
export const STEP_FILE: Command<{ folder: string | null; file: Buffer | null }> = {
  name: 'step file',
  usage: '<id> <step> <name>',
  help: ["one file of a folder step's own folder"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/files/:name', status: 200 },
  only: { side: 'api', why: "the board links each file a folder step's folder holds; at the command line a person opens the folder" },
  handler: (args) =>
    tried(() => {
      const run = runOf(args);
      const folder = run && !isRepositoryRun(run) ? (run.steps[textOf(args, 'step') ?? '']?.workspace ?? null) : null;
      return { folder, file: folder === null ? null : fileIn(folder, textOf(args, 'name') ?? '') };
    }),
  print: () => [],
};

/** One state of a task's path through the runtime's lifecycle, as the engine's `path` answers it. */
export type LifecycleTransition = Effect.Success<ReturnType<Engine['path']>>[number];

/** The path through the runtime's lifecycle of the task `task` — a try of the step `step` of the run `id`, as the api resolved it. */
export const STEP_PATH: Command<{ path: LifecycleTransition[] }> = {
  name: 'step path',
  usage: '<id> <step>',
  help: ["the path of a step's task through the runtime's lifecycle"],
  spec: stepSpec([], ['task']),
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/path', status: 200 },
  only: { side: 'api', why: "the board draws each try of a step on the lifecycle's diagram; at the command line, nemia ls says its state" },
  handler: Effect.fnUntraced(function* (args: Args) {
    const e = yield* EngineService;
    return { path: [...(yield* asked('path', e.path(textOf(args, 'task') ?? '')))] };
  }),
  print: () => [],
};

/** One event of a task's conversation, as the engine's `transcript` answers it. */
export type ConversationEvent = Effect.Success<ReturnType<Engine['transcript']>>['events'][number];

/**
 * One read of the conversation of the task `task` — the current one of the step `step` of the run `id`, as the api resolved it — from
 * the cursor `after`, none for the start: the engine's events, and the cursor to read on from.
 */
export const STEP_TRANSCRIPT: Command<{ events: ConversationEvent[]; cursor: string }> = {
  name: 'step transcript',
  usage: '<id> <step>',
  help: ["a read of a step's conversation"],
  spec: stepSpec([], ['task', 'after']),
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/transcript', status: 200 },
  only: {
    side: 'api',
    why: "the board reads a step's conversation as it goes; at the command line, nemia logs reads what its session printed",
  },
  handler: Effect.fnUntraced(function* (args: Args) {
    const e = yield* EngineService;
    const { events, cursor } = yield* asked('transcript', e.transcript(textOf(args, 'task') ?? '', textOf(args, 'after')));
    return { events: [...events], cursor };
  }),
  print: () => [],
};

/** The board's reads of one run and its steps, in the order the table lists them. */
export const PAGES: readonly Command[] = [
  RUNS,
  RUNS_OPEN,
  RUNS_FINISHED,
  RUN,
  STEP_ARTIFACT,
  STEP_FILE,
  STEP_PATH,
  STEP_TRANSCRIPT,
] as readonly Command[];
