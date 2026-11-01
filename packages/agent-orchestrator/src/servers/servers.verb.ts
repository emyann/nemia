/**
 * `nemia factory servers`, `server add` and `server rm`, each an entry of the command table, served on the CLI and generated into the
 * api's routes: a factory's record listed with each server's state, a remote server recorded, and one taken off.
 *
 * The states are the runtime's own words, carried whole and never worded again here: `connected`, `needs-auth`, `failed`, `pending`,
 * `disabled`. A factory's whole record is read in one ask of the engine, never one ask per server; a read that failed says the state is
 * unread rather than absent, and never `needs-auth`.
 *
 * The default factory is given a record here, in the controller, while `factories/default.json` stays refused in the store — as
 * `levels.verb.ts` has the default factory's special case.
 */
import { Effect } from 'effect';
import { EngineService, signsInMcp, tried, type McpServerState, type McpServersRead } from '../runtime-client.ts';
import { leftOut, type Args, type Flag, type Spec } from '../command/command.ts';
import { rootGiven, StoreRoot } from '../config/root.store.ts';
import { FactoryName } from '../factory/factory.model.ts';
import { FactoryDoor } from '../factory/factories.store.ts';
import { rooted } from '../factory/wire.verb.ts';
import type { Command } from '../command/entry.verb.ts';
import { DEFAULT_FACTORY, noFactoryLine } from '../factory/factory.ts';
import { readFactories } from '../factory/factory.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { factoryServers, factoryServersFile } from './servers.store.ts';
import { factoryServerRefusal, serverNameRefusal, type FactoryServers } from './servers.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** One server of a factory's record as a listing gives it: its facts, and the harness's word for its state, or `null` where unread. */
export type ServerListed = {
  readonly name: string;
  readonly type: 'http' | 'sse';
  readonly url: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly oauth?: { readonly clientId: string; readonly callbackPort?: number };
  /** The harness's own word, carried; `null` where the state could not be read, which is not an absence. */
  readonly state: McpServerState['status'] | null;
  readonly tools?: number;
  readonly error?: string;
};

/** A factory's servers with their states: the record, and why the states are unread where the look failed. */
export type ServersListing = {
  readonly factory: string;
  readonly servers: readonly ServerListed[];
  /** Why no state was read, in the runtime's words; `null` where they were read, and for a factory that records none. */
  readonly unread: string | null;
};

/**
 * The state of each server of `record`, read in one ask of the engine (`mcpState`), as a map by name — and `undefined`, with why, where
 * the look failed. A record with no server asks nothing: there is nothing to read, and an empty ask is refused.
 */
export const statesOf = Effect.fn('statesOf')(function* (record: FactoryServers) {
  if (!Object.keys(record).length) return { by: new Map<string, McpServerState>(), unread: null };
  const e = yield* EngineService;
  const read: McpServersRead | { readonly refused: string } = yield* e
    .mcpState(record)
    .pipe(Effect.catch((err) => Effect.succeed({ refused: err.message })));
  if ('refused' in read) return { by: new Map<string, McpServerState>(), unread: read.refused };
  if (!read.read) return { by: new Map<string, McpServerState>(), unread: read.why };
  return { by: new Map(read.servers.map((s) => [s.name, s])), unread: null };
});

/** One recorded server with the state read of it: `state: null` where none was, never a word invented for it. */
const listedOf = (name: string, server: FactoryServers[string], state: McpServerState | undefined): ServerListed => ({
  name,
  type: server.type,
  url: server.url,
  ...(server.headers === undefined ? {} : { headers: server.headers }),
  ...(server.oauth === undefined ? {} : { oauth: server.oauth }),
  state: state?.status ?? null,
  ...(state?.tools === undefined ? {} : { tools: state.tools }),
  ...(state?.error === undefined ? {} : { error: state.error }),
});

/**
 * A factory's record with every server's state, read now: one ask of the engine for the whole record. Refused (`Missing`) for a name
 * the store has no factory under — a listing of nothing would read as a factory that records none — and never for the default
 * factory, which is no file.
 */
export const serversListed = Effect.fn('serversListed')(function* (factory: string, home: string) {
  const record = yield* tried(() => {
    factoryThere(factory, 'listed');
    return factoryServers(home, factory);
  });
  const { by, unread } = yield* statesOf(record);
  return {
    factory,
    servers: Object.entries(record).map(([name, server]) => listedOf(name, server, by.get(name))),
    unread,
  } satisfies ServersListing;
});

const LIST_USAGE = '<factory>';

