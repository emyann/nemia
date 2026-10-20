/**
 * `node landing.ts <verb>` — the two acts a landing is made of, which no agent may type: the merge of this run's own pull request on
 * GitHub, and the receipt that it happened. A Bash prefix rule cannot tell `gh pr merge 7` from `gh pr merge 9`, and `gh` is denied
 * whole to the agents that land, so the act is this script, read out of git into a directory of its own and run with `node`, as
 * `pull-request.ts` carries the push and the pull request card 1 opens. It imports nothing: a frozen clause copies one file.
 *
 * - `merge --run <id> --subject <line> --body-file <f>`, which the landing session types once a person has approved it: it refuses
 *   anything but this run's own green pull request — not a draft, based on the remote's default branch, its head the tip of the run's
 *   result branch and the sha the reviewer read, `mergeable` MERGEABLE, the `ci` context SUCCESS at that sha, and every other
 *   `wf/<id>/*` tip reachable from it — then merges it with a merge commit whose subject and body are the ones it was given
 *   (`gh pr merge --merge --match-head-commit <sha>`, never `--delete-branch`: the repository auto-deletes the head branch), and
 *   fast-forwards the checkout (`git fetch origin && git merge --ff-only origin/<base>`). **Level-triggered**: it reads the world
 *   rather than what a last try left, so a retry after a merge that went through and a fast-forward that was then declined — the one
 *   failure between the two acts — does the fast-forward alone and merges nothing a second time.
 * - `receipt --run <id>`, which the land step's `check:` runs: it refuses unless the pull request is `MERGED` with a merge commit that
 *   is reachable from HEAD, the checkout is clean on the base with no merge in progress, and every `wf/<id>/*` tip is an ancestor of
 *   HEAD — the three facts the run's own `landingDue` needs to record `landed: {commit}` on the commit that landed.
 *
 * The run is given, never read from HEAD: the checkout a landing runs in is on the base branch, not on a run's branch. Refuses, exit 1
 * on stderr with what to do next — the exact `nemia retry` line where a person must act: a run with no result branch here; a dirty
 * checkout, one with a merge in progress, or one not on the base; no `origin`; no `gh` on the PATH or none authenticated; no open pull
 * request for the run, or two, or one merged beside one open; a draft, another base, a head that is not the branch's tip, a `mergeable`
 * that is not MERGEABLE, a `ci` that is not SUCCESS, a result branch the head leaves out; a `gh pr merge` GitHub declines; and a
 * fast-forward git declines. The receipt takes the merged pull request among whatever the run has — a closed one beside it is no
 * refusal, a second merged one is — and refuses where none is merged.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

/** A reason the verb is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** The one context branch protection requires of the base branch, and the only verdict this script reads (`.github/workflows/ci.yml`). */
const CONTEXT = 'ci';

/** The one conclusion that is a pass: a skipped, cancelled or neutral `ci` is no verdict to land on. */
const PASSED = 'SUCCESS';

/** The one `mergeable` GitHub gives a pull request that can be merged now; `CONFLICTING` and `UNKNOWN` are both refusals. */
const MERGEABLE = 'MERGEABLE';

/** The step a refusal's `nemia retry` line names, where the environment does not say which step is landing. */
const STEP = 'land';

/** How long a call of `git` or `gh` may take, in milliseconds. */
const BOUND = 120_000;

/** An entry of a head's check rollup, as `gh pr view --json statusCheckRollup` gives one: a check run, or a status context. */
type Entry = { name?: string; context?: string; status?: string; state?: string; conclusion?: string };

/** A pull request as this script reads one. */
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

/** What a command printed: its exit, its streams, and whether there was no such command on the PATH. */
type Ran = { status: number | null; out: string; err: string; missing: boolean };

/** Run `cmd` with `args`, bounded, reading nothing from stdin. */
function run(cmd: string, args: string[]): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND });
  const missing = r.error !== undefined && 'code' in r.error && r.error.code === 'ENOENT';
  return { status: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').trim() || (r.error?.message ?? ''), missing };
}

/** What git printed for `args`, trimmed; refuses, saying what could not be told, when git fails. */
function git(what: string, ...args: string[]): string {
  const ran = run('git', args);
  if (ran.status !== 0) throw new Refusal(`cannot tell ${what}, since \`git ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** Whether `git args` exited 0, for a question whose answer is its exit code. */
const asks = (...args: string[]): boolean => run('git', args).status === 0;

/** What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. */
function gh(...args: string[]): string {
  const ran = run('gh', args);
  if (ran.missing) throw new Refusal(MISSING_GH);
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** What a person types where there is no `gh` to merge with. */
const MISSING_GH =
  'no `gh` on the PATH, and the merge of the pull request is GitHub\'s CLI\'s. Install it (https://cli.github.com) and run `gh auth login`';

/** `text` parsed as JSON; refuses, naming what was read, when it does not parse. */
function parsed<T>(what: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Refusal(`cannot read ${what}: ${(err as Error).message}`);
  }
}

/** `gh auth status` passing; refuses with the one command a person types when it does not. */
function authed(): void {
  const status = run('gh', ['auth', 'status']);
  if (status.missing) throw new Refusal(MISSING_GH);
  if (status.status !== 0) throw new Refusal(`\`gh\` is not authenticated here: run \`gh auth login\`. It said: ${status.err}`);
}

