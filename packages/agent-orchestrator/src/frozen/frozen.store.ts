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
import { ADDED_FOLDER_READS } from 'agent-runtime/vocabulary';
import fs from 'node:fs';
import path from 'node:path';
import type { Run } from '../record/record.ts';
import { runsDir } from '../record/record.store.ts';
import { carriedFilesRoot, homeFilesRoot, workflowFilesRoot } from '../record/places.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { CARRIED_FOLDER, HOME_FOLDER } from '../step/step.ts';

/**
 * The run's own copies of its workflow folder, `runs/<id>/workflow`, and with `hex` the one copy under that digest (`Run.workflowFiles`):
 * what a check and a session are told as `WF_WORKFLOW_FILES`. Beside the run's record, and removed with it (`nemia rm`).
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param hex The digest of one copy, or undefined for the folder of every copy.
 */
export const workflowFilesDir = (home: string, run: Pick<Run, 'id'>, hex?: string) => workflowFilesRoot(runsDir(home), run.id, hex);

/**
 * The run's own copies of the carried folder, `runs/<id>/carried`, and with `hex` the one copy under that digest (`Run.carriedFiles`):
 * what a check and a session are told as `WF_CARRIED_FILES`. Beside the run's record, and removed with it (`nemia rm`).
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param hex The digest of one copy, or undefined for the folder of every copy.
 */
export const carriedFilesDir = (home: string, run: Pick<Run, 'id'>, hex?: string) => carriedFilesRoot(runsDir(home), run.id, hex);

/**
 * The run's own copies of its factory's home, `runs/<id>/home`, and with `hex` the one copy under that digest (`Run.homeFiles`): the folder
 * each local session of the run starts in, where its harness adds its workspace beside it (`sessionStart`). Beside the run's record, and
 * removed with it (`nemia rm`).
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param hex The digest of one copy, or undefined for the folder of every copy.
 */
export const homeFilesDir = (home: string, run: Pick<Run, 'id'>, hex?: string) => homeFilesRoot(runsDir(home), run.id, hex);

/**
 * The home folder of a factory's tree (`tree`), `home/` in it, where its template gave one.
 * @param tree The factory's tree, or undefined for a factory made by hand, which has none.
 */
export const homeDirOf = (tree: string | undefined) => (tree === undefined ? undefined : path.join(tree, HOME_FOLDER));

/**
 * The factory's home in its tree (`homeDirOf`), where it is a folder; undefined where the factory has no tree or its tree no `home/`.
 * A look at the folder alone, none of its files read.
 * @param tree The factory's tree, or undefined for a factory made by hand.
 */
export const homeAt = (tree: string | undefined) => {
  const dir = homeDirOf(tree);
  return dir !== undefined && fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? dir : undefined;
};

/**
 * Every file of the factory's home in its tree (`homeAt`), read and refused as `workflowFilesOf` reads and refuses them; undefined
 * where the factory has no tree or its tree no `home/`.
 * @param tree The factory's tree, or undefined for a factory made by hand.
 */
export const homeFilesOf = (tree: string | undefined) => {
  const dir = homeAt(tree);
  return dir === undefined ? undefined : workflowFilesOf(dir);
};

/**
 * Copies the factory's home (`homeFilesOf`) into the run's own `home/<hex>/` (`homeFilesDir`), as `freezeWorkflowFiles` copies the
 * workflow's, and answers the hex; undefined where the factory has none.
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param tree The factory's tree, or undefined for a factory made by hand.
 */
export function freezeHomeFiles(home: string, run: Pick<Run, 'id'>, tree: string | undefined) {
  const files = homeFilesOf(tree);
  return files === undefined ? undefined : freezeInto(home, files, run, 'home');
}

/**
 * The carried folder of the workflow at `workflowDir`: `carried/` beside it, the files the workflows of its folder share.
 * @param workflowDir The workflow's folder.
 */
export const carriedDirOf = (workflowDir: string) => path.join(path.dirname(path.resolve(workflowDir)), CARRIED_FOLDER);

/** A file of a workflow folder: its path from the folder with `/` between parts, its permission bits, its bytes. */
export type WorkflowFile = { path: string; mode: number; bytes: Uint8Array };

