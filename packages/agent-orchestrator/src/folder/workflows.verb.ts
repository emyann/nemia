/**
 * The workflow folders as entries of the command table: a folder of yours written from its steps (`WORKFLOWS_WRITE`, `writeWorkflow`) and
 * removed (`WORKFLOWS_REMOVE`, `removeWorkflow`), each checked against the version it was read at, served on both sides — the command line
 * reads a draft folder (`cli/writers.ts`), the builder sends its steps; and the folders the board lists, each loaded (`WORKFLOWS_LIST`,
 * `loadWorkflows`), and one step of a folder (`WORKFLOWS_STEP`), on the api alone. The api resolves which folder a read names, and words
 * the board's answer around what each entry answers.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tried } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { apiKey, cliPath, factoryFlag, FROM, versionFlag, writerSpec, yoursOrRefused } from '../yours/yours.ts';
import { workflowNameRefusal } from '../factory/factory.ts';
import { readFactories, readFactory, templatedTree } from '../factory/factory.store.ts';
import { factoryFills } from '../rules/rules.store.ts';
import { readInbox } from '../inbox/inbox.store.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { HOME, isDirectory } from '../record/record.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import type { Workflow } from '../step/step.ts';
import type { StepDraft } from '../workflow/index.ts';
import { stillNeeded, workflowStale, workflowTaken } from './folder.ts';
import { loadWorkflows } from './folder.store.ts';
import type { Places } from '../skills/read.store.ts';
import { workflowVersion } from './version.store.ts';
import { removeWorkflowAt, writeWorkflowAt, type WorkflowRemoved, type WorkflowWritten } from './write.store.ts';

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
 * workflow's name, and its rules where they read (`factoryFills`), left out where they do not, since a listing refuses nothing a start
 * will; none with no factory.
 */
function fillsIn(args: Args) {
  const name = textOf(args, 'factory');
  if (name === undefined) return () => undefined;
  const factory = readFactory(name);
  return (workflow: string) => factoryFills(factory, workflow).fills;
}

/** Why the board's workflow writes are served by the api's own routes. */
const WRITE_HAND =
  'the builder guards the write, decodes its steps in its own words, judges and writes the schemas pasted beside them, and reads the folder back';

/** `--repo`, which the board hands for the repository a folder's agents and skills are looked for in; the command line looks in yours. */
const REPO = apiKey('repo', "the board names the repository it lists a folder's agents from; the command line names none, and reads yours");

/**
 * Where a write's folder looks for its agents and skills: for the place `factory`, the factory's tree as its repository (`templatedTree`);
 * else as `placesOf` says.
 */
const writePlacesOf = (args: Args, home: string): Places =>
  textOf(args, 'from') === 'factory' && textOf(args, 'factory') !== undefined
    ? { repo: templatedTree(textOf(args, 'factory') ?? '', 'nemia workflows write'), home }
    : placesOf(args, home);

/**
 * The folder of yours a writer (`who`) names, `<home>/workflows/<name>`, or of a factory's tree, `<tree>/workflows/<name>`, checked
 * against the version it was read at (`version`) before a write or a removal (`does`): refused, as `Invalid`, for a place but those
 * (`yoursOrRefused`) and for a name no folder of yours has (`workflowNameRefusal`); something there already that is no folder, written,
 * as a `Conflict` (`workflowTaken`); a folder there already, written with no version, as a `Conflict` naming the version it is at; one
 * not there, written with a version, as `Missing`; and one changed since its version was read, as a `Conflict` (`workflowStale`). A
 * removal with no version is refused naming the version; one of what is not a folder there is left to `removeWorkflow`'s refusal.
 */
function versionHeld(who: string, does: 'write' | 'remove', args: Args, home: string): string {
  const name = textOf(args, 'name') ?? '';
  const yours = yoursOrRefused(who, 'workflows', textOf(args, 'from') ?? '', name, textOf(args, 'repo') ?? '', home, {
    factory: textOf(args, 'factory'),
    treeOf: (factory) => templatedTree(factory, who),
  });
  const badName = workflowNameRefusal(name);
  if (badName) throw new Invalid({ message: `${who}: ${badName}` });
  const dir = path.join(yours, name);
  const version = textOf(args, 'version');
  const there = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (!there) {
    if (does === 'write' && version !== undefined)
      throw new Missing({ message: `${dir} is not there: it was removed since it was read. Write it with no version to make it again.` });
    return dir;
  }
  if (!there.isDirectory()) {
    if (does === 'write') throw new Conflict({ message: workflowTaken(dir, null) });
    return dir;
  }
  const now = workflowVersion(dir, writePlacesOf(args, home));
  if (version === undefined) {
    if (does === 'write') throw new Conflict({ message: workflowTaken(dir, now) });
    throw new Invalid({
      message: `${dir} is at version ${now}, and a removal is checked against the version it was read at, so a folder changed since is not removed unseen. Give that version to remove it.`,
    });
  }
  if (now !== version) throw new Conflict({ message: workflowStale[does](dir, version, now) });
  return dir;
}

