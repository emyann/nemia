/**
 * The store's library of MCP servers, kept at the store's level (`workflows/mcpservers.json`): the user library's servers beside Nemia's
 * builtins as objects in no namespace, each with the factories that add it, and a server recorded or taken off. Apart from the library's
 * adds, since it reads the factory's servers' verbs, which the pass reaches.
 */
import { API_VERSION, type McpServer, type McpServerList, type McpServerWrite } from 'objects';
import { Effect } from 'effect';
import { DEFAULT_NAMESPACE } from '../factory/factory.ts';
import { builtinServers, BUILTIN_SERVERS } from '../factory/servers/servers.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { objectsListed, versionOf, type ObjectQuery } from '../object/listed.verb.ts';
import { specOf } from '../factory/object/mcp-server.verb.ts';
import { headersKept, writeRefusal } from '../factory/servers/servers.verb.ts';
import { factoryServerRefusal, serverNameRefusal } from '../factory/servers/index.ts';
import { libraryServers, writeLibraryServers } from './library.store.ts';
import { libraryUsers, recordedAt } from './library.verb.ts';

/**
 * Where the library holds the server `name`: the user library, Nemia's builtins, or none.
 * @param home The store's root.
 * @param name The server's name.
 */
export const libraryServerThere = (home: string, name: string) => {
  if (libraryServers(home)[name] !== undefined) return 'user';
  return builtinServers(BUILTIN_SERVERS).some((s) => s.name === name) ? 'builtin' : 'none';
};

/**
 * The library's MCP servers as objects, in no namespace: the user library's, each header masked, then each builtin no user server of its
 * name shadows, each with the factories that add it.
 * @param home The store's root.
 */
export function libraryServerObjects(home: string) {
  const mine = libraryServers(home);
  const filedAt = recordedAt(home, DEFAULT_NAMESPACE);
  const own = Object.entries(mine).map(([name, server]) => serverObject(home, name, specOf(server), 'user', filedAt));
  const builtin = builtinServers(BUILTIN_SERVERS)
    .filter((s) => mine[s.name] === undefined)
    .map(({ name, ...server }) => serverObject(home, name, specOf(server, false), 'builtin', filedAt));
  return [...own, ...builtin].sort((a, b) =>
    a.metadata.name < b.metadata.name ? -1 : a.metadata.name > b.metadata.name ? 1 : 0,
  ) satisfies McpServer[] as McpServer[];
}

/** The object of the library server `name` at `origin`, with the factories that add it. */
const serverObject = (home: string, name: string, spec: McpServer['spec'], origin: 'user' | 'builtin', filedAt: string) => {
  const status = { origin, factories: libraryUsers(home, { kind: 'McpServer', name }) };
  return {
    apiVersion: API_VERSION,
    kind: 'McpServer',
    metadata: { name, creationTimestamp: filedAt, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  } satisfies McpServer;
};

/**
 * The library's server `name` recorded in the user library from `write`, a header sent as the mask keeping the value held, refused
 * `Invalid` as a factory's server write is.
 * @param home The store's root.
 * @param name The server's name.
 * @param write The server's write as it was sent.
 */
export function libraryServerWritten(home: string, name: string, write: McpServerWrite) {
  const bad = serverNameRefusal(name) ?? writeRefusal(write);
  if (bad !== undefined) throw new Invalid({ message: bad });
  const { type, ...rest } = write;
  const server = { ...rest, type: type ?? 'http' };
  const refused = factoryServerRefusal(server);
  if (refused !== undefined) throw new Invalid({ message: `${refused} Nothing was recorded.` });
  const mine = libraryServers(home);
  writeLibraryServers(home, { ...mine, [name]: headersKept(server, mine[name]) });
}

/**
 * The user library's server `name` taken off its record; nothing where it holds none.
 * @param home The store's root.
 * @param name The server's name.
 */
export function libraryServerRemoved(home: string, name: string) {
  const { [name]: _gone, ...rest } = libraryServers(home);
  writeLibraryServers(home, rest);
}

/**
 * A page of the library's MCP servers (`McpServerList`), cut by the list's query as every list is (`objectsListed`).
 * @param home The store's root.
 * @param query The list's query: its selector, limit and token.
 */
export const libraryServerList = Effect.fn('libraryServerList')(function* (home: string, query: ObjectQuery) {
  const listed: McpServerList = yield* objectsListed('McpServer', libraryServerObjects(home), query, 'library server');
  return listed;
});
