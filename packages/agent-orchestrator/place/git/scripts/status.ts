/**
 * `status`: the checkout an ending lands in, as a pass reads it (`mergeState` in `src/workspace/worktree.store.ts` reads the same). Takes
 * `{ checkout, tips }`, `tips` the run's result branches by name with their commits; answers `{ merging, conflicted, missing, head? }`:
 * whose merge is in progress — `ours` when every commit MERGE_HEAD names is one of `tips` — whether a path is unmerged, the result
 * branches a commit now would leave out, and HEAD. Unmerged paths are read with `ls-files --unmerged`, off the index as it is, never with a
 * diff, which refreshes the index and takes its lock in a checkout a person commits in. Refuses a checkout that is no git repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gitSays, isDirectory, refused, serve, strings, text } from './contract.ts';

/** The commits MERGE_HEAD names in `checkout`, none when no merge is in progress. */
function mergeHeads(checkout: string, file: string): string[] {
  const at = path.resolve(checkout, file);
  if (!fs.existsSync(at)) return [];
  return fs
    .readFileSync(at, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

serve((request) => {
  const checkout = text(request, 'checkout');
  const tips = strings(request, 'tips');
  const file = isDirectory(checkout) ? gitSays(checkout, ['rev-parse', '--git-path', 'MERGE_HEAD']) : undefined;
  if (file === undefined) return refused(`${checkout} is not a git repository, so no merge can be staged there`);
  const heads = mergeHeads(checkout, file);
  const shas = new Set(Object.values(tips));
  const merging = !heads.length ? 'none' : heads.every((h) => shas.has(h)) ? 'ours' : 'other';
  const missing = Object.entries(tips)
    .filter(([, sha]) => !heads.includes(sha) && gitSays(checkout, ['merge-base', '--is-ancestor', sha, 'HEAD']) === undefined)
    .map(([branch]) => branch);
  const head = gitSays(checkout, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const conflicted = Boolean(gitSays(checkout, ['ls-files', '--unmerged']));
  return { merging, conflicted, missing, ...(head ? { head } : {}) };
});
