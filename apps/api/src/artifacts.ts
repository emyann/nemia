import fs from 'node:fs';
import path from 'node:path';
import { artifactsDir } from 'agent-workflows';
import { artifactPlace, type Run } from 'agent-workflows/run';

/** What the board does with a file: draws it inline, links it to be read in a tab, or links it with its size. */
export type ArtifactKind = 'image' | 'text' | 'other';

/**
 * A file a closeout named. A file in the step's files directory (`artifactsDir`), by a name the artifacts route serves, is
 * that name, where the api serves it, its kind and its size. Anything else is the path as the closeout gave it: a path on the
 * step's branch, a file the directory does not have, one in a directory under it, or an absolute path anywhere else — which
 * is not looked at, as `wf decide` does not look at it (`artifactPlace`).
 */
export type StepArtifact = { path: string } | { path: string; name: string; url: string; kind: ArtifactKind; size: number };

/** By extension: the type a file is served with, and what the board does with it. */
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
  // Text a step wrote is shown as text. An HTML or a script file among it is an agent's text too: as `text/plain`, a tab
  // shows it rather than running it on the board's origin.
  ...Object.fromEntries(
    ['.txt', '.md', '.log', '.csv', '.tsv', '.yaml', '.yml', '.xml', '.html', '.diff', '.patch', '.ts', '.tsx', '.js', '.css', '.sh']
      .map((ext) => [ext, { type: 'text/plain; charset=utf-8', kind: 'text' as const }]),
  ),
};

const typeOf = (name: string) => TYPES[path.extname(name).toLowerCase()] ?? { type: 'application/octet-stream', kind: 'other' as const };

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

/** A path a closeout named, as the board shows it (`StepArtifact`). */
export function artifactOf(run: Pick<Run, 'id'>, step: string, file: string): StepArtifact {
  const dir = artifactsDir(run, step);
  if (artifactPlace(file, dir) !== 'files' || path.dirname(path.resolve(file)) !== path.resolve(dir)) return { path: file };
  const name = path.basename(file);
  const stat = refusedName(name) === null ? fileIn(dir, name) : undefined;
  if (!stat) return { path: file };
  const url = `/api/runs/${encodeURIComponent(run.id)}/steps/${encodeURIComponent(step)}/artifacts/${encodeURIComponent(name)}`;
  return { path: file, name, url, kind: typeOf(name).kind, size: stat.size };
}

/**
 * One file of a step's files directory, by name: its bytes and the type they are served with, or null when the directory has
 * no regular file by that name. Opened without following a link, so what is read is what was looked at.
 */
export function readArtifactFile(run: Pick<Run, 'id'>, step: string, name: string): { body: Buffer; type: string } | null {
  let fd: number;
  try {
    fd = fs.openSync(path.join(artifactsDir(run, step), name), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    if (!fs.fstatSync(fd).isFile()) return null;
    return { body: fs.readFileSync(fd), type: typeOf(name).type };
  } finally {
    fs.closeSync(fd);
  }
}
