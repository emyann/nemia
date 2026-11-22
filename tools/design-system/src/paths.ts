/**
 * Where the producer reads and writes, from the repository it lies in: the board (`apps/web`), its sources and its Storybook, the cache
 * the kit's stories and the generated entry are kept in (`node_modules/.cache/design-system`), and the build's folder, whose `project/`
 * holds the artifact's files, `shots/` the verification's pictures, and `manifest.json` and `CHANGES.json` beside them.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

/** The repository's root. */
export const REPO = path.resolve(import.meta.dirname, '..', '..', '..');

/** The board's workspace. */
export const WEB = path.join(REPO, 'apps', 'web');

/** The board's sources, what `@/` names in its imports. */
export const SRC = path.join(WEB, 'src');

/** The board's Storybook configuration, whose `stage.tsx` the cards are drawn under. */
export const STORYBOOK = path.join(WEB, '.storybook');

/** The producer's own workspace, whose `node_modules` holds React 18. */
export const OWN = path.resolve(import.meta.dirname, '..');

/** What the producer keeps between builds: the kit's stories by version, and the files it generates for esbuild and TypeScript. */
export const CACHE = path.join(REPO, 'node_modules', '.cache', 'design-system');

/** The folder the generated entry and stylesheets are written to, made afresh by each build. */
export const WORK = path.join(CACHE, 'work');

/** A `require` that resolves as the board does, for the packages its code and its stories import. */
export const requireOfTheBoard = createRequire(path.join(WEB, 'package.json'));

/** A `require` that resolves from the producer's workspace, where React 18 lies. */
export const requireOwn = createRequire(path.join(OWN, 'package.json'));

/** The folders a build writes, under its folder `out`. */
export const layout = (out: string) => ({
  out,
  project: path.join(out, 'project'),
  shots: path.join(out, 'shots'),
  manifest: path.join(out, 'manifest.json'),
  changes: path.join(out, 'CHANGES.json'),
});

/** What a build's folders are. */
export type Layout = ReturnType<typeof layout>;

/** The last commit that changed the board, short, and its date: what tokens.json says it was built from, moved by the board alone. */
export const headOf = () => {
  const said = execFileSync('git', ['log', '-1', '--format=%h %cs', '--', 'apps/web'], { cwd: REPO, encoding: 'utf8' }).trim();
  const [sha = 'unknown', date = 'unknown'] = said.split(' ');
  return { sha, date };
};

/** Every file under `dir`, by its path from `dir` with `/` between folders, sorted. */
export const filesUnder = (dir: string) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .toSorted()
    : [];

/** Writes `text` at `file`, its folder made first. */
export const writeIn = (file: string, text: string | Buffer) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** The JSON at `file`, as the caller types it. */
export const readJson = <T>(file: string) => JSON.parse(fs.readFileSync(file, 'utf8')) as T;
