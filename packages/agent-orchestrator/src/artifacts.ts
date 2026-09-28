/**
 * The files a step hands over: each one its closeout names, copied out of its workspace into the step's files directory
 * (`collectArtifacts`), each it named that the run does not have, and why (`missingArtifacts`), and what that directory holds
 * (`artifactFiles`), and the pictures an ending's check took of the merged tree, removed once it has landed (`dropLandedPictures`).
 *
 * Beneath the controllers, beside `store.ts` and `worktree.ts`: it imports neither the engine nor a controller, and `runner.ts` re-exports
 * `artifactFiles` and `missingArtifacts`. The closeout itself is read off the engine's record, so `closeoutOf` is `views.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Closeout } from './closeout/closeout.ts';
import { inside } from './workspace/workspace.ts';
import { artifactPlace, isGitRun, sizeOf, type ArtifactFile, type MissingArtifact, type Run } from './run.ts';
import { artifactsDir, checkStderr, lstatOf } from './store.ts';
import { gitSays } from './worktree.ts';

/**
 * Artifacts a step DECLARED that the run does not have, and why (`MissingArtifact`): a declared file written and never handed over is a
 * mismatch a person can see, where the merge alone would be clean and empty.
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
    const why =
      place === 'outside' || place === 'escapes'
        ? place
        : place === 'files'
          ? isFileIn(file, dir)
            ? undefined
            : 'missing'
          : workspaceArtifact(run, stepName, file, dir);
    if (why) missing.push({ path: file, why });
  }
  return missing;
}

/**
 * Why a file named from the workspace root is not one the run has — or undefined when it is: collected into `dir`, which answers first,
 * whatever the workspace holds since. Otherwise the workspace says why, where the record names one: a link that leads out of it, or a
 * directory. A file in the workspace whose copy something a step made in `dir` refuses (`copyBlocked`) is `not collected`, even when it is
 * on the branch too: the run does not pass over a copy it refused. Any other file is the branch's to answer, so a step handed off without
 * its files collected still has what its branch holds, and one on no branch either, a file git ignores that its step has not handed off
 * yet, is `not collected`. With nothing in the workspace, the branch answers too.
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
function inWorkspace(
  workspace: string,
  rel: string,
): { kind: 'file'; real: string } | { kind: 'directory' | 'other' | 'absent' | 'outside' } {
  let root: string;
  let real: string;
  try {
    root = fs.realpathSync(workspace);
    real = fs.realpathSync(path.join(workspace, rel));
  } catch {
    return { kind: 'absent' };
  }
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
 * workspace. Level-triggered and idempotent, so a pass that dies halfway loses nothing: a copy with its source's size and, within a
 * millisecond, its time is left as it is, since a copy's time reads back a hair off its source's. Nothing is copied, and `wf decide` says
 * why, for a path that climbs out of the workspace (never read), a link that leads out of it (not followed), a directory, a file that is
 * not there, and a copy that fails. Nothing is written through a link in the files directory, which a step may have made. It never
 * throws, as a hand-off does not. The pass's note names what was copied.
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
      if (there && there.size === from.size && Math.abs(there.mtimeMs - from.mtimeMs) < 1) continue;
      fs.copyFileSync(at.real, to);
      fs.utimesSync(to, from.atime, from.mtime);
      copied.push(rel);
    } catch {}
  }
  return copied.length ? [`${stepName}: collected ${copied.join(', ')} into ${dir}`] : [];
}

/**
 * Whether a copy of `rel` into `dir` would go through something a step may have made there: `dir`, or a directory on the way to the copy,
 * that is there and is not a plain directory — a link, a file — or something in the copy's place that is not a regular file. A directory
 * on the way that is not there yet blocks nothing, since it is made plain. Looks, and makes nothing: what `collectArtifacts` refuses to
 * write through, and what `missingArtifacts` names as the copy refused.
 */
