/**
 * The agents as the board reads them — the Agent objects of the default namespace (`objects.ts`), each seen as an `AgentListing` — the
 * writes of one of yours through the Agent object, and your custom instructions for one (apps/api/src/custom/custom.ts).
 */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import {
  AgentInstructions as AgentInstructionsAnswer,
  AgentInstructionsCleared as AgentInstructionsClearedAnswer,
  DEFAULT_NAMESPACE,
  type Agent,
  type AgentInstructions,
  type AgentList,
  type AgentSpec,
  type DefinitionOrigin,
} from 'objects';
import { agents as served, call, read, write, type Refuse } from './objects.ts';
import { namespaceOf } from './namespace.ts';
import { cardEntryOf, originWord, type AgentSkill, type GivenSkill, type SchemaFile } from './library.ts';
import type { PagePlace } from './workflows.ts';

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
export type AgentUser = { from: Extract<DefinitionOrigin, 'repo' | 'user'>; workflow: string; step: string };

/** A step an agent fills, hired or named by its own `agent:` line: read from either place, or from a factory's own tree (`factory`). */
export type AgentFill = { from: Extract<DefinitionOrigin, 'factory' | 'repo' | 'user'>; workflow: string; step: string; hired: boolean };

/**
 * An agent as the board reads it, off its Agent object: its keys as its file writes them, its instructions, the result schema its
 * `output:` names, what it says it can do — its card's skills, generated from the skills it gives (one entry each, read off each SKILL.md,
 * or one made from its description when it gives none), null with `cardError` saying why where none can be made — the skills its sessions
 * are given and its harness prompt as its lines write them (null for none), its file as written, the version a write carries, the nodes
 * that name it, the steps it fills in the factory read, and the parser's refusal of a file that does not read. `from` is where it is
 * read from (`status.origin`).
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
  fills: AgentFill[];
  error: string | null;
  /**
   * Why it cannot be tried from the board — the repository's, a name a try's folder cannot take, a harness the try's Claude Code fence does
   * not reach, `remote: true` — and the command that copies it to yours when that is the fix, in the store the api reads; null when nothing
   * does.
   */
  untried: { why: string; copy: string | null } | null;
};

/**
 * An agent's listing, as the Agents page reads it off its list, and the names of the factories it fills a step in, sorted; never the
 * default one. A list carries no file's content, so it has no instructions, result schema or file as written: `readAgent` reads those.
 */
export type LibraryAgent = Omit<AgentListing, 'body' | 'schema' | 'source'> & { factories: string[] };

/** The role keys an agent's `spec.keys` sets, each as its file writes it; one unset left out. */
const roleKeysOf = (keys: AgentSpec['keys']) =>
  Object.fromEntries(ROLE_KEYS.flatMap((key) => (typeof keys?.[key] === 'string' ? [[key, keys[key]]] : [])));

/**
 * An agent of a list, as the Agents page reads it (`LibraryAgent`): every field but its files' content, which a list does not carry.
 * @param agent The Agent the api's list serves.
 */
export const agentRowOf = (agent: AgentList['items'][number]) => {
  const { spec, status } = agent;
  return {
    name: agent.metadata.name,
    from: status.origin,
    dir: status.dir,
    file: status.file,
    role: spec.role ?? null,
    description: spec.description ?? null,
    keys: roleKeysOf(spec.keys),
    card: status.card ? status.card.map(cardEntryOf) : null,
    cardError: status.cardError,
    skills: spec.skills ?? null,
    harnessPrompt: spec.harnessPrompt ?? null,
    mcp: spec.mcp ?? null,
    given: status.given.map((g) => ({ ...g, entry: g.entry ? cardEntryOf(g.entry) : null, cost: g.cost ? { ...g.cost } : null })),
    version: agent.metadata.resourceVersion,
    usedBy: status.usedBy.map((u) => ({ ...u })),
    fills: status.fills.map((f) => ({ ...f })),
    error: status.error,
    untried: status.untried ? { ...status.untried } : null,
    factories: [...status.factories],
  } satisfies LibraryAgent;
};

/**
 * An Agent read alone, as its page reads it (an `AgentListing` with the factories it fills a step in): its row, its instructions, its
 * result schema and its file as written.
 * @param agent The Agent object a read of one serves.
 */
const agentViewOf = (agent: Agent) => ({
  ...agentRowOf(agent),
  body: agent.spec.instructions ?? '',
  schema: agent.spec.output ? { ...agent.spec.output } : null,
  source: agent.status.source,
});

/**
 * The origins the Agents page reads, each listed whole, shadowed or not: yours, the default namespace working on no repository and Nemia
 * shipping no agent.
 */
const LISTED: readonly DefinitionOrigin[] = ['user'];

/** Every agent of yours, with the factories each fills a step in, read from disk on each request. */
export const agentsQuery = queryOptions({
  queryKey: ['agents'],
  queryFn: async () => (await Promise.all(LISTED.map((origin) => served.list(DEFAULT_NAMESPACE, { origin })))).flat().map(agentRowOf),
});

/**
 * The factory `factory`'s own agents, the origin `factory` of its namespace — its template's and its tree's `agents/` folder — each
 * with the steps of its workflows that name it, read from disk on each request.
 * @param factory The factory's name.
 */
export const factoryAgentsQuery = (factory: string) =>
  queryOptions({
    queryKey: ['agents', 'factory', factory],
    queryFn: async () => (await served.list(namespaceOf(factory), { origin: 'factory' })).map(agentRowOf),
  });

/**
 * One agent, read from disk now, from the origin `from`, in `place`'s factory on its repository (none: the default namespace):
 * `agentQuery`'s read, for a page that must read it past the cache.
 * @param from The origin it is read from (`yours`, `repo`, `factory`); a word no origin has reads with none.
 * @param name The agent's name.
 * @param place The factory and repository it is read in; empty for the default namespace on no repository.
 */
