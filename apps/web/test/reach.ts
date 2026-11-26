/**
 * What a file of the board reaches through its imports: every file of the board's own (`src`, `.storybook` and `theme`) its imports
 * name, followed through each such file's imports, a stylesheet's `@import`s included. Read by the stories' hand-over
 * (`e2e/stories/changed.ts`) and by the rulebook's view of a page (`rulebook.test.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { importsIn } from 'test-kit/imports';

/** The board's folder, from the workspace root. */
const BOARD = 'apps/web';

/** What the board's own imports reach: its source, its Storybook's files and its theme. */
const OWN = /^apps\/web\/(src|\.storybook|theme)\//;

/** Each local stylesheet a stylesheet's text `@import`s, outside its comments, by its specifier. */
const cssImportsIn = (text: string) =>
  [...text.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s+(?:url\(\s*)?['"]([^'"]+)['"]/g)].flatMap((m) =>
    m[1]?.startsWith('.') ? [m[1]] : [],
  );

/** The modules `file`'s text names: a stylesheet's `@import`s, a module's imports. */
const specsOf = (file: string, text: string) => (file.endsWith('.css') ? cssImportsIn(text) : importsIn(text).map(({ spec }) => spec));

/** The file `spec`, imported by `from`, resolves to among the workspace's files, from its root; none for a package or a file not there. */
const resolved = (root: string, from: string, spec: string) => {
  const named = spec.startsWith('@/')
    ? path.posix.join(BOARD, 'src', spec.slice(2))
    : spec.startsWith('.')
      ? path.posix.join(path.posix.dirname(from), spec)
      : undefined;
  if (named === undefined) return undefined;
  for (const tail of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const file = named + tail;
    if (fs.statSync(path.join(root, file), { throwIfNoEntry: false })?.isFile()) return file;
  }
  return undefined;
};

/**
 * Each file of the board's own `file`'s text names, by its path from the workspace root.
 * @param root The workspace root.
 * @param file The file read, from the workspace root.
 */
export const ownOf = (root: string, file: string) =>
  specsOf(file, fs.readFileSync(path.join(root, file), 'utf8')).flatMap((spec) => {
    const next = resolved(root, file, spec);
    return next !== undefined && OWN.test(next) ? [next] : [];
  });

/**
 * What `from` reaches: each of its files, then every file of the board's own their imports reach, followed, in the order found. A
 * file of `stops` is reached but not followed: what it imports is reached only by another way.
 * @param root The workspace root.
 * @param from The files the walk starts at, from the workspace root.
 * @param stops The files the walk does not follow into, from the workspace root.
 */
export const reached = (root: string, from: readonly string[], stops: ReadonlySet<string> = new Set()) => {
  const reaches = [...new Set(from)];
  for (let at = 0; at < reaches.length; at++) {
    const file = reaches[at] ?? '';
    if (stops.has(file)) continue;
    for (const next of ownOf(root, file)) if (!reaches.includes(next)) reaches.push(next);
  }
  return reaches;
};
