/**
 * The board's workflow folders as entries of the command table, each served on the api alone: a folder written from its steps
 * (`WORKFLOWS_WRITE`, `writeWorkflow`), a folder of yours removed (`WORKFLOWS_REMOVE`, `removeWorkflow`), the folders it lists, each loaded
 * (`WORKFLOWS_LIST`, `loadWorkflows`), and one step of a folder (`WORKFLOWS_STEP`). The api resolves which folder a request names, and
 * words the board's answer around what each entry answers.
 */
import path from 'node:path';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { fillsOf } from '../factory/factory.ts';
import { readFactories, readFactory } from '../factory/factory.store.ts';
import { readInbox } from '../inbox/inbox.store.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { isDirectory } from '../record/record.store.ts';
import type { Workflow } from '../step/step.ts';
import type { StepDraft } from '../workflow/index.ts';
import { stillNeeded } from './folder.ts';
import { loadWorkflows, type Places } from './folder.store.ts';
import { removeWorkflow, writeWorkflow, type WorkflowRemoved, type WorkflowWritten } from './write.store.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's workflows take no ${arg}.`,
});

/** Where a folder's agents and skills are looked for, as a start on `repo` looks, with `home` yours. */
const placesOf = (args: Args, home: string | undefined): Places => ({
  ...(textOf(args, 'repo') !== undefined && { repo: textOf(args, 'repo') }),
  ...(home !== undefined && { home }),
});

/**
 * What the loader fills the steps of a workflow with in the factory the arguments name, read once: its hires into them, by the
 * workflow's name; none with no factory.
 */
function fillsIn(args: Args) {
  const name = textOf(args, 'factory');
  if (name === undefined) return () => undefined;
  const { hires } = readFactory(name);
  return (workflow: string) => ({ factory: name, workflow, agents: fillsOf(hires, workflow) });
}

/** Why the board's workflow writes are served by the api's own routes. */
const WRITE_HAND =
  'the builder guards the write, decodes its steps in its own words, judges and writes the schemas pasted beside them, and reads the folder back';

/**
 * A folder of yours written from its steps (`writeWorkflow`, which judges the whole folder before a byte is written): `dir`, the folder the
 * api resolved; `draft`, the steps as JSON text, decoded by the route before; `readme`, the folder's README where one is given.
 */
export const WORKFLOWS_WRITE: Command<WorkflowWritten> = {
  name: 'workflows write',
  usage: '<from> [<name>]',
  help: ['a workflow folder of yours written from its steps'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'optional', kind: 'name' },
    ],
    ['dir', 'draft', 'readme', 'repo'],
  ),
  writes: true,
  route: [
    { method: 'POST', path: '/api/workflows/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/workflows/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  only: { side: 'api', why: "the board's builder writes a folder from a form; at the command line a person edits the folder's files" },
  handler: async (_e, args, _env, home) =>
    writeWorkflow(textOf(args, 'dir') ?? '', JSON.parse(textOf(args, 'draft') ?? '[]') as StepDraft[], textOf(args, 'readme'), {
      places: placesOf(args, home),
    }),
  print: () => [],
};

/**
 * What still needs the workflow folder `dir`, one sentence each (`stillNeeded`): every run that froze no steps at its start and reads them
 * from the folder; every card queued to start on it, by its `workflow:` read from the inbox, but one a record says was started, which the
 * tick never starts again; and every factory that attaches its name while none of its repositories has a workflow of that name, with its
 * hires into it. A run that froze its steps, a card not queued and a factory with a repository's workflow of the name go on without it.
 */
function usersOf(dir: string): string[] {
  const name = path.basename(dir);
  const runs = runStore.runs
    .list(() => {})
    .filter((run) => run.workflow === undefined && path.resolve(run.workflowDir) === dir)
    .map((run) => stillNeeded.run(run.id, dir));
  const cards = readInbox()
    .filter((card) => card.queued?.place != null && card.workflow !== null && path.resolve(inboxDir(), card.workflow) === dir)
    .map((card) => stillNeeded.card(card.name, dir));
  const factories = readFactories().flatMap((factory) => {
    if ('error' in factory || !factory.workflows.includes(name)) return [];
    if (factory.repos.some((repo) => isDirectory(path.join(repo, 'workflows', name)))) return [];
    const hires = Object.keys(factory.hires).filter((step) => step.startsWith(`${name}/`));
    return [stillNeeded.factory(factory.name, name, hires.sort())];
  });
  return [...runs, ...cards, ...factories];
}

/**
 * A folder of yours removed whole (`removeWorkflow`): `dir`, the folder the api resolved. Refused, with nothing removed, while a run, a
 * queued card or a factory still needs it (`usersOf`), each named with the command that frees it.
 */
export const WORKFLOWS_REMOVE: Command<WorkflowRemoved> = {
  name: 'workflows remove',
  usage: '<from> <name>',
  help: ['a workflow folder of yours removed'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'required', kind: 'name' },
    ],
    ['dir', 'repo'],
  ),
  writes: true,
  route: {
    method: 'DELETE',
    path: '/api/workflows/:from/:name',
    status: 200,
    hand: 'the builder guards the removal, and refuses a folder changed since the board read it by its version',
  },
  only: { side: 'api', why: 'the board removes a workflow of yours; at the command line a person removes its folder' },
  async handler(_e, args, _env, home) {
    const dir = path.resolve(textOf(args, 'dir') ?? '');
    return removeWorkflow(dir, { ...(home !== undefined && { home }), users: usersOf(dir) });
  },
  print: () => [],
};

/** A folder loaded (`steps`), or why it does not load (`error`, the loader's words). */
export type FolderLoaded = { steps: Workflow[] } | { error: string };

/** Each folder `dirs` names, loaded as a start on `repo` would load it, in the factory named with its hires (`FolderLoaded`), by folder. */
export const WORKFLOWS_LIST: Command<Record<string, FolderLoaded>> = {
  name: 'workflows list',
  usage: '[<dirs> ...]',
  help: ['the workflow folders named, each loaded'],
  spec: apiSpec([{ key: 'dirs', takes: 'many', kind: 'name' }], ['repo', 'factory']),
  writes: false,
  route: { method: 'GET', path: '/api/workflows', status: 200 },
  only: {
    side: 'api',
    why: 'the board lists every folder with its steps and its graph; at the command line, wf start names the one it runs',
  },
  async handler(_e, args, _env, home) {
    const dirs = Array.isArray(args.dirs) ? args.dirs : [];
    const fills = fillsIn(args);
    const loads = dirs.map((dir): [string, FolderLoaded] => {
      try {
        return [dir, { steps: loadWorkflows(dir, placesOf(args, home), fills(path.basename(dir))) }];
      } catch (err) {
        return [dir, { error: err instanceof Error ? err.message : String(err) }];
      }
    });
    return Object.fromEntries(loads);
  },
  print: () => [],
};

/**
 * One step of the folder `dir`, the workflow `name`, loaded as a start would load it, in the factory named with its hires: the step, or
 * null where the folder has none of that name, and the names of the steps it has.
 */
export const WORKFLOWS_STEP: Command<{ step: Workflow | null; steps: string[] }> = {
  name: 'workflows step',
  usage: '<from> <name> <step>',
  help: ['one step of a workflow folder, loaded'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    ['dir', 'repo', 'factory'],
  ),
  writes: false,
  route: { method: 'GET', path: '/api/workflows/:from/:name/:step', status: 200 },
  only: {
    side: 'api',
    why: "the board's page of a step reads it as the builder shows it; at the command line a person reads the step's file",
  },
  async handler(_e, args, _env, home) {
    const name = textOf(args, 'name') ?? '';
    const steps = loadWorkflows(textOf(args, 'dir') ?? '', placesOf(args, home), fillsIn(args)(name));
    return { step: steps.find((s) => s.name === textOf(args, 'step')) ?? null, steps: steps.map((s) => s.name) };
  },
  print: () => [],
};

/** The board's workflow entries, in the order the table lists them. */
export const WORKFLOW_ENTRIES: readonly Command[] = [
  WORKFLOWS_WRITE,
  WORKFLOWS_REMOVE,
  WORKFLOWS_LIST,
  WORKFLOWS_STEP,
] as readonly Command[];
