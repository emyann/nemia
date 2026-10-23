/**
 * A skill on an agent: the entry an agent's card lists for it (`skillEntryOf`), a SKILL.md written back from a draft (`renderSkill`,
 * `skillDraftOf`), its `preload:` line switched alone (`withPreload`), a rule it declares (`SkillRule`), and the paths of the work it is
 * for (`appliesOf`, `appliesMatch`): its `applies:` line, globs from the folder a session runs in, which `nemia stats` reads to tell a try
 * that touched them; the harness ignores it.
 */
import { FRONTMATTER, refuse, SKILLS_FOLDER, splitFrontmatter } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { skillNameRefusal } from '../agents/agents.ts';
import {
  frontmatterOrNull,
  readFrontmatter,
  renderFrontmatter,
  withKey,
  type FrontmatterPair,
  type FrontmatterValue,
} from '../frontmatter/frontmatter.ts';

/**
 * A rule a skill declares in the `rules.json` beside its SKILL.md (`readSkillRules`): its `id`, what it `says`, and the calls that break
 * it, each written as a `disallowedTools:` rule (`Bash(cat:*)`) that a call the harness denied is matched against (`disallowedBy`).
 */
export type SkillRule = { id: string; says: string; breaks: string[] };

/**
 * One thing an agent says it can do, in the A2A protocol's words: its `AgentSkill`, as `specification/a2a.proto` defines it (protocol 1.0)
 * and as the specification's sample card spells it in JSON — camelCase.
 *
 * `id`, `name`, `description` and `tags` are REQUIRED there and are required here. `examples` are the sentences a person would actually
 * type — "use this when…" is one. `inputModes` and `outputModes` are media types, and say nothing an agent's card does not already say by
 * default, so they are written only where they differ. A skill is a description, not a permission: the proto's own comment says skills
 * "represent the abilities of an agent … a more focused set of behaviors that the agent is likely to succeed at". Nothing reads them to
 * decide what a session may touch.
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
 * The keys of a SKILL.md's frontmatter its card entry is read from (`skillEntryOf`). The others are Claude Code's, or the run's
 * (`preload`).
 */
const ENTRY_KEYS = ['name', 'title', 'description', 'tags', 'examples'] as const;
type EntryKey = (typeof ENTRY_KEYS)[number];

/**
 * The card entry of one composed skill: its `AgentSkill`, read off its SKILL.md's frontmatter (`text`). `id` is the skill's folder, `name`
 * its `title:` — a key Claude Code ignores, for the card alone — or else its frontmatter `name`, or else the id, as Claude Code names a
 * skill; `description` is the frontmatter's, which the A2A protocol and Claude Code's listing both need, so a skill with none is refused;
 * `tags` are the frontmatter's, or the id when it gives none (the protocol marks them REQUIRED, and a skill written for Claude Code alone
 * has none); `examples` only when given. Pure: `file` is what a refusal calls the SKILL.md.
 *
 * Read as YAML (`readFrontmatter`), each key the card reads as its value: `tags` and `examples` a list of lines of text, the others one
 * text. A block still in the former line form is read so, each card key's line read as YAML on its own, where it reads so, as the card
 * reader read it before. Refused, with the form to write: a list where a text is read, a text where a list is, a map, an empty list or one
 * with an empty item, and a card key set twice. `test/skills-rendered.test.ts` holds this reading to js-yaml's on every SKILL.md the
 * repository has. Keys the card does not read are passed over, whatever their form.
 */
export function skillEntryOf(file: string, id: string, text: string): AgentSkill {
  const { words, list } = entryValuesOf(file, text);
  const description = words('description');
  if (description === undefined) {
    refuse(
      `${file} has no \`description:\`, and the A2A protocol marks a skill's description REQUIRED — Claude Code lists a skill by it too. Write one line saying what it does: \`description: <what it does, one line>\`.`,
    );
  }
  const examples = list('examples');
  return {
    id,
    name: words('title') ?? words('name') ?? id,
    description,
    tags: list('tags') ?? [id],
    ...(examples && { examples }),
  };
}

/**
 * The card keys of a SKILL.md's frontmatter, each read as `skillEntryOf` reads it — one text, or a list of them — and refused as it
 * refuses.
 */
