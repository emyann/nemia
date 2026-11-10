/**
 * The factories, as the board's pages draw them: each read as a nemia/v1 `Factory` through the objects' client (`objects.ts`), beside
 * the lines a person types for it (`/api/factories/<name>/commands`) and its schedules (`/api/namespaces/<name>/schedules`), and made the
 * board's view of it in one place (`factoryViewOf`). A factory's rules, what every agent hired into it is told, and its instruction,
 * Nemia's, which no step is told, are its sub-resources; its hires are `Hire` objects named `<workflow>.<step>`; its MCP servers are
 * `McpServer` objects, their headers served masked, beside Nemia's builtin ones.
 */
import { queryOptions } from '@tanstack/react-query';
import {
  DEFAULT_NAMESPACE,
  type Factory as FactoryObject,
  type FactoryCommands,
  type FactoryCondition,
  type FactoryInstruction,
  type FactoryInstructionWrite,
  type FactoryRules,
  type Hire,
  type McpServer,
  type McpServerWrite,
  type McpTransport,
  type Schedule,
  type SignedOut,
  type SignInStarted,
} from 'objects';
import { builtin, factories, hireName, hires, mcpServers, schedules } from './objects.ts';

export type { FactoryCondition, FactoryInstruction, FactoryRules, McpServerWrite, SignInStarted, SignInState } from 'objects';

/**
 * The template a factory is made from: where it is, the version wanted and the parameters given; the version its tree was last applied
 * at, null before the daemon renders it; and the conditions the daemon wrote, none before then.
 */
export type FactoryTemplate = {
  source: string;
  version: string;
  params: Readonly<Record<string, string | number | boolean>>;
  applied: string | null;
  conditions: readonly FactoryCondition[];
};

/**
 * A workflow a factory schedules, from its `Schedule`: its cron and the time zone it is read in (null: the daemon's), what each run is
 * asked, the repository its runs work on (null: the factory's), its next fire (null: its cron gives none), its last scheduled run, why
 * its latest fire was refused (null: it was not), and the line that takes it back.
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

/**
 * A place of a factory that a harness does not trust now: the place, the harness by the name a person reads, what is withheld from the
 * place's own settings meanwhile, and why no trust can be kept for it (`never`), null where the factory's `commands.trust` gives it.
 */
export type FactoryUntrusted = { place: string; harness: string; withheld: string; never: string | null };

/**
 * A folder of the person's machine a factory's runs reach beside its repositories: its path, whether it is read-only (`:ro`) or
 * writable (`:rw`), and the line that takes it back.
 */
export type FactoryVolume = { path: string; readOnly: boolean; commands: { rm: string } };

/**
 * The board's view of a factory (`factoryViewOf`): its name, whether it is the default factory, the repositories it works on, the
 * workflows it offers — null for the default factory, which offers every workflow found — its hires, `<workflow>/<step>` to an agent's
 * name, and its schedules. `error` says why its file does not read, null for every other. `template` is the template it is made from,
 * null for one that is not; `untrusted` each of its places a harness does not trust now; `volumes` each folder its runs reach.
 */
export type Factory = {
  name: string;
  default: boolean;
  repos: string[];
  workflows: string[] | null;
  hires: Record<string, string>;
  error: string | null;
  schedules: FactorySchedule[];
  /**
   * The lines a person types for it: a workflow attached, its file removed, filed again, a workflow scheduled, its places trusted, a
   * volume mounted.
   */
  commands: { attach: string; rm: string; add: string; schedule: string; trust: string; volume: string };
  template: FactoryTemplate | null;
  untrusted: FactoryUntrusted[];
  volumes: FactoryVolume[];
};

/** A schedule of a factory, as the view draws it: `unschedule` the line that takes it back. */
const scheduleViewOf = (schedule: Schedule, unschedule: string): FactorySchedule => ({
  workflow: schedule.metadata.name,
  cron: schedule.spec.cron,
  tz: schedule.spec.tz ?? null,
  brief: schedule.spec.brief,
  repo: schedule.spec.repo ?? null,
  next: schedule.status.next ?? null,
  last: schedule.status.last ?? null,
  refused: schedule.status.refused ?? null,
  commands: { unschedule },
});

/**
 * The view of `factory` the pages draw, from the object, the lines a person types for it (`commands`) and its schedules: a key the
 * object leaves out is the view's null, a volume's line that takes it back is the one `commands` keeps under its name.
 */
