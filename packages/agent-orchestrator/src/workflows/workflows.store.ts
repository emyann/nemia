/**
 * The Workflow door: the one way a program reads and writes a workflow — its folder of markdown, its steps and its README — an Effect
 * service, `WorkflowDoor`, whose methods take a workflow's folder as `WorkflowDir` and answer an Effect failing with a refusal. Its pattern
 * is the Factory door's (`src/door/door.store.ts`, `src/factory/door/factories.store.ts`).
 *
 * Two layers: the files (`workflowFiles`, over `folder.store.ts`, `version.store.ts` and `write.store.ts` at a store's root, so a folder is
 * the very bytes today's writer writes), and the memory stand-in (`workflowDoorMemory`, `memory.store.ts`), which a test gives its
 * program. Both are built by `workflowDoorOver`, so each write is checked the one way on both, before the layer acts: the folder as
 * `WorkflowDir.OnCreate` checks it, its name as `WorkflowName.OnCreate`, each step's as `StepName.OnCreate`, and the workflow drafted
 * through the model's `Workflow`, whose checks are its invariants — one step at least, no name twice, every `after:` naming a step of it,
 * no steps waiting on each other — or `Invalid` names the check broken and nothing is written; then the write or the removal judged
 * against the version it was read at (`workflowVersionRefusal`), refused with the kind it chooses. A holder `list` reads is a place, not
 * an entity: a plain path, refused `Invalid` where it is not absolute.
 *
 * A workflow's steps are parsed against the agents and skills found through the Agent and Skill doors (`AgentDoor`, `SkillDoor`), never
 * their stores: the door finds them, at the places its layer says (`around`), and hands them to the layer's `read` and `write`. Those of
 * `workflowDoorOver`'s `defs` where given, else those the program is given, yielded at each call; so a program given `agentDoorMemory()`
 * and a store's root reads a workflow on the files whose step names an agent the memory holds.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was
 * given none (`test/root-given.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Context, Effect, Layer, Schema } from 'effect';
import { brokenBy, doorOf, fromThrow, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { WorkflowError, type StepSpec as Step } from '../step/step.ts';
import type { StepDraft } from '../workflow/index.ts';
import type { Places } from '../skills/read.store.ts';
import { workflowVersionRefusal, type Fills, type Found, type WorkflowThere } from '../folder/folder.ts';
import { StepName, Workflow, WorkflowDir, WorkflowName } from '../folder/folder.model.ts';
import { formerKeyLines, loadWorkflowsWith, workflowDirAt, workflowsIn } from '../folder/folder.store.ts';
import { versionDigest, versionGathered, versionNamed, type VersionGathered } from '../folder/version.store.ts';
import {
  atHome,
  placesAroundAt,
  removeWorkflowAt,
  writeWorkflowAt,
  type WorkflowRemoved,
  type WorkflowWritten,
} from '../folder/write.store.ts';
import { AgentDoor, agentDoorOver, agentFiles, type AgentDoorShape } from '../agents/agent-door.store.ts';
import { SkillDoor, skillDoorOver, skillFiles, type SkillDoorShape } from '../skills/skill-door.store.ts';

/** A file a draft folder carries beside its steps and README — a script its check runs, a schema an `output:` names — by its name in it. */
export type CarriedFile = { readonly path: string; readonly text: string };

/**
 * What a workflow is written from: its steps as the builder sends them, its README where one is given, and the other files its draft
 * folder carries where given (`files`), which the command line reads off `--folder` and the builder never sends.
 */
export type WorkflowDraft = { readonly steps: readonly StepDraft[]; readonly readme?: string; readonly files?: readonly CarriedFile[] };

/** What a write answers: what was written, and the version the folder is at after it, which the door reads once the layer wrote. */
export type WorkflowSaved = WorkflowWritten & { readonly version: string };

/**
 * A layer of the Workflow door, as plain synchronous methods: the workflows a holder folder holds, by name; where a write of a folder finds
 * its agents and skills (`around`): `places`, or where the layer says a run of it would look; a workflow's steps, loaded as a start loads
 * them, against the agents and skills the door `found` and its hires `fills`; what is at a folder now and its version (`WorkflowThere`),
 * its version counting what the door `gathered` of the agents and skills its files name (`named`); a workflow written from a draft against
 * those `found` and its hires `fills`, and removed whole (`users` the sentences of what still needs it); and the lines naming each former
 * spelling its files still hold, with the fix (`formerKeyLines`).
 */
