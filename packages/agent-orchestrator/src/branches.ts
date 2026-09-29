/**
 * What git says of a git run's result branches once it has them: whether each is on its base branch (`isShipped`) and where it stands
 * (`branchStandings`), a run another waits on as its record and git say it (`parentRecord`), the tips of the branches git has (`refsOf`),
 * and what a branch holds against the run's base — the files it added, one file's text, its diff stat, what it touched and the diff of
 * what decides a check.
 *
 * Beneath the controllers, beside `record.store.ts` and `worktree.ts`, whose `git` helpers it reads through: it imports neither the engine nor
 * a controller, and `runner.ts` re-exports most of what it exports. What asks the engine as well — `parentOf`, `decide` — is
 * the controllers' (`views.ts`, `decide.ts`).
 */
import { execCounted } from './meter/tally.store.ts';
import { isGitRun, resultSteps, type BranchStanding, type GitRun, type ParentRun, type Run, type Shipped } from './run.ts';
import { radius, sensitivePaths, type Radius, type Touched } from './radius.ts';
import { readRun, stepsOf } from './record/record.store.ts';
import { git, gitSays } from './worktree.ts';

/**
 * Has this branch landed on the base branch? Git's answer, not ours — and which yes it is (`Shipped`).
 *
 * `--is-ancestor` rather than a merge-commit search, so a fast-forward, a squash-merge that was
 * then merged, and a rebase all read the same: the commits are in, therefore it shipped.
 *
 * A yes is `'unchanged'` when nothing is committed on the branch past the run's base: it was cut there, so it
 * has been on the base branch since it was cut, and `decision` calls that shipped only for a run whose steps
 * all succeeded. Asked the same way the other way round — is the branch within the base — and `'unchanged'`
 * too when git cannot say, so a run on a base git cannot read is decided by a person, never waved through.
 *
 * A branch git no longer has — deleted after the merge — is asked by the tip the run's tick recorded
 * once the run had finished (`tipsSeen`): still git's answer, about the commit the branch named. Git
 * keeps no trace of it otherwise: a merge carries any message, and `git branch -d` needs the worktree
 * removed first. With no tip recorded, a branch that is gone has not landed as far as anyone can tell. The tip is asked only when
 * git cannot read the branch: git's no about a branch it has is final, whatever an older tip of it says.
 */
export const isShipped = (run: GitRun, branch: string): Shipped => shippedBy(askGit, run, branch);

/**
 * Whether `commit` is within `base` — git's `merge-base --is-ancestor` — as `yes`, git's `no` (its exit 1), or `unknown`: a name git cannot read.
 * What `isShipped` asks, twice at most for a branch; answered by one process each here, and by a listing of the repository's branches in a
 * `BranchReader`.
 */
type Within = (repo: string, commit: string, base: string) => 'yes' | 'no' | 'unknown';

const askGit: Within = (repo, commit, base) => {
  try {
    execCounted('git', ['merge-base', '--is-ancestor', commit, base], { cwd: repo, stdio: 'ignore' });
    return 'yes';
  } catch (err) {
    return (err as { status?: number }).status === 1 ? 'no' : 'unknown';
  }
};

function shippedBy(within: Within, run: GitRun, branch: string): Shipped {
  const landed = (commit: string): Shipped => (within(run.repo, commit, run.baseRef) === 'no' ? true : 'unchanged');
  const onBase = within(run.repo, branch, run.branch);
  if (onBase === 'yes') return landed(branch);
  const tip = run.tips?.[branch];
  if (onBase === 'no' || !tip) return false;
  return within(run.repo, tip, run.branch) === 'yes' ? landed(tip) : false;
}

/** Where a run's result branches stand, as `branchStandings` says: none for a folder run, which has no branch. */
export const standingsOf = (run: Run, git: BranchReader = oneByOne): BranchStanding[] =>
  isGitRun(run) ? branchStandings(run, resultBranches(run), git) : [];

/** Whether a branch of the run is on its base (`isShipped`): never, for a folder run, which has no branch to ask about. */
export const shippedOf =
  (run: Run, git: BranchReader = oneByOne) =>
  (branch: string): Shipped =>
    isGitRun(run) ? git.shipped(run, branch) : false;

/**
 * Where each of a run's result branches stands against the base branch it was cut from, as git says it now (`BranchStanding`): on it
 * (`isShipped`, either yes), gone — git no longer has it, and no recorded tip puts it on the base — or ahead of it, by the commits the
 * base branch does not have.
 *
 * Read on the pass that asks and never stored, for the reason `shipped` is asked rather than stored: a person merging by hand changes the
 * answer, and nothing tells the run. A branch git cannot count reads as ahead by none rather than as shipped.
 */