export const factoryViewOf = (factory: FactoryObject, commands: FactoryCommands, scheduled: readonly Schedule[] = []): Factory => {
  const { spec, status } = factory;
  return {
    name: factory.metadata.name,
    default: factory.metadata.name === DEFAULT_NAMESPACE,
    repos: [...spec.repos],
    workflows: spec.workflows ? [...spec.workflows] : null,
    hires: { ...spec.hires },
    error: status.error ?? null,
    schedules: scheduled.map((s) => scheduleViewOf(s, commands.unschedule[s.metadata.name] ?? '')),
    commands: {
      attach: commands.attach,
      rm: commands.rm,
      add: commands.add,
      schedule: commands.schedule,
      trust: commands.trust,
      volume: commands.volume,
    },
    template: spec.template ? { ...spec.template, applied: status.applied ?? null, conditions: status.conditions } : null,
    untrusted: status.untrusted.map((u) => ({ place: u.place, harness: u.harness, withheld: u.withheld, never: u.never ?? null })),
    volumes: spec.volumes.map((v) => ({
      path: v.path,
      readOnly: v.readOnly,
      commands: { rm: (v.name === undefined ? undefined : commands.volumeRm[v.name]) ?? '' },
    })),
  };
};

/** The view of one factory: its object, its lines and, for a factory a person made, its schedules, read together. */
const viewRead = async (factory: FactoryObject): Promise<Factory> => {
  const name = factory.metadata.name;
  const [commands, scheduled] = await Promise.all([
    factories.commands(name),
    name === DEFAULT_NAMESPACE ? Promise.resolve([]) : schedules.list(name).then((list) => list.items),
  ]);
  return factoryViewOf(factory, commands, scheduled);
};

/**
 * The factories: the default factory first, then each in the store, each with its lines and schedules. Not polled: a factory changes when
 * a person runs the CLI's `factory`. Read again on each visit.
 */
export const factoriesQuery = queryOptions({
  queryKey: ['factories'],
  queryFn: async (): Promise<Factory[]> => Promise.all((await factories.listAll()).items.map(viewRead)),
});

/** The rules of the factory `name`, read from its file on each request. */
export const factoryRulesQuery = (name: string) =>
  queryOptions({ queryKey: ['factory-rules', name], queryFn: () => factories.rules(name) });

/**
 * Write `words` as the rules of the factory `name`: the rules as they then read. Rejects with a `WriteRefusal` in the package's words: no
 * such factory (404), the default factory (409), blank words or words that open with a frontmatter block (422).
 */
export const writeRules = (name: string, words: string): Promise<FactoryRules> => factories.putRules(name, words);

/** Remove the rules of the factory `name`: the rules as they then read, none. */
export const clearRules = (name: string): Promise<FactoryRules> => factories.deleteRules(name);

/** The instruction of the factory `name`, read where its file says it is kept, on each request. */
export const factoryInstructionQuery = (name: string) =>
  queryOptions({ queryKey: ['factory-instruction', name], queryFn: () => factories.instruction(name) });

/** Where an instruction is to be kept: a file in the factory's first folder, by its path from it, or the store. */
type InstructionPlace = FactoryInstructionWrite;

/**
 * Keep the instruction of the factory `name` at `place`: the instruction as it then reads. Rejects with a `WriteRefusal` in the package's
 * words: no such factory (404), the default factory (409), a path that is not a file inside the folder (422).
 */
export const placeInstruction = (name: string, place: InstructionPlace): Promise<FactoryInstruction> =>
  factories.putInstruction(name, place);

/** Read the instruction of the factory `name` from `NEMIA.md` in its first folder again: the instruction as it then reads. */
export const resetInstructionPlace = (name: string): Promise<FactoryInstruction> => factories.deleteInstruction(name);

/**
 * Write `words` as the instruction the store keeps for the factory `name`: the instruction as it then reads. Rejects with a `WriteRefusal`
 * in the package's words: an instruction read from the factory's folder (409), blank words (422).
 */
export const writeInstruction = (name: string, words: string): Promise<FactoryInstruction> => factories.putInstructionWords(name, words);

/** Remove the instruction the store keeps for the factory `name`: the instruction as it then reads. */
export const clearInstruction = (name: string): Promise<FactoryInstruction> => factories.deleteInstructionWords(name);

/** The name of the hire into `step`, `<workflow>/<step>`: the two joined by a dot, the Hire's name. */
const hireNamed = (step: string): string => {
  const at = step.indexOf('/');
  return at < 0 ? step : hireName(step.slice(0, at), step.slice(at + 1));
};

/**
 * Hire the agent `agent` into `step`, `<workflow>/<step>`, in the factory `name`: replacing the one hired there, if any, and answering
 * the Hire as it then reads. Rejects with a `WriteRefusal` in the package's words: no such factory or step (404), the default factory or
 * a name two steps join to (409), a workflow the factory does not offer (422).
 */