export type WorkflowLayer = {
  readonly workflows: {
    readonly list: (holder: string) => readonly string[];
    readonly around: (dir: string, places?: Places) => Places;
    readonly read: (dir: string, found: Found, fills?: Fills) => Step[];
    readonly named: (dir: string) => { readonly agents: readonly string[]; readonly added: readonly string[] };
    readonly there: (dir: string, gathered: VersionGathered) => WorkflowThere;
    readonly write: (dir: string, draft: WorkflowDraft, found: Found, places?: Places, fills?: Fills) => WorkflowWritten;
    readonly remove: (dir: string, users: readonly string[]) => WorkflowRemoved;
    readonly hints: (dir: string) => readonly string[];
  };
};

type Methods = DoorOf<WorkflowLayer, WorkflowDir>['workflows'];

/**
 * The Workflow door's shape: each method of `WorkflowLayer` answering an Effect, a workflow's folder taken as `WorkflowDir`; but `list`,
 * which takes a holder's plain path, a read, whose agents and skills are found in `places`, and a write and a removal, each given the
 * version the folder was read at (none for a new one), a write judged with the hires `fills` of the factory it is written for, as a read
 * is, and `there`, whose version counts the agents and skills found through the doors in `places`. The layer's `around` and `named` are
 * the door's own to ask.
 */
export type WorkflowDoorShape = {
  readonly workflows: Omit<Methods, 'list' | 'around' | 'named' | 'read' | 'there' | 'write' | 'remove'> & {
    readonly list: (holder: string) => Effect.Effect<readonly string[], Refusal>;
    readonly there: (dir: WorkflowDir, places?: Places) => Effect.Effect<WorkflowThere, Refusal>;
    readonly read: (dir: WorkflowDir, places?: Places, fills?: Fills) => Effect.Effect<Step[], Refusal>;
    readonly write: (
      dir: WorkflowDir,
      draft: WorkflowDraft,
      version?: string,
      places?: Places,
      fills?: Fills,
    ) => Effect.Effect<WorkflowSaved, Refusal>;
    readonly remove: (
      dir: WorkflowDir,
      version: string | undefined,
      users: readonly string[],
      places?: Places,
    ) => Effect.Effect<WorkflowRemoved, Refusal>;
  };
};

/**
 * `value` as given, or `Invalid` — the writer's `WorkflowError` — in the words of the check of `schema` it breaks, as they are: each is
 * the writer's own sentence (`stepNameRefusal`, `afterRefusal`, …), which names the step it is about, and the api answers a
 * `WorkflowError` naming the steps of its words.
 */
const inWritersWords =
  <S extends Schema.Top>(schema: S) =>
  <A>(value: A): Effect.Effect<A, Invalid> => {
    const broken = brokenBy(schema, value);
    return broken === null ? Effect.succeed(value) : Effect.fail(new WorkflowError(broken));
  };

/** A folder a method is given, as `WorkflowDir.OnCreate` checks it. */
const dirChecked = inWritersWords(WorkflowDir.OnCreate);

/** A workflow's name, its folder's, as `WorkflowName.OnCreate` checks it. */
const nameChecked = inWritersWords(WorkflowName.OnCreate);

/** A step's name, as `StepName.OnCreate` checks it. */
const stepChecked = inWritersWords(StepName.OnCreate);

/**
 * Why a draft may not carry the file named `name`, or undefined where it may: a name in the folder, never a path, and no markdown, which
 * the folder reads as a step or its README. Pure, and asked by the door before either layer, so both refuse the same names.
 */
export function carriedNameRefusal(name: string): string | undefined {
  if (name === '' || name === '.' || name === '..' || name.includes('/') || name.includes('\\'))
    return `${JSON.stringify(name)} is not a file's name in the workflow's folder: a draft carries the files directly in it. Move the file up into the draft folder, or leave it out.`;
  if (name.toLowerCase().endsWith('.md'))
    return `${name} is markdown, which a workflow's folder reads as a step or its README: write a step as a step of the draft, its README as the README, and carry no other .md.`;
  return undefined;
}

/** A draft's carried files, each name as `carriedNameRefusal` judges it, refused `Invalid` in its words; no name twice. */
const carriedChecked = (files: readonly CarriedFile[] = []): Effect.Effect<void, Invalid> => {
  for (const [i, file] of files.entries()) {
    const why =
      carriedNameRefusal(file.path) ??
      (files.findIndex((other) => other.path === file.path) !== i
        ? `${file.path} is carried twice: give the draft one file of that name.`
        : undefined);
    if (why) return Effect.fail(new Invalid({ message: why }));
  }
  return Effect.void;
};

/** The model's `Workflow`, refused `Invalid` in the words of the invariant it breaks. */
const workflowChecked = inWritersWords(Workflow);

/**
 * The workflow at `dir` as the model holds it, from a draft: its name, its folder's, and each step's name and the keys that shape its
 * graph. Pure, and the one way both layers see a draft, so a draft one refuses the other refuses.
 */
