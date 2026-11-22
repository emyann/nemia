/**
 * The kit's cards, read from its stories (`kit.ts`) and the committed map beside this file (`kit-map.json`): one card per component
 * that has a story file under a group's folder, in the groups' order, then the five text primitives. The map says which stories each
 * card shows (`PICK`, else a file's first six), which story file draws another component's card (`JOINED`), which files are no card
 * (`SKIPPED`), the guideline of each card (`GUIDES`, `TYPE`), the least height of a card that opens something over the page (`ROOM`)
 * and the height a story that fills the window is drawn at (`SCREEN`). A story that needs its play function to be drawn as it says,
 * or that opens over a scrim and dims its card's other cells, is not picked.
 */
import fs from 'node:fs';
import path from 'node:path';
import { storyNames } from '../stories/stories.ts';
import map from './kit-map.json' with { type: 'json' };

/** A card's guideline: its summary, when to use it, and what the one who uses it supplies. */
export type Guide = readonly [string, string, string];

/** The kit's map, as `kit-map.json` holds it. */
export const KIT_MAP = map as unknown as {
  readonly GROUPS: readonly (readonly [string, string])[];
  readonly JOINED: Readonly<Record<string, string>>;
  readonly SKIPPED: readonly string[];
  readonly PICK: Readonly<Record<string, readonly string[]>>;
  readonly ROOM: Readonly<Record<string, number>>;
  readonly SCREEN: Readonly<Record<string, number>>;
  readonly TYPE_GROUP: string;
  readonly TYPE: Readonly<Record<string, Guide>>;
  readonly GUIDES: Readonly<Record<string, Guide>>;
};

/** One story file a card draws, with the stories it shows. */
export type Drawn = { readonly file: string; readonly base: string; readonly shown: readonly string[] };

/** A kit card: its component, its group, its guideline and the story files that draw it (none for a text primitive). */
export type KitCard = { readonly name: string; readonly group: string; readonly guide: Guide; readonly files: Drawn[] };

const SUFFIX = '.stories.tsx';

/** The stories one file gives its card: the ones picked for it, else its first six; refused when a pick names a story it lacks. */
const shownOf = (base: string, file: string) => {
  const names = storyNames(fs.readFileSync(file, 'utf8'));
  const picked = KIT_MAP.PICK[base];
  if (!picked) return names.slice(0, 6);
  const missing = picked.filter((name) => !names.includes(name));
  if (missing.length > 0)
    throw new Error(`${base}${SUFFIX} of the kit has no story ${missing.join(', ')}: fix PICK in tools/design-system/src/kit/kit-map.json`);
  return picked;
};

/** The story files of one group's folder, each a base name, the skipped ones left out. */
const basesIn = (dir: string) =>
  fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(SUFFIX))
    .map((name) => name.slice(0, -SUFFIX.length))
    .filter((base) => !KIT_MAP.SKIPPED.includes(base))
    .toSorted();

/** Refuses a card with no guideline, and a guideline whose component has no story file. */
const guided = (cards: readonly { name: string }[]) => {
  const unguided = cards.filter((card) => !KIT_MAP.GUIDES[card.name]).map((card) => card.name);
  if (unguided.length > 0)
    throw new Error(`no guideline for ${unguided.join(', ')}: add it to GUIDES in tools/design-system/src/kit/kit-map.json`);
  const unstoried = Object.keys(KIT_MAP.GUIDES).filter((name) => !cards.some((card) => card.name === name));
  if (unstoried.length > 0)
    throw new Error(`GUIDES names ${unstoried.join(', ')}, which has no story file in the kit: take it out of kit-map.json`);
};

/**
 * Every kit card, in the groups' order, then the text primitives.
 * @param kit the folder holding the kit's `stories/`.
 */
export const kitCards = (kit: string) => {
  const cards: { name: string; group: string; files: Drawn[] }[] = [];
  for (const [folder, group] of KIT_MAP.GROUPS) {
    const dir = path.join(kit, 'stories', folder);
    for (const base of basesIn(dir)) {
      const name = KIT_MAP.JOINED[base] ?? base;
      const file = path.join(dir, `${base}${SUFFIX}`);
      const drawn = { file, base, shown: shownOf(base, file) };
      const card = cards.find((one) => one.name === name);
      if (card) card.files.push(drawn);
      else cards.push({ name, group, files: [drawn] });
    }
  }
  guided(cards);
  const withGuides = cards.map((card) => ({ ...card, guide: KIT_MAP.GUIDES[card.name] as Guide }));
  const typeCards = Object.entries(KIT_MAP.TYPE).map(([name, guide]) => ({ name, group: KIT_MAP.TYPE_GROUP, guide, files: [] }));
  return [...withGuides, ...typeCards] satisfies KitCard[];
};
