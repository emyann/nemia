/**
 * The Agent door: the one way a program reads and writes an agent — its file in a folder of agents, the result schema beside it — and a
 * person's custom instructions for one, an Effect service, `AgentDoor`, whose methods take an agent's name as `AgentName` and answer an
 * Effect failing with a refusal. Its pattern is the Workflow door's (`src/door/door.store.ts`, `src/workflows/workflows.store.ts`).
 *
 * Two layers: the files (`agentFiles`, over `read.store.ts`, `agents.store.ts` and `custom.store.ts` at a store's root, so an agent is
 * the very bytes today's writer writes), and the memory stand-in (`agentDoorMemory`, `agent-memory.store.ts`), which a test gives its
 * program. Both are built by `agentDoorOver`, so each write is checked the one way on both, before the layer acts: the name changed and
 * the name written as `AgentName.OnCreate` checks them, the agent the draft renders to (`renderAgent`, `parseAgent`) as the model's
 * `Agent` (its `output:` the layer's to read, as a file beside it), a rename given the version it was read at, and then the write or
 * the removal judged at the name it changes against the version it was read at (`definitionVersionRefusal`), refused with the kind it
 * chooses. Custom instructions written are words, never blank. What stays each layer's own: a frontmatter block in custom
 * instructions (`customInstructionsRefusal`, naming the layer's file), the place, a link, a sidecar, a step that still names the agent, a
 * rename onto an agent there, and a name no place has for custom instructions.
 *
 * The door's default is rooted (`rootedDoor`): the files at the store's root the program is given (`StoreRoot`), refused where it was
 * given none (`test/root-given.test.ts`).
 */
import path from 'node:path';
import { Context, Effect, Layer } from 'effect';
import { checked, doorOf, fromThrow, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict, Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import { Agent as AgentRecord, AgentName } from './agents.model.ts';
import {
  definitionVersionRefusal,
  parseAgent,
  renderAgent,
  type Agent,
  type AgentDraft,
  type Agents,
  type DefinitionThere,
} from './agents.ts';
import type { VersionRefused } from '../folder/folder.ts';
import { agentsFor, agentVersion, loadAgents } from './read.store.ts';
import { removeAgent, writeAgent, type AgentSidecar, type AgentWritten } from './agents.store.ts';
import { clearCustomInstructions, customInstructionsFor, writeCustomInstructions } from './custom.store.ts';
import { skillsFor, type Places } from '../skills/read.store.ts';

/**
 * Where an agent is: its folder of agents (`<workflows>/agents`), the repository whose skills its version counts, as the board lists it
 * (`repo`), and whether the folder is written though it is none of the places the board lists agents from (`anywhere`).
 */
export type AgentAt = { readonly dir: string; readonly repo?: string; readonly anywhere?: boolean };

/** Where an agent is written, and the result schema its `output:` names, written beside it (`AgentSidecar`), where one is sent. */
export type AgentWriteAt = AgentAt & { readonly schema?: AgentSidecar | null };

/** What a removal answers: the folder, and each file removed. */
export type AgentRemoved = { dir: string; removed: string[] };

/**
 * A layer of the Agent door, as plain synchronous methods. `agents`: every agent a workflow's steps may name, found where a run of it
 * looks (`agentsFor`); the names a folder of agents holds; one agent read; what is at a name now and its version (`DefinitionThere`);
 * an agent written from a draft — renamed, where the draft's name is not the one it changes — at the version it was read at; and one
 * removed. `custom`: a person's custom instructions for the agent of a name a run on `repo` could name, read, written and cleared.
 */
export type AgentLayer = {
  readonly agents: {
    readonly found: (where: { readonly dir: string; readonly places?: Places }) => Agents;
    readonly list: (holder: string) => readonly string[];
    readonly read: (name: string, at: AgentAt) => Agent;
    readonly there: (name: string, at: AgentAt) => DefinitionThere;
    readonly write: (name: string, draft: AgentDraft, version: string | undefined, at: AgentWriteAt) => AgentWritten;
    readonly remove: (name: string, version: string | undefined, at: AgentAt) => AgentRemoved;
  };
  readonly custom: {
    readonly read: (name: string, repo: string) => string | undefined;
    readonly write: (name: string, text: string, repo: string) => string;
    readonly clear: (name: string, repo: string) => boolean;
  };
};

type Doored = DoorOf<AgentLayer, AgentName>;

/**
 * The Agent door's shape: each method of `AgentLayer` answering an Effect, an agent's name taken as `AgentName`; but `list`, whose
 * holder is a plain path.
 */
export type AgentDoorShape = {
  readonly agents: Omit<Doored['agents'], 'list'> & {
    readonly list: (holder: string) => Effect.Effect<readonly string[], Refusal>;
  };
  readonly custom: Doored['custom'];
};

/** A name the door is given, as `AgentName.OnCreate` checks it. */
const nameChecked = checked(AgentName.OnCreate, (name: unknown) => `the agent ${JSON.stringify(name)}`);

/** The agent a draft renders to, as the model's `Agent` checks it. */
const agentChecked = checked(AgentRecord, (agent: { name: string }) => `${AGENTS_FOLDER}/${agent.name}.md`);

/**
 * A draft as the door parses it, its `output:` line left out: the result schema it names is a file beside the agent, which the layer
 * reads — the one sent, or the one its folder holds — and judges as it writes; the model's `Agent` holds no output.
 */
const unread = (draft: AgentDraft): AgentDraft => ({ ...draft, keys: { ...draft.keys, output: null } });

/** The refusal `definitionVersionRefusal` chose, as the refusal of its kind. */
const refusalOf = (refused: VersionRefused): Refusal =>
  refused.kind === 'Missing'
    ? new Missing({ message: refused.message })
    : refused.kind === 'Conflict'
      ? new Conflict({ message: refused.message })
      : new Invalid({ message: refused.message });

/** The door over `layer`: each method as `doorOf` makes it, each name and each write checked before the layer acts. */
export function agentDoorOver(layer: AgentLayer): AgentDoorShape {
  const door = doorOf<AgentLayer, AgentName>(layer);
  const judged = (name: AgentName, does: 'write' | 'remove', version: string | undefined, at: AgentAt) =>
    Effect.flatMap(door.agents.there(name, at), (there) => {
      const refused = definitionVersionRefusal('agent', name, does, there, version);
      return refused === null ? Effect.void : Effect.fail(refusalOf(refused));
    });
  return {
    agents: {
      found: (where) => door.agents.found(where),
      list: (holder) =>
        path.isAbsolute(holder)
          ? door.agents.list(holder as AgentName)
          : Effect.fail(new Invalid({ message: `${holder} is not absolute: name the folder of agents by its whole path.` })),
      read: (name, at) => Effect.andThen(nameChecked(name), door.agents.read(name, at)),
      there: (name, at) => Effect.andThen(nameChecked(name), door.agents.there(name, at)),
      write: (name, draft, version, at) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* nameChecked(draft?.name);
          if (draft.name !== name && version === undefined)
            return yield* Effect.fail(
              new Invalid({
                message: `a new agent is not renamed from another: to rename ${AGENTS_FOLDER}/${name}.md to ${draft.name}, give the version it was read at.`,
              }),
            );
          yield* agentChecked(yield* fromThrow(() => parseAgent(draft.name, renderAgent(unread(draft)))));
          yield* judged(name, 'write', version, at);
          return yield* door.agents.write(name, draft, version, at);
        }),
      remove: (name, version, at) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          yield* judged(name, 'remove', version, at);
          return yield* door.agents.remove(name, version, at);
        }),
    },
    custom: {
      read: (name, repo) => door.custom.read(name, repo),
      clear: (name, repo) => door.custom.clear(name, repo),
      write: (name, text, repo) =>
        Effect.gen(function* () {
          yield* nameChecked(name);
          if (!String(text ?? '').trim())
            return yield* Effect.fail(
              new Invalid({
                message: `the custom instructions for ${name} are blank. Write the words the agent is to be told, or remove them: nemia agents custom ${name} --clear.`,
              }),
            );
          return yield* door.custom.write(name, text, repo);
        }),
    },
  };
}

