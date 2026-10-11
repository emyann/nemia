/**
 * `open`: the repository a run starts in, read at `nemia start` (`openPlace` in `src/place/place.store.ts`) — the commit HEAD is at and
 * the branch it is on, and the file a merge staged there is named in. Takes `{ root, isolate }`; answers `{ repo, baseRef, branch, staged
 * }`, `repo` as given, `staged` the absolute path of the checkout's MERGE_HEAD, which is there exactly while a merge is in progress, and is
 * found where git keeps it in a linked worktree too. Refuses a `root` that is no directory, no git repository, or a repository with no
 * commit yet; and, for a run that cuts worktrees (`isolate`), a `.worktreeinclude` that is no file or has a line `make` would refuse as
 * written (`worktreeInclude`), each line named, before anything of the run is written.
 */
import path from 'node:path';
import { git, gitSays, isDirectory, readInclude, refusalLines, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** Why `root`'s `.worktreeinclude` cannot serve a run that cuts worktrees, in words that name the fix; undefined when it can. */
function includeRefusal(root: string): string | undefined {
  const include = readInclude(root);
  if (typeof include === 'string') return `${include}: write it as a file, one gitignored path per line, or remove it`;
  if (!include?.refused.length) return undefined;
  const { refused: lines } = include;
  return `${path.join(root, '.worktreeinclude')}: ${refusalLines(lines).join('; ')}. Each line is a gitignored path inside the repository, relative to its root — fix or remove ${lines.length === 1 ? 'that line' : 'those lines'}.`;
}

/** The verb's body. */
export function* open({ root, isolate }: PlaceRequests['open']): Asking<Reply<'open'>> {
  if (!isDirectory(root)) return refused(`${root} is not a directory: name a git repository with --repo`);
  if ((yield* gitSays(root, ['rev-parse', '--git-dir'])) === undefined)
    return refused(`${root} is not a git repository: run git init there and commit once, or name a repository with --repo`);
  const baseRef = yield* gitSays(root, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  if (!baseRef) return refused(`${root} has no commit yet, so a run has nothing to start from: commit once there, then start again`);
  const include = isolate ? includeRefusal(root) : undefined;
  if (include) return refused(include);
  const staged = path.resolve(root, yield* git(root, ['rev-parse', '--git-path', 'MERGE_HEAD']));
  return { repo: root, baseRef, branch: yield* git(root, ['rev-parse', '--abbrev-ref', 'HEAD']), staged };
}
