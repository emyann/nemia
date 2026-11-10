/**
 * A run's own copy of its workflow folder: every file of `run.workflowDir`, as the run took it, under `runs/<id>/workflow/<hex>/`
 * (`workflowFilesDir`), `<hex>` the digest of what it holds. Its checks and sessions are told the folder as `WF_WORKFLOW_FILES`, so a
 * script a check line runs is the one the run took at `nemia start`, or at the pass that last moved its pins (`renderAgain`), whatever
 * the folder holds now and whatever repository the run is on.
 *
 * Written once per content and never again: into a sibling folder first, then renamed into place, so a reader never sees half a copy;
 * a content the run already holds is not written twice. Every file's write bits are cleared, and the folders' kept, so `nemia rm`
 * removes the copy with the run.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { runsDir } from '../record/record.store.ts';
import { carriedFilesRoot, workflowFilesRoot } from '../record/places.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { CARRIED_FOLDER } from '../step/step.ts';

/**
 * The run's own copies of its workflow folder, `runs/<id>/workflow`, and with `hex` the one copy under that digest (`Run.workflowFiles`):
 * what a check and a session are told as `WF_WORKFLOW_FILES`. Beside the run's record, and removed with it (`nemia rm`).
 */
export const workflowFilesDir = (home: string, run: Pick<Run, 'id'>, hex?: string): string => workflowFilesRoot(runsDir(home), run.id, hex);

/**
 * The run's own copies of the carried folder, `runs/<id>/carried`, and with `hex` the one copy under that digest (`Run.carriedFiles`):
 * what a check and a session are told as `WF_CARRIED_FILES`. Beside the run's record, and removed with it (`nemia rm`).
 */
export const carriedFilesDir = (home: string, run: Pick<Run, 'id'>, hex?: string): string => carriedFilesRoot(runsDir(home), run.id, hex);

/** The carried folder of the workflow at `workflowDir`: `carried/` beside it, the files the workflows of its folder share. */
export const carriedDirOf = (workflowDir: string): string => path.join(path.dirname(path.resolve(workflowDir)), CARRIED_FOLDER);

/** A file of a workflow folder: its path from the folder with `/` between parts, its permission bits, its bytes. */
export type WorkflowFile = { path: string; mode: number; bytes: Uint8Array };

/**
 * Every file of the workflow folder `dir`, at any depth, sorted by path in code-unit order. Refused (`Invalid`), naming the entry and the
 * fix: a symbolic link, which would hand the run what it points at as it is when read rather than as it was at the start, and anything
 * that is neither a file nor a folder.
 */
export function workflowFilesOf(dir: string): WorkflowFile[] {
  const files: WorkflowFile[] = [];
  const walk = (at: string, rel: string): void => {
    for (const name of fs.readdirSync(at).sort()) {
      const full = path.join(at, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const st = fs.lstatSync(full);
      if (st.isDirectory()) walk(full, relPath);
      else if (st.isFile()) files.push({ path: relPath, mode: st.mode & 0o777, bytes: fs.readFileSync(full) });
      else
        throw new Invalid({
          message:
            `${full}: ${st.isSymbolicLink() ? 'a symbolic link' : 'neither a file nor a folder'} in ${dir}, a folder a run ` +
            `copies whole for its checks and sessions to read. ${st.isSymbolicLink() ? 'Copy what it points at here in its place' : 'Remove it'}, then start the run again.`,
        });
    }
  };
  walk(dir, '');
  return files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/**
 * The hex of the digest of `files`' content: each file's path, its permission bits but the write ones, its size and its bytes, in order.
 * No bound on a path's length, as an archive's has: a folder any run can be started on has a digest.
 */
export function workflowFilesDigest(files: readonly WorkflowFile[]): string {
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(`${file.path}\0${(file.mode & 0o555).toString(8)}\0${file.bytes.length}\0`);
    hash.update(file.bytes);
  }
  return hash.digest('hex');
}

/**
 * Copies the workflow folder `dir` into the run's own `workflow/<hex>/` (`workflowFilesDir`), and answers the hex. The files are read
 * and refused as `workflowFilesOf` reads and refuses them; a copy of that content already there is kept as it is and not written again.
 * Written into a sibling folder and renamed into place, each file with its write bits cleared; the sibling is removed where a write fails,
 * and the error thrown.
 */
export const freezeWorkflowFiles = (home: string, run: Pick<Run, 'id'>, dir: string): string =>
  freezeInto(home, workflowFilesOf(dir), run, 'workflow');

/**
 * Copies the carried folder beside the workflow at `workflowDir` (`carriedDirOf`) into the run's own `carried/<hex>/`
 * (`carriedFilesDir`), as `freezeWorkflowFiles` copies the workflow's, and answers the hex; undefined where no such folder is there.
 */
export function freezeCarriedFiles(home: string, run: Pick<Run, 'id'>, workflowDir: string): string | undefined {
  const files = carriedFilesOf(workflowDir);
  return files === undefined ? undefined : freezeInto(home, files, run, 'carried');
}

/**
 * Every file of the carried folder beside the workflow at `workflowDir`, read and refused as `workflowFilesOf` reads and refuses them;
 * undefined where no such folder is there.
 */
export const carriedFilesOf = (workflowDir: string): WorkflowFile[] | undefined => {
  const dir = carriedDirOf(workflowDir);
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? workflowFilesOf(dir) : undefined;
};

/**
 * Copies `files`, a folder as read, into the run's copies of its workflow folder or of its carried files (`which`), under its digest, as
 * `freezeWorkflowFiles` says; answers the hex.
 */
function freezeInto(home: string, files: readonly WorkflowFile[], run: Pick<Run, 'id'>, which: 'workflow' | 'carried'): string {
  const hex = workflowFilesDigest(files);
  const parent = which === 'workflow' ? workflowFilesDir(home, run) : carriedFilesDir(home, run);
  const target = path.join(parent, hex);
  if (fs.existsSync(target)) return hex;
  fs.mkdirSync(parent, { recursive: true });
  const temp = fs.mkdtempSync(path.join(parent, `.${hex.slice(0, 12)}-`));
  try {
    for (const file of files) {
      const to = path.join(temp, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, file.bytes);
      fs.chmodSync(to, file.mode & 0o555);
    }
    fs.chmodSync(temp, 0o755);
    fs.renameSync(temp, target);
  } catch (err) {
    fs.rmSync(temp, { recursive: true, force: true });
    if (fs.existsSync(target)) return hex;
    throw err;
  }
  return hex;
}
