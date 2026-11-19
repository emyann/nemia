/**
 * What a proposed object is now, in its factory: the `resourceVersion` it is served at (null where nothing is at its name) and its spec as
 * a proposal carries it, so a proposal's changes, their access and its stale check are read the one way, and an undo proposes the spec it
 * read. A factory's Workflows, Agents and Skills are its tree's (`<tree>/workflows`, and its `agents/` and `skills/`), read through the
 * Workflow, Agent and Skill doors — an Agent with the result schema its `output:` names (`agentSpecOf`), a Skill with its folder's other
 * text files (`skillSpecOf`); its Hires, McpServers and the Factory itself are read as the objects the api serves
 * (`hireObject`, `mcpServerObject`, `factoryObject`), their versions those objects'.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposableKind } from 'objects';
import { tried, type EngineService } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';
import { factoryAdds, libraryAddObject, refOf } from '../library/library.verb.ts';
import { sameAdd } from '../library/library.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { factoryWriteOf } from '../workflows/workflows.verb.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { workflowDirAt } from '../folder/folder.store.ts';
import { AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { stepDraftOf, workflowSpecOf } from './workflow-spec.ts';
import { agentSpecOf } from './agent-spec.ts';
import { skillSpecOf } from './skill-spec.ts';
import { textIn } from '../folder/folder.ts';
import { stepFilesOf } from '../folder/write.store.ts';
import { WorkflowError } from '../step/step.ts';
import type { WorkflowStep } from 'objects';
import { FactoryDoor, filedAtOnce, treeChecked } from '../factory/door/factories.store.ts';
import { FactoryName, isDefaultFactory } from '../factory/factory.model.ts';
import { factoryObject } from '../factory/object/factory.verb.ts';
import { hireObject } from '../factory/object/hire.verb.ts';
import { mcpServerObject } from '../factory/object/mcp-server.verb.ts';
import type { StoreRoot } from '../config/root.store.ts';
import type { StoreConfig } from '../config/config.store.ts';

/** Where a proposal is read and applied: the store's root, whose factories say their own repositories. */
export type ProposalPlace = { readonly home: string };

/**
 * What reading a proposal's objects needs: the engine and the place, which the served Hires and McpServers read through, and the store's
 * root and settings their handlers are given (`StoreRoot`, `StoreConfig`).
 */
export type ProposalNeeds = EngineService | PlaceService | StoreRoot | StoreConfig;

/** An object as it is now: the version it is served at, null where nothing is at its name, and its spec where something is. */
export type Current = { readonly version: string | null; readonly spec?: unknown };

/** Nothing at the name. */
const NONE: Current = { version: null };

/**
 * The folder of a factory's tree that holds `what`: its workflows, or the agents or skills beside them. Refused, `Invalid`, for a factory
 * made from no template, which has no tree a proposal writes: its definitions are its repositories' and the person's library's.
 * @param home The store's root folder.
 * @param factory The factory's name.
 * @param what Which folder of the tree: its workflows, its agents or its skills.
 */
export const treeDir = (home: string, factory: string, what: 'workflows' | 'agents' | 'skills') => {
  const filed = filedAtOnce(home, factory);
  if (filed?.tree === undefined)
    throw new Invalid({
      message:
        `nemia propose: the factory ${factory} is made from no template, so it has no tree a proposal writes: its ${what} are its ` +
        "repositories', changed there, and your library's, which the person writes (`nemia workflows write yours <name> --folder <draft>`, " +
        '`nemia agents write yours`, `nemia skills write yours`). Nothing was proposed.',
    });
  const workflows = path.join(treeChecked(factory, filed, 'nemia propose').tree, 'workflows');
  return what === 'workflows' ? workflows : path.join(workflows, what === 'agents' ? AGENTS_FOLDER : SKILLS_FOLDER);
};

/** A failure of a read that says nothing is there (`Missing`) as nothing at the name; any other refusal as it was. */
const orNone = <A, R>(read: Effect.Effect<A, Refusal, R>, current: (a: A) => Current) =>
  read.pipe(
    Effect.map(current),
    Effect.catch((err) => (err._tag === 'Missing' ? Effect.succeed(NONE) : Effect.fail(err))),
  );

/**
 * A workflow folder's spec as its files write it, the one reader of it: each step's keys and body, by file name, its README, frontmatter
 * and all — so its needs are said there and not apart, and an undo that writes this spec back writes the README byte for byte — and its
 * other text files. A file that is not text, or not directly in it, a Workflow's spec does not carry. What the api serves as a Workflow's
 * `spec`, and what a proposal's stale check and access read, so a spec read and proposed back changes nothing.
 * @param dir The workflow's folder.
 */
export function workflowSpecAt(dir: string) {
  const texts = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile())
    .flatMap((e) => {
      const text = textIn(fs.readFileSync(path.join(dir, e.name)));
      return text === null ? [] : [{ name: e.name, text }];
    });
  return workflowSpecOf(texts);
}

/**
 * The steps of the Workflow `name` of the factory's tree as its folder would read them once `steps` are written over it, in the shape
 * `currentOf` reads a folder in (`workflowSpecOf`): each step as the file its write would write (`stepFilesOf`), against the agents the
 * write finds in the places it is judged in (`factoryWriteOf`), its agent's denies and the agent its factory hires into it left to them.
 * So a Workflow sent as the api serves it, its steps resolved, reads as the folder it would leave. Undefined where a step does not render,
 * which the apply refuses in its own words.
 * @param place Where the factory's tree is.
 * @param factory The factory's name.
 * @param name The Workflow's name.
 * @param steps The steps proposed, as the Workflow object says them.
 */
