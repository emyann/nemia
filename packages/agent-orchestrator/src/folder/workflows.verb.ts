/**
 * The board's workflow folders as entries of the command table, each served on the api alone: a folder written from its steps
 * (`WORKFLOWS_WRITE`, `writeWorkflow`), the folders it lists, each loaded (`WORKFLOWS_LIST`, `loadWorkflows`), and one step of a folder
 * (`WORKFLOWS_STEP`). The api resolves which folder a request names, and words the board's answer around what each entry answers.
 */
import { tried } from '../runtime-client.ts';
import path from 'node:path';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { fillsOf } from '../factory/factory.ts';
import { readFactory } from '../factory/factory.store.ts';
import type { Workflow } from '../step/step.ts';
import type { StepDraft } from '../workflow/index.ts';
import { loadWorkflows, type Places } from './folder.store.ts';
import { writeWorkflow, type WorkflowWritten } from './write.store.ts';

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
  handler: (args, _env, home) =>
    tried(() =>
      writeWorkflow(textOf(args, 'dir') ?? '', JSON.parse(textOf(args, 'draft') ?? '[]') as StepDraft[], textOf(args, 'readme'), {
        places: placesOf(args, home),
      }),
    ),
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
    why: 'the board lists every folder with its steps and its graph; at the command line, nemia start names the one it runs',
  },
  handler: (args, _env, home) =>
    tried(() => {
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
    }),
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
  handler: (args, _env, home) =>
    tried(() => {
      const name = textOf(args, 'name') ?? '';
      const steps = loadWorkflows(textOf(args, 'dir') ?? '', placesOf(args, home), fillsIn(args)(name));
      return { step: steps.find((s) => s.name === textOf(args, 'step')) ?? null, steps: steps.map((s) => s.name) };
    }),
  print: () => [],
};

/** The board's workflow entries, in the order the table lists them. */
export const WORKFLOW_ENTRIES: readonly Command[] = [WORKFLOWS_WRITE, WORKFLOWS_LIST, WORKFLOWS_STEP] as readonly Command[];
