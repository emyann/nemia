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
import { workflowFilesRoot } from '../record/places.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/**
 * The run's own copies of its workflow folder, `runs/<id>/workflow`, and with `hex` the one copy under that digest (`Run.workflowFiles`):
 * what a check and a session are told as `WF_WORKFLOW_FILES`. Beside the run's record, and removed with it (`nemia rm`).
 */
export const workflowFilesDir = (run: Pick<Run, 'id'>, hex?: string): string => workflowFilesRoot(runsDir(), run.id, hex);

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
            `${full}: ${st.isSymbolicLink() ? 'a symbolic link' : 'neither a file nor a folder'} in the workflow folder ${dir}, which a run ` +
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
export function freezeWorkflowFiles(run: Pick<Run, 'id'>, dir: string): string {
  const files = workflowFilesOf(dir);
  const hex = workflowFilesDigest(files);
  const target = workflowFilesDir(run, hex);
  if (fs.existsSync(target)) return hex;
  const parent = workflowFilesDir(run);
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
