/**
 * The board's story files as its Storybook finds them (`.storybook/main.ts`: every `*.stories.tsx` in a folder of `src/components` but
 * `ui/` and `ai-elements/`), each one card of the artifact: its title, its group (the title's first word), its base name and the
 * stories it exports, in the order it writes them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { SRC } from '../paths.ts';

/** A story file's name ends so. */
export const STORY = /\.stories\.tsx$/;

/** The folders of `src/components` Storybook leaves out. */
const LEFT_OUT = new Set(['ui', 'ai-elements']);

/** The groups a board card belongs to, in the order the artifact's text lists them. */
export const GROUPS = ['Look', 'Frame', 'Run', 'Factory', 'Store', 'Pages'] as const;

/** A board story file. */
export type BoardStory = {
  readonly file: string;
  readonly base: string;
  readonly title: string;
  readonly group: string;
  readonly stories: readonly string[];
};

/**
 * The names a story file exports as stories, in the order it writes them.
 * @param text the story file's source.
 */
export const storyNames = (text: string) => [...text.matchAll(/^export const ([A-Za-z0-9_]+)/gm)].map(([, name]) => name ?? '');

/**
 * Every story file of `components` that Storybook reads, sorted.
 * @param components the board's `src/components` folder.
 */
export const storyFiles = (components: string) =>
  fs
    .readdirSync(components, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !LEFT_OUT.has(entry.name))
    .flatMap((entry) =>
      fs
        .readdirSync(path.join(components, entry.name), { recursive: true, withFileTypes: true })
        .filter((file) => file.isFile() && STORY.test(file.name))
        .map((file) => path.join(file.parentPath, file.name)),
    )
    .toSorted();

/**
 * One story file as a card: refused when its title names no group the artifact knows.
 * @param file the story file's path.
 */
export const boardStoryOf = (file: string) => {
  const text = fs.readFileSync(file, 'utf8');
  const title = new RegExp(`title: *'((?:${GROUPS.join('|')})/[^']+)'`).exec(text)?.[1];
  if (title === undefined)
    throw new Error(`${path.relative(SRC, file)}: its meta's title names no group of ${GROUPS.join(', ')}: give it one, as 'Run/<Name>'`);
  return {
    file,
    base: path.basename(file).replace(STORY, ''),
    title,
    group: title.split('/')[0] ?? '',
    stories: storyNames(text),
  } satisfies BoardStory;
};

/** Every board story file, each a card; refused when two share a base name, since a card is named by it. */
export const boardStories = () => {
  const stories = storyFiles(path.join(SRC, 'components')).map(boardStoryOf);
  const seen = new Set<string>();
  for (const story of stories) {
    if (seen.has(story.base))
      throw new Error(`two story files are named ${story.base}.stories.tsx: rename one, since a card is named by it`);
    seen.add(story.base);
  }
  return stories;
};