function copyBlocked(dir: string, rel: string): boolean {
  let at = dir;
  for (const part of [
    '.',
    ...path
      .dirname(rel)
      .split(path.sep)
      .filter((p) => p && p !== '.'),
  ]) {
    at = path.join(at, part);
    const st = lstatOf(at);
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
  } catch {
    return false;
  }
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
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.isFile()) found.push({ path: at, bytes: fs.lstatSync(at).size });
    }
  };
  walk(artifactsDir(run, stepName));
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/** The note a landed ending's files directory keeps in place of the pictures its check took (`dropLandedPictures`). */
export const LANDED_PICTURES = 'e2e-pictures.txt';

/**
 * Remove the pictures an ending's check took of the merged tree, once that check passed and the merge landed: what `landEnding` does on
 * the pass that writes `{ commit }`. The ship's check runs the e2e on the merge staged in the repository's checkout, with its files
 * directory as `WF_ARTIFACTS`, after the ship's gate — so no person and no step reads those pictures before it, and after a pass nothing
 * shows them but `wf decide`'s list of files (sizes, no pictures). They are a second photograph, of another tree, not copies of the
 * implement step's, which are kept. A check that did not pass is never landed as a commit, so its pictures, the failed page's among them,
 * stay for whoever reads why.
 *
 * Only a regular `.png` directly in the directory that the ending's closeout does not name, and never through a link. In its place a note,
 * `e2e-pictures.txt`, says what was removed and where what the check said is kept — written before anything is removed, and left as it is
 * on a later pass, so a pass that dies halfway, or a picture that cannot be removed, leaves the whole list and the next pass that lands
 * removes the rest. Nothing to remove writes nothing.
 */
export function dropLandedPictures(
  run: Pick<Run, 'id'>,
  stepName: string,
  closeout: Closeout | undefined,
  said: { commit: string; checkTaskId?: string },
): { removed: string[]; bytes: number } {
  const dir = artifactsDir(run, stepName);
  const named = new Set(
    (closeout?.artifacts ?? []).map((file) => (path.isAbsolute(file) ? path.normalize(file) : path.join(dir, path.normalize(file)))),
  );
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { removed: [], bytes: 0 };
  }
  const pictures = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.png') && !named.has(path.join(dir, entry.name)))
    .map((entry) => ({ name: entry.name, bytes: lstatOf(path.join(dir, entry.name))?.size ?? 0 }))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (!pictures.length) return { removed: [], bytes: 0 };
  const bytes = pictures.reduce((sum, p) => sum + p.bytes, 0);
  const note = path.join(dir, LANDED_PICTURES);
  if (!lstatOf(note)) fs.writeFileSync(note, landedPicturesNote(stepName, pictures, bytes, said));
  const removed: string[] = [];
  let freed = 0;
  for (const picture of pictures) {
    try {
      fs.rmSync(path.join(dir, picture.name));
      removed.push(picture.name);
      freed += picture.bytes;
    } catch {}
  }
  return { removed, bytes: freed };
}

/** The words of `e2e-pictures.txt`: why the pictures went, what they were, and where what the check said still is. */
function landedPicturesNote(
  stepName: string,
  pictures: readonly { name: string; bytes: number }[],
  bytes: number,
  said: { commit: string; checkTaskId?: string },
): string {
  return [
    `${stepName}'s check passed on the merge, and the run committed it as ${said.commit.slice(0, 12)}.`,
    `So the run removed the ${pictures.length} ${pictures.length === 1 ? 'picture' : 'pictures'} the check's e2e took of the merged tree (${sizeOf(bytes)}): after a pass nobody reads them.`,
    "A check that does not pass keeps every picture it took, the failed page's among them.",
    "The pictures of the branch that a reviewer read are the implement step's, in its own files directory, and are kept.",
    ...(said.checkTaskId
      ? [`What the check printed, each page it passed: ae logs ${said.checkTaskId}; its stderr: ${checkStderr(said.checkTaskId)}`]
      : []),
    '',
    'Removed:',
    ...pictures.map((p) => `  ${p.name}  ${sizeOf(p.bytes)}`),
    '',
  ].join('\n');
}
