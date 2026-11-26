/**
 * One proposed object written into its factory, through the doors and verbs that already write a factory: a Workflow through the Workflow
 * door at the factory's tree, judged as `nemia workflows write factory` judges it (`factoryWriteOf`); an Agent and a Skill through their
 * doors at the tree; a Hire and the Factory's attached workflows through `wire`, judged by `wiringRefusal`; an McpServer, the rules and the
 * instruction through the Factory door, so a Factory's spec is written through the doors alone. Answers the revision it made:
 * `<resource>/<name>#<n>`, the ledger's number, for a kind the ledger counts, else `<resource>/<name>`.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Effect } from 'effect';
import {
  RESOURCE_PLURALS,
  type AgentSpec,
  type HireSpec,
  type LibraryAddSpec,
  type McpServerSpec,
  type ProposedObject,
  type SkillSpec,
  type WorkflowSpec,
} from 'objects';
import { tried } from '../runtime-client.ts';
import { Invalid } from '../refusal/refusal.ts';
import { refOf, writeLibraryAdd } from '../library/library.verb.ts';
import { StoreRoot } from '../config/root.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { factoryWriteOf } from '../workflows/workflows.verb.ts';
import { AgentDoor, type AgentDoorShape } from '../agents/agent-door.store.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { workflowDirAt, workflowSpecReadme } from '../folder/folder.store.ts';
import { stepDraftOf } from '../propose/index.ts';
import { definitionRevision } from '../revisions/revisions.store.ts';
import type { RevisionKind } from '../revisions/revisions.ts';
import { FactoryDoor, filedFactory } from '../factory/door/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { ownAgentRefusal } from '../factory/wiring/own-agent.store.ts';
import { wire } from '../factory/wiring/wire.verb.ts';
import { withoutEntry } from '../factory/wiring/index.ts';
import { contentNow, treeDir, type ProposalPlace } from '../propose/current.verb.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import type { Entry } from '../factory/applied/applied.store.ts';
import { verbOf } from '../propose/propose.verb.ts';

/** An Agent's spec as the Agent door's draft. */
const agentDraftOf = (name: string, spec: AgentSpec) => ({
  name,
  ...(spec.role !== undefined && { role: spec.role }),
  ...(spec.description !== undefined && { description: spec.description }),
  ...(spec.skills !== undefined && { skills: spec.skills }),
  ...(spec.harnessPrompt !== undefined && { harnessPrompt: spec.harnessPrompt }),
  ...(spec.mcp !== undefined && { mcp: spec.mcp }),
  keys: spec.keys ?? {},
  body: spec.instructions ?? '',
});

/**
 * The content digest of the object `object` names as its files hold it now, which the folder writers compare their write to: the
 * proposal's own version, a revision, was judged fresh before the apply, and the writers read files.
 * @param place Where the proposal is applied.
 * @param factory The factory's name.
 * @param object The object the proposal writes.
 */
const digestNow = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.map(contentNow(place, factory, object.kind, object.metadata.name), (now) => now.version ?? undefined);

/** The revision a write of `kind`'s `name` at `version` made, the ledger's number. */
const counted = (kind: RevisionKind, object: ProposedObject, version: string) =>
  Effect.map(
    definitionRevision(kind, object.metadata.name, version),
    (n) => `${RESOURCE_PLURALS[object.kind]}/${object.metadata.name}#${n}`,
  );

/** The revision of a kind the ledger does not count. */
const uncounted = (object: ProposedObject) => `${RESOURCE_PLURALS[object.kind]}/${object.metadata.name}`;

/** The agents' folder of a factory's tree, `workflows/agents/`, as its files' paths in the tree begin. */
const TREE_AGENTS = `workflows/${AGENTS_FOLDER}/`;

/**
 * `program` with the Agent door it is given finding a workflow's agents in the tree `against` rather than in the factory's (`found`): its
 * agents' folder, each agent's file and the result schema beside it, written into a folder of its own for the program's span and
 * removed after it, where a workflow beside it would look first; the places after it as they were. The door's other methods, the version
 * a write is judged at and answers among them, still read the factory's tree. `program` as it is where no tree is given.
 */
