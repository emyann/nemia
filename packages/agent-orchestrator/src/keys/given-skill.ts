/**
 * The name of a skill as a `skills:` line gives it, an agent's or a step's: a bare name, the skill of a folder of skills the load looks
 * in, or `folder:name`, the skill `name` of the repository's folder `folder`, read from that folder's own skills because the line says
 * so. Pure: what each form is, never where it is read (`skillsFor` in `skills/read.store.ts`).
 */

/** A skill's name: the folder it is, in `skills/`, lowercase words joined by dashes, as a harness names one. */
export const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A folder of the repository as a `skills:` line names it: its path from the repository's root, segments joined by `/`, each of letters,
 * digits, `.`, `_` and `-` and starting with none of `.` and `-` — so no empty or hidden segment, no `..`, no slash at either end.
 */
const SKILL_FOLDER = /^[A-Za-z0-9_][A-Za-z0-9._-]*(?:\/[A-Za-z0-9_][A-Za-z0-9._-]*)*$/;

/** A skill a `skills:` line gives: its own name, and the repository's folder it is read from where the line names one. */
export type GivenSkill = { name: string; folder?: string };

/**
 * The entry `written` of a `skills:` line as the skill it gives: `{ name }` for a bare name (`SKILL_NAME`), `{ folder, name }` for
 * `folder:name` (`SKILL_FOLDER`, one `:`), and nothing for any other text.
 */
export function givenSkillOf(written: string): GivenSkill | undefined {
  const parts = written.split(':');
  const name = parts.at(-1)!;
  if (parts.length > 2 || !SKILL_NAME.test(name)) return undefined;
  if (parts.length === 1) return { name };
  return SKILL_FOLDER.test(parts[0]!) ? { folder: parts[0]!, name } : undefined;
}

/** The bare name of a given skill, as a session loads it and its copy is filed: the text after the last `:` of `written`. */
export const bareSkillOf = (written: string): string => written.slice(written.lastIndexOf(':') + 1);

/** The first two of `names` that are two skills of one bare name (`bareSkillOf`), in the list's order, or nothing. */
export function sameBareIn(names: readonly string[]): [string, string] | undefined {
  for (const [i, name] of names.entries()) {
    const first = names.slice(0, i).find((before) => before !== name && bareSkillOf(before) === bareSkillOf(name));
    if (first !== undefined) return [first, name];
  }
  return undefined;
}

/** The two forms of a name on a `skills:` line, said after a refusal of one that is neither. */
export const GIVEN_SKILL_FORMS =
  "Each is a skill's name — its folder in skills/, lowercase words joined by dashes — or `folder:name`, the skill `name` of the " +
  "repository's folder `folder`, read from its `.claude/skills/`: `apps/web:ds-build`. Comma-separated: `skills: review-a-change, apps/web:ds-build`.";

/** Why one session cannot hold two skills of one bare name, said after a refusal that names both. */
export const ONE_BARE_NAME = 'A session loads a skill by its bare name, so one step holds one skill of a name.';
