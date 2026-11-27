/**
 * The mcpservers and builtin groups' handlers (`objects`' `Api`): a factory's MCP servers as objects, in its namespace — a page of them
 * (`mcpServerList`), one (`mcpServerObject`), each header masked — recorded (`nemia factory server add`, a header sent as the mask keeping
 * the value stored, `headerWritten`) and taken off (`server rm`), each answered with what it wrote (`written`); its sign-in to one
 * started (a code to type at the provider, or an address to open), read (a waiting one answers what it started with), completed by the
 * browser with the address a person's browser was sent to (the body's `url`, which no answer or log carries) and cancelled or signed out
 * (`serverSignIn`, `serverSignInState`, `serverSignInCallback`, `serverSignOut`), each handed to the engine, which holds the sign-in; and
 * the store's
 * library of servers, in no namespace (`/api/mcpservers`): the user library's beside Nemia's builtins, each with the factories that add
 * it, kept at the store's level, a builtin never removed and one a factory adds refused its removal naming each.
 */
import { Effect } from 'effect';
import {
  mcpServerTable,
  libraryServerList,
  libraryServerObjects,
  libraryServerRemoved,
  libraryServerThere,
  libraryServerWritten,
  libraryUsers,
  FACTORY_SERVER_ADD,
  FACTORY_SERVER_RM,
  mcpServerList,
  mcpServerObject,
  serverNameRefusal,
  serverSignIn,
  serverSignInCallback,
  serverSignInState,
  serverSignOut,
  Invalid as Refused,
} from 'agent-orchestrator';
import { Api, Missing } from 'objects';
import type { Served } from '../../layer.ts';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { writeGoes } from '../../definitions/served.ts';
import { listOrTable, wantsTable } from '../../objects/table.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** The route of the server `name` of `namespace`, as a refusal says it. */
const routeOf = (method: string, namespace: string, name: string, sub = '') =>
  `${method} /api/namespaces/${namespace}/mcpservers/${name}${sub}`;

/** `namespace` and `name` as a factory's and a server's, or `Invalid` naming the route, before anything is read. */
const named = (route: string, namespace: string, name: string) => {
  factoryNamed(route, namespace);
  const wrong = serverNameRefusal(name);
  if (wrong !== undefined) throw new Refused({ message: `${route}: ${wrong}` });
};

/** The library's server `name`, read now; `Missing` naming the list where the library holds none. */
const libraryServerIn = async (s: Served, name: string) => {
  const found = (await s.inRequest(libraryServerObjects(s.home))).find((one) => one.metadata.name === name);
  if (found === undefined)
    throw new Missing({
      error: `the library holds no server ${name}: list them with GET /api/mcpservers, or record it with PUT /api/mcpservers/${name}.`,
    });
  return found;
};

/** The server `name` of `namespace`, read now. */
const serverIn = (s: Served, namespace: string, name: string) => s.inRequest(mcpServerObject(s.home, namespace, name));

/** The library's server `name` removed, once its users are read: refused where a factory still names it; the server as it was. */
const libraryRemoved = async (s: Served, name: string) => {
  writeGoes('library', 'remove', libraryServerThere(s.home, name), await s.inRequest(libraryUsers(s.home, { kind: 'McpServer', name })));
  const server = await libraryServerIn(s, name);
  libraryServerRemoved(s.home, name);
  return server;
};

export const mcpServersHandlers = readsBounded(Api, 'mcpservers', (handlers) =>
  handlers
    .handle('listLibrary', ({ query }) =>
      listOrTable(
        answered((s) => s.inRequest(libraryServerList(s.home, queryOf(query)))),
        mcpServerTable,
      ),
    )
    .handle('getLibrary', ({ params: { name } }) => answered(async (s) => libraryServerIn(s, name)))
    .handle('putLibrary', ({ params: { name }, payload }) =>
      answered(async (s) => {
        writeGoes('library', libraryServerThere(s.home, name) === 'none' ? 'create' : 'replace', libraryServerThere(s.home, name));
        libraryServerWritten(s.home, name, payload);
        return libraryServerIn(s, name);
      }),
    )
    .handle('deleteLibrary', ({ params: { name } }) => answered((s) => libraryRemoved(s, name)))
    .handle('list', ({ params: { namespace }, query }) =>
      Effect.flatMap(wantsTable, (table) =>
        answered(async (s) => {
          factoryNamed(`GET /api/namespaces/${namespace}/mcpservers`, namespace);
          const list = await s.inRequest(mcpServerList(s.home, namespace, queryOf(query)));
          return table ? mcpServerTable(list) : list;
        }),
      ),
    )
    .handle('get', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('GET', namespace, name), namespace, name);
        return serverIn(s, namespace, name);
      }),
    )
    .handle('put', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        named(routeOf('PUT', namespace, name), namespace, name);
        const { file, replaced } = await s.inRequest(FACTORY_SERVER_ADD.handler({ factory: namespace, server: name, ...payload }));
        return { ...(await serverIn(s, namespace, name)), written: { file, was: replaced?.url ?? null } };
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('DELETE', namespace, name), namespace, name);
        const server = await serverIn(s, namespace, name);
        const { file } = await s.inRequest(FACTORY_SERVER_RM.handler({ factory: namespace, server: name }));
        return { ...server, written: { file } };
      }),
    )
    .handle('signIn', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('POST', namespace, name, '/sign-in'), namespace, name);
        return s.inRequest(serverSignIn(namespace, name, s.home));
      }),
    )
    .handle('signInState', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('GET', namespace, name, '/sign-in'), namespace, name);
        return s.inRequest(serverSignInState(namespace, name, s.home));
      }),
    )
    .handle('signInCallback', ({ params: { namespace, name }, payload }) =>
      answered(async (s) => {
        named(routeOf('POST', namespace, name, '/sign-in/callback'), namespace, name);
        return s.inRequest(serverSignInCallback(namespace, name, payload.url, s.home));
      }),
    )
    .handle('signOut', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('DELETE', namespace, name, '/sign-in'), namespace, name);
        return s.inRequest(serverSignOut(namespace, name, s.home));
      }),
    ),
);
