/**
 * The artifact's words: each board card's README from the doc comments its code carries, each kit card's from its guideline, the
 * brand book (`README.md`, from `brand.md` beside this file), the cover's card, and the index (`design-system.json`), copied from
 * `index.seed.json` so a build never rewrites its birth; the publishing session revises the artifact's own index, its last change alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { OWN, SRC, writeIn } from '../paths.ts';
import type { BoardCard } from '../bundle/entry.ts';
import type { KitCard } from '../kit/cards.ts';
import { GROUPS } from '../stories/stories.ts';
import { COVER } from './cover.ts';
import { surfacesTable } from './surfaces.ts';

/** A board card with the stories its card draws and the ones it leaves out, each with why. */
export type Told = BoardCard & {
  readonly name: string;
  readonly kept: readonly string[];
  readonly left: readonly { story: string; fate: string }[];
};

/** The paragraphs of a doc comment, its examples and tags left out. */
const proseOf = (comment: string) =>
  comment
    .replace(/^\/\*\*|\*\/$/g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\* ?/, ''))
    .join('\n')
    .split(/\n\s*\n/)
    .filter((paragraph) => !/^\s{2,}\S/.test(paragraph) && !/^\s*@/.test(paragraph))
    .map((paragraph) =>
      paragraph
        .replace(/\s*\n\s*@[\s\S]*$/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter(Boolean);

/**
 * The paragraphs of the doc comment written just before `pattern` in `text`.
 * @param text a source file's text.
 * @param pattern what the comment stands over.
 */
export const commentBefore = (text: string, pattern: RegExp) => {
  const at = text.search(pattern);
  if (at < 0) return [];
  const found = /\/\*\*(?:(?!\*\/)[\s\S])*\*\/\s*$/.exec(text.slice(0, at));
  return found ? proseOf(found[0].trim()) : [];
};

const firstSentence = (text: string) => /^(.*?[.!?])(\s|$)/.exec(text)?.[1] ?? text;

const words = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .toLowerCase();

/** The props index.d.ts lists for a component. */
const propsIn = (types: string, name: string) => {
  const body = new RegExp(`export interface ${name}Props \\{\\n([\\s\\S]*?)\\n\\}`).exec(types)?.[1] ?? '';
  return [...body.matchAll(/^ {2}([A-Za-z_$][\w$]*|"[^"]+")\??:/gm)].map(([, prop]) => (prop ?? '').replace(/"/g, ''));
};

/** The source a board card's component is declared in, if it has one. */
const sourceOf = (card: BoardCard) => {
  if (!card.from) return null;
  if (card.from !== 'components/look/index.ts') return path.join(SRC, card.from);
  return (
    ['.tsx', '.ts'].map((ext) => path.join(SRC, 'components', 'look', `${card.base}${ext}`)).find((file) => fs.existsSync(file)) ?? null
  );
};

/** What a board card's README says one supplies. */
const supplyOf = (card: Told, types: string) => {
  if (!card.component)
    return `No component is named \`${card.name}\`: the card shows what the board's stories of that name draw (\`apps/web/src/${path.relative(SRC, card.file)}\`). Build it from the parts its states show.`;
  const props = propsIn(types, card.name);
  const said = props.length
    ? `Its props: ${props.map((prop) => `\`${prop}\``).join(', ')} (\`components/index.d.ts\` says each).`
    : 'It takes no prop of its own.';
  const part =
    card.group === 'Look'
      ? ''
      : ` It is a part of the board (\`apps/web/src/${card.from}\`), not a general component: it reads the board's own shapes.`;
  return `${said} Take it as \`Nemia.${card.name}\`, inside \`Nemia.NemiaRoot\`, which gives it a router, a query client and the look's ground.${part}`;
};

/**
 * A board card's README, from its component's doc comment and the one over its stories.
 * @param card the card, with its kept and left stories.
 * @param types index.d.ts's text.
 */
export const boardReadme = (card: Told, types: string) => {
  const overStories = commentBefore(fs.readFileSync(card.file, 'utf8'), /^(?:const|export const) meta\b/m);
  const source = sourceOf(card);
  const own = source
    ? commentBefore(fs.readFileSync(source, 'utf8'), new RegExp(`^export (?:async )?(?:function|const|class) ${card.name}\\b`, 'm'))
    : [];
  const said = own.length ? own : overStories;
  const summary = said[0] ? firstSentence(said[0]) : `${card.name}, a part of the board's ${card.group.toLowerCase()} group.`;
  const rest = [said[0]?.slice(summary.length).trim(), ...said.slice(1), ...(own.length ? overStories : [])].filter(Boolean);
  const leftOut = card.left.length
    ? ` Not drawn: ${card.left.map((left) => `${words(left.story)} (${left.fate === 'overlay' ? 'it opens over the whole window' : 'it reads the api'})`).join(', ')}.`
    : '';
  const when = [
    ...(rest.length ? rest : [`It is drawn here in ${card.kept.length === 1 ? 'one state' : `${card.kept.length} states`}.`]),
    `Its states here: ${card.kept.map(words).join(', ')}.${leftOut}`,
  ].join('\n\n');
  return `${summary}\n\n## When to use it\n\n${when}\n\n## What you supply\n\n${supplyOf(card, types)}\n`;
};

/**
 * A kit card's README, from its guideline.
 * @param card the kit card.
 */
export const kitReadme = (card: KitCard) =>
  `${card.guide[0]}\n\n## When to use it\n\n${card.guide[1]}\n\n## What you supply\n\n${card.guide[2]}\n`;

/** What the brand book is filled with. */
export type Brand = {
  readonly told: readonly Told[];
  readonly kit: readonly KitCard[];
  readonly kitVersion: string;
  readonly icons: readonly string[];
  readonly valueOf: (role: string, theme: string) => string;
};

/**
 * The brand book, `brand.md` with its blanks filled.
 * @param brand what fills it.
 */
export const brandBook = (brand: Brand) => {
  const drawn = brand.told.filter((card) => card.kept.length > 0);
  const kitGroups = new Map<string, string[]>();
  for (const card of brand.kit) kitGroups.set(card.group, [...(kitGroups.get(card.group) ?? []), card.name]);
  const blanks: Record<string, string> = {
    surfaces: surfacesTable(brand.valueOf),
    boardLines: GROUPS.map(
      (group) =>
        `- ${group}: ${drawn
          .filter((card) => card.group === group)
          .map((card) => `\`${card.name}\``)
          .join(', ')}.`,
    ).join('\n'),
    kitVersion: brand.kitVersion,
    kitLines: [...kitGroups].map(([group, names]) => `- ${group}: ${names.map((name) => `\`${name}\``).join(', ')}.`).join('\n'),
    iconCount: String(brand.icons.length),
    iconExample: brand.icons.includes('Settings') ? 'Settings' : (brand.icons[0] ?? ''),
    icons: brand.icons.map((name) => `\`${name}\``).join(', '),
    skipped: String(brand.told.reduce((sum, card) => sum + card.left.length, 0)),
    cardless:
      brand.told
        .filter((card) => card.kept.length === 0)
        .map((card) => `\`${card.name}\``)
        .join(', ') || 'no card',
  };
  return fs.readFileSync(path.join(import.meta.dirname, 'brand.md'), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, blank: string) => {
    const filled = blanks[blank];
    if (filled === undefined) throw new Error(`brand.md asks for {{${blank}}}, which docs.ts does not fill: fill it in brandBook`);
    return filled;
  });
};

/**
 * Writes the READMEs, the brand book, the cover and the index into the artifact.
 * @param project the artifact's folder.
 * @param brand what the brand book is filled with.
 * @param types index.d.ts's text.
 */
export const writeDocs = (project: string, brand: Brand, types: string) => {
  for (const card of brand.told.filter((one) => one.kept.length > 0))
    writeIn(path.join(project, 'components', card.name, 'README.md'), boardReadme(card, types));
  for (const card of brand.kit) writeIn(path.join(project, 'components', card.name, 'README.md'), kitReadme(card));
  writeIn(path.join(project, 'README.md'), brandBook(brand));
  writeIn(path.join(project, 'components', 'Cover', 'preview.html'), COVER);
  writeIn(path.join(project, 'design-system.json'), fs.readFileSync(path.join(OWN, 'index.seed.json')));
};
