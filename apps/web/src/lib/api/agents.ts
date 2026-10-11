/** The agents, and the writes of one of yours (apps/api/src/agents/agents.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import { get, send, type SendHow } from './read.ts';
import { AgentSkillSchema, GivenSkillSchema, SchemaFileSchema, type AgentSkill, type GivenSkill, type SchemaFile } from './library.ts';

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

/** Decodes an agent's role keys as its file writes them, each only where it sets it. */
const RoleKeysSchema = Schema.Struct({
  harness: Schema.optionalKey(Schema.String),
  model: Schema.optionalKey(Schema.String),
  effort: Schema.optionalKey(Schema.String),
  context: Schema.optionalKey(Schema.String),
  permissionMode: Schema.optionalKey(Schema.String),
  sandbox: Schema.optionalKey(Schema.String),
  tools: Schema.optionalKey(Schema.String),
  disallowedTools: Schema.optionalKey(Schema.String),
  allowedTools: Schema.optionalKey(Schema.String),
  remote: Schema.optionalKey(Schema.String),
  output: Schema.optionalKey(Schema.String),
}) satisfies Schema.Schema<Partial<Record<AgentRoleKey, string>>>;

/** Mirrors `AgentUser` in apps/api/src/agents/agents.ts: a node that names an agent, the step of a workflow in the agent's own place. */
export type AgentUser = { from: 'repo' | 'yours'; workflow: string; step: string };

/** Where an agent is read from: the repository's, or yours. */
const AgentPlaceSchema = Schema.Literals(['repo', 'yours']);

/** Decodes an `AgentUser`. */
const AgentUserSchema = Schema.Struct({
  from: AgentPlaceSchema,
  workflow: Schema.String,
  step: Schema.String,
}) satisfies Schema.Schema<AgentUser>;

/**
 * Mirrors `AgentListing` in apps/api/src/agents/agents.ts: one agent — its keys as its file writes them, its instructions, the result
 * schema its `output:` names, what it says it can do — its card's skills, generated from the skills it gives (one entry each, read off each
 * SKILL.md, or one made from its description when it gives none), null with `cardError` saying why where none can be made — the skills its
 * sessions are given and its harness prompt as its lines write them (null for none), its file as written, the version a write carries, the
 * nodes that name it, and the parser's refusal of a file that does not read.
 */
export type AgentListing = {
  name: string;
  from: 'repo' | 'yours';
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
  version: string;
  usedBy: AgentUser[];
  error: string | null;
  /**
   * Why it cannot be tried from the board — the repository's, a name a try's folder cannot take, a harness the try's Claude Code fence does
   * not reach, `remote: true` — and the command that copies it to yours when that is the fix, in the store the api reads; null when nothing
   * does. Mirrors `Untried` in apps/api/src/agents/try.ts, whose words the try's route refuses with.
   */
  untried: { why: string; copy: string | null } | null;
};

/** Decodes an `AgentListing`: each key the board reads, of its type and words; a key it does not know is dropped. */
const AgentListingSchema = Schema.Struct({
  name: Schema.String,
  from: AgentPlaceSchema,
  dir: Schema.String,
  file: Schema.String,
  role: Schema.NullOr(Schema.String),
  description: Schema.NullOr(Schema.String),
  keys: RoleKeysSchema,
  body: Schema.String,
  schema: Schema.NullOr(SchemaFileSchema),
  card: Schema.NullOr(Schema.mutable(Schema.Array(AgentSkillSchema))),
  cardError: Schema.NullOr(Schema.String),
  skills: Schema.NullOr(Schema.String),
  harnessPrompt: Schema.NullOr(Schema.String),
  mcp: Schema.NullOr(Schema.String),
  given: Schema.mutable(Schema.Array(GivenSkillSchema)),
  source: Schema.String,
  version: Schema.String,
  usedBy: Schema.mutable(Schema.Array(AgentUserSchema)),
  error: Schema.NullOr(Schema.String),
  untried: Schema.NullOr(Schema.Struct({ why: Schema.String, copy: Schema.NullOr(Schema.String) })),
}) satisfies Schema.Schema<AgentListing>;

/**
 * Mirrors `LibraryAgent` in apps/api/src/agents/agents.ts, as the Agents page reads it: an agent's listing, and the names of the factories
 * it fills a step in, sorted; the default factory is never one of them.
 */
export type LibraryAgent = AgentListing & { factories: string[] };

/** Decodes a `LibraryAgent`: an `AgentListing` and its factories. */
const LibraryAgentSchema = Schema.Struct({
  ...AgentListingSchema.fields,
  factories: Schema.mutable(Schema.Array(Schema.String)),
}) satisfies Schema.Schema<LibraryAgent>;

/** Every agent of the repository's and of yours, with the factories each fills a step in, read from disk on each request. */
export const agentsQuery = queryOptions({
  queryKey: ['agents'],
  queryFn: () => get('/api/agents', Schema.mutable(Schema.Array(LibraryAgentSchema))),
});

