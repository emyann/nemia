/**
 * A factory's MCP servers as objects (`McpServer`, `McpServerList`, from `objects`), in the factory's namespace: its record as `nemia
 * factory servers` lists it (`FACTORY_SERVERS`), each header's value masked (`maskedHeaders`), never a secret served, and the state the
 * harness reports read live, in one ask for the list; why the states were not read, where the look failed, is each server's
 * `status.error`. The default factory records none. And Nemia's builtin servers (`builtinServerList`), each with its spec alone and no
 * namespace: a server a factory may record, offered, not one any factory has; its headers as Nemia gives
 * them, which name no secret, so the board records it as offered.
 */
import { Effect } from 'effect';
import { API_VERSION, type McpServer, type McpServerList } from 'objects';
import { Missing, type Invalid } from '../../refusal/refusal.ts';
import { BUILTIN_SERVERS, builtinServers } from '../servers/servers.store.ts';
import { maskedHeaders, type FactoryServer } from '../servers/index.ts';
import { FACTORY_SERVERS, type ServerListed, type ServersListing } from '../servers/servers.verb.ts';
import { factoryFiled } from './factory.verb.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../../object/listed.verb.ts';

/** A server's spec, as its record holds it, each header masked where `masked`. */
const specOf = (server: FactoryServer, masked = true): McpServer['spec'] => ({
  type: server.type,
  url: server.url,
  ...(server.headers === undefined ? {} : { headers: masked ? maskedHeaders(server.headers) : { ...server.headers } }),
  ...(server.oauth === undefined ? {} : { oauth: { ...server.oauth } }),
});

/** The object of the server `s` of the factory `namespace`, filed at `filedAt`, its states unread for `unread` where they were. */
export const mcpServerOf = (s: ServerListed, namespace: string, filedAt: string, unread: string | null): McpServer => {
  const spec = specOf(s);
  const error = s.error ?? unread ?? undefined;
  const status: NonNullable<McpServer['status']> = {
    ...(s.state === null ? {} : { state: s.state }),
    ...(s.tools === undefined ? {} : { tools: s.tools }),
    ...(error === undefined ? {} : { error }),
  };
  return {
    apiVersion: API_VERSION,
    kind: 'McpServer',
    metadata: { name: s.name, namespace, creationTimestamp: filedAt, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  };
};

/**
 * The servers of the factory `namespace`, read now at `home`; none for the default factory, which the door answers with no listing;
 * `Missing` where no factory has the name.
 */
const serversOf = Effect.fn('serversOf')(function* (home: string, repo: string, namespace: string) {
  const { factory, listing: filed } = yield* factoryFiled(home, repo, namespace);
  if (filed === undefined) return [];
  const listing: ServersListing = yield* FACTORY_SERVERS.handler({ factory: namespace });
  return listing.servers.map((s) => mcpServerOf(s, namespace, factory.metadata.creationTimestamp, listing.unread));
});

/** A page of the servers of the factory `namespace` (`McpServerList`), read now at the store `home`. */
export const mcpServerList = Effect.fn('mcpServerList')(function* (home: string, repo: string, namespace: string, query: ObjectQuery) {
  const listed: McpServerList = yield* objectsListed('McpServer', yield* serversOf(home, repo, namespace), query, 'server');
  return listed;
});

/** The server `name` of the factory `namespace` as an object; `Missing` where it records none of that name. */
export const mcpServerObject = Effect.fn('mcpServerObject')(function* (home: string, repo: string, namespace: string, name: string) {
  const found = (yield* serversOf(home, repo, namespace)).find((s) => s.metadata.name === name);
  if (found === undefined)
    return yield* Effect.fail<Missing | Invalid>(
      new Missing({
        message: `no server ${name} in the factory ${namespace}: list them with nemia factory servers ${namespace}, or record it with nemia factory server add ${namespace} ${name} --url <address>`,
      }),
    );
  return found;
});

/**
 * A page of Nemia's builtin servers (`McpServerList`), as objects with a spec alone and no namespace: those of `dir`, the package's own by
 * default, sorted by name and cut by the list's query as every list is (`objectsListed`). `Invalid` for a selector, a limit or a token
 * that is not one.
 */
export const builtinServerList = Effect.fn('builtinServerList')(function* (query: ObjectQuery, dir: string = BUILTIN_SERVERS) {
  const filedAt = bornAt(dir);
  const servers: McpServer[] = builtinServers(dir).map(({ name, ...server }) => {
    const spec = specOf(server, false);
    return {
      apiVersion: API_VERSION,
      kind: 'McpServer',
      metadata: { name, creationTimestamp: filedAt, resourceVersion: versionOf(spec, undefined) },
      spec,
    };
  });
  const listed: McpServerList = yield* objectsListed('McpServer', servers, query, 'builtin server');
  return listed;
});
