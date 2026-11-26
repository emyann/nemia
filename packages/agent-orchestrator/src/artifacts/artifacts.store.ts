/**
 * The files a step hands over: each one its closeout names, copied out of its workspace into the step's files directory
 * (`collectArtifacts`), each it named that the run does not have, and why (`missingArtifacts`; `filesLacked`, off the disk alone, as the
 * step signs off; `filesHanded`, those that are there for the step after), and what that directory holds (`artifactFiles`), the
 * step's closeout written there for the steps after it (`handCloseout`, `holdsCloseout`); and one file of that directory or of a step's folder, read by its path
 * under it and never through a link (`artifactFile`, `fileUnder`).
 *
 * Beneath the controllers, beside `record.store.ts` and `worktree.store.ts`: it imports neither the engine nor a controller, and
 * `runner.ts` re-exports `artifactFiles` and `missingArtifacts`. The closeout itself is read off the engine's record, so `closeoutOf` is
 * `views.verb.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { handedCloseout, type Closeout } from '../closeout/index.ts';
import type { StepSpec } from '../step/step.ts';
import { inside } from '../workspace/workspace.ts';
import { artifactPlace, HANDED_CLOSEOUT, sizeOf, type ArtifactFile, type MissingArtifact } from './artifacts.ts';
import { isRepositoryRun, type LackedFile, type Run } from '../record/record.ts';
import { artifactsDir, lstatOf, statUnder } from '../record/record.store.ts';
import { presentOn } from '../branches/changes.store.ts';
import type { Place } from '../place/place.store.ts';

/** What is at a path at the tip of a step's branch, as its run's place says (`presentOn`), or what the place said instead. */
type OnBranch = (rel: string) => 'file' | 'directory' | 'absent' | { readonly unknown: string };

/**
 * Artifacts a step DECLARED that the run does not have, and why (`MissingArtifact`): a declared file written and never handed over is a
 * mismatch a person can see, where the merge alone would be clean and empty.
 *
 * A path from the workspace root is read where the tick collected it (`collectArtifacts`), and the workspace says why when it is not
 * there (`workspaceArtifact`), and the step's branch, as the run's place says what is at each such path, asked once and only when one
 * is needed (`branchOf`). An absolute path names a file in the step's files directory (`artifactsDir`), and is looked for there,
 * on disk: present when it is a file inside the directory once every link on the way is followed, so a link that leads out is as missing
 * as where it leads. Any other absolute path, and a path that climbs out of the workspace as written, are reported without being looked
 * at (`artifactPlace`), as is a path through a folder a harness reads as its own configuration, which is never collected.
 * @param home The store's root.
 * @param place The run's place, asked what is at a path on the step's branch.
 * @param run The run.
 * @param stepName The step's name.
 * @param closeout The step's closeout, or the error it read with; undefined where it has none, and nothing is missing.
 */
export function missingArtifacts(
  home: string,
  place: Place,
  run: Run,
  stepName: string,
  closeout: Closeout | { error: string } | undefined,
) {
  if (!closeout || 'error' in closeout) return [];
  const dir = artifactsDir(home, run, stepName);
  const onBranch = branchOf(
    place,
    run,
    stepName,
    closeout.artifacts.filter((file) => artifactPlace(file, dir) === 'workspace'),
  );
  const missing: MissingArtifact[] = [];
  for (const file of closeout.artifacts) {
    const placed = placedWhy(file, dir);
    const why = placed === 'workspace' ? workspaceArtifact(run, stepName, file, dir, onBranch) : placed && { why: placed };
    if (why) missing.push({ path: file, ...why });
  }
  return missing;
}

/**
 * Why a declared file is one the run does not have, as far as its name and the step's files directory `dir` say: refused by its name
 * (`artifactPlace`), or `missing` from `dir`, which an absolute path in it names — undefined for one that is a file there, and
 * `workspace` for a path from the workspace root, which the workspace answers.
 */
function placedWhy(file: string, dir: string) {
  const place = artifactPlace(file, dir);
  if (place !== 'files')
    return place satisfies 'outside' | 'escapes' | 'configuration' | 'reserved' | 'missing' | 'workspace' | undefined as
      | 'outside'
      | 'escapes'
      | 'configuration'
      | 'reserved'
      | 'missing'
      | 'workspace'
      | undefined;
  return (isFileIn(file, dir) ? undefined : 'missing') satisfies
    | 'outside'
    | 'escapes'
    | 'configuration'
    | 'reserved'
    | 'missing'
    | 'workspace'
    | undefined as 'outside' | 'escapes' | 'configuration' | 'reserved' | 'missing' | 'workspace' | undefined;
}