export const readAgent = async (from: string, name: string, place: PagePlace = {}) =>
  agentViewOf(
    await served.get(namespaceOf(place.factory), name, { origin: originWord(from), ...(place.repo ? { repo: place.repo } : {}) }),
  );

/**
 * One agent, for its page, read in `place` (a factory's own agent is read in its factory alone).
 * @param from The origin it is read from, as `readAgent` takes it.
 * @param name The agent's name.
 * @param place The factory and repository it is read in; empty for the default namespace on no repository.
 */
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
const specOfDraft = (draft: AgentDraft) => ({
  role: draft.role,
  description: draft.description,
  keys: Object.fromEntries(Object.entries(draft.keys).filter((entry): entry is [string, string | null] => entry[1] !== undefined)),
  skills: draft.skills,
  harnessPrompt: draft.harnessPrompt,
  mcp: draft.mcp,
  ...(draft.schema ? { output: draft.schema } : {}),
  instructions: draft.body,
});

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

/**
 * Make an agent of yours. Rejects with an `AgentRefusal`: a name taken, or a key or value the package refuses.
 * @param draft The agent to make: its name, keys, instructions and schema.
 */
export const createAgent = async (draft: AgentDraft) => ({
  agent: agentViewOf(await served.create({ metadata: { name: draft.name }, spec: specOfDraft(draft) }, refused)),
});

/**
 * Put an agent of yours back — renamed, when the draft names it otherwise — against the version it was read at.
 * @param name The agent's name as it was read.
 * @param version The version it was read at (`AgentListing.version`).
 * @param draft What it now holds, its name included.
 */
export const saveAgent = async (name: string, version: string, draft: AgentDraft) => ({
  agent: agentViewOf(
    await served.replace(name, { metadata: { name: draft.name, resourceVersion: version }, spec: specOfDraft(draft) }, refused),
  ),
});

/**
 * Remove an agent of yours, against the version it was read at: refused while a node still names it, saying which.
 * @param name The agent's name.
 * @param version The version it was read at (`AgentListing.version`).
 */
export const removeAgent = async (name: string, version: string) => agentViewOf(await served.delete(name, version, refused));

/**
 * Try an agent of yours on a short brief: a one-step folder run of it, fenced to its folder with a dollar to spend. Rejects with an
 * `AgentRefusal`: an empty brief, a try of it still running, an agent that does not read or gives a skill only the repository has.
 * @param name The agent's name.
 * @param brief What the try asks of it, in a person's words.
 */
export const tryAgent = async (name: string, brief: string) => ({
  id: (await served.try(name, brief, refused)).id,
});

/** A person's custom instructions for an agent: the file they are kept in, their words (null for none), and why they do not read. */
export type CustomInstructions = AgentInstructions;

/** Nemia's own name: her custom instructions are hers (`/api/nemia/instructions`), every other agent's its name's. */
const NEMIA = 'nemia';

/**
 * A person's custom instructions for the agent `name`, read from the store on each request: Nemia's (`GET /api/nemia/instructions`), or
 * the record of an agent's name, read in `default` (`GET /api/namespaces/default/agents/:name/instructions`), the name looked for in yours
 * and, given `repo`, in that repository, which a factory works on (`?repo=`): the default namespace reads none of its own.
 * @param name The agent's name; `nemia` reads Nemia's own.
 * @param repo The repository its name is looked for in besides yours; undefined for yours alone.
 */
export const customInstructionsQuery = (name: string, repo?: string) =>
  queryOptions({
    queryKey: repo === undefined ? ['custom-instructions', name] : ['custom-instructions', name, repo],
    queryFn: () =>
      call(
        (c) =>
          name === NEMIA
            ? c.nemia.instructions()
            : c.agents.instructions({ params: { namespace: DEFAULT_NAMESPACE, name }, query: repoQuery(repo) }),
        read(AgentInstructionsAnswer),
      ),
  });

/** The repository an agent of a repository's name is looked for in, sent as `?repo=`; none for an agent of yours. */
const repoQuery = (repo: string | undefined) => (repo === undefined ? {} : { repo });

/** What a write of custom instructions may have done, and what to look at before writing them again. */
const CUSTOM_WRITTEN = "The words may be written: read the agent's page again before saving again.";

/**
 * Write `words` as the custom instructions for the agent `name`: the words as they now read. Rejects with a `WriteRefusal` in the
 * package's words: a name no place has (404), blank words or a frontmatter block (422). `repo`, as the read's.
 * @param name The agent's name; `nemia` writes Nemia's own.
 * @param words The custom instructions to write.
 * @param repo The repository its name is looked for in besides yours; undefined for yours alone.
 */
export const writeCustomInstructions = (name: string, words: string, repo?: string) =>
  call(
    (c) =>
      name === NEMIA
        ? c.nemia.writeInstructions({ payload: { words } })
        : c.agents.putInstructions({ params: { name }, query: repoQuery(repo), payload: { words } }),
    write(AgentInstructionsAnswer, CUSTOM_WRITTEN),
  );

/**
 * Remove the custom instructions for the agent `name`: whether there were any. Rejects with a `WriteRefusal` for a name no place has.
 * `repo`, as the read's.
 * @param name The agent's name; `nemia` clears Nemia's own.
 * @param repo The repository its name is looked for in besides yours; undefined for yours alone.
 */
export const clearCustomInstructions = (name: string, repo?: string) =>
  call(
    (c) => (name === NEMIA ? c.nemia.clearInstructions() : c.agents.deleteInstructions({ params: { name }, query: repoQuery(repo) })),
    write(AgentInstructionsClearedAnswer, CUSTOM_WRITTEN),
  );
