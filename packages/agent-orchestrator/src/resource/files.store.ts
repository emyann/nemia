/**
 * The files of a step a run's page shows: each a closeout named, and each its folder holds, as the api serves them by their path under
 * the step's folder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir, statUnder } from '../record/record.store.ts';
import { artifactPlace, filesPrunedWords, GIVEN, HANDED_CLOSEOUT, isRepositoryRun, type Run } from '../run.ts';
import type { ArtifactKind } from 'objects';
import { isFilePath } from '../artifacts/artifacts.ts';

/**
 * A file a closeout named. A file under the step's files directory (`artifactsDir`), at its top or in a folder beneath it, by a path
 * the artifacts route serves (`statUnder`), is that path as its `name`, where the api serves it, its kind and its size. Anything else is
 * the path as the closeout gave it: a path on the step's branch, a file the directory does not have, one reached through a link, or an
 * absolute path anywhere else — which
 * is not looked at, as `nemia decide` does not look at it (`artifactPlace`). A file of the files directory that is not there on a run
 * `nemia prune --artifacts` pruned is the path and what removed it, when (`filesPrunedWords`): gone, not missing. `prunedAt` is
 * that moment alone, for a page that draws it as it draws every other time.
 */
export type StepArtifact =
  | { path: string; relativePath?: string }
  | { path: string; relativePath?: string; name: string; url: string; kind: ArtifactKind; size: number }
  | { path: string; relativePath?: string; pruned: string; prunedAt: string };

/** A value a closeout handed on, by its name: `link` is the value where it is an http(s) address the board may link to, else null. */
export type StepValue = { name: string; value: string; link: string | null };

/**
 * A value a closeout handed on, as the board shows it (`StepValue`): linked only where the value is a whole URL whose protocol is
 * `http:` or `https:`, so a `javascript:` value, or text that is no URL, is shown and never followed.
 * @param v The value's name and its text, as the closeout handed it on.
 */
export function valueOf(v: { name: string; value: string }) {
  let link: string | null = null;
  try {
    const url = new URL(v.value.trim());
    if (url.protocol === 'http:' || url.protocol === 'https:') link = url.href;
  } catch {
    link = null;
  }
  return { name: v.name, value: v.value, link };
}

/**
 * By extension: the type a file is served with, and what the board does with it. Text a step wrote is shown as text. An HTML or a script
 * file among it is an agent's text too: as `text/plain`, a tab shows it rather than running it on the board's origin.
 */
const TYPES: Record<string, { type: string; kind: ArtifactKind }> = {
  '.png': { type: 'image/png', kind: 'image' },
  '.jpg': { type: 'image/jpeg', kind: 'image' },
  '.jpeg': { type: 'image/jpeg', kind: 'image' },
  '.gif': { type: 'image/gif', kind: 'image' },
  '.webp': { type: 'image/webp', kind: 'image' },
  '.avif': { type: 'image/avif', kind: 'image' },
  '.svg': { type: 'image/svg+xml', kind: 'image' },
  '.json': { type: 'application/json; charset=utf-8', kind: 'text' },
  '.pdf': { type: 'application/pdf', kind: 'other' },
  ...Object.fromEntries(
    ['.txt', '.md', '.log', '.csv', '.tsv', '.yaml', '.yml', '.xml', '.html', '.diff', '.patch', '.ts', '.tsx', '.js', '.css', '.sh'].map(
      (ext) => [ext, { type: 'text/plain; charset=utf-8', kind: 'text' as const }],
    ),
  ),
};

/**
 * The type the file `name` is served with, by its extension, and what the board does with it; an unknown one is bytes, linked.
 * @param name The file's name.
 */
export const typeOf = (name: string) =>
  TYPES[path.extname(name).toLowerCase()] ?? { type: 'application/octet-stream', kind: 'other' as const };

/**
 * Why a path is not one the file routes serve under a step's folder, or null when it is (`isFilePath`): an absolute path, one with a
 * `..`, a backslash or a NUL in it, or an empty part, is refused before the disk is touched.
 * @param rel The path the route was asked for, from the folder.
 */
export function refusedPath(rel: string) {
  if (!isFilePath(rel)) {
    return `\`${rel}\` is not the path of a file under the step's folder: its parts are split at \`/\`, and none is empty, \`.\`, or has \`..\` or \`\\\` in it. GET /api/runs/<run> lists each step's closeout, whose \`artifacts\` carry the \`url\` of every file the api serves.`;
  }
  return null;
}

/**
 * Where the api serves the file at `rel` under a step's folder: the route, then the path encoded whole as one segment, its `/` as
 * `%2F`, as the route takes it.
 */
const urlOf = (run: Pick<Run, 'id'>, step: string, route: 'files' | 'artifacts', rel: string) =>
  `/api/runs/${encodeURIComponent(run.id)}/steps/${encodeURIComponent(step)}/${route}/${encodeURIComponent(rel)}`;

/** A regular file directly in `dir` by `name`, without following a link: a link that leads out of the directory is not a file in it. */
function fileIn(dir: string, name: string) {
  const stat = fs.lstatSync(path.join(dir, name), { throwIfNoEntry: false });
  return stat?.isFile() ? stat : undefined;
}

