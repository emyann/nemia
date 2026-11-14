/**
 * `node landing.ts <verb>` — the two acts a landing is made of, which no agent may type: the merge of this run's own pull request on
 * GitHub, and the receipt that it happened. A Bash prefix rule cannot tell `gh pr merge 7` from `gh pr merge 9`, and `gh` is denied whole
 * to the agents that land, so the act is this script, read from the run's frozen carried files (`$WF_CARRIED_FILES`) and run with `node`,
 * as `pull-request.ts` carries the push and the pull request. It imports `ci-log.ts`, beside it, for how a check of a commit reads,
 * `exec.ts`, for how a command is run and CI waited on, and `rerun.ts`, for the one re-run of a red, as `pull-request.ts` does, and
 * `refresh.ts`, for the landing refresh: the run freezes the carried folder whole, so a script may import a sibling it holds. It is
 * told the name of the CI context it reads (`--check <name>`), since that name is the repository's, never the script's.
 *
 * - `merge --run <id> --subject <line> --body-file <f> --check <name>`, which the landing session types once its step has been filed — on a
 *   person's approval in `build`, or by the workflow in `quick`, where the review's pass files it: it refuses anything but this run's own
 *   green pull request — not a draft, based on the remote's default branch, its head the tip of the run's result branch and the sha the
 *   reviewer read, `mergeable` MERGEABLE, the CI context `--check` names SUCCESS at that sha, and every other `wf/<id>/*` branch taken by
 *   it, every commit of the branch having an equivalent patch on the head (`git cherry`) — then merges it with a merge commit whose subject
 *   and body are the ones it was given (`gh pr merge --merge --match-head-commit <sha>`, never `--delete-branch`: the repository
 *   auto-deletes the head branch), and fast-forwards the checkout (`git fetch origin && git merge --ff-only origin/<base>`).
 *   **Level-triggered**: it reads the world rather than what a last try left, so a retry after a merge that went through and a fast-forward
 *   that was then declined — the one failure between the two acts — does the fast-forward alone and merges nothing a second time.
 *   Given the factory's own command `--refresh <cmd>` and the paths it derives `--derives <paths>` (the factory's `landingRefresh` and
 *   `landingDerives`, each may be empty, and an empty `--refresh` is the merge above), where the pull request's head is the run's
 *   own and leaves no branch out but does not hold `origin/<base>` after a `git fetch origin`, it refreshes the branch first
 *   (`refresh.ts`): the base merged into it in the worktree that has it checked out, the command run there to derive its files again,
 *   the result committed and pushed with no force, and `refreshed.json` left in `$WF_STEP_FILES` for the check; it then merges nothing
 *   and exits 0, saying the check merges once CI is green at the pushed head. A refresh the command changed nothing of, on a merge
 *   that went clean, is taken back, and the merge goes on as above. **The landed commit differs from the reviewed head only in the
 *   files `landingDerives` names**, since review reads a head that no longer lands as is: the refreshed head is git's plain merge of the
 *   reviewed head and the base (`git merge-tree --write-tree`), differing from it only in the derived paths, and a refresh with any
 *   other difference, any path left unmerged, or a command that exits non-zero is refused and taken back, nothing pushed.
 * - `receipt --run <id> --check <name> --wait-on-ci <true|false>`, which the land step's `check:` runs: it refuses unless the pull request
 *   is `MERGED` with a merge commit that is reachable from HEAD, the checkout is clean on the base with no merge in progress, and every
 *   commit of every `wf/<id>/*` branch has an equivalent patch on HEAD — the three facts the run's own `landingDue` needs to record
 *   `landed: {commit}` on the commit that landed. Where none is merged, it first reads `refreshed.json` in `WF_ARTIFACTS` (the land
 *   step's files folder): where it names this run's open pull request at its head, the receipt merges it — once the CI context is green
 *   at that head (red refuses, naming the jobs and the `nemia retry <id> review --message "…"` that sends the work back), and only while
 *   the head holds `origin/<base>` (a base that moved past it refuses with the land step's retry line) — by `gh pr merge --merge
 *   --match-head-commit <head>` with the subject and body the session gave, and fast-forwards the checkout, then receipts as above.
 *   Then, last, so a receipt that refuses never waits, and only where `--wait-on-ci` is `true` (the factory's `landingWaitsOnCi`), it
 *   waits on the CI context `--check` names at the merge commit on the base branch, read over REST (its check runs and its status
 *   contexts; the combined `state` is never a verdict): 1800 s for it to be reported
 *   (`WF_CI_START_SECONDS`), 2400 s whole (`WF_CI_WAIT_SECONDS`), `WF_CI_POLL_SECONDS` the interval, inside the landing check's own
 *   deadline, the whole of it while another check at the merge still runs (a context that sums up other jobs comes once they end).
 *   Green passes. Red refuses, naming the jobs that did not pass — unless the base's tip holds the merge and the context is green there,
 *   which passes and says so — but only once the failed jobs of each red Actions run at the merge were re-run, once, by the rule
 *   `pull-request.ts`'s wait keeps (`rerun.ts`, which both import: only while GitHub says the run's `run_attempt` is 1, so a retry of the
 *   land step never re-runs it twice), and waited on within the same bound: a green second time passes, naming the jobs re-run and how
 *   each ended; red again refuses, naming them too and saying the base is broken, not flaky, with the merge commit's checks to read.
 *   A merge whose own run was cancelled (a CI's pending run replaced by a newer push's) or never reported is
 *   read at the base's tip where it holds the merge, by GitHub's compare (`ahead` or `identical`): green there passes, saying which
 *   commit was read and why, red there refuses naming that commit, and anything else waits on. A read of GitHub that fails — `gh` timing
 *   out, exiting non-zero, or answering no JSON — is no verdict: the wait reads again within the whole bound, and a read still failing
 *   there refuses, naming the last error. Still running at the bound, or never reported (CI may not run on pushes to the base: the
 *   factory then sets `landingWaitsOnCi` false), refuses. A refusal there takes nothing back: the merge stands, and the retry reads
 *   GitHub again. Where the receipt merged a refreshed head, the merge commit's tree is most often the head's, already judged, and it
 *   says so rather than waiting again; else the wait at the merge has what remains of the one `WF_CI_WAIT_SECONDS` clock the wait at
 *   the head began, so both stay inside the landing check's deadline.
 *
 * The run is given, never read from HEAD: the checkout a landing runs in is on the base branch, not on a run's branch. Refuses, exit 1 on
 * stderr with what to do next — the exact `nemia retry` line where a person must act: a run with no result branch here; a dirty checkout,
 * one with a merge in progress, or one not on the base; no `origin`; no `gh` on the PATH or none authenticated; no open pull request for
 * the run, or two, or one merged beside one open; a draft, another base, a head that is not the branch's tip, a `mergeable` that is not
 * MERGEABLE, a CI context that is not SUCCESS, a result branch the head leaves out; a `gh pr merge` GitHub declines; and a fast-forward git
 * declines. The receipt takes the merged pull request among whatever the run has — a closed one beside it is no refusal, a second merged
 * one is — and refuses where none is merged.
 */
