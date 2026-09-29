/**
 * A skill on an agent: the entry an agent's card lists for it (`skillEntryOf`), a SKILL.md written back from a draft (`renderSkill`,
 * `skillDraftOf`), and its `preload:` line switched alone (`withPreload`).
 */
import { FRONTMATTER, refuse, SKILLS_FOLDER, splitFrontmatter } from '../step/step.ts';
import { frontmatterKey } from '../former/former.ts';
import { skillNameRefusal } from '../agents/agents.ts';

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

/** The keys of a SKILL.md's frontmatter its card entry is read from (`skillEntryOf`). The others are Claude Code's, or the run's (`preload`). */
const ENTRY_KEYS = ['name', 'title', 'description', 'tags', 'examples'] as const;
type EntryKey = (typeof ENTRY_KEYS)[number];
/** Of those, the ones whose value is a list of words. */
const ENTRY_LISTS: readonly EntryKey[] = ['tags', 'examples'];

/**
 * The card entry of one composed skill: its `AgentSkill`, read off its SKILL.md's frontmatter (`text`). `id` is the skill's folder, `name` its
 * `title:` — a key Claude Code ignores, for the card alone — or else its frontmatter `name`, or else the id, as Claude Code names a
 * skill; `description` is the frontmatter's, which the A2A protocol and Claude Code's listing both need, so a skill with none is refused;
 * `tags` are the frontmatter's, or the id when it gives none (the protocol marks them REQUIRED, and a skill written for Claude Code alone
 * has none); `examples` only when given. Pure: `file` is what a refusal calls the SKILL.md.
 *
 * Read one line at a time, as the rest of the format is, and not by a YAML parser: each key the card reads is a plain value, one in double
 * quotes (read as JSON), one in single quotes, or a one-line JSON list. Any other form of those keys — a block scalar, a list over several
 * lines — is refused with the one-line form, rather than read as something else; `test/skills-rendered.test.ts` holds this reading to
 * js-yaml's on every SKILL.md the repository has. Keys the card does not read are passed over, whatever their form.
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
 * The card keys of a SKILL.md's frontmatter, each read as `skillEntryOf` reads it — one line of text, or a list — and refused as it refuses:
 * a line that goes on from a card key's — indented, or a list's `- item` — is refused with the one-line form.
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
  const values: Partial<Record<EntryKey, string | string[]>> = {};
  let reading: EntryKey | undefined;
  for (const raw of block.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (/^\s/.test(raw) || line === '-' || line.startsWith('- ')) {
      if (reading !== undefined) refuse(oneLine(file, reading));
      continue;
    }
    const i = line.indexOf(':');
    const key = i > 0 ? line.slice(0, i).trim() : '';
    reading = (ENTRY_KEYS as readonly string[]).includes(key) ? (key as EntryKey) : undefined;
    if (reading === undefined) continue;
    if (Object.hasOwn(values, reading))
      refuse(`${file}: \`${reading}\` is set twice, and YAML reads no file that says two things. Keep one line.`);
    const value = entryValue(file, reading, line.slice(i + 1).trim());
    if (value !== undefined) values[reading] = value;
  }
  const words = (key: EntryKey): string | undefined => {
    const value = values[key];
    if (Array.isArray(value))
      refuse(
        `${file}: \`${key}\` is one line of text, not a list. Write it so: \`${key}: <${key === 'description' ? 'what it does' : key}>\`.`,
      );
    return value?.trim() || undefined;
  };
  const list = (key: EntryKey): string[] | undefined => {
    const value = values[key];
    if (value === undefined) return undefined;
    const example = key === 'tags' ? '["code", "review"]' : '["Use this when…"]';
    if (!Array.isArray(value))
      refuse(`${file}: \`${key}: ${value}\` is one line of text, and \`${key}\` is a list: \`${key}: ${example}\`.`);
    if (!value.length)
      refuse(
        `${file}: \`${key}\` is an empty list, which says as little as none. Give ${key === 'tags' ? 'a word or two' : 'one'} — \`${key}: ${example}\` — or delete the line${key === 'tags' ? ', and the skill is tagged with its name' : ''}.`,
      );
    return value;
  };
  return { words, list };
}

/**
 * A skill as it is written: what `renderSkill` takes, and what `skillDraftOf` reads off a SKILL.md. `name` is its folder, and the frontmatter's
 * `name:`; `title` the human name its card entry is given (`title:`, which Claude Code ignores); `description` what it does, one line, which
 * Claude Code lists it by; `tags` and `examples` its card entry's, each a list of one-line items; `preload`, whether the run appends it whole to
 * the system prompt, so it is carried on every turn; and `body`, its instructions. A key unset is left out, or `null`.
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
 * The draft of the skill `id` from its SKILL.md's `text`: what the board's form is filled from. Its title, tags and examples as written — none
 * where the file writes none, not the card's fallbacks — and refused, in `skillEntryOf`'s words, where the card reader refuses the file.
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
 * A skill as its SKILL.md: `name:` its folder, `title:` and `description:` as JSON strings, `tags:` and `examples:` as one-line JSON lists,
 * each only where set; then every other key `was` — the file as it is, on an edit — has, line for line, its lines that go on from it with it;
 * `preload: true` where it is set, or, left out of the draft, where `was` says so; and its instructions. The shape of the skills Nemia
 * ships, and what the card reader reads (`skillEntryOf`), which judges the result before it is returned: a draft the reader would refuse —
 * no description, an empty list — is refused here, in its words. Refused before that: a name that is not a skill's (`skillNameRefusal`),
 * and a line break in a value, which would make what follows it a line of its own. Pure.
 */
