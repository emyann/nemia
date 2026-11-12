/**
 * `nemia factory servers`, `server add` and `server rm`, each an entry of the command table, served on the CLI: a factory's record listed
 * with each server's state, a remote server recorded, and one taken off. The api's McpServer writes (`objects`' Api) call `server add` and
 * `server rm` by their `input`.
 *
 * The states are the runtime's own words, carried whole and never worded again here: `connected`, `needs-auth`, `failed`, `pending`,
 * `disabled`. A factory's whole record is read in one ask of the engine, never one ask per server; a read that failed says the state is
 * unread rather than absent, and never `needs-auth`.
 *
 * The default factory is given a record here, in the controller, while `factories/default.json` stays refused in the store — as
 * `levels.verb.ts` has the default factory's special case.
 */
import { Effect, Schema } from 'effect';
import { EngineService, signsInMcp, tried, type McpServerState, type McpServersRead } from '../../runtime-client.ts';
import type { Args } from '../../command/command.ts';
import { StoreRoot } from '../../config/root.store.ts';
import { FactoryName, isDefaultFactory } from '../factory.model.ts';
import { doorAt, FactoryDoor } from '../door/factories.store.ts';
import { tableEntry, type Served } from '../../command/entry.verb.ts';
import { noFactoryLine } from '../factory.ts';
import { Invalid, Missing, type Refusal } from '../../refusal/refusal.ts';
import { factoryServersFile } from './servers.store.ts';
import {
  FACTORY_SERVER_ADD_WORDS,
  FACTORY_SERVER_RM_WORDS,
  FACTORY_SERVERS_WORDS,
  HEADER_MASK,
  McpServerWrite,
  type McpTransport,
} from 'objects';
import { factoryServerRefusal, headerWritten, maskedHeaders, serverNameRefusal, type FactoryServers } from './servers.ts';

/** The text under `key`, as the spec read it. */
const textOf = (args: Args, key: string): string => (typeof args[key] === 'string' ? args[key] : '');

