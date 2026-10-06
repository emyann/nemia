/**
 * `open`: the repository a run starts in, read at `nemia start` (`openPlace` in `src/place/place.store.ts`) — the commit HEAD is at and
 * the branch it is on. Takes `{ root }`; answers `{ repo, baseRef, branch }`, `repo` as given. Refuses a `root` that is no directory, no
 * git repository, or a repository with no commit yet.
 */
import { git, gitSays, isDirectory, refused, serve, text } from './contract.ts';

serve((request) => {
  const root = text(request, 'root');
  if (!isDirectory(root)) return refused(`${root} is not a directory: name a git repository with --repo`);
  if (gitSays(root, ['rev-parse', '--git-dir']) === undefined)
    return refused(`${root} is not a git repository: run git init there and commit once, or name a repository with --repo`);
  const baseRef = gitSays(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!baseRef) return refused(`${root} has no commit yet, so a run has nothing to start from: commit once there, then start again`);
  return { repo: root, baseRef, branch: git(root, ['rev-parse', '--abbrev-ref', 'HEAD']) };
});