/**
 * Every file of the workflow folder `dir`, at any depth, sorted by path in code-unit order. Refused (`Invalid`), naming the entry and the
 * fix: a symbolic link, which would hand the run what it points at as it is when read rather than as it was at the start, and anything
 * that is neither a file nor a folder.
 * @param dir The workflow folder to read.
 */
export function workflowFilesOf(dir: string) {
  const files: WorkflowFile[] = [];
  const walk = (at: string, rel: string) => {
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
 * @param files The folder's files, sorted by path (`workflowFilesOf`).
 */
export function workflowFilesDigest(files: readonly WorkflowFile[]) {
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
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param dir The workflow folder to copy.
 */
export const freezeWorkflowFiles = (home: string, run: Pick<Run, 'id'>, dir: string) =>
  freezeInto(home, workflowFilesOf(dir), run, 'workflow');

/**
 * Copies the carried folder beside the workflow at `workflowDir` (`carriedDirOf`) into the run's own `carried/<hex>/`
 * (`carriedFilesDir`), as `freezeWorkflowFiles` copies the workflow's, and answers the hex; undefined where no such folder is there.
 * @param home The store's home folder.
 * @param run The run, by its id.
 * @param workflowDir The workflow's folder, beside which the carried folder lies.
 */
export function freezeCarriedFiles(home: string, run: Pick<Run, 'id'>, workflowDir: string) {
  const files = carriedFilesOf(workflowDir);
  return files === undefined ? undefined : freezeInto(home, files, run, 'carried');
}

/**
 * Every file of the carried folder beside the workflow at `workflowDir`, read and refused as `workflowFilesOf` reads and refuses them;
 * undefined where no such folder is there.
 * @param workflowDir The workflow's folder, beside which the carried folder lies.
 */
export const carriedFilesOf = (workflowDir: string) => {
  const dir = carriedDirOf(workflowDir);
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? workflowFilesOf(dir) : undefined;
};

/**
 * Copies `files`, a folder as read, into the run's copies of its workflow folder, of its carried files or of its home (`which`), under its
 * digest, as `freezeWorkflowFiles` says; answers the hex.
 */
function freezeInto(home: string, files: readonly WorkflowFile[], run: Pick<Run, 'id'>, which: 'workflow' | 'carried' | 'home') {
  const hex = workflowFilesDigest(files);
  const parent =
    which === 'workflow' ? workflowFilesDir(home, run) : which === 'carried' ? carriedFilesDir(home, run) : homeFilesDir(home, run);
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

/**
 * What a filing finds on disk of where a step's session starts, for a run that froze a home (`StartFound`): the copy's path, whether it
 * holds a `.mcp.json`, and the skills of the home, of the workspace and of each folder the run mounts, read now; nothing for a run that
 * froze none.
 * @param home The store's root.
 * @param run The run: its frozen home, its mounts and its volumes.
 * @param workspace The step's workspace.
 */
export const startFoundAt = (home: string, run: Pick<Run, 'id' | 'homeFiles' | 'mounts' | 'volumes'>, workspace: string) => {
  if (run.homeFiles === undefined) return {};
  const at = homeFilesDir(home, run, run.homeFiles);
  const folders = [at, workspace, ...(run.mounts ?? []).map((m) => m.path), ...(run.volumes ?? []).map((m) => m.path)];
  return {
    start: {
      home: at,
      mcp: fs.statSync(path.join(at, '.mcp.json'), { throwIfNoEntry: false })?.isFile() === true,
      skills: Object.fromEntries(folders.map((folder) => [folder, projectSkillsIn(folder)])),
    },
  };
};

/**
 * The names of the skills a harness lists of a folder, each folder of its skills folder (`ADDED_FOLDER_READS`' `skills`) that holds a
 * `SKILL.md`, sorted, once each; none where it has none or cannot be read.
 * @param folder The folder.
 */
const projectSkillsIn = (folder: string) => {
  const names = new Set<string>();
  for (const reads of Object.values(ADDED_FOLDER_READS)) {
    const dir = path.join(folder, ...reads.skills);
    try {
      for (const name of fs.readdirSync(dir))
        if (fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile() === true) names.add(name);
    } catch {
      continue;
    }
  }
  return [...names].sort();
};
