/**
 * Where a run's steps work, for a run that is not a git run: the kinds of workspace a team can say beside git's (`place` on the run
 * record). There is one, `folder` (`workspace: folder`), and nothing here reads git, the network, or the engine.
 *
 * A git run's steps work in worktrees of its repository, and every word about them is in worktree.store.ts, branches.store.ts,
 * forget.verb.ts and prune.verb.ts. A folder run is the other kind, whole: what
 * `advance` makes for a step, what it does when the step is finished, and where it all lives, which is under the run's own directory in the
 * store, so `nemia rm` forgets it with the record and runs no git.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { FolderRun } from './record.ts';
import { GIVEN, givenPlan, type WorkspacePlan } from '../workspace/workspace.ts';
import { Conflict } from '../refusal/refusal.ts';

/** What a kind of workspace does for a run: make a step's directory, and hand a finished step's work on. */
export type Place = {
  /** The directory a step works in, made real before the step is filed, and what the step's brief is told about it. */
  make(run: FolderRun, plan: WorkspacePlan, step: string): { workspace: string; notes: string[] };
  /**
   * What is due when a step is finished, beside collecting its artifacts, which every kind does: a git run commits what the step left
   * uncommitted; a folder has nothing to commit, and its files are where the step left them.
   */
  handOff(run: FolderRun, step: string): void;
};

/** A folder run's folders: `runs/<id>/work`, beside its artifacts and inputs, and removed with them. `runs` is the store's `runs/`. */
export const workRoot = (runs: string, id: string): string => path.join(runs, id, 'work');

/**
 * Where `nemia start --input` puts a run's files: `runs/<id>/inputs`, the one writer of that path, which record.store.ts's `inputsDir` reads.
 * Here because a folder step's folder is given a copy of it (`folderPlace.make`), and a path two files spell for themselves drifts apart.
 */
export const inputsRoot = (runs: string, id: string): string => path.join(runs, id, 'inputs');

/**
 * Replaces `to` with a copy of the directory `from`, taken now, or with nothing when `from` is not there. The copy leaves out:
 * - every symlink, unfollowed: a link in a step's folder pointing out of it undoes the fence, as `writeWorkflow` refuses by name;
 * - the source's own `given/` directory, which the run made for that step: what a step waits on is what that step made. A regular file
 *   a step wrote and called `given` is its work, as the board's listing reads it (`folderFiles`), and is copied.
 *
 * `to` is emptied first, never merged over: a step is filed again after a person sends work back to it (`sentBack`), and its copy then
 * holds no file the parent has since deleted or renamed.
 */
function copyGiven(from: string, to: string): void {
  fs.rmSync(to, { recursive: true, force: true });
  if (!fs.existsSync(from)) return;
  const skip = path.join(from, GIVEN);
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (src) => {
      const at = fs.lstatSync(src);
      return !at.isSymbolicLink() && !(src === skip && at.isDirectory());
    },
  });
}

/**
 * Refuses, with exit 2 and nothing removed, a `<workspace>/given` that is a link or not a directory: `copyGiven` empties and writes that
 * path on each filing, and would otherwise remove and write wherever the link points, outside the folder. Passes when it is absent.
 */
function ownGiven(workspace: string): void {
  const at = path.join(workspace, GIVEN);
  const found = fs.lstatSync(at, { throwIfNoEntry: false });
  if (!found || (found.isDirectory() && !found.isSymbolicLink())) return;
  const what = found.isSymbolicLink() ? 'a link' : 'not a directory';
  throw new Conflict({
    message:
      `${at} is ${what}, and \`${GIVEN}/\` in a step's folder is the run's own: it is emptied and written each time the step is filed, so it is never followed. ` +
      `Remove or rename it — the step's own work belongs outside \`${GIVEN}/\` — and the next tick files the step.`,
  });
}

/**
 * The `folder` kind. Each step gets `runs/<id>/work/<step>`, except a step that continues another's session (`inherit`), which works in
 * that step's folder, since a harness session is tied to the directory it ran in. A fork and a fan-in each get a folder of their own, and
 * nothing is merged into it: what the steps before it made reaches it as their declared output (`input:`), their collected artifacts, and
 * a copy of each of their folders under `given/from/<step>`.
 *
 * `make` copies in what the step's brief tells it to read (`givenPlan`, which words the brief off the same plan): a folder team runs in
 * `dontAsk`, where a path outside its directory is denied without a prompt. With nothing to copy, the folder is left as it was.
 */
export const folderPlace = (runs: string): Place => ({
  make(run, plan, step) {
    if (plan.kind === 'inherit') {
      const from = run.steps[plan.from]?.workspace;
      if (!from) throw new Error(`${step}: ${plan.from} has no folder yet`);
      return { workspace: from, notes: [] };
    }
    const workspace = path.join(workRoot(runs, run.id), step);
    fs.mkdirSync(workspace, { recursive: true });
    const given = givenPlan(run, plan);
    const notes: string[] = [];
    if (given.inputs || given.from.length > 0) ownGiven(workspace);
    if (given.inputs) {
      copyGiven(inputsRoot(runs, run.id), path.join(workspace, given.inputs));
      notes.push(`${given.inputs}: the files nemia start --input gave the run, copied in`);
    }
    for (const g of given.from) {
      copyGiven(g.source, path.join(workspace, g.dir));
      notes.push(`${g.dir}: ${g.step}'s folder, copied in`);
    }
    return { workspace, notes };
  },
  handOff() {},
});