import fs from 'node:fs';
import {
  type Landing,
  NOT_FAILED,
  PASSED,
  type Seen,
  greenLater,
  latest,
  listing,
  named,
  noVerdict,
  pending,
  reddened,
  seenOf,
  stands,
  superseded,
  unfinished,
  verdict,
} from './ci-log.ts';
import { POLL_SECONDS, Refusal, START_SECONDS, WHOLE_SECONDS, authed, base, git, noGh, run, seconds, sleep } from './exec.ts';
import { type Refreshed, bodyFileOf, lacksBase, recorded, refresh } from './refresh.ts';
import { type Rerun, redTwice, rerunOnce, rerunSaid, seenAfter } from './rerun.ts';

/** The one `mergeable` GitHub gives a pull request that can be merged now; `CONFLICTING` and `UNKNOWN` are both refusals. */
const MERGEABLE = 'MERGEABLE';

/** The step a refusal's `nemia retry` line names, where the environment does not say which step is landing. */
const STEP = 'land';

/**
 * An entry of a commit's checks: a check run, or a status context, as `gh pr view --json statusCheckRollup` gives one, or as `entriesAt`
 * maps one read over REST. Apart from `pull-request.ts`'s on purpose: REST's check runs name no workflow, so it reads no `workflowName`.
 */
type Entry = Partial<Record<'name' | 'context' | 'status' | 'state' | 'conclusion' | 'detailsUrl' | 'targetUrl' | 'startedAt', string>>;

