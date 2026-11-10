/**
 * The board's reads of a run's steps, each an entry of the command table served on the api alone: of one of a run's steps a file of its
 * files directory (`STEP_ARTIFACT`) or of its own folder (`STEP_FILE`), the path of one of its tasks through the runtime's lifecycle
 * (`STEP_PATH`), and a read of that task's conversation (`STEP_TRANSCRIPT`). A run is found among those the store lists, never by a path
 * made of its id, and a file by its name, never by a path. The api resolves the task a request names, words the answer for what is not
 * there, and judges what it is handed.
 */
import { Effect, Schema } from 'effect';
import { EngineService, asked, tried, type Engine } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from './command.ts';
import type { Command, Kept } from './entry.verb.ts';
import { artifactFile, fileIn } from '../artifacts/artifacts.store.ts';
import { runStore } from '../record/files.store.ts';
import { isRepositoryRun, type Run } from '../record/record.ts';
import { verifiesRest } from '../config/config.store.ts';
import { informerMemo } from '../rest/informer.verb.ts';
import { HOME } from '../record/record.store.ts';
import type { SummaryHow } from '../summary/summary.verb.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Labels } from '../labels/labels.ts';
import { labelSegments, runLabelMap } from '../runlist/runlist.ts';
import { parseSelectors, selectorsRefusal, SELECTOR_FORM, type Selectors } from '../watch/selector.ts';

/**
 * The selectors an entry of the table is given under `selector`, in the order given — `-l` at the command line, each given again for
 * another, and the api's `?selector=`, one or many — none where unset: a list's read takes the runs whose labels one of them takes.
 */
export const selectorTexts = (args: Args): readonly string[] => {
  const value = args['selector'];
  return typeof value === 'string' ? [value] : Array.isArray(value) ? value : [];
};

/** Why the selectors under `selector` are refused, or null where each is one: an entry's `check`. */
export const selectorCheck = (args: Args): string | null => selectorsRefusal(selectorTexts(args)) ?? null;

/**
 * The selectors under `selector`, parsed (`parseSelectors`); refused as `Invalid` (exit 2, 422 on the api) where one is no selector, in
 * the grammar's own words (`selectorsRefusal`), which end on the form it takes. None where none was given.
 */
export const selectorsIn = (args: Args): Effect.Effect<Selectors, Invalid> => {
  const refusal = selectorCheck(args);
  return refusal === null ? Effect.succeed(parseSelectors(selectorTexts(args))) : Effect.fail(new Invalid({ message: refusal }));
};

/**
 * `-l <selector>`, `--show-labels` and `-L <key>` of the command `command`: the runs whose labels a selector takes, each given again for
 * another; each line with its whole map; and that label's value beside each line, given again for another (`labelsShown`).
 */
export const labelFlags = (command: string): Flag[] => [
  selectorFlag(command),
  { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
  {
    flag: '-L',
    kind: 'text',
    key: 'labelColumns',
    many: true,
    takes: `${command} -L takes the label key to show beside each line, given again for another: ${command} -L team`,
  },
];

/** What a line of `map`'s ends on as `--show-labels` and `-L` ask under `args` (`labelSegments`): nothing with neither. */
export const labelsShown = (args: Args, map: Labels): string => {
  const columns = args['labelColumns'];
  return labelSegments(map, { all: args['showLabels'] === true, columns: Array.isArray(columns) ? columns : [] });
};

/** What each run's head line ends on as `--show-labels` and `-L` ask under `args`, of the run's whole map (`runLabelMap`). */
export const runsShown =
  (args: Args) =>
  (run: Run): string =>
    labelsShown(args, runLabelMap(run));

/** `-l <selector>`, given again for another, of the command `command`: the runs whose labels one of them takes. */
export const selectorFlag = (command: string): Flag => ({
  flag: '-l',
  kind: 'text',
  key: 'selector',
  many: true,
  takes: `${command} -l takes a selector of the runs' labels: ${SELECTOR_FORM}`,
});

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of a read of a step: the run's id and the step's name, then `more`, and its text flags by key. */
const stepSpec = (more: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals: [{ key: 'runId', takes: 'required', kind: 'name' }, { key: 'step', takes: 'required', kind: 'name' }, ...more],
  flags: keys.map(keyed),
  unknown: (arg) => `the board's reads of a step take no ${arg}.`,
});

/** The file's name, as the api's path names it. */
const NAME: readonly Positional[] = [{ key: 'name', takes: 'required', kind: 'name' }];

/** What a read of a step's file takes: the run's id, the step's name and the file's, never a path. */
export const StepFileInput = Schema.Struct({ runId: Schema.String, step: Schema.String, name: Schema.String });
export type StepFileInput = typeof StepFileInput.Type;

