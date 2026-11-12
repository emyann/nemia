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

/** A branch's upstream: the remote it is read from (`.` for a branch of this repository), the ref fetched there, and git's name for it. */
type Upstream = { readonly remote: string; readonly ref: string; readonly name: string };

/** The upstream of `branch` in `repo`, undefined where it follows none. */
function* upstreamOf(repo: string, branch: string): Asking<Upstream | undefined> {
  const remote = yield* gitSays(repo, ['config', '--get', `branch.${branch}.remote`]);
  const ref = yield* gitSays(repo, ['config', '--get', `branch.${branch}.merge`]);
  const name = yield* gitSays(repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
  if (!remote || !ref) return undefined;
  return { remote, ref, name: name || `${remote}/${ref.replace(/^refs\/heads\//, '')}` };
}

/** What fetching `upstream`'s branch into `repo` failed with, in git's words and what to do; undefined once it is fetched. */
function* unfetched(repo: string, upstream: Upstream): Asking<string | undefined> {
  if (upstream.remote === '.') return undefined;
  try {
    yield* printed({
      cmd: 'git',
      cwd: repo,
      args: ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', upstream.remote, upstream.ref],
      env: NO_PROMPT,
    });
    return undefined;
  } catch (err) {
    return `${upstream.remote} could not be read, so ${repo} was not brought up to ${upstream.name}: ${failedWords(err)} — check that git can fetch it there (git -C ${repo} fetch ${upstream.remote})`;
  }
}

/** Why `repo`, on `branch` and behind its upstream, is not to be fast-forwarded, with what to do; undefined when it is. */
function* heldBack(repo: string, branch: string, upstream: string, own: number): Asking<string | undefined> {
  if (own > 0)
    return `and holds ${own} commit(s) of its own, so it is not fast-forwarded: push them, or move them to a branch of their own and put ${branch} back on ${upstream}`;
  if ((yield* gitSays(repo, ['rev-parse', '--quiet', '--verify', 'MERGE_HEAD'])) !== undefined)
    return `with a merge in progress, so it is left as it is: commit the merge or abort it (git -C ${repo} merge --abort)`;
  if (yield* git(repo, ['status', '--porcelain', '--untracked-files=no']))
    return `with changes not committed, so it is left as it is: commit or stash them there, then ${branch} follows before the next step`;
  return undefined;
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
  const failed = yield* unfetched(repo, upstream);
  if (failed) return { state: 'unfetched', upstream: name, message: failed };
  const [own = 0, behind = 0] = (yield* git(repo, ['rev-list', '--left-right', '--count', `HEAD...${name}`])).split(/\s+/).map(Number);
  if (behind === 0) return { state: own === 0 ? 'up-to-date' : 'ahead', upstream: name };
  const left = (why: string) => ({
    state: 'left' as const,
    upstream: name,
    message: `${repo} is ${behind} commit(s) behind ${name} ${why}`,
  });
  const held = yield* heldBack(repo, branch, name, own);
  if (held) return left(held);
  const from = yield* git(repo, ['rev-parse', 'HEAD']);
  try {
    yield* git(repo, ['merge', '--ff-only', '--quiet', name]);
  } catch (err) {
    return left(
      `and git would not fast-forward it: ${failedWords(err)} — move what it names away, then ${branch} follows before the next step`,
    );
  }
  return { state: 'fast-forwarded', upstream: name, from, to: yield* git(repo, ['rev-parse', 'HEAD']) };
}