/** A pull request as this script reads one; apart from `pull-request.ts`'s, which reads labels, never a state or a merge commit. */
type Pr = {
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

/** Whether `git args` exited 0, for a question whose answer is its exit code. */
const asks = (...args: string[]): boolean => run('git', args).status === 0;

/**
 * What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. Apart from
 * `pull-request.ts`'s on purpose: a landing has no tries of its own, so a missing `gh` is a plain refusal here, never a person's.
 */
function gh(...args: string[]): string {
  const ran = run('gh', args);
  if (ran.missing) throw new Refusal(noGh(MERGING));
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** The act a landing needs `gh` for, which a refusal names where there is none. */
const MERGING = 'the merge of the pull request';

/** `text` parsed as JSON; refuses, naming what was read, when it does not parse. Apart from `pull-request.ts`'s, which also hints. */
function parsed<T>(what: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Refusal(`cannot read ${what}: ${(err as Error).message}`);
  }
}

/** The remote `origin`; refuses, naming the read, where there is none. Apart on purpose: a landing needs no address of it. */
function origin(): void {
  if (!asks('remote', 'get-url', 'origin'))
    throw new Refusal(
      'this repository has no `origin` remote, and the pull request is merged on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
}

/**
 * The branches of `named` that `head` leaves out, each with its commits whose patch `head` has no equivalent of. A branch is judged by
 * patch, not ancestry (`git cherry <head> <tip>`, whose `+` lines are those commits): a part taken into the run's branch as a commit
 * of its own is never an ancestor of the head, yet nothing of it is left out.
 */
function leftOut(named: readonly { branch: string; tip: string }[], head: string): { branch: string; commits: string[] }[] {
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
const withCommits = (left: readonly { branch: string; commits: string[] }[]): string =>
  left.map((it) => `\`${it.branch}\` (${it.commits.join(', ')})`).join(', ');

/** The run's result branches in this checkout, each with its tip: `refs/heads/wf/<id>/*`. Refuses a run with none. */
function tips(id: string): { branch: string; tip: string }[] {
  const listed = git(`the result branches of ${id}`, 'for-each-ref', '--format=%(refname:short) %(objectname)', `refs/heads/wf/${id}/`);
  const found = listed
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [branch, tip] = line.split(' ');
      return { branch, tip };
    });
  if (found.length === 0)
    throw new Refusal(
      `this checkout has no branch under \`wf/${id}/\`, and a landing lands this run's own result: fetch them ` +
        `(\`git fetch origin "+refs/heads/wf/${id}/*:refs/heads/wf/${id}/*"\`), which is a person's to type, then retry the step`,
    );
  return found;
}

/** The branch this checkout is on, or none where HEAD is detached. */
function branchHere(): string {
  const head = run('git', ['symbolic-ref', '--short', 'HEAD']);
  return head.status === 0 ? head.out.trim() : '';
}

/**
 * The checkout read as a landing needs it: clean, with no merge in progress, and on some branch. Refuses before anything calls `gh`,
 * so a checkout a person is working in is never merged into; the branch it is on is held against the base once the base is known
 * (`onBase`), which takes a `gh` read.
 */
function settled(): string {
  const branch = branchHere();
  if (!branch)
    throw new Refusal(
      "this checkout's HEAD is detached, and a landing fast-forwards the base branch: a person switches it back " +
        '(`git switch <the base branch>`), then the step is retried',
    );
  if (asks('rev-parse', '--verify', '--quiet', 'MERGE_HEAD'))
    throw new Refusal(
      'a merge is already in progress in this checkout, and a landing never lands on top of one: a person finishes it or takes it ' +
        'back (`git merge --abort`), then the step is retried',
    );
  const dirty = git('whether this checkout is clean', 'status', '--porcelain', '--untracked-files=no');
  if (dirty)
    throw new Refusal(
      `this checkout has uncommitted changes, and a landing fast-forwards the base branch onto what GitHub merged:\n${dirty}\n` +
        '  A person commits or puts them aside, then the step is retried.',
    );
  return branch;
}

/** The checkout on the base branch; refuses one that is not, which no landing may fast-forward. */
function onBase(branch: string, onto: string): void {
  if (branch !== onto)
    throw new Refusal(
      `this checkout is on \`${branch}\`, not on the base branch \`${onto}\`, and a landing fast-forwards the base: a person ` +
        `switches it (\`git switch ${onto}\`), then the step is retried`,
    );
}

/** The fields of a pull request this script reads, as `gh pr list --json` takes them. */
const FIELDS = 'number,url,state,isDraft,baseRefName,headRefName,headRefOid,mergeable,mergeCommit';

/** The pull requests of `state` whose head is one of this run's result branches; apart: `pull-request.ts` reads one branch's open ones. */
function pulls(id: string, state: string): Pr[] {
  const text = gh('pr', 'list', '--state', state, '--limit', '100', '--json', FIELDS);
  const all = parsed<Pr[]>(`the ${state} pull requests`, text);
  return all.filter((pr) => pr.headRefName?.startsWith(`wf/${id}/`));
}

/**
 * Where this run's pull requests stand, in one read: every one whose head is a branch of `wf/<id>/`, those of them GitHub has merged,
 * and those still open. Both verbs read the world rather than assume what the last try left: a `merge` whose `gh pr merge` went through
 * and whose fast-forward was then declined is retried against a pull request that is MERGED and no longer open, and a run that ever had
 * a second pull request closed keeps that closed one in `all` for good.
 */
function standing(id: string): { all: Pr[]; merged: Pr[]; open: Pr[] } {
  const all = pulls(id, 'all');
  const inState = (state: string): Pr[] => all.filter((pr) => (pr.state ?? '').toUpperCase() === state);
  return { all, merged: inState('MERGED'), open: inState('OPEN') };
}

/** Two pull requests of one run merged: which landing the run is to record is nobody's to guess. */
const twoMerged = (found: readonly Pr[], id: string): string =>
  `${found.length} pull requests of \`wf/${id}/\` are merged (${found.map((pr) => `#${pr.number}`).join(', ')}), and a run lands ` +
  `one: which of them is this run's landing is a person's to say, and the run records only one commit. Read ` +
  `${found.map((pr) => pr.url).join(' and ')}.`;

/**
 * The one pull request of this run, read as each verb requires one; refuses none, and two. Apart from `pull-request.ts`'s, which judges
 * a draft and a base where this one tells a merged pull request from an open one.
 */
function sole(found: readonly Pr[], id: string, state: string, open: string): Pr {
  if (found.length === 0)
    throw new Refusal(
      `no ${state} pull request has a branch of \`wf/${id}/\` as its head, and a landing merges this run's own pull request. ${open}`,
    );
  if (found.length > 1)
    throw new Refusal(
      `${found.length} ${state} pull requests have a branch of \`wf/${id}/\` as their head ` +
        `(${found.map((pr) => `#${pr.number}`).join(', ')}), and a run lands one: a person closes all but one ` +
        `(\`gh pr close <number>\`), then the step is retried`,
    );
  return found[0];
}

/**
 * The CI context `check` of `number`'s head — the one the base branch's protection requires, named by `--check` — read as it is now;
 * refuses a head nothing judged, or one it did not pass.
 */
function green(pr: Pr, check: string): void {
  const text = gh('pr', 'view', String(pr.number), '--json', 'statusCheckRollup');
  const entries = parsed<{ statusCheckRollup?: Entry[] }>(`the checks of #${pr.number}`, text).statusCheckRollup ?? [];
  const ours = entries.filter((entry) => (entry.name ?? entry.context ?? '') === check);
  if (ours.length === 0)
    throw new Refusal(
      `no \`${check}\` context was reported for #${pr.number} at ${pr.headRefOid.slice(0, 12)}, and \`${check}\` is the one ` +
        `context the base branch requires: nothing has judged the commit that would land. Read ${pr.url}/checks, and retry the step ` +
        'once it is green.',
    );
  const unpassed = ours.filter((entry) => verdict(entry) !== PASSED);
  if (unpassed.length)
    throw new Refusal(
      `\`${check}\` for #${pr.number} is ${unpassed.map((entry) => verdict(entry).toLowerCase() || 'without a verdict').join(', ')} ` +
        `at ${pr.headRefOid.slice(0, 12)}, and only a green pull request lands. Read ${pr.url}/checks: the work goes round again, ` +
        'and nothing is merged here.',
    );
}

/** The pull request read as the merge requires it: this run's own, green, and at the sha the reviewer read. */
function judged(pr: Pr, onto: string, named: readonly { branch: string; tip: string }[], check: string): void {
  own(pr, onto, named, check);
  if ((pr.mergeable ?? '').toUpperCase() !== MERGEABLE)
    throw new Refusal(
      `GitHub says #${pr.number} is \`${pr.mergeable ?? 'unknown'}\`, not \`${MERGEABLE}\`, so it cannot be merged as it stands: the ` +
        `work merges its base again and goes round, or a person reads ${pr.url}. Nothing is merged here.`,
    );
  green(pr, check);
  whole(pr, named);
}

/**
 * The pull request read as this run's own, before anything else of it is: not a draft, on the base, its head the tip of a result branch
 * here — the sha the review read.
 */
function own(pr: Pr, onto: string, named: readonly { branch: string; tip: string }[], check: string): void {
  if (pr.isDraft)
    throw new Refusal(
      `#${pr.number} is a draft, and a draft is not judged by the \`${check}\` context branch protection requires: a person marks ` +
        `it ready (\`gh pr ready ${pr.number}\`), then the step is retried`,
    );
  if (pr.baseRefName !== onto)
    throw new Refusal(
      `#${pr.number} is based on \`${pr.baseRefName}\`, not on the base branch \`${onto}\`, so merging it would not land on the ` +
        `base: a person moves its base (\`gh pr edit ${pr.number} --base ${onto}\`, or ` +
        `\`gh api -X PATCH repos/{owner}/{repo}/pulls/${pr.number} -f base=${onto}\` where \`gh pr edit\` fails on GitHub's ` +
        `deprecated Projects query), then the step is retried`,
    );
  const mine = named.find((branch) => branch.branch === pr.headRefName);
  if (!mine)
    throw new Refusal(
      `#${pr.number}'s head is \`${pr.headRefName}\`, which this checkout has no branch of: a person fetches it, then the step is retried`,
    );
  if (pr.headRefOid !== mine.tip)
    throw new Refusal(
      `#${pr.number} has ${pr.headRefOid.slice(0, 12)} as its head and \`${mine.branch}\` is at ${mine.tip.slice(0, 12)} here, so ` +
        'the commit that would land is not the one the review read: a person brings the two together, then the step is retried',
    );
}

/** The pull request's head read as holding every result branch of the run, by patch; refuses one that leaves a branch out. */
function whole(pr: Pr, named: readonly { branch: string; tip: string }[]): void {
  const left = leftOut(named, pr.headRefOid);
  if (left.length)
    throw new Refusal(
      `merging #${pr.number} would leave out ${withCommits(left)}, ${
        left.length === 1 ? 'a commit' : 'commits'
      } whose patch ${pr.headRefOid.slice(0, 12)} does not hold: the run's result is more than this pull request's head, and a landing that ` +
        `left a branch out would be recorded as none. A person merges ${andThe(left)} into \`${pr.headRefName}\` and pushes it, or ` +
        `deletes ${left.length === 1 ? 'it' : 'them'} where it holds nothing, then the step is retried`,
    );
}

/** `branches`, said in a sentence as the one or the several they are. */
const andThe = (branches: readonly { branch: string }[]): string =>
  branches.length === 1
    ? `\`${branches[0].branch}\``
    : `${branches
        .slice(0, -1)
        .map((b) => `\`${b.branch}\``)
        .join(', ')} and \`${branches.at(-1)!.branch}\``;

