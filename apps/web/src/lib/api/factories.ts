/**
 * The factories (`GET /api/factories`, apps/api/src/factories/factories.ts); a factory's rules, what every agent hired into it is told
 * (`GET`, `PUT` and `DELETE` on `/api/factories/<name>/rules`, apps/api/src/factories/rules.ts and the routes the api generates beside
 * it); its instruction, Nemia's, which no step is told (`GET`, `PUT` and `DELETE` on `/api/factories/<name>/instruction`,
 * apps/api/src/factories/instruction.ts and the routes the api generates beside it); its hires (`PUT` and `DELETE` on
 * `/api/factories/<name>/hires/<workflow>%2F<step>`, routes the api generates); and its schedules, read-only.
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get, send } from './read.ts';

/** A condition of a factory made from a template, as the daemon wrote it: `Applied` or `ConflictsPending`, its state and why. */
export type FactoryCondition = { type: string; status: 'True' | 'False'; reason: string; message: string };

/**
 * The template a factory is made from: where it is, the version wanted and the parameters given; the version its tree was last applied
 * at, null before the daemon renders it; and the conditions the daemon wrote, none before then.
 */
export type FactoryTemplate = {
  source: string;
  version: string;
  params: Record<string, string | number | boolean>;
  applied: string | null;
  conditions: FactoryCondition[];
};

/**
 * Mirrors `ScheduleAnswer` in apps/api/src/factories/factories.ts: the workflow a factory schedules, its cron and the time zone it is read
 * in (null: the daemon's), what each run is asked, the repository its runs work on (null: the factory's), its next fire (null: its cron
 * gives none), its last scheduled run and when it was made, why its latest fire was refused (null: it was not), and the line that takes
 * it back.
 */
export type FactorySchedule = {
  workflow: string;
  cron: string;
  tz: string | null;
  brief: string;
  repo: string | null;
  next: string | null;
  last: { run: string; at: string } | null;
  refused: string | null;
  commands: { unschedule: string };
};

/** Decodes a `FactorySchedule`. */
const FactoryScheduleSchema = decodes<FactorySchedule>()(
  Schema.Struct({
    workflow: Schema.String,
    cron: Schema.String,
    tz: Schema.NullOr(Schema.String),
    brief: Schema.String,
    repo: Schema.NullOr(Schema.String),
    next: Schema.NullOr(Schema.String),
    last: Schema.NullOr(Schema.Struct({ run: Schema.String, at: Schema.String })),
    refused: Schema.NullOr(Schema.String),
    commands: Schema.Struct({ unschedule: Schema.String }),
  }),
);

/**
 * Mirrors `UntrustedAnswer` in apps/api/src/factories/factories.ts: a place of a factory that a harness does not trust now, each word the
 * api's — the place, the harness by the name a person reads, what is withheld from the place's own settings meanwhile, and why no trust
 * can be kept for it (`never`), null where the factory's `commands.trust` gives it.
 */
export type FactoryUntrusted = { place: string; harness: string; withheld: string; never: string | null };

/**
 * Mirrors `FactoryAnswer` in apps/api/src/factories/factories.ts: a factory's name, whether it is the default factory, the repositories it
 * works on, the workflows it offers — null for the default factory, which offers every workflow found — its hires, `<workflow>/<step>`
 * to an agent's name, and its schedules, none for the default factory. A factory whose file does not read has none of them, and `error`
 * says why, naming the file; null for every other. `template` is the template it is made from, null for one that is not. `untrusted` is
 * each of its places a harness does not trust now (`FactoryUntrusted`), none for the default factory.
 */
export type Factory = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Record<string, string>;
  error: string | null;
  schedules: FactorySchedule[];
  /** The lines a person types for it: a workflow attached, its file removed, filed again, a workflow scheduled, its places trusted. */
  commands: { attach: string; rm: string; add: string; schedule: string; trust: string };
  template: FactoryTemplate | null;
  untrusted: FactoryUntrusted[];
};

