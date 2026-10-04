/**
 * The board's reads of one run, each an entry of the command table served on the api alone: the run for its page (`RUN`), and of one of
 * its steps a file of its files directory (`STEP_ARTIFACT`) or of its own folder (`STEP_FILE`), the path of one of its tasks through the
 * runtime's lifecycle (`STEP_PATH`), and a read of that task's conversation (`STEP_TRANSCRIPT`). A run is found among those the store
 * lists, never by a path made of its id, and a file by its name, never by a path. The api resolves the task a request names, words the
 * answer for what is not there, and judges what it is handed.
 */
import type { Engine } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from './command.ts';
import type { Command } from './entry.verb.ts';
import { artifactFile, fileIn } from '../record/artifacts.store.ts';
import { runStore } from '../record/files.store.ts';
import { isGitRun, type Run } from '../record/record.ts';

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

/** The run `id` names, among the runs the store lists; undefined for one it does not have. */
const runOf = (args: Args): Run | undefined => runStore.runs.list().find((r) => r.id === textOf(args, 'id'));

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
  route: { method: 'GET', path: '/api/runs/:id', status: 200 },
  only: {
    side: 'api',
    why: "the board's run page is a run judged, with its steps and their files; at the command line, wf show reads its record",
  },
  handler: async (_e, args) => ({ run: runOf(args) ?? null }),
  print: () => [],
};

/** The file `name` of the files directory of the step `step` of the run `id` (`artifactFile`), or null where there is none. */
export const STEP_ARTIFACT: Command<{ file: Buffer | null }> = {
  name: 'step artifact',
  usage: '<id> <step> <name>',
  help: ["one file of a step's files directory"],
  spec: stepSpec(NAME, []),
  writes: false,
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/artifacts/:name', status: 200 },
  only: { side: 'api', why: "the board links each file a step's closeout named; at the command line a person opens the file" },
  handler: async (_e, args) => {
    const run = runOf(args);
    return { file: run ? artifactFile(run, textOf(args, 'step') ?? '', textOf(args, 'name') ?? '') : null };
  },
  print: () => [],
};

/**
 * The folder the step `step` of the run `id` works in — null for a step of a git run, which works on a branch, and for one not filed
 * yet — and its file `name` (`fileIn`), or null where there is none.
 */
export const STEP_FILE: Command<{ folder: string | null; file: Buffer | null }> = {
  name: 'step file',
  usage: '<id> <step> <name>',
  help: ["one file of a folder step's own folder"],
  spec: stepSpec(NAME, []),
  writes: false,
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/files/:name', status: 200 },
  only: { side: 'api', why: "the board links each file a folder step's folder holds; at the command line a person opens the folder" },
  handler: async (_e, args) => {
    const run = runOf(args);
    const folder = run && !isGitRun(run) ? (run.steps[textOf(args, 'step') ?? '']?.workspace ?? null) : null;
    return { folder, file: folder === null ? null : fileIn(folder, textOf(args, 'name') ?? '') };
  },
  print: () => [],
};

/** One state of a task's path through the runtime's lifecycle, as the engine's `path` answers it. */
export type LifecycleStep = Awaited<ReturnType<Engine['path']>>[number];

/** The path through the runtime's lifecycle of the task `task` — a try of the step `step` of the run `id`, as the api resolved it. */
export const STEP_PATH: Command<{ path: LifecycleStep[] }> = {
  name: 'step path',
  usage: '<id> <step>',
  help: ["the path of a step's task through the runtime's lifecycle"],
  spec: stepSpec([], ['task']),
  writes: false,
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/path', status: 200 },
  only: { side: 'api', why: "the board draws each try of a step on the lifecycle's diagram; at the command line, wf ls says its state" },
  handler: async (e, args) => ({ path: [...(await e.path(textOf(args, 'task') ?? ''))] }),
  print: () => [],
};

/** One event of a task's conversation, as the engine's `transcript` answers it. */
export type ConversationEvent = Awaited<ReturnType<Engine['transcript']>>['events'][number];

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
  route: { method: 'GET', path: '/api/runs/:id/steps/:step/transcript', status: 200 },
  only: {
    side: 'api',
    why: "the board reads a step's conversation as it goes; at the command line, wf logs reads what its session printed",
  },
  handler: async (e, args) => {
    const { events, cursor } = await e.transcript(textOf(args, 'task') ?? '', textOf(args, 'after'));
    return { events: [...events], cursor };
  },
  print: () => [],
};

/** The board's reads of one run and its steps, in the order the table lists them. */
export const PAGES: readonly Command[] = [RUN, STEP_ARTIFACT, STEP_FILE, STEP_PATH, STEP_TRANSCRIPT] as readonly Command[];
