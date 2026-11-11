/**
 * A skill's folder read as the spec a Skill object carries (`SkillSpec` of objects): its SKILL.md's title, description, tags and examples
 * as its frontmatter writes them, whether it is loaded whole every turn (`preload`), its instructions (`body`), and the folder's other text
 * files (`files`), sorted by path, where it holds any. One reading for the skill on disk (`skillNow`, `current.verb.ts`) and for a skill
 * composed from an upgrade's merge. Pure.
 */
import { fileParts } from './workflow-spec.ts';
import type { SkillOther } from '../skills/skills.ts';

/** A skill's spec as a proposal carries it. */
export type SkillSpecRead = {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  examples?: unknown;
  preload: boolean;
  body: string;
  files?: SkillOther[];
};

/** The frontmatter keys of a SKILL.md a Skill's spec carries, each as it reads. */
const PICKED = ['title', 'description', 'tags', 'examples'] as const;

/**
 * The spec of the skill `name` whose SKILL.md is `skillMd`, its other text files `others` (each by its path in the folder) and its
 * `preload` as read.
 */
export function skillSpecOf(
  name: string,
  skillMd: string,
  others: readonly { readonly path: string; readonly text: string }[],
  preload: boolean,
): SkillSpecRead {
  const { keys, body } = fileParts(name, skillMd);
  const picked = Object.fromEntries(PICKED.flatMap((key) => (keys[key] === undefined ? [] : [[key, keys[key]]])));
  const files = [...others].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map(({ path, text }) => ({ path, text }));
  return { ...picked, preload, body, ...(files.length > 0 && { files }) };
}
