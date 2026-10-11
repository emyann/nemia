/**
 * `trial`: whether each branch merges onto another as both are now, by `git merge-tree --write-tree`, a merge made in git's object store
 * alone, which touches no checkout, no index and no ref. Takes `{ repo, trials }`, `trials` a list of `{ onto, branch }`; answers
 * `{ at, trials }`: the commit each `onto` names now (null where git has none), and each trial in the order asked — `{ clean: true }`,
 * `{ clean: false, conflicts }` with the files git names, or `{ unknown }` in git's first line, a branch it lacks or a git older than 2.38,
 * never a guess either way. Refuses a repository that is no directory.
 */
import { Failed, gitSays, isDirectory, printed, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests, TrialMerge } from '../../../src/place/place.ts';

/**
 * Whether `branch` merges onto `onto` in `repo`. Git's exit 1 with output is its answer that the merge conflicts: the tree it wrote on the
 * first line, then each conflicted file once. Any other failure is not known, in git's first line.
 */
function* tried(repo: string, { onto, branch }: { readonly onto: string; readonly branch: string }): Asking<TrialMerge> {
  try {
    yield* printed({ cmd: 'git', cwd: repo, args: ['merge-tree', '--write-tree', '--name-only', '--no-messages', onto, branch] });
    return { clean: true };
  } catch (err) {
    if (!(err instanceof Failed)) throw err;
    const { status, stdout, stderr, message } = err;
    if (status === 1 && stdout) return { clean: false, conflicts: stdout.split('\n').slice(1).filter(Boolean) };
    return { unknown: (stderr || message).trim().split('\n')[0] || `git merge-tree exited ${status}` };
  }
}

/** The verb's body. */
export function* trial({ repo, trials }: PlaceRequests['trial']): Asking<Reply<'trial'>> {
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so no branch in it can be tried`);
  const at: Record<string, string | null> = {};
  for (const onto of new Set(trials.map((p) => p.onto)))
    at[onto] = (yield* gitSays(repo, ['rev-parse', '--verify', '--quiet', `${onto}^{commit}`])) ?? null;
  const answers: TrialMerge[] = [];
  for (const pair of trials) answers.push(yield* tried(repo, pair));
  return { at, trials: answers };
}