/**
 * A folder of yours, `<home>/workflows/<name>`, or of the tree of the factory `--factory` names (the place `factory`), written from its
 * steps (`writeWorkflow`, which judges the whole folder before a byte is written), checked first against the version it was read at
 * (`versionHeld`): `draft`, the steps as JSON text, which the command line reads off `--folder`; `readme`, the folder's README where one
 * is given. Answers what was written, and the version the folder is at now.
 */
export const WORKFLOWS_WRITE: Command<WorkflowWritten & { version: string }> = {
  name: 'workflows write',
  usage: '(yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]',
  help: [
    'a workflow folder of yours, or of a templated --factory, written from',
    'a draft folder; one there already, at the --version it was read at',
  ],
  spec: writerSpec(
    'workflows write',
    '(yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]',
    [FROM, { key: 'name', takes: 'required', kind: 'name' }],
    [
      cliPath(
        'workflows write',
        'folder',
        'the draft folder whose steps and README to write',
        'the api is sent the steps themselves, never a folder to read',
      ),
      versionFlag('workflows write', 'the folder'),
      factoryFlag('workflows write'),
      apiKey('draft', 'the command line reads the steps off --folder, into the form the builder sends'),
      apiKey('readme', 'the command line reads the README off --folder, as the builder sends the one written'),
      REPO,
    ],
  ),
  writes: true,
  class: 'ask',
  route: [
    { method: 'POST', path: '/api/workflows/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/workflows/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const dir = versionHeld('nemia workflows write', 'write', args, home);
      const steps = JSON.parse(textOf(args, 'draft') ?? '[]') as StepDraft[];
      const places = writePlacesOf(args, home);
      const written = writeWorkflowAt(home, dir, steps, textOf(args, 'readme'), { places });
      return { ...written, version: workflowVersion(written.dir, places) };
    }),
  print: ({ dir, version, written, kept, removed }) => [
    `${path.basename(dir)} written in ${dir}, at version ${version}: ${[...written, ...kept].join(', ')}`,
    ...(removed.length ? [`removed: ${removed.join(', ')}`] : []),
  ],
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
 * A folder of yours, `<home>/workflows/<name>`, removed whole (`removeWorkflow`), checked first against the version it was read at
 * (`versionHeld`). Refused, with nothing removed, while a run, a queued card or a factory still needs it (`usersOf`), each named with the
 * command that frees it.
 */
export const WORKFLOWS_REMOVE: Command<WorkflowRemoved> = {
  name: 'workflows rm',
  usage: 'yours <name> --version <v>',
  help: ['a workflow folder of yours removed, at the --version it was read at'],
  spec: writerSpec(
    'workflows rm',
    'yours <name> --version <v>',
    [FROM, { key: 'name', takes: 'required', kind: 'name' }],
    [versionFlag('workflows rm', 'the folder'), REPO],
  ),
  writes: true,
  class: 'ask',
  route: {
    method: 'DELETE',
    path: '/api/workflows/:from/:name',
    status: 200,
    hand: 'the builder guards the removal, and decodes its version in its own words',
  },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const dir = path.resolve(versionHeld('nemia workflows rm', 'remove', args, home));
      return removeWorkflowAt(home, dir, usersOf(dir));
    }),
  print: ({ dir, removed }) => [`removed ${dir}: ${removed.join(', ')}`],
};

/** A folder loaded (`steps`), or why it does not load (`error`, the loader's words). */
export type FolderLoaded = { steps: Workflow[] } | { error: string };

/** Each folder `dirs` names, loaded as a start on `repo` would load it, in the factory named with its hires (`FolderLoaded`), by folder. */
export const WORKFLOWS_LIST: Command<Record<string, FolderLoaded>> = {
  name: 'workflows',
  usage: '[<dirs> ...]',
  help: ['the workflow folders named, each loaded'],
  spec: apiSpec([{ key: 'dirs', takes: 'many', kind: 'name' }], ['repo', 'factory']),
  writes: false,
  class: 'read',
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
  class: 'read',
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
export const WORKFLOW_ENTRIES: readonly Command[] = [
  WORKFLOWS_WRITE,
  WORKFLOWS_REMOVE,
  WORKFLOWS_LIST,
  WORKFLOWS_STEP,
] as readonly Command[];