/** The line a person types where the landing refused and the step must be run again. */
const retryLine = (id: string): string => `  Then: nemia retry ${id} ${process.env.WF_STEP || STEP}`;

/**
 * The options a verb was given, each flag of `takes` with its value; refuses a flag it has not, and one with no value. A flag of
 * `may` is the factory's own, rendered from a parameter that is empty by default: it may be left out, or given empty.
 */
function options(verb: string, args: readonly string[], takes: readonly string[], may: readonly string[] = []): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (may.includes(flag) && value !== undefined) opts[flag] = value;
    else if (!takes.includes(flag) || !value)
      throw new Refusal(`\`${flag}\` is not an option of ${verb}: give ${takes.map((t) => `${t} <value>`).join(' ')}, each with a value`);
    else opts[flag] = value;
  }
  for (const flag of takes)
    if (!opts[flag]) throw new Refusal(`${verb} takes ${takes.map((t) => `${t} <value>`).join(' ')}: \`${flag}\` was not given`);
  return opts;
}

/** The merge commit's body, read from the file the session wrote it in; refuses a file that is not there or holds nothing. */
function bodyOf(file: string): void {
  if (!fs.existsSync(file))
    throw new Refusal(
      `\`${file}\` is not a file, and the merge commit's body is the one you wrote: write it in your files directory ` +
        '(`$WF_STEP_FILES`), then run the merge again',
    );
  if (!fs.readFileSync(file, 'utf8').trim())
    throw new Refusal(
      `\`${file}\` is empty, and main's history says what landed and why: write the body in it — what the run changed, read off ` +
        '`git log` and `git diff --stat` — then run the merge again',
    );
}

