/**
 * The board's reads of a run's step, entries of the command table the api alone serves: a file of its files directory, a file of a folder
 * step's own folder, its task's path through the runtime's lifecycle and its conversation.
 */
import { Effect, Schema } from 'effect';
import { EngineService, asked, tried, type Engine } from '../runtime-client.ts';
import type { Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { artifactFile, fileIn } from '../artifacts/artifacts.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { isRepositoryRun } from '../record/record.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { transcriptAskedRead, transcriptCursorRead, transcriptPaged } from '../transcript-page/transcript-page.ts';

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

/**
 * What a read of a step's conversation takes: its task's, and the cursor to read from, none for the start; and `page`, where it is read
 * as the api's `GET …/transcript` answers, a page: the first `limit` events or the `last` ones, of the `kinds` asked, within `bounds`
 * (`TRANSCRIPT_PAGE`, unless a test shortens them), the cursor `<engine cursor>~<n>` (`transcriptPaged`). With no `page`, the engine's
 * whole read after its own cursor, as the stream follows it.
 */
export const StepTranscriptInput = Schema.Struct({
  ...StepTaskInput.fields,
  after: Schema.optionalKey(Schema.String),
  page: Schema.optionalKey(
    Schema.Struct({
      limit: Schema.optionalKey(Schema.String),
      last: Schema.optionalKey(Schema.String),
      kinds: Schema.optionalKey(Schema.String),
      bounds: Schema.Struct({ byDefault: Schema.Number, most: Schema.Number }),
    }),
  ),
});
export type StepTranscriptInput = typeof StepTranscriptInput.Type;

/** The file `name` of the files directory of the step `step` of the run `id` (`artifactFile`), or null where there is none. */
export const STEP_ARTIFACT: Command<{ file: Buffer | null }, StepFileInput> = {
  name: 'step artifact',
  served: [{ endpoint: 'steps.artifact' }],
  usage: '<runId> <step> <name>',
  help: ["one file of a step's files directory"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board links each file a step's closeout named; at the command line a person opens the file" },
  input: StepFileInput,
  handler: Effect.fnUntraced(function* ({ runId, step, name }: StepFileInput) {
    const home = yield* StoreRoot;
    const run = yield* (yield* RunDoor).runs.find(RunId.read(runId), () => {});
    return yield* tried(() => ({ file: run ? artifactFile(home, run, step, name) : null }));
  }),
  print: () => [],
};

/**
 * The folder the step `step` of the run `id` works in — null for a step of a repository run, which works on a branch, and for one not filed
 * yet — and its file `name` (`fileIn`), or null where there is none.
 */
export const STEP_FILE: Command<{ folder: string | null; file: Buffer | null }, StepFileInput> = {
  name: 'step file',
  served: [{ endpoint: 'steps.file' }],
  usage: '<runId> <step> <name>',
  help: ["one file of a folder step's own folder"],
  spec: stepSpec(NAME, []),
  writes: false,
  class: 'read',
  only: { side: 'api', why: "the board links each file a folder step's folder holds; at the command line a person opens the folder" },
  input: StepFileInput,
  handler: Effect.fnUntraced(function* ({ runId, step, name }: StepFileInput) {
    const run = yield* (yield* RunDoor).runs.find(RunId.read(runId), () => {});
    const folder = run && !isRepositoryRun(run) ? (run.steps[step]?.workspace ?? null) : null;
    return yield* tried(() => ({ folder, file: folder === null ? null : fileIn(folder, name) }));
  }),
  print: () => [],
};

/** One state of a task's path through the runtime's lifecycle, as the engine's `path` answers it. */
export type LifecycleTransition = Effect.Success<ReturnType<Engine['path']>>[number];

/** The path through the runtime's lifecycle of the task `task` — a try of the step `step` of the run `id`, as the api resolved it. */
export const STEP_PATH: Command<{ path: LifecycleTransition[] }, StepTaskInput> = {
  name: 'step path',
  served: [{ endpoint: 'steps.path' }],
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
 * the cursor `after`, none for the start: the engine's events, and the cursor to read on from. Asked a `page`, the engine reads from the
 * engine's cursor `after` carries, and the page is cut of its read (`transcriptPaged`): `more` says events already said are left after it;
 * `Invalid` for a cursor, a count or a kind the page refuses, before the engine is asked. The port's tool reads the last 50 events where
 * its call asks neither `limit` nor `last`: an agent reads where a conversation is.
 */
export const STEP_TRANSCRIPT: Command<{ events: ConversationEvent[]; cursor: string; more?: boolean }, StepTranscriptInput> = {
  name: 'step transcript',
  served: [{ endpoint: 'steps.transcript', query: { last: '50' } }],
  usage: '<runId> <step>',
  help: ["a read of a step's conversation"],
  spec: stepSpec([], ['task', 'after', 'limit', 'last', 'kinds']),
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: "the board reads a step's conversation as it goes; at the command line, nemia logs reads what its session printed",
  },
  input: StepTranscriptInput,
  handler: Effect.fnUntraced(function* ({ task, after, page }: StepTranscriptInput) {
    const e = yield* EngineService;
    if (page === undefined) {
      const { events, cursor } = yield* asked('transcript', e.transcript(task, after));
      return { events: [...events], cursor };
    }
    const at = transcriptCursorRead(after);
    if (at instanceof Invalid) return yield* Effect.fail(at);
    const checked = transcriptAskedRead(page, page.bounds);
    if (checked instanceof Invalid) return yield* Effect.fail(checked);
    const read = yield* asked('transcript', e.transcript(task, at.engine));
    const paged = transcriptPaged(read, at, page, page.bounds);
    if (paged instanceof Invalid) return yield* Effect.fail(paged);
    return { ...paged, events: [...paged.events] };
  }),
  print: () => [],
};

/** The board's reads of one run and its steps, in the order the table lists them. */
export const PAGES: readonly Command[] = [STEP_ARTIFACT, STEP_FILE, STEP_PATH, STEP_TRANSCRIPT] as readonly Command[];
