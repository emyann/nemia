/**
 * The pages the e2e visits: every file in `pages/`, and nothing else. A page is a file `NNN-<name>.ts` whose default export is its
 * `PageSpec`, named `<name>`. They are visited in the order of their file names compared as plain strings — by the number, the same three
 * digits on every file, then by the name — never in the order the directory lists them. So adding a page is adding a file: two runs that
 * each add one touch no line in common, and merge. Two that pick the same number merge too, and are visited by name.
 *
 * The order matters: the pages share one seeded store, and each takes back what it wrote before the next is visited. A new page's number
 * says where it goes, and the numbers go in tens to leave room.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PageSpec } from './visit.ts';

export const PAGES_DIR = path.join(import.meta.dirname, 'pages');

/** A page's file name: three digits, a dash, and the page's name — what its screenshots are called. */
const PAGE_FILE = /^(\d{3})-([a-z0-9]+(?:-[a-z0-9]+)*)\.ts$/;

/** The order the pages are visited in: their file names, compared as plain strings. */
export const orderOf = (names: readonly string[]): string[] => [...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

/**
 * The page files in `dir`, in the order they are visited. Refuses anything else there — a helper, a page without its number, a folder or a
 * link — since the runner would never visit it: a page that is not visited checks nothing, and says nothing about it. `list` is how the
 * directory is read, for a test to hand it one that lists its files in an order of its own.
 */
export function pageFiles(dir = PAGES_DIR, list: (dir: string) => fs.Dirent[] = (d) => fs.readdirSync(d, { withFileTypes: true })): string[] {
  const entries = list(dir);
  const strays = entries.filter((entry) => !entry.isFile() || !PAGE_FILE.test(entry.name)).map((entry) => entry.name);
  if (strays.length) {
    throw new Error(`${dir} holds only pages, each a file NNN-<name>.ts, and the e2e would never visit ${orderOf(strays).join(', ')}. ` +
      'Name a page for its place and its name (250-<name>.ts); put a helper beside pages.ts (board.ts, canvas.ts), not in pages/.');
  }
  return orderOf(entries.map((entry) => entry.name));
}

const isPageSpec = (spec: unknown): spec is PageSpec =>
  typeof spec === 'object' && spec !== null && typeof (spec as PageSpec).name === 'string' && typeof (spec as PageSpec).route === 'string' &&
  typeof (spec as PageSpec).expect === 'function';

/** Every page in `dir`, in the order they are visited, each once. */
export async function loadPages(dir = PAGES_DIR): Promise<PageSpec[]> {
  const pages: PageSpec[] = [];
  const from = new Map<string, string>();
  for (const file of pageFiles(dir)) {
    const { default: spec } = (await import(pathToFileURL(path.join(dir, file)).href)) as { default?: unknown };
    if (!isPageSpec(spec)) throw new Error(`${file} default-exports its page: export default { name, route, expect } satisfies PageSpec.`);
    const name = PAGE_FILE.exec(file)![2]!;
    if (spec.name !== name) throw new Error(`${file} is the ${name} page, which its screenshots are named for, and it says it is ${spec.name}: make the two the same.`);
    const other = from.get(spec.name);
    if (other) throw new Error(`${other} and ${file} are both the ${spec.name} page, which would be visited twice and photographed over itself: rename one.`);
    from.set(spec.name, file);
    pages.push(spec);
  }
  if (!pages.length) throw new Error(`${dir} has no page in it, and an e2e that visits nothing passes: put the pages back.`);
  return pages;
}