/**
 * A path a closeout named, as the board shows it (`StepArtifact`). Once the step's artifacts directory is pruned, a file anywhere under it
 * is pruned with it, one in a directory beneath it included.
 * @param home The store's folder.
 * @param run The run, its id and what was pruned of it.
 * @param step The step's name.
 * @param file The path the closeout named.
 * @param work The folder the step of a folder run works in, whose files a closeout names by absolute path; null for a repository run's.
 */
export function artifactOf(home: string, run: Pick<Run, 'id' | 'pruned'>, step: string, file: string, work: string | null) {
  const dir = artifactsDir(home, run, step);
  const files = run.pruned?.artifacts;
  const place = artifactPlace(file, dir);
  if (place !== 'files') return { path: file, ...relativeOf(file, place, work) };
  const at = { path: file, relativePath: path.relative(path.resolve(dir), path.resolve(file)) };
  if (files && !fs.existsSync(dir)) return { ...at, pruned: filesPrunedWords(files), prunedAt: files.at };
  const name = at.relativePath.split(path.sep).join('/');
  const stat = statUnder(dir, name);
  if (!stat) return files ? { ...at, pruned: filesPrunedWords(files), prunedAt: files.at } : at;
  return { ...at, name, url: urlOf(run, step, 'artifacts', name), kind: typeOf(name).kind, size: stat.size };
}

/**
 * The path from a step's folder of a file a closeout named outside its artifacts folder: a path from the workspace root as it is, since
 * the run collects it at that path; an absolute one inside a folder run's own folder from that folder; none for any other.
 */
function relativeOf(file: string, place: ReturnType<typeof artifactPlace>, work: string | null) {
  if (place === 'workspace') return { relativePath: path.normalize(file) };
  if (place !== 'outside' || work === null) return {};
  const within = path.relative(path.resolve(work), path.resolve(file));
  if (!within || within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) return {};
  return { relativePath: within };
}

/** Whether a path is a directory in its own right — a symlink to one is not, so a link the run did not make is listed as any link is. */
const isDirectory = (at: string) => {
  try {
    return fs.lstatSync(at).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Everything a step's folder holds, for a person who never opens a terminal: each regular file directly in `dir`, by name, as the
 * `route` it is linked under serves it — `files` for a folder step's own folder, `artifacts` for any step's artifacts folder
 * (`artifactsDir`) — its size and what the board does with it. Newest-looking first is not worth guessing at:
 * they are listed in name order, as a directory listing reads.
 *
 * What the route cannot serve is listed all the same, by its path alone, drawn as any path a closeout named that the api does not
 * serve here: a directory, a link (`fileIn` follows none), a name with a separator or `..` in it. A file inside a directory is served by
 * its path where a closeout names it, and is not listed here, which lists the folder's top alone — but a folder holding only `notes/`
 * is not an empty folder, and the
 * board, which turns an empty list into *the folder is empty*, would tell a person their step made nothing. A folder that is not
 * there is an empty list and no error — a step not filed yet has no folder. A folder that is there and cannot be read is neither:
 * the page is given the reason instead of the list, since *the folder is empty* would again say the step made nothing when the truth
 * is that nobody could look.
 *
 * Beside the closeout's `artifacts`, which are the files a step *named* and the run collected: these are what is in the folder,
 * named or not, which is the only way to see what a step left behind that it forgot to name.
 *
 * Two things are left out. The run's own `closeout.json` (`HANDED_CLOSEOUT`), the step's closeout it wrote there for the steps
 * after it, which the page shows as the closeout. And the run's own `given/` directory, which the run copied in before the step
 * started — its inputs and a copy of each folder the step waits on (`givenPlan`). It is not what the step made, it is the same work
 * drawn twice for a fan-in child, and
 * listed it would stand in every folder of every run started with `--input`, so *the folder is empty* could never be said of a step
 * that made nothing. The name comes from the package, not spelled a second time here. A `given` that is not a directory is a step's
 * own file and is listed: what the run makes is a directory.
 * @param run The run, whose id the links name.
 * @param step The step's name.
 * @param dir The step's folder whose files are listed.
 * @param route The route the files are linked under.
 */
export function folderFiles(run: Pick<Run, 'id'>, step: string, dir: string, route: 'files' | 'artifacts') {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return { files: [], error: code === 'ENOENT' ? null : `Its folder could not be read (${code ?? (e as Error).message}).` };
  }
  const files = names
    .filter((name) => !(name === GIVEN && isDirectory(path.join(dir, name))))
    .filter((name) => !(name === HANDED_CLOSEOUT && fileIn(dir, name)))
    .map((name) => {
      const here = path.join(dir, name);
      const stat = statUnder(dir, name);
      if (!stat) return { path: here, relativePath: name };
      return { path: here, relativePath: name, name, url: urlOf(run, step, route, name), kind: typeOf(name).kind, size: stat.size };
    });
  return { files, error: null };
}

/**
 * The folder a step of a folder run works in, off the run's record (`folderPlace` made it): null for a step of a repository run, which
 * works on a branch, and for one the run has not filed yet, which has no folder.
 * @param run The run's record.
 * @param step The step's name.
 */
export const workFolderOf = (run: Run, step: string) => (isRepositoryRun(run) ? null : (run.steps[step]?.workspace ?? null));
