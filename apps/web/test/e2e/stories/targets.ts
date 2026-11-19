/**
 * A person's targets set beside the stories they are for: `changed.ts --targets <dir>` reads the folder's
 * `target-<story id>[-light|-dark].png` (`targetsOf`; a name with no theme is for both, every other file ignored), pairs each with
 * the story's approved picture at the head (`matchesOf`: the dark one, and the light one of a light canary; it names the targets whose
 * story no story file holds, with the nearest ids, and a light target of a story that is no canary, which has no light picture), and
 * composes each pair into one picture (`composeMatch`): the target on the left, the story on the right, scaled to one height, each
 * captioned, on the board's ground.
 */
import fs from 'node:fs';
import type { Browser } from 'playwright';

/** The themes a story is pictured in, in order. */
export const THEMES = ['light', 'dark'] as const;

/** A theme a story is pictured in. */
export type Theme = (typeof THEMES)[number];

/** A target's file name: the story id, then the theme it is of where it names one; the factory's picture check reads it the same way. */
const TARGET = /^target-(.+?)(?:-(light|dark))?\.png$/i;

/** A target picture: its file name, the story id it is for, and the themes it is of. */
export type Target = { file: string; id: string; themes: readonly Theme[] };

/**
 * The targets among `names`, a folder's file names, in name order: each `target-<id>[-light|-dark].png`, of its own theme or of both.
 * @param names The file names of the targets' folder.
 */
export const targetsOf = (names: readonly string[]) =>
  [...names].sort().flatMap((file) => {
    const named = TARGET.exec(file);
    const id = named?.[1];
    if (id === undefined) return [];
    const theme = named?.[2]?.toLowerCase();
    return [{ file, id, themes: theme === 'light' || theme === 'dark' ? [theme] : THEMES }];
  }) satisfies Target[];

/**
 * One match: the story and theme, the target's file name, the story's approved picture at the head (from the board's folder), and the
 * match written.
 */
export type Match = { id: string; theme: Theme; target: string; story: string; match: string };

/** A target whose story id no story holds: its file, and the ids nearest it. */
export type Unknown = { file: string; nearest: string[] };

/** The edits that turn `a` into `b`, one character at a time. */
const distance = (a: string, b: string) => {
  let row = Array.from({ length: b.length + 1 }, (_, at) => at);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next.push(Math.min((row[j] ?? 0) + 1, (next[j - 1] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)));
    row = next;
  }
  return row[b.length] ?? 0;
};

/** The ids of `known` nearest `id`, three at most, the nearest first. */
const nearestOf = (id: string, known: readonly string[]) =>
  [...known].sort((a, b) => distance(id, a) - distance(id, b) || a.localeCompare(b)).slice(0, 3) satisfies string[];

/**
 * Each target of `targets` paired with its story's approved picture in each theme it is of that the story has one in, one match per
 * story and theme, a target naming its theme winning over one naming none: the dark picture of every story, the light one of a canary
 * alone. Beside them, each target whose id is none of `known`, with the nearest, and each target that names the light theme of a story
 * that is no canary (`lightless`).
 * @param targets The targets read off the folder (`targetsOf`).
 * @param known Every story id of the board.
 * @param canaries The stories approved in the light theme too (`LIGHT_CANARIES`).
 */
export function matchesOf(targets: readonly Target[], known: readonly string[], canaries: readonly string[]) {
  const held = new Set(known);
  const unknown = targets
    .filter((target) => !held.has(target.id))
    .map((target) => ({ file: target.file, nearest: nearestOf(target.id, known) }));
  const lightless = targets
    .filter((target) => held.has(target.id) && target.themes.length === 1 && target.themes[0] === 'light' && !canaries.includes(target.id))
    .map((target) => target.file);
  const chosen = new Map<string, Match>();
  for (const target of targets) {
    if (!held.has(target.id)) continue;
    for (const theme of target.themes) {
      if (theme === 'light' && !canaries.includes(target.id)) continue;
      const key = `${target.id}-${theme}`;
      if (chosen.has(key) && target.themes.length > 1) continue;
      const story = `test/approved/${theme === 'light' ? 'light/' : ''}${target.id}.png`;
      chosen.set(key, { id: target.id, theme, target: target.file, story, match: `match-${key}.png` });
    }
  }
  const matches = [...chosen.values()].sort((a, b) => a.id.localeCompare(b.id) || THEMES.indexOf(a.theme) - THEMES.indexOf(b.theme));
  return { matches, unknown, lightless } satisfies { matches: Match[]; unknown: Unknown[]; lightless: string[] };
}

/** A PNG's width and height, read off its header. */
const sizeOf = (png: Buffer) => ({ width: png.readUInt32BE(16), height: png.readUInt32BE(20) }) satisfies { width: number; height: number };

/** The space around and between the two pictures, in pixels. */
const GAP = 24;

/** The height of a caption over its picture, in pixels. */
const CAPTION = 28;

/**
 * Writes the match of `target` and `story` as one PNG, `out`, by the e2e's `photograph`: both scaled to the lower of their two
 * heights, so neither is enlarged, the target on the left captioned `target` and the story on the right captioned `after · <head>`,
 * on the board's ground in `theme`.
 * @param browser The Chromium the pictures are taken in.
 * @param pair The target's file, the story's picture, the theme, the short head the story was drawn at, the board's theme stylesheet,
 * and the match's file.
 */
export async function composeMatch(
  browser: Browser,
  pair: { target: string; story: string; theme: Theme; head: string; css: string; out: string },
) {
  const { photograph } = await import('../board.ts');
  const pictures = [pair.target, pair.story].map((file) => fs.readFileSync(file));
  const sizes = pictures.map(sizeOf);
  const height = Math.min(...sizes.map((size) => size.height));
  const widths = sizes.map((size) => Math.round((size.width * height) / size.height));
  const width = widths.reduce((sum, at) => sum + at, 0) + GAP * 3;
  const captions = ['target', `after · ${pair.head}`];
  const figures = pictures
    .map(
      (png, at) =>
        `<figure><figcaption>${captions[at]}</figcaption>` +
        `<img width="${widths[at]}" height="${height}" src="data:image/png;base64,${png.toString('base64')}"></figure>`,
    )
    .join('');
  const page = await browser.newPage({ colorScheme: pair.theme, viewport: { width, height: height + CAPTION + GAP * 2 } });
  try {
    await page.setContent(
      `<!doctype html><html><head><style>${pair.css}</style><style>` +
        'html,body{margin:0;background:var(--md-sys-color-background);color:var(--md-sys-color-on-background)}' +
        `body{display:flex;gap:${GAP}px;padding:${GAP}px;width:max-content;font:14px/1 ui-monospace,monospace}` +
        `figure{margin:0}figcaption{height:${CAPTION}px;opacity:.8}img{display:block}` +
        `</style></head><body>${figures}</body></html>`,
      { waitUntil: 'load' },
    );
    await photograph(page, pair.out, { fullPage: true, always: true });
  } finally {
    await page.close();
  }
}