/** `nemia factory servers`: a factory's recorded MCP servers, each with its state as its harness reports it now. */
export const FACTORY_SERVERS: Command<ServersListing> = {
  name: 'factory servers',
  usage: LIST_USAGE,
  help: ["a factory's own MCP servers, each with the state its harness reports"],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) =>
      `nemia factory servers lists one factory's servers, and ${arg} is a second: nemia factory servers ${LIST_USAGE}, once per factory.`,
    missing: `nemia factory servers takes the factory, as nemia factory ls lists it: nemia factory servers ${LIST_USAGE}.`,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/factories/:factory/servers', status: 200 },
  handler: (args, _env, home) => serversListed(textOf(args, 'factory'), rootGiven(home, 'factory servers')),
  print: ({ factory, servers, unread }) =>
    servers.length === 0
      ? [`${factory}  no server recorded — nemia factory server add ${factory} <server> --url <address>`]
      : [
          ...servers.map(
            (s) =>
              `${s.name.padEnd(20)} ${s.type}  ${s.url}  ${s.state ?? 'unread'}${s.tools === undefined ? '' : ` (${s.tools} tools)`}${s.error === undefined ? '' : `  ${s.error}`}`,
          ),
          ...(unread === null ? [] : [`the states were not read: ${unread}`]),
        ],
};

/** A value flag of `server add`. */
const valueFlag = (flag: string, key: string, takes: string, many?: true): Flag => ({
  flag,
  kind: 'text',
  key,
  takes,
  ...(many ? { many: true } : { twice: `${flag} is given twice, and takes one value: give it once.` }),
});

const ADD_USAGE =
  '<factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]';

const ADD_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'server', takes: 'required', kind: 'name' },
  ],
  flags: [
    valueFlag('--url', 'url', 'the address the server is reached at'),
    valueFlag('--transport', 'transport', 'http or sse'),
    valueFlag('--header', 'header', 'one <name>=<value>, given once per header', true),
    valueFlag('--client-id', 'clientId', "the OAuth app's client id, for a server that signs in"),
    valueFlag('--callback-port', 'callbackPort', "the port the OAuth app's callback is registered on"),
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory server add does not take ${arg}: nemia factory server add ${ADD_USAGE}.`
      : `nemia factory server add takes one server, and ${arg} is a second: nemia factory server add ${ADD_USAGE}, once per server.`,
  apart: (_value, flag) => `${flag} is given no value: nemia factory server add ${ADD_USAGE}.`,
  missing: `nemia factory server add takes the factory, then the server's name: nemia factory server add ${ADD_USAGE}. Nothing was recorded.`,
};

/** Why `nemia factory server add`'s arguments are refused before anything is read: a `--url` left out, or a value empty. */
const addCheck = (args: Args): string | null =>
  textOf(args, 'url')
    ? leftOut(ADD_SPEC, args)
    : `nemia factory server add takes --url: nemia factory server add ${ADD_USAGE}. Nothing was recorded.`;

/** The headers `--header` gave, as a map: refused (`Invalid`) for one with no `=`, or an empty name. */
function headersOf(args: Args): Record<string, string> | undefined {
  const given = args.header;
  const lines = Array.isArray(given) ? (given as string[]) : typeof given === 'string' ? [given] : [];
  if (!lines.length) return undefined;
  const headers: Record<string, string> = {};
  for (const line of lines) {
    const at = line.indexOf('=');
    if (at < 1) {
      throw new Invalid({
        message: `--header takes <name>=<value>, and \`${line}\` has no name and value: --header X-MCP-Toolsets=actions,repos. Nothing was recorded.`,
      });
    }
    headers[line.slice(0, at)] = line.slice(at + 1);
  }
  return headers;
}

/** The `oauth` the flags gave, or `undefined`: refused (`Invalid`) for a callback port with no client id, or a port that is no port. */
function oauthOf(args: Args): { clientId: string; callbackPort?: number } | undefined {
  const clientId = textOf(args, 'clientId');
  const port = textOf(args, 'callbackPort');
  if (!clientId) {
    if (!port) return undefined;
    throw new Invalid({
      message:
        '--callback-port is the port of the OAuth app --client-id names, and no --client-id was given: give both, or neither. Nothing was recorded.',
    });
  }
  if (!port) return { clientId };
  const n = Number(port);
  if (!Number.isSafeInteger(n) || n < 1 || n > 65535) {
    throw new Invalid({
      message: `--callback-port takes the port the OAuth app's callback is registered on, a whole number from 1 to 65535, and \`${port}\` is not one: --callback-port 8791. Nothing was recorded.`,
    });
  }
  return { clientId, callbackPort: n };
}

/**
 * Refused (`Missing`): a factory the store has no file for, and one whose file does not read. The default factory passes — it is no
 * file, and is given a record of its own all the same, since every run and card that names no factory runs in it.
 */
