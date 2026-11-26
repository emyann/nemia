/**
 * The bundle's entry, generated from the checkout: the kit's door and the look's, a named export for each story file of the board
 * whose folder holds a component of the file's own name, `NemiaRoot` over the stories' own stage (`.storybook/stage.tsx`), the board's
 * icons as `Icons`, the shared packages' namespaces, and `__m`, every module of the board a story reaches, by its path under `src`.
 */
import fs from 'node:fs';
import path from 'node:path';
import * as esbuild from 'esbuild';
import { SRC, STORYBOOK, WORK, writeIn } from '../paths.ts';
import type { BoardStory } from '../stories/stories.ts';
import { esbuildBase, pageGlobals, SHARED } from './page.ts';
import { keyOf, seams } from './seams.ts';

/** A board card: its story file and whether, and from where, the bundle exports a component of its name. */
export type BoardCard = BoardStory & { readonly component: boolean; readonly from: string | null };

/** The look's door, which exports its parts. */
const LOOK_DOOR = path.join(SRC, 'components', 'look', 'index.ts');

/** The kit's door. */
const KIT_DOOR = path.join(SRC, 'components', 'ui', 'ds', 'index.ts');

/** Every module of the board a story reaches, found by bundling every story file once with the seams collecting them. */
const reached = async (stories: readonly BoardStory[], inert: string) => {
  const seen = new Set<string>();
  const contents = stories.map((story, i) => `import * as s${i} from ${JSON.stringify(story.file)}; console.log(s${i});`).join('\n');
  await esbuild.build({
    ...esbuildBase,
    minify: false,
    stdin: { contents, resolveDir: SRC, loader: 'js' },
    format: 'esm',
    plugins: [pageGlobals, seams({ inert, seen })],
  });
  return [...seen].toSorted();
};

/** The module beside a story file that exports the file's own name, if the stories reach it. */
const namedFor = (story: BoardStory, modules: readonly string[]) => {
  const declared = new RegExp(`export (?:async )?(?:function|const|class) ${story.base}\\b|export \\{[^}]*\\b${story.base}\\b[^}]*\\}`);
  const beside = ['.tsx', '.ts']
    .map((ext) => path.join(path.dirname(story.file), `${story.base}${ext}`))
    .find((file) => fs.existsSync(file));
  return beside && modules.includes(beside) && declared.test(fs.readFileSync(beside, 'utf8')) ? beside : null;
};

/** Whether the look's door exports a part of `name`. */
const inLook = (name: string, door: string) =>
  new RegExp(`^export \\{[^}]*(?<![A-Za-z] )\\b${name}\\b(?=[,} ])[^}]*\\} from`, 'm').test(door.replace(/\btype \w+,?/g, ''));

/**
 * Each story file as a card, with the component the bundle exports for it.
 * @param stories the board's story files.
 * @param modules the board's modules the stories reach.
 */
const boardCardsOf = (stories: readonly BoardStory[], modules: readonly string[]) => {
  const door = fs.readFileSync(LOOK_DOOR, 'utf8');
  return stories.map((story) => {
    const look = story.group === 'Look' && inLook(story.base, door);
    const beside = look ? null : namedFor(story, modules);
    const from = beside ? path.relative(SRC, beside) : look ? 'components/look/index.ts' : null;
    return { ...story, component: look || beside !== null, from } satisfies BoardCard;
  });
};

/** NemiaRoot: the children on the stories' stage, under a router in memory and a query client of their own. */
const ROOT = (stage: string) => `
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { Routed } from ${JSON.stringify(stage)};

const Given = createContext<ReactNode>(null);

function Children() {
  return useContext(Given);
}

/**
 * Wraps content the way the board's stories are drawn: a router of its own over a history kept in memory, React Aria's router provider
 * over it, a query client that retries nothing, the look's ground with its scan lines, and the scroll marks the board's frame writes.
 * @param children what is drawn.
 * @param at the address the router opens on; default "/".
 * @param marked marks what scrolls while it scrolls; default true.
 */
export function NemiaRoot({ children, at = '/', marked = true }: { children?: ReactNode; at?: string; marked?: boolean }) {
  return createElement(Given.Provider, { value: children }, createElement(Routed, { Story: Children, at, marked }));
}
`;

/**
 * Writes the entry, NemiaRoot's module and the icons' module into the work folder, and says the entry's path and every board card.
 * @param stories the board's story files.
 * @param inert the module the stories' outside imports resolve to.
 * @param icons the lucide icons the board imports.
 */
export const writeEntry = async (stories: readonly BoardStory[], inert: string, icons: readonly string[]) => {
  const modules = await reached(stories, inert);
  const cards = boardCardsOf(stories, modules);
  const root = path.join(WORK, 'NemiaRoot.tsx');
  const iconsFile = path.join(WORK, 'icons.ts');
  writeIn(root, ROOT(path.join(STORYBOOK, 'stage.tsx')));
  writeIn(iconsFile, `export { ${icons.join(', ')} } from 'lucide-react';\n`);
  const named = cards.filter((card) => card.from !== null && card.from !== 'components/look/index.ts');
  const lines = [
    `export * from ${JSON.stringify(KIT_DOOR)};`,
    `export * from ${JSON.stringify(LOOK_DOOR)};`,
    ...named.map((card) => `export { ${card.base} } from ${JSON.stringify(path.join(SRC, card.from ?? ''))};`),
    `export { NemiaRoot } from ${JSON.stringify(root)};`,
    `export * as Icons from ${JSON.stringify(iconsFile)};`,
    ...Object.entries(SHARED).map(([name, space]) => `export * as ${space} from ${JSON.stringify(name)};`),
    ...modules.map((file, i) => `import * as m${i} from ${JSON.stringify(file)};`),
    '/** Every module of the board a story reaches, by its path under src: a card takes its imports from here. */',
    'export const __m = {',
    ...modules.map((file, i) => `  ${JSON.stringify(keyOf(file))}: m${i},`),
    '};',
  ];
  const entry = path.join(WORK, 'entry.ts');
  writeIn(entry, `${lines.join('\n')}\n`);
  return { entry, cards, modules };
};