export function branchStandings(run: GitRun, branches: readonly string[], git: BranchReader = oneByOne): BranchStanding[] {
  return [...new Set(branches)].map((branch): BranchStanding => {
    if (git.shipped(run, branch) !== false) return { branch, where: 'on' };
    if (!git.has(run.repo, branch)) return { branch, where: 'gone' };
    return { branch, where: 'ahead', commits: git.ahead(run, branch) };
  });
}

/**
 * What git says of result branches — `isShipped`, whether git has a branch, how far one is ahead of its base — for one command or one
 * request. `oneByOne` asks git a process for each question, as `isShipped` does. `branchReader()` answers them from one
 * `for-each-ref` of a repository's branches with each branch's distance from a base (`%(ahead-behind:<base>)`, git 2.41), made once for
 * each repository and base and kept for the reader's life, which is the command's, so a command over many runs asks git once per
 * repository rather than once per branch. `prime(runs)` lists every base those runs will ask about in one process per repository.
 *
 * The same answers: a question the listing cannot answer — a branch it does not list, a commit that is no branch, a listing git refused
 * because a base is unreadable, or an older git — is asked one by one. A reader is a cache of git's word for as long as the
 * command runs, never kept past it: a person merging by hand changes the answer.
 */
export type BranchReader = {
  shipped(run: GitRun, branch: string): Shipped;
  /** Whether git has the branch (`rev-parse --verify refs/heads/<branch>`). */
  has(repo: string, branch: string): boolean;
  /** The commits on the branch that the run's base branch does not have (`rev-list --count <base>..<branch>`); none where git cannot count. */
  ahead(run: GitRun, branch: string): number;
  /**
   * List, in one process for each repository, every base these runs will ask about: their base branches and the commits they were cut at.
   * Made on the first question about the repository, so a repository nothing is asked about costs no process.
   */
  prime(runs: readonly Run[]): void;
  /**
   * Each branch of the repository and its commit, off the listing the answers were read from — what a memo of those answers keys them by,
   * so a branch that moves between the answer and the key is read as moved. Empty where git would not list them.
   */
  heads: (repo: string) => ReadonlyMap<string, string>;
};

const countOf = (said: string | undefined) => {
  const count = Number(said?.trim());
  return Number.isSafeInteger(count) ? count : 0;
};

