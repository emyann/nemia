import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir } from 'agent-orchestrator';
import { artifactPlace, filesPrunedWords, GIVEN, HANDED_CLOSEOUT, type Run } from 'agent-orchestrator/run';

/** What the board does with a file: draws it inline, links it to be read in a tab, or links it with its size. */
export type ArtifactKind = 'image' | 'text' | 'other';

/**
 * A file a closeout named. A file in the step's files directory (`artifactsDir`), by a name the artifacts route serves, is
 * that name, where the api serves it, its kind and its size. Anything else is the path as the closeout gave it: a path on the
 * step's branch, a file the directory does not have, one in a directory under it, or an absolute path anywhere else — which
 * is not looked at, as `nemia decide` does not look at it (`artifactPlace`). A file of the files directory that is not there on a run
 * `nemia prune --artifacts` pruned is the path and what removed it, when (`filesPrunedWords`): gone, not missing. `prunedAt` is
 * that moment alone, for a page that draws it as it draws every other time.
 */
export type StepArtifact =
  | { path: string }
  | { path: string; name: string; url: string; kind: ArtifactKind; size: number }
  | { path: string; pruned: string; prunedAt: string };

/** A value a closeout handed on, by its name: `link` is the value where it is an http(s) address the board may link to, else null. */
export type StepValue = { name: string; value: string; link: string | null };

/**
 * A value a closeout handed on, as the board shows it (`StepValue`): linked only where the value is a whole URL whose protocol is
 * `http:` or `https:`, so a `javascript:` value, or text that is no URL, is shown and never followed.
 */
export function valueOf(v: { name: string; value: string }): StepValue {
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

/** The type the file `name` is served with, by its extension, and what the board does with it; an unknown one is bytes, linked. */
export const typeOf = (name: string) =>
  TYPES[path.extname(name).toLowerCase()] ?? { type: 'application/octet-stream', kind: 'other' as const };

/**
 * Why a name is not one the artifacts route serves, or null when it is. A name, never a path: one with a separator of either
 * kind, or `..`, is refused before the disk is touched — and one with a NUL, which no file has.
 */
export function refusedName(name: string): string | null {
  if (!name || /[/\\\0]/.test(name) || name.includes('..')) {
    return `\`${name}\` is not the name of a file: a name has no \`/\`, \`\\\`, or \`..\`. GET /api/runs/<run> lists each step's closeout, whose \`artifacts\` carry the \`url\` of every file the api serves.`;
  }
  return null;
}

/** A regular file directly in `dir` by `name`, without following a link: a link that leads out of the directory is not a file in it. */
function fileIn(dir: string, name: string): fs.Stats | undefined {
  const stat = fs.lstatSync(path.join(dir, name), { throwIfNoEntry: false });
  return stat?.isFile() ? stat : undefined;
}

/**
 * A path a closeout named, as the board shows it (`StepArtifact`). Once the step's artifacts directory is pruned, a file anywhere under it
 * is pruned with it, one in a directory beneath it included.
 */
export function artifactOf(run: Pick<Run, 'id' | 'pruned'>, step: string, file: string): StepArtifact {
  const dir = artifactsDir(run, step);
  const files = run.pruned?.artifacts;
  if (artifactPlace(file, dir) !== 'files') return { path: file };
  if (files && !fs.existsSync(dir)) return { path: file, pruned: filesPrunedWords(files), prunedAt: files.at };
  if (path.dirname(path.resolve(file)) !== path.resolve(dir)) return { path: file };
  const name = path.basename(file);
  const stat = refusedName(name) === null ? fileIn(dir, name) : undefined;
  if (!stat) return files ? { path: file, pruned: filesPrunedWords(files), prunedAt: files.at } : { path: file };
  const url = `/api/runs/${encodeURIComponent(run.id)}/steps/${encodeURIComponent(step)}/artifacts/${encodeURIComponent(name)}`;
  return { path: file, name, url, kind: typeOf(name).kind, size: stat.size };
}

/** Whether a path is a directory in its own right — a symlink to one is not, so a link the run did not make is listed as any link is. */
const isDirectory = (at: string): boolean => {
  try {
    return fs.lstatSync(at).isDirectory();
  } catch {
    return false;
  }
};

/**
 * Everything a folder step's own folder holds, for a person who never opens a terminal: each regular file directly in `dir`, by
 * name, as the files route serves it — its size and what the board does with it. Newest-looking first is not worth guessing at:
 * they are listed in name order, as a directory listing reads.
 *
 * What the route cannot serve is listed all the same, by its path alone, drawn as any path a closeout named that the api does not
 * serve: a directory, a link (`fileIn` follows none), a name with a separator or `..` in it. The route serves a name and never a
 * path, and none of those becomes reachable by being listed — but a folder holding only `notes/` is not an empty folder, and the
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
 */
export function folderFiles(run: Pick<Run, 'id'>, step: string, dir: string): { files: StepArtifact[]; error: string | null } {
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
      const stat = refusedName(name) === null ? fileIn(dir, name) : undefined;
      if (!stat) return { path: here };
      const url = `/api/runs/${encodeURIComponent(run.id)}/steps/${encodeURIComponent(step)}/files/${encodeURIComponent(name)}`;
      return { path: here, name, url, kind: typeOf(name).kind, size: stat.size };
    });
  return { files, error: null };
}
