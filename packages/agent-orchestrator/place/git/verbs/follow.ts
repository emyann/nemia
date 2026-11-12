/**
 * `follow`: a checkout brought up to the branch its own branch follows on its remote (git's upstream, `@{upstream}`), whoever moved it
 * there. Takes `{ repo }`; answers `Followed`. Which branch is the truth is the repository's: git's upstream of the branch checked out,
 * set by `git branch --set-upstream-to`, and a branch that follows none, or a repository with no remote, changes nothing. The remote is
 * read with the machine's own credentials, none held here, and git asks no one at a terminal for one (`GIT_TERMINAL_PROMPT=0`); only the
 * upstream's branch is fetched. The checkout is moved only when it is clean and only behind, by a fast-forward, never a merge or a
 * reset: one with commits of its own, a merge in progress, changes not committed or no branch is left as it is, and said, with what to
 * do. Refuses a `repo` that is no directory, or no git repository.
 */
import { failedWords, git, gitSays, isDirectory, printed, refused, type Asking, type Reply } from '../git.ts';
import type { PlaceRequests } from '../../../src/place/place.ts';

/** Git asks no one at a terminal for a credential: one the machine does not hold fails the fetch at once. */
const NO_PROMPT = { GIT_TERMINAL_PROMPT: '0' };

/** The upstream of `branch` in `repo`: the remote it is read from (`.` for a branch of this repository) and the ref fetched there. */
function* upstreamOf(repo: string, branch: string): Asking<{ remote: string; ref: string; name: string } | undefined> {
  const remote = yield* gitSays(repo, ['config', '--get', `branch.${branch}.remote`]);
  const ref = yield* gitSays(repo, ['config', '--get', `branch.${branch}.merge`]);
  const name = yield* gitSays(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (!remote || !ref) return undefined;
  return { remote, ref, name: name || `${remote}/${ref.replace(/^refs\/heads\//, '')}` };
}

/** The verb's body. */
export function* follow({ repo }: PlaceRequests['follow']): Asking<Reply<'follow'>> {
  if (!isDirectory(repo)) return refused(`${repo} is not a directory, so there is no checkout to follow its remote`);
  if ((yield* gitSays(repo, ['rev-parse', '--git-dir'])) === undefined)
    return refused(`${repo} is not a git repository, so there is no checkout to follow its remote: name the factory's repository`);
  const branch = yield* gitSays(repo, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  if (!branch) {
    if (!(yield* gitSays(repo, ['remote']))) return { state: 'no-upstream' };
    return {
      state: 'left',
      message: `${repo} is on no branch, so it follows no remote: check out its base branch there (git -C ${repo} switch <branch>)`,
    };
  }
  const upstream = yield* upstreamOf(repo, branch);
  if (!upstream) return { state: 'no-upstream' };
  const { name } = upstream;
  if (upstream.remote !== '.') {
    try {
      yield* printed({
        cmd: 'git',
        cwd: repo,
        args: ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', upstream.remote, upstream.ref],
        env: NO_PROMPT,
      });
    } catch (err) {
      return {
        state: 'unfetched',
        upstream: name,
        message: `${upstream.remote} could not be read, so ${repo} was not brought up to ${name}: ${failedWords(err)} — check that git can fetch it there (git -C ${repo} fetch ${upstream.remote})`,
      };
    }
  }
  const counts = (yield* git(repo, ['rev-list', '--left-right', '--count', `HEAD...${name}`])).split(/\s+/).map(Number);
  const [own = 0, behind = 0] = counts;
  if (behind === 0) return { state: own === 0 ? 'up-to-date' : 'ahead', upstream: name };
  const left = (why: string) => ({
    state: 'left' as const,
    upstream: name,
    message: `${repo} is ${behind} commit(s) behind ${name} ${why}`,
  });
  if (own > 0)
    return left(
      `and holds ${own} of its own, so it is not fast-forwarded: push them to ${name}, or move them to a branch of their own and reset ${branch} to ${name}`,
    );
  if ((yield* gitSays(repo, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'])) !== undefined)
    return left(`with a merge in progress, so it is left as it is: commit the merge or abort it (git -C ${repo} merge --abort)`);
  if (yield* git(repo, ['status', '--porcelain', '--untracked-files=no']))
    return left(`with changes not committed, so it is left as it is: commit or stash them there, then ${branch} follows on the next step`);
  const from = yield* git(repo, ['rev-parse', 'HEAD']);
  try {
    yield* git(repo, ['merge', '--ff-only', '--quiet', name]);
  } catch (err) {
    return left(
      `and git would not fast-forward it: ${failedWords(err)} — move what it names away, then ${branch} follows on the next step`,
    );
  }
  return { state: 'fast-forwarded', upstream: name, from, to: yield* git(repo, ['rev-parse', 'HEAD']) };
}
