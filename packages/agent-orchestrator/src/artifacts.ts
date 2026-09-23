/**
 * The files a step hands over: each one its closeout names, copied out of its workspace into the step's files directory
 * (`collectArtifacts`), each it named that the run does not have, and why (`missingArtifacts`), and what that directory holds
 * (`artifactFiles`).
 *
 * Beneath the controllers, beside `store.ts` and `worktree.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports
 * what it exported of this before. The closeout itself is read off the engine's record, so `closeoutOf` is `views.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Closeout } from './closeout.ts';
import { inside } from './deps.ts';
import { artifactPlace, isGitRun, type ArtifactFile, type MissingArtifact, type Run } from './run.ts';
import { artifactsDir, lstatOf } from './store.ts';
import { gitSays } from './worktree.ts';

/**
 * Artifacts a step DECLARED that the run does not have, and why (`MissingArtifact`).
 *
 * The whole point of declaring them. The first real run lost the reviewer's entire output because
 * REVIEW.md was written and never committed, and nothing anywhere noticed — the merge was clean
 * and empty. A declared file the run does not have is now a mismatch somebody can see.
 *
 * A path from the workspace root is read where the tick collected it (`collectArtifacts`), and the workspace says why when it is not
 * there (`workspaceArtifact`). An absolute path names a file in the step's files directory (`artifactsDir`), and is looked for there,
 * on disk: present when it is a file inside the directory once every link on the way is followed, so a link that leads out is as missing
 * as where it leads. Any other absolute path, and a path that climbs out of the workspace as written, are reported without being looked
 * at (`artifactPlace`).
 */
export function missingArtifacts(run: Run, stepName: string, closeout: Closeout | { error: string } | undefined): MissingArtifact[] {
  if (!closeout || 'error' in closeout) return [];
  const dir = artifactsDir(run, stepName);
  const missing: MissingArtifact[] = [];
  for (const file of closeout.artifacts) {
    const place = artifactPlace(file, dir);
    const why = place === 'outside' || place === 'escapes' ? place
      : place === 'files' ? (isFileIn(file, dir) ? undefined : 'missing')
      : workspaceArtifact(run, stepName, file, dir);
    if (why) missing.push({ path: file, why });
  }
  return missing;
}

/**
 * Why a file named from the workspace root is not one the run has — or undefined when it is: collected into `dir`, which answers first,
 * whatever the workspace holds since. Otherwise the workspace says why, where the record names one: a link that leads out of it, or a
 * directory. A file in the workspace whose copy something a step made in `dir` refuses (`copyBlocked`) is `not collected`, even when it is
 * on the branch too: the run does not pass over a copy it refused. Any other file is the branch's to answer, as it was before collection —
 * so a run from before it, whose worktree is still there and whose steps are past hand-off, reads as it did — and one on no branch either,
 * a file git ignores that its step has not handed off yet, is `not collected`. With nothing in the workspace, the branch answers too.
 */
function workspaceArtifact(run: Run, stepName: string, file: string, dir: string): MissingArtifact['why'] | undefined {
  const rel = path.normalize(file);
  if (isFileIn(path.join(dir, rel), dir)) return undefined;
  const { workspace, branch } = run.steps[stepName] ?? {};
  const at = workspace ? inWorkspace(workspace, rel) : { kind: 'absent' as const };
  if (at.kind === 'outside') return 'escapes';
  if (at.kind === 'directory') return 'directory';
  if (at.kind === 'file' && copyBlocked(dir, rel)) return 'not collected';
  const onBranch = branch && isGitRun(run) ? gitSays(run.repo, 'cat-file', '-t', `${branch}:${rel}`)?.trim() : undefined;
  if (at.kind === 'file') return onBranch === 'blob' ? undefined : 'not collected';
  return onBranch === 'blob' ? undefined : onBranch === 'tree' ? 'directory' : 'not there';
}

/**
 * What is at a path from a workspace's root, every link on the way followed: a file, and where it really is; a directory; something else;
 * nothing — or `outside`, when a link leads out of the workspace, which is not looked at further.
 */