function entryValuesOf(
  file: string,
  text: string,
): { words: (key: EntryKey) => string | undefined; list: (key: EntryKey) => string[] | undefined } {
  const { block } = splitFrontmatter(file, text);
  if (block === null) {
    refuse(
      `${file} has no frontmatter, and a skill's card entry is read from it: Claude Code lists a skill by its description. Open the file with \`---\`, \`description: <what it does, one line>\` and \`---\`.`,
    );
  }
  const { entries, former } = readFrontmatter(file, block);
  const values: Partial<Record<EntryKey, FrontmatterValue>> = {};
  for (const { key, value } of entries) {
    if (!(ENTRY_KEYS as readonly string[]).includes(key)) continue;
    const reading = key as EntryKey;
    if (Object.hasOwn(values, reading))
      refuse(`${file}: \`${reading}\` is set twice, and YAML reads no file that says two things. Keep one line.`);
    values[reading] = former && typeof value === 'string' ? formerValue(reading, value) : value;
  }
  const words = (key: EntryKey): string | undefined => {
    const value = values[key];
    if (value !== undefined && typeof value !== 'string')
      refuse(
        `${file}: \`${key}\` is one line of text, not a list or a map. Write it so: \`${key}: <${key === 'description' ? 'what it does' : key}>\`.`,
      );
    return value?.trim() || undefined;
  };
  const list = (key: EntryKey): string[] | undefined => {
    const value = values[key];
    if (value === undefined || value === '') return undefined;
    const example = key === 'tags' ? '[code, review]' : '["Use this when…"]';
    if (typeof value === 'string')
      refuse(`${file}: \`${key}: ${value}\` is one line of text, and \`${key}\` is a list: \`${key}: ${example}\`.`);
    if (!Array.isArray(value)) refuse(`${file}: \`${key}\` is a map, and it is a list: \`${key}: ${example}\`.`);
    const items = value as readonly FrontmatterValue[];
    if (!items.length)
      refuse(
        `${file}: \`${key}\` is an empty list, which says as little as none. Give ${key === 'tags' ? 'a word or two' : 'one'} — \`${key}: ${example}\` — or delete the line${key === 'tags' ? ', and the skill is tagged with its name' : ''}.`,
      );
    if (items.some((item) => typeof item !== 'string' || !item.trim()))
      refuse(`${file}: \`${key}\` is not a list of words, each a line of text. Write it so: \`${key}: ${example}\`.`);
    return (items as readonly string[]).map((item) => item.trim());
  };
  return { words, list };
}

/**
 * A key's value in a block read in the former line form: its line, `key: value`, read as YAML on its own — a quoted text, a list —
 * where it reads so, and the value as written where it does not.
 */
function formerValue(key: string, value: string): FrontmatterValue {
  const alone = frontmatterOrNull(`${key}: ${value}\n`);
  return alone !== null && !alone.former && alone.entries.length === 1 ? alone.entries[0].value : value;
}

/**
 * A skill as it is written: what `renderSkill` takes, and what `skillDraftOf` reads off a SKILL.md. `name` is its folder, and the
 * frontmatter's `name:`; `title` the human name its card entry is given (`title:`, which Claude Code ignores); `description` what it does,
 * one line, which Claude Code lists it by; `tags` and `examples` its card entry's, each a list of one-line items; `preload`, whether the
 * run appends it whole to Claude Code's own prompt, so it is carried on every turn; and `body`, its instructions. A key unset is left out,
 * or `null`.
 */
export type SkillDraft = {
  name: string;
  title?: string | null;
  description?: string | null;
  tags?: readonly string[] | null;
  examples?: readonly string[] | null;
  /** Left out, an edit keeps the line the file has. */
  preload?: boolean;
  body: string;
};

/** The frontmatter keys `renderSkill` writes. Every other key a SKILL.md has is kept as written: Claude Code's, or another tool's. */
const SKILL_WRITES = ['name', 'title', 'description', 'tags', 'examples', 'preload'];

/**
 * The draft of the skill `id` from its SKILL.md's `text`: what the board's form is filled from. Its title, tags and examples as written —
 * none where the file writes none, not the card's fallbacks — and refused, in `skillEntryOf`'s words, where the card reader refuses the
 * file.
 */
export function skillDraftOf(file: string, id: string, text: string): SkillDraft {
  const { words, list } = entryValuesOf(file, text);
  const { description } = skillEntryOf(file, id, text);
  const { body } = splitFrontmatter(file, text);
  return {
    name: id,
    title: words('title') ?? null,
    description,
    tags: list('tags') ?? null,
    examples: list('examples') ?? null,
    preload: frontmatterKey(text, 'preload') === 'true',
    body,
  };
}

/**
 * A skill as its SKILL.md: `name:` its folder, `title:`, `description:`, `tags:` and `examples:`, each only where set, written through
 * `renderFrontmatter` (quoted where plain would read otherwise, the lists as YAML lists); then every other key `was` — the file as it is,
 * on an edit — has, as written, with its comments (`keptKeys`); `preload: true` where it is set, or, left out of the draft, where `was`
 * says so; and its instructions. What the card reader reads (`skillEntryOf`), which judges the result before it is returned: a draft the
 * reader would refuse — no description, an empty list — is refused here, in its words. Refused before that: a name that is not a skill's
 * (`skillNameRefusal`), and a line break in a value, since a card's value is one line. Pure.
 */
