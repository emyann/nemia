import type { DefinitionOrigin } from 'objects';
import type { GivenSkill, SkillCost, SkillSource } from './api/library.ts';
import type { SkillDetail, SkillPlace, SkillRow, SkillUser } from './api/skills.ts';

/** What each place of skills is called on the board. */
export const PLACE_LABELS: Readonly<Record<SkillSource, string>> = {
  factory: "The factory's",
  user: 'The user library',
  repo: 'This repository',
  builtin: 'Built into Nemia',
};

/** A given skill's badge: where an agent of yours finds it. */
export const SOURCE_BADGES: Readonly<Record<SkillSource, string>> = {
  factory: "the factory's",
  user: 'the user library',
  repo: 'this repository',
  builtin: 'built into Nemia',
};

/**
 * What a turn carries of a skill, in words: named, its listing — its name and description, which the session reads to decide to load it —
 * and its body only in a turn that loads it; preloaded, the whole of it every turn, cached as Claude Code's own prompt is.
 * @param cost What the skill costs a turn, in tokens, and whether it is preloaded.
 */
export function costWords(cost: SkillCost) {
  if (cost.preload) return `loaded every turn — about ${cost.perTurn.toLocaleString('en')} tokens (cached)`;
  return `named — about ${cost.listed.toLocaleString('en')} tokens a turn, and about ${cost.body.toLocaleString('en')} more in a turn that loads it`;
}

/**
 * The skills the form gives, one row each in its order: where an agent of yours finds each now (`places`, the picker's list, read again
 * after a copy), else as the agent was read (`given`): a skill named with its folder, which the list never has, is its read row whole,
 * with where it was found. A name found in neither is said to be missing once the list is read; before, it is only named.
 * @param names The skills' names the form gives, in its order.
 * @param given The skills as the agent was read.
 * @param places The picker's list of where an agent of yours finds skills, or undefined while it is not read.
 */
export function givenRows(names: readonly string[], given: readonly GivenSkill[], places: readonly SkillPlace[] | undefined) {
  const found = (places ?? []).filter((place) => place.from !== 'builtin').flatMap((place) => place.skills);
  return names.map((name) => {
    const row = found.find((skill) => skill.name === name);
    if (row) return { name, from: row.from, foundIn: null, entry: row.entry, error: row.error, preload: row.preload, cost: row.cost };
    const read = given.find((skill) => skill.name === name);
    if (read) return read;
    const error = places ? `Neither your library nor this repository has \`${name}\`: add it from the list, or take it off.` : null;
    return { name, from: null, foundIn: null, entry: null, error, preload: false, cost: null };
  });
}

/**
 * What the picker offers for a skill: to add it; to copy it into your library and add it, for a builtin one that an agent of yours finds
 * nowhere; that it is given already; that an agent of yours finds its name elsewhere — a builtin skill your library or the repository has,
 * so a copy would write over yours or hide the repository's; or why no agent can be given it, and nothing to press.
 */
type SkillOffer =
  | { kind: 'add' }
  | { kind: 'copy' }
  | { kind: 'given' }
  | { kind: 'found'; where: Extract<DefinitionOrigin, 'user' | 'repo'> }
  | { kind: 'refused'; why: string };

/**
 * What the picker offers for the skill `row` (`SkillOffer`).
 * @param row The skill as the picker's list has it.
 * @param given The names of the skills the form gives already.
 */
export function offerOf(row: SkillRow, given: readonly string[]) {
  if (row.error !== null || row.entry === null)
    return { kind: 'refused', why: row.error ?? 'Its SKILL.md does not read.' } satisfies SkillOffer;
  if (row.from === 'builtin') return (row.found ? { kind: 'found', where: row.found } : { kind: 'copy' }) satisfies SkillOffer;
  return (given.includes(row.name) ? { kind: 'given' } : { kind: 'add' }) satisfies SkillOffer;
}

/**
 * A skill's form as a person types it: its name (its folder), a title, what it does, and its instructions, each a line or a text as
 * written; its tags and examples one a line. What the page sends is `draftOfForm`'s reading of it.
 */
