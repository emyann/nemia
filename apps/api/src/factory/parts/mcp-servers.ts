/**
 * The mcpservers and builtin groups' handlers (`objects`' `Api`): a factory's MCP servers as objects, in its namespace — a page of them
 * (`mcpServerList`), one (`mcpServerObject`), each header masked — recorded (`nemia factory server add`, a header sent as the mask keeping
 * the value stored, `headerWritten`) and taken off (`server rm`), each answered with what it wrote (`written`); its sign-in to one
 * started, read, completed with the address a person's browser landed on (the body's `url`, which no answer or log carries) and signed out
 * (`serverSignIn`, `serverSignInState`, `serverSignInCallback`, `serverSignOut`), each writing the harness's own store; and Nemia's
 * builtin servers (`builtinServerList`), a spec each and no namespace.
 */
import { Effect } from 'effect';
import {
  mcpServerTable,
  builtinServerList,
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
import { Api } from 'objects';
import type { Served } from '../../layer.ts';
import { factoryNamed, queryOf } from './parts.ts';
import { answered } from '../../objects/refused.ts';
import { wantsTable } from '../../objects/table.ts';
import { readsBounded } from '../../objects/answer-bound.ts';

/** The route of the server `name` of `namespace`, as a refusal says it. */
const routeOf = (method: string, namespace: string, name: string, sub = ''): string =>
  `${method} /api/namespaces/${namespace}/mcpservers/${name}${sub}`;

/** `namespace` and `name` as a factory's and a server's, or `Invalid` naming the route, before anything is read. */
const named = (route: string, namespace: string, name: string): void => {
  factoryNamed(route, namespace);
  const wrong = serverNameRefusal(name);
  if (wrong !== undefined) throw new Refused({ message: `${route}: ${wrong}` });
};

/** The server `name` of `namespace`, read now. */
const serverIn = (s: Served, namespace: string, name: string) => s.inRequest(mcpServerObject(s.home, namespace, name));

export const mcpServersHandlers = readsBounded(Api, 'mcpservers', (handlers) =>
  handlers
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

export const builtinHandlers = readsBounded(Api, 'builtin', (handlers) =>
  handlers.handle('mcpservers', ({ query }) => answered((s) => s.inRequest(builtinServerList(queryOf(query))))),
);