export function renderSkill(draft: SkillDraft, was?: string): string {
  const named = skillNameRefusal(draft?.name);
  if (named !== undefined) refuse(named);
  const file = `${SKILLS_FOLDER}/${draft.name}/SKILL.md`;
  const oneLine = (key: string, text: string): string => {
    if (/[\r\n]/.test(text)) refuse(`${file}: \`${key}\` holds a line break, and a card's value is one line. Write it on one line.`);
    return text;
  };
  const words = (key: 'title' | 'description'): FrontmatterPair[] => {
    const value = draft[key] == null ? '' : oneLine(key, String(draft[key]).trim());
    return value ? [[key, value]] : [];
  };
  const list = (key: 'tags' | 'examples'): FrontmatterPair[] => {
    const value = draft[key];
    if (value == null) return [];
    if (!Array.isArray(value)) refuse(`${file}: \`${key}\` is a list of one-line items, and the draft's is ${JSON.stringify(value)}.`);
    return [[key, value.map((item) => oneLine(key, String(item).trim())).filter(Boolean)]];
  };
  const preload = draft.preload ?? (was !== undefined && frontmatterKey(was, 'preload') === 'true');
  const block =
    renderFrontmatter([['name', draft.name], ...words('title'), ...words('description'), ...list('tags'), ...list('examples')]) +
    (was === undefined ? '' : keptKeys(was)) +
    (preload ? renderFrontmatter([['preload', 'true']]) : '');
  const text = `---\n${block}---\n${String(draft.body ?? '').trim()}\n`;
  skillEntryOf(file, draft.name, text);
  return text;
}

/**
 * The keys of `text`'s frontmatter `renderSkill` does not write, as they are written, with their comments: the block with each key it
 * writes taken out (`withKey`), so a value, its form and a comment stay as they were. None for a file with no frontmatter, one that never
 * closes, or one whose frontmatter reads in neither form, which no reader can tell the keys of.
 */
function keptKeys(text: string): string {
  try {
    const { block } = splitFrontmatter('', text);
    return block === null ? '' : SKILL_WRITES.reduce((kept, key) => withKey('SKILL.md', kept, key, undefined), block);
  } catch {
    return '';
  }
}

/**
 * `text`, a SKILL.md, with its `preload:` key alone changed: `preload: true` when `on`, and no key when not, each other key, its form and
 * its comments as written (`withKey`), and the body as it was. What the board's switch writes, so a skill whose other keys a render would
 * not keep is changed in that one key. Refused, naming the fix, for a file with no frontmatter; and judged by the reader after
 * (`frontmatterKey`), so a file it would read otherwise is refused rather than written.
 */
export function withPreload(file: string, text: string, on: boolean): string {
  const { block } = splitFrontmatter(file, text);
  if (block === null)
    refuse(
      `${file} has no frontmatter, and \`preload:\` is a line of it. Open the file with \`---\`, \`description: <what it does, one line>\` and \`---\`.`,
    );
  const normal = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const rest = normal.slice(FRONTMATTER.exec(normal)![0].length);
  const written = `---\n${withKey(file, block, 'preload', on ? 'true' : undefined)}---\n${rest}`;
  if ((frontmatterKey(written, 'preload') === 'true') !== on) {
    refuse(
      `${file}: its \`preload:\` could not be written so it reads ${on}: a line of its frontmatter sets it where a line of its own would not be read. Edit the file by hand.`,
    );
  }
  return written;
}

/**
 * The globs a SKILL.md's `applies:` key names (`text`, the whole file): a YAML list of globs, or one glob, each from the folder a session
 * runs in (`apps/web/**`). `[]` where it names none, or holds anything else — a map, an empty item — or the frontmatter does not read;
 * in a block read in the former line form, its line is read as YAML on its own, and `[]` where it does not read so.
 */
export function appliesOf(text: string): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  const read = block === null ? null : frontmatterOrNull(block);
  const entry = read?.entries.find(({ key }) => key === 'applies');
  if (read == null || entry === undefined) return [];
  const alone = read.former && typeof entry.value === 'string' ? frontmatterOrNull(`applies: ${entry.value}\n`) : null;
  if (alone !== null && (alone.former || alone.entries.length !== 1)) return [];
  const value = alone === null ? entry.value : alone.entries[0].value;
  const globs = Array.isArray(value) ? value : [value];
  return globs.every((g) => typeof g === 'string' && g.trim()) ? globs.map((g: string) => g.trim()) : [];
}

/** A glob as a pattern: `**` any folders, `*` any name's characters, `?` one of them, every other character itself. */
const globPattern = (glob: string): RegExp =>
  new RegExp(
    `^${glob
      .split(/(\*\*\/?|\*|\?)/)
      .map((part) =>
        part === '**/'
          ? '(?:.*/)?'
          : part === '**'
            ? '.*'
            : part === '*'
              ? '[^/]*'
              : part === '?'
                ? '[^/]'
                : part.replace(/[.+^${}()|[\]\\]/g, '\\$&'),
      )
      .join('')}$`,
  );

/** Whether the file `file`, a path from the folder a session ran in, is one of the paths `globs` name (`appliesOf`). */
export const appliesMatch = (file: string, globs: readonly string[]): boolean => globs.some((g) => globPattern(g).test(file));