/** `merge`: this run's own green pull request merged with a merge commit, and the checkout fast-forwarded onto it. */
function merge(args: string[]): string[] {
  const opts = options('merge', args, ['--run', '--subject', '--body-file', '--check'], ['--refresh', '--derives']);
  const [id, subject, file, check] = [opts['--run'], opts['--subject'], opts['--body-file'], opts['--check']];
  const [command, derives] = [(opts['--refresh'] ?? '').trim(), (opts['--derives'] ?? '').trim()];
  bodyOf(file);
  const named = tips(id);
  const branch = settled();
  origin();
  authed(MERGING);
  const onto = base('the landing', gh);
  onBase(branch, onto);
  const { merged: already, open } = standing(id);
  if (already.length > 1) throw new Refusal(twoMerged(already, id));
  if (already.length === 1) {
    const was = already[0];
    if (open.length)
      throw new Refusal(
        `#${was.number} of this run is merged already and #${open.map((pr) => pr.number).join(', #')} is still open, so which pull ` +
          `request is this run's landing is a person's to say: they close the open one (\`gh pr close <number>\`) where the merge ` +
          `that happened is the landing, and the step is retried. Nothing is merged here.`,
      );
    return [
      `#${was.number} was merged already, at ${was.headRefOid.slice(0, 12)}: nothing is merged a second time`,
      ...forwarded(was, onto, id),
    ];
  }
  const pr = sole(
    open,
    id,
    'open',
    'The implement step opens it, so a run with none goes round again; a person reopens one that was closed ' +
      '(`gh pr reopen <number>`), then the step is retried.',
  );
  if (command) {
    own(pr, onto, named, check);
    whole(pr, named);
    const said = lacksBase(onto, pr.headRefOid, retryLine(id))
      ? refresh({
          pr: pr.number,
          branch: pr.headRefName,
          tip: pr.headRefOid,
          onto,
          command,
          derives,
          subject,
          bodyFile: file,
          retry: retryLine(id),
        })
      : undefined;
    if (said) return said;
  }
  judged(pr, onto, named, check);
  const merged = run('gh', [
    'pr',
    'merge',
    String(pr.number),
    '--merge',
    '--match-head-commit',
    pr.headRefOid,
    '--subject',
    subject,
    '--body-file',
    file,
  ]);
  if (merged.missing) throw new Refusal(noGh(MERGING));
  if (merged.status !== 0)
    throw new Refusal(
      `GitHub declined to merge #${pr.number} at ${pr.headRefOid.slice(0, 12)}: ${merged.err}\n` +
        `  Nothing landed and this checkout is untouched. Read ${pr.url}.\n${retryLine(id)}`,
    );
  return [`#${pr.number} merged at ${pr.headRefOid.slice(0, 12)} with a merge commit: ${pr.url}`, ...forwarded(pr, onto, id)];
}

/**
 * The checkout fast-forwarded onto what GitHub merged: what it did, for stdout. Refuses a fetch that failed and a fast-forward git
 * declined, each saying that the merge did happen and naming the command a person types — and never merging in their checkout.
 */
function forwarded(pr: Pr, onto: string, id: string): string[] {
  const fetched = run('git', ['fetch', 'origin']);
  if (fetched.status !== 0)
    throw new Refusal(
      `#${pr.number} is merged on GitHub, but \`git fetch origin\` failed here: ${fetched.err}\n` +
        `  The change is on \`${onto}\` upstream; this checkout is behind it. Running the merge again from here fast-forwards it ` +
        `alone, since the pull request is already merged.\n${retryLine(id)}`,
    );
  const forward = run('git', ['merge', '--ff-only', `origin/${onto}`]);
  if (forward.status !== 0)
    throw new Refusal(
      `#${pr.number} is merged on GitHub, but \`git merge --ff-only origin/${onto}\` was declined here: ${forward.err}\n` +
        `  This checkout holds commits \`${onto}\` upstream does not, and a landing never merges in a person's checkout. A person ` +
        `brings it onto \`origin/${onto}\` — \`git log origin/${onto}..HEAD\` says what is in the way — and the merge run again ` +
        `fast-forwards it alone, the pull request being merged already.\n${retryLine(id)}`,
    );
  return [`\`${onto}\` here is fast-forwarded to ${git('what commit HEAD is', 'rev-parse', 'HEAD').slice(0, 12)}`];
}

