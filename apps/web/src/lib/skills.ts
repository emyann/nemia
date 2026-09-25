import type { GivenSkill, SkillCost, SkillPlace, SkillRow, SkillSource } from './api';

/** What each place of skills is called on the board. */
export const PLACE_LABELS: Readonly<Record<SkillSource, string>> = {
  yours: 'Your library',
  repo: 'This repository',
  shipped: 'Shipped with HKB',
};

/** A given skill's badge: where an agent of yours finds it. */
export const SOURCE_BADGES: Readonly<Record<SkillSource, string>> = {
  yours: 'your library',
  repo: 'this repository',
  shipped: 'shipped with HKB',
};

/**
 * What a turn carries of a skill, in words: named, its listing — its name and description, which the session reads to decide to load it —
 * and its body only in a turn that loads it; preloaded, the whole of it every turn, cached as the system prompt is.
 */
export function costWords(cost: SkillCost): string {
  if (cost.preload) return `loaded every turn — about ${cost.perTurn.toLocaleString('en')} tokens (cached)`;
  return `named — about ${cost.listed.toLocaleString('en')} tokens a turn, and about ${cost.body.toLocaleString('en')} more in a turn that loads it`;
}

/**
 * The skills the form gives, one row each in its order: where an agent of yours finds each now (`places`, the picker's list, read again after
 * a copy), else as the agent was read (`given`). A name found in neither is said to be missing once the list is read; before, it is only named.
 */
export function givenRows(names: readonly string[], given: readonly GivenSkill[], places: readonly SkillPlace[] | undefined): GivenSkill[] {
  const found = (places ?? []).filter((place) => place.from !== 'shipped').flatMap((place) => place.skills);
  return names.map((name) => {
    const row = found.find((skill) => skill.name === name);
    if (row) return { name, from: row.from, entry: row.entry, error: row.error, preload: row.preload, cost: row.cost };
    const read = given.find((skill) => skill.name === name);
    if (read) return read;
    const error = places ? `Neither your library nor this repository has \`${name}\`: add it from the list, or take it off.` : null;
    return { name, from: null, entry: null, error, preload: false, cost: null };
  });
}

/**
 * What the picker offers for a skill: to add it; to copy it into your library and add it, for one HKB ships that an agent of yours finds
 * nowhere; that it is given already; that an agent of yours finds its name elsewhere — a shipped skill your library or the repository has, so a
 * copy would write over yours or hide the repository's; or why no agent can be given it, and nothing to press.
 */
export type SkillOffer =
  | { kind: 'add' }
  | { kind: 'copy' }
  | { kind: 'given' }
  | { kind: 'found'; where: 'yours' | 'repo' }
  | { kind: 'refused'; why: string };

export function offerOf(row: SkillRow, given: readonly string[]): SkillOffer {
  if (row.error !== null || row.entry === null) return { kind: 'refused', why: row.error ?? 'Its SKILL.md does not read.' };
  if (row.from === 'shipped') return row.found ? { kind: 'found', where: row.found } : { kind: 'copy' };
  return given.includes(row.name) ? { kind: 'given' } : { kind: 'add' };
}