/** One agent, read from disk now: `agentQuery`'s read, for a page that must read it past the cache. */
export const readAgent = (from: string, name: string): Promise<AgentListing> =>
  get(`/api/agents/${encodeURIComponent(from)}/${encodeURIComponent(name)}`, AgentListingSchema);

/** One agent, for its page. */
export const agentQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['agents', from, name],
    queryFn: () => readAgent(from, name),
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

/** Mirrors `AgentSaved` in apps/api/src/agents/agents.ts: the agent as it now reads, and its files by name. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const Strings = Schema.mutable(Schema.Array(Schema.String));

/** Decodes an `AgentSaved`. */
const AgentSavedSchema = Schema.Struct({
  agent: AgentListingSchema,
  written: Strings,
  removed: Strings,
}) satisfies Schema.Schema<AgentSaved>;

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
const UsersNamed = Schema.Struct({ users: Strings });

/** How an agent's write is refused: an `AgentRefusal` in the api's words, with the nodes it names and its status. */
const refused: SendHow['refused'] = (words, status, answer) =>
  new AgentRefusal(
    words,
    Option.match(Schema.decodeUnknownOption(UsersNamed)(answer), { onNone: () => [], onSome: (u) => u.users }),
    status,
  );

/** What an agent's write may have done, and what to look at before writing it again. */
const WRITTEN = 'The agent may be written: read it again on its page before writing it again.';

/**
 * A write of an agent's, sent as `application/json` with `body`, its answer decoded with `schema`: rejected with an `AgentRefusal`, or an
 * `UnreadAnswer` saying `may`.
 */
const agentWrite = <T>(
  method: 'POST' | 'PUT' | 'DELETE',
  route: string,
  schema: Schema.Decoder<T>,
  body: unknown,
  may = WRITTEN,
): Promise<T> => send(method, route, schema, { body, may, refused });

/** Make an agent of yours. Rejects with an `AgentRefusal`: a name taken, or a key or value the package refuses. */
export const createAgent = (draft: AgentDraft): Promise<AgentSaved> => agentWrite('POST', '/api/agents/yours', AgentSavedSchema, draft);

/** Put an agent of yours back — renamed, when the draft names it otherwise — against the version it was read at. */
export const saveAgent = (name: string, version: string, draft: AgentDraft): Promise<AgentSaved> =>
  agentWrite('PUT', `/api/agents/yours/${encodeURIComponent(name)}`, AgentSavedSchema, { ...draft, version });

/** Remove an agent of yours, against the version it was read at: refused while a node still names it, saying which. */
export const removeAgent = (name: string, version: string): Promise<{ removed: string[] }> =>
  agentWrite('DELETE', `/api/agents/yours/${encodeURIComponent(name)}`, Schema.Struct({ removed: Strings }), { version });

/** What a try may have started, and where to look before trying the agent again. */
const TRIED = 'The try may have started: look on the Runs page before trying the agent again.';

/** Mirrors `AgentTried` in apps/api/src/agents/agents.ts: the run a try started, which its page follows. */
export type AgentTried = { id: string };

/** Decodes an `AgentTried`. */
const AgentTriedSchema = Schema.Struct({ id: Schema.String }) satisfies Schema.Schema<AgentTried>;

/**
 * Try an agent of yours on a short brief: a one-step folder run of it, fenced to its folder with a dollar to spend. Rejects with an
 * `AgentRefusal`: an empty brief, a try of it still running, an agent that does not read or gives a skill only the repository has.
 */
export const tryAgent = (name: string, brief: string): Promise<AgentTried> =>
  agentWrite('POST', `/api/agents/yours/${encodeURIComponent(name)}/try`, AgentTriedSchema, { brief }, TRIED);

/**
 * Mirrors `CustomInstructionsAnswer` in apps/api/src/custom/custom.ts: a person's custom instructions for the agent `name`, the file in
 * your store they are kept in, the words (null for none), and the package's refusal of a file there that does not read (null when it
 * reads).
 */
export type CustomInstructions = { name: string; file: string; words: string | null; error: string | null };

/** Decodes a `CustomInstructions`. */
const CustomInstructionsSchema = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  words: Schema.NullOr(Schema.String),
  error: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<CustomInstructions>;

/** Mirrors `CustomInstructionsCleared` in apps/api/src/custom/custom.ts: the file a clear looked at, and whether it removed words. */
export type CustomInstructionsCleared = { name: string; file: string; removed: boolean };

/** Decodes a `CustomInstructionsCleared`. */
const CustomInstructionsClearedSchema = Schema.Struct({
  name: Schema.String,
  file: Schema.String,
  removed: Schema.Boolean,
}) satisfies Schema.Schema<CustomInstructionsCleared>;

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