/** Each question, a process of its own. */
export const oneByOne: BranchReader = {
  shipped: (run, branch) => isShipped(run, branch),
  has: (repo, branch) => gitSays(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`) !== undefined,
  ahead: (run, branch) => countOf(gitSays(run.repo, 'rev-list', '--count', `${run.branch}..${branch}`)),
  prime: () => {},
  heads: (repo) => new Map(Object.entries(headsOf(repo))),
};

/** A commit's full name, which a base is when it is a run's `baseRef`: never a branch, so a listing for it is made by `prime` alone. */
const isCommitName = (name: string) => /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(name);

/**
 * The `BranchReader` that answers from one listing per repository and base, each question once. Git refuses the whole listing for one base it
 * cannot read, so where it does, the commits a run was cut at that it can read are found in one more process (`rev-list --no-walk
 * --ignore-missing`) and listed again without the rest — with every commit readable, the base it cannot read is a branch; a base branch
 * the repository does not have is found by a listing of the branches alone, and the rest listed again; a base still not listed is asked
 * one by one. A commit is within itself, so a branch still at the commit the run was cut at is within it without asking git.
 */
export function branchReader(): BranchReader {
  const repos = new Map<
    string,
    { heads?: Map<string, string> | null; ahead: Map<string, Map<string, number> | null>; asked: Map<string, ReturnType<Within>> }
  >();
  const of = (repo: string) => {
    let r = repos.get(repo);
    if (!r) repos.set(repo, (r = { ahead: new Map(), asked: new Map() }));
    return r;
  };

  const listing = (repo: string, bases: readonly string[]) => {
    const format = ['%(objectname)', ...bases.map((b) => `%(ahead-behind:${b})`), '%(refname)'].join(' ');
    const listed = gitSays(repo, 'for-each-ref', `--format=${format}`, 'refs/heads/');
    if (listed === undefined) return undefined;
    const heads = new Map<string, string>();
    const each = bases.map(() => new Map<string, number>());
    for (const line of listed.split('\n')) {
      const words = line.split(' ');
      if (words.length < 2 + bases.length * 2) continue;
      const branch = words
        .slice(1 + bases.length * 2)
        .join(' ')
        .replace(/^refs\/heads\//, '');
      heads.set(branch, words[0]);
      bases.forEach((_, k) => each[k].set(branch, Number(words[1 + k * 2])));
    }
    return { heads, each };
  };

  const list = (repo: string, bases: readonly string[]) => {
    const r = of(repo);
    let fresh = [...new Set(bases)].filter((b) => !r.ahead.has(b));
    if (!fresh.length && r.heads !== undefined) return;
    let listed = listing(repo, fresh);
    if (!listed && fresh.some(isCommitName)) {
      const commits = fresh.filter(isCommitName);
      const readable = new Set((gitSays(repo, 'rev-list', '--no-walk', '--ignore-missing', ...commits) ?? '').split('\n'));
      for (const c of commits) if (!readable.has(c)) r.ahead.set(c, null);
      const without = fresh.filter((b) => !isCommitName(b) || readable.has(b));
      if (without.length < fresh.length) listed = listing(repo, (fresh = without));
    }
    if (!listed && fresh.length) {
      const bare = listing(repo, []);
      if (bare) {
        r.heads ??= bare.heads;
        const known = fresh.filter((b) => isCommitName(b) || bare.heads.has(b));
        for (const b of fresh) if (!known.includes(b)) r.ahead.set(b, null);
        fresh = known;
        listed = fresh.length ? listing(repo, fresh) : bare;
      }
    }
    if (!listed) {
      for (const b of fresh) r.ahead.set(b, null);
      r.heads ??= null;
      return;
    }
    r.heads ??= listed.heads;
    fresh.forEach((b, k) => r.ahead.set(b, listed.each[k]));
  };

  const primed = new Map<string, Set<string>>();
  const asking = (repo: string) => {
    const bases = primed.get(repo);
    if (bases) {
      primed.delete(repo);
      list(repo, [...bases]);
    }
    return of(repo);
  };

  const within: Within = (repo, commit, base) => {
    const r = asking(repo);
    const key = `${commit} ${base}`;
    const known = r.asked.get(key);
    if (known) return known;
    if (!r.ahead.has(base) && !isCommitName(base)) list(repo, [base]);
    const listed = r.ahead.get(base)?.get(commit);
    const said: ReturnType<Within> =
      listed !== undefined
        ? listed === 0
          ? 'yes'
          : 'no'
        : commit === base || r.heads?.get(commit) === base
          ? 'yes'
          : askGit(repo, commit, base);
    r.asked.set(key, said);
    return said;
  };

  return {
    shipped: (run, branch) => shippedBy(within, run, branch),
    has: (repo, branch) => {
      const r = asking(repo);
      if (r.heads === undefined) list(repo, []);
      return r.heads ? r.heads.has(branch) : oneByOne.has(repo, branch);
    },
    ahead: (run, branch) => {
      if (!asking(run.repo).ahead.has(run.branch)) list(run.repo, [run.branch]);
      const listed = of(run.repo).ahead.get(run.branch)?.get(branch);
      return listed ?? oneByOne.ahead(run, branch);
    },
    heads: (repo) => {
      const r = asking(repo);
      if (r.heads === undefined) list(repo, []);
      return r.heads ?? new Map();
    },
    prime: (runs) => {
      for (const run of runs) {
        if (!isGitRun(run)) continue;
        let set = primed.get(run.repo);
        if (!set) primed.set(run.repo, (set = new Set()));
        set.add(run.branch);
        set.add(run.baseRef);
      }
    },
  };
}

/**
 * A run another waits on, as its record and git say it without the engine: the record, when the store has one, and the result branches
 * it names that git no longer has and cannot find on the base by their recorded tips (`isShipped`). What `wf start --after` refuses an
 * edge by (`afterRefusal`), and where `parentOf` starts. A record whose steps cannot be read — no frozen workflow, and its folder gone —
 * names no result branch.
 */
export function parentRecord(id: string, git: BranchReader = oneByOne): Pick<ParentRun, 'record' | 'gone'> {
  let record: Run;
  try {
    record = readRun(id);
  } catch {
    return {};
  }
  let branches: string[];
  try {
    branches = resultBranches(record);
  } catch {
    branches = [];
  }
  const cut = isGitRun(record) ? record : undefined;
  const gone = cut ? branches.filter((b) => !git.has(cut.repo, b) && !git.shipped(cut, b)) : [];
  return { record, ...(gone.length ? { gone } : {}) };
}

/** Each of these branches git has, and the commit it is at, in one `for-each-ref`. A branch git does not have is left out. */
export function refsOf(repo: string, branches: readonly string[]): Record<string, string> {
  const listed = gitSays(repo, 'for-each-ref', '--format=%(objectname) %(refname)', ...branches.map((b) => `refs/heads/${b}`)) ?? '';
  const refs: Record<string, string> = {};
  for (const line of listed.split('\n')) {
    const space = line.indexOf(' ');
    const branch = line.slice(space + 1).replace(/^refs\/heads\//, '');
    if (space > 0 && branches.includes(branch)) refs[branch] = line.slice(0, space);
  }
  return refs;
}

/**
 * The files this run ADDED — what its steps wrote for whoever reads next.
 *
 * Read out of git rather than off disk, because the worktree a step ran in is gone by the time
 * anybody decides anything, while the branch is exactly as it was left.
 *
 * "Added" is the whole rule. A step that wants to tell a person something writes a file, the same
 * way it tells the next step — so the artifacts are the new files, and no frontmatter key has to
 * be invented to declare them.
 */
export function artifacts(run: GitRun, branch: string): string[] {
  try {
    return git(run.repo, 'diff', '--diff-filter=A', '--name-only', `${run.baseRef}...${branch}`)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/** One artifact's text, out of the branch. */
export function readArtifact(run: GitRun, branch: string, file: string): string {
  try {
    return git(run.repo, 'show', `${branch}:${file}`);
  } catch {
    return '';
  }
}

/** How much the run changed, in one line. */
export function diffStat(run: GitRun, branch: string): string {
  try {
    return git(run.repo, 'diff', '--shortstat', `${run.baseRef}...${branch}`);
  } catch {
    return '';
  }
}

/**
 * What a branch touched (`radius`), off `git diff --numstat` against the run's base, renames found
 * whatever the repository's config says. An error when git cannot say, or says what `radius` cannot
 * read: a branch that is gone is not a branch that changed nothing.
 */
export function touchedBy(run: GitRun, branch: string): Radius | { error: string } {
  const numstat = gitSays(run.repo, '-c', 'core.quotePath=false', 'diff', '--numstat', '--find-renames', `${run.baseRef}...${branch}`);
  if (numstat === undefined) return { error: `git could not diff ${run.baseRef.slice(0, 12)}...${branch}` };
  try {
    return radius(numstat, workspacesOf(run));
  } catch (err) {
    return { error: (err as Error).message };
  }
}

/**
 * The base's npm `workspaces`, which `radius` groups a change by — read at the base, where no step could have edited them, and handed on
 * as written: `radius` reads `./packages/*` as `packages/*`, and names a glob with `**` on the screen (`workspaceGlob`, `deepWorkspaces`).
 */
function workspacesOf(run: GitRun): string[] {
  try {
    const { workspaces } = JSON.parse(gitSays(run.repo, 'show', `${run.baseRef}:package.json`) ?? '{}');
    const globs: unknown = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
    return Array.isArray(globs) ? globs.filter((g): g is string => typeof g === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * The whole diff, base to branch, of the changed files these globs name — by default the ones that decide
 * what a check means. Both ends of a rename are asked for, so git shows it as one. Empty when no changed
 * file is named; undefined when the branch could not be read, or git cannot say.
 */
export function sensitiveDiff(run: GitRun, t: Touched, globs: readonly string[]): string | undefined {
  if ('error' in t.radius) return undefined;
  const paths = sensitivePaths(t.radius.changes, globs);
  if (!paths.length) return '';
  return gitSays(
    run.repo,
    '-c',
    'core.quotePath=false',
    '--literal-pathspecs',
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--find-renames',
    `${run.baseRef}...${t.branch}`,
    '--',
    ...paths,
  );
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it: the branches of its result steps that have one.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the result and stays in the repository. A
 * terminal step's branch is named as soon as it has one, so it is useful while the run is still going, not only afterwards.
 */
export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}

/**
 * Every branch of a repository and the commit it is at, in one `for-each-ref` — the tips of every finished run of that repository at once,
 * for the tick's memo of runs at rest (`rest.ts`), which asks git once a pass for a repository rather than once for each of its runs.
 * Nothing, where git cannot read the repository.
 */
export function headsOf(repo: string): Record<string, string> {
  const listed = gitSays(repo, 'for-each-ref', '--format=%(objectname) %(refname)', 'refs/heads/') ?? '';
  const heads: Record<string, string> = {};
  for (const line of listed.split('\n')) {
    const space = line.indexOf(' ');
    if (space > 0) heads[line.slice(space + 1).replace(/^refs\/heads\//, '')] = line.slice(0, space);
  }
  return heads;
}
