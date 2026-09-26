/**
 * The skills an agent of yours can be given, a skill HKB ships copied into your library, one skill on its page, and one of yours written on the
 * board (apps/api/src/skills.ts).
 */
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

/**
 * Mirrors `SkillDraft` in the package: a skill as it is written — its name (its folder), a human title, what it does, its card's tags and
 * examples, whether it is loaded every turn, and its instructions. Left out, `preload` keeps the line the file has.
 */
export type SkillDraft = {
  name: string;
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  examples?: string[] | null;
  preload?: boolean;
  body: string;
};

/** Mirrors `SkillUser`: an agent that gives a skill, by its place and its name. */
export type SkillUser = { from: 'yours' | 'repo'; name: string };

/**
 * Mirrors `SkillDetail`: one skill on its page — its row, the version a write carries back, its draft (null where its SKILL.md does not read,
 * `body` its instructions all the same), the agents of either place that give this very folder, and the `cp -r` that moves it to the other place.
 */
export type SkillDetail = { skill: SkillRow; version: string; draft: SkillDraft | null; body: string; users: SkillUser[]; copyHint: string | null };

/** Mirrors `SkillSaved`: a skill written, as its page now reads it. */
export type SkillSaved = SkillDetail & { written: string[] };

/** One skill, read from disk now: its page's read. Under `skillsQuery`'s key, so a write that reads the list again reads it again too. */
export const skillQuery = (from: string, name: string) =>
  queryOptions({
    queryKey: ['skills', from, name],
    queryFn: () => get<SkillDetail>(`/api/skills/${encodeURIComponent(from)}/${encodeURIComponent(name)}`),
  });

async function written(method: 'POST' | 'PUT', url: string, body: unknown): Promise<SkillSaved> {
  const res = await fetch(url, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer) return answer as SkillSaved;
  throw new SkillRefusal(typeof answer?.error === 'string' ? answer.error : `${method} ${url} answered ${res.status} ${res.statusText}`, res.status);
}

/** A new skill of yours, written in your library: refused, in the package's words, for a name it has already or a draft the card reader refuses. */
export const createSkill = (draft: SkillDraft): Promise<SkillSaved> => written('POST', '/api/skills/yours', { skill: draft });

/** A skill of yours written again, whole, at the version it was read at: refused 409 when it has changed since. */
export const saveSkill = (name: string, version: string, draft: SkillDraft): Promise<SkillSaved> =>
  written('PUT', `/api/skills/yours/${encodeURIComponent(name)}`, { version, skill: draft });

/** A skill of yours loaded every turn, or named for a session to load: its `preload:` line alone, at the version it was read at. */
export const switchPreload = (name: string, version: string, preload: boolean): Promise<SkillSaved> =>
  written('PUT', `/api/skills/yours/${encodeURIComponent(name)}`, { version, preload });
