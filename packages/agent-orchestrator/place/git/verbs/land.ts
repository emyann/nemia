/**
 * `land`: commit the merge staged in a checkout, or take it back (`landThrough` in `src/place/landing.store.ts` asks it). Takes `{ repo,
 * act: 'commit', message }`, `repo` the checkout, committing with `message` on stdin as the repository's own identity, its hooks and
 * signing honoured, and answers `{ commit }`; or `{ repo, act: 'abort' }`, and answers `{ aborted: true }`. Refuses either act when no
 * merge is in progress there, and, in git's words, a commit or an abort git will not make — a path still unmerged, a hook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { failedWords, git, gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The verb's body. */
export function* land(request: PlaceRequests['land']): Asking<Reply<'land'>> {
  const { repo: checkout, act } = request;
  const file = isDirectory(checkout) ? yield* gitSays(checkout, ['rev-parse', '--git-path', 'MERGE_HEAD']) : undefined;
  if (file === undefined) return refused(`${checkout} is not a git repository, so there is no merge to ${act}`);
  if (!fs.existsSync(path.resolve(checkout, file))) return refused(`no merge is in progress in ${checkout}, so there is none to ${act}`);
  try {
    if (request.act === 'abort') {
      yield* git(checkout, ['merge', '--abort']);
      return { aborted: true };
    }
    yield* git(checkout, ['commit', '-F', '-'], request.message);
    return { commit: yield* git(checkout, ['rev-parse', 'HEAD']) };
  } catch (err) {
    return refused(failedWords(err));
  }
}
