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
import type { FolderRun, WorkspacePlan } from './run.ts';

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
 * The `folder` kind. Each step gets `runs/<id>/work/<step>`, made empty — except a step that continues another's session (`inherit`),
 * which works in that step's folder, since a harness session is tied to the directory it ran in. A fork gets a folder of its own; a
 * fan-in gets one too, and nothing is merged into it: what the steps before it made reaches it as their declared output (`input:`) and
 * their collected artifacts, which its brief names.
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
    return { workspace, notes: [] };
  },
  handOff() {},
});
