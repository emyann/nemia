/**
 * The agents as the board reads them — the Agent objects of the default namespace (`objects.ts`), each seen as an `AgentListing` — the
 * writes of one of yours through the Agent object, and your custom instructions for one (apps/api/src/custom/custom.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import type { Agent, AgentSpec, DefinitionOrigin } from 'objects';
import { decodes } from './decodes.ts';
import { get, send } from './read.ts';
import { agents as served, type Refuse } from './objects.ts';
import { cardEntryOf, originWord, type AgentSkill, type GivenSkill, type SchemaFile } from './library.ts';
import type { PagePlace } from './workflows.ts';

/** The namespace of the api's repository and your library, where the board writes yours. */
const DEFAULT = 'default';

/**
 * The keys an agent sets on the steps that name it: every agent key but what describes the agent itself — its description, the skills its
 * sessions are given and its harness prompt (`AGENT_OWN_KEYS`). Mirrors `RoleKey` in the package.
 */
export type AgentRoleKey =
  | 'harness'
  | 'model'
  | 'effort'
  | 'context'
  | 'permissionMode'
  | 'sandbox'
  | 'tools'
  | 'disallowedTools'
  | 'allowedTools'
  | 'remote'
  | 'output';

/** Every role key, in its order. */
const ROLE_KEYS: readonly AgentRoleKey[] = [
  'harness',
  'model',
  'effort',
  'context',
  'permissionMode',
  'sandbox',
  'tools',
  'disallowedTools',
  'allowedTools',
  'remote',
  'output',
];

/** A node that names an agent: the step of a workflow in the agent's own place. */
export type AgentUser = { from: 'repo' | 'yours'; workflow: string; step: string };

/**
 * An agent as the board reads it, off its Agent object: its keys as its file writes them, its instructions, the result schema its
 * `output:` names, what it says it can do — its card's skills, generated from the skills it gives (one entry each, read off each SKILL.md,
 * or one made from its description when it gives none), null with `cardError` saying why where none can be made — the skills its sessions
 * are given and its harness prompt as its lines write them (null for none), its file as written, the version a write carries, the nodes
 * that name it, and the parser's refusal of a file that does not read. `from` is where it is read from (`status.origin`).
 */
export type AgentListing = {
  name: string;
  from: DefinitionOrigin;
  dir: string;
  file: string;
  /** The job it holds, as its `role:` line writes it: `Product engineer`; null for none. */
  role: string | null;
  description: string | null;
  keys: Partial<Record<AgentRoleKey, string>>;
  body: string;
  schema: SchemaFile | null;
  card: AgentSkill[] | null;
  /** Why no card can be made — a skill no folder has, a SKILL.md with no description, an agent with none — or null. */
  cardError: string | null;
  /** The skills its sessions are given, as its `skills:` line writes them: `review-a-change, write-a-note`. */
  skills: string | null;
  /** What becomes of Claude Code's own prompt: `keep`, `no-coding` or `replace`, as the api reads it; null for none, which is `keep`. */
  harnessPrompt: string | null;
  /** The MCP servers its sessions load, as its `mcp:` line writes them: `playwright, docs`. Null where it names none. */
  mcp: string | null;
  /** The skills it gives, one row each in its order: where a start finds it and what it costs a turn, or why none is found. */
  given: GivenSkill[];
  source: string;
  /** What its file held when it was read (its `metadata.resourceVersion`): a write carries it back. */
  version: string;
  usedBy: AgentUser[];
  error: string | null;
  /**
   * Why it cannot be tried from the board — the repository's, a name a try's folder cannot take, a harness the try's Claude Code fence does
   * not reach, `remote: true` — and the command that copies it to yours when that is the fix, in the store the api reads; null when nothing
   * does.
   */
  untried: { why: string; copy: string | null } | null;
};

/** An agent's listing, as the Agents page reads it, and the names of the factories it fills a step in, sorted; never the default one. */
export type LibraryAgent = AgentListing & { factories: string[] };

/** The role keys an agent's `spec.keys` sets, each as its file writes it; one unset left out. */
const roleKeysOf = (keys: AgentSpec['keys']): Partial<Record<AgentRoleKey, string>> =>
  Object.fromEntries(ROLE_KEYS.flatMap((key) => (typeof keys?.[key] === 'string' ? [[key, keys[key]]] : [])));