/** Decodes a `Factory`. */
const FactorySchema = decodes<Factory>()(
  Schema.Struct({
    name: Schema.String,
    default: Schema.Boolean,
    repos: Schema.mutable(Schema.Array(Schema.String)),
    workflows: Schema.NullOr(Schema.mutable(Schema.Array(Schema.String))),
    hires: Schema.Record(Schema.String, Schema.String),
    error: Schema.NullOr(Schema.String),
    schedules: Schema.mutable(Schema.Array(FactoryScheduleSchema)),
    commands: Schema.Struct({
      attach: Schema.String,
      rm: Schema.String,
      add: Schema.String,
      schedule: Schema.String,
      trust: Schema.String,
    }),
    untrusted: Schema.mutable(
      Schema.Array(
        Schema.Struct({ place: Schema.String, harness: Schema.String, withheld: Schema.String, never: Schema.NullOr(Schema.String) }),
      ),
    ),
    template: Schema.NullOr(
      Schema.Struct({
        source: Schema.String,
        version: Schema.String,
        params: Schema.Record(Schema.String, Schema.Union([Schema.String, Schema.Number, Schema.Boolean])),
        applied: Schema.NullOr(Schema.String),
        conditions: Schema.mutable(
          Schema.Array(
            Schema.Struct({
              type: Schema.String,
              status: Schema.Literals(['True', 'False']),
              reason: Schema.String,
              message: Schema.String,
            }),
          ),
        ),
      }),
    ),
  }),
);

/**
 * The factories: the default factory first, then each in the store. Not polled: a factory changes when a person runs the CLI's `factory`.
 * Read again on each visit.
 */
export const factoriesQuery = queryOptions({
  queryKey: ['factories'],
  queryFn: () => get('/api/factories', Schema.mutable(Schema.Array(FactorySchema))),
});

/**
 * Mirrors `FactoryRules` in the orchestrator, as apps/api/src/factories/rules.ts answers it: the factory's `name`; `file`, the file its
 * rules are kept in; `words`, null where it keeps none; and `error`, why a file there cannot be told, else null.
 */
export type FactoryRules = { name: string; file: string; words: string | null; error: string | null };

/** Decodes a `FactoryRules`. */
const FactoryRulesSchema = decodes<FactoryRules>()(
  Schema.Struct({
    name: Schema.String,
    file: Schema.String,
    words: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
  }),
);

/** The route of the rules of the factory `name`. */
const rulesRoute = (name: string): string => `/api/factories/${encodeURIComponent(name)}/rules`;

/** The rules of the factory `name`, read from its file on each request. */
export const factoryRulesQuery = (name: string) =>
  queryOptions({
    queryKey: ['factory-rules', name],
    queryFn: () => get(rulesRoute(name), FactoryRulesSchema),
  });

/** What a write of a factory's rules may have done, and what to look at before writing them again. */
const RULES_WRITTEN = "The rules may be changed: read the factory's settings again before changing them again.";

/**
 * Write `words` as the rules of the factory `name`: the rules as they then read. Rejects with a `WriteRefusal` in the package's words: no
 * such factory (404), the default factory (409), blank words or words that open with a frontmatter block (422).
 */
export const writeRules = (name: string, words: string): Promise<FactoryRules> =>
  send('PUT', rulesRoute(name), FactoryRulesSchema, { body: { words }, may: RULES_WRITTEN });

/** Remove the rules of the factory `name`: the rules as they then read, none. */
export const clearRules = (name: string): Promise<FactoryRules> =>
  send('DELETE', rulesRoute(name), FactoryRulesSchema, { body: {}, may: RULES_WRITTEN });

