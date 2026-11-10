/**
 * What a proposed object is now, in its factory: the `resourceVersion` it is served at (null where nothing is at its name) and its spec as
 * a proposal carries it, so a proposal's changes, their access and its stale check are read the one way, and an undo proposes the spec it
 * read. A factory's Workflows, Agents and Skills are its tree's (`<tree>/workflows`, and its `agents/` and `skills/`), read through the
 * Workflow, Agent and Skill doors; its Hires, McpServers and the Factory itself are read as the objects the api serves
 * (`hireObject`, `mcpServerObject`, `factoryObject`), their versions those objects'.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import type { ProposableKind } from 'objects';
import { tried, type EngineService } from '../runtime-client.ts';
import type { PlaceService } from '../place/place.store.ts';
import { Invalid, type Refusal } from '../refusal/refusal.ts';
import { WorkflowDoor } from '../workflows/workflows.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { workflowDirAt } from '../folder/folder.store.ts';
import { isReadme, splitFrontmatter, AGENTS_FOLDER, SKILLS_FOLDER } from '../step/step.ts';
import { frontmatterValues } from '../frontmatter/frontmatter.ts';
import { FactoryDoor, filedAtOnce, treeChecked } from '../factory/door/factories.store.ts';
import { FactoryName, isDefaultFactory } from '../factory/factory.model.ts';
import { factoryObject } from '../factory/object/factory.verb.ts';
import { hireObject } from '../factory/object/hire.verb.ts';
import { mcpServerObject } from '../factory/object/mcp-server.verb.ts';

/** Where a proposal is read and applied: the store's root, and the repository the api serves (the default factory's). */
export type ProposalPlace = { readonly home: string; readonly repo: string };

/** What reading a proposal's objects needs: the engine and the place, which the served Hires and McpServers read through. */
export type ProposalNeeds = EngineService | PlaceService;

/** An object as it is now: the version it is served at, null where nothing is at its name, and its spec where something is. */
export type Current = { readonly version: string | null; readonly spec?: unknown };

/** Nothing at the name. */
const NONE: Current = { version: null };

/**
 * The folder of a factory's tree that holds `what`: its workflows, or the agents or skills beside them. Refused, `Invalid`, for a factory
 * made from no template, which has no tree a proposal writes: its definitions are its repositories' and the person's library's.
 */
export const treeDir = (home: string, factory: string, what: 'workflows' | 'agents' | 'skills'): string => {
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
const orNone = <A, R>(read: Effect.Effect<A, Refusal, R>, current: (a: A) => Current): Effect.Effect<Current, Refusal, R> =>
  read.pipe(
    Effect.map(current),
    Effect.catch((err) => (err._tag === 'Missing' ? Effect.succeed(NONE) : Effect.fail(err))),
  );

/** The frontmatter of a file's text as a record, and its body. */
const fileParts = (name: string, text: string): { keys: Record<string, unknown>; body: string } => {
  const { block, body } = splitFrontmatter(name, text);
  const keys: unknown = block === null ? {} : frontmatterValues(block);
  return { keys: typeof keys === 'object' && keys !== null ? (keys as Record<string, unknown>) : {}, body };
};

/** A workflow folder's spec as its files write it: each step's keys and body, by file name, and its README. */
function workflowSpecAt(dir: string): unknown {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  const readme = files.find(isReadme);
  const steps = files
    .filter((f) => !isReadme(f))
    .sort()
    .map((f) => {
      const name = f.slice(0, -'.md'.length);
      return { name, ...fileParts(name, fs.readFileSync(path.join(dir, f), 'utf8')) };
    });
  return { ...(readme !== undefined && { readme: fs.readFileSync(path.join(dir, readme), 'utf8') }), steps };
}

/** The Workflow `name` of the factory's tree, now. */
const workflowNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => workflowDirAt(path.join(treeDir(place.home, factory, 'workflows'), name)));
    const there = yield* (yield* WorkflowDoor).workflows.there(dir);
    return there.kind === 'folder' ? { version: there.version, spec: yield* tried(() => workflowSpecAt(dir)) } : NONE;
  });

/** The Agent `name` of the factory's tree, now. */
const agentNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const dir = yield* tried(() => treeDir(place.home, factory, 'agents'));
    const door = (yield* AgentDoor).agents;
    const there = yield* door.there(AgentName.read(name), { dir });
    if (there.kind !== 'held') return NONE;
    const a = yield* door.read(AgentName.read(name), { dir });
    const spec = {
      ...(a.role !== undefined && { role: a.role }),
      ...(a.description !== undefined && { description: a.description }),
      keys: a.keys,
      ...(a.skills !== undefined && { skills: a.skills.join(', ') }),
      ...(a.harnessPrompt !== undefined && { harnessPrompt: a.harnessPrompt }),
      ...(a.mcp !== undefined && { mcp: a.mcp.join(', ') }),
      instructions: a.body,
    };
    return { version: there.version, spec };
  });

/** The Skill `name` of the factory's tree, now. */
const skillNow = (place: ProposalPlace, factory: string, name: string) =>
  Effect.gen(function* () {
    const at = yield* tried(() => treeDir(place.home, factory, 'skills'));
    const door = (yield* SkillDoor).skills;
    const there = yield* door.there(SkillName.read(name), at);
    if (there.kind !== 'held') return NONE;
    const page = yield* door.read(SkillName.read(name), at);
    const { keys, body } = fileParts(name, page.text);
    const pick = (key: string) => (keys[key] === undefined ? {} : { [key]: keys[key] });
    return {
      version: there.version,
      spec: { ...pick('title'), ...pick('description'), ...pick('tags'), ...pick('examples'), preload: page.preload, body },
    };
  });

/** `object`'s version and spec as a `Current`, from a served object. */
const servedNow = (object: { metadata: { resourceVersion: string }; spec: unknown }): Current => ({
  version: object.metadata.resourceVersion,
  spec: object.spec,
});

/**
 * The Factory's proposable parts now: its attached workflows, its rules and its instruction; its version the served object's, which
 * digests its rules and its instruction beside its spec and status, so an edit of any of them makes a proposal read before it stale.
 */
const factoryNow = (place: ProposalPlace, factory: string) =>
  orNone(factoryObject(place.home, place.repo, factory), servedNow).pipe(
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
 */
export const currentOf = (
  place: ProposalPlace,
  factory: string,
  kind: ProposableKind,
  name: string,
): Effect.Effect<Current, Refusal, ProposalNeeds> => {
  switch (kind) {
    case 'Workflow':
      return workflowNow(place, factory, name);
    case 'Agent':
      return agentNow(place, factory, name);
    case 'Skill':
      return skillNow(place, factory, name);
    case 'Hire':
      return orNone(hireObject(place.home, place.repo, factory, name), servedNow);
    case 'McpServer':
      return orNone(mcpServerObject(place.home, place.repo, factory, name), servedNow);
    case 'Factory':
      return name === factory
        ? factoryNow(place, factory)
        : Effect.fail(
            new Invalid({ message: `a proposal in ${factory} changes the Factory ${factory} alone, not ${name}: name it ${factory}.` }),
          );
  }
};
