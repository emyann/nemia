/** The agents, and the writes of one of yours (apps/api/src/agents.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { SchemaFile } from './builder.ts';
import type { GivenSkill } from './skills.ts';

/**
 * Mirrors `AgentSkill` in the package: one thing an agent says it can do, in the A2A protocol's words — `id`, `name`, `description` and
 * `tags` are REQUIRED there and here, and the rest are written only where they say something the card does not already say.
 */
export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

/**
 * The keys an agent sets on the steps that name it: every agent key but what describes the agent itself — its description, the skills its
 * sessions are given and its system prompt (`AGENT_OWN_KEYS`). Mirrors `RoleKey` in the package.
 */
export type AgentRoleKey = 'harness' | 'model' | 'effort' | 'context' | 'permissionMode' | 'sandbox' | 'tools' | 'disallowedTools' | 'allowedTools' | 'remote' | 'output';

/** Mirrors `AgentUser` in apps/api/src/agents.ts: a node that names an agent, the step of a workflow in the agent's own place. */
export type AgentUser = { from: 'repo' | 'yours'; workflow: string; step: string };

/**
 * Mirrors `AgentListing` in apps/api/src/agents.ts: one agent — its keys as its file writes them, its instructions, the result schema its
 * `output:` names, what it says it can do — its card's skills, generated from the skills it gives (one entry each, read off each SKILL.md,
 * or one made from its description when it gives none), null with `cardError` saying why where none can be made — the skills its sessions
 * are given and its system prompt as its lines write them (null for none), its file as written, the version a write carries, the nodes that name it, and the parser's refusal of a file that does not read.
 */
export type AgentListing = {
  name: string;
  from: 'repo' | 'yours';
  dir: string;
  file: string;
  description: string | null;
  keys: Partial<Record<AgentRoleKey, string>>;
  body: string;
  schema: SchemaFile | null;
  card: AgentSkill[] | null;
  /** Why no card can be made — a skill no folder has, a SKILL.md with no description, an agent with none — or null. */
  cardError: string | null;
  /** The skills its sessions are given, as its `skills:` line writes them: `review-a-change, write-a-note`. */
  skills: string | null;
  /** `default`, `no-coding` or `own`, as written; null for none, which is `default`. */
  systemPrompt: string | null;
  /** The skills it gives, one row each in its order: where a start finds it and what it costs a turn, or why none is found. */
  given: GivenSkill[];
  source: string;
  version: string;
  usedBy: AgentUser[];
  error: string | null;
};

/** Every agent of the repository's and of yours, read from disk on each request. */
export const agentsQuery = queryOptions({
  queryKey: ['agents'],
  queryFn: () => get<AgentListing[]>('/api/agents'),
});

/** One agent, for its page. */
/** One agent, read from disk now: `agentQuery`'s read, for a page that must read it past the cache. */
export const readAgent = (from: string, name: string): Promise<AgentListing> =>
  get<AgentListing>(`/api/agents/${encodeURIComponent(from)}/${encodeURIComponent(name)}`);

export const agentQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['agents', from, name],
    queryFn: () => readAgent(from, name),
  });

/**
 * An agent as a write sends it: its name, description, the skills it gives and its system prompt — each null for none — the role keys it
 * sets, one unset as null, its instructions, and a result schema pasted for it. `skills` and `systemPrompt` are the agent's own lines, as
 * `description` is. Its card is generated from its skills, and nothing sends it.
 */
export type AgentDraft = {
  name: string;
  description: string | null;
  skills: string | null;
  systemPrompt: string | null;
  keys: Partial<Record<AgentRoleKey, string | null>>;
  body: string;
  schema?: SchemaFile;
};

/** Mirrors `AgentSaved` in apps/api/src/agents.ts: the agent as it now reads, and its files by name. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

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

async function agentWrite<T>(method: 'POST' | 'PUT' | 'DELETE', route: string, body: unknown): Promise<T> {
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer) return answer as T;
  const users = Array.isArray(answer?.users) ? answer.users.filter((s): s is string => typeof s === 'string') : [];
  throw new AgentRefusal(typeof answer?.error === 'string' ? answer.error : `${method} ${route} answered ${res.status} ${res.statusText}`, users, res.status);
}

/** Make an agent of yours. Rejects with an `AgentRefusal`: a name taken, or a key or value the package refuses. */
export const createAgent = (draft: AgentDraft): Promise<AgentSaved> => agentWrite('POST', '/api/agents/yours', draft);

/** Put an agent of yours back — renamed, when the draft names it otherwise — against the version it was read at. */
export const saveAgent = (name: string, version: string, draft: AgentDraft): Promise<AgentSaved> =>
  agentWrite('PUT', `/api/agents/yours/${encodeURIComponent(name)}`, { ...draft, version });

/** Remove an agent of yours, against the version it was read at: refused while a node still names it, saying which. */
export const removeAgent = (name: string, version: string): Promise<{ removed: string[] }> =>
  agentWrite('DELETE', `/api/agents/yours/${encodeURIComponent(name)}`, { version });

/** Mirrors `AgentTried` in apps/api/src/agents.ts: the run a try started, which its page follows. */
export type AgentTried = { id: string };

/**
 * Try an agent of yours on a short brief: a one-step folder run of it, fenced to its folder with a dollar to spend. Rejects with an
 * `AgentRefusal`: an empty brief, a try of it still running, an agent that does not read or gives a skill only the repository has.
 */
export const tryAgent = (name: string, brief: string): Promise<AgentTried> => agentWrite('POST', `/api/agents/yours/${encodeURIComponent(name)}/try`, { brief });
