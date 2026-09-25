/**
 * What git says of a git run's result branches once it has them: whether each is on its base branch (`isShipped`) and where it stands
 * (`branchStandings`), a run another waits on as its record and git say it (`parentRecord`), the tips of the branches git has (`refsOf`),
 * and what a branch holds against the run's base — the files it added, one file's text, its diff stat, what it touched and the diff of
 * what decides a check.
 *
 * Beneath the controllers, beside `store.ts` and `worktree.ts`, whose `git` helpers it reads through: it imports neither the engine nor
 * a controller, and `runner.ts` re-exports what it exported of this before. What asks the engine as well — `parentOf`, `decide` — is
 * the controllers' (`views.ts`, `decide.ts`).
 */
import { execCounted } from './tally.ts';
import { isGitRun, resultSteps, type BranchStanding, type GitRun, type ParentRun, type Run, type Shipped } from './run.ts';
import { radius, sensitivePaths, type Radius, type Touched } from './radius.ts';
import { readRun, stepsOf } from './store.ts';
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
 * removed first. With no tip recorded, a branch that is gone has not landed as far as anyone can tell.
 */
export function isShipped(run: GitRun, branch: string): Shipped {
  const within = (commit: string, base: string) => execCounted('git', ['merge-base', '--is-ancestor', commit, base], { cwd: run.repo, stdio: 'ignore' });
  // On the base branch already: with commits past the run's base, or none. Exit 1 is git's no — the commit is not within the run's base.
  const landed = (commit: string): Shipped => {
    try {
      within(commit, run.baseRef);
      return 'unchanged';
    } catch (err) {
      return (err as { status?: number }).status === 1 ? true : 'unchanged';
    }
  };
  try {
    within(branch, run.branch);
  } catch (err) {
    // Exit 1 is git's no. Anything else is a name git cannot read, and the tip is asked instead — only then, since a branch that is
    // still there and not on the base has not landed, whatever an older tip of it says.
    const tip = run.tips?.[branch];
    if ((err as { status?: number }).status === 1 || !tip) return false;
    try {
      within(tip, run.branch);
    } catch { return false; }
    return landed(tip);
  }
  return landed(branch);
}

/**
 * Where each of a run's result branches stands against the base branch it was cut from, as git says it now (`BranchStanding`): on it
 * (`isShipped`, either yes), gone — git no longer has it, and no recorded tip puts it on the base — or ahead of it, by the commits the
 * base branch does not have.
 *
 * Read on the pass that asks and never stored, for the reason `shipped` is asked rather than stored: a person merging by hand changes the
 * answer, and nothing tells the run. A branch git cannot count reads as ahead by none rather than as shipped.
 */
/** Where a run's result branches stand, as `branchStandings` says: none for a folder run, which has no branch. */
export const standingsOf = (run: Run): BranchStanding[] => (isGitRun(run) ? branchStandings(run, resultBranches(run)) : []);

/** Whether a branch of the run is on its base (`isShipped`): never, for a folder run, which has no branch to ask about. */
export const shippedOf = (run: Run) => (branch: string): Shipped => (isGitRun(run) ? isShipped(run, branch) : false);

export function branchStandings(run: GitRun, branches: readonly string[]): BranchStanding[] {
  return [...new Set(branches)].map((branch): BranchStanding => {
    if (isShipped(run, branch) !== false) return { branch, where: 'on' };
    if (gitSays(run.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`) === undefined) return { branch, where: 'gone' };
    const count = Number(gitSays(run.repo, 'rev-list', '--count', `${run.branch}..${branch}`)?.trim());
    return { branch, where: 'ahead', commits: Number.isSafeInteger(count) ? count : 0 };
  });
}

/**
 * A run another waits on, as its record and git say it without the engine: the record, when the store has one, and the result branches
 * it names that git no longer has and cannot find on the base by their recorded tips (`isShipped`). What `wf start --after` refuses an
 * edge by (`afterRefusal`), and where `parentOf` starts.
 */
export function parentRecord(id: string): Pick<ParentRun, 'record' | 'gone'> {
  let record: Run;
  try { record = readRun(id); } catch { return {}; }
  let branches: string[];
  try { branches = resultBranches(record); } catch { branches = []; }   // a pre-freeze record whose folder is gone names no steps
  const git = isGitRun(record) ? record : undefined;
  const gone = git ? branches.filter((b) => gitSays(git.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`) === undefined && !isShipped(git, b)) : [];
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
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/** One artifact's text, out of the branch. */
export function readArtifact(run: GitRun, branch: string, file: string): string {
  try { return git(run.repo, 'show', `${branch}:${file}`); } catch { return ''; }
}

/** How much the run changed, in one line. */
export function diffStat(run: GitRun, branch: string): string {
  try { return git(run.repo, 'diff', '--shortstat', `${run.baseRef}...${branch}`); } catch { return ''; }
}

/**
 * What a branch touched (`radius`), off `git diff --numstat` against the run's base, renames found
 * whatever the repository's config says. An error when git cannot say, or says what `radius` cannot
 * read: a branch that is gone is not a branch that changed nothing.
 */
export function touchedBy(run: GitRun, branch: string): Radius | { error: string } {
  const numstat = gitSays(run.repo, '-c', 'core.quotePath=false', 'diff', '--numstat', '--find-renames', `${run.baseRef}...${branch}`);
  if (numstat === undefined) return { error: `git could not diff ${run.baseRef.slice(0, 12)}...${branch}` };
  try { return radius(numstat, workspacesOf(run)); } catch (err) { return { error: (err as Error).message }; }
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
  } catch { return []; }
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
  return gitSays(run.repo, '-c', 'core.quotePath=false', '--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--find-renames', `${run.baseRef}...${t.branch}`, '--', ...paths);
}

export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
