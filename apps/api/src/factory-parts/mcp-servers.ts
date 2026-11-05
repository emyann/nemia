/**
 * The mcpservers and builtin groups' handlers (`objects`' `Api`): a factory's MCP servers as objects, in its namespace — a page of them
 * (`mcpServerList`), one (`mcpServerObject`), each header masked — recorded (`nemia factory server add`, a header sent as the mask
 * keeping the value stored, `headerWritten`) and taken off (`server rm`); its sign-in to one started, read and signed out
 * (`serverSignIn`, `serverSignInState`, `serverSignOut`), each writing the harness's own store; and Nemia's builtin servers
 * (`builtinServerList`), a spec each and no namespace.
 */
import { HttpApiBuilder } from 'effect/http-api';
import {
  builtinServerList,
  mcpServerList,
  mcpServerObject,
  serverNameRefusal,
  serverSignIn,
  serverSignInState,
  serverSignOut,
  Invalid as Refused,
} from 'agent-orchestrator';
import { Api, type McpServerWrite } from 'objects';
import type { Served } from '../layer.ts';
import { commandNamed, runPlaced } from '../store.ts';
import { defaultRepo, factoryNamed, queryOf } from './parts.ts';
import { answered } from '../objects/refused.ts';

const SERVER_ADD = commandNamed('factory server add');
const SERVER_RM = commandNamed('factory server rm');

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
const serverIn = (s: Served, namespace: string, name: string) =>
  runPlaced(s, s.e, mcpServerObject(s.home, defaultRepo(s), namespace, name));

/** The arguments `nemia factory server add` takes for a write: its transport, url, headers as `name=value` and OAuth client. */
const addArgs = (namespace: string, name: string, w: McpServerWrite) => ({
  factory: namespace,
  server: name,
  url: w.url,
  transport: w.type ?? 'http',
  ...(w.headers === undefined ? {} : { header: Object.entries(w.headers).map(([k, v]) => `${k}=${v}`) }),
  ...(w.oauth === undefined ? {} : { clientId: w.oauth.clientId }),
  ...(w.oauth?.callbackPort === undefined ? {} : { callbackPort: String(w.oauth.callbackPort) }),
});

export const mcpServersHandlers = HttpApiBuilder.group(Api, 'mcpservers', (handlers) =>
  handlers
    .handle('list', ({ params: { namespace }, query }) =>
      answered((s) => {
        factoryNamed(`GET /api/namespaces/${namespace}/mcpservers`, namespace);
        return runPlaced(s, s.e, mcpServerList(s.home, defaultRepo(s), namespace, queryOf(query)));
      }),
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
        await runPlaced(s, s.e, SERVER_ADD.handler(addArgs(namespace, name, payload), s.env, s.home));
        return serverIn(s, namespace, name);
      }),
    )
    .handle('delete', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('DELETE', namespace, name), namespace, name);
        const server = await serverIn(s, namespace, name);
        await runPlaced(s, s.e, SERVER_RM.handler({ factory: namespace, server: name }, s.env, s.home));
        return server;
      }),
    )
    .handle('signIn', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('POST', namespace, name, '/sign-in'), namespace, name);
        return runPlaced(s, s.e, serverSignIn(namespace, name, s.home));
      }),
    )
    .handle('signInState', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('GET', namespace, name, '/sign-in'), namespace, name);
        return runPlaced(s, s.e, serverSignInState(namespace, name, s.home));
      }),
    )
    .handle('signOut', ({ params: { namespace, name } }) =>
      answered(async (s) => {
        named(routeOf('DELETE', namespace, name, '/sign-in'), namespace, name);
        return runPlaced(s, s.e, serverSignOut(namespace, name, s.home));
      }),
    ),
);

export const builtinHandlers = HttpApiBuilder.group(Api, 'builtin', (handlers) =>
  handlers.handle('mcpservers', () => answered(async () => builtinServerList())),
);
