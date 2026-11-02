/**
 * The Agent door's memory stand-in: a fresh layer of `AgentDoor` per call, its agents held in a map by folder and a person's custom
 * instructions by name, built by `agentDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it
 * its program — `Effect.provide(program, agentDoorMemory())` — where it needs an agent to exist and nothing of the disk; the walks of
 * `test/agent-walks.ts` hold it to what the files answer. Its paths are under `MEMORY_ROOT`, named as the files name them under the
 * store's root: your agents are in `<MEMORY_ROOT>/workflows/agents`, your custom instructions in `<MEMORY_ROOT>/custom-instructions`.
 *
 * Which place an agent is found in is decided as the files decide it, by `lookedUp` over the same roots (`lookupRoots`), never a copy. An
 * agent is held as its draft renders (`renderAgent`) and read back as its file is (`parseAgent`), with the result schema sent beside it;
 * no step names it here, and its version counts no skill: a step and a skill are the files layer's to read.
 */
import { createHash } from 'node:crypto';
import path from 'node:path';
import { Layer } from 'effect';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { AGENTS_FOLDER, WorkflowError } from '../step/step.ts';
import { customInstructionsRefusal, parseAgent, renderAgent, type Agent } from './agents.ts';
import { lookedUp } from '../skills/skills.ts';
import { lookupOf, lookupRoots, type Places } from '../skills/read.store.ts';
import { customInstructionsFile } from './read.store.ts';
import { isStoreAgent } from '../custom/custom.store.ts';
import { AgentDoor, agentDoorOver, type AgentAt, type AgentLayer } from './agent-door.store.ts';

/** Where the stand-in says an agent's folder is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** Yours, under the stand-in's root: the folder of your agents, as `<home>/workflows/agents` is on disk. */
export const MEMORY_AGENTS = path.posix.join(MEMORY_ROOT, 'workflows', AGENTS_FOLDER);

/** An agent held: its file's text, and the result schema beside it, where one was sent. */
type Held = { readonly text: string; readonly schema?: { readonly file: string; readonly text: string } };

/** The version of what is held: a digest of its file and its schema, as `agentVersion` digests an agent's files. */
const versionOf = (held: Held): string =>
  createHash('sha256')
    .update(JSON.stringify([held.text, held.schema ?? null]))
    .digest('hex')
    .slice(0, 16);

/** What a stand-in holds: each folder's agents by name, and your custom instructions by agent name. */
type Holding = { readonly folders: Map<string, Map<string, Held>>; readonly custom: Map<string, string> };

/** The agents the folder `dir` holds, by name: a new map for one that holds none. */
const folderOf = (held: Holding, dir: string): Map<string, Held> => held.folders.get(path.posix.resolve(dir)) ?? new Map<string, Held>();

/** An agent held, read back as its file is, the result schema sent beside it its one file. */
const parsed = (name: string, held: Held): Agent =>
  parseAgent(name, held.text, (file) => (held.schema?.file === file ? held.schema.text : undefined));

/** Refuse, as `Invalid`, a folder the stand-in lists no agents from: yours, or the `repo` given's, unless `anywhere`. */
function placeRefused(at: AgentAt): void {
  const dir = path.posix.resolve(at.dir);
  const repo = at.repo === undefined ? undefined : path.posix.join(path.posix.resolve(at.repo), 'workflows', AGENTS_FOLDER);
  if (path.posix.basename(dir) !== AGENTS_FOLDER || !(dir === MEMORY_AGENTS || dir === repo || at.anywhere === true))
    throw new Invalid({ message: `${dir} is not a folder of agents the stand-in lists: write to ${MEMORY_AGENTS}, or pass anywhere.` });
}

/** Every agent a workflow at `dir` may name, as `agentsFor` finds them: the first root that has a name wins (`lookedUp`). */
function foundIn(held: Holding, dir: string, places: Places): Map<string, Agent | WorkflowError> {
  const roots = lookupRoots(dir, places);
  const folders = roots.map((root) => folderOf(held, path.posix.join(root, AGENTS_FOLDER)));
  const out = new Map<string, Agent | WorkflowError>();
  for (const name of new Set(folders.flatMap((one) => [...one.keys()]))) {
    const looked = lookedUp(lookupOf(roots, (at) => folders[at]?.has(name) === true));
    if (looked.kind === 'none') continue;
    const one = folders[looked.at]?.get(name);
    if (one === undefined) continue;
    const file = (at: number) => path.posix.join(roots[at] ?? '', AGENTS_FOLDER, `${name}.md`);
    const agent: Agent | WorkflowError =
      looked.kind === 'both'
        ? new WorkflowError(
            `${name} is an agent in both ${file(looked.at)} and ${file(looked.again)}, one repository's two places for agents. Keep one.`,
          )
        : parsed(name, one);
    const words = places.home === undefined ? undefined : held.custom.get(name);
    out.set(name, words === undefined || agent instanceof Error ? agent : { ...agent, customInstructions: words });
  }
  return out;
}

