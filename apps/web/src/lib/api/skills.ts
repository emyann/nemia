/** The skills an agent of yours can be given, and a skill HKB ships copied into your library (apps/api/src/skills.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { AgentSkill } from './agents.ts';

/** Where a skill is: your library (the store's `workflows/skills/`), the repository the board serves, or what HKB ships. */
export type SkillSource = 'yours' | 'repo' | 'shipped';

/**
 * Mirrors `SkillCost` in the package: what a skill costs a turn, about, at four characters a token. Named, a turn carries its listing (its
 * name and description); preloaded, its body too.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Mirrors `SkillRow` in apps/api/src/skills.ts: one skill as the picker lists it, its card entry or why no agent can be given it. */
export type SkillRow = {
  name: string;
  from: SkillSource;
  dir: string;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
  /** The agents of yours that give it. */
  usedBy: string[];
  /** A shipped skill's name, where an agent of yours already finds a skill of it; null elsewhere. */
  found: 'yours' | 'repo' | null;
};

/** Mirrors `SkillPlace`: one place, in the order an agent of yours finds a name, the shipped last. */
export type SkillPlace = { from: SkillSource; dir: string; skills: SkillRow[] };

/** Mirrors `GivenSkill`: a skill an agent gives, where a start finds it and what it costs — or why none is found (`from: null`). */
export type GivenSkill = { name: string; from: SkillSource | null; entry: AgentSkill | null; error: string | null; preload: boolean; cost: SkillCost | null };

/** Mirrors `SkillAdded`: the copied skill as it now reads in your library, and its files. */
export type SkillAdded = { skill: SkillRow; written: string[] };

/** Every skill the picker lists, by place, read from disk on each request. */
export const skillsQuery = queryOptions({
  queryKey: ['skills'],
  queryFn: () => get<SkillPlace[]>('/api/skills'),
});

/** A copy the api refused: its words, and its status — 404 for a skill HKB does not ship, 409 for a name your library has already. */
export class SkillRefusal extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.status = status;
  }
}

/** Copy the skill HKB ships under `name` into your library, a write of its own: an agent of yours can then be given it. */
export async function copySkill(name: string): Promise<SkillAdded> {
  const res = await fetch('/api/skills/yours', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ copy: name }) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer) return answer as SkillAdded;
  throw new SkillRefusal(typeof answer?.error === 'string' ? answer.error : `POST /api/skills/yours answered ${res.status} ${res.statusText}`, res.status);
}
