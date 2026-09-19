import { execFileSync } from 'node:child_process';

/**
 * Whether a result branch still merges onto the base branch as it is now, as `git merge-tree --write-tree` answers it: a merge made in git's
 * object store alone, which touches no checkout, no index and no ref. `clean` when it would merge with no conflict; the files it would
 * conflict in otherwise, as git names them; `error` where git could not say — a branch it no longer has, or a git older than 2.38, which has
 * no `--write-tree` — never a guess either way.
 *
 * The api's and not the package's: nothing in agent-workflows asks it, and an ending step that merges does its own trial merge when it runs.
 * This is what a person reads before approving that step, so a conflict is seen at the gate rather than as the ending's abort. A git call a
 * branch, so read on a run's decision, which is read once for a state of the run, never on the list the Factory polls.
 */
export type MergeWord = { clean: true } | { clean: false; conflicts: string[] } | { error: string };

export function mergesOnto(repo: string, onto: string, branch: string): MergeWord {
  try {
    execFileSync('git', ['merge-tree', '--write-tree', '--name-only', '--no-messages', onto, branch], {
      cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024,
    });
    return { clean: true };
  } catch (err) {
    const { status, stdout, stderr, message } = err as { status?: number | null; stdout?: string; stderr?: string; message: string };
    // Exit 1 is git's answer that the merge conflicts: the tree it wrote on the first line, then each conflicted file once.
    if (status === 1 && stdout) return { clean: false, conflicts: stdout.split('\n').slice(1).filter(Boolean) };
    return { error: (stderr || message).trim().split('\n')[0] || `git merge-tree exited ${status}` };
  }
}

/** The fact in a person's words: `merges cleanly onto main`, or which files it conflicts in, or why git could not say. */
export const mergeWord = (merge: MergeWord, onto: string): string =>
  ('error' in merge
    ? `whether it merges onto ${onto} is not known: ${merge.error}`
    : merge.clean
      ? `merges cleanly onto ${onto}`
      : `conflicts with ${onto} in ${merge.conflicts.length} file${merge.conflicts.length === 1 ? '' : 's'}: ${merge.conflicts.join(', ')}`);
