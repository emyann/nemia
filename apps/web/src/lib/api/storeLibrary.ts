import { queryOptions } from '@tanstack/react-query';
import type { Agent, AgentSource, LibraryAdd, McpServer, Skill, Workflow } from 'objects';
import { library, libraryAdds } from './objects.ts';

/** The kinds the store's library holds, in the order its page draws them. */
export const LIBRARY_KINDS = ['Skill', 'Agent', 'McpServer', 'Workflow'] as const;

/** One kind of `LIBRARY_KINDS`. */
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * One item of the store's library, as its page draws it: its kind and name, what it says it is for (`null` where it says nothing, and
 * for an MCP server, which says nothing), whose it is (the user library's or Nemia's builtin), the factories that use it, and whether the
 * builtin it was copied from has changed since.
 */
export type LibraryItem = {
  kind: LibraryKind;
  name: string;
  description: string | null;
  origin: 'user' | 'builtin';
  factories: readonly string[];
  builtinChanged: boolean;
};

/** The parts of a definition's status the library's page reads: its description on its spec, or a Workflow's on its status. */
type Held = {
  metadata: { name: string };
  spec?: { description?: string | null };
  status: { origin: string; factories?: readonly string[]; builtinChanged?: boolean; description?: string | null };
};

/** `one` of `kind` as a library item, the builtin's origin kept and every other said the user library's. */
const itemOf = (kind: LibraryKind) => (one: Held) =>
  ({
    kind,
    name: one.metadata.name,
    description: one.spec?.description ?? one.status.description ?? null,
    origin: one.status.origin === 'builtin' ? 'builtin' : 'user',
    factories: one.status.factories ?? [],
    builtinChanged: one.status.builtinChanged === true,
  }) satisfies LibraryItem;

/** A library server as a library item: its origin and factories read off its status, the user library's where none is said. */
const serverItem = (one: McpServer) =>
  itemOf('McpServer')({
    metadata: one.metadata,
    status: { origin: one.status?.origin ?? 'user', factories: one.status?.factories },
  }) satisfies LibraryItem;

/**
 * Every item of the store's library, the four kinds read together, each kind in its order and each item by name (`LIBRARY_KINDS`).
 *
 * @param skills the library's skills
 * @param agents the library's agents
 * @param servers the library's MCP servers
 * @param workflows the library's workflows
 */
export function libraryItemsOf(
  skills: readonly Skill[],
  agents: readonly Agent[],
  servers: readonly McpServer[],
  workflows: readonly Workflow[],
) {
  const byName = (a: LibraryItem, b: LibraryItem) => a.name.localeCompare(b.name);
  return [
    ...skills.map(itemOf('Skill')).sort(byName),
    ...agents.map(itemOf('Agent')).sort(byName),
    ...servers.map(serverItem).sort(byName),
    ...workflows.map((one) => itemOf('Workflow')({ metadata: one.metadata, status: one.status })).sort(byName),
  ] satisfies LibraryItem[];
}

/** The store's library, every kind, read once for the Library page. */
export const libraryQuery = () =>
  queryOptions({
    queryKey: ['library'],
    queryFn: async () => {
      const [skills, agents, servers, workflows] = await Promise.all([
        library.skills(),
        library.agents(),
        library.mcpServers(),
        library.workflows(),
      ]);
      return libraryItemsOf(skills, agents, servers.items, workflows) satisfies LibraryItem[];
    },
  });

/** Each kind's word for one item and for several, as a count says it. */
const COUNT_WORDS: Record<LibraryKind, readonly [string, string]> = {
  Skill: ['skill', 'skills'],
  Agent: ['agent', 'agents'],
  McpServer: ['MCP server', 'MCP servers'],
  Workflow: ['workflow', 'workflows'],
};

/**
 * The library's items counted in words, each kind it holds in its order (`2 skills, 1 agent`), `nothing yet` for none.
 *
 * @param items the library's items
 */
export function libraryCount(items: readonly LibraryItem[]) {
  const said = LIBRARY_KINDS.flatMap((kind) => {
    const n = items.filter((one) => one.kind === kind).length;
    return n === 0 ? [] : [`${n} ${COUNT_WORDS[kind][n === 1 ? 0 : 1]}`];
  });
  return said.length === 0 ? 'nothing yet' : said.join(', ');
}

/** An agent file a harness keeps for its user, offered to import: its name, its file, what it is for, and whether it reads. */
export type Importable = { name: string; file: string; description: string | null; error: string | null; held: boolean };

/**
 * The agent files a harness keeps for its user (`place: 'harness'`) among `sources`, each said held where the library has an agent of its
 * name already, so its import would be refused; the store's own places left out, the library holding them already or a repository's.
 *
 * @param sources the agent files the store knows of
 * @param items the library's items
 */
export function importablesOf(sources: readonly AgentSource[], items: readonly LibraryItem[]) {
  const held = new Set(items.filter((one) => one.kind === 'Agent').map((one) => one.name));
  return sources
    .filter((one) => one.place === 'harness')
    .map((one) => ({ name: one.name, file: one.file, description: one.description, error: one.error, held: held.has(one.name) }));
}

/** The agent files the store knows of, to copy into its library, those a harness keeps for its user among them. */
export const agentSourcesQuery = () =>
  queryOptions({
    queryKey: ['library', 'agent-sources'],
    queryFn: async () => [...(await library.agentSources()).sources],
  });

/**
 * Copies the agent file `file` into the user library through the api's copy: the name it took.
 *
 * @param file the agent file, by its path as the sources list it
 */
export const importAgent = async (file: string) => (await library.copyAgent(file)).name;

/**
 * What the factory `factory` has added from the library, each add with its state.
 *
 * @param factory the factory's name
 */
export const libraryAddsQuery = (factory: string) =>
  queryOptions({ queryKey: ['library-adds', factory], queryFn: () => libraryAdds.list(factory) });

/** An item of the library a factory adds: an agent, a skill or an MCP server; a workflow is attached, never added. */
export type AddableItem = LibraryItem & { kind: Exclude<LibraryKind, 'Workflow'> };

/** Whether `item` is one a factory adds, not a workflow. */
const isAddable = (item: LibraryItem): item is AddableItem => item.kind !== 'Workflow';

/**
 * The library items a factory may add, in the library's order: each agent, skill or MCP server it has not added yet.
 *
 * @param items the store's library
 * @param adds what the factory has added
 */
export const addable = (items: readonly LibraryItem[], adds: readonly LibraryAdd[]) => {
  const added = new Set(adds.map((one) => one.metadata.name));
  return items.filter(isAddable).filter((item) => !added.has(`${item.kind}.${item.name}`));
};

/**
 * The add of `item` to `factory`, named as the api names it, `<kind>.<name>`: a workflow is attached to a factory, never added.
 *
 * @param factory the factory the item is added to
 * @param item the library item added
 */
export const addToFactory = (factory: string, item: AddableItem) => libraryAdds.add(factory, `${item.kind}.${item.name}`);

/**
 * The add `name` taken off the factory `factory`.
 *
 * @param factory the factory the add is taken off
 * @param name the add's name, `<kind>.<name>`
 */
export const removeFromFactory = (factory: string, name: string) => libraryAdds.remove(factory, name);