export const workflowStepsWritten = (place: ProposalPlace, factory: string, name: string, steps: readonly WorkflowStep[]) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => workflowDirAt(path.join(treeDir(place.home, factory, 'workflows'), name)));
    const { places, fills } = yield* tried(() => factoryWriteOf(place.home, factory, name));
    const agents = yield* (yield* AgentDoor).agents.found({ dir, places });
    const files = renderedOrNone(() => stepFilesOf(steps.map(stepDraftOf), agents, fills));
    return files === undefined ? undefined : workflowSpecOf(files.map(([step, text]) => ({ name: `${step}.md`, text }))).steps;
  });

/** What `render` answers, or undefined where it refuses a step (`WorkflowError`); anything else it throws, thrown. */
const renderedOrNone = <A>(render: () => A) => {
  try {
    return render();
  } catch (err) {
    if (err instanceof WorkflowError) return undefined;
    throw err;
  }
};

/**
 * The Workflow `name` of the factory's tree, now: its version read in the places its write is judged in (`factoryWriteOf`), the factory's
 * repository among them, so a proposal is pinned to the version its apply writes over, a skill a step adds from that repository counted.
 */
const workflowNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => workflowDirAt(path.join(treeDir(place.home, factory, 'workflows'), name)));
    const { places } = yield* tried(() => factoryWriteOf(place.home, factory, name));
    const there = yield* (yield* WorkflowDoor).workflows.there(dir, places);
    return there.kind === 'folder' ? { version: there.version, spec: yield* tried(() => workflowSpecAt(dir)) } : NONE;
  });

/** The Agent `name` of the factory's tree, now: its spec with the result schema its `output:` names, read beside it, where it reads. */
const agentNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => treeDir(place.home, factory, 'agents'));
    const door = (yield* AgentDoor).agents;
    const there = yield* door.there(AgentName.read(name), { dir });
    if (there.kind !== 'held') return NONE;
    const a = yield* door.read(AgentName.read(name), { dir });
    const file = a.keys.output;
    const text = file === undefined ? undefined : a.read(file);
    const schema = file === undefined || text === undefined ? null : { file, text };
    return { version: there.version, spec: agentSpecOf(a, schema) };
  });

/** The Skill `name` of the factory's tree, now: its SKILL.md and its folder's other text files. */
const skillNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const at = yield* tried(() => treeDir(place.home, factory, 'skills'));
    const door = (yield* SkillDoor).skills;
    const there = yield* door.there(SkillName.read(name), at);
    if (there.kind !== 'held') return NONE;
    const page = yield* door.read(SkillName.read(name), at);
    const others = yield* door.others(SkillName.read(name), at);
    return { version: there.version, spec: skillSpecOf(name, page.text, others, page.preload) };
  });

/** `object`'s version and spec as a `Current`, from a served object. */
const servedNow = (object: { metadata: { resourceVersion: string }; spec: unknown }) => ({
  version: object.metadata.resourceVersion,
  spec: object.spec,
});

/**
 * The Factory's proposable parts now: its attached workflows, its rules and its instruction; its version the served object's, which
 * digests its rules and its instruction beside its spec and status, so an edit of any of them makes a proposal read before it stale.
 */
const factoryNow = (place: ProposalPlace, factory: string) =>
  orNone(factoryObject(place.home, factory), servedNow).pipe(
    Effect.flatMap((served) =>
      served.version === null
        ? Effect.succeed(NONE)
        : Effect.gen(function* () {
            const door = yield* FactoryDoor;
            const named = FactoryName.read(factory);
            const rules = yield* door.rules.read(named);
            const record = yield* door.factories.read(named);
            const instruction = (yield* door.instruction.read(named)).words;
            return {
              version: served.version,
              spec: {
                workflows: isDefaultFactory(record) ? [] : [...record.workflows],
                ...(rules.words !== null && { rules: rules.words }),
                ...(instruction !== null && { instruction }),
              },
            };
          }),
    ),
  );

/**
 * The object of `kind` named `name` in the factory `factory`, now: its version and spec, or nothing there. Refused as the read refuses: a
 * factory with no tree for a Workflow, an Agent or a Skill (`Invalid`), one not rendered yet (`Conflict`).
 * @param place Where the proposal is read: the store's root.
 * @param factory The factory's name.
 * @param kind The kind of the object.
 * @param name The object's name; for a Factory, the factory's own.
 */
export const currentOf = (place: ProposalPlace, factory: string, kind: ProposableKind, name: string) => {
  switch (kind) {
    case 'Workflow':
      return workflowNow(place, factory, name);
    case 'Agent':
      return agentNow(place, factory, name);
    case 'Skill':
      return skillNow(place, factory, name);
    case 'Hire':
      return orNone(hireObject(place.home, factory, name), servedNow);
    case 'McpServer':
      return orNone(mcpServerObject(place.home, factory, name), servedNow);
    case 'LibraryAdd':
      return Effect.sync(() => {
        const ref = refOf(name);
        const { adds, recorded } = factoryAdds(place.home, factory);
        return ref === undefined || !adds.some((a) => sameAdd(a, ref))
          ? NONE
          : servedNow(libraryAddObject(place.home, factory, ref, recorded));
      });
    case 'Factory':
      return name === factory
        ? factoryNow(place, factory)
        : Effect.fail(
            new Invalid({ message: `a proposal in ${factory} changes the Factory ${factory} alone, not ${name}: name it ${factory}.` }),
          );
  }
};