/**
 * Mirrors `FactoryInstruction` in the orchestrator, as apps/api/src/factories/instruction.ts answers it — what Nemia is to know about the
 * factory, which no step of a run is told: the factory's `name`; `path`, the path in its first folder its file names, null where it
 * names none or keeps the instruction in the store; `store`, whether the store keeps it; `file`, the file it is read from; `words`, null
 * where there is no file; `error`, why a file there does not read, else null; and `stored`, whether the store holds text for it, read or
 * not.
 */
export type FactoryInstruction = {
  name: string;
  path: string | null;
  store: boolean;
  file: string;
  words: string | null;
  error: string | null;
  stored: boolean;
};

/** Decodes a `FactoryInstruction`. */
const FactoryInstructionSchema = decodes<FactoryInstruction>()(
  Schema.Struct({
    name: Schema.String,
    path: Schema.NullOr(Schema.String),
    store: Schema.Boolean,
    file: Schema.String,
    words: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
    stored: Schema.Boolean,
  }),
);

/** The route of the instruction of the factory `name`. */
const instructionRoute = (name: string): string => `/api/factories/${encodeURIComponent(name)}/instruction`;

/** The instruction of the factory `name`, read where its file says it is kept, on each request. */
export const factoryInstructionQuery = (name: string) =>
  queryOptions({
    queryKey: ['factory-instruction', name],
    queryFn: () => get(instructionRoute(name), FactoryInstructionSchema),
  });

/** What a write of a factory's instruction may have done, and what to look at before writing it again. */
const INSTRUCTION_WRITTEN = "The instruction may be changed: read the factory's settings again before changing it again.";

/** Where an instruction is to be kept: a file in the factory's first folder, by its path from it, or the store. */
export type InstructionPlace = { path: string } | { store: true };

/**
 * Keep the instruction of the factory `name` at `place`: the instruction as it then reads. Rejects with a `WriteRefusal` in the package's
 * words: no such factory (404), the default factory (409), a path that is not a file inside the folder (422).
 */
export const placeInstruction = (name: string, place: InstructionPlace): Promise<FactoryInstruction> =>
  send('PUT', instructionRoute(name), FactoryInstructionSchema, { body: place, may: INSTRUCTION_WRITTEN });

/** Read the instruction of the factory `name` from `NEMIA.md` in its first folder again: the instruction as it then reads. */
export const resetInstructionPlace = (name: string): Promise<FactoryInstruction> =>
  send('DELETE', instructionRoute(name), FactoryInstructionSchema, { body: {}, may: INSTRUCTION_WRITTEN });

/**
 * Write `words` as the instruction the store keeps for the factory `name`: the instruction as it then reads. Rejects with a `WriteRefusal`
 * in the package's words: an instruction read from the factory's folder (409), blank words (422).
 */
export const writeInstruction = (name: string, words: string): Promise<FactoryInstruction> =>
  send('PUT', `${instructionRoute(name)}/words`, FactoryInstructionSchema, { body: { words }, may: INSTRUCTION_WRITTEN });

/** Remove the instruction the store keeps for the factory `name`: the instruction as it then reads. */
export const clearInstruction = (name: string): Promise<FactoryInstruction> =>
  send('DELETE', `${instructionRoute(name)}/words`, FactoryInstructionSchema, { body: {}, may: INSTRUCTION_WRITTEN });

/** The route of the hire of the factory `name` into `step`, `<workflow>/<step>`: the step one segment, its slash encoded. */
const hireRoute = (name: string, step: string): string => `/api/factories/${encodeURIComponent(name)}/hires/${encodeURIComponent(step)}`;

/** What a hire or a fire may have done, and what to look at before sending it again. */
const HIRE_WRITTEN = "The factory's hires may be changed: read the step's page again before hiring or firing again.";

/** A hire written: the factory's file, and the agent it replaced in the step, null where none was hired. */
export type Hired = { file: string; replaced: string | null };

/** A fire written: the factory's file, and the agent fired. */
export type Fired = { file: string; fired: string };