export function renderSkill(draft: SkillDraft, was?: string): string {
  const named = skillNameRefusal(draft?.name);
  if (named !== undefined) refuse(named);
  const file = `${SKILLS_FOLDER}/${draft.name}/SKILL.md`;
  const oneLine = (key: string, text: string): string => {
    if (/[\r\n]/.test(text))
      refuse(
        `${file}: \`${key}\` holds a line break, and a card reads each of its keys off one line: what follows the break would be read as a line of its own. Write it on one line.`,
      );
    return text;
  };
  const words = (key: 'title' | 'description'): string[] => {
    const value = draft[key] == null ? '' : oneLine(key, String(draft[key]).trim());
    return value ? [`${key}: ${JSON.stringify(value)}`] : [];
  };
  const list = (key: 'tags' | 'examples'): string[] => {
    const value = draft[key];
    if (value == null) return [];
    if (!Array.isArray(value)) refuse(`${file}: \`${key}\` is a list of one-line items, and the draft's is ${JSON.stringify(value)}.`);
    const items = value.map((item) => oneLine(key, String(item).trim())).filter(Boolean);
    return [`${key}: ${JSON.stringify(items)}`];
  };
  const preload = draft.preload ?? (was !== undefined && frontmatterKey(was, 'preload') === 'true');
  const lines = [
    `name: ${draft.name}`,
    ...words('title'),
    ...words('description'),
    ...list('tags'),
    ...list('examples'),
    ...(was === undefined ? [] : keptLines(was)),
    ...(preload ? ['preload: true'] : []),
  ];
  const text = `---\n${lines.join('\n')}\n---\n${String(draft.body ?? '').trim()}\n`;
  skillEntryOf(file, draft.name, text);
  return text;
}

/**
 * The lines of `text`'s frontmatter `renderSkill` does not write, as they are: each other key with the lines that go on from it — an indented
 * line, a list's `- item` — and a comment. None for a file with no frontmatter, or one that never closes.
 */
function keptLines(text: string): string[] {
  let block: string | null;
  try {
    block = splitFrontmatter('', text).block;
  } catch {
    return [];
  }
  const kept: string[] = [];
  let keeping = false;
  for (const raw of (block ?? '').split('\n')) {
    const line = raw.trim();
    if (/^\s/.test(raw) || line === '-' || line.startsWith('- ') || !line) {
      if (keeping) kept.push(raw);
      continue;
    }
    if (line.startsWith('#')) {
      kept.push(raw);
      keeping = false;
      continue;
    }
    const i = line.indexOf(':');
    keeping = !SKILL_WRITES.includes(i > 0 ? line.slice(0, i).trim() : line);
    if (keeping) kept.push(raw);
  }
  while (kept.length && !kept.at(-1)!.trim()) kept.pop();
  return kept;
}

