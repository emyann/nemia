/**
 * `root`: the repository a folder is in, asked when a folder joins a factory. Takes `{ dir }`; answers `{ root }`, the root of the
 * repository's main checkout, from that root, a folder inside it or a linked worktree of it alike, and `{ root: null }` for a
 * directory in no repository. A repository with no checkout of its own answers the folder git keeps it in. One whose git folder is
 * kept apart from its checkout (a submodule, a separate git directory) answers the checkout git names for that folder, else the
 * checkout `dir` is in: never the git folder, which nobody works in. Refuses a `dir` that is no directory.
 */
import path from 'node:path';
import { gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The checkout git names at `dir`, undefined where it names none. */
function* checkoutAt(dir: string): Asking<string | undefined> {
  return (yield* gitSays(dir, ['rev-parse', '--path-format=absolute', '--show-toplevel'])) || undefined;
}

/** The verb's body. */
export function* root({ dir }: PlaceRequests['root']): Asking<Reply<'root'>> {
  if (!isDirectory(dir)) return refused(`${dir} is not a directory, so it is in no repository: name a folder that is there`);
  const common = yield* gitSays(dir, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (!common) return { root: null };
  if ((yield* gitSays(common, ['rev-parse', '--is-bare-repository'])) === 'true') return { root: common };
  if (path.basename(common) === '.git') return { root: path.dirname(common) };
  return { root: (yield* checkoutAt(common)) ?? (yield* checkoutAt(dir)) ?? null };
}