export const hireAgent = (name: string, step: string, agent: string): Promise<Hire> => hires.put(name, hireNamed(step), agent);

/** Fire the agent the factory `name` hires into `step`, `<workflow>/<step>`. Rejects with a `WriteRefusal` where it hires none. */
export const fireAgent = (name: string, step: string): Promise<Hire> => hires.delete(name, hireNamed(step));

/**
 * One MCP server a factory records, from its `McpServer`: its wire facts — `type`, `url`, `headers`, each value served as the mask — and
 * the facts of the OAuth client it signs in through, never a secret. `state` is the harness's own word, or null where the state could not
 * be read, which is not an absence; `error` says why.
 */
export type FactoryServer = {
  name: string;
  type: McpTransport;
  url: string;
  headers?: Readonly<Record<string, string>>;
  oauth?: { clientId: string; callbackPort?: number };
  state: string | null;
  tools?: number;
  error?: string;
};

/** One of Nemia's builtin servers, as the add form offers it: the facts a factory would record of it. */
export type BuiltinServer = Omit<FactoryServer, 'state' | 'tools' | 'error'>;

/** What the board reads of a factory's MCP servers: its record with each server's state, and Nemia's builtin servers. */
export type FactoryServers = { factory: string; servers: readonly FactoryServer[]; builtin: readonly BuiltinServer[] };

/** `server` as the board draws it: its spec beside its name, and what its status says. */
const serverViewOf = (server: McpServer): FactoryServer => ({
  name: server.metadata.name,
  ...server.spec,
  state: server.status?.state ?? null,
  ...(server.status?.tools === undefined ? {} : { tools: server.status.tools }),
  ...(server.status?.error === undefined ? {} : { error: server.status.error }),
});

/** A builtin server as the form offers it: its name and its spec. */
const builtinViewOf = (server: McpServer): BuiltinServer => ({ name: server.metadata.name, ...server.spec });

/**
 * The MCP servers of the factory `name`, with the state its harness reports of each, and Nemia's builtin ones. **Not polled**: the read
 * spawns a short-lived harness session to ask the states, so it is made when a person opens the page and when they press to read again,
 * never on the board's minute poll — a chip may be a few minutes old, and a press is how it is refreshed. Its answer never goes stale, so
 * neither a mount after the loader's read nor a window's focus reads it again: the settings route's loader reads it once per visit
 * (`OPENED`).
 */
export const factoryServersQuery = (name: string) =>
  queryOptions({
    queryKey: ['factory-servers', name],
    queryFn: async (): Promise<FactoryServers> => {
      const [listed, offered] = await Promise.all([mcpServers.list(name), builtin.mcpServers()]);
      return { factory: name, servers: listed.items.map(serverViewOf), builtin: offered.items.map(builtinViewOf) };
    },
    staleTime: Infinity,
  });

/**
 * Record `server` for the factory `name`, a second of one name replacing the first; a header sent as the mask it was read with keeps
 * the value stored. Rejects with a `WriteRefusal` in the package's words: no such factory (404), a name that is no factory's or no
 * server's (400), and a server it refuses (422) — a local one, an `Authorization` header, a `url` that is no address, a transport the
 * harness loads nothing from, a mask sent for a header it does not store.
 */
export const recordServer = (name: string, server: string, body: McpServerWrite): Promise<McpServer> => mcpServers.put(name, server, body);

/** Take the server `server` off the factory `name`'s record. Rejects as `recordServer` does, and 404 for a server it does not record. */
export const removeServer = (name: string, server: string): Promise<McpServer> => mcpServers.delete(name, server);

/**
 * Start a sign-in to the factory `name`'s server `server`: resolves with the address the person opens. Rejects with a `WriteRefusal`:
 * no such server (404), another sign-in waiting on its callback port (409), a server with no OAuth client (422).
 */
export const signInServer = (name: string, server: string): Promise<SignInStarted> => mcpServers.signIn(name, server);

/**
 * The state of `server`'s last sign-in, from the engine's memory: it spawns nothing, so the board polls it while a sign-in waits,
 * every 2 seconds, and stops once it settles.
 */
export const signInStateQuery = (name: string, server: string) =>
  queryOptions({
    queryKey: ['factory-server-sign-in', name, server],
    queryFn: () => mcpServers.signInState(name, server),
    refetchInterval: (query) => (query.state.data?.state === 'waiting' ? 2_000 : false),
  });

/** Sign the factory `name` out of `server`: its sign-in cleared, so its state reads needs-auth on the next read. 409 while one waits. */
export const signOutServer = (name: string, server: string): Promise<SignedOut> => mcpServers.signOut(name, server);
