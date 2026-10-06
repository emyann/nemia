/**
 * `open`: the repository a run starts in, read at `nemia start` (`openPlace` in `src/place/place.store.ts`) — the commit HEAD is at and
 * the branch it is on, and the file a merge staged there is named in. Takes `{ root }`; answers `{ repo, baseRef, branch, staged }`,
 * `repo` as given, `staged` the absolute path of the checkout's MERGE_HEAD, which is there exactly while a merge is in progress, and is
 * found where git keeps it in a linked worktree too. Refuses a `root` that is no directory, no git repository, or a repository with no
 * commit yet.
 */
import path from 'node:path';
import { git, gitSays, isDirectory, refused, serve, text } from './contract.ts';

serve((request) => {
  const root = text(request, 'root');
  if (!isDirectory(root)) return refused(`${root} is not a directory: name a git repository with --repo`);
  if (gitSays(root, ['rev-parse', '--git-dir']) === undefined)
    return refused(`${root} is not a git repository: run git init there and commit once, or name a repository with --repo`);
  const baseRef = gitSays(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!baseRef) return refused(`${root} has no commit yet, so a run has nothing to start from: commit once there, then start again`);
  const staged = path.resolve(root, git(root, ['rev-parse', '--git-path', 'MERGE_HEAD']));
  return { repo: root, baseRef, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']), staged };
});