export function factoryThere(name: string, verb: string): void {
  if (name === DEFAULT_FACTORY) return;
  const all = readFactories();
  const found = all.find((f) => f.name === name);
  if (!found) {
    throw new Missing({
      message: `${noFactoryLine(
        name,
        all.map((f) => f.name),
      )} Nothing was ${verb}.`,
    });
  }
  if ('error' in found) {
    throw new Missing({
      message: `${found.file} ${found.error}, so no server is ${verb} for ${name}: fix or remove the file (nemia factory rm ${name}). Nothing was ${verb}.`,
    });
  }
}

/** What an add answers: the file written, the server as it was recorded, and the one it replaced, or null. */
type Added = { file: string; name: string; server: FactoryServers[string]; replaced: FactoryServers[string] | null };

/**
 * `nemia factory server add`: one remote MCP server recorded for a factory, a second of one name replacing the first. Refused before
 * anything is written: a name that is no server's, a local server, and an `Authorization` header (`factoryServerRefusal`).
 */
export const FACTORY_SERVER_ADD: Command<Added> = {
  name: 'factory server add',
  usage: ADD_USAGE,
  help: ["record a remote MCP server for a factory: its steps' sessions are", 'handed it, and an agent `mcp:` line names it'],
  spec: ADD_SPEC,
  check: addCheck,
  writes: true,
  class: 'ask',
  route: { method: 'PUT', path: '/api/factories/:factory/servers/:server', status: 200 },
  handler: (args, _env, home) =>
    rooted(
      home,
      'factory server add',
      Effect.gen(function* () {
        const store = yield* StoreRoot;
        const factory = textOf(args, 'factory');
        const name = textOf(args, 'server');
        const transport = textOf(args, 'transport') || 'http';
        const bad = serverNameRefusal(name);
        if (bad) return yield* Effect.fail(new Invalid({ message: `${bad} Nothing was recorded.` }));
        yield* tried(() => factoryThere(factory, 'recorded'));
        const headers = headersOf(args);
        const oauth = oauthOf(args);
        const server = {
          type: transport as 'http' | 'sse',
          url: textOf(args, 'url'),
          ...(headers === undefined ? {} : { headers }),
          ...(oauth === undefined ? {} : { oauth }),
        };
        const refused = factoryServerRefusal(server);
        if (refused) return yield* Effect.fail(new Invalid({ message: `${refused} Nothing was recorded.` }));
        const door = yield* FactoryDoor;
        const record = yield* door.servers.read(FactoryName.read(factory));
        yield* door.servers.write(FactoryName.read(factory), { ...record, [name]: server });
        return { file: factoryServersFile(store, factory), name, server, replaced: record[name] ?? null };
      }),
    ),
  print: ({ file, name, server, replaced }, args) => [
    `${textOf(args, 'factory')}  ${name} → ${server.type} ${server.url}${replaced === null ? '' : ` (was ${replaced.url})`}`,
    `recorded: ${file}${server.oauth === undefined ? '' : ' — sign the server in before a step needs it'}`,
  ],
};

const RM_USAGE = '<factory> <server>';

/**
 * `nemia factory server rm`: one server taken off a factory's record. The sign-in the harness filed for it is left: it is the
 * harness's own store, and nothing here writes it.
 */
