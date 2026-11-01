/**
 * `standing`: where a repository's result branches stand against the base branch they land on, as a pass of the tick reads it. Takes `{
 * repo, branches: [{ branch, tip?, baseRef }], base }`; answers `Standing`: `tips`, every branch of the repository and its commit, and for
 * each branch asked of, in the order asked, its tip, whether it is within `base` (`onBase`), whether the commit asked of holds work past
 * its run's `baseRef` (`pastBase`), and how many commits it is ahead of `base`.
 *
 * A branch git has is asked of by its name, and git's no about it is final. A branch git no longer has reads `tip: null` and is asked of by
 * the `tip` its run recorded, `unknown` with none or one git cannot read. `pastBase` is said only where `onBase` is `yes`, null where git
 * cannot read the `baseRef`.
 *
 * A branch may be asked with what was last read of it (`known`): the commit judged then (`tip`, null where none was) and its `pastBase`.
 * Its `baseRef` is then left out of the listing, and its `pastBase` is the one known while the commit judged now is that `tip`, else asked
 * of git as for a `baseRef` not listed: a hint, never believed past the commit it was read of.
 *
 * One `for-each-ref` answers every branch git has, with its distance from `base` and from each `baseRef` of a branch asked without `known`
 * (`%(ahead-behind:…)`, git 2.41).
 * Git refuses that whole listing for one `baseRef` it cannot read: those it can are found in one more process and listed again without the
 * rest. A git older than 2.41 lists no distance at all: each branch is then asked one by one. Refuses a repository git cannot list and,
 * where a branch is asked of, a `base` git cannot read.
 */
import { Failed, git, gitSays, isDirectory, refused, type Asking, type Reply } from '../git.ts';
import type { BranchStood, PlaceRequests } from '../../../src/place/place.ts';

/** A branch asked of: its name, the tip its run recorded, the commit its run was cut at, and what was last read of it. */
type Asked = PlaceRequests['standing']['branches'][number];

/** Whether a commit is within another: git's yes, its no, or unknown where git cannot read one of them. */
type Within = 'yes' | 'no' | 'unknown';

/** Each branch's commit, and its commits ahead of each base by base. */
type Listing = { heads: Record<string, string>; ahead: Map<string, Map<string, number>> };

/** Each branch's commit, and its commits ahead of each of `bases` by base: one `for-each-ref`, or undefined where git refused it. */
function* listing(repo: string, bases: readonly string[]): Asking<Listing | undefined> {
  const format = ['%(objectname)', ...bases.map((b) => `%(ahead-behind:${b})`), '%(refname)'].join(' ');
  const listed = yield* gitSays(repo, ['for-each-ref', `--format=${format}`, 'refs/heads/']);
  if (listed === undefined) return undefined;
  const heads: Record<string, string> = {};
  const ahead = new Map(bases.map((b) => [b, new Map<string, number>()]));
  for (const line of listed.split('\n')) {
    const words = line.split(' ');
    const commit = words[0];
    if (commit === undefined || words.length < 2 + bases.length * 2) continue;
    const branch = words
      .slice(1 + bases.length * 2)
      .join(' ')
      .replace(/^refs\/heads\//, '');
    heads[branch] = commit;
    bases.forEach((b, k) => ahead.get(b)?.set(branch, Number(words[1 + k * 2])));
  }
  return { heads, ahead };
}

/** Whether `commit` is within `base`, as `merge-base --is-ancestor` says it: its exit 1 is git's no, any other failure unknown. */
function* within(repo: string, commit: string, base: string): Asking<Within> {
  try {
    yield* git(repo, ['merge-base', '--is-ancestor', commit, base]);
    return 'yes';
  } catch (err) {
    return err instanceof Failed && err.status === 1 ? 'no' : 'unknown';
  }
}

/** Whether the branch `name`, at `commit`, is within `to`: off the listing's distance where it holds one, else asked of git. */
function* withinOf(repo: string, listed: Listing, name: string, commit: string, to: string): Asking<Within> {
  const ahead = listed.ahead.get(to)?.get(name);
  return ahead === undefined ? yield* within(repo, commit, to) : ahead === 0 ? 'yes' : 'no';
}

/** Whether the commit judged of `one` is within its run's `baseRef`: what was known of that commit, else asked. */
function* pastOf(repo: string, listed: Listing, one: Asked, head: string | null, commit: string): Asking<Within> {
  const { branch, baseRef, known } = one;
  if (known?.tip === commit && known.pastBase !== null) return known.pastBase ? 'no' : 'yes';
  return head ? yield* withinOf(repo, listed, branch, head, baseRef) : yield* within(repo, commit, baseRef);
}

/** Where one branch asked of stands, read off `listed`, and git asked for what it does not hold. */
function* stoodOne(repo: string, base: string, one: Asked, listed: Listing): Asking<BranchStood> {
  const { branch, tip } = one;
  const head = Object.hasOwn(listed.heads, branch) ? (listed.heads[branch] ?? null) : null;
  const commit = head ?? tip;
  const onBase: Within = !commit ? 'unknown' : head ? yield* withinOf(repo, listed, branch, head, base) : yield* within(repo, commit, base);
  const past = onBase === 'yes' && commit ? yield* pastOf(repo, listed, one, head, commit) : undefined;
  const ahead =
    head === null
      ? null
      : (listed.ahead.get(base)?.get(branch) ?? Number((yield* gitSays(repo, ['rev-list', '--count', `${base}..${head}`])) ?? NaN));
  return {
    branch,
    tip: head,
    onBase,
    pastBase: past === undefined || past === 'unknown' ? null : past === 'no',
    ahead: ahead === null || Number.isSafeInteger(ahead) ? ahead : null,
  };
}

/**
 * The listing the branches are read off: with each distance where git lists it — from `base`, and from the `baseRef` of each branch asked
 * without `known` — again without each `baseRef` it cannot read where it
 * refuses one, and with none on a git that lists no distance. A refusal's words where git cannot list the branches, or read `base`.
 */
function* listed(repo: string, base: string, asked: readonly Asked[]): Asking<Listing | string> {
  const bases = [...new Set([base, ...asked.filter((a) => !a.known).map((a) => a.baseRef)])];
  const whole = yield* listing(repo, bases);
  if (whole) return whole;
  const bare = yield* listing(repo, []);
  if (!bare) return `git cannot list the branches of ${repo}: it is no git repository, or git cannot read it`;
  if ((yield* gitSays(repo, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])) === undefined)
    return `git cannot read ${base} in ${repo}, the base the branches are asked of: is it a branch of that repository?`;
  const readable = new Set(((yield* gitSays(repo, ['rev-list', '--no-walk', '--ignore-missing', ...bases.slice(1)])) ?? '').split('\n'));
  const without = bases.filter((b, i) => i === 0 || readable.has(b));
  return (without.length < bases.length ? yield* listing(repo, without) : undefined) ?? { heads: bare.heads, ahead: new Map() };
}

/** The verb's body. */
export function* standing({ repo, base, branches }: PlaceRequests['standing']): Asking<Reply<'standing'>> {
  const read = isDirectory(repo) ? (branches.length ? yield* listed(repo, base, branches) : yield* listing(repo, [])) : undefined;
  if (read === undefined) return refused(`git cannot list the branches of ${repo}: it is no git repository, or git cannot read it`);
  if (typeof read === 'string') return refused(read);
  const stood: BranchStood[] = [];
  for (const one of branches) stood.push(yield* stoodOne(repo, base, one, read));
  return { tips: read.heads, branches: stood };
}