export const draftedWorkflow = (dir: string, draft: WorkflowDraft) => ({
  dir,
  name: path.basename(dir),
  steps: draft.steps.map((step) => ({
    name: step?.name,
    after: step?.after ?? [],
    ...(step?.loop != null && { loop: step.loop }),
    ...(step?.gate != null && { gate: step.gate }),
    ...(step?.check != null && { check: step.check }),
  })),
  ...(draft.readme !== undefined && { readme: draft.readme }),
});

/** The refusal `workflowVersionRefusal` chose, as the refusal of its kind. */
const refusalOf = (refused: { kind: 'Invalid' | 'Conflict' | 'Missing'; message: string }): Refusal =>
  refused.kind === 'Missing'
    ? new Missing({ message: refused.message })
    : refused.kind === 'Conflict'
      ? new Conflict({ message: refused.message })
      : new Invalid({ message: refused.message });

/** The Agent and Skill doors a Workflow door finds a workflow's agents and skills through. */
export type WorkflowDefs = { readonly agents: AgentDoorShape; readonly skills: SkillDoorShape };

/**
 * The door over `layer`: each method as `doorOf` makes it, each folder and each write checked before the layer acts, and a read and a
 * write given the agents and skills found through `defs`, or, given none, through the `AgentDoor` and `SkillDoor` the program is given,
 * yielded at the call.
 */
export function workflowDoorOver(layer: WorkflowLayer, defs?: WorkflowDefs): WorkflowDoorShape {
  const door = doorOf<WorkflowLayer, WorkflowDir>(layer).workflows;
  const foundIn = (dir: WorkflowDir, places: Places): Effect.Effect<Found, Refusal> =>
    Effect.gen(function* () {
      const agents = defs?.agents ?? (yield* AgentDoor);
      const skills = defs?.skills ?? (yield* SkillDoor);
      return { agents: yield* agents.agents.found({ dir, places }), skills: yield* skills.skills.found({ dir, places }) };
    });
  const thereOf = (dir: WorkflowDir, places?: Places): Effect.Effect<WorkflowThere, Refusal> =>
    Effect.gen(function* () {
      const named = yield* door.named(dir);
      const gathered = yield* versionGathered(dir, yield* door.around(dir, places), named, defs);
      return yield* door.there(dir, gathered);
    });
  const judged = (dir: WorkflowDir, does: 'write' | 'remove', version: string | undefined, places?: Places) =>
    Effect.flatMap(thereOf(dir, places), (there) => {
      const refused = workflowVersionRefusal(dir, does, there, version);
      return refused === null ? Effect.void : Effect.fail(refusalOf(refused));
    });
  return {
    workflows: {
      list: (holder) =>
        path.isAbsolute(holder)
          ? door.list(holder as WorkflowDir)
          : Effect.fail(new Invalid({ message: `${holder} is not absolute: name the folder that holds the workflows by its whole path.` })),
      read: (dir, places, fills) =>
        Effect.gen(function* () {
          yield* dirChecked(dir);
          return yield* door.read(dir, yield* foundIn(dir, places ?? {}), fills);
        }),
      there: (dir, places) => Effect.andThen(dirChecked(dir), thereOf(dir, places)),
      hints: (dir) => Effect.andThen(dirChecked(dir), door.hints(dir)),
      write: (dir, draft, version, places, fills) =>
        Effect.gen(function* () {
          yield* dirChecked(dir);
          yield* nameChecked(path.basename(dir));
          for (const step of draft.steps) yield* stepChecked(step?.name);
          yield* workflowChecked(draftedWorkflow(dir, draft));
          yield* carriedChecked(draft.files);
          yield* judged(dir, 'write', version, places);
          const found = yield* foundIn(dir, yield* door.around(dir, places));
          const written = yield* door.write(dir, draft, found, places, fills);
          const after = yield* thereOf(WorkflowDir.read(written.dir), places);
          if (after.kind !== 'folder')
            return yield* Effect.fail(
              new Invalid({ message: `${written.dir} is not a folder after it was written: look at what is there, and write it again.` }),
            );
          return { ...written, version: after.version };
        }),
      remove: (dir, version, users, places) =>
        Effect.gen(function* () {
          yield* dirChecked(dir);
          yield* judged(dir, 'remove', version, places);
          return yield* door.remove(dir, users);
        }),
    },
  };
}

/**
 * The files of the store `home`, as a layer of the door: today's folders, read and written by the folder's own functions. A folder's
 * agents and skills are read in the places given, else, for a write and a version, where a run of it would look (`placesAroundAt`); a
 * read given none looks beside the folder alone.
 */
