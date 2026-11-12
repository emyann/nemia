/**
 * The agent library as entries of the command table: an agent of yours written (`AGENTS_WRITE`, `writeAgent`), copied in from a file
 * (`AGENTS_COPY`, `copyAgent`), removed (`AGENTS_REMOVE`, `removeAgent`) and tried on a short brief (`AGENTS_TRY`, `tryAgent`), served on
 * both sides — the client (`apps/cli`) holds `agents write`'s words (`objects`' `COMMAND_WORDS`) and sends the form the api read off the
 * agent's file, the board sends its own — and one agent read for its page (`AGENTS_READ`, `agentRead`), on the api alone. The api guards
 * each write and words the board's answer around what each entry answers.
 */
import { AGENTS_RM_WORDS, AGENTS_RUN_WORDS, AGENTS_WRITE_WORDS } from 'objects';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import { yoursOrRefused } from '../yours/yours.ts';
import { templatedTreeOf } from '../factory/door/factories.store.ts';
import type { Command, Served } from '../command/entry.verb.ts';
import type { AgentPlace, AgentReading } from '../roster/roster.ts';
import { agentRead } from '../roster/roster.store.ts';
import { tryAgent } from '../try/try.verb.ts';
import type { AgentDraft } from './agents.ts';
import type { AgentSidecar, AgentWritten } from './agents.store.ts';
import { AgentDoor, type AgentRemoved } from './agent-door.store.ts';
import { AgentName } from './agents.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { AGENTS_COPY } from '../sources/copy.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's agents take no ${arg}.`,
});

/** The place an agent is read from, and its name, as the api's path names them. */
const PLACE_AND_NAME: readonly Positional[] = [
  { key: 'from', takes: 'required', kind: 'name' },
  { key: 'name', takes: 'required', kind: 'name' },
];

/** What `nemia agents`' handler takes: the repository whose agents it lists beside yours, `.` where none is named. */
export const AgentsInput = Schema.Struct({ repo: Schema.optionalKey(Schema.String) });
export type AgentsInput = typeof AgentsInput.Type;

/** What `nemia agents card`'s handler takes: the agent's name, the repository it is looked for in, and the place it is read from. */
export const AgentCardInput = Schema.Struct({
  name: Schema.String,
  repo: Schema.optionalKey(Schema.String),
  from: Schema.optionalKey(Schema.Literals(['repo', 'yours'])),
});
export type AgentCardInput = typeof AgentCardInput.Type;

/** An agent's draft as the writer hands it, read by the command line off its file and built by the api from the Agent's spec. */
const AgentDraftValue = Schema.declare(
  (u: unknown): u is AgentDraft => typeof u === 'object' && u !== null && typeof (u as { name?: unknown }).name === 'string',
);

/**
 * What `nemia agents write`'s handler takes: the place it writes (`from`, `yours` or `factory`, and the `factory` whose tree), the agent's
 * name on the path where it changes or renames one (`name`), the repository it is judged on (`repo`), the `version` it was read at, its
 * `draft`, and the result schema its `output:` names (`schema`, null for none).
 */
export const AgentWriteInput = Schema.Struct({
  from: Schema.String,
  name: Schema.optionalKey(Schema.String),
  factory: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
  version: Schema.optionalKey(Schema.String),
  draft: AgentDraftValue,
  schema: Schema.optionalKey(Schema.NullOr(Schema.Struct({ file: Schema.String, text: Schema.String }))),
});
export type AgentWriteInput = typeof AgentWriteInput.Type;

/** What `nemia agents rm`'s handler takes: the place (`yours`), the agent's name, the `version` it was read at, and the repository. */
export const AgentRemoveInput = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  version: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
});
export type AgentRemoveInput = typeof AgentRemoveInput.Type;

/**
 * What `nemia agents run`'s handler takes: the place (`yours`), the agent's name, its brief — none left for `tryAgent` to refuse in its
 * words — and the repository it is tried on.
 */
export const AgentTryInput = Schema.Struct({
  from: Schema.String,
  name: Schema.String,
  brief: Schema.optionalKey(Schema.String),
  repo: Schema.optionalKey(Schema.String),
});
export type AgentTryInput = typeof AgentTryInput.Type;

