/**
 * The reads of a landing on GitHub and in git, which `land.ts`, sdlc's landing program, imports: where this run's pull requests stand
 * (`standing`), the result branches here (`tips`), what a pull request's head leaves out (`leftOut`), whether the pull request is the
 * run's own (`ownWhy`) and whether its CI context is green at its head (`greenAt`). A library with no command of its own: it merges
 * nothing and writes nothing, and a read that fails refuses (`Refusal`), which the program says on stderr before its pass goes on. It
 * imports `ci-log.ts`, beside it, for how a check of a commit reads and `exec.ts` for how a command is run: the run freezes the carried
 * folder whole (`$WF_CARRIED_FILES`), so a script may import a sibling it holds. Every read is made in the folder the process is in,
 * which the program sets to the run's worktree, where `gh` resolves the repository.
 */
import { PASSED, declaresCi, latest, verdict } from './ci-log.ts';
import { Refusal, git, noGh, run } from './exec.ts';

/** The one `mergeable` GitHub gives a pull request that can be merged now; `CONFLICTING` and `UNKNOWN` are not. */
export const MERGEABLE = 'MERGEABLE';

/** An entry of a commit's checks: a check run, or a status context, as `gh pr view --json statusCheckRollup` gives one. */
type Entry = Partial<Record<'name' | 'context' | 'status' | 'state' | 'conclusion' | 'detailsUrl' | 'targetUrl' | 'startedAt', string>>;

/** A pull request as the landing reads one. */
export type Pr = {
  number: number;
  url: string;
  state?: string;
  isDraft: boolean;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeable?: string;
  mergeCommit?: { oid?: string } | null;
};

/** A result branch of the run in this checkout, with its tip. */
export type Branch = { branch: string; tip: string };

/** What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. */
export function gh(...args: string[]) {
  const ran = run('gh', args);
  if (ran.missing) throw new Refusal(noGh('the merge of the pull request'));
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** `text` parsed as JSON; refuses, naming what was read, when it does not parse. */
export function parsed<T>(what: string, text: string) {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Refusal(`cannot read ${what}: ${(err as Error).message}`);
  }
}

/** The remote `origin`; refuses, naming the fix, where there is none. */
export function origin() {
  if (run('git', ['remote', 'get-url', 'origin']).status !== 0)
    throw new Refusal(
      'this repository has no `origin` remote, and the pull request is merged on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
}

/**
 * The branches of `named` that `head` leaves out, each with its commits whose patch `head` has no equivalent of. A branch is judged by
 * patch, not ancestry (`git cherry <head> <tip>`, whose `+` lines are those commits): a part taken into the run's branch as a commit
 * of its own is never an ancestor of the head, yet nothing of it is left out.
 * @param named The run's result branches, each with its tip.
 * @param head The commit the branches are judged against: a pull request's head, a merge commit, or the base's tip.
 */
export function leftOut(named: readonly Branch[], head: string) {
  return named
    .map(({ branch, tip }) => ({
      branch,
      commits: git(`what of \`${branch}\` ${head.slice(0, 12)} has no patch of`, 'cherry', head, tip)
        .split('\n')
        .filter((line) => line.startsWith('+ '))
        .map((line) => line.slice(2, 14)),
    }))
    .filter((it) => it.commits.length > 0);
}

/** `left`, each branch with its commits, said in a sentence. */
export const withCommits = (left: readonly { branch: string; commits: string[] }[]) =>
  left.map((it) => `\`${it.branch}\` (${it.commits.join(', ')})`).join(', ');

/** The run's result branches in this checkout, each with its tip: `refs/heads/wf/<id>/*`; none where it has none here. */
export function tips(id: string) {
  const listed = git(`the result branches of ${id}`, 'for-each-ref', '--format=%(refname:short) %(objectname)', `refs/heads/wf/${id}/`);
  return listed
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [branch, tip] = line.split(' ');
      return { branch, tip } satisfies Branch;
    });
}