/**
 * The files a step's closeout names that the run does not have as the step signs off, each with why, off the disk alone: what refuses the
 * closeout (`REFUSING` in artifacts.ts), read once by the tick after it collected what the closeout named (`collectArtifacts`). Unlike
 * `missingArtifacts` it asks the run's place nothing, so it never answers `not known`, nor `not collected`: a path from the workspace
 * root is had where its copy is in the step's files directory or its file is in the workspace, whatever became of the copy, and is not
 * judged where the record names no workspace or the workspace is not on disk. In a workspace that is there, a path with nothing at it is
 * `not there`, a directory is `directory`, and a link that leads out is `escapes`.
 * @param home The store's root.
 * @param run The run.
 * @param stepName The step's name.
 * @param closeout The step's closeout; undefined where it has none, and nothing lacks.
 */
export function filesLacked(home: string, run: Run, stepName: string, closeout: Closeout | undefined) {
  if (!closeout) return [];
  const dir = artifactsDir(home, run, stepName);
  const { workspace } = run.steps[stepName] ?? {};
  const lacked: LackedFile[] = [];
  for (const file of closeout.artifacts) {
    const placed = placedWhy(file, dir);
    const why = placed === 'workspace' ? workspaceLacks(workspace, path.normalize(file), dir) : placed;
    if (why) lacked.push({ path: file, why });
  }
  return lacked;
}

/** Why a path from the workspace root is not a file the run has, off the disk alone (`filesLacked`), or undefined where it has it. */
function workspaceLacks(workspace: string | undefined, rel: string, dir: string) {
  if (isFileIn(path.join(dir, rel), dir) || !workspace || !fs.existsSync(workspace)) return undefined;
  const at = inWorkspace(workspace, rel);
  if (at.kind === 'file') return undefined;
  return at.kind === 'outside' ? 'escapes' : at.kind === 'directory' ? 'directory' : 'not there';
}

/**
 * Write step `step`'s closeout `said` into its files directory as `closeout.json` (`HANDED_CLOSEOUT`), in v1's shape
 * (`handedCloseout`), with each file it named that is there now (`filesHanded`): what the steps after it read there. The tick's alone,
 * on the pass that hands the step off, after it collected what the closeout named, so it holds the current try's closeout. A link a step
 * left at that name is taken away first, and never written through. Answers a note when the write failed; it never throws.
 * @param home The store's root.
 * @param run The run.
 * @param step The step.
 * @param said Its closeout; undefined where it has none, and nothing is written.
 */
