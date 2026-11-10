/**
 * The workflow folders as entries of the command table, each through the Workflow door (`WorkflowDoor`, run at the store's root
 * (`StoreRoot`) its handler is given): a folder of yours written from its steps (`WORKFLOWS_WRITE`) and removed (`WORKFLOWS_REMOVE`), each
 * checked against the version it was read at, served on both sides — the command line reads a draft folder (`cli/writers.ts`), the builder
 * sends its steps; and one step of a folder (`WORKFLOWS_STEP`), on the api alone. The folders the board lists are loaded by the program the
 * api runs itself (`foldersLoaded`), handed its factory whole. The api resolves which folder a read names, and words the board's answer
 * around what each answers.
 */
import { StoreRoot } from '../config/root.store.ts';
import path from 'node:path';
import { Cause, Effect, Exit, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { WorkflowDoor, type CarriedFile } from './workflows.store.ts';
import type { WorkflowDir } from '../folder/folder.model.ts';
import type { Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { cliPath, factoryFlag, FROM, versionFlag, writerSpec, yoursOrRefused } from '../yours/yours.ts';
import { workflowNameRefusal } from '../factory/factory.ts';
import { FactoryDoor, factoryOrNone, templatedAtOnce, templatedTreeOf } from '../factory/door/factories.store.ts';
import { factoryFills } from '../factory/rules/rules.store.ts';
import type { Factory } from '../factory/factory.ts';
import { readInbox } from '../inbox/inbox.store.ts';
import { inboxDir } from '../record/files.store.ts';
import { runsAtOnce } from '../runs/runs.store.ts';
import { isDirectory } from '../record/record.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Workflow } from '../step/step.ts';
import type { StepDraft } from '../workflow/index.ts';
import { stillNeeded, type Fills } from '../folder/folder.ts';
import { workflowDirAt } from '../folder/folder.store.ts';
import type { Places } from '../skills/read.store.ts';
import type { WorkflowRemoved, WorkflowWritten } from '../folder/write.store.ts';

/** Where a writer or a read names a folder: its place (`from`), its name, the repository it is judged on, and the factory it is in. */
type Where = { from?: string; name: string; repo?: string; factory?: string };

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's workflows take no ${arg}.`,
});

/** Where a folder's agents and skills are looked for, as a start on `repo` looks, with `home` yours. */
const placesOf = ({ repo }: Pick<Where, 'repo'>, home: string | undefined): Places => ({
  ...(repo !== undefined && { repo }),
  ...(home !== undefined && { home }),
});

/**
 * How a write of the workflow `workflow` into the tree of the templated factory `name`, in the store `home`, is judged, as a run of it
 * would read it: its agents and skills looked for in the factory's repository, the one a run of it works on — its tree where it names
 * none — and in `home`, and its steps filled with the factory's hires into them and its rules (`factoryFills`). Refused as
 * `templatedTreeOf` refuses the factory.
 */
export function factoryWriteOf(home: string, name: string, workflow: string): { places: Places; fills: Fills } {
  const { factory, tree } = templatedAtOnce(home, name, 'nemia workflows write');
  return { places: { repo: factory.repos[0] ?? tree, home }, fills: factoryFills(factory, workflow).fills };
}

/**
 * Where `nemia workflows write` reads the draft folder of the workflow `workflow` for the templated factory `name` from, in the store
 * `home`: as `factoryWriteOf` judges the write, but with the factory's tree as the store, whose `workflows/` holds the agents its hires
 * name.
 */
export function factoryDraftOf(home: string, name: string, workflow: string): { places: Places; fills: Fills } {
  const { places, fills } = factoryWriteOf(home, name, workflow);
  return { places: { ...places, home: templatedTreeOf(home, name, 'nemia workflows write') }, fills };
}

/** Where a write's folder looks for its agents and skills, and the hires it is filled with: for the place `factory`, `factoryWriteOf`. */
const writeJudgedOf = (where: Where, home: string): { places: Places; fills?: Fills } =>
  where.from === 'factory' && where.factory !== undefined
    ? factoryWriteOf(home, where.factory, where.name)
    : { places: placesOf(where, home) };

/**
 * The folder of yours a writer (`who`) names, `<home>/workflows/<name>`, or of a factory's tree, `<tree>/workflows/<name>`, as the
 * Workflow door's id: refused, as `Invalid`, for a place but those (`yoursOrRefused`), for a name no folder of yours has
 * (`workflowNameRefusal`), and for a folder that is no workflow's (`workflowDirAt`). Minted here, where a writer's folder is resolved,
 * rather than in `yoursOrRefused`, which resolves the holders of agents and skills too.
 */
