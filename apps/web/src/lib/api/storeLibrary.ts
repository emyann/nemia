import { queryOptions } from '@tanstack/react-query';
import type { Agent, LibraryAdd, McpServer, Skill, Workflow } from 'objects';
import { library, libraryAdds } from './objects.ts';

/** The kinds the store's library holds, in the order its page draws them. */
export const LIBRARY_KINDS = ['Skill', 'Agent', 'McpServer', 'Workflow'] as const;

/** One kind of `LIBRARY_KINDS`. */
export type LibraryKind = (typeof LIBRARY_KINDS)[number];

/**
 * One item of the store's library, as its page draws it: its kind and name, whose it is (the user library's or Nemia's builtin), the
 * factories that use it, and whether the builtin it was copied from has changed since.
 */
export type LibraryItem = {
  kind: LibraryKind;
  name: string;
  origin: 'user' | 'builtin';
  factories: readonly string[];
  builtinChanged: boolean;
};

/** The parts of a definition's status the library's page reads. */
type Held = { metadata: { name: string }; status: { origin: string; factories?: readonly string[]; builtinChanged?: boolean } };

/** `one` of `kind` as a library item, the builtin's origin kept and every other said the user library's. */
const itemOf =
  (kind: LibraryKind) =>
  (one: Held): LibraryItem => ({
    kind,
    name: one.metadata.name,
    origin: one.status.origin === 'builtin' ? 'builtin' : 'user',
    factories: one.status.factories ?? [],
    builtinChanged: one.status.builtinChanged === true,
  });

/** A library server as a library item: its origin and factories read off its status, the user library's where none is said. */
const serverItem = (one: McpServer): LibraryItem =>
  itemOf('McpServer')({ metadata: one.metadata, status: { origin: one.status?.origin ?? 'user', factories: one.status?.factories } });

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
): LibraryItem[] {
  const byName = (a: LibraryItem, b: LibraryItem) => a.name.localeCompare(b.name);
  return [
    ...skills.map(itemOf('Skill')).sort(byName),
    ...agents.map(itemOf('Agent')).sort(byName),
    ...servers.map(serverItem).sort(byName),
    ...workflows.map(itemOf('Workflow')).sort(byName),
  ];
}

/** The store's library, every kind, read once for the Library page. */
export const libraryQuery = () =>
  queryOptions({
    queryKey: ['library'],
    queryFn: async (): Promise<LibraryItem[]> => {
      const [skills, agents, servers, workflows] = await Promise.all([
        library.skills(),
        library.agents(),
        library.mcpServers(),
        library.workflows(),
      ]);
      return libraryItemsOf(skills, agents, servers.items, workflows);
    },
  });

/**
 * What the factory `factory` has added from the library, each add with its state.
 *
 * @param factory the factory's name
 */
export const libraryAddsQuery = (factory: string) =>
  queryOptions({ queryKey: ['library-adds', factory], queryFn: (): Promise<LibraryAdd[]> => libraryAdds.list(factory) });

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
export const addable = (items: readonly LibraryItem[], adds: readonly LibraryAdd[]): AddableItem[] => {
  const added = new Set(adds.map((one) => one.metadata.name));
  return items.filter(isAddable).filter((item) => !added.has(`${item.kind}.${item.name}`));
};

/**
 * The add of `item` to `factory`, named as the api names it, `<kind>.<name>`: a workflow is attached to a factory, never added.
 *
 * @param factory the factory the item is added to
 * @param item the library item added
 */
export const addToFactory = (factory: string, item: AddableItem): Promise<LibraryAdd> =>
  libraryAdds.add(factory, `${item.kind}.${item.name}`);

/**
 * The add `name` taken off the factory `factory`.
 *
 * @param factory the factory the add is taken off
 * @param name the add's name, `<kind>.<name>`
 */
export const removeFromFactory = (factory: string, name: string): Promise<LibraryAdd> => libraryAdds.remove(factory, name);
