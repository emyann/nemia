/**
 * One proposed object written into its factory, through the doors and verbs that already write a factory: a Workflow through the Workflow
 * door at the factory's tree, judged as `nemia workflows write factory` judges it (`factoryWriteOf`); an Agent and a Skill through their
 * doors at the tree; a Hire and the Factory's attached workflows through `wire`, judged by `wiringRefusal`; an McpServer, the rules and the
 * instruction through the Factory door and `nemia factory instruct`'s handler. Answers the revision it made: `<resource>/<name>#<n>`, the
 * ledger's number, for a kind the ledger counts, else `<resource>/<name>`.
 */
import path from 'node:path';
import { Effect } from 'effect';
import { RESOURCE_PLURALS, type AgentSpec, type HireSpec, type McpServerSpec, type ProposedObject, type SkillSpec, type WorkflowStep } from 'objects';
import { tried } from '../runtime-client.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { StoreRoot } from '../config/root.store.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { factoryWriteOf } from '../workflows/workflows.verb.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import type { AgentDraft } from '../agents/agents.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { workflowDirAt } from '../folder/folder.store.ts';
import type { StepDraft } from '../workflow/index.ts';
import { definitionRevision } from '../revisions/revisions.store.ts';
import type { RevisionKind } from '../revisions/revisions.ts';
import { FactoryDoor } from '../factories/factories.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { readFactoryAt } from '../factory/factory.store.ts';
import { FACTORY_INSTRUCT } from '../factory/instruction.verb.ts';
import { ownAgentRefusal } from '../wiring/own-agent.store.ts';
import { wire } from '../wiring/wire.verb.ts';
import { withoutEntry } from '../wiring/wiring.ts';
import { treeDir, type ProposalNeeds, type ProposalPlace } from './current.verb.ts';
import { verbOf } from './propose.verb.ts';

/** A step as the object says it, as the Workflow door takes it: its keys, `output` as the file it names, and its body. */
export const stepDraftOf = (step: WorkflowStep): StepDraft => {
  const draft: Record<string, unknown> = { after: [] };
  for (const [key, value] of Object.entries(step.keys)) {
    if (value === null || value === undefined) continue;
    draft[key] = key === 'output' ? { file: value } : value;
  }
  return { ...draft, name: step.name, body: step.body } as StepDraft;
};

/** An Agent's spec as the Agent door's draft. */
const agentDraftOf = (name: string, spec: AgentSpec): AgentDraft => ({
  name,
  ...(spec.role !== undefined && { role: spec.role }),
  ...(spec.description !== undefined && { description: spec.description }),
  ...(spec.skills !== undefined && { skills: spec.skills }),
  ...(spec.harnessPrompt !== undefined && { harnessPrompt: spec.harnessPrompt }),
  ...(spec.mcp !== undefined && { mcp: spec.mcp }),
  keys: (spec.keys ?? {}) as AgentDraft['keys'],
  body: spec.instructions ?? '',
});

/** The revision a write of `kind`'s `name` at `version` made, the ledger's number. */
const counted = (kind: RevisionKind, object: ProposedObject, version: string) =>
  Effect.map(definitionRevision(kind, object.metadata.name, version), (n) => `${RESOURCE_PLURALS[object.kind]}/${object.metadata.name}#${n}`);

/** The revision of a kind the ledger does not count. */
const uncounted = (object: ProposedObject): string => `${RESOURCE_PLURALS[object.kind]}/${object.metadata.name}`;

/** A Workflow of the factory's tree written or removed. */
const workflowWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const name = object.metadata.name;
    const dir = yield* tried(() => workflowDirAt(path.join(treeDir(place.home, factory, 'workflows'), name)));
    const { places, fills } = yield* tried(() => factoryWriteOf(place.home, factory, name));
    const door = (yield* WorkflowDoor).workflows;
    if (verbOf(object) === 'delete') {
      yield* door.remove(dir, object.metadata.resourceVersion, [], places);
      return uncounted(object);
    }
    const spec = object.spec as { steps: readonly WorkflowStep[]; readme?: string | null };
    const saved = yield* door.write(
      dir,
      { steps: spec.steps.map(stepDraftOf), ...(typeof spec.readme === 'string' && { readme: spec.readme }) },
      object.metadata.resourceVersion,
      places,
      fills,
    );
    return yield* counted('workflow', object, saved.version);
  });

/** An Agent of the factory's tree written or removed. */
const agentWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => treeDir(place.home, factory, 'agents'));
    const name = AgentName.read(object.metadata.name);
    const door = (yield* AgentDoor).agents;
    if (verbOf(object) === 'delete') {
      yield* door.remove(name, object.metadata.resourceVersion, { dir, anywhere: true });
      return uncounted(object);
    }
    const written = yield* door.write(name, agentDraftOf(name, object.spec as AgentSpec), object.metadata.resourceVersion, {
      dir,
      anywhere: true,
    });
    return yield* counted('agent', object, written.version);
  });

/** A Skill of the factory's tree written. */
const skillWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const at = yield* tried(() => treeDir(place.home, factory, 'skills'));
    const spec = object.spec as SkillSpec;
    const written = yield* (yield* SkillDoor).skills.write(
      SkillName.read(object.metadata.name),
      { name: object.metadata.name, ...spec },
      object.metadata.resourceVersion,
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

/** The Factory's attached workflows, rules and instruction, each the proposal names, written. */
const factoryWritten = (place: ProposalPlace, factory: string, object: ProposedObject) =>
  Effect.gen(function* () {
    const spec = object.spec as { workflows?: readonly string[]; rules?: string; instruction?: string };
    if (spec.workflows !== undefined) {
      const was = (yield* tried(() => readFactoryAt(place.home, factory, 'Nothing was written.'))).workflows;
      for (const workflow of spec.workflows.filter((w) => !was.includes(w))) yield* wire(factory, { verb: 'attach', workflow });
      for (const workflow of was.filter((w) => !spec.workflows?.includes(w))) yield* wire(factory, { verb: 'detach', workflow });
    }
    if (spec.rules !== undefined) yield* (yield* FactoryDoor).rules.write(FactoryName.read(factory), spec.rules);
    if (spec.instruction !== undefined) yield* FACTORY_INSTRUCT.handler({ factory, words: spec.instruction }, {}, place.home);
    return uncounted(object);
  });

/** `object` written into the factory `factory`: the revision it made. Refused as the door or the verb that writes it refuses. */
export const objectWritten = (
  place: ProposalPlace,
  factory: string,
  object: ProposedObject,
): Effect.Effect<string, Refusal, ProposalNeeds> => {
  const written = (() => {
    switch (object.kind) {
      case 'Workflow':
        return workflowWritten(place, factory, object);
      case 'Agent':
        return agentWritten(place, factory, object);
      case 'Skill':
        return skillWritten(place, factory, object);
      case 'Hire':
        return hireWritten(place, factory, object);
      case 'McpServer':
        return serverWritten(factory, object);
      case 'Factory':
        return factoryWritten(place, factory, object);
    }
  })();
  return Effect.provideService(written, StoreRoot, place.home);
};
