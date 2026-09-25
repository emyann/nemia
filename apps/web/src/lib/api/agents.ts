/** The agents, and the writes of one of yours (apps/api/src/agents.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { SchemaFile } from './builder.ts';

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
 * Mirrors `ListedSkills` in apps/api/src/agents.ts: the file an agent's `skills:` names, its text as the form edits it, and the skills the
 * package read out of it — null where the file does not read, and the listing's `error` says why.
 */
export type SkillsFile = { file: string; text: string; list: AgentSkill[] | null };

/** The keys an agent sets on the steps that name it: every agent key but its description. Mirrors `RoleKey` in the package. */
export type AgentRoleKey = 'harness' | 'model' | 'effort' | 'context' | 'permissionMode' | 'sandbox' | 'tools' | 'disallowedTools' | 'allowedTools' | 'remote' | 'output';

/** Mirrors `AgentUser` in apps/api/src/agents.ts: a node that names an agent, the step of a workflow in the agent's own place. */
export type AgentUser = { from: 'repo' | 'yours'; workflow: string; step: string };

/**
 * Mirrors `AgentListing` in apps/api/src/agents.ts: one agent — its keys as its file writes them, its instructions, the result schema its
 * `output:` names and the skills its `skills:` names, its file as written, the version a write carries, the nodes that name it, and the
 * parser's refusal of a file that does not read.
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
  skills: SkillsFile | null;
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
export const agentQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['agents', from, name],
    queryFn: () => get<AgentListing>(`/api/agents/${encodeURIComponent(from)}/${encodeURIComponent(name)}`),
  });

/**
 * An agent as a write sends it: its name, description, the skills file it names — null for none — the role keys it sets, one unset as null,
 * its instructions, and a result schema or a skills file pasted for it. `skills` is the agent's own line, as `description` is; `skillsText`
 * is what that file holds, and travels only when it changed.
 */
export type AgentDraft = {
  name: string;
  description: string | null;
  skills: string | null;
  keys: Partial<Record<AgentRoleKey, string | null>>;
  body: string;
  schema?: SchemaFile;
  skillsText?: string;
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
