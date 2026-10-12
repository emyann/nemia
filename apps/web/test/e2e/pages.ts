/**
 * The pages the e2e visits: every file in `pages/`, and nothing else. A page is a file `NNN-<name>.ts` whose default export is its
 * `PageSpec`, named `<name>`. They are visited in the order of their file names compared as plain strings — by the number, the same three
 * digits on every file, then by the name — never in the order the directory lists them. So adding a page is adding a file: two runs that
 * each add one touch no line in common, and merge. Two that pick the same number merge too, and are visited by name.
 *
 * A page reads only the seed and what it writes itself, and takes back what it wrote before it ends: each worker of a run seeds a store of
 * its own and visits its share of the pages in this order (workers.ts), and a run of some pages visits those alone. A new page's number
 * says where it goes, and the numbers go in tens to leave room.
 *
 * Beside the pages, `pages/NAMES` says which pages there are, a name a line, in no order that matters. The directory alone cannot tell a
 * page deleted by mistake from one never written, so the load refuses a page with no line and a line with no page. The file is merged by
 * union (`.gitattributes`): two runs that each add a page and its line merge.
 *
 * Which of them a run visits, in which themes, and which it pictures, is its plan (`planOf`), read from its command line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PageSpec, Theme } from './visit.ts';

export const PAGES_DIR = path.join(import.meta.dirname, 'pages');

/** The file in `pages/` that says which pages there are. */
export const NAMES = 'NAMES';

/** A page's file name: three digits, a dash, and the page's name — what its screenshots are called. */
const PAGE_FILE = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/;

