/**
 * `status`: the checkout an ending lands in, as a pass reads it (`checkoutStatus` in `src/place/landing.store.ts` asks it). Takes `{ repo,
 * tips }`, `repo` the checkout and `tips` the run's result branches by name with their commits; answers the contract's `MergeState`, `{
 * merging, conflicted, missing, tip?, landedBy? }`: whose merge is in progress — `ours` when every commit MERGE_HEAD names is one of `tips`
 * — whether a path is unmerged, the result branches a commit now would leave out, HEAD as `tip`, and, once every tip is in HEAD with no
 * merge of them in progress, the first commit of HEAD's first-parent line that holds them all as `landedBy`. For each tip, two walks:
 * the commits that descend from it (`rev-list --ancestry-path <tip>..HEAD`, every parent followed, since a line commit may hold the tip
 * only through a commit of another branch), and the line down to it (`rev-list --first-parent --parents <tip>..HEAD`), kept to those
 * that hold it; `cameOnto` and `landedBy` (`../landed.ts`) read what is kept.
 * A walk git does not answer throws, so the pass reads the checkout as unread and waits, never as nothing landed. Unmerged paths are
 * read with `ls-files --unmerged`, off the index as it is, never with a diff, which refreshes the index and takes its lock in a checkout
 * a person commits in.
 * Refuses a checkout that is no git repository.
 */
import fs from 'node:fs';
import path from 'node:path';
import { git, gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import { cameOnto, landedBy } from '../landed.ts';
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
export function* status({ repo: checkout, tips }: PlaceRequests['status']): Asking<Reply<'status'>> {
  const file = isDirectory(checkout) ? yield* gitSays(checkout, ['rev-parse', '--git-path', 'MERGE_HEAD']) : undefined;
  if (file === undefined) return refused(`${checkout} is not a git repository, so no merge can be staged there`);
  const heads = mergeHeads(checkout, file);
  const shas = new Set(Object.values(tips));
  const merging = !heads.length ? 'none' : heads.every((h) => shas.has(h)) ? 'ours' : 'other';
  const missing: string[] = [];
  for (const [branch, sha] of Object.entries(tips))
    if (!heads.includes(sha) && (yield* gitSays(checkout, ['merge-base', '--is-ancestor', sha, 'HEAD'])) === undefined)
      missing.push(branch);
  const head = yield* gitSays(checkout, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  const conflicted = Boolean(yield* gitSays(checkout, ['ls-files', '--unmerged']));
  const landed = head && !missing.length ? yield* cameIn(checkout, head, Object.values(tips), heads) : undefined;
  return { merging, conflicted, missing, ...(head ? { tip: head } : {}), ...(landed ? { landedBy: landed } : {}) };
}

/**
 * The first commit of `head`'s first-parent line that holds every one of `tips`, each already in `head`: undefined where none was asked
 * of, or a merge of one is in progress, so a pass with a merge staged pays no walk.
 */
function* cameIn(checkout: string, head: string, tips: readonly string[], heads: readonly string[]): Asking<string | undefined> {
  if (!tips.length || tips.some((sha) => heads.includes(sha))) return undefined;
  let point: ReturnType<typeof cameOnto>;
  for (const [i, sha] of tips.entries()) {
    const holds = new Set(rowsOf(yield* git(checkout, ['rev-list', '--ancestry-path', `${sha}..HEAD`])).map(([id]) => id));
    const line = rowsOf(yield* git(checkout, ['rev-list', '--first-parent', '--parents', `${sha}..HEAD`]));
    const walk = line.filter(([id]) => id !== undefined && holds.has(id));
    const here = cameOnto(sha, head, walk);
    point = i === 0 ? here : landedBy(point, here);
  }
  return point?.commit;
}

/** Git's rows, one a line, each split on its spaces; none where git printed nothing. */
const rowsOf = (said: string): string[][] => (said ? said.split('\n').map((row) => row.trim().split(' ')) : []);