export function handCloseout(home: string, run: Run, step: StepSpec, said: Closeout | undefined) {
  if (!said) return [];
  const dir = artifactsDir(home, run, step.name);
  const file = path.join(dir, HANDED_CLOSEOUT);
  try {
    if (lstatOf(file)?.isSymbolicLink()) fs.unlinkSync(file);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(handedCloseout(step, said, filesHanded(home, run, step.name, said).there), null, 2)}\n`);
    return [];
  } catch (e) {
    return [`${step.name}: ${HANDED_CLOSEOUT} not written — ${(e as Error).message}`];
  }
}

/**
 * Whether step `stepName`'s files directory holds the closeout the tick writes there (`handCloseout`): a file, never a link.
 * @param home The store's root.
 * @param run The run, by its id.
 * @param stepName The step's name.
 */
export const holdsCloseout = (home: string, run: Pick<Run, 'id'>, stepName: string) =>
  lstatOf(path.join(artifactsDir(home, run, stepName), HANDED_CLOSEOUT))?.isFile() ?? false;

/**
 * Which of the files a step's closeout named are in its files directory now, each by its absolute path there, and how many are not: what
 * the brief of a step filed after it lists (`mountsLine`), so it is handed no name with no file behind it. A path from the workspace
 * root is looked for where the run collected it.
 * @param home The store's root.
 * @param run The run, by its id.
 * @param stepName The step's name.
 * @param closeout The step's closeout; undefined where it has none, and it handed nothing.
 */
export function filesHanded(home: string, run: Pick<Run, 'id'>, stepName: string, closeout: Closeout | undefined) {
  const dir = artifactsDir(home, run, stepName);
  const there: string[] = [];
  let gone = 0;
  for (const file of closeout?.artifacts ?? []) {
    const place = artifactPlace(file, dir);
    const at = place === 'files' ? path.resolve(file) : place === 'workspace' ? path.join(dir, path.normalize(file)) : undefined;
    if (at && isFileIn(at, dir)) there.push(at);
    else gone += 1;
  }
  return { there, gone };
}

/**
 * What is at each of `files`, named from the workspace root, at the tip of the step's branch: one question to the run's place for all of
 * them, asked the first time one is needed, and then read from its answer. Absent everywhere for a step with no branch or a run with no
 * repository.
 */
function branchOf(place: Place, run: Run, stepName: string, files: readonly string[]) {
  const branch = run.steps[stepName]?.branch;
  let read: ReturnType<typeof presentOn> | undefined;
  return ((rel) => {
    if (!branch || !isRepositoryRun(run)) return 'absent';
    read ??= presentOn(place, run, branch, [...new Set(files.map((file) => path.normalize(file)))]);
    return 'unknown' in read ? { unknown: read.unknown } : (read[rel] ?? 'absent');
  }) satisfies OnBranch;
}

/**
 * Why a file named from the workspace root is not one the run has — or undefined when it is: collected into `dir`, which answers first,
 * whatever the workspace holds since. Otherwise the workspace says why, where the record names one: a link that leads out of it, or a
 * directory. A file in the workspace whose copy something a step made in `dir` refuses (`copyBlocked`) is `not collected`, even when it is
 * on the branch too: the run does not pass over a copy it refused. Any other file is the branch's to answer (`onBranch`), so a step handed
 * off without its files collected still has what its branch holds, and one on no branch either, a file git ignores that its step has not
 * handed off yet, is `not collected`. With nothing in the workspace, the branch answers too. Where the place did not say what the branch
 * holds, the file is `not known`, with what it said — never `not there`.
 */
function workspaceArtifact(run: Run, stepName: string, file: string, dir: string, onBranch: OnBranch) {
  const rel = path.normalize(file);
  if (isFileIn(path.join(dir, rel), dir)) return undefined;
  const { workspace } = run.steps[stepName] ?? {};
  const at = workspace ? inWorkspace(workspace, rel) : { kind: 'absent' as const };
  if (at.kind === 'outside')
    return { why: 'escapes' } satisfies Omit<MissingArtifact, 'path'> | undefined as Omit<MissingArtifact, 'path'> | undefined;
  if (at.kind === 'directory')
    return { why: 'directory' } satisfies Omit<MissingArtifact, 'path'> | undefined as Omit<MissingArtifact, 'path'> | undefined;
  if (at.kind === 'file' && copyBlocked(dir, rel))
    return { why: 'not collected' } satisfies Omit<MissingArtifact, 'path'> | undefined as Omit<MissingArtifact, 'path'> | undefined;
  const there = onBranch(rel);
  if (typeof there !== 'string')
    return { why: 'not known', said: there.unknown } satisfies Omit<MissingArtifact, 'path'> | undefined as
      | Omit<MissingArtifact, 'path'>
      | undefined;
  if (there === 'file') return undefined;
  if (at.kind === 'file')
    return { why: 'not collected' } satisfies Omit<MissingArtifact, 'path'> | undefined as Omit<MissingArtifact, 'path'> | undefined;
  return { why: there === 'directory' ? 'directory' : 'not there' } satisfies Omit<MissingArtifact, 'path'> | undefined as
    | Omit<MissingArtifact, 'path'>
    | undefined;
}

/**
 * What is at a path from a workspace's root, every link on the way followed: a file, and where it really is; a directory; something else;
 * nothing — or `outside`, when a link leads out of the workspace, which is not looked at further.
 */
function inWorkspace(workspace: string, rel: string) {
  let root: string;
  let real: string;
  try {
    root = fs.realpathSync(workspace);
    real = fs.realpathSync(path.join(workspace, rel));
  } catch {
    return { kind: 'absent' } satisfies { kind: 'file'; real: string } | { kind: 'directory' | 'other' | 'absent' | 'outside' };
  }
  if (real !== root && !inside(root, real))
    return { kind: 'outside' } satisfies { kind: 'file'; real: string } | { kind: 'directory' | 'other' | 'absent' | 'outside' };
  const at = fs.statSync(real, { throwIfNoEntry: false });
  return (at?.isFile() ? { kind: 'file', real } : at?.isDirectory() ? { kind: 'directory' } : { kind: at ? 'other' : 'absent' }) satisfies
    | { kind: 'file'; real: string }
    | { kind: 'directory' | 'other' | 'absent' | 'outside' };
}

/**
 * Copy each file a step's closeout names from its workspace root into the step's files directory, at the same path — so a step that cannot
 * write outside its worktree (Codex in `workspace-write`, which the engine gives no other directory) still hands its files over, and the
 * steps after it and `nemia decide` read them from one place (`missingArtifacts`, `artifactFiles`).
 *
 * `advance` runs it on each pass that hands a step off (`handOffDue`): until its check is filed, and until a step after it works in its
 * workspace. Level-triggered and idempotent, so a pass that dies halfway loses nothing: a copy with its source's size and, within a
 * millisecond, its time is left as it is, since a copy's time reads back a hair off its source's. Nothing is copied, and `nemia decide`
 * says why, for a path that climbs out of the workspace (never read), a path through a folder a harness reads as its own configuration
 * (`artifactPlace`), a link that leads out of it (not followed), a directory, a file that is not there, and a copy that fails. Nothing
 * is written through a link in the files directory, which a step may have made. It never throws, as a hand-off does not. The pass's note
 * names what was copied.
 * @param home The store's root.
 * @param run The run, whose record names the step's workspace.
 * @param stepName The step's name.
 * @param closeout The step's closeout; undefined where it has none, and nothing is copied.
 */
export function collectArtifacts(home: string, run: Run, stepName: string, closeout: Closeout | undefined) {
  const workspace = run.steps[stepName]?.workspace;
  if (!closeout || !workspace) return [];
  const dir = artifactsDir(home, run, stepName);
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
function copyBlocked(dir: string, rel: string) {
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
function isFileIn(file: string, dir: string) {
  try {
    const real = fs.realpathSync(file);
    return artifactPlace(real, fs.realpathSync(dir)) === 'files' && fs.statSync(real).isFile();
  } catch {
    return false;
  }
}

/**
 * Every file in a step's files directory, every level down, with its size: what `nemia decide` lists after
 * the step's closeout. Regular files only, and no link is followed, so nothing outside the directory is
 * listed because something inside it points there. Not the closeout the run wrote there (`HANDED_CLOSEOUT`), which is no file the step
 * handed over.
 * @param home The store's root.
 * @param run The run, by its id.
 * @param stepName The step's name.
 */
export function artifactFiles(home: string, run: Pick<Run, 'id'>, stepName: string) {
  const found: ArtifactFile[] = [];
  const top = artifactsDir(home, run, stepName);
  const walk = (dir: string) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (dir === top && entry.name === HANDED_CLOSEOUT) continue;
      if (entry.isDirectory()) walk(at);
      else if (entry.isFile()) found.push({ path: at, bytes: fs.lstatSync(at).size });
    }
  };
  walk(top);
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * The bytes of the regular file at `rel` under `dir` (`statUnder`), or null where there is none: opened without following a link, and
 * read only where what was opened is the file looked at, so a folder on the way swapped for a link after the look reads nothing.
 * @param dir The folder.
 * @param rel The file's path under it.
 */
export function fileUnder(dir: string, rel: string) {
  const looked = statUnder(dir, rel);
  if (!looked) return null;
  let fd: number;
  try {
    fd = fs.openSync(path.join(dir, rel), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch {
    return null;
  }
  try {
    const opened = fs.fstatSync(fd);
    return opened.isFile() && opened.ino === looked.ino && opened.dev === looked.dev ? fs.readFileSync(fd) : null;
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * The file at `rel` under the files directory of `step` in `run` (`artifactsDir`), read as `fileUnder` reads it.
 * @param home The store's root.
 * @param run The run, by its id.
 * @param step The step's name.
 * @param rel The file's path under its files directory.
 */
export const artifactFile = (home: string, run: Pick<Run, 'id'>, step: string, rel: string) =>
  fileUnder(artifactsDir(home, run, step), rel);