/** The order the pages are visited in: their file names, compared as plain strings. */
export const orderOf = (names: readonly string[]): string[] => [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/** The page a file is: its name without its number. */
const nameOf = (file: string): string => PAGE_FILE.exec(file)![2];

/** The pages `dir`'s NAMES says there are: its lines, trimmed, the blank ones left out. */
export function namesIn(dir = PAGES_DIR): Set<string> {
  const file = path.join(dir, NAMES);
  if (!fs.existsSync(file))
    throw new Error(`${file} is not there, and it says which pages the e2e visits: write it, the name of each page on a line of its own.`);
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

/**
 * The page files in `dir`, in the order they are visited. Refuses anything else there but NAMES — a helper, a page without its number, a
 * folder or a link — since the runner would never visit it: a page that is not visited checks nothing, and says nothing about it. And
 * refuses when the pages and NAMES differ either way. `list` is how the directory is read, for a test to hand it one that lists its files
 * in an order of its own.
 */
export function pageFiles(
  dir = PAGES_DIR,
  list: (dir: string) => fs.Dirent[] = (d) => fs.readdirSync(d, { withFileTypes: true }),
): string[] {
  const entries = list(dir).filter((entry) => !(entry.name === NAMES && entry.isFile()));
  const strays = entries.filter((entry) => !entry.isFile() || !PAGE_FILE.test(entry.name)).map((entry) => entry.name);
  if (strays.length) {
    throw new Error(
      `${dir} holds only pages, each a file NNN-<name>.ts, and ${NAMES}, and the e2e would never visit ${orderOf(strays).join(', ')}. ` +
        'Name a page for its place and its name (250-<name>.ts); put a helper beside pages.ts (board.ts, canvas.ts), not in pages/.',
    );
  }
  const files = orderOf(entries.map((entry) => entry.name));
  const names = namesIn(dir);
  const unlisted = files.filter((file) => !names.has(nameOf(file)));
  if (unlisted.length) {
    throw new Error(
      `${unlisted.join(', ')} ${unlisted.length > 1 ? 'are pages' : 'is a page'} ${path.join(dir, NAMES)} does not name: ` +
        `add a line for each (${unlisted.map(nameOf).join(', ')}), or the e2e cannot tell it went missing.`,
    );
  }
  const pages = new Set(files.map(nameOf));
  const missing = [...names].filter((name) => !pages.has(name)).sort();
  if (missing.length) {
    throw new Error(
      `${path.join(dir, NAMES)} names ${missing.join(', ')}, and ${dir} has no page file for ${missing.length > 1 ? 'them' : 'it'}, ` +
        'so the e2e would not visit it: restore the file (NNN-<name>.ts, from git), or, if the page was deleted on purpose, delete its line from NAMES.',
    );
  }
  return files;
}

const isPageSpec = (spec: unknown): spec is PageSpec =>
  typeof spec === 'object' &&
  spec !== null &&
  typeof (spec as PageSpec).name === 'string' &&
  typeof (spec as PageSpec).route === 'string' &&
  typeof (spec as PageSpec).expect === 'function';

/** Every page in `dir`, in the order they are visited, each once. */
export async function loadPages(dir = PAGES_DIR): Promise<PageSpec[]> {
  const pages: PageSpec[] = [];
  const from = new Map<string, string>();
  for (const file of pageFiles(dir)) {
    const { default: spec } = (await import(pathToFileURL(path.join(dir, file)).href)) as { default?: unknown };
    if (!isPageSpec(spec)) throw new Error(`${file} default-exports its page: export default { name, route, expect } satisfies PageSpec.`);
    const name = nameOf(file);
    if (spec.name !== name)
      throw new Error(
        `${file} is the ${name} page, which its screenshots are named for, and it says it is ${spec.name}: make the two the same.`,
      );
    const other = from.get(spec.name);
    if (other)
      throw new Error(
        `${other} and ${file} are both the ${spec.name} page, which would be visited twice and photographed over itself: rename one.`,
      );
    from.set(spec.name, file);
    pages.push(spec);
  }
  if (!pages.length) throw new Error(`${dir} has no page in it, and an e2e that visits nothing passes: put the pages back.`);
  return pages;
}

/**
 * What a run of the e2e does, read from its command line: the pages it `visit`s, in their order; the `themes` it visits them in; whether a
 * page is `pictured`; how many `workers` it asks for, if it does; and whether it is `whole` — every page, in the dark theme alone, the run
 * a check makes, which is held to the e2e's bound (`overBound`, timing.ts). With no flag, every page in the dark theme, pictured by none:
 * the assertions alone. `--photos` visits light, then dark, and pictures each page visited; `--pages <name,…>` visits only the pages
 * named, in the order of the pages, and with `--photos` pictures them; `--contrast`, with `--photos`, has each picture's text pairs
 * `measured` beside it (contrast.ts), and is refused without it; `--workers <n>` sets how many workers visit them. Refuses a flag it
 * does not know, a name that is no page (listing the pages there are), `--pages` with no name after it, and `--workers` with no whole
 * number of one or more.
 */
export function planOf<P extends { name: string }>(
  argv: readonly string[],
  pages: readonly P[],
): { visit: P[]; themes: Theme[]; pictured: (name: string) => boolean; measured: boolean; workers?: number; whole: boolean } {
  let photos = false;
  let measured = false;
  let named: string[] | undefined;
  let workers: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--photos') photos = true;
    else if (argv[i] === '--contrast') measured = true;
    else if (argv[i] === '--pages') named = namesAfter(argv[++i]);
    else if (argv[i] === '--workers') workers = workersAfter(argv[++i]);
    else
      throw new Error(
        `the e2e takes --photos, --contrast, --pages <name,…> and --workers <n>, not ${argv[i]}: npm run e2e -- --photos --pages <name,…>`,
      );
  }
  if (measured && !photos)
    throw new Error('--contrast measures what is pictured, and nothing is without --photos: npm run e2e -- --photos --contrast');
  const themes: Theme[] = photos ? ['light', 'dark'] : ['dark'];
  if (!named) return { visit: [...pages], themes, pictured: () => photos, measured, workers, whole: !photos };
  const all = pages.map((p) => p.name);
  const unknown = named.filter((name) => !all.includes(name));
  if (unknown.length)
    throw new Error(`the e2e has no page ${unknown.join(', ')}: name pages there are, as pages/NAMES lists them: ${all.join(', ')}`);
  const chosen = new Set(named);
  return {
    visit: pages.filter((p) => chosen.has(p.name)),
    themes,
    pictured: (name) => photos && chosen.has(name),
    measured,
    workers,
    whole: false,
  };
}

/** The number `--workers` is given: a whole number, one or more; refuses anything else, and a flag in its place. */
function workersAfter(arg: string | undefined): number {
  const n = Number(arg);
  if (!arg || !/^\d+$/.test(arg) || n < 1)
    throw new Error(`--workers takes a whole number of workers, one or more (--workers 4), not ${arg ?? 'nothing'}`);
  return n;
}

/** The page names `--pages` is given, comma-separated; refuses none, and a flag in their place. */
function namesAfter(arg: string | undefined): string[] {
  const names = (arg?.startsWith('--') ? '' : (arg ?? ''))
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
  if (!names.length) throw new Error('--pages names no page: give it the pages to visit, separated by commas (--pages factory,runs)');
  return names;
}