export function workflowFiles(home: string): WorkflowLayer {
  const around = (dir: string, places?: Places): Places => places ?? placesAroundAt(home, dir);
  return {
    workflows: {
      list: (holder) => workflowsIn(holder),
      around,
      read: (dir, found, fills) => loadWorkflowsWith(dir, found, fills),
      named: (dir) => versionNamed(dir),
      there: (dir, gathered) => {
        const stat = fs.lstatSync(dir, { throwIfNoEntry: false });
        if (stat === undefined) return { kind: 'none' };
        return stat.isDirectory() ? { kind: 'folder', version: versionDigest(versionNamed(dir).files, gathered) } : { kind: 'file' };
      },
      write: (dir, draft, found, places, fills) =>
        writeWorkflowAt(home, dir, draft.steps, draft.readme, {
          found,
          ...(fills !== undefined && { fills }),
          ...(places !== undefined && { places }),
          ...(draft.files !== undefined && { files: draft.files }),
        }),
      remove: (dir, users) => removeWorkflowAt(home, dir, users),
      hints: (dir) => formerKeyLines(dir),
    },
  };
}

/**
 * The Workflow door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — so a handler that yields it is run where its program is
 * composed with `StoreRoot` (`storeConfigLayer`, `src/config/root.store.ts`), and a test gives `workflowDoorMemory()` with no root at
 * all.
 */
export const WorkflowDoor = Context.Reference<WorkflowDoorShape>('agent-orchestrator/WorkflowDoor', {
  defaultValue: () => rootedDoor((root) => workflowDoorOver(workflowFiles(root)), 'Workflow door'),
});

/**
 * The Workflow door over the files of the store `root`, as a layer: for a program that names its root by the door, which finds a
 * workflow's agents and skills through the Agent and Skill doors over the same files.
 */
export const workflowDoorFiles = (root: string): Layer.Layer<never> =>
  Layer.succeed(WorkflowDoor)(
    workflowDoorOver(workflowFiles(root), { agents: agentDoorOver(agentFiles(root)), skills: skillDoorOver(skillFiles(root)) }),
  );

/**
 * The agents and skills a workflow at `dir` finds beside it or in `places`, read off the files of the Agent and Skill doors (`agentFiles`,
 * `skillFiles`): what a synchronous reader parses a folder against. Their `found` reads `places`, never the root the layer is given.
 */
const foundOnDisk = (home: string, dir: string, places: Places): Found => {
  const where = { dir, places };
  return { agents: agentFiles(home).agents.found(where), skills: skillFiles(home).skills.found(where) };
};

/**
 * Read a folder of steps as a start reads one, synchronously: the door's files layer (`workflowFiles`) over the store `places.home`,
 * against the agents and skills the Agent and Skill doors' files find beside the folder or in `places`, and its hires `fills`. Refused
 * as the folder's own read refuses it, a `WorkflowError` naming what to write, with no check of the folder as the door's id before it: a
 * plain path is read as it is. No file of `src` calls it but this one; the root exports it, and the tests read a folder by it.
 */
export function loadWorkflows(dir: string, places: Places = {}, fills?: Fills): Step[] {
  const home = places.home ?? '';
  return workflowFiles(home).workflows.read(dir, foundOnDisk(home, dir, places), fills);
}

/**
 * `writeWorkflowAt` with the agents and skills the doors' files find where a run of the folder would look (`placesAroundAt`), or in
 * `places`: what a caller with no Agent and Skill doors writes with, which no file of `src` is.
 */
const writeWorkflowOnDisk = (
  home: string,
  dir: string,
  steps: readonly StepDraft[],
  readme?: string,
  { anywhere, places }: { anywhere?: boolean; places?: Places } = {},
): WorkflowWritten =>
  writeWorkflowAt(home, dir, steps, readme, {
    ...(anywhere !== undefined && { anywhere }),
    ...(places !== undefined && { places }),
    found: foundOnDisk(home, path.resolve(dir), places ?? placesAroundAt(home, dir)),
  });

/** `writeWorkflowOnDisk` the module's root (`atHome`). */
export const writeWorkflow = atHome(writeWorkflowOnDisk);

/**
 * The steps of the draft folder `folder`, a plain path, read through the Workflow door the program is given with its agents and skills
 * found in `places`, filled with the hires `fills` where it is written for a factory: what `nemia workflows write` sends the builder.
 * Refused where the folder is no workflow's (`workflowDirAt`) or does not load; anything else dies.
 */
export const draftSteps = Effect.fn('draftSteps')(function* (folder: string, places: Places, fills?: Fills) {
  const dir = yield* fromThrow(() => workflowDirAt(path.resolve(folder)));
  return yield* (yield* WorkflowDoor).workflows.read(dir, places, fills);
});