/** Refuse, as `Missing`, custom instructions for an agent `name` a run on `repo` could not name, but the store's own (`isStoreAgent`). */
function refuseNoAgent(held: Holding, name: string, repo: string): void {
  if (isStoreAgent(name)) return;
  const at = path.posix.resolve(repo);
  if (foundIn(held, path.posix.join(at, 'workflows', '_'), { repo: at, home: MEMORY_ROOT }).has(name)) return;
  throw new Missing({
    message: `no agent named ${name} where a run on ${at} looks for one, nor in yours (${MEMORY_AGENTS}). Name one that is there.`,
  });
}

/** A fresh Agent door over maps: no agent held, no custom instructions. */
export function agentDoorMemory(): Layer.Layer<never> {
  const store: Holding = { folders: new Map(), custom: new Map() };
  const { folders, custom } = store;
  const folder = (dir: string) => folderOf(store, dir);
  const layer: AgentLayer = {
    agents: {
      found: ({ dir, places }) => foundIn(store, dir, places ?? {}),
      list: (holder) => [...folder(holder).keys()].sort(),
      read: (name, at) => {
        const held = folder(at.dir).get(name);
        if (held === undefined)
          throw new Missing({ message: `${at.dir}/${name}.md is not there: name an agent the folder has, or write it first.` });
        return parsed(name, held);
      },
      there: (name, at) => {
        const held = folder(at.dir).get(name);
        return held === undefined ? { kind: 'none' } : { kind: 'held', version: versionOf(held) };
      },
      write: (name, draft, _version, at) => {
        placeRefused(at);
        const dir = path.posix.resolve(at.dir);
        const agents = folder(dir);
        if (draft.name !== name && agents.has(draft.name))
          throw new Conflict({
            message: `${AGENTS_FOLDER}/${draft.name}.md is there already, and renaming ${name} to it would write over it.`,
          });
        const text = renderAgent(draft);
        const before = agents.get(name);
        const schema = at.schema === null ? undefined : (at.schema ?? before?.schema);
        const held: Held = schema === undefined ? { text } : { text, schema };
        const written = [...(at.schema != null && before?.schema?.text !== at.schema.text ? [at.schema.file] : []), `${draft.name}.md`];
        const removed = draft.name !== name && before !== undefined ? [`${name}.md`] : [];
        if (removed.length) agents.delete(name);
        agents.set(draft.name, held);
        folders.set(dir, agents);
        return { dir, agent: parsed(draft.name, held), version: versionOf(held), written, removed };
      },
      remove: (name, _version, at) => {
        placeRefused(at);
        const dir = path.posix.resolve(at.dir);
        const agents = folder(dir);
        const held = agents.get(name);
        if (held === undefined) throw new Missing({ message: `${AGENTS_FOLDER}/${name}.md is not there: it was removed already.` });
        agents.delete(name);
        folders.set(dir, agents);
        return { dir, removed: [`${name}.md`, ...(held.schema !== undefined ? [held.schema.file] : [])] };
      },
    },
    custom: {
      read: (name, repo) => {
        refuseNoAgent(store, name, repo);
        return custom.get(name);
      },
      write: (name, text, repo) => {
        refuseNoAgent(store, name, repo);
        const refused = customInstructionsRefusal(customInstructionsFile(MEMORY_ROOT, name), text);
        if (refused !== undefined) throw new Invalid({ message: refused });
        custom.set(name, text.trim());
        return customInstructionsFile(MEMORY_ROOT, name);
      },
      clear: (name, repo) => {
        refuseNoAgent(store, name, repo);
        return custom.delete(name);
      },
    },
  };
  return Layer.succeed(AgentDoor)(agentDoorOver(layer));
}