/** An Agent, as the board reads it (`LibraryAgent`, an `AgentListing` with the factories it fills a step in). */
export const agentViewOf = (agent: Agent): LibraryAgent => {
  const { spec, status } = agent;
  return {
    name: agent.metadata.name,
    from: status.origin,
    dir: status.dir,
    file: status.file,
    role: spec.role ?? null,
    description: spec.description ?? null,
    keys: roleKeysOf(spec.keys),
    body: spec.instructions ?? '',
    schema: spec.output ? { ...spec.output } : null,
    card: status.card ? status.card.map(cardEntryOf) : null,
    cardError: status.cardError,
    skills: spec.skills ?? null,
    harnessPrompt: spec.harnessPrompt ?? null,
    mcp: spec.mcp ?? null,
    given: status.given.map((g) => ({ ...g, entry: g.entry ? cardEntryOf(g.entry) : null, cost: g.cost ? { ...g.cost } : null })),
    source: status.source,
    version: agent.metadata.resourceVersion,
    usedBy: status.usedBy.map((u) => ({ ...u })),
    error: status.error,
    untried: status.untried ? { ...status.untried } : null,
    factories: [...status.factories],
  };
};

/** The origins the Agents page reads, each listed whole, shadowed or not: the repository's, then yours. */
const LISTED: readonly DefinitionOrigin[] = ['repo', 'yours'];

/** Every agent of the repository's and of yours, with the factories each fills a step in, read from disk on each request. */
export const agentsQuery = queryOptions({
  queryKey: ['agents'],
  queryFn: async (): Promise<LibraryAgent[]> =>
    (await Promise.all(LISTED.map((origin) => served.list(DEFAULT, { origin })))).flat().map(agentViewOf),
});

/**
 * One agent, read from disk now, from the origin `from`, in `place`'s factory on its repository (none: the default namespace):
 * `agentQuery`'s read, for a page that must read it past the cache.
 */
export const readAgent = async (from: string, name: string, place: PagePlace = {}): Promise<AgentListing> =>
  agentViewOf(await served.get(place.factory ?? DEFAULT, name, { origin: originWord(from), ...(place.repo ? { repo: place.repo } : {}) }));

/** One agent, for its page, read in `place` (a factory's own agent is read in its factory alone). */
export const agentQuery = (from: string, name: string, place: PagePlace = {}) =>
  queryOptions({
    queryKey: place.factory ? ['agents', from, name, place.factory, place.repo ?? null] : ['agents', from, name],
    queryFn: () => readAgent(from, name, place),
  });

/**
 * An agent as a write sends it: its name, description, the skills it gives and its harness prompt — each null for none — the role keys it
 * sets, one unset as null, its instructions, and a result schema pasted for it. `skills`, `harnessPrompt` and `mcp` are the agent's
 * own lines, as `description` is. Its card is generated from its skills, and nothing sends it.
 */
export type AgentDraft = {
  name: string;
  role: string | null;
  description: string | null;
  skills: string | null;
  harnessPrompt: string | null;
  mcp: string | null;
  keys: Partial<Record<AgentRoleKey, string | null>>;
  body: string;
  schema?: SchemaFile;
};

/** A draft as the Agent object's spec says it: its `output` the schema pasted, left out where none is, so the file keeps its own. */
const specOfDraft = (draft: AgentDraft): AgentSpec => ({
  role: draft.role,
  description: draft.description,
  keys: Object.fromEntries(Object.entries(draft.keys).filter((entry): entry is [string, string | null] => entry[1] !== undefined)),
  skills: draft.skills,
  harnessPrompt: draft.harnessPrompt,
  mcp: draft.mcp,
  ...(draft.schema ? { output: draft.schema } : {}),
  instructions: draft.body,
});

/** An agent written: the agent as it now reads. */
export type AgentSaved = { agent: AgentListing };

/**
 * A write of an agent the api refused: the package's sentence, the nodes that still name the agent when that is why, and the api's status —
 * 404 for an agent gone, 409 for one changed since it was read, a name taken, or an agent still named. Null for no answer.
 */
export class AgentRefusal extends Error {
  readonly users: string[];
  readonly status: number | null;
  constructor(message: string, users: readonly string[], status: number | null = null) {
    super(message);
    this.users = [...users];
    this.status = status;
  }
}

/** The nodes a refusal of an agent's write names: its `users`, none where it names none. */
const UsersNamed = Schema.Struct({ users: Schema.Array(Schema.String) });