/**
 * The files of the store `home`, as a layer of the door: today's agents and custom instructions, read and written by the agents' own
 * functions. A version counts the skills a start on `repo` finds, where `repo` is given, as `writeAgent` reads it.
 */
export function agentFiles(home: string): AgentLayer {
  const skillsAt = (at: AgentAt) =>
    at.repo === undefined
      ? undefined
      : skillsFor(path.join(path.dirname(path.resolve(at.dir)), '_'), { repo: path.resolve(at.repo), home });
  const placed = (at: AgentAt) => ({
    ...(at.anywhere !== undefined && { anywhere: at.anywhere }),
    ...(at.repo !== undefined && { repo: at.repo }),
  });
  return {
    agents: {
      found: ({ dir, places }) => agentsFor(dir, places ?? {}),
      list: (holder) => [...loadAgents(holder).keys()].sort(),
      read: (name, at) => {
        const agent = loadAgents(at.dir).get(name);
        if (agent === undefined)
          throw new Missing({
            message: `${path.join(at.dir, `${name}.md`)} is not there: name an agent the folder has, or write it first.`,
          });
        if (agent instanceof Error) throw agent;
        return agent;
      },
      there: (name, at) => {
        const version = agentVersion(at.dir, name, skillsAt(at));
        return version === null ? { kind: 'none' } : { kind: 'held', version };
      },
      write: (name, draft, version, at) =>
        writeAgent(home, at.dir, draft, {
          version: version ?? null,
          ...(version !== undefined || draft.name !== name ? { from: name } : {}),
          ...(at.schema !== undefined && { schema: at.schema }),
          ...placed(at),
        }),
      remove: (name, version, at) => removeAgent(home, at.dir, name, { version: version ?? null, ...placed(at) }),
    },
    custom: {
      read: (name, repo) => customInstructionsFor(home, name, repo),
      write: (name, text, repo) => writeCustomInstructions(home, name, text, repo),
      clear: (name, repo) => clearCustomInstructions(home, name, repo),
    },
  };
}

/**
 * The Agent door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — so a handler that yields it is run through
 * `rooted(home, verb, program)` (`src/wiring/wire.verb.ts`), and a test gives `agentDoorMemory()` with no root at all.
 */
export const AgentDoor = Context.Reference<AgentDoorShape>('agent-orchestrator/AgentDoor', {
  defaultValue: () => rootedDoor((root) => agentDoorOver(agentFiles(root)), 'Agent door'),
});

/** The Agent door over the files of the store `root`, as a layer: for a program that names its root by the door. */
export const agentDoorFiles = (root: string): Layer.Layer<never> => Layer.succeed(AgentDoor)(agentDoorOver(agentFiles(root)));
