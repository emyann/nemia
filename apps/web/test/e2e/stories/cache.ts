/**
 * The story pictures kept by what they are drawn from, so `shoot.ts` copies a picture rather than draws it again where nothing its
 * story draws from has changed, at the change and at the base alike.
 *
 * A picture's key (`keysOf`) is a SHA-256 over the render settings (`RENDER`), the theme, the story's id, and the path and the bytes'
 * SHA-256 of each file it is drawn from: every file the story file's imports reach and what every story is drawn in (`reachOf`, in
 * `shoot.ts`: the board's own `src`, `.storybook` and `theme` files, followed through their imports and the stylesheets' `@import`s),
 * every file under `apps/web/.storybook/`, `apps/web/theme/` and `apps/web/public/`, and the board's `package.json`, `vite.config.ts`
 * and `tsconfig.json`, which Storybook's build reads, each from the tree drawn; and from the workspace, whose `node_modules` both sides
 * are drawn over and whose tool draws them (`WORKSPACE_INPUTS`): its `package-lock.json`, which pins every package a story draws from,
 * the board's fonts among them (`@fontsource`), `objects`' source and `package.json`, the one package of the workspace the board
 * imports, linked rather than pinned, and the tool's own files, which take the picture. A path is said from its root, so the change's
 * tree and the base's extracted one key a story alike where their bytes agree.
 *
 * The pictures are kept in the folder `STORIES_CACHE` names, else `apps/web/node_modules/.cache/stories/` in the workspace, which git
 * ignores, as `<key>.png`: a factory may point the variable at a folder its sessions share, so each picture is written beside its
 * place and renamed into it. Nothing is ever removed from it.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { THEMES, type Theme } from './targets.ts';

/** The variable naming the folder the pictures are kept in. */
export const STORIES_CACHE = 'STORIES_CACHE';

/** How a story is drawn: a change to any of it is a change of every key. */
export const RENDER = {
  viewport: { width: 1280, height: 800 },
  reducedMotion: 'reduce',
  fullPage: true,
  animations: 'disabled',
} as const;

/** The folders, from the workspace root, every story is drawn from, each file under them read whole. */
const SHARED_FOLDERS = ['apps/web/.storybook', 'apps/web/theme', 'apps/web/public'];

/** The files, from the workspace root, Storybook's build of every story reads. */
const SHARED_FILES = ['apps/web/package.json', 'apps/web/vite.config.ts', 'apps/web/tsconfig.json'];

/** What every picture is drawn from in the workspace, whichever tree it is of: folders read whole, and files. */
const WORKSPACE_INPUTS = {
  folders: ['packages/objects/src'],
  files: [
    'package-lock.json',
    'packages/objects/package.json',
    'apps/web/test/e2e/stories/shoot.ts',
    'apps/web/test/e2e/stories/cache.ts',
    'apps/web/test/e2e/stories/built.ts',
    'apps/web/test/e2e/board.ts',
  ],
};

/** One picture of a story: its id and its theme. */
export type Picture = { id: string; theme: Theme };

/** A picture's name in the keys (`keysOf`): `<id>-<theme>`. */
export const keyName = ({ id, theme }: Picture) => `${id}-${theme}`;

/** A picture's file name under `prefix`: `<prefix><id>-<theme>.png`. */
export const pictureName = (prefix: string, picture: Picture) => `${prefix}${keyName(picture)}.png`;

/**
 * The folder the pictures are kept in: the one `STORIES_CACHE` names, else the board's `node_modules/.cache/stories` in the workspace.
 * @param root The workspace root.
 */
export const cacheDirOf = (root: string) =>
  process.env[STORIES_CACHE] || path.join(root, 'apps', 'web', 'node_modules', '.cache', 'stories');

/** Each file under `dir`, from `root`, sorted; none where it is no folder. */
const filesUnder = (root: string, dir: string) => {
  const at = path.join(root, dir);
  if (!fs.statSync(at, { throwIfNoEntry: false })?.isDirectory()) return [] satisfies string[];
  return fs
    .readdirSync(at, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(dir, path.relative(at, path.join(entry.parentPath, entry.name)).split(path.sep).join('/')))
    .sort() satisfies string[];
};

/**
 * The files, from `root`, every story of the tree there is drawn from, past those its imports reach.
 * @param root The root of the tree: the workspace, or the base's extracted board's.
 */
export const sharedInputs = (root: string) =>
  [
    ...SHARED_FOLDERS.flatMap((dir) => filesUnder(root, dir)),
    ...SHARED_FILES.filter((file) => fs.existsSync(path.join(root, file))),
  ] satisfies string[];