function yoursWorkflowDir(who: string, { from = '', name, repo = '', factory }: Where, home: string): WorkflowDir {
  const yours = yoursOrRefused(who, 'workflows', from, name, repo, home, {
    factory,
    treeOf: (factory) => templatedTreeOf(home, factory, who),
  });
  const badName = workflowNameRefusal(name);
  if (badName) throw new Invalid({ message: `${who}: ${badName}` });
  return workflowDirAt(path.resolve(yours, name));
}

/** The steps of a draft as the writer hands them, read by the command line off its draft folder and drafted by the builder. */
const StepDrafts = Schema.declare((u: unknown): u is StepDraft[] => Array.isArray(u));

/**
 * What `nemia workflows write`'s handler takes: the place it writes (`from`, `yours` or `factory`, and the `factory` whose tree), the
 * folder's `name`, the repository it is judged on, the `version` it was read at, its steps (`draft`), its README, and the other files the
 * draft folder carries (`files`, a script, a schema), each by its path and with its text.
 */
export const WorkflowWriteInput = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  factory: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  draft: StepDrafts,
  readme: Schema.optionalKey(Schema.String),
  files: Schema.optionalKey(Schema.Array(Schema.Struct({ path: Schema.String, text: Schema.String }))),
});
export type WorkflowWriteInput = typeof WorkflowWriteInput.Type;

/** What `nemia workflows rm`'s handler takes: the place (`yours`), the folder's name, the `version` it was read at, and the repository. */
export const WorkflowRemoveInput = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
});
export type WorkflowRemoveInput = typeof WorkflowRemoveInput.Type;

/**
 * What `workflows step`'s handler takes: the workflow's name and folder (`dir`, as the api resolved it), the step, the repository its
 * agents and skills are looked for on, and the factory whose hires fill it.
 */
export const WorkflowStepInput = Schema.Struct({
  name: Schema.String,
  step: Schema.String,
  dir: Schema.String,
  repo: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
});
export type WorkflowStepInput = typeof WorkflowStepInput.Type;

/**
 * A folder of yours, `<home>/workflows/<name>`, or of the tree of the factory `--factory` names (the place `factory`), written from its
 * steps through the Workflow door, which judges the whole folder before a byte is written and checks it against the version it was read
 * at (`workflowVersionRefusal`): `draft`, the steps as JSON text, which the command line reads off `--folder`; `readme`, the folder's
 * README where one is given; `files`, the other files the draft folder carries — a script, a schema — which the command line reads off
 * `--folder` too, and a file the folder holds that the draft does not carry is left. Answers what was written, and the version the folder
 * is at now.
 */
export const WORKFLOWS_WRITE: Command<WorkflowWritten & { version: string }, WorkflowWriteInput> = {
  name: 'workflows write',
  usage: '(yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]',
  help: [
    'a workflow folder of yours, or of a templated --factory, written from',
    'a draft folder, its steps, README, scripts and schemas, leaving a file',
    'it does not carry; one there already, at the --version it was read at',
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
    ],
  ),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Workflow's `create` and `replace` verb of `objects`' Api (`/api/namespaces/:namespace/workflows`), which calls this entry's handler: no route of its own",
  },
  input: WorkflowWriteInput,
  handler: ({ draft: steps, readme, files, version, ...where }) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.gen(function* () {
        const dir = yield* tried(() => yoursWorkflowDir('nemia workflows write', where, home));
        const { places, fills } = yield* tried(() => writeJudgedOf(where, home));
        const carried: CarriedFile[] | undefined = files && files.map((f) => ({ ...f }));
        const door = yield* WorkflowDoor;
        return yield* door.workflows.write(
          dir,
          { steps, ...(readme !== undefined && { readme }), ...(carried !== undefined && { files: carried }) },
          version,
          places,
          fills,
        );
      }),
    ),
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
const usersOf = Effect.fn('usersOf')(function* (dir: string) {
  const name = path.basename(dir);
  const runs = runsAtOnce.runs
    .list(() => {})
    .filter((run) => run.workflow === undefined && path.resolve(run.workflowDir) === dir)
    .map((run) => stillNeeded.run(run.id, dir));
  const cards = (yield* readInbox())
    .filter((card) => card.queued?.place != null && card.workflow !== null && path.resolve(inboxDir(), card.workflow) === dir)
    .map((card) => stillNeeded.card(card.name, dir));
  const factories = (yield* (yield* FactoryDoor).factories.listed()).flatMap((factory) => {
    if ('error' in factory || !factory.workflows.includes(name)) return [];
    if (factory.repos.some((repo) => isDirectory(path.join(repo, 'workflows', name)))) return [];
    const hires = Object.keys(factory.hires).filter((step) => step.startsWith(`${name}/`));
    return [stillNeeded.factory(factory.name, name, hires.sort())];
  });
  return [...runs, ...cards, ...factories];
});