/** The remote `origin`; refuses, naming the read, where there is none. */
function origin(): void {
  if (!asks('remote', 'get-url', 'origin'))
    throw new Refusal(
      'this repository has no `origin` remote, and the pull request is merged on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
}

/** The remote's default branch, which this run's pull request is based on and which the checkout lands on. */
function base(): string {
  const name = parsed<{ defaultBranchRef?: { name?: string } }>(
    "the remote's default branch",
    gh('repo', 'view', '--json', 'defaultBranchRef'),
  ).defaultBranchRef?.name;
  if (!name) throw new Refusal('`gh repo view --json defaultBranchRef` named no default branch: the base of the landing is unknown');
  return name;
}

/** The run's result branches in this checkout, each with its tip: `refs/heads/wf/<id>/*`. Refuses a run with none. */
function tips(id: string): { branch: string; tip: string }[] {
  const listed = git(
    `the result branches of ${id}`,
    'for-each-ref',
    '--format=%(refname:short) %(objectname)',
    `refs/heads/wf/${id}/`,
  );
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

/** The pull requests of `state` whose head is one of this run's result branches. */
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

/** The one pull request of this run, read as each verb requires one; refuses none, and two. */
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

/** The verdict of a rollup entry, a check run's conclusion or a status context's state, upper-cased; empty where it has neither. */
const verdict = (entry: Entry): string => (entry.conclusion ?? entry.state ?? '').toUpperCase();

/** The `ci` context of `number`'s head, read as it is now; refuses a head nothing judged, or one it did not pass. */
function green(pr: Pr): void {
  const text = gh('pr', 'view', String(pr.number), '--json', 'statusCheckRollup');
  const entries = parsed<{ statusCheckRollup?: Entry[] }>(`the checks of #${pr.number}`, text).statusCheckRollup ?? [];
  const ours = entries.filter((entry) => (entry.name ?? entry.context ?? '') === CONTEXT);
  if (ours.length === 0)
    throw new Refusal(
      `no \`${CONTEXT}\` context was reported for #${pr.number} at ${pr.headRefOid.slice(0, 12)}, and \`${CONTEXT}\` is the one ` +
        `context the base branch requires: nothing has judged the commit that would land. Read ${pr.url}/checks, and retry the step ` +
        'once it is green.',
    );
  const unpassed = ours.filter((entry) => verdict(entry) !== PASSED);
  if (unpassed.length)
    throw new Refusal(
      `\`${CONTEXT}\` for #${pr.number} is ${unpassed.map((entry) => verdict(entry).toLowerCase() || 'without a verdict').join(', ')} ` +
        `at ${pr.headRefOid.slice(0, 12)}, and only a green pull request lands. Read ${pr.url}/checks: the work goes round again, ` +
        'and nothing is merged here.',
    );
}

/** The pull request read as the merge requires it: this run's own, green, and at the sha the reviewer read. */
function judged(pr: Pr, onto: string, named: readonly { branch: string; tip: string }[]): void {
  if (pr.isDraft)
    throw new Refusal(
      `#${pr.number} is a draft, and a draft is not judged by the \`${CONTEXT}\` context branch protection requires: a person marks ` +
        `it ready (\`gh pr ready ${pr.number}\`), then the step is retried`,
    );
  if (pr.baseRefName !== onto)
    throw new Refusal(
      `#${pr.number} is based on \`${pr.baseRefName}\`, not on the base branch \`${onto}\`, so merging it would not land on the ` +
        `base: a person rebases it (\`gh pr edit ${pr.number} --base ${onto}\`), then the step is retried`,
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
  if ((pr.mergeable ?? '').toUpperCase() !== MERGEABLE)
    throw new Refusal(
      `GitHub says #${pr.number} is \`${pr.mergeable ?? 'unknown'}\`, not \`${MERGEABLE}\`, so it cannot be merged as it stands: the ` +
        `work merges its base again and goes round, or a person reads ${pr.url}. Nothing is merged here.`,
    );
  green(pr);
  const left = named.filter((branch) => !asks('merge-base', '--is-ancestor', branch.tip, pr.headRefOid));
  if (left.length)
    throw new Refusal(
      `merging #${pr.number} would leave out ${left.map((branch) => `\`${branch.branch}\``).join(', ')}, which ${
        left.length === 1 ? 'is' : 'are'
      } not reachable from ${pr.headRefOid.slice(0, 12)}: the run's result is more than this pull request's head, and a landing that ` +
        `left a branch out would be recorded as none. A person merges ${andThe(left)} into \`${pr.headRefName}\` and pushes it, or ` +
        `deletes ${left.length === 1 ? 'it' : 'them'} where it holds nothing, then the step is retried`,
    );
}

/** `branches`, said in a sentence as the one or the several they are. */
const andThe = (branches: readonly { branch: string }[]): string =>
  branches.length === 1
    ? `\`${branches[0].branch}\``
    : `${branches.slice(0, -1).map((b) => `\`${b.branch}\``).join(', ')} and \`${branches.at(-1)!.branch}\``;