/** The SHA-256 of `file`'s bytes, `absent` where there is none. */
const digestOf = (file: string) => (fs.existsSync(file) ? createHash('sha256').update(fs.readFileSync(file)).digest('hex') : 'absent');

/**
 * Each file, from `workspace`, every picture is drawn from in it (`WORKSPACE_INPUTS`), with its digest, a line each.
 * @param workspace The workspace root.
 */
export const workspaceDigest = (workspace: string) =>
  [...WORKSPACE_INPUTS.folders.flatMap((dir) => filesUnder(workspace, dir)), ...WORKSPACE_INPUTS.files]
    .map((file) => `workspace:${file}\t${digestOf(path.join(workspace, file))}\n`)
    .join('');

/**
 * Each picture's key, by its name under no prefix (`<id>-<theme>`).
 * @param root The root of the tree the pictures are drawn from.
 * @param workspace The workspace root: the base too is drawn over its `node_modules`, by its tool (`workspaceDigest`).
 * @param reaches Each story id's files, from `root`, its imports reach (`reachOf`).
 * @param pictures The pictures to key.
 */
export function keysOf(root: string, workspace: string, reaches: ReadonlyMap<string, readonly string[]>, pictures: readonly Picture[]) {
  const digests = new Map<string, string>();
  const digest = (file: string) => {
    const known = digests.get(file);
    if (known !== undefined) return known;
    const made = digestOf(path.join(root, file));
    digests.set(file, made);
    return made;
  };
  const shared = sharedInputs(root);
  const drawnBy = workspaceDigest(workspace);
  const keys = new Map<string, string>();
  for (const picture of pictures) {
    const files = [...new Set([...(reaches.get(picture.id) ?? []), ...shared])].sort();
    const hash = createHash('sha256');
    hash.update(`render\t${JSON.stringify(RENDER)}\ntheme\t${picture.theme}\nid\t${picture.id}\n${drawnBy}`);
    for (const file of files) hash.update(`${file}\t${digest(file)}\n`);
    keys.set(keyName(picture), hash.digest('hex'));
  }
  return keys satisfies Map<string, string>;
}

/** Each picture of `ids`, in each theme, theme by theme. */
export const picturesOf = (ids: readonly string[]) => THEMES.flatMap((theme) => ids.map((id) => ({ id, theme }))) satisfies Picture[];

/**
 * Copies each picture of `pictures` the cache holds into `out` under `prefix`; the pictures it did not hold, to draw.
 * @param cache The cache's folder; none where the cache is not read (`--no-cache`).
 * @param keys Each picture's key (`keysOf`).
 * @param pictures The pictures wanted.
 * @param out The folder they are wanted in.
 * @param prefix The prefix of their names there.
 */
export function takenFromCache(
  cache: string | undefined,
  keys: ReadonlyMap<string, string>,
  pictures: readonly Picture[],
  out: string,
  prefix: string,
) {
  if (cache === undefined) return [...pictures] satisfies Picture[];
  return pictures.filter((picture) => {
    const kept = path.join(cache, `${keys.get(keyName(picture))}.png`);
    if (!fs.existsSync(kept)) return true;
    fs.copyFileSync(kept, path.join(out, pictureName(prefix, picture)));
    return false;
  }) satisfies Picture[];
}

/**
 * Keeps each picture of `pictures` drawn into `out` under `prefix` in the cache, written beside its place and renamed into it, so a
 * session sharing the folder reads a whole picture or none.
 * @param cache The cache's folder; none where the cache is not written (`--no-cache`).
 * @param keys Each picture's key (`keysOf`).
 * @param pictures The pictures drawn.
 * @param out The folder they were drawn into.
 * @param prefix The prefix of their names there.
 */
export function keptInCache(
  cache: string | undefined,
  keys: ReadonlyMap<string, string>,
  pictures: readonly Picture[],
  out: string,
  prefix: string,
) {
  if (cache === undefined) return;
  fs.mkdirSync(cache, { recursive: true });
  for (const picture of pictures) {
    const drawn = path.join(out, pictureName(prefix, picture));
    const key = keys.get(keyName(picture));
    if (key === undefined || !fs.existsSync(drawn)) continue;
    const kept = path.join(cache, `${key}.png`);
    const writing = `${kept}.${process.pid}.writing`;
    fs.copyFileSync(drawn, writing);
    fs.renameSync(writing, kept);
  }
}
