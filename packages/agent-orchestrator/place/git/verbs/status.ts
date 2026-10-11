/**
 * `status`: the checkout an ending lands in, as a pass reads it (`checkoutStatus` in `src/place/landing.store.ts` asks it). Takes
 * `{ checkout, tips }`, `tips` the run's result branches by name with their commits; answers `{ merging, conflicted, missing, head? }`:
 * whose merge is in progress — `ours` when every commit MERGE_HEAD names is one of `tips` — whether a path is unmerged, the result
 * branches a commit now would leave out, and HEAD. Unmerged paths are read with `ls-files --unmerged`, off the index as it is, never with a
 * diff, which refreshes the index and takes its lock in a checkout a person commits in. Refuses a checkout that is no git repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

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

/** The verb's body. */
export function* status({ checkout, tips }: PlaceRequests['status']): Asking<Reply<'status'>> {
  const file = isDirectory(checkout) ? yield* gitSays(checkout, ['rev-parse', '--git-path', 'MERGE_HEAD']) : undefined;
  if (file === undefined) return refused(`${checkout} is not a git repository, so no merge can be staged there`);
  const heads = mergeHeads(checkout, file);
  const shas = new Set(Object.values(tips));
  const merging = !heads.length ? 'none' : heads.every((h) => shas.has(h)) ? 'ours' : 'other';
  const missing: string[] = [];
  for (const [branch, sha] of Object.entries(tips))
    if (!heads.includes(sha) && (yield* gitSays(checkout, ['merge-base', '--is-ancestor', sha, 'HEAD'])) === undefined) missing.push(branch);
  const head = yield* gitSays(checkout, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const conflicted = Boolean(yield* gitSays(checkout, ['ls-files', '--unmerged']));
  return { merging, conflicted, missing, ...(head ? { head } : {}) };
}