/**
 * Hire the agent `agent` into `step`, `<workflow>/<step>`, in the factory `name`: replacing the one hired there, if any. Rejects with a
 * `WriteRefusal` in the package's words: no such factory (404), the default factory (409), a workflow the factory does not offer (422).
 */
export const hireAgent = (name: string, step: string, agent: string): Promise<Hired> =>
  send('PUT', hireRoute(name, step), Schema.Struct({ file: Schema.String, replaced: Schema.NullOr(Schema.String) }), {
    body: { agent },
    may: HIRE_WRITTEN,
  });

/** Fire the agent the factory `name` hires into `step`, `<workflow>/<step>`. Rejects with a `WriteRefusal` where it hires none (404). */
export const fireAgent = (name: string, step: string): Promise<Fired> =>
  send('DELETE', hireRoute(name, step), Schema.Struct({ file: Schema.String, fired: Schema.String }), { body: {}, may: HIRE_WRITTEN });

/**
 * Mirrors `ServerListed` in the orchestrator, with the state the harness reports, as apps/api/src/servers/servers.ts answers it: one
 * MCP server a factory records, its wire facts — `type`, `url`, `headers` — and the facts of the OAuth client it signs in through,
 * never a secret. `state` is the harness's own word, carried, or null where the state could not be read, which is not an absence.
 */
export type FactoryServer = {
  name: string;
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  oauth?: { clientId: string; callbackPort?: number };
  state: string | null;
  tools?: number;
  error?: string;
};

/** One server Nemia ships, as the add form offers it: the facts a factory would record of it. */
export type ShippedServer = {
  name: string;
  type: 'http' | 'sse';
  url: string;
  headers?: Record<string, string>;
  oauth?: { clientId: string; callbackPort?: number };
};

/**
 * What the board reads of a factory's MCP servers: its record with each server's state, `unread` saying in the runtime's words why
 * none was read, and the servers Nemia ships.
 */
export type FactoryServers = {
  factory: string;
  servers: FactoryServer[];
  unread: string | null;
  shipped: ShippedServer[];
};

const ServerOauthSchema = Schema.Struct({ clientId: Schema.String, callbackPort: Schema.optional(Schema.Number) });

/** Decodes a `FactoryServers`. */
const FactoryServersSchema = decodes<FactoryServers>()(
  Schema.Struct({
    factory: Schema.String,
    servers: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          type: Schema.Literals(['http', 'sse']),
          url: Schema.String,
          headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
          oauth: Schema.optional(ServerOauthSchema),
          state: Schema.NullOr(Schema.String),
          tools: Schema.optional(Schema.Number),
          error: Schema.optional(Schema.String),
        }),
      ),
    ),
    unread: Schema.NullOr(Schema.String),
    shipped: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          type: Schema.Literals(['http', 'sse']),
          url: Schema.String,
          headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
          oauth: Schema.optional(ServerOauthSchema),
        }),
      ),
    ),
  }),
);

const serversRoute = (name: string): string => `/api/factories/${encodeURIComponent(name)}/servers`;
const serverRoute = (name: string, server: string): string => `${serversRoute(name)}/${encodeURIComponent(server)}`;

/**
 * The MCP servers of the factory `name`, with the state its harness reports of each. **Not polled**: the read spawns a short-lived
 * harness session to ask the states, so it is made when a person opens the page and when they press to read again, never on the
 * board's minute poll — a chip may be a few minutes old, and a press is how it is refreshed. Its answer never goes stale, so neither a
 * mount after the loader's read nor a window's focus reads it again: the settings route's loader reads it once per visit (`OPENED`).
 */
export const factoryServersQuery = (name: string) =>
  queryOptions({
    queryKey: ['factory-servers', name],
    queryFn: () => get(serversRoute(name), FactoryServersSchema),
    staleTime: Infinity,
  });

/** What a write of a factory's servers may have done, and what to look at before writing them again. */
const SERVERS_WRITTEN = "The server may be recorded: read the factory's servers again before writing them again.";