export const FACTORY_SERVER_RM: Command<{ file: string; removed: string }> = {
  name: 'factory server rm',
  usage: RM_USAGE,
  help: ["take a server off a factory's record"],
  spec: {
    positionals: ADD_SPEC.positionals,
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory server rm does not take ${arg}: nemia factory server rm ${RM_USAGE}.`
        : `nemia factory server rm takes one server, and ${arg} is a second: nemia factory server rm ${RM_USAGE}, once per server.`,
    missing: `nemia factory server rm takes the factory, then the server: nemia factory server rm ${RM_USAGE}. Nothing was removed.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  route: { method: 'DELETE', path: '/api/factories/:factory/servers/:server', status: 200 },
  handler: (args, _env, home) =>
    rooted(
      home,
      'factory server rm',
      Effect.gen(function* () {
        const store = yield* StoreRoot;
        const factory = textOf(args, 'factory');
        const name = textOf(args, 'server');
        yield* tried(() => factoryThere(factory, 'removed'));
        const door = yield* FactoryDoor;
        const record = yield* door.servers.read(FactoryName.read(factory));
        if (!Object.hasOwn(record, name)) {
          const names = Object.keys(record);
          return yield* Effect.fail(
            new Missing({
              message: `${factory} records no server \`${name}\`: ${names.length ? `its servers are ${names.join(', ')}` : 'it records none'}. Nothing was removed.`,
            }),
          );
        }
        const { [name]: _gone, ...left } = record;
        yield* door.servers.write(FactoryName.read(factory), left);
        return { file: factoryServersFile(store, factory), removed: name };
      }),
    ),
  print: ({ file, removed }, args) => [
    `${textOf(args, 'factory')}  ${removed} removed`,
    `recorded: ${file} — the sign-in the harness filed for it is left in the harness's own store`,
  ],
};

/** What a pass read of a run's factory record before it files: the servers, their states, and why a step of it may not start. */
export type ServersBefore = {
  /** Why no step with a factory server may start now, naming the file and the command: `null` where every one may. */
  readonly refusal: string | null;
  /** The notes the pass says of this read, whatever it decided: the states it could not read, said once for the pass. */
  readonly notes: readonly string[];
  /** Why the step `step` of agent `agent`'s named servers may not start now, or `null`. */
  readonly refuses: (harness: string | undefined, named: readonly string[] | undefined) => string | null;
};

/** A pass that read nothing, because the factory records no server: no step is refused, and nothing is noted. */
const NOTHING: ServersBefore = { refusal: null, notes: [], refuses: () => null };

/**
 * What the run's factory records, read once for the pass, with the state of every server of it read in one ask of the engine: the
 * judgement a pass makes before it files a step whose agent names one.
 *
 * - A factory that records no server reads nothing and asks nothing: no engine ask, no spawn, no cost.
 * - A record that does not read refuses every step that names a server, naming the file and the command that writes it again — the
 *   filing itself was handed no server for it (`recordedServers`), so the step would otherwise be refused for a name the checkout
 *   does not declare, which names the wrong fix.
 * - A server that reports `needs-auth` refuses the steps that name it, on a harness that files a sign-in (`signsInMcp`); the note says
 *   the server, the factory and the sign-in to make. On any other harness nothing is refused: the servers reach the session unsigned,
 *   and a state of one there is unread rather than false.
 * - A look that failed refuses nothing at all and says the states are unread, once for the pass: an absence read off a failed look is
 *   not an absence, and a step refused on a harness that was merely busy would be refused for ever.
 */
export const serversBefore = Effect.fn('serversBefore')(function* (factory: string, home: string) {
  const read: { readonly record: FactoryServers } | { readonly refused: string } = yield* tried(() => factoryServers(home, factory)).pipe(
    Effect.map((record) => ({ record })),
    Effect.catch((err) => Effect.succeed({ refused: err.message })),
  );
  if ('refused' in read) {
    const refusal = `the servers ${factory} records cannot be read: ${read.refused}`;
    return { refusal, notes: [], refuses: (_h, named) => (named?.length ? refusal : null) } satisfies ServersBefore;
  }
  const record = read.record;
  if (!Object.keys(record).length) return NOTHING;
  const { by, unread } = yield* statesOf(record);
  const notes = unread === null ? [] : [`the state of ${factory}'s MCP servers is unread: ${unread}`];
  return {
    refusal: null,
    notes,
    refuses: (harness, named) => {
      if (!named?.length || !signsInMcp(harness)) return null;
      const waiting = named.filter((name) => by.get(name)?.status === 'needs-auth');
      if (!waiting.length) return null;
      return `its \`mcp: ${named.join(', ')}\` names ${waiting.map((n) => `\`${n}\``).join(', ')}, which ${factory} records and which ${waiting.length > 1 ? 'report' : 'reports'} needs-auth: a session of it would reach no tool of ${waiting.length > 1 ? 'those servers' : 'that server'}. Sign ${waiting.length > 1 ? 'them' : 'it'} in on the factory's settings page, then the next pass files the step`;
    },
  } satisfies ServersBefore;
});

/**
 * The servers of `factory` as a pass about to file `ready` steps needs them: one look for the whole pass, since a look is a session
 * spawned, and no look at all for a pass with no step to file. What the look left unread is noted on `notes`, once for the pass.
 */
export const serversFiling = Effect.fn('serversFiling')(function* (
  factory: string,
  home: string,
  ready: readonly string[],
  notes: string[],
) {
  if (!ready.length) return undefined;
  const servers = yield* serversBefore(factory, home);
  notes.push(...servers.notes);
  return servers;
});

/**
 * Whether `step` is held back for want of a sign-in, read off that one look, noting on `notes` which server and what to do where it
 * is: its session would start, reach no tool of that server, and spend a try finding out. A step whose harness files no sign-in of its
 * own, a step naming no server, and a look that failed each hold back nothing.
 */
export const unsignedStep = (
  servers: ServersBefore | undefined,
  step: { readonly name: string; readonly harness?: string; readonly agent?: { readonly mcp?: readonly string[] } },
  notes: string[],
): boolean => {
  const why = servers?.refuses(step.harness, step.agent?.mcp) ?? null;
  if (why !== null) notes.push(`${step.name}: not filed — ${why}`);
  return why !== null;
};