/** The line a person types where the landing refused and the step must be run again. */
const retryLine = (id: string): string => `  Then: nemia retry ${id} ${process.env.WF_STEP || STEP}`;

/** The options a verb was given, each flag of `takes` with its value; refuses a flag it has not, and one with no value. */
function options(verb: string, args: readonly string[], takes: readonly string[]): Record<string, string> {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if (!takes.includes(flag) || !value)
      throw new Refusal(`\`${flag}\` is not an option of ${verb}: give ${takes.map((t) => `${t} <value>`).join(' ')}, each with a value`);
    opts[flag] = value;
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
  const opts = options('merge', args, ['--run', '--subject', '--body-file']);
  const [id, subject, file] = [opts['--run'], opts['--subject'], opts['--body-file']];
  bodyOf(file);
  const named = tips(id);
  const branch = settled();
  origin();
  authed();
  const onto = base();
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
  judged(pr, onto, named);
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
  if (merged.missing) throw new Refusal(MISSING_GH);
  if (merged.status !== 0)
    throw new Refusal(
      `GitHub declined to merge #${pr.number} at ${pr.headRefOid.slice(0, 12)}: ${merged.err}\n` +
        `  Nothing landed and this checkout is untouched. Read ${pr.url}.\n${retryLine(id)}`,
    );
  return [
    `#${pr.number} merged at ${pr.headRefOid.slice(0, 12)} with a merge commit: ${pr.url}`,
    ...forwarded(pr, onto, id),
  ];
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
  const opts = options('receipt', args, ['--run']);
  const id = opts['--run'];
  const named = tips(id);
  origin();
  authed();
  const onto = base();
  const { all, merged } = standing(id);
  if (merged.length > 1) throw new Refusal(twoMerged(merged, id));
  if (merged.length === 0)
    throw new Refusal(
      `no pull request of \`wf/${id}/\` is merged${
        all.length ? ` — ${all.map((pr) => `#${pr.number} is \`${(pr.state ?? 'unknown').toLowerCase()}\``).join(', ')} — ` : ', '
      }so nothing of this run landed: the merge is made with ` +
        `\`landing.ts merge --run ${id} --subject … --body-file …\`${all.length ? `, and ${all[0].url} says why it was not` : ''}.`,
    );
  const pr = merged[0];
  const oid = pr.mergeCommit?.oid;
  if (!oid) throw new Refusal(`#${pr.number} is merged but names no merge commit, so there is nothing to record: read ${pr.url}`);
  const parents = git(`the parents of ${oid.slice(0, 12)}`, 'rev-list', '--parents', '-n', '1', oid).split(' ').slice(1);
  if (parents.length < 2)
    throw new Refusal(
      `#${pr.number} landed as ${oid.slice(0, 12)}, which has ${parents.length} parent${parents.length === 1 ? '' : 's'} and not the ` +
        "two a merge commit has: it was squashed or rebased, and main's history no longer holds the run's own commits. A person says " +
        'what to do with it; the merge this script makes is `--merge`.',
    );
  const branch = settled();
  onBase(branch, onto);
  if (!asks('merge-base', '--is-ancestor', oid, 'HEAD'))
    throw new Refusal(
      `${oid.slice(0, 12)}, the merge of #${pr.number}, is not reachable from this checkout's HEAD: the fast-forward did not happen ` +
        `here. \`git fetch origin && git merge --ff-only origin/${onto}\` is what the merge verb does; a person types it, then the ` +
        'step is retried.',
    );
  const left = named.filter((it) => !asks('merge-base', '--is-ancestor', it.tip, 'HEAD'));
  if (left.length)
    throw new Refusal(
      `${andThe(left)} ${left.length === 1 ? 'is' : 'are'} not an ancestor of this checkout's HEAD, so part of the run's result did ` +
        'not land and the run would record a landing that left it out. A person brings it onto the base, then the step is retried.',
    );
  return [
    `#${pr.number} is merged as ${oid.slice(0, 12)}, a merge commit`,
    `\`${onto}\` here holds it, clean, with every branch of \`wf/${id}/\` an ancestor of HEAD`,
  ];
}

/** The verbs, by name. */
const VERBS: Record<string, (args: string[]) => string[]> = { merge, receipt };

/** The whole run: exit 0 with what was done on stdout, 1 with the refusal on stderr, each line under the one tag a landing prints. */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  const act = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  try {
    if (!act) throw new Refusal(`\`${verb}\` is no verb: give merge or receipt`);
    for (const line of act(args)) process.stdout.write(`wf land: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`wf land: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