function inWorkspace(workspace: string, rel: string): { kind: 'file'; real: string } | { kind: 'directory' | 'other' | 'absent' | 'outside' } {
  let root: string;
  let real: string;
  try {
    root = fs.realpathSync(workspace);
    real = fs.realpathSync(path.join(workspace, rel));
  } catch { return { kind: 'absent' }; }
  if (real !== root && !inside(root, real)) return { kind: 'outside' };
  const at = fs.statSync(real, { throwIfNoEntry: false });
  return at?.isFile() ? { kind: 'file', real } : at?.isDirectory() ? { kind: 'directory' } : { kind: at ? 'other' : 'absent' };
}

/**
 * Copy each file a step's closeout names from its workspace root into the step's files directory, at the same path — so a step that cannot
 * write outside its worktree (Codex in `workspace-write`, which the engine gives no other directory) still hands its files over, and the
 * steps after it and `wf decide` read them from one place (`missingArtifacts`, `artifactFiles`).
 *
 * `advance` runs it on each pass that hands a step off (`handOffDue`): until its check is filed, and until a step after it works in its
 * workspace. Level-triggered and idempotent, so a pass that dies halfway loses nothing: a copy with its source's size and time is left as
 * it is. Nothing is copied, and `wf decide` says why, for a path that climbs out of the workspace (never read), a link that leads out of it
 * (not followed), a directory, and a file that is not there. Nothing is written through a link in the files directory, which a step may
 * have made. It never throws, as a hand-off does not. The pass's note names what was copied.
 */
export function collectArtifacts(run: Run, stepName: string, closeout: Closeout | undefined): string[] {
  const workspace = run.steps[stepName]?.workspace;
  if (!closeout || !workspace) return [];
  const dir = artifactsDir(run, stepName);
  const copied: string[] = [];
  for (const file of closeout.artifacts) {
    if (artifactPlace(file, dir) !== 'workspace') continue;
    const rel = path.normalize(file);
    const at = inWorkspace(workspace, rel);
    if (at.kind !== 'file') continue;
    try {
      if (copyBlocked(dir, rel)) continue;
      const to = path.join(dir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const from = fs.statSync(at.real);
      const there = lstatOf(to);
      // Within a millisecond: the time a copy is given goes through a `Date` and a float of seconds, and reads back a hair off the source's.
      if (there && there.size === from.size && Math.abs(there.mtimeMs - from.mtimeMs) < 1) continue;
      fs.copyFileSync(at.real, to);
      fs.utimesSync(to, from.atime, from.mtime);
      copied.push(rel);
    } catch { /* not collected, and `wf decide` says so */ }
  }
  return copied.length ? [`${stepName}: collected ${copied.join(', ')} into ${dir}`] : [];
}

/**
 * Whether a copy of `rel` into `dir` would go through something a step may have made there: `dir`, or a directory on the way to the copy,
 * that is there and is not a plain directory — a link, a file — or something in the copy's place that is not a regular file. Looks, and
 * makes nothing: what `collectArtifacts` refuses to write through, and what `missingArtifacts` names as the copy refused.
 */
function copyBlocked(dir: string, rel: string): boolean {
  let at = dir;
  for (const part of ['.', ...path.dirname(rel).split(path.sep).filter((p) => p && p !== '.')]) {
    at = path.join(at, part);
    const st = lstatOf(at);
    // Nothing there yet: made as a plain directory, and nothing below it can be in the way.
    if (!st) return false;
    if (!st.isDirectory()) return true;
  }
  const there = lstatOf(path.join(dir, rel));
  return Boolean(there && !there.isFile());
}

/** Whether `file` is a regular file inside `dir`, with every link on the way to either followed. */
function isFileIn(file: string, dir: string): boolean {
  try {
    const real = fs.realpathSync(file);
    return artifactPlace(real, fs.realpathSync(dir)) === 'files' && fs.statSync(real).isFile();
  } catch { return false; }
}

/**
 * Every file in a step's files directory, every level down, with its size: what `wf decide` lists after
 * the step's closeout. Regular files only, and no link is followed, so nothing outside the directory is
 * listed because something inside it points there.
 */
export function artifactFiles(run: Pick<Run, 'id'>, stepName: string): ArtifactFile[] {
  const found: ArtifactFile[] = [];
  const walk = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.isFile()) found.push({ path: at, bytes: fs.lstatSync(at).size });
    }
  };
  walk(artifactsDir(run, stepName));
  return found.sort((a, b) => a.path.localeCompare(b.path));
}