/** One server of a factory's record as a listing gives it: its facts, and the harness's word for its state, or `null` where unread. */
export type ServerListed = {
  readonly name: string;
  readonly type: McpTransport;
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

/**
 * One recorded server with the state read of it: `state: null` where none was, never a word invented for it; its headers masked
 * (`maskedHeaders`), so a read carries no header's value out of the store.
 */
export const listedOf = (name: string, server: FactoryServers[string], state: McpServerState | undefined): ServerListed => ({
  name,
  type: server.type,
  url: server.url,
  ...(server.headers === undefined ? {} : { headers: maskedHeaders(server.headers) }),
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
  const record = yield* doorAt(home, (door) =>
    Effect.andThen(factoryThere(factory, 'listed'), door.servers.read(FactoryName.read(factory))),
  );
  const { by, unread } = yield* statesOf(record);
  return {
    factory,
    servers: Object.entries(record).map(([name, server]) => listedOf(name, server, by.get(name))),
    unread,
  } satisfies ServersListing;
});

/** `nemia factory servers`: a factory's recorded MCP servers, each with its state as its harness reports it now. */
export const FACTORY_SERVERS: Served<ServersListing> = {
  ...FACTORY_SERVERS_WORDS,
  handler: (args) => Effect.flatMap(StoreRoot, (home) => serversListed(textOf(args, 'factory'), home)),
};

/** Whether `n` is a port an OAuth app's callback can be registered on: a whole number from 1 to 65535. */
const isPort = (n: number): boolean => Number.isSafeInteger(n) && n >= 1 && n <= 65535;

/** Why `port` is no callback port, naming the flag and the key that give it. */
const portRefusal = (port: string): string =>
  `--callback-port (\`oauth.callbackPort\`) takes the port the OAuth app's callback is registered on, a whole number from 1 to 65535, and \`${port}\` is not one: --callback-port 8791. Nothing was recorded.`;

/** What `nemia factory server add` takes: the factory, the server's name, and the McpServer's write (`objects`' `McpServerWrite`). */
export const ServerAddInput = Schema.Struct({ ...McpServerWrite.fields, factory: Schema.String, server: Schema.String });
export type ServerAddInput = typeof ServerAddInput.Type;

/** What `nemia factory server rm` takes: the factory, and the server taken off its record. */
export const ServerRmInput = Schema.Struct({ factory: Schema.String, server: Schema.String });
export type ServerRmInput = typeof ServerRmInput.Type;

/** Why a server's write is refused before anything is read, beside `factoryServerRefusal`: a header with no name, a port that is none. */
const writeRefusal = (write: McpServerWrite): string | undefined => {
  if (write.headers !== undefined && Object.hasOwn(write.headers, ''))
    return 'A header is sent by its name, and one has none: give each header its name, as { "X-MCP-Toolsets": "actions,repos" }. Nothing was recorded.';
  const port = write.oauth?.callbackPort;
  return port === undefined || isPort(port) ? undefined : portRefusal(String(port));
};

/**
 * Refused (`Missing`), through the Factory door: a factory the store has no file for, and one whose file does not read. The default
 * factory passes — the door answers it as its record, and gives it servers of its own, since every run and card that names no factory
 * runs in it.
 */
export const factoryThere = (name: string, verb: string): Effect.Effect<void, Refusal> =>
  Effect.gen(function* () {
    const door = yield* FactoryDoor;
    const all = yield* door.factories.listed();
    const found = all.find((f) => f.name === name);
    if (found === undefined) {
      const read = yield* Effect.result(door.factories.read(FactoryName.read(name)));
      if (read._tag === 'Success' && isDefaultFactory(read.success)) return;
      return yield* Effect.fail(
        new Missing({
          message: `${noFactoryLine(
            name,
            all.map((f) => f.name),
          )} Nothing was ${verb}.`,
        }),
      );
    }
    if ('error' in found)
      return yield* Effect.fail(
        new Missing({
          message: `${found.file} ${found.error}, so no server is ${verb} for ${name}: fix or remove the file (nemia factory rm ${name}). Nothing was ${verb}.`,
        }),
      );
  });

/**
 * `server`'s headers as a write keeps them against `stored`, the server of its name the record holds (`headerWritten`): each sent with a
 * value of its own as sent, each sent as the mask a read served as the value stored. Refused (`Invalid`) for a mask sent for a header the
 * record holds no value of, naming it and asking for its value: nothing is written.
 */
function headersKept(server: FactoryServers[string], stored: FactoryServers[string] | undefined): FactoryServers[string] {
  if (server.headers === undefined) return server;
  const headers: Record<string, string> = {};
  for (const [header, sent] of Object.entries(server.headers)) {
    const written = headerWritten(sent, stored?.headers?.[header] ?? null);
    if ('refused' in written)
      throw new Invalid({
        message: `the header ${header} is sent as ${HEADER_MASK}, the mask a read serves, and the server records no value of it to keep: give its value, --header ${header}=<value>. Nothing was recorded.`,
      });
    headers[header] = written.value;
  }
  return { ...server, headers };
}

/** `server` as an answer gives it: its headers masked, as a read serves them. */
const masked = (server: FactoryServers[string]): FactoryServers[string] =>
  server.headers === undefined ? server : { ...server, headers: maskedHeaders(server.headers) };

/** `server` masked (`masked`), or null for none. */
const maskedOrNull = (server: FactoryServers[string] | undefined): FactoryServers[string] | null =>
  server === undefined ? null : masked(server);

/** What an add answers: the file written, the server as it was recorded, and the one it replaced, or null, each with its headers masked. */
type Added = { file: string; name: string; server: FactoryServers[string]; replaced: FactoryServers[string] | null };

/**
 * `nemia factory server add`: one remote MCP server recorded for a factory, a second of one name replacing the first. Refused before
 * anything is written: a name that is no server's, a local server, and an `Authorization` header (`factoryServerRefusal`).
 */
export const FACTORY_SERVER_ADD: Served<Added, ServerAddInput> = {
  ...FACTORY_SERVER_ADD_WORDS,
  input: ServerAddInput,
  handler: ({ factory, server: name, type, ...write }) =>
    Effect.gen(function* () {
      const store = yield* StoreRoot;
      const bad = serverNameRefusal(name);
      if (bad) return yield* Effect.fail(new Invalid({ message: `${bad} Nothing was recorded.` }));
      yield* factoryThere(factory, 'recorded');
      const wrong = writeRefusal(write);
      if (wrong) return yield* Effect.fail(new Invalid({ message: wrong }));
      const server = { ...write, type: type ?? 'http' };
      const refused = factoryServerRefusal(server);
      if (refused) return yield* Effect.fail(new Invalid({ message: `${refused} Nothing was recorded.` }));
      const door = yield* FactoryDoor;
      const record = yield* door.servers.read(FactoryName.read(factory));
      const kept = yield* tried(() => headersKept(server, record[name]));
      yield* door.servers.write(FactoryName.read(factory), { ...record, [name]: kept });
      return { file: factoryServersFile(store, factory), name, server: masked(kept), replaced: maskedOrNull(record[name]) };
    }),
};

/**
 * `nemia factory server rm`: one server taken off a factory's record. The sign-in the harness filed for it is left: it is the
 * harness's own store, and nothing here writes it.
 */
export const FACTORY_SERVER_RM: Served<{ file: string; removed: string }, ServerRmInput> = {
  ...FACTORY_SERVER_RM_WORDS,
  input: ServerRmInput,
  handler: ({ factory, server: name }) =>
    Effect.gen(function* () {
      const store = yield* StoreRoot;
      yield* factoryThere(factory, 'removed');
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
  const read: { readonly record: FactoryServers } | { readonly refused: string } = yield* doorAt(home, (door) =>
    door.servers.read(FactoryName.read(factory)),
  ).pipe(
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

/** `nemia factory servers` and `server add|rm`'s entries, in the order `nemia`'s help lists them. */
export const FACTORY_SERVER_VERBS: readonly Served[] = [
  tableEntry(FACTORY_SERVERS),
  tableEntry(FACTORY_SERVER_ADD),
  tableEntry(FACTORY_SERVER_RM),
];
