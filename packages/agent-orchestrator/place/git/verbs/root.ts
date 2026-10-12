/**
 * `root`: the repository a folder is in, asked when a folder joins a factory. Takes `{ dir }`; answers `{ root }`, the root of the
 * repository's main checkout, from that root, a folder inside it or a linked worktree of it alike, and `{ root: null }` for a
 * directory in no repository. A repository with no checkout of its own answers the folder git keeps it in. Refuses a `dir` that is no
 * directory.
 */
import path from 'node:path';
import { gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The verb's body. */
export function* root({ dir }: PlaceRequests['root']): Asking<Reply<'root'>> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so it is in no repository: name a folder that is there`);
  const common = yield* gitSays(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!common) return { root: null };
  return { root: path.basename(common) === '.git' ? path.dirname(common) : common };
}
