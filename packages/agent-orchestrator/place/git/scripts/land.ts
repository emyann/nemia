/**
 * `land`: commit the merge staged in a checkout, or take it back (`landThrough` in `src/place/landing.store.ts` asks it).
 * Takes `{ checkout, act: 'commit', message }`, committing with `message` on stdin as the repository's own identity, its hooks and
 * signing honoured, and answers `{ commit }`; or `{ checkout, act: 'abort' }`, and answers `{ aborted: true }`. Refuses either act when
 * no merge is in progress there, and, in git's words, a commit or an abort git will not make — a path still unmerged, a hook.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Malformed, failedWords, git, gitSays, isDirectory, refused, serve, text } from './contract.ts';

serve((request) => {
  const checkout = text(request, 'checkout');
  const act = text(request, 'act');
  if (act !== 'commit' && act !== 'abort')
    throw new Malformed(`the request's \`act\` is ${JSON.stringify(act)}, where commit or abort is asked`);
  const message = act === 'commit' ? text(request, 'message') : '';
  const file = isDirectory(checkout) ? gitSays(checkout, ['rev-parse', '--git-path', 'MERGE_HEAD']) : undefined;
  if (file === undefined) return refused(`${checkout} is not a git repository, so there is no merge to ${act}`);
  if (!fs.existsSync(path.resolve(checkout, file))) return refused(`no merge is in progress in ${checkout}, so there is none to ${act}`);
  try {
    if (act === 'abort') {
      git(checkout, ['merge', '--abort']);
      return { aborted: true };
    }
    git(checkout, ['commit', '-F', '-'], message);
    return { commit: git(checkout, ['rev-parse', 'HEAD']) };
  } catch (err) {
    return refused(failedWords(err));
  }
});