export type SkillForm = { name: string; title: string; description: string; tags: string; examples: string; body: string };

/** The form of a new skill: nothing written yet. */
export const EMPTY_SKILL_FORM: SkillForm = { name: '', title: '', description: '', tags: '', examples: '', body: '' };

/**
 * A skill's form filled from its page: its draft as the file writes it — no title, tags or examples where the file has none, not the card's
 * fallbacks. A skill whose SKILL.md does not read has no draft: its form holds its name and its instructions, so it can be mended.
 * @param detail The skill's page as read: the skill, its draft where its file reads, and its instructions.
 */
export function skillFormOf(detail: Pick<SkillDetail, 'skill' | 'draft' | 'body'>) {
  const { draft } = detail;
  if (!draft) return { ...EMPTY_SKILL_FORM, name: detail.skill.name, body: detail.body };
  return {
    name: draft.name,
    title: draft.title ?? '',
    description: draft.description ?? '',
    tags: (draft.tags ?? []).join('\n'),
    examples: (draft.examples ?? []).join('\n'),
    body: draft.body,
  };
}

const lines = (text: string) => {
  const each = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return each.length ? each : null;
};

/**
 * What the form sends: its name and description as typed, trimmed; a blank title as none; its tags and examples one a non-blank line, or
 * none; its instructions as written. `preload` is left out, so a save keeps the line the file has — the page's switch writes it, on its
 * own.
 * @param form The form as typed.
 */
export function draftOfForm(form: SkillForm) {
  return {
    name: form.name.trim(),
    title: form.title.trim() || null,
    description: form.description.trim(),
    tags: lines(form.tags),
    examples: lines(form.examples),
    body: form.body,
  };
}

/**
 * Whether the form says something other than what it was filled with: what would be written differs, not only its blank lines.
 * @param form The form as typed now.
 * @param was The form as it was filled.
 */
export function skillEdited(form: SkillForm, was: SkillForm) {
  return JSON.stringify(draftOfForm(form)) !== JSON.stringify(draftOfForm(was));
}

/**
 * What the page says of the switch beside what a turn carries now (`costWords`): what the other position would carry — on, the body too,
 * about four characters a token, loaded every turn and cached as Claude Code's own prompt is; off, only its name and what it does.
 * @param cost What the skill costs a turn, in tokens, and whether it is preloaded now.
 */
export function preloadWords(cost: SkillCost) {
  if (cost.preload) return 'Off, a session is told only its name and what it does, and loads it when it needs it.';
  return `On, its instructions are loaded every turn too — about ${cost.body.toLocaleString('en')} tokens more a turn, cached.`;
}

/**
 * Who a change of the skill — its switch included — reaches: every agent that gives it, by name, from the next run started; or none yet.
 * @param users The agents that give the skill.
 */
export function reachWords(users: readonly SkillUser[]) {
  if (!users.length) return 'No agent gives it yet: a change reaches none.';
  const names = users.map((user) => (user.from === 'repo' ? `${user.name} (this repository)` : user.name));
  return `A change, this switch included, changes every agent that gives it, from its next run: ${names.join(', ')}.`;
}

/**
 * The skill the page's form is drawn from, given the one it was drawn from and the one read now. A form with nothing unsaved follows the
 * read; one holding unsaved words keeps what it was drawn from, so a read that finds the file changed — a focus refetch, or the read after
 * a stale refusal — does not remount it and throw the words away. The page then says the file moved (`drawn.version !== now.version`).
 * Another skill read on the same page (its params changed) is never held.
 * @param drawn The skill the form was drawn from.
 * @param now The skill as read now.
 * @param changed Whether the form holds unsaved words.
 */
export function drawnSkill(drawn: SkillDetail, now: SkillDetail, changed: boolean) {
  return (drawn.version === now.version || !changed || drawn.skill.dir !== now.skill.dir ? now : drawn) satisfies SkillDetail;
}
