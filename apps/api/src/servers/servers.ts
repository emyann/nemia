/**
 * A factory's MCP servers on the board: the record the store keeps beside the factory, each server with the state its harness reports
 * now, read through `nemia factory servers`'s entry of the package's command table (`FACTORY_SERVERS`), so the board and the command
 * say the same things in the same words. And the servers Nemia ships, which the add form offers.
 *
 * A folder of its own because `src/factories/` holds six source files, the cap, and a limit is met by cutting rather than by raising a
 * ceiling. The state is the runtime's, asked through the package: no file here imports the runtime or a harness SDK.
 */
import fs from 'node:fs';
import path from 'node:path';
import { FACTORY_SERVERS, factoryNameRefusal, serverNameRefusal, type ServersListing } from 'agent-orchestrator';
import { Hono } from 'hono';
import { valueAt } from '../body.ts';
import { HOME_REPO } from '../capabilities/capabilities.ts';
import type { Named, RouteWords } from '../commands/words.ts';
import { type ApiEnv, served } from '../layer.ts';
import { runPlaced } from '../store.ts';

/**
 * `workflows/servers/` of the checkout the api runs from: the MCP servers Nemia ships, each a `<name>.json` a person may add to a
 * factory of theirs without typing its address or its client id. There is none today — the first is this intent's second card — and
 * git commits no empty directory, so the folder may not be there at all, which is no error.
 */
export const SHIPPED_SERVERS = path.join(HOME_REPO, 'workflows', 'servers');

/** One server Nemia ships, as the board offers it: its name, and the facts a factory would record of it. */
export type ShippedServer = {
  readonly name: string;
  readonly type: 'http' | 'sse';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly oauth?: { readonly clientId: string; readonly callbackPort?: number };
};

/**
 * The servers Nemia ships, by name: each `<name>.json` of `dir` that reads as one. An absent folder is an empty list, never a throw —
 * git commits no empty directory, so the folder need not be there — and a file that does not read is left out rather than failing the
 * read, since one bad shipped file must not blank the add form.
 */
export const shippedServers = (dir: string = SHIPPED_SERVERS): readonly ShippedServer[] => {
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.flatMap((file): ShippedServer[] => {
    const name = file.slice(0, -'.json'.length);
    if (serverNameRefusal(name) !== undefined) return [];
    try {
      const read = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as Omit<ShippedServer, 'name'>;
      if (typeof read?.url !== 'string' || (read.type !== 'http' && read.type !== 'sse')) return [];
      return [{ name, ...read }];
    } catch {
      return [];
    }
  });
};

/** What the board reads of a factory's servers: its record with each state, and the list Nemia ships for the add form. */
export type FactoryServersRead = ServersListing & { readonly shipped: readonly ShippedServer[] };

const ADD_PUT_SHAPE =
  '`{ "url": "https://…", "transport"?: "http" | "sse", "header"?: ["<name>=<value>", …], "clientId"?: "<id>", "callbackPort"?: "<port>" }`';

/** The server a factory's server route names, off the path: the last segment of `/api/factories/<factory>/servers/<server>`. */
const serverOf = (at: Named): string => at.path.split('/').pop() ?? '';

/** The route of a factory's server `at` names, as a refusal says it: `PUT /api/factories/<name>/servers/<server>`. */
const serverRoute = (at: Named): string => `${at.method} /api/factories/${at.factory}/servers/${serverOf(at)}`;

/** A name in a server's route that is no factory's or no server's, in the package's words, before anything is read. */
const serverNamed = (at: Named): string | null => {
  const wrong = factoryNameRefusal(at.factory) ?? serverNameRefusal(serverOf(at));
  return wrong === undefined ? null : `${serverRoute(at)}: ${wrong}`;
};

/**
 * A server recorded for a factory, as the guard's refusals word it: a name that is no factory's or no server's is refused in the
 * package's words, before anything is read, and a `url` that is no string in the api's.
 */
export const FACTORY_SERVER_ADD_WORDS: RouteWords = {
  shape: ADD_PUT_SHAPE,
  guard: (at) => ({
    route: serverRoute(at),
    does: 'records an MCP server for a factory',
    forAnother: 'record one',
    why: "every step of every run started in the factory after is handed the server, and an agent's `mcp:` line resolves its name against the record",
    reach: "record it on the factory's settings page on the board",
    instead: "Record it on the factory's settings page on the board",
    shape: ADD_PUT_SHAPE,
  }),
  issue: (at) => (_issue, body) =>
    `${serverRoute(at)}: \`url\` is the address the server is reached at, a string: ${ADD_PUT_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['url'])) ?? 'left out'}.`,
  named: serverNamed,
  notJson: (at) => `${serverRoute(at)} takes a JSON body: ${ADD_PUT_SHAPE}.`,
};

/** A server taken off a factory's record, as the guard's refusals word it: the names are refused in the package's words. */
export const FACTORY_SERVER_RM_WORDS: RouteWords = {
  shape: '`{}`',
  guard: (at) => ({
    route: serverRoute(at),
    does: "takes a server off a factory's record",
    forAnother: 'take it off',
    why: "no step of a run started in the factory after is handed it, and an agent's `mcp:` line naming it resolves against the checkout's `.mcp.json` instead",
    reach: "remove it on the factory's settings page on the board",
    instead: "Remove it on the factory's settings page on the board",
    shape: '`{}`',
  }),
  issue: (at) => () => `${serverRoute(at)} takes no body.`,
  named: serverNamed,
};

/**
 * A factory's servers' read. A name that is no factory's is refused in the package's words (400) before anything is read; a name with
 * no factory is 404 (`Missing`), by `app.onError`. A state that could not be read is answered, never refused: `state` is null on each
 * server and `unread` says why, since an absence read off a failed look is not an absence.
 *
 * - `GET /api/factories/:factory/servers` — the factory's record, each server with its state, and `shipped`, the servers Nemia ships.
 *
 * A server is recorded (`PUT …/servers/:server`) and removed (`DELETE …/servers/:server`) on the path under it: routes the table
 * generates from the entries (commands/routes.ts), guarded, each answered as the read.
 *
 * The read spawns one short-lived harness session to ask the states, so it is made when a person opens the page and when they press to
 * read again, never on the board's minute poll.
 */
export const factoryServers = new Hono<ApiEnv>().get('/api/factories/:factory/servers', (c) =>
  served(c, async ({ e, placeService }) => {
    const { factory } = c.req.param();
    const wrong = factoryNameRefusal(factory);
    if (wrong !== undefined) return c.json({ error: `GET /api/factories/${factory}/servers: ${wrong}` }, 400);
    const listing = await runPlaced(placeService, e, FACTORY_SERVERS.handler({ factory }));
    return c.json({ ...listing, shipped: shippedServers() } satisfies FactoryServersRead);
  }),
);

/** The words the two writing server routes are refused in, by the verb each is served as on the CLI (`WORDS`). */
export const FACTORY_SERVER_WORDS = {
  'factory server add': FACTORY_SERVER_ADD_WORDS,
  'factory server rm': FACTORY_SERVER_RM_WORDS,
};