/**
 * An agent of yours written through the Agent door (`AgentDoor`, run at the store's root (`StoreRoot`) its handler is given): `draft`, the
 * agent as JSON text, which the command line reads off `--file`; `schema`, the result schema its `output:` names as JSON text, read
 * beside that file; `version`, what the agent was read at, none for a new one; and the agent's name on the path (`name`), the one it is
 * renamed from — none given for the agent of the draft's own name with no version, a new one. Written to the tree of the factory
 * `--factory` names for the place `factory`. Refused, as `Invalid`, for a place but those two (`yoursOrRefused`).
 */
export const AGENTS_WRITE: Command<AgentWritten, AgentWriteInput> = {
  ...AGENTS_WRITE_WORDS,
  input: AgentWriteInput,
  handler: ({ from, name, factory, version, draft, schema, ...given }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const tree = (named: string) => templatedTreeOf(root, named, 'nemia agents write');
      const repo = yield* tried(() => (from === 'factory' && factory !== undefined ? tree(factory) : given.repo));
      const dir = yield* tried(() =>
        yoursOrRefused('nemia agents write', 'agents', from, name ?? null, repo ?? '', root, { factory, treeOf: tree }),
      );
      const sidecar: AgentSidecar | null | undefined = schema;
      const door = yield* AgentDoor;
      return yield* door.agents.write(AgentName.read(name ?? draft.name), draft, version, {
        dir,
        ...(sidecar !== undefined && { schema: sidecar }),
        ...(repo !== undefined && { repo }),
      });
    }),
  print: () => [],
};

/** An agent of yours removed through the Agent door, against the `version` it was read at, which a removal without it names. */
export const AGENTS_REMOVE: Served<AgentRemoved, AgentRemoveInput> = {
  ...AGENTS_RM_WORDS,
  input: AgentRemoveInput,
  handler: ({ from, name, version, repo }) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const dir = yield* tried(() => yoursOrRefused('nemia agents rm', 'agents', from, name, repo ?? '', root));
      const door = yield* AgentDoor;
      return yield* door.agents.remove(AgentName.read(name), version, { dir, ...(repo !== undefined && { repo }) });
    }),
};

/**
 * An agent of yours tried on a short brief (`tryAgent`): its try's folder written and a run of it started with no repository, as any
 * folder team's is; a tick files it. Refused before anything is written, as `tryAgent` says.
 */
export const AGENTS_TRY: Served<{ id: string }, AgentTryInput> = {
  ...AGENTS_RUN_WORDS,
  input: AgentTryInput,
  handler: ({ from, name, brief = '', repo = '' }) =>
    Effect.flatMap(StoreRoot, (home) => tryAgent({ who: 'nemia agents run', from, name, brief, repo, home })),
};

/**
 * One agent of the agents folder the api resolved (`dir`), its skills found as a start on `repo` finds them (`agent`), or null where the
 * folder has no file of its name.
 */
export const AGENTS_READ: Command<{ agent: AgentReading | null }> = {
  name: 'agents read',
  served: [{ endpoint: 'agents.get' }],
  usage: '<from> <name>',
  help: ['one agent, read for its page'],
  spec: apiSpec(PLACE_AND_NAME, ['dir', 'repo']),
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: "the board's agent page reads one agent with its versions and users; at the command line, nemia agents lists them",
  },
  handler: (args) =>
    Effect.gen(function* () {
      const root = yield* StoreRoot;
      const agent = yield* agentRead(textOf(args, 'from') as AgentPlace, textOf(args, 'dir') ?? '', textOf(args, 'name') ?? '', {
        repo: textOf(args, 'repo') ?? '',
        home: root,
      });
      return { agent };
    }),
  print: () => [],
};

/** The board's agent library entries, in the order the table lists them. */
export const LIBRARY_ENTRIES: readonly (Command | Served)[] = [
  AGENTS_WRITE,
  AGENTS_COPY,
  AGENTS_REMOVE,
  AGENTS_TRY,
  AGENTS_READ,
] as readonly (Command | Served)[];
