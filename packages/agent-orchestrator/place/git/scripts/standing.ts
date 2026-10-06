/**
 * `standing`: where a repository's result branches stand against the base branch they land on, as a pass of the tick reads it. Takes
 * `{ repo, branches: [{ branch, tip?, baseRef }], base }`; answers `Standing`: `heads`, every branch of the repository and its commit, and
 * for each branch asked of, in the order asked, its tip, whether it is within `base` (`onBase`), whether the commit asked of holds work past
 * its run's `baseRef` (`pastBase`), and how many commits it is ahead of `base`.
 *
 * A branch git has is asked of by its name, and git's no about it is final. A branch git no longer has reads `tip: null` and is asked of by
 * the `tip` its run recorded, `unknown` with none or one git cannot read. `pastBase` is said only where `onBase` is `yes`, null where git
 * cannot read the `baseRef`.
 *
 * One `for-each-ref` answers every branch git has, with its distance from `base` and from each `baseRef` (`%(ahead-behind:…)`, git 2.41).
 * Git refuses that whole listing for one `baseRef` it cannot read: those it can are found in one more process and listed again without the
 * rest. A git older than 2.41 lists no distance at all: each branch is then asked one by one. Refuses a repository git cannot list and,
 * where a branch is asked of, a `base` git cannot read.
 */
import { Malformed, git, gitSays, isDirectory, refused, serve, text, type Request } from './contract.ts';

/** A branch asked of: its name, the tip its run recorded, and the commit its run was cut at. */
type Asked = { branch: string; tip?: string; baseRef: string };

/** Whether a commit is within another: git's yes, its no, or unknown where git cannot read one of them. */
type Within = 'yes' | 'no' | 'unknown';

/** The branches of `request`, each read, or `Malformed` naming the first that is not one. */
function askedOf(request: Request): Asked[] {
  const value = request.branches;
  if (!Array.isArray(value))
    throw new Malformed(`the request's \`branches\` is ${JSON.stringify(value) ?? 'missing'}, where a list of branches is asked`);
  return value.map((b: unknown, i) => {
    const one = (b ?? {}) as Record<string, unknown>;
    const tip = one.tip;
    if (typeof one.branch !== 'string' || typeof one.baseRef !== 'string' || (tip !== undefined && typeof tip !== 'string'))
      throw new Malformed(`the request's \`branches[${i}]\` is ${JSON.stringify(b)}, where { branch, tip?, baseRef } is asked`);
    return { branch: one.branch, baseRef: one.baseRef, ...(typeof tip === 'string' ? { tip } : {}) };
  });
}

/** Each branch's commit, and its commits ahead of each of `bases` by base: one `for-each-ref`, or undefined where git refused it. */
function listing(repo: string, bases: readonly string[]) {
  const format = ['%(objectname)', ...bases.map((b) => `%(ahead-behind:${b})`), '%(refname)'].join(' ');
  const listed = gitSays(repo, ['for-each-ref', `--format=${format}`, 'refs/heads/']);
  if (listed === undefined) return undefined;
  const heads: Record<string, string> = {};
  const ahead = new Map(bases.map((b) => [b, new Map<string, number>()]));
  for (const line of listed.split('\n')) {
    const words = line.split(' ');
    if (words.length < 2 + bases.length * 2) continue;
    const branch = words
      .slice(1 + bases.length * 2)
      .join(' ')
      .replace(/^refs\/heads\//, '');
    heads[branch] = words[0];
    bases.forEach((b, k) => ahead.get(b)!.set(branch, Number(words[1 + k * 2])));
  }
  return { heads, ahead };
}

/** Whether `commit` is within `base`, as `merge-base --is-ancestor` says it: its exit 1 is git's no, any other failure unknown. */
function within(repo: string, commit: string, base: string): Within {
  try {
    git(repo, ['merge-base', '--is-ancestor', commit, base]);
    return 'yes';
  } catch (err) {
    return (err as { status?: number }).status === 1 ? 'no' : 'unknown';
  }
}

/**
 * Where the branches stand, read off one listing: what `listed` holds of a distance, and git asked one by one for what it does not — a
 * branch git no longer has, a `baseRef` git would not list, every distance on a git that lists none.
 */
function stood(repo: string, base: string, asked: readonly Asked[], listed: NonNullable<ReturnType<typeof listing>>) {
  const distance = (commit: string, to: string): number | undefined => listed.ahead.get(to)?.get(commit);
  const withinOf = (name: string, commit: string, to: string): Within => {
    const ahead = distance(name, to);
    return ahead === undefined ? within(repo, commit, to) : ahead === 0 ? 'yes' : 'no';
  };
  return asked.map(({ branch, tip, baseRef }) => {
    const head = Object.hasOwn(listed.heads, branch) ? listed.heads[branch] : null;
    const commit = head ?? tip;
    const onBase: Within = !commit ? 'unknown' : head ? withinOf(branch, head, base) : within(repo, commit, base);
    const past = onBase === 'yes' ? (head ? withinOf(branch, head, baseRef) : within(repo, commit!, baseRef)) : undefined;
    const ahead =
      head === null ? null : (distance(branch, base) ?? Number(gitSays(repo, ['rev-list', '--count', `${base}..${head}`]) ?? NaN));
    return {
      branch,
      tip: head,
      onBase,
      pastBase: past === undefined || past === 'unknown' ? null : past === 'no',
      ahead: ahead === null || Number.isSafeInteger(ahead) ? ahead : null,
    };
  });
}

/**
 * The listing the branches are read off: with each distance where git lists it, again without each `baseRef` it cannot read where it
 * refuses one, and with none on a git that lists no distance. A refusal's words where git cannot list the branches, or read `base`.
 */
function listed(repo: string, base: string, asked: readonly Asked[]): NonNullable<ReturnType<typeof listing>> | string {
  const bases = [...new Set([base, ...asked.map((a) => a.baseRef)])];
  const whole = listing(repo, bases);
  if (whole) return whole;
  const bare = listing(repo, []);
  if (!bare) return `git cannot list the branches of ${repo}: it is no git repository, or git cannot read it`;
  if (gitSays(repo, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`]) === undefined)
    return `git cannot read ${base} in ${repo}, the base the branches are asked of: is it a branch of that repository?`;
  const readable = new Set((gitSays(repo, ['rev-list', '--no-walk', '--ignore-missing', ...bases.slice(1)]) ?? '').split('\n'));
  const without = bases.filter((b, i) => i === 0 || readable.has(b));
  return (without.length < bases.length ? listing(repo, without) : undefined) ?? { heads: bare.heads, ahead: new Map() };
}

serve((request) => {
  const repo = text(request, 'repo');
  const base = text(request, 'base');
  const asked = askedOf(request);
  const read = isDirectory(repo) ? (asked.length ? listed(repo, base, asked) : listing(repo, [])) : undefined;
  if (read === undefined) return refused(`git cannot list the branches of ${repo}: it is no git repository, or git cannot read it`);
  if (typeof read === 'string') return refused(read);
  return { heads: read.heads, branches: stood(repo, base, asked, read) };
});
