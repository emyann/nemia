/**
 * `export`: a tag's tree written into a folder, from git's object store, never from a working tree — what a release is built from. Takes
 * `{ repo, tag, into }`, `into` a folder not there yet or empty; answers `{ commit }`, the commit `refs/tags/<tag>` names. The tree is
 * given an empty repository of its own (`git init`, nothing added, nothing committed), so a check that lists its files with
 * `git ls-files -co --exclude-standard` reads the tree as it is; `seal` takes it away. Refuses a repo that is not a directory, a tag the
 * repository does not have, and an `into` that holds anything.
 */
import fs from 'node:fs';
import { git, gitSays, isDirectory, printed, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** The verb's body. */
export function* exported({ repo, tag, into }: PlaceRequests['export']): Asking<Reply<'export'>> {
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so no tag in it can be exported`);
  const commit = yield* gitSays(repo, ['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  if (commit === undefined) return refused(`${repo} has no tag ${tag}: tag the commit to release (git -C ${repo} tag ${tag} <commit>)`);
  if (fs.existsSync(into) && fs.readdirSync(into).length)
    return refused(`${into} is not empty, and a tag is exported into an empty folder`);
  fs.mkdirSync(into, { recursive: true });
  const tar = `${into}.tar`;
  try {
    yield* git(repo, ['archive', '--format=tar', `--output=${tar}`, commit]);
    yield* printed({ cmd: 'tar', args: ['-xf', tar, '-C', into] });
  } finally {
    fs.rmSync(tar, { force: true });
  }
  yield* git(into, ['init', '--quiet']);
  return { commit };
}
