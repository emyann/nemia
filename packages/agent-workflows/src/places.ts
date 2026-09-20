/**
 * Where a run's steps work, for a run that is not a git run: the kinds of workspace a team can say beside git's (`place` on the run
 * record). One so far, `folder` (`workspace: folder`), and nothing here reads git, the network, or the engine.
 *
 * A git run's steps work in worktrees of its repository, and every word about them — cut, merge, hand-off commit, branch, standing,
 * forget — stays in runner.ts, where the shipped folders' runs are pinned (`git-before-after.test.ts`). A folder run is the other kind,
 * whole: what `advance` makes for a step, what it does when the step is finished, and where it all lives, which is under the run's own
 * directory in the store, so `wf rm` forgets it with the record and runs no git.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GIVEN, givenPlan, type FolderRun, type WorkspacePlan } from './run.ts';

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
 * Where `wf start --input` puts a run's files: `runs/<id>/inputs`, the one writer of that path, which runner.ts's `inputsDir` reads. Here
 * because a folder step's folder is given a copy of it (`folderPlace.make`), and a path two files spell for themselves drifts apart.
 */
export const inputsRoot = (runs: string, id: string): string => path.join(runs, id, 'inputs');

/**
 * One directory copied into a folder step's folder, whole, with two things left behind.
 *
 * A symlink: `cpSync` copies one as a symlink, and a link in a step's folder pointing out of it is the fence undone by a file — the thing
 * `writeWorkflow` already refuses by name. It is skipped, not followed: the copy is of what the folder holds, not of what it points at.
 *
 * And the source's own `given/`: a parent was given its parents' folders the same way, and copying that on would square the run's work at
 * every fan-in down a chain. What this step waits on is what that step MADE.
 *
 * Replaced, not merged over. `make` runs on every filing of the step, and a step is filed more than once: a person's objection at a gate
 * unfiles the step the work is sent back from, keeping its folder (`sentBack`), and a later pass files it again — with a try of the work
 * between the two. A copy laid over the one from before would keep a file the parent has since deleted or renamed, while the brief calls
 * the whole of it *a copy, taken as this step was filed*, and the step would raise findings about work that is not there any more. So the
 * copy is emptied first: what is under `given/` is the run's to write, and the step is told to make what it makes outside it. (A round is
 * not one of those filings: `validateLoops` holds a loop's steps to a chain, so each of them continues the one before in its folder, and
 * the target the round files itself, in the folder its record keeps.)
 */
function copyGiven(from: string, to: string): void {
  fs.rmSync(to, { recursive: true, force: true });
  if (!fs.existsSync(from)) return;
  const skip = path.join(from, GIVEN);
  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    // The source's own `given/` is a DIRECTORY the run made. A regular file a step wrote and called `given` is its work, as the board's
    // listing already reads it (`folderFiles`), and is copied like any other.
    filter: (src) => {
      const at = fs.lstatSync(src);
      return !at.isSymbolicLink() && !(src === skip && at.isDirectory());
    },
  });
}

/**
 * `<workspace>/given` is the run's own to empty and write, and every path `copyGiven` removes and copies to goes through it. A step that
 * left a link there — or anything but a directory — would have the next filing of it remove and write wherever the link points, outside
 * the folder: refused by name, as `writeWorkflow` refuses a link, and never followed. Nothing is removed, and the step is not filed.
 */
function ownGiven(workspace: string): void {
  const at = path.join(workspace, GIVEN);
  const found = fs.lstatSync(at, { throwIfNoEntry: false });
  if (!found || (found.isDirectory() && !found.isSymbolicLink())) return;
  const what = found.isSymbolicLink() ? 'a link' : 'not a directory';
  throw Object.assign(new Error(
    `${at} is ${what}, and \`${GIVEN}/\` in a step's folder is the run's own: it is emptied and written each time the step is filed, so it is never followed. ` +
    `Remove or rename it — the step's own work belongs outside \`${GIVEN}/\` — and the next tick files the step.`,
  ), { exitCode: 2 });
}

/**
 * The `folder` kind. Each step gets `runs/<id>/work/<step>`, made empty — except a step that continues another's session (`inherit`),
 * which works in that step's folder, since a harness session is tied to the directory it ran in. A fork gets a folder of its own; a
 * fan-in gets one too, and nothing is merged into it: what the steps before it made reaches it as their declared output (`input:`), their
 * collected artifacts, and a copy of each of their folders under `given/from/<step>`, which is what its brief names (`givenPlan`).
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
    // What the step's brief will tell it to read, put where it can read it. A folder team runs in `dontAsk`, so a path outside this
    // directory is denied with no prompt: the run's inputs and the folders this step waits on are copied in rather than pointed at
    // (`givenPlan` in run.ts, which words the brief off the same plan). Nothing to copy, nothing made: a chain's folder is as it was.
    const given = givenPlan(run, plan);
    const notes: string[] = [];
    if (given.inputs || given.from.length > 0) ownGiven(workspace);
    if (given.inputs) {
      copyGiven(inputsRoot(runs, run.id), path.join(workspace, given.inputs));
      notes.push(`${given.inputs}: the files wf start --input gave the run, copied in`);
    }
    for (const g of given.from) {
      copyGiven(g.source, path.join(workspace, g.dir));
      notes.push(`${g.dir}: ${g.step}'s folder, copied in`);
    }
    return { workspace, notes };
  },
  handOff() {},
});