/** What a read of a step's task takes: the run's id, the step's name, and the task the api resolved for it. */
export const StepTaskInput = Schema.Struct({ runId: Schema.String, step: Schema.String, task: Schema.String });
export type StepTaskInput = typeof StepTaskInput.Type;

/** What a read of a step's conversation takes: its task's, and the cursor to read from, none for the start. */
export const StepTranscriptInput = Schema.Struct({ ...StepTaskInput.fields, after: Schema.optionalKey(Schema.String) });
export type StepTranscriptInput = typeof StepTranscriptInput.Type;

/**
 * How a read of the list reads, as the inbox's do: the informer and the feed's filing times its caller keeps, verified as its
 * environment says; a caller that keeps neither judges every run.
 */
export const howOf = (env?: NodeJS.ProcessEnv, home?: string, kept?: Kept): SummaryHow => ({
  home: home ?? HOME,
  memo: kept?.runs ?? informerMemo(),
  filings: kept?.filings ?? { filed: new Map(), cursor: 0 },
  verify: env ? verifiesRest(env) : false,
});

/** The file `name` of the files directory of the step `step` of the run `id` (`artifactFile`), or null where there is none. */
export const STEP_ARTIFACT: Command<{ file: Buffer | null }, StepFileInput> = {
  name: 'step artifact',
  usage: '<runId> <step> <name>',
  help: ["one file of a step's files directory"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board links each file a step's closeout named; at the command line a person opens the file" },
  input: StepFileInput,
  handler: ({ runId, step, name }) =>
    tried(() => {
      const run = runStore.runs.find(runId);
      return { file: run ? artifactFile(run, step, name) : null };
    }),
  print: () => [],
};

/**
 * The folder the step `step` of the run `id` works in — null for a step of a repository run, which works on a branch, and for one not filed
 * yet — and its file `name` (`fileIn`), or null where there is none.
 */
export const STEP_FILE: Command<{ folder: string | null; file: Buffer | null }, StepFileInput> = {
  name: 'step file',
  usage: '<runId> <step> <name>',
  help: ["one file of a folder step's own folder"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board links each file a folder step's folder holds; at the command line a person opens the folder" },
  input: StepFileInput,
  handler: ({ runId, step, name }) =>
    tried(() => {
      const run = runStore.runs.find(runId);
      const folder = run && !isRepositoryRun(run) ? (run.steps[step]?.workspace ?? null) : null;
      return { folder, file: folder === null ? null : fileIn(folder, name) };
    }),
  print: () => [],
};

/** One state of a task's path through the runtime's lifecycle, as the engine's `path` answers it. */
export type LifecycleTransition = Effect.Success<ReturnType<Engine['path']>>[number];

/** The path through the runtime's lifecycle of the task `task` — a try of the step `step` of the run `id`, as the api resolved it. */
export const STEP_PATH: Command<{ path: LifecycleTransition[] }, StepTaskInput> = {
  name: 'step path',
  usage: '<runId> <step>',
  help: ["the path of a step's task through the runtime's lifecycle"],
  spec: stepSpec([], ['task']),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board draws each try of a step on the lifecycle's diagram; at the command line, nemia ls says its state" },
  input: StepTaskInput,
  handler: Effect.fnUntraced(function* ({ task }: StepTaskInput) {
    const e = yield* EngineService;
    return { path: [...(yield* asked('path', e.path(task)))] };
  }),
  print: () => [],
};

/** One event of a task's conversation, as the engine's `transcript` answers it. */
export type ConversationEvent = Effect.Success<ReturnType<Engine['transcript']>>['events'][number];

/**
 * One read of the conversation of the task `task` — the current one of the step `step` of the run `id`, as the api resolved it — from
 * the cursor `after`, none for the start: the engine's events, and the cursor to read on from.
 */
export const STEP_TRANSCRIPT: Command<{ events: ConversationEvent[]; cursor: string }, StepTranscriptInput> = {
  name: 'step transcript',
  usage: '<runId> <step>',
  help: ["a read of a step's conversation"],
  spec: stepSpec([], ['task', 'after']),
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: "the board reads a step's conversation as it goes; at the command line, nemia logs reads what its session printed",
  },
  input: StepTranscriptInput,
  handler: Effect.fnUntraced(function* ({ task, after }: StepTranscriptInput) {
    const e = yield* EngineService;
    const { events, cursor } = yield* asked('transcript', e.transcript(task, after));
    return { events: [...events], cursor };
  }),
  print: () => [],
};

/** The board's reads of one run and its steps, in the order the table lists them. */
export const PAGES: readonly Command[] = [STEP_ARTIFACT, STEP_FILE, STEP_PATH, STEP_TRANSCRIPT] as readonly Command[];
