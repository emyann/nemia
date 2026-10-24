/**
 * What is said of a repository run's result branches once they are named: where each stands (`branchStandings`), whether one is on its base
 * (`landedOf`), and a run another waits on as its record and a reader say it (`parentRecord`) — each read through a `BranchReader`, which
 * answers off what the place's `standing` said (`standingReader`), never off a git process of its own. What a branch changed against the
 * run's base is the place's to say (`changes.store.ts`).
 *
 * Beneath the controllers, beside `record.store.ts`, reading a run through `runStore` (`files.store.ts`): it imports neither the engine nor
 * a controller, and `runner.ts` re-exports most of what it exports.
 */
import { resultSteps } from './branches.ts';
import { isRepositoryRun, type RepositoryRun, type Run } from '../record/record.ts';
import type { BranchStanding } from '../status/status.ts';
import type { ParentRun } from '../wait/wait.ts';
import type { Landed } from '../decide/decide.ts';
import { runStore } from '../record/files.store.ts';
import { stepsOf } from '../record/record.store.ts';

/** Where a run's result branches stand, as `branchStandings` says: none for a folder run, which has no branch. */
export const standingsOf = (run: Run, git: BranchReader): BranchStanding[] =>
  isRepositoryRun(run) ? branchStandings(run, resultBranches(run), git) : [];

/** Whether a branch of the run is on its base, as `git` says: never, for a folder run, which has no branch to ask about. */
export const landedOf =
  (run: Run, git: BranchReader) =>
  (branch: string): Landed =>
    isRepositoryRun(run) ? git.landed(run, branch) : false;

/**
 * Where each of a run's result branches stands against the base branch it was cut from, as `git` says it (`BranchStanding`): unread, where
 * it was not read, with why; on it (either yes of `landed`); gone — git no longer has it, and no recorded tip puts it on the base — or
 * ahead of it, by the commits the base branch does not have.
 *
 * Read on the pass that asks and never stored, for the reason `landed` is asked rather than stored: a person merging by hand changes the
 * answer, and nothing tells the run. A branch git cannot count reads as ahead by none rather than as landed.
 */
export function branchStandings(run: RepositoryRun, branches: readonly string[], git: BranchReader): BranchStanding[] {
  return [...new Set(branches)].map((branch): BranchStanding => {
    const why = git.unread(run, branch);
    if (why !== undefined) return { branch, where: 'unread', why };
    if (git.landed(run, branch) !== false) return { branch, where: 'on' };
    if (!git.has(run.repo, branch)) return { branch, where: 'gone' };
    return { branch, where: 'ahead', commits: git.ahead(run, branch) };
  });
}

/**
 * What is said of result branches — whether one is on its base, whether git has it, how far one is ahead of its base, every branch of a
 * repository — off one reading of where they stand (`standingReader`), for one pass, one command or one request.
 */
export type BranchReader = {
  /**
   * Whether the branch has landed on the run's base branch, and which yes it is (`Landed`, `landedOver`): a branch git no longer has is
   * asked by the tip the run recorded (`tipsSeen`). False where it was not read.
   */
  landed(run: RepositoryRun, branch: string): Landed;
  /** Whether git has the branch; true where nothing of the repository was read, so a branch not read is never called gone. */
  has(repo: string, branch: string): boolean;
  /** The commits on the branch that the run's base branch does not have; none where git cannot count, or nothing was read. */
  ahead(run: RepositoryRun, branch: string): number;
  /**
   * Each branch of the repository and its commit, off the reading the answers come from — what a memo of those answers keys them by, so a
   * branch that moves between the answer and the key is read as moved. Empty where none was read.
   */
  heads: (repo: string) => ReadonlyMap<string, string>;
  /**
   * Why where the run's result branches stand — or `branch`, where given — was not read: its repository, place and base branch were not
   * asked, the place refused or was not heard, or the branch was not asked of. Undefined where it was read.
   */
  unread: (run: RepositoryRun, branch?: string) => string | undefined;
};

/**
 * A run another waits on, as its record and `git` say it without the engine: the record, when the store has one, and the result branches
 * it names that git no longer has and cannot find on the base by their recorded tips (`BranchReader.landed`). What `nemia start --after`
 * refuses an edge by (`afterRefusal`), and where `parentOf` starts. A record whose steps cannot be read — no frozen workflow, and its
 * folder gone — names no result branch; one whose branches were not read names none gone.
 */
export function parentRecord(id: string, git: BranchReader): Pick<ParentRun, 'record' | 'gone'> {
  let record: Run;
  try {
    record = runStore.runs.read(id);
  } catch {
    return {};
  }
  let branches: string[];
  try {
    branches = resultBranches(record);
  } catch {
    branches = [];
  }
  const cut = isRepositoryRun(record) ? record : undefined;
  const gone = cut ? branches.filter((b) => git.unread(cut, b) === undefined && !git.has(cut.repo, b) && !git.landed(cut, b)) : [];
  return { record, ...(gone.length ? { gone } : {}) };
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it: the branches of its result steps that have one.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the result and stays in the repository. A
 * terminal step's branch is named as soon as it has one, so it is useful while the run is still going, not only afterwards.
 */
export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