/**
 * `text`, a SKILL.md, with its `preload:` line alone changed: `preload: true` when `on`, and no line when not — each line of its frontmatter
 * that sets the key taken out, with the lines that go on from it, and the body as it was. What the board's switch writes, so a skill whose
 * other keys a render would not keep is changed in that one line. Refused, naming the fix, for a file with no frontmatter; and judged by the
 * reader after (`frontmatterKey`), so a file it would read otherwise is refused rather than written.
 */
export function withPreload(file: string, text: string, on: boolean): string {
  const { block } = splitFrontmatter(file, text);
  if (block === null)
    refuse(
      `${file} has no frontmatter, and \`preload:\` is a line of it. Open the file with \`---\`, \`description: <what it does, one line>\` and \`---\`.`,
    );
  const normal = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const rest = normal.slice(FRONTMATTER.exec(normal)![0].length);
  const lines: string[] = [];
  let dropping = false;
  for (const raw of block.split('\n').slice(0, -1)) {
    const continues = /^\s/.test(raw) || raw.trim() === '-' || raw.trim().startsWith('- ');
    if (!continues) dropping = /^preload\s*:/.test(raw);
    if (!dropping) lines.push(raw);
  }
  if (on) lines.push('preload: true');
  const written = `---\n${lines.map((line) => `${line}\n`).join('')}---\n${rest}`;
  if ((frontmatterKey(written, 'preload') === 'true') !== on) {
    refuse(
      `${file}: its \`preload:\` could not be written so it reads ${on}: a line of its frontmatter sets it where a line of its own would not be read. Edit the file by hand.`,
    );
  }
  return written;
}

/** The refusal of a card key written over more than one line. */
const oneLine = (file: string, key: EntryKey): string =>
  ENTRY_LISTS.includes(key)
    ? `${file}: \`${key}\` is a list written over several lines, and a card reads each of its keys off one line. Write it on one: \`${key}: ${key === 'tags' ? '["code", "review"]' : '["Use this when…"]'}\`.`
    : `${file}: \`${key}\` goes on over several lines, and a card reads each of its keys off one line. Write it on one: \`${key}: "<${key === 'description' ? 'what it does' : key}>"\`.`;

/**
 * One value of a card key, as YAML reads it where the two agree: a plain value, one in double quotes (JSON's escapes, which are YAML's), one in
 * single quotes (`''` a quote), or a one-line list in JSON. Refused: a block scalar, a flow map, an anchor, an alias or a tag, a plain value
 * YAML would read as a map (a colon and a space) and a quote or a list never closed — each with the one-line form. A plain value ends at
 * ` #`, where YAML's comment begins. `undefined` for none.
 */
function entryValue(file: string, key: EntryKey, written: string): string | string[] | undefined {
  if (!written) return undefined;
  const form = ENTRY_LISTS.includes(key)
    ? `\`${key}: ${key === 'tags' ? '["code", "review"]' : '["Use this when…"]'}\``
    : `\`${key}: "<${key === 'description' ? 'what it does' : key}>"\``;
  const cannot = (why: string): never => refuse(`${file}: \`${key}: ${written}\` ${why}. Write it on one line, as JSON: ${form}.`);
  if (/^[|>]/.test(written)) return refuse(oneLine(file, key));
  if (written.startsWith('[')) {
    let read: unknown;
    try {
      read = JSON.parse(written);
    } catch {
      return cannot('is not a list a card reads — a list is JSON, on one line, each item in double quotes');
    }
    if (!Array.isArray(read) || read.some((item) => typeof item !== 'string' || !item.trim()))
      return cannot('is not a list of words, each a line of text');
    return (read as string[]).map((item) => item.trim());
  }
  if (written.startsWith('"')) {
    try {
      const read: unknown = JSON.parse(written);
      if (typeof read === 'string') return read;
    } catch {}
    return cannot('is not one quoted line: a quote inside it is written \\", and nothing follows the closing quote');
  }
  if (written.startsWith("'")) {
    const m = /^'((?:[^']|'')*)'$/.exec(written);
    return m
      ? m[1].replace(/''/g, "'")
      : cannot("is not one quoted line: a quote inside it is written '', and nothing follows the closing quote");
  }
  if (/^[{&*!%@`]/.test(written)) return cannot('starts with a character YAML reads as something other than text');
  if (/:(\s|$)/.test(written)) return cannot('holds a colon and a space, which YAML reads as a map, not as text');
  return written.replace(/\s+#.*$/, '');
}