/** `receipt`: the three facts the run records a landing on — merged with a merge commit, the checkout clean on it, no branch left out. */
function receipt(args: string[]): string[] {
  const opts = options('receipt', args, ['--run', '--check', '--wait-on-ci']);
  const [id, check, waits] = [opts['--run'], opts['--check'], waitsOf(opts['--wait-on-ci'])];
  const named = tips(id);
  origin();
  authed(MERGING);
  const onto = base('the landing', gh);
  const began = Date.now();
  const { before, fresh, all, merged } = takenFresh(id, onto, check, began);
  const { pr, oid } = mergeOf(id, all, merged);
  const branch = settled();
  onBase(branch, onto);
  if (!asks('merge-base', '--is-ancestor', oid, 'HEAD'))
    throw new Refusal(
      `${oid.slice(0, 12)}, the merge of #${pr.number}, is not reachable from this checkout's HEAD: the fast-forward did not happen ` +
        `here. \`git fetch origin && git merge --ff-only origin/${onto}\` is what the merge verb does; a person types it, then the ` +
        'step is retried.',
    );
  const left = leftOut(named, 'HEAD');
  if (left.length)
    throw new Refusal(
      `${withCommits(left)} ${left.length === 1 ? 'holds' : 'hold'} a commit whose patch this checkout's HEAD does not hold, so part of the run's result did ` +
        'not land and the run would record a landing that left it out. A person brings it onto the base, then the step is retried.',
    );
  const proven = [
    `#${pr.number} is merged as ${oid.slice(0, 12)}, a merge commit`,
    `\`${onto}\` here holds it, clean, with every commit of \`wf/${id}/\` on HEAD, by its patch`,
  ];
  if (!waits)
    return [
      ...before,
      ...proven,
      `\`${check}\` at ${oid.slice(0, 12)} on \`${onto}\` was not waited on: the factory's \`landingWaitsOnCi\` is false`,
    ];
  if (fresh && treeOf(oid) === treeOf(fresh.headRefOid))
    return [
      ...before,
      ...proven,
      `\`${check}\` at ${oid.slice(0, 12)} was not waited on again: it has the same tree as ${fresh.headRefOid.slice(0, 12)}, ` +
        'the refreshed head it passed at',
    ];
  return [...before, ...proven, ...ciAt(pr, oid, onto, check, id, began)];
}

/**
 * Where this run's pull requests stand once a head the land step's session refreshed is merged: none merged and `refreshed.json` in
 * `WF_ARTIFACTS` naming this run's open pull request at its head, it is merged here (`mergedFresh`) and the pull requests read again,
 * what that said in `before`; otherwise they are read once and nothing is merged.
 */
function takenFresh(id: string, onto: string, check: string, began: number): { before: string[]; fresh?: Pr; all: Pr[]; merged: Pr[] } {
  const now = standing(id);
  if (now.merged.length > 1) throw new Refusal(twoMerged(now.merged, id));
  const record = now.merged.length === 0 ? recorded(process.env.WF_ARTIFACTS) : undefined;
  const fresh = record && now.open.find((pr) => pr.number === record.pr && pr.headRefOid === record.head);
  if (!record || !fresh) return { before: [], all: now.all, merged: now.merged };
  const before = mergedFresh(fresh, record, onto, check, id, began);
  const after = standing(id);
  return { before, fresh, all: after.all, merged: after.merged };
}

/** The one merged pull request of the run and its merge commit, as the receipt records them; refuses none, two, and a squash. */
function mergeOf(id: string, all: readonly Pr[], merged: readonly Pr[]): { pr: Pr; oid: string } {
  if (merged.length > 1) throw new Refusal(twoMerged(merged, id));
  if (merged.length === 0)
    throw new Refusal(
      `no pull request of \`wf/${id}/\` is merged${
        all.length ? ` — ${all.map((pr) => `#${pr.number} is \`${(pr.state ?? 'unknown').toLowerCase()}\``).join(', ')} — ` : ', '
      }so nothing of this run landed: the merge is made with ` +
        `\`landing.ts merge --run ${id} --subject … --body-file … --check <name>\`${all.length ? `, and ${all[0].url} says why it was not` : ''}.`,
    );
  const pr = merged[0];
  const oid = pr.mergeCommit?.oid;
  if (!oid) throw new Refusal(`#${pr.number} is merged but names no merge commit, so there is nothing to record: read ${pr.url}`);
  const parents = git(`the parents of ${oid.slice(0, 12)}`, 'rev-list', '--parents', '-n', '1', oid)
    .split(' ')
    .slice(1);
  if (parents.length < 2)
    throw new Refusal(
      `#${pr.number} landed as ${oid.slice(0, 12)}, which has ${parents.length} parent${parents.length === 1 ? '' : 's'} and not the ` +
        "two a merge commit has: it was squashed or rebased, and main's history no longer holds the run's own commits. A person says " +
        'what to do with it; the merge this script makes is `--merge`.',
    );
  return { pr, oid };
}

/** The tree of the commit `sha`. */
const treeOf = (sha: string): string => git(`the tree of ${sha.slice(0, 12)}`, 'rev-parse', `${sha}^{tree}`);

/**
 * The merge of `pr`, whose head the land step's session refreshed (`record`): once `check` is green at that head, and only while it
 * holds the base, merged at that head with the subject and body the session gave, and the checkout fast-forwarded onto it. The wait
 * here and the one at the merge after it share one clock, from `began`, so the two stay inside the landing check's deadline.
 */
