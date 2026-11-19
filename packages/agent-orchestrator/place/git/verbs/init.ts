/**
 * `init`: a folder made a repository a run can cut a worktree from. Takes `{ dir }`, an absolute path, made where it is not there;
 * answers `{ repo, made }`: `dir`, and whether anything was made now. Where `dir` is no repository's top, git makes one there; where the
 * repository has no commit yet, one empty first commit is made, adding none of the folder's files, which stay untracked until the person
 * commits them. A repository with a commit already answers `made: false`, nothing touched. Refuses a relative `dir`, a `dir` that is a
 * file, and a commit git will not make, naming the identity to set where git has none.
 */
import fs from 'node:fs';
import path from 'node:path';
import { failedWords, git, gitSays, refused } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The message of the empty first commit. */
const FIRST = 'Begin';

/** Whether `dir` is the top of a repository of its own, and not a folder inside another one. */
function* isTop(dir: string) {
  const top = yield* gitSays(dir, ['rev-parse', '--path-format=absolute', '--show-toplevel']);
  return top !== undefined && top === fs.realpathSync(dir);
}

/** The verb's body. */
export function* init({ dir }: PlaceRequests['init']) {
  if (!path.isAbsolute(dir)) return refused(`${dir} is not an absolute path: name the folder to make a repository from the root`);
  const there = fs.statSync(dir, { throwIfNoEntry: false });
  if (there && !there.isDirectory()) return refused(`${dir} is a file, not a folder: name a folder to make a repository`);
  fs.mkdirSync(dir, { recursive: true });
  let made = false;
  if (!(yield* isTop(dir))) {
    yield* git(dir, ['init', '--quiet']);
    made = true;
  }
  if ((yield* gitSays(dir, ['rev-parse', '--verify', '--quiet', 'HEAD'])) !== undefined) return { repo: dir, made };
  try {
    yield* git(dir, ['commit', '--quiet', '--allow-empty', '--no-verify', '-m', FIRST]);
  } catch (err) {
    const words = failedWords(err);
    if (/tell me who you are|user\.email|user\.name|empty ident/i.test(words))
      return refused(
        `${dir} is a repository now, but git has no identity to make its first commit: set one with git config --global user.name "<name>" and git config --global user.email "<email>", then ask again`,
      );
    return refused(`${dir} is a repository now, but its first commit could not be made: ${words}`);
  }
  return { repo: dir, made: true };
}
