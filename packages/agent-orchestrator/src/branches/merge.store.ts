/**
 * Whether a run's result branches still merge onto its base branch as the base is now, as `git merge-tree --write-tree` answers it: a
 * merge made in git's object store alone, which touches no checkout, no index and no ref. What a person reads before approving an ending
 * that merges, so a conflict is seen at the gate rather than as the ending's abort; the ending does its own trial merge when it runs.
 */
import { execCounted } from '../meter/tally.store.ts';
import { isGitRun } from '../record/record.ts';
import { runStore } from '../record/files.store.ts';

/**
 * Whether a branch merges onto its base: `clean` when it would merge with no conflict; the files it would conflict in otherwise, as git
 * names them; `error` where git could not say — a branch it no longer has, or a git older than 2.38, which has no `--write-tree` — never a
 * guess either way.
 */
export type MergeWord = { clean: true } | { clean: false; conflicts: string[] } | { error: string };

/** Whether a branch ahead of the base still merges onto it (`MergeWord`), and that in words (`mergeWord`). */
export type StandingMerge = MergeWord & { said: string };

/**
 * Whether `branch` merges onto `onto` in `repo` (`MergeWord`). Git's exit 1 is its answer that the merge conflicts, the tree it wrote on
 * the first line of its output and then each conflicted file once; any other failure is an `error`, in git's first line.
 */
export function mergesOnto(repo: string, onto: string, branch: string): MergeWord {
  try {
    execCounted('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', onto, branch], {
      cwd: repo,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return { clean: true };
  } catch (err) {
    const { status, stdout, stderr, message } = err as { status?: number | null; stdout?: string; stderr?: string; message: string };
    if (status === 1 && stdout) return { clean: false, conflicts: stdout.split('\n').slice(1).filter(Boolean) };
    return { error: (stderr || message).trim().split('\n')[0] || `git merge-tree exited ${status}` };
  }
}

/** The fact in a person's words: `merges cleanly onto main`, or which files it conflicts in, or why git could not say. */
export const mergeWord = (merge: MergeWord, onto: string): string =>
  'error' in merge
    ? `whether it merges onto ${onto} is not known: ${merge.error}`
    : merge.clean
      ? `merges cleanly onto ${onto}`
      : `conflicts with ${onto} in ${merge.conflicts.length} file${merge.conflicts.length === 1 ? '' : 's'}: ${merge.conflicts.join(', ')}`;

/**
 * Whether each of `branches` merges onto the base branch of the run `runId` (`StandingMerge`), keyed by branch; none for a run that is not
 * a git run, which has no base to merge onto. Throws `Missing` for a run the store does not have.
 */
export function mergesOf(runId: string, branches: readonly string[]): Record<string, StandingMerge> {
  const run = runStore.runs.read(runId);
  if (!isGitRun(run)) return {};
  return Object.fromEntries(
    branches.map((branch) => {
      const merge = mergesOnto(run.repo, run.branch, branch);
      return [branch, { ...merge, said: mergeWord(merge, run.branch) }];
    }),
  );
}