/** The fields of a pull request this script reads, as `gh pr list --json` takes them. */
const FIELDS = 'number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeCommit';

/**
 * Where this run's pull requests stand, in one read: every one whose head is a branch of `wf/<id>/`, those of them GitHub has merged,
 * and those still open. Read afresh each pass, so a pull request merged by the program before a restart, or by a person, reads as merged.
 */
export function standing(id: string) {
  const text = gh('pr', 'list', '--state', 'all', '--limit', '100', '--json', FIELDS);
  const all = parsed<Pr[]>('the pull requests', text).filter((pr) => pr.headRefName?.startsWith(`wf/${id}/`));
  const inState = (state: string) => all.filter((pr) => (pr.state ?? '').toUpperCase() === state);
  return { all, merged: inState('MERGED'), open: inState('OPEN') };
}

/**
 * Why `pr` is not this run's own, or undefined where it is: not a draft, on the base, its head the tip of a result branch here — the sha
 * the review read.
 * @param pr The pull request.
 * @param onto The base branch.
 * @param named The run's result branches here.
 */
export function ownWhy(pr: Pr, onto: string, named: readonly Branch[]) {
  if (pr.isDraft) return `#${pr.number} is a draft: a person marks it ready (\`gh pr ready ${pr.number}\`)`;
  if (pr.baseRefName !== onto)
    return `#${pr.number} is based on \`${pr.baseRefName}\`, not on the base branch \`${onto}\`: a person moves its base (\`gh pr edit ${pr.number} --base ${onto}\`)`;
  const mine = named.find((it) => it.branch === pr.headRefName);
  if (!mine) return `#${pr.number}'s head is \`${pr.headRefName}\`, which this checkout has no branch of: a person fetches it`;
  if (pr.headRefOid !== mine.tip)
    return `#${pr.number} has ${pr.headRefOid.slice(0, 12)} as its head and \`${mine.branch}\` is at ${mine.tip.slice(0, 12)} here: a person brings the two together`;
  return undefined;
}

/**
 * Whether the tree of `sha`, a commit of this checkout, or else the tree of `base`, the base it lands on, declares any CI workflow
 * (`declaresCi`): where neither does, no context will come.
 */
const ciAtCommit = (sha: string, base: string) => declaresCi(workflowsAt(sha)) || declaresCi(workflowsAt(base));

/** The paths under `.github/workflows` in the tree of `rev`, a revision of this checkout. */
const workflowsAt = (rev: string) =>
  git(`the files of ${rev.slice(0, 12)}`, 'ls-tree', '-r', '--name-only', rev, '--', '.github/workflows').split('\n');

/**
 * The CI context `check` at `pr`'s head, read as it is now by the latest run of each check: whether it passed, or none is declared
 * there, and the words that say what was read.
 * @param pr The pull request.
 * @param check The CI context's name (`ciCheck`).
 */
export function greenAt(pr: Pr, check: string) {
  const at = pr.headRefOid.slice(0, 12);
  if (!ciAtCommit(pr.headRefOid, pr.baseRefName))
    return { ok: true, words: `${at} declares no CI workflow, nor does its base: no context was waited on` };
  const text = gh('pr', 'view', String(pr.number), '--json', 'statusCheckRollup');
  const entries = latest(parsed<{ statusCheckRollup?: Entry[] }>(`the checks of #${pr.number}`, text).statusCheckRollup ?? []);
  const ours = entries.filter((entry) => (entry.name ?? entry.context ?? '') === check);
  if (ours.length === 0) return { ok: false, words: `no \`${check}\` context was reported for #${pr.number} at ${at}` };
  const unpassed = ours.filter((entry) => verdict(entry) !== PASSED);
  if (unpassed.length)
    return {
      ok: false,
      words: `\`${check}\` for #${pr.number} is ${unpassed.map((entry) => verdict(entry).toLowerCase() || 'without a verdict').join(', ')} at ${at}`,
    };
  return { ok: true, words: `\`${check}\` passed at ${at}` };
}