function mergedFresh(pr: Pr, record: Refreshed, onto: string, check: string, id: string, began: number): string[] {
  onBase(settled(), onto);
  holds(pr, onto, id);
  const said = greenAtHead(pr, check, id, began);
  holds(pr, onto, id);
  const body = bodyFileOf(record.body);
  try {
    const merged = run('gh', [
      'pr',
      'merge',
      String(pr.number),
      '--merge',
      '--match-head-commit',
      pr.headRefOid,
      '--subject',
      record.subject,
      '--body-file',
      body.file,
    ]);
    if (merged.missing) throw new Refusal(noGh(MERGING));
    if (merged.status !== 0)
      throw new Refusal(
        `GitHub declined to merge #${pr.number} at ${pr.headRefOid.slice(0, 12)}, the head the landing refreshed: ${merged.err}\n` +
          `  Nothing landed and this checkout is untouched. Read ${pr.url}.\n${retryLine(id)}`,
      );
  } finally {
    body.done();
  }
  return [
    said,
    `#${pr.number} merged at ${pr.headRefOid.slice(0, 12)}, the refreshed head, with a merge commit: ${pr.url}`,
    ...forwarded(pr, onto, id),
  ];
}

/** The base, fetched, held by `pr`'s refreshed head; refuses where it moved past it, the land step then refreshing it again. */
function holds(pr: Pr, onto: string, id: string): void {
  if (lacksBase(onto, pr.headRefOid, retryLine(id)))
    throw new Refusal(
      `\`${onto}\` moved past ${pr.headRefOid.slice(0, 12)}, the head the landing refreshed #${pr.number} to, so it would not land as ` +
        `CI judged it: the land step runs again and refreshes it onto the base as it is now. Nothing is merged.\n${retryLine(id)}`,
    );
}

/**
 * The CI context `check` at `pr`'s refreshed head, waited out on the clock that began at `began`: a line where it passed; a refusal
 * where it is red, naming the jobs and sending the work back to review, or where it never came or never finished within the bounds.
 */
function greenAtHead(pr: Pr, check: string, id: string, began: number): string {
  const head = pr.headRefOid;
  const whole = seconds('WF_CI_WAIT_SECONDS', WHOLE_SECONDS);
  const start = Math.min(seconds('WF_CI_START_SECONDS', START_SECONDS), whole);
  const l: Landing = { number: pr.number, url: pr.url, oid: head, onto: pr.headRefName, check };
  for (;;) {
    const { entries, unread } = readAt(head);
    const ours = named(entries, check);
    const seen = unread === undefined && !(ours.length && superseded(ours)) ? seenOf(ours) : 'pending';
    if (seen === 'passed') return `\`${check}\` passed at ${head.slice(0, 12)}, the head the landing refreshed #${pr.number} to`;
    if (seen === 'failed')
      throw new Refusal(
        [
          `\`${check}\` is red at ${head.slice(0, 12)}, the base merged into #${pr.number} at the landing, so nothing is merged. The jobs ` +
            'that did not pass:',
          ...listing(entries.filter((entry) => !pending(entry) && !NOT_FAILED.has(verdict(entry)))),
          '  The work goes back to be fixed on the branch:',
          `  Then: nemia retry ${id} review --message "\`${check}\` is red at ${head.slice(0, 12)}, the base merged in at the landing"`,
        ].join('\n'),
      );
    const bound = unread === undefined && ours.length === 0 && !entries.some(pending) ? start : whole;
    if (Date.now() - began >= bound * 1000)
      throw new Refusal([unfinished(l, entries, bound, unread), '  Nothing is merged.', retryLine(id)].join('\n'));
    sleep(seconds('WF_CI_POLL_SECONDS', POLL_SECONDS));
  }
}

/** Whether the receipt waits on CI at the merge, from `--wait-on-ci`; refuses a value that is neither `true` nor `false`. */
function waitsOf(value: string): boolean {
  if (value === 'true' || value === 'false') return value === 'true';
  throw new Refusal(
    `\`--wait-on-ci ${value}\` is neither true nor false: give the factory's \`landingWaitsOnCi\`, as the land step's check does`,
  );
}

/** What GitHub's REST API answers at `repos/{owner}/{repo}/<path>`, parsed; refuses where `gh` fails or the answer is no JSON. */
const api = <T>(path: string): T => parsed<T>(`gh api ${path}`, gh('api', `repos/{owner}/{repo}/${path}`));

/**
 * A check run or a status context as GitHub's REST API gives one: lower-case, a field absent or `null` where it has none. Apart from
 * `pull-request.ts`'s, which reads no `null`: it spreads the entry whole rather than naming each field.
 */
type Rest = Partial<Record<string, string | null>>;

/**
 * A commit's check runs and status contexts as `Entry`s, read over REST: check runs come lower-case, so they are upper-cased here. One
 * page of 100 check runs is read. The combined status's own `state` is never read: a repository whose CI is all check runs answers
 * `pending` with no context in it. Apart from `pull-request.ts`'s on purpose: a read that fails is refused here, and `readAt` reads again.
 */
function entriesAt(sha: string): Entry[] {
  const runs = api<{ check_runs?: Rest[] }>(`commits/${sha}/check-runs?per_page=100`).check_runs ?? [];
  const statuses = api<{ statuses?: Rest[] }>(`commits/${sha}/status`).statuses ?? [];
  return [
    ...runs.map((run) => ({
      name: run.name ?? undefined,
      status: run.status?.toUpperCase(),
      conclusion: run.conclusion?.toUpperCase(),
      detailsUrl: run.html_url ?? run.details_url ?? undefined,
      startedAt: run.started_at ?? undefined,
    })),
    ...statuses.map((it) => ({ context: it.context ?? undefined, state: it.state?.toUpperCase(), targetUrl: it.target_url ?? undefined })),
  ];
}