/**
 * A folder of yours, `<home>/workflows/<name>`, removed whole through the Workflow door, checked first against the version it was read at
 * (`workflowVersionRefusal`). Refused, with nothing removed, while a run, a queued card or a factory still needs it (`usersOf`), each
 * named with the command that frees it.
 */
export const WORKFLOWS_REMOVE: Command<WorkflowRemoved, WorkflowRemoveInput> = {
  name: 'workflows rm',
  usage: 'yours <name> --version <v>',
  help: ['a workflow folder of yours removed, at the --version it was read at'],
  spec: writerSpec(
    'workflows rm',
    'yours <name> --version <v>',
    [FROM, { key: 'name', takes: 'required', kind: 'name' }],
    [versionFlag('workflows rm', 'the folder')],
  ),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Workflow's `delete` verb of `objects`' Api (`/api/namespaces/:namespace/workflows`), which calls this entry's handler: no route of its own",
  },
  input: WorkflowRemoveInput,
  handler: ({ version, ...where }) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.gen(function* () {
        const dir = yield* tried(() => yoursWorkflowDir('nemia workflows rm', where, home));
        const users = yield* usersOf(dir);
        const { places } = yield* tried(() => writeJudgedOf(where, home));
        const door = yield* WorkflowDoor;
        return yield* door.workflows.remove(dir, version, users, places);
      }),
    ),
  print: ({ dir, removed }) => [`removed ${dir}: ${removed.join(', ')}`],
};

/** Why a folder does not load, in the loader's words: what it was refused or died of. */
const unloaded = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** A folder loaded (`steps`), or why it does not load (`error`, the loader's words). */
export type FolderLoaded = { steps: Workflow[] } | { error: string };

/**
 * Each folder of `dirs`, loaded as a start in `places` would load it, in `factory` with its hires and its rules where one is given
 * (`factoryFills`), by folder (`FolderLoaded`). The factory is given whole, not named, so one the store does not hold loads alike: a
 * template's render, read as a factory applied from it is.
 */
export const foldersLoaded = Effect.fn('foldersLoaded')(function* (
  dirs: readonly string[],
  places: Places,
  factory?: Pick<Factory, 'name' | 'hires' | 'tree'>,
) {
  const door = yield* WorkflowDoor;
  const loads: Array<[string, FolderLoaded]> = [];
  for (const dir of dirs) {
    const read = Effect.flatMap(
      tried(() => workflowDirAt(path.resolve(dir))),
      (at) => door.workflows.read(at, places, factory && factoryFills(factory, path.basename(dir)).fills),
    );
    const loaded = yield* Effect.exit(read);
    loads.push([dir, Exit.isSuccess(loaded) ? { steps: loaded.value } : { error: unloaded(Cause.squash(loaded.cause)) }]);
  }
  return Object.fromEntries(loads);
});

/**
 * One step of the folder `dir`, the workflow `name`, loaded as a start would load it, in the factory named with its hires: the step, or
 * null where the folder has none of that name, and the names of the steps it has.
 */
export const WORKFLOWS_STEP: Command<{ step: Workflow | null; steps: string[] }, WorkflowStepInput> = {
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
  only: {
    side: 'api',
    why: "the board's page of a step reads it as the builder shows it, through the Workflow's `step` verb of `objects`' Api; at the command line a person reads the step's file",
  },
  input: WorkflowStepInput,
  handler: (where) =>
    Effect.flatMap(StoreRoot, (home) =>
      Effect.gen(function* () {
        const dir = yield* tried(() => workflowDirAt(path.resolve(where.dir)));
        const factory = yield* factoryOrNone(where.factory);
        const fills = yield* tried(() => factory && factoryFills(factory, where.name).fills);
        const door = yield* WorkflowDoor;
        const steps = yield* door.workflows.read(dir, placesOf(where, home), fills);
        return { step: steps.find((s) => s.name === where.step) ?? null, steps: steps.map((s) => s.name) };
      }),
    ),
  print: () => [],
};

/** The board's workflow entries, in the order the table lists them. */
export const WORKFLOW_ENTRIES: readonly Command[] = [WORKFLOWS_WRITE, WORKFLOWS_REMOVE, WORKFLOWS_STEP] as readonly Command[];