/** How an agent's write is refused: an `AgentRefusal` in the api's words, with the nodes it names and its status. */
const refused: Refuse = (words, status, answer) =>
  new AgentRefusal(
    words,
    Option.match(Schema.decodeUnknownOption(UsersNamed)(answer), { onNone: () => [], onSome: (u) => u.users }),
    status,
  );

/** Make an agent of yours. Rejects with an `AgentRefusal`: a name taken, or a key or value the package refuses. */
export const createAgent = async (draft: AgentDraft): Promise<AgentSaved> => ({
  agent: agentViewOf(await served.create(DEFAULT, { metadata: { name: draft.name }, spec: specOfDraft(draft) }, refused)),
});

/** Put an agent of yours back — renamed, when the draft names it otherwise — against the version it was read at. */
export const saveAgent = async (name: string, version: string, draft: AgentDraft): Promise<AgentSaved> => ({
  agent: agentViewOf(
    await served.replace(DEFAULT, name, { metadata: { name: draft.name, resourceVersion: version }, spec: specOfDraft(draft) }, refused),
  ),
});

/** Remove an agent of yours, against the version it was read at: refused while a node still names it, saying which. */
export const removeAgent = async (name: string, version: string): Promise<AgentListing> =>
  agentViewOf(await served.delete(DEFAULT, name, version, refused));

/** The run a try started, which its page follows. */
export type AgentTried = { id: string };

/**
 * Try an agent of yours on a short brief: a one-step folder run of it, fenced to its folder with a dollar to spend. Rejects with an
 * `AgentRefusal`: an empty brief, a try of it still running, an agent that does not read or gives a skill only the repository has.
 */
export const tryAgent = async (name: string, brief: string): Promise<AgentTried> => ({
  id: (await served.try(DEFAULT, name, brief, refused)).id,
});

/**
 * Mirrors `CustomInstructionsAnswer` in apps/api/src/custom/custom.ts: a person's custom instructions for the agent `name`, the file in
 * your store they are kept in, the words (null for none), and the package's refusal of a file there that does not read (null when it
 * reads).
 */
export type CustomInstructions = { name: string; file: string; words: string | null; error: string | null };

/** Decodes a `CustomInstructions`. */
const CustomInstructionsSchema = decodes<CustomInstructions>()(
  Schema.Struct({
    name: Schema.String,
    file: Schema.String,
    words: Schema.NullOr(Schema.String),
    error: Schema.NullOr(Schema.String),
  }),
);

/** Mirrors `CustomInstructionsCleared` in apps/api/src/custom/custom.ts: the file a clear looked at, and whether it removed words. */
export type CustomInstructionsCleared = { name: string; file: string; removed: boolean };

/** Decodes a `CustomInstructionsCleared`. */
const CustomInstructionsClearedSchema = decodes<CustomInstructionsCleared>()(
  Schema.Struct({
    name: Schema.String,
    file: Schema.String,
    removed: Schema.Boolean,
  }),
);

/** The route of an agent's custom instructions, by its name. */
const customRoute = (name: string): string => `/api/custom-instructions/${encodeURIComponent(name)}`;

/** A person's custom instructions for the agent `name`, read from the store on each request. */
export const customInstructionsQuery = (name: string) =>
  queryOptions({
    queryKey: ['custom-instructions', name],
    queryFn: () => get(customRoute(name), CustomInstructionsSchema),
  });

/** What a write of custom instructions may have done, and what to look at before writing them again. */
const CUSTOM_WRITTEN = "The words may be written: read the agent's page again before saving again.";

/**
 * Write `words` as the custom instructions for the agent `name`: the words as they now read. Rejects with a `WriteRefusal` in the
 * package's words: a name no place has (404), blank words or a frontmatter block (422).
 */
export const writeCustomInstructions = (name: string, words: string): Promise<CustomInstructions> =>
  send('PUT', customRoute(name), CustomInstructionsSchema, { body: { words }, may: CUSTOM_WRITTEN });

/** Remove the custom instructions for the agent `name`: whether there were any. Rejects with a `WriteRefusal` for a name no place has. */
export const clearCustomInstructions = (name: string): Promise<CustomInstructionsCleared> =>
  send('DELETE', customRoute(name), CustomInstructionsClearedSchema, { body: {}, may: CUSTOM_WRITTEN });