/**
 * A commit's checks as `entriesAt` reads them, or, where GitHub could not be read — `gh` timing out, exiting non-zero, or answering no
 * JSON — none, and the error: no verdict, so the wait reads again.
 */
function readAt(sha: string): { entries: Entry[]; unread?: string } {
  try {
    return { entries: entriesAt(sha) };
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    return { entries: [], unread: err.message };
  }
}

/**
 * The CI context `check` at `oid`, the merge of `pr` on `onto`, waited out within the bounds: the lines where it passed, a refusal where
 * it did not, never came, or never finished (`judgedAt`). A context that sums up other jobs is reported only once they end, so while any
 * check at the merge runs it has the whole bound, not the start's. A red is re-run once first (`rerun.ts`), within the same bound, and
 * every line after says what was re-run and how it ended.
 */
function ciAt(pr: Pr, oid: string, onto: string, check: string, id: string, began = Date.now()): string[] {
  const whole = seconds('WF_CI_WAIT_SECONDS', WHOLE_SECONDS);
  const start = Math.min(seconds('WF_CI_START_SECONDS', START_SECONDS), whole);
  const poll = seconds('WF_CI_POLL_SECONDS', POLL_SECONDS);
  const l: Landing = { number: pr.number, url: pr.url, oid, onto, check };
  const again: Again = { asked: false };
  for (;;) {
    const { entries: all, unread } = readAt(oid);
    const entries = latest(all);
    const ours = named(entries, check);
    const said = unread === undefined ? judgedAt(l, entries, ours, id, again) : undefined;
    if (said) return [...rerunSaid(again.rerun, entries).map((line) => line.trim()), said];
    const bound = unread === undefined && ours.length === 0 && !entries.some(pending) ? start : whole;
    if (Date.now() - began >= bound * 1000)
      throw new Refusal([unfinished(l, entries, bound, unread), ...rerunSaid(again.rerun, entries), stands(l), retryLine(id)].join('\n'));
    sleep(poll);
  }
}

/** The receipt's one re-run of a red at the merge, carried across the polls of one wait: whether it was asked, and what it re-ran. */
type Again = { asked: boolean; rerun?: Rerun<Entry> };

/**
 * The merge's checks read once: a line where `ours` passed — the second time, where a red was re-run — or where they are red or carry no
 * verdict of their own (`superseded`: never reported, or every run cancelled, as a CI does whose pending run a newer push replaced) and
 * the base's tip that holds the merge (`later`) passed; none, to wait on, where a red at the merge was just re-run (`again`, once a
 * wait, and only a run on its first attempt) or a job re-run still shows its first time; a refusal where the merge is red and was not
 * re-run, or red again after it, and the tip did not pass, or the merge has no verdict and the tip is red; none, to wait on, where neither
 * has a verdict yet.
 */
function judgedAt(l: Landing, entries: readonly Entry[], ours: readonly Entry[], id: string, again: Again): string | undefined {
  const seen = seenAfter(again.rerun, entries, ours);
  if (seen === 'passed') return `\`${l.check}\` passed on \`${l.onto}\` at ${l.oid.slice(0, 12)}, the merge commit`;
  const none = superseded(ours) ? noVerdict(ours) : undefined;
  if (seen !== 'failed' && none === undefined) return undefined;
  const tip = later(l.oid, l.onto, l.check);
  if (tip?.seen === 'passed') return greenLater(l, tip.sha, none);
  if (none === undefined) {
    if (!again.asked) {
      again.asked = true;
      again.rerun = rerunOnce(ours, entries);
      if (again.rerun?.runs.length) return undefined;
    }
    const twice = redTwice(again.rerun, entries);
    throw new Refusal([...reddened(l, l.oid, entries, undefined, rerunSaid(again.rerun, entries), twice), retryLine(id)].join('\n'));
  }
  if (tip?.seen === 'failed') throw new Refusal([...reddened(l, tip.sha, tip.entries, none), retryLine(id)].join('\n'));
  return undefined;
}

/**
 * The base's tip where it holds `oid`, by GitHub's compare (`ahead` or `identical`, never the order of commits), with how `check` reads
 * there, a context with no verdict of its own (`superseded`) read as `absent`; read once a call. None where the tip is `oid` itself,
 * does not hold it, or cannot be read.
 */
function later(oid: string, onto: string, check: string): { sha: string; entries: Entry[]; seen: Seen } | undefined {
  try {
    const sha = api<{ sha?: string }>(`commits/${onto}`).sha;
    if (!sha || sha === oid) return undefined;
    const compared = api<{ status?: string }>(`compare/${oid}...${sha}`).status;
    if (compared !== 'ahead' && compared !== 'identical') return undefined;
    const entries = entriesAt(sha);
    const ours = named(entries, check);
    return { sha, entries, seen: superseded(ours) ? 'absent' : seenOf(ours) };
  } catch (err) {
    if (err instanceof Refusal) return undefined;
    throw err;
  }
}

/** The verbs, by name. */
const VERBS: Record<string, (args: string[]) => string[]> = { merge, receipt };

/** The whole run: exit 0 with what was done on stdout, 1 with the refusal on stderr, each line under the one tag a landing prints. */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  const act = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  try {
    if (!act) throw new Refusal(`\`${verb}\` is no verb: give merge or receipt`);
    for (const line of act(args)) process.stdout.write(`nemia land: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia land: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
