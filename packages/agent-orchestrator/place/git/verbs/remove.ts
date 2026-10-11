/**
 * `remove`: take away what a run left in a repository. Takes `{ repo, workspaces, branches }`; removes each worktree of `workspaces` by
 * `git worktree remove`, never forced, so git refuses one that holds a change; then prunes git's list of worktrees whose directory is gone;
 * then deletes each branch of `branches`. Answers `{ removed, left, deleted, kept }`: what went, and what git would not remove or delete,
 * each in git's words. Refuses a repository that is no directory.
 */
import { failedWords, git, gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The verb's body. */
export function* remove({ repo, workspaces, branches }: PlaceRequests['remove']): Asking<Reply<'remove'>> {
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so there is no repository to remove anything from`);
  const removed: string[] = [];
  const left: Array<{ path: string; said: string }> = [];
  for (const workspace of workspaces) {
    try {
      yield* git(repo, ['worktree', 'remove', workspace]);
      removed.push(workspace);
    } catch (err) {
      left.push({ path: workspace, said: failedWords(err) });
    }
  }
  yield* gitSays(repo, ['worktree', 'prune']);
  const deleted: string[] = [];
  const kept: Array<{ branch: string; said: string }> = [];
  for (const branch of branches) {
    try {
      yield* git(repo, ['branch', '-D', branch]);
      deleted.push(branch);
    } catch (err) {
      kept.push({ branch, said: failedWords(err) });
    }
  }
  return { removed, left, deleted, kept };
}