/** The answer a write of one server gives: the file written, and the server as it was recorded. */
type ServerWritten = { file: string };

const ServerWrittenSchema = decodes<ServerWritten>()(Schema.Struct({ file: Schema.String }));

/**
 * Record `server` for the factory `name`, a second of one name replacing the first. Rejects with a `WriteRefusal` in the package's
 * words: no such factory (404), a name that is no factory's or no server's (400), and a server it refuses (422) — a local one, an
 * `Authorization` header, a `url` that is no address, a transport the harness loads nothing from.
 */
export const recordServer = (
  name: string,
  server: string,
  body: { url: string; transport?: string; header?: string[]; clientId?: string; callbackPort?: string },
): Promise<ServerWritten> => send('PUT', serverRoute(name, server), ServerWrittenSchema, { body, may: SERVERS_WRITTEN });

/** Take the server `server` off the factory `name`'s record. Rejects as `recordServer` does, and 404 for a server it does not record. */
export const removeServer = (name: string, server: string): Promise<ServerWritten> =>
  send('DELETE', serverRoute(name, server), ServerWrittenSchema, { body: {}, may: SERVERS_WRITTEN });

/** What a sign-in answers at once, as apps/api/src/servers/sign-in.ts answers it: the address to open, and when it stops waiting. */
export type SignInStarted = { authUrl: string; until: string };

const SignInStartedSchema = decodes<SignInStarted>()(Schema.Struct({ authUrl: Schema.String, until: Schema.String }));

/** The words of a sign-in's state, as the engine holds it: none asked, one waiting, or how the last one ended. */
export const SIGN_IN_WORDS = ['none', 'waiting', 'connected', 'expired', 'failed'] as const;

/** A server's last sign-in, as the api answers it from the engine's memory. */
export type SignInState = { state: (typeof SIGN_IN_WORDS)[number]; until?: string; why?: string };

const SignInStateSchema = decodes<SignInState>()(
  Schema.Struct({
    state: Schema.Literals(SIGN_IN_WORDS),
    until: Schema.optional(Schema.String),
    why: Schema.optional(Schema.String),
  }),
);

/** What a sign-out answers. */
type SignedOut = { signedOut: true };

const SignedOutSchema = decodes<SignedOut>()(Schema.Struct({ signedOut: Schema.Literal(true) }));

const signInRoute = (name: string, server: string): string => `${serverRoute(name, server)}/sign-in`;

/** What a sign-in or a sign-out may have done, and what to look at before asking again. */
const SIGN_IN_ASKED = "The sign-in may have changed: read the server's state again before asking again.";

/**
 * Start a sign-in to the factory `name`'s server `server`: resolves with the address the person opens. Rejects with a `WriteRefusal`:
 * no such server (404), another sign-in waiting on its callback port (409), a server with no OAuth client (422).
 */
export const signInServer = (name: string, server: string): Promise<SignInStarted> =>
  send('POST', signInRoute(name, server), SignInStartedSchema, { body: {}, may: SIGN_IN_ASKED });

/**
 * The state of `server`'s last sign-in, from the engine's memory: it spawns nothing, so the board polls it while a sign-in waits,
 * every 2 seconds, and stops once it settles.
 */
export const signInStateQuery = (name: string, server: string) =>
  queryOptions({
    queryKey: ['factory-server-sign-in', name, server],
    queryFn: () => get(signInRoute(name, server), SignInStateSchema),
    refetchInterval: (query) => (query.state.data?.state === 'waiting' ? 2_000 : false),
  });

/** Sign the factory `name` out of `server`: its sign-in cleared, so its state reads needs-auth on the next read. 409 while one waits. */
export const signOutServer = (name: string, server: string): Promise<SignedOut> =>
  send('DELETE', signInRoute(name, server), SignedOutSchema, { body: {}, may: SIGN_IN_ASKED });