const agentsFoundIn = <A, E, R>(against: readonly Entry[] | undefined, program: Effect.Effect<A, E, R>) =>
  against === undefined
    ? program
    : Effect.scoped(
        Effect.gen(function* () {
          const root = yield* Effect.acquireRelease(
            Effect.sync(() => fs.mkdtempSync(path.join(os.tmpdir(), 'nemia-composed-'))),
            (dir) => Effect.sync(() => fs.rmSync(dir, { recursive: true, force: true })),
          );
          const folder = path.join(root, 'workflows', AGENTS_FOLDER);
          fs.mkdirSync(folder, { recursive: true });
          for (const entry of against) {
            const file = entry.path.slice(TREE_AGENTS.length);
            if (entry.path.startsWith(TREE_AGENTS) && file.length > 0 && !file.includes('/'))
              fs.writeFileSync(path.join(folder, file), entry.bytes);
          }
          const door = yield* AgentDoor;
          const composed: AgentDoorShape = {
            ...door,
            agents: {
              ...door.agents,
              found: ({ dir, places }) => door.agents.found({ dir: path.join(root, 'workflows', path.basename(dir)), places }),
            },
          };
          return yield* Effect.provideService(program, AgentDoor, composed);
        }),
      );

/**
 * A Workflow of the factory's tree written or removed. Its README is written as the api's write writes it (`workflowSpecReadme`): its
 * `readme` as given where it opens with a frontmatter of its own, so a Workflow read as served and proposed back writes it byte for byte,
 * its instruction under the folder's frontmatter where it does not. A spec that gives `files` gives the whole set of the folder's other
 * text files, so one it leaves out is removed (`whole`); one that gives none leaves them as they are. Its steps are judged against the
 * agents of `against` where it is given (`agentsFoundIn`), the tree an upgrade composes, else against the factory's tree.
 */
const workflowWritten = (place: ProposalPlace, factory: string, object: ProposedObject, against?: readonly Entry[]) =>
  Effect.gen(function* () {
    const name = object.metadata.name;
    const holder = yield* treeDir(place.home, factory, 'workflows');
    const dir = yield* tried(() => workflowDirAt(path.join(holder, name)));
    const { places, fills } = yield* factoryWriteOf(place.home, factory, name);
    const door = (yield* WorkflowDoor).workflows;
    if (verbOf(object) === 'delete') {
      yield* door.remove(dir, yield* digestNow(place, factory, object), [], places);
      return uncounted(object);
    }
    const spec = object.spec as WorkflowSpec;
    const readme = workflowSpecReadme(dir, spec);
    const saved = yield* agentsFoundIn(
      against,
      door.write(
        dir,
        {
          steps: spec.steps.map(stepDraftOf),
          ...(readme !== undefined && { readme }),
          ...(spec.files !== undefined && { files: spec.files, whole: true }),
        },
        yield* digestNow(place, factory, object),
        places,
        fills,
      ),
    );
    return yield* counted('workflow', object, saved.version);
  });

/** An Agent of the factory's tree written or removed, the result schema its spec's `output` carries written beside it. */
const agentWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const dir = yield* treeDir(place.home, factory, 'agents');
    const name = AgentName.read(object.metadata.name);
    const door = (yield* AgentDoor).agents;
    if (verbOf(object) === 'delete') {
      yield* door.remove(name, yield* digestNow(place, factory, object), { dir, anywhere: true });
      return uncounted(object);
    }
    const spec = object.spec as AgentSpec;
    const written = yield* door.write(name, agentDraftOf(name, spec), yield* digestNow(place, factory, object), {
      dir,
      anywhere: true,
      ...(spec.output !== undefined && { schema: spec.output }),
    });
    return yield* counted('agent', object, written.version);
  });

/**
 * A Skill of the factory's tree written. A spec that gives `files` gives the whole set of the folder's other text files, so one it leaves
 * out is removed; one that gives none leaves them as they are; a file that is not text is never touched.
 */
const skillWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const at = yield* treeDir(place.home, factory, 'skills');
    const { files, ...spec } = object.spec as SkillSpec;
    const written = yield* (yield* SkillDoor).skills.write(
      SkillName.read(object.metadata.name),
      { name: object.metadata.name, ...spec, ...(files !== undefined && { files }) },
      yield* digestNow(place, factory, object),
      at,
      { anywhere: true },
    );
    return yield* counted('skill', object, written.version);
  });

/** A Hire written: the agent hired into its step, or the step's hire taken back where it names none or is removed. */
const hireWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const spec = object.spec as HireSpec | undefined;
    const [workflow = '', ...rest] = object.metadata.name.split('.');
    const step = `${spec?.workflow ?? workflow}/${spec?.step ?? rest.join('.')}`;
    if (verbOf(object) === 'delete' || spec?.agent === undefined) yield* wire(factory, { verb: 'fire', step });
    else yield* wire(factory, { verb: 'hire', step, agent: spec.agent }, (f) => ownAgentRefusal(place.home, f, step));
    return uncounted(object);
  });

/** An McpServer recorded, or taken back where it is removed. */
const serverWritten = (factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const door = (yield* FactoryDoor).servers;
    const name = FactoryName.read(factory);
    const servers = yield* door.read(name);
    const now =
      verbOf(object) === 'delete'
        ? withoutEntry(servers, object.metadata.name)
        : { ...servers, [object.metadata.name]: object.spec as McpServerSpec };
    yield* door.write(name, now);
    return uncounted(object);
  });

/** A LibraryAdd written: the library item added to the factory, or its add taken off where it is removed. */
const libraryAddWritten = (factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const home = yield* StoreRoot;
    const spec = object.spec as LibraryAddSpec | undefined;
    const ref = spec ?? refOf(object.metadata.name);
    if (ref === undefined)
      return yield* Effect.fail(
        new Invalid({ message: `${object.metadata.name} is no add: name it <kind>.<name>, its kind Agent, Skill or McpServer.` }),
      );
    yield* writeLibraryAdd(home, factory, verbOf(object) === 'delete' ? 'remove' : 'add', ref);
    return uncounted(object);
  });

/** The Factory's attached workflows, rules and instruction, each the proposal names, written through the Factory door. */
const factoryWritten = (factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const spec = object.spec as { workflows?: readonly string[]; rules?: string; instruction?: string };
    const door = yield* FactoryDoor;
    if (spec.workflows !== undefined) {
      const was = (yield* filedFactory(factory, 'attach')).workflows;
      for (const workflow of spec.workflows.filter((w) => !was.includes(w))) yield* wire(factory, { verb: 'attach', workflow });
      for (const workflow of was.filter((w) => !spec.workflows?.includes(w))) yield* wire(factory, { verb: 'detach', workflow });
    }
    if (spec.rules !== undefined) yield* door.rules.write(FactoryName.read(factory), spec.rules);
    if (spec.instruction !== undefined) yield* door.instruction.write(FactoryName.read(factory), spec.instruction);
    return uncounted(object);
  });

/**
 * `object` written into the factory `factory`: the revision it made. Refused as the door or the verb that writes it refuses. A Workflow
 * is judged against the agents of `against`, where it is given: the tree the upgrade a resolution resolves composes.
 * @param place Where the proposal is read and applied: the store's root.
 * @param factory The factory's name.
 * @param object The object the proposal names, written by its kind: a workflow, an agent, a skill, a hire, a server or the factory.
 * @param against The tree whose agents a Workflow is judged against; absent, the factory's tree.
 */
export const objectWritten = (place: ProposalPlace, factory: string, object: ProposedObject, against?: readonly Entry[]) => {
  const written = (() => {
    switch (object.kind) {
      case 'Workflow':
        return workflowWritten(place, factory, object, against);
      case 'Agent':
        return agentWritten(place, factory, object);
      case 'Skill':
        return skillWritten(place, factory, object);
      case 'Hire':
        return hireWritten(place, factory, object);
      case 'McpServer':
        return serverWritten(factory, object);
      case 'Factory':
        return factoryWritten(factory, object);
      case 'LibraryAdd':
        return libraryAddWritten(factory, object);
    }
  })();
  return Effect.provideService(written, StoreRoot, place.home);
};
