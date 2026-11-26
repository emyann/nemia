/**
 * `node ci-watch.ts --check <name> --wait-on-ci <true|false> [--once]` — sdlc's watch on CI, the program `programs/ci-watch/program.yaml`
 * the daemon keeps running per factory (`$WF_FACTORY`), run from the factory's carried files with `gh`'s sign-in and the program's own
 * session token. It writes the two conditions the steps of `build` and `quick` wait on, so no check waits on CI:
 *
 * - `ci`, CI at the head of the run's pull request: `<name>` is the CI context branch protection requires of the base branch (`ciCheck`).
 *   The round's `ci` (implement) and the land step's, at a head the landing refreshed.
 * - `base-ci`, CI at the merge commit the run landed as on the base branch, where `--wait-on-ci` is true (`landingWaitsOnCi`).
 *
 * Every pass (`WF_CI_WATCH_SECONDS`, 30 s) it lists the factory's runs not finished (`nemia get runs --field-selector
 * status.state!=finished`), and for each step that is checking and waits on one of the conditions it asks `conditionDue` (`ci-write.ts`):
 * the condition is read only once every check before it has passed on this try, so a write never speaks of a head the step's checks have
 * not proved (`push` proves the pull request's head is the step's commit), and never while its session runs. Only then does it read GitHub
 * (`gh`, in the step's workspace) and act on what `headWrite` or `mergeWrite` decide: write `True`; write `False`; write `Unknown` with
 * words, the step waiting; re-run the failed jobs of a red that is not the change's, once; dispatch a workflow run GitHub queued and never
 * started. `--once` runs one pass and ends.
 *
 * **Level-triggered**: nothing is carried between passes. A condition already True or False for the try is left alone; a write equal to
 * the one served is skipped; the one re-run of a red is read from GitHub's `run_attempt`, a dispatch from the runs at the head, so a
 * watcher started again does what the one before it would have done, never a second re-run. A pull request whose head is not the tip
 * of the run's result branch, as git reads it in the step's workspace, is not the step's: nothing is written for it. A read that fails
 * for one run is said on stderr and the pass goes on to the next; `gh` signed out or missing writes nothing, and the steps wait.
 *
 * It polls: the server is reachable over Tailscale only, so no webhook reaches it. A red is told by what GitHub says and what the red
 * jobs' logs say (`failures`, `rerunDue`, `ci-log.ts`): the change's, written `False` with the head, the failing jobs and the Actions
 * address, never the log lines, which the engineer reads through the GitHub server. A repository whose head and base declare no CI
 * workflow is written `True` within one pass, saying the local check judged it.
 *
 * It imports `ci-log.ts`, `ci-write.ts`, `rerun.ts` and `exec.ts`, beside it: the run freezes the carried folder whole.
 */
import { parseArgs } from 'node:util';
import {
  type Check,
  type Landing,
  type Told,
  JOBS,
  PASSED,
  declaresCi,
  failures,
  latest,
  linkOf,
  listing,
  named,
  nameOf,
  noVerdict,
  pending,
  reddened,
  rerunDue,
  seenOf,
  toldOf,
  verdict,
} from './ci-log.ts';
import {
  type Act,
  type Ci,
  type HeadRead,
  type MergeRead,
  type Red,
  type ServedCheck,
  conditionDue,
  headWrite,
  mergeWrite,
} from './ci-write.ts';
import { Refusal, run, seconds, sleep } from './exec.ts';
import { attemptOfRun, jobIdOf, judgedRed, redJobsOf, rerunOnce, runIdOf, toldSaid } from './rerun.ts';

/** A check run or a status context as `gh pr list --json statusCheckRollup` gives one, and as REST's are mapped to (`entriesAt`). */
type Entry = Check;

/** A pull request as the watcher reads it. */
type Pr = {
  number: number;
  url: string;
  state: string;
  baseRefName: string;
  headRefName: string;
  headRefOid: string;
  mergeable?: string;
  mergeCommit?: { oid?: string } | null;
  statusCheckRollup?: Entry[];
};

/** A check of a step's current try as the api serves it, with the condition it waits on where it waits on one. */
type ServedStepCheck = {
  name: string;
  verdict: { result: string } | null;
  condition?: { name: string; try: number; status: 'True' | 'False' | 'Unknown' | null; message: string | null };
};

/** A step of a served run, as far as the watcher reads one. */
type ServedStep = {
  name: string;
  status: string;
  workspace: string | null;
  branch: string | null;
  current: { try: number } | null;
  check: ServedStepCheck | null;
  checks?: ServedStepCheck[];
};

/** A served run, as far as the watcher reads one. */
type ServedRun = { metadata: { name: string }; status: { steps: ServedStep[] } };

/** What the watcher writes of a condition: its status and the words with it. */
type Written = { status: 'True' | 'False' | 'Unknown'; message: string };

/** How many seconds a run GitHub queued at a head waits, never started, before it is dispatched; `WF_CI_STUCK_SECONDS` sets it. */
const STUCK_SECONDS = 900;

/** How many seconds between two passes; `WF_CI_WATCH_SECONDS` sets it. */
const PASS_SECONDS = 30;

/** What starts a message the watcher writes after a dispatch GitHub refused, so that the same refusal is not asked again each pass. */
const REFUSED_DISPATCH = 'not dispatched';

/** The refusal where GitHub could not be read: said on stderr for the run and the pass goes on. */
class Unread extends Refusal {}

/**
 * What `gh` printed for `args` in `cwd`; refuses, naming what was asked, where `gh` fails or is not there.
 * @param cwd The folder `gh` resolves the repository from.
 * @param args The words after `gh`.
 */
function gh(cwd: string, ...args: string[]) {
  const ran = run('gh', args, cwd);
  if (ran.missing) throw new Unread('no `gh` on the PATH: install it (https://cli.github.com) and run `gh auth login`');
  if (ran.status !== 0) throw new Unread(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** `text` parsed as JSON; refuses, naming `what`, where it is none. */
function parsed<T>(what: string, text: string) {
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Unread(`cannot read ${what}, which is no JSON: ${text.trim().slice(0, 200)}`);
  }
}

/** Whatever `gh` printed for `args` in `cwd`, a failure included, for a read whose failure is no refusal. */
const read = (cwd: string, ...args: string[]) => run('gh', args, cwd);

/** `read` parsed as JSON; undefined where it failed or is none. */
function hinted<T>(cwd: string, ...args: string[]) {
  const ran = read(cwd, ...args);
  try {
    return ran.status === 0 ? (JSON.parse(ran.out) as T) : undefined;
  } catch {
    return undefined;
  }
}

/** What GitHub's REST API answers at `repos/{owner}/{repo}/<path>`, parsed; refuses where `gh` fails or the answer is no JSON. */
const api = <T>(cwd: string, path: string) => parsed<T>(`gh api ${path}`, gh(cwd, 'api', `repos/{owner}/{repo}/${path}`));

/** A check run or a status context as REST gives one: lower-case, a field absent or `null` where it has none. */
type Rest = Partial<Record<string, string | null>>;

/**
 * A commit's check runs and status contexts as entries, read over REST: check runs come lower-case, so they are upper-cased here. One
 * page of 100 check runs is read. The combined status's own `state` is never read: a repository whose CI is all check runs answers
 * `pending` with no context in it.
 * @param cwd The folder `gh` resolves the repository from.
 * @param sha The commit.
 */
function entriesAt(cwd: string, sha: string) {
  const runs = api<{ check_runs?: Rest[] }>(cwd, `commits/${sha}/check-runs?per_page=100`).check_runs ?? [];
  const statuses = api<{ statuses?: Rest[] }>(cwd, `commits/${sha}/status`).statuses ?? [];
  return [
    ...runs.map((r) => ({
      name: r.name ?? undefined,
      status: r.status?.toUpperCase(),
      conclusion: r.conclusion?.toUpperCase(),
      detailsUrl: r.html_url ?? r.details_url ?? undefined,
      startedAt: r.started_at ?? undefined,
    })),
    ...statuses.map((s) => ({ context: s.context ?? undefined, state: s.state?.toUpperCase(), targetUrl: s.target_url ?? undefined })),
  ] satisfies Entry[];
}

/**
 * Whether the tree of the commit `ref` declares a CI workflow (`declaresCi`), read over REST; a tree with no `.github/workflows` has none.
 * @param cwd The folder `gh` resolves the repository from.
 * @param ref A commit or a branch.
 */
function declaresAt(cwd: string, ref: string) {
  const ran = read(cwd, 'api', `repos/{owner}/{repo}/contents/.github/workflows?ref=${ref}`);
  if (ran.status !== 0) {
    if (/Not Found|HTTP 404/.test(ran.err)) return false;
    throw new Unread(`cannot tell whether ${ref.slice(0, 12)} declares a CI workflow: ${ran.err}`);
  }
  const files = parsed<{ name?: string }[]>(`the workflows of ${ref.slice(0, 12)}`, ran.out);
  return Array.isArray(files) && declaresCi(files.map((f) => `.github/workflows/${f.name ?? ''}`));
}

/** The job GitHub names in `entry`'s workflow run, as `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs` gives one. */
type Job = { id?: number; name?: string; status?: string; conclusion?: string | null; html_url?: string };

/** The jobs of the workflow run `id`, its latest attempt's; undefined where they cannot be read. */
const jobsOf = (cwd: string, id: string) => hinted<{ jobs?: Job[] }>(cwd, 'api', `repos/{owner}/{repo}/actions/runs/${id}/jobs`)?.jobs;

/**
 * `entry` as the jobs that failed it: itself where it names a job or no Actions run, and where it names only a run — the rollup entry of
 * a run started by `workflow_dispatch` links the run, not a job — that run's jobs that did not pass, each as an entry linking its job.
 */
function jobsFailing(cwd: string, entry: Entry) {
  const id = runIdOf(entry);
  if (jobIdOf(entry) || !id) return [entry];
  const runUrl = linkOf(entry).replace(/(\/actions\/runs\/\d+).*$/, '$1');
  const failed = (jobsOf(cwd, id) ?? [])
    .map((job) => ({
      name: job.name ?? '',
      workflowName: entry.workflowName,
      status: job.status?.toUpperCase(),
      conclusion: job.conclusion?.toUpperCase(),
      detailsUrl: job.html_url ?? `${runUrl}/job/${job.id ?? ''}`,
    }))
    .filter((job) => !pending(job) && verdict(job) !== PASSED && !['SKIPPED', 'NEUTRAL'].includes(verdict(job)));
  return failed.length ? failed : [entry];
}

/**
 * What the log of the red job `job` says of why it failed (`failures`): read only where GitHub concluded it failed, since whose a job
 * timed out or started up wrong is is said by its conclusion alone; `unread` where it names no job or GitHub gives no log.
 */
function readingOf(cwd: string, job: Entry) {
  const id = jobIdOf(job);
  if (verdict(job) !== 'FAILURE' || !id) return 'unread';
  const at = `repos/{owner}/{repo}/actions/jobs/${id}/logs`;
  const flagged = read(cwd, 'api', at, '--allow-escape-sequences');
  const log = flagged.status === 0 && flagged.out.trim() ? flagged : read(cwd, 'api', at);
  if (log.status !== 0 || !log.out.trim()) return 'unread';
  return failures(log.out).tests ? 'failing' : 'bare';
}

/**
 * Whether the red the context `check` judged, its entries `ours` among the commit's latest `entries`, is re-run once or reported now
 * (`rerunDue`), with the line that says why (`toldSaid`): each red job a re-run would bring back, the context's own last and at most
 * `JOBS` of them, told by its conclusion and its log (`toldOf`).
 */
function secondOf(cwd: string, ours: readonly Entry[], entries: readonly Entry[], check: string) {
  const red = redJobsOf(ours, entries).flatMap((entry) => jobsFailing(cwd, entry));
  const jobs = [...red.filter((job) => nameOf(job) !== check), ...red.filter((job) => nameOf(job) === check)].slice(0, JOBS);
  const told = jobs.map((job) => toldOf({ verdict: verdict(job), reading: readingOf(cwd, job) }));
  const all: Told[] = red.length > jobs.length || !jobs.length ? [...told, 'untold'] : told;
  const due = rerunDue(all);
  return { due, line: toldSaid(jobs, all, due) };
}

/**
 * Whose the red `ours` is, by GitHub's `run_attempt` and the jobs' logs: `change` where a red job's log names a line that failed it,
 * `rerun` where none does and a red run is on its first attempt, `again` otherwise.
 */
function redOf(cwd: string, ours: readonly Entry[], entries: readonly Entry[], check: string) {
  const second = secondOf(cwd, ours, entries, check);
  if (second.due === 'report') return { red: 'change' as Red, line: second.line };
  const runs = [...new Set(ours.filter(judgedRed).flatMap((entry) => runIdOf(entry) ?? []))];
  const again: Red = runs.some((id) => attemptOfRun(id) === 1) ? 'rerun' : 'again';
  return { red: again, line: second.line };
}

/**
 * `entries` with each cancelled job of the CI context `check` that GitHub cut off at its time limit read as GitHub's own conclusion for
 * it, `TIMED_OUT`: a red, re-run once as any red. A job cancelled without the mark, or that names no job, stays cancelled.
 */
function timedOut(cwd: string, entries: readonly Entry[], check: string) {
  return entries.map((entry) => {
    const id = jobIdOf(entry);
    if (!(nameOf(entry) === check && !pending(entry) && verdict(entry) === 'CANCELLED' && id)) return entry;
    const notes = hinted<unknown>(cwd, 'api', `repos/{owner}/{repo}/check-runs/${id}/annotations?per_page=100`);
    const marked =
      Array.isArray(notes) &&
      notes.some(
        (note: { message?: unknown } | null) =>
          typeof note?.message === 'string' && /has exceeded the maximum execution time/.test(note.message),
      );
    return marked ? { ...entry, conclusion: 'TIMED_OUT' } : entry;
  });
}

/**
 * How the context `check` reads among `entries`: a context with a verdict that is a pass, a red, or nothing of its own (every run
 * cancelled, or over with only skipped or neutral entries), still running, or not reported.
 */
function ciOf(entries: readonly Entry[], check: string) {
  const ours = named(entries, check);
  const seen = seenOf(ours);
  if (seen === 'failed') return ours.some(judgedRed) ? 'failed' : 'superseded';
  if (seen === 'pending' || seen === 'passed') return seen;
  return 'absent';
}

/**
 * The lines that say the base is red too, where `check` is red on `onto` at the commit the head holds (`compare`'s merge base): the base's
 * jobs that did not pass, and how to read the head's against them. A hint, never a verdict: a read that fails adds nothing.
 */
function baseRed(cwd: string, pr: Pr, check: string) {
  const sha = hinted<{ merge_base_commit?: { sha?: string } }>(
    cwd,
    'api',
    `repos/{owner}/{repo}/compare/${pr.baseRefName}...${pr.headRefOid}`,
  )?.merge_base_commit?.sha;
  if (!sha) return [];
  try {
    const entries = latest(entriesAt(cwd, sha));
    if (ciOf(entries, check) !== 'failed') return [];
    return [
      `  \`${check}\` is red on \`${pr.baseRefName}\` too, at ${sha.slice(0, 12)}, the base this head holds: a job failing there fails here whatever`,
      `  this change does, so read the jobs below against these, and merge \`${pr.baseRefName}\` where it moved since:`,
      ...listing(entries.filter((entry) => !pending(entry) && ![PASSED, 'SKIPPED', 'NEUTRAL'].includes(verdict(entry)))),
      '  git merge main-worktree/HEAD',
    ];
  } catch {
    return [];
  }
}

/**
 * A workflow run of a commit, as `gh run list --commit <sha> --json databaseId,workflowName,status,event,createdAt` gives one.
 */
type Listed = { databaseId?: number; workflowName?: string; status?: string; event?: string; createdAt?: string };

/** The workflow runs of the commit `sha`; undefined where they cannot be read. */
const runsAt = (cwd: string, sha: string) =>
  hinted<Listed[]>(cwd, 'run', 'list', '--commit', sha, '--json', 'databaseId,workflowName,status,event,createdAt');

/**
 * Whether a workflow run of `runs` was queued past the stuck bound and never started, with no run of the head dispatched already: a
 * run GitHub creates during an incident of its Actions can stay `queued` with no job for good.
 */
const stuckIn = (runs: readonly Listed[] | undefined, bound: number) =>
  Array.isArray(runs) &&
  !runs.some((r) => r.event === 'workflow_dispatch') &&
  runs.some((r) => (r.status ?? '').toLowerCase() === 'queued' && Date.now() - Date.parse(r.createdAt ?? '') >= bound * 1000);

/** The workflow file of the run `id`, by the name `gh workflow run` takes; undefined where it cannot be read. */
function fileOf(cwd: string, id: string) {
  const at = hinted<{ path?: string }>(cwd, 'api', `repos/{owner}/{repo}/actions/runs/${id}`)?.path;
  return at ? (at.split('@')[0] ?? at).split('/').pop() : undefined;
}

/**
 * The inputs `yaml`, a workflow file, requires of a `workflow_dispatch`: each input under its `workflow_dispatch:`'s `inputs:` that says
 * `required: true`. Read by indentation, as no YAML parser is beside this script; a file it cannot read so gives none, and the command
 * it is told then is one GitHub refuses naming the input it lacks.
 */
function requiredInputs(yaml: string) {
  const lines = yaml.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
  const indent = (line: string) => line.search(/\S/);
  const under = (at: number) => {
    const out: number[] = [];
    for (let i = at + 1; i < lines.length && indent(lines[i] ?? '') > indent(lines[at] ?? ''); i++) out.push(i);
    return out;
  };
  const key = (at: number, word: string) => new RegExp(`^\\s*${word}:\\s*(?:#.*)?$`).test(lines[at] ?? '');
  const dispatch = lines.findIndex((_, at) => key(at, 'workflow_dispatch'));
  const inputs = dispatch === -1 ? undefined : under(dispatch).find((at) => key(at, 'inputs'));
  const listed = inputs === undefined ? [] : under(inputs);
  const child = Math.min(...listed.map((at) => indent(lines[at] ?? '')));
  const names: string[] = [];
  let current: string | undefined;
  for (const at of listed) {
    const line = lines[at] ?? '';
    if (indent(line) === child) current = /^\s*["']?([\w-]+)["']?:/.exec(line)?.[1];
    else if (current && /^\s*required:\s*true\b/.test(line) && !names.includes(current)) names.push(current);
  }
  return names;
}

/**
 * The workflows of the head `sha` whose run GitHub queued and never started, dispatched once each on `branch`: a `workflow_dispatch` at
 * the branch frees what no re-run or cancel does, its check runs attaching to the head commit, where the pull request's rollup reads
 * them. The workflow is the stuck run's own, read from GitHub, never a name the template knows. A run whose jobs cannot be read is not
 * dispatched, and a dispatch GitHub refuses names the stuck run and the command a person types, with `-f` for each input the file
 * requires. Answers the words for the step's note, and whether any dispatch was made.
 */
function dispatchStuck(cwd: string, sha: string, branch: string) {
  const lines: string[] = [];
  let dispatched = false;
  const handled = new Set<string>();
  for (const r of runsAt(cwd, sha) ?? []) {
    const name = r.workflowName ?? '';
    if ((r.status ?? '').toLowerCase() !== 'queued' || r.event === 'workflow_dispatch' || r.databaseId === undefined || handled.has(name))
      continue;
    const id = String(r.databaseId);
    const jobs = jobsOf(cwd, id);
    if (!jobs) {
      lines.push(`  ${REFUSED_DISPATCH}: run ${id} of ${name} is queued, and its jobs could not be read`);
      continue;
    }
    if (jobs.some((job) => (job.status ?? '').toLowerCase() !== 'queued')) continue;
    handled.add(name);
    const file = fileOf(cwd, id) ?? name;
    const command = `gh workflow run ${file} --ref ${branch}`;
    if (read(cwd, 'workflow', 'run', file, '--ref', branch).status === 0) {
      dispatched = true;
      lines.push(`  dispatched ${name} once (\`${command}\`): its run ${id} on this head was queued with no job started`);
      continue;
    }
    const yaml = read(cwd, 'workflow', 'view', file, '--yaml', '--ref', branch);
    const inputs = yaml.status === 0 ? requiredInputs(yaml.out) : [];
    lines.push(
      `  ${REFUSED_DISPATCH}: run ${id} of ${name} is queued with no job started, which no re-run or cancel frees, and \`${command}\` failed.`,
      `  Dispatch it on the branch yourself, giving the workflow a \`workflow_dispatch\` trigger first where it has none:`,
      `  ${[command, ...inputs.map((input) => `-f ${input}=<value>`)].join(' ')}`,
    );
  }
  return { lines, dispatched };
}

/** The pull requests of `branch`, every state, with what the watcher reads of each. */
const pullsOf = (cwd: string, branch: string) =>
  parsed<Pr[]>(
    `the pull requests of ${branch}`,
    gh(
      cwd,
      'pr',
      'list',
      '--head',
      branch,
      '--state',
      'all',
      '--limit',
      '20',
      '--json',
      'number,url,state,baseRefName,headRefName,headRefOid,mergeable,mergeCommit,statusCheckRollup',
    ),
  );

/** The first twelve characters of a commit. */
const short = (sha: string) => sha.slice(0, 12);

/** What the watcher knows of a step it is asked about: the run, the step's try and its workspace's result branch. */
type Asked = { id: string; step: ServedStep; tried: number; cwd: string; branch: string };

/**
 * The commit the run's result branch is at, as git reads it in the step's own workspace, where that workspace is on the branch;
 * undefined where the step works elsewhere (the land step, in the repository's own checkout, on the base).
 */
function tipOf(a: Asked) {
  if (a.step.branch !== a.branch) return undefined;
  const ran = run('git', ['rev-parse', a.branch], a.cwd);
  return ran.status === 0 ? ran.out.trim() : undefined;
}

/** Whether the api serves the condition as decided for the try: `True` or `False`, which a watcher leaves alone. */
const decidedIn = (served: ServedStepCheck) => served.condition?.status === 'True' || served.condition?.status === 'False';

/** The pull request of `prs` the run stands on: the one merged, or the one open where none is merged; undefined where that is not one. */
const standingOn = (prs: readonly Pr[]) => {
  const merged = prs.filter((pr) => pr.state === 'MERGED');
  const open = prs.filter((pr) => pr.state === 'OPEN');
  return merged.length === 1 ? merged[0] : merged.length === 0 && open.length === 1 ? open[0] : undefined;
};

/** What the pull request `pr` is as `headWrite` reads it: `none` where the run stands on none. */
const pullOf = (pr: Pr | undefined) => {
  if (pr === undefined) return 'none' as const;
  if (pr.state === 'MERGED') return 'merged' as const;
  return (pr.mergeable ?? '').toUpperCase() === 'CONFLICTING' ? ('conflicting' as const) : ('open' as const);
};

/** The words for a run that stands on no pull request of its branch: more than one merged or open, or none. */
const absentSaid = (branch: string, prs: readonly Pr[]) => {
  const merged = prs.filter((pr) => pr.state === 'MERGED').length;
  const open = prs.filter((pr) => pr.state === 'OPEN').length;
  if (merged > 1) return `${merged} pull requests of \`${branch}\` are merged: a person says which landed`;
  if (open > 1) return `${open} pull requests of \`${branch}\` are open, and CI judges one: close the others`;
  return `no pull request of \`${branch}\` is open: open it through the GitHub server (\`create_pull_request\`), as the engineer's note says`;
};

/** The words for a pull request GitHub says conflicts with its base, where no \`pull_request\` workflow runs. */
const conflictSaid = (pr: Pr, check: string) =>
  `GitHub says #${pr.number} conflicts with its base \`${pr.baseRefName}\`, and it runs no \`pull_request\` workflow on a conflicting ` +
  `head, so no \`${check}\` would come. Merge the base into the run's branch, resolve the conflicts, commit, and open the round again:\n  git merge main-worktree/HEAD`;

/** What GitHub says of the context `check` at the head of `pr`: the verdict, the red's kind and a stuck queue. */
function readCi(a: Asked, pr: Pr, check: string, served: ServedStepCheck) {
  const entries = timedOut(a.cwd, latest(pr.statusCheckRollup ?? []), check);
  const ourEntries = named(entries, check);
  const found = ciOf(entries, check);
  const ci: Ci = found === 'absent' && !declaresAt(a.cwd, pr.headRefOid) && !declaresAt(a.cwd, pr.baseRefName) ? 'undeclared' : found;
  const none: { red: Red; line: string } = { red: 'again', line: '' };
  const red = ci === 'failed' ? redOf(a.cwd, ourEntries, entries, check) : none;
  const kept = (served.condition?.message ?? '').includes(REFUSED_DISPATCH);
  const stuck = ci === 'absent' && !kept && stuckIn(runsAt(a.cwd, pr.headRefOid), seconds('WF_CI_STUCK_SECONDS', STUCK_SECONDS));
  return { ci, entries, ourEntries, red, stuck };
}

/**
 * The write for the condition `ci` of the step: what `headWrite` decides of what GitHub says of the run's pull request at the step's
 * head, done, and the condition's status and words where one is to be written.
 */
function judgeHead(a: Asked, served: ServedStepCheck, check: string, due: boolean) {
  const prs = pullsOf(a.cwd, a.branch);
  const pr = standingOn(prs);
  const pull = pullOf(pr);
  const tip = tipOf(a);
  const ours = pr !== undefined && (tip === undefined || tip === pr.headRefOid);
  const base: HeadRead = { due, decided: decidedIn(served), pull, ours, ci: 'absent', red: 'again', stuck: false };
  if (pr === undefined) return headWrite(base) === 'wait' ? { status: 'Unknown' as const, message: absentSaid(a.branch, prs) } : undefined;
  const first = headWrite(base);
  if (pull === 'merged') return first === 'pass' ? { status: 'True' as const, message: `#${pr.number} is merged: ${pr.url}` } : undefined;
  if (first === 'nothing') return undefined;
  if (pull === 'conflicting') return { status: 'False' as const, message: conflictSaid(pr, check) };
  const read = readCi(a, pr, check, served);
  const act = headWrite({ ...base, ci: read.ci, red: read.red.red, stuck: read.stuck });
  const head = `\`${check}\` at ${short(pr.headRefOid)} of #${pr.number}`;
  return headSaid(a, act, { pr, head, check, served, ...read });
}

/** What `judgeHead` read, handed to `headSaid`. */
type HeadReading = {
  pr: Pr;
  ci: Ci;
  ourEntries: Entry[];
  entries: Entry[];
  red: { red: Red; line: string };
  head: string;
  check: string;
  served: ServedStepCheck;
};

/** The words of a head that passed, or that no CI will judge. */
const headPassSaid = ({ pr, ci, head }: HeadReading) =>
  ci === 'undeclared'
    ? `neither ${short(pr.headRefOid)} nor \`${pr.baseRefName}\` declares a CI workflow under .github/workflows, so no context will come: the local check judged it`
    : `${head} passed: ${pr.url}`;

/** The words of a head still to be judged: superseded, pending, or with no context yet. */
function headWaitSaid({ pr, ci, ourEntries, head, check }: HeadReading) {
  const states = ourEntries.map((entry) =>
    pending(entry) ? (entry.status ?? entry.state ?? '').toLowerCase() : verdict(entry).toLowerCase(),
  );
  const checks = linkOf(ourEntries[0] ?? {}) || `${pr.url}/checks`;
  if (ci === 'superseded')
    return `${head} has no verdict of its own: ${states.join(', ')}. A person re-runs it at ${checks}, or pushes again`;
  if (ci === 'pending') return `${head} is still ${states.join(', ')}: ${checks}`;
  return `${head}: no context was reported yet, and \`${check}\` is the one context the base branch requires: ${pr.url}/checks`;
}

/** The act `headWrite` decided done, and what it writes. */
function headSaid(a: Asked, act: Act, r: HeadReading) {
  if (act === 'pass') return { status: 'True' as const, message: headPassSaid(r) };
  if (act === 'dispatch') {
    const done = dispatchStuck(a.cwd, r.pr.headRefOid, a.branch);
    return { status: 'Unknown' as const, message: [`${r.head} was queued by GitHub and never started:`, ...done.lines].join('\n') };
  }
  if (act === 'rerun') {
    const again = rerunOnce(r.ourEntries);
    if (!again?.runs.length) return falsely(a, r, again?.lines ?? []);
    const done = `${r.head} was red, and the failed jobs of run ${again.runs.join(', ')} were re-run once:`;
    return { status: 'Unknown' as const, message: [done, r.red.line, ...again.lines].join('\n') };
  }
  if (act === 'refuse') return falsely(a, r, []);
  if (act === 'wait' && !((r.served.condition?.message ?? '').includes(REFUSED_DISPATCH) && r.ci === 'absent'))
    return { status: 'Unknown' as const, message: headWaitSaid(r) };
  return undefined;
}

/** A red head written `False`: what it says, where the base is red too, the failing jobs and the Actions address. */
function falsely(a: Asked, r: HeadReading, rerun: string[]) {
  const { pr, ourEntries, entries, red, check } = r;
  const failed = entries.filter((entry) => !pending(entry) && verdict(entry) !== PASSED).flatMap((entry) => jobsFailing(a.cwd, entry));
  return {
    status: 'False' as const,
    message: [
      `\`${check}\` for #${pr.number} is ${ourEntries.map(verdict).join(', ').toLowerCase()} at ${short(pr.headRefOid)}, so this round is red where it is judged.`,
      ...(red.line ? [red.line] : []),
      ...rerun,
      ...baseRed(a.cwd, pr, check),
      `  The Actions URL: ${linkOf(ourEntries[0] ?? {}) || `${pr.url}/checks`}`,
      '  The jobs that did not pass (read why through the GitHub server: `actions_list`, `get_job_logs`):',
      ...listing(failed),
    ].join('\n'),
  };
}

/** The pull request the run landed, with its merge commit; undefined with the words that say why where there is none to speak of. */
function mergeOf(a: Asked) {
  const prs = pullsOf(a.cwd, a.branch).filter((pr) => pr.state === 'MERGED');
  if (prs.length !== 1)
    return {
      said: prs.length
        ? `${prs.length} pull requests of \`${a.branch}\` are merged: a person says which landed`
        : `no pull request of \`${a.branch}\` is merged yet`,
    };
  const pr = prs[0];
  const oid = pr?.mergeCommit?.oid;
  if (!pr || !oid) return { said: `#${pr?.number ?? 0} is merged but names no merge commit: read ${pr?.url ?? ''}` };
  const parents = api<{ parents?: unknown[] }>(a.cwd, `commits/${oid}`).parents ?? [];
  if (parents.length < 2)
    return {
      said: `#${pr.number} landed as ${short(oid)}, which has ${parents.length} parent and not the two a merge commit has: it was squashed or rebased, and a person says what to do`,
    };
  return { pr, oid };
}

/** The tree of the commit `sha`, over REST. */
const treeOf = (cwd: string, sha: string) => api<{ commit?: { tree?: { sha?: string } } }>(cwd, `commits/${sha}`).commit?.tree?.sha;

/**
 * The base's tip where it holds `oid`, by GitHub's compare (`ahead` or `identical`), with how `check` reads there; `none` where the tip
 * is `oid` itself, does not hold it, or cannot be read.
 */
function tipAt(cwd: string, oid: string, onto: string, check: string) {
  try {
    const sha = api<{ sha?: string }>(cwd, `commits/${onto}`).sha;
    if (!sha || sha === oid) return { read: 'none' as const };
    const compared = api<{ status?: string }>(cwd, `compare/${oid}...${sha}`).status;
    if (compared !== 'ahead' && compared !== 'identical') return { read: 'none' as const };
    const entries = latest(entriesAt(cwd, sha));
    const seen = ciOf(entries, check);
    return { read: seen === 'passed' ? ('passed' as const) : seen === 'failed' ? ('failed' as const) : ('none' as const), sha, entries };
  } catch (err) {
    if (err instanceof Refusal) return { read: 'none' as const };
    throw err;
  }
}

/** The write for the condition `base-ci` of the step: what `mergeWrite` decides of CI at the run's merge commit, done. */
function judgeMerge(a: Asked, served: ServedStepCheck, check: string, waits: boolean, due: boolean) {
  const base: MergeRead = {
    due,
    decided: decidedIn(served),
    waits,
    merged: false,
    sameTree: false,
    ci: 'absent',
    red: 'again',
    tip: 'none',
  };
  if (mergeWrite(base) === 'nothing') return undefined;
  if (!waits)
    return {
      status: 'True' as const,
      message: `\`${check}\` at the merge on the base branch was not waited on: the factory's \`landingWaitsOnCi\` is false`,
    };
  const found = mergeOf(a);
  if (found.pr === undefined || found.oid === undefined) return { status: 'Unknown' as const, message: found.said ?? '' };
  const { pr, oid } = found;
  const at = `\`${check}\` on \`${pr.baseRefName}\` at ${short(oid)}, the merge of #${pr.number}`;
  const sameTree = treeOf(a.cwd, oid) === treeOf(a.cwd, pr.headRefOid);
  if (sameTree) {
    const act = mergeWrite({ ...base, merged: true, sameTree });
    return mergeSaid(a, act, { pr, oid, at, check, entries: [], ours: [], red: 'again', ci: 'passed', tip: { read: 'none' }, sameTree });
  }
  const read = readMerge(a, pr, oid, check);
  const act = mergeWrite({ ...base, merged: true, sameTree, ci: read.ci, red: read.red, tip: read.tip.read });
  return mergeSaid(a, act, { pr, oid, at, check, sameTree, ...read });
}

/** What GitHub says of the context `check` at the merge commit `oid` of `pr`: the verdict, the red's kind and the base's tip. */
function readMerge(a: Asked, pr: Pr, oid: string, check: string) {
  const entries = latest(entriesAt(a.cwd, oid));
  const ours = named(entries, check);
  const found = ciOf(entries, check);
  const parent = api<{ parents?: { sha?: string }[] }>(a.cwd, `commits/${oid}`).parents?.[0]?.sha ?? `${oid}^1`;
  const ci: Ci = found === 'absent' && !declaresAt(a.cwd, oid) && !declaresAt(a.cwd, parent) ? 'undeclared' : found;
  const tip = ci === 'failed' || ci === 'superseded' ? tipAt(a.cwd, oid, pr.baseRefName, check) : { read: 'none' as const };
  const runs = ci === 'failed' ? [...new Set(ours.filter(judgedRed).flatMap((entry) => runIdOf(entry) ?? []))] : [];
  const red: Red = runs.some((id) => attemptOfRun(id) === 1) ? 'rerun' : 'again';
  return { entries, ours, ci, tip, red };
}

/** What `judgeMerge` read, handed to `mergeSaid`. */
type MergeReading = {
  pr: Pr;
  oid: string;
  at: string;
  check: string;
  entries: Entry[];
  ours: Entry[];
  red: Red;
  ci: Ci;
  tip: ReturnType<typeof tipAt>;
  sameTree: boolean;
};

/** The words of a merge commit that passed, or that no CI judges. */
const mergePassSaid = ({ pr, oid, at, tip, ci, sameTree }: MergeReading) => {
  if (sameTree)
    return `${at} was not waited on again: it has the same tree as ${short(pr.headRefOid)}, the head \`ci\` judged before the merge`;
  if (ci === 'undeclared')
    return `${short(oid)} declares no CI workflow under .github/workflows, nor does its base, so nothing will report a context on the base branch`;
  return ci === 'passed'
    ? `${at} passed`
    : `${at} has no green verdict of its own, and the base's tip ${short(tip.sha ?? '')}, which holds it, passed`;
};

/** The words of a merge commit still to be judged: pending, superseded, or with no context yet. */
function mergeWaitSaid({ pr, oid, at, check, ours, ci }: MergeReading) {
  const states = ours.map((entry) => (pending(entry) ? (entry.status ?? entry.state ?? '').toLowerCase() : verdict(entry).toLowerCase()));
  if (ci === 'pending') return `${at} is still ${states.join(', ')}: ${linkOf(ours[0] ?? {})}`;
  if (ci === 'superseded')
    return `${at} was cancelled, most likely replaced by a newer run of the base's CI; no later commit of the base that holds it has a verdict yet`;
  return `no \`${check}\` was reported on \`${pr.baseRefName}\` at ${short(oid)}, the merge of #${pr.number} yet. Either CI does not run it on pushes to \`${pr.baseRefName}\`, and the factory sets \`landingWaitsOnCi\` false (\`nemia factory upgrade <factory> --set landingWaitsOnCi=false\`), or it has not reported yet`;
}

/** The act `mergeWrite` decided done, and what it writes. */
function mergeSaid(a: Asked, act: Act, r: MergeReading) {
  const { pr, oid, at, check, entries, ours, tip } = r;
  const l: Landing = { number: pr.number, url: pr.url, oid, onto: pr.baseRefName, check };
  const retry = `  Then: nemia retry ${a.id} ${a.step.name}`;
  if (act === 'pass') return { status: 'True' as const, message: mergePassSaid(r) };
  if (act === 'rerun') {
    const again = rerunOnce(ours);
    if (again?.runs.length)
      return { status: 'Unknown' as const, message: `${at} was red, and the failed jobs of run ${again.runs.join(', ')} were re-run once` };
    return { status: 'False' as const, message: [...reddened(l, oid, entries, undefined, again?.lines ?? [], false), retry].join('\n') };
  }
  if (act === 'refuse') {
    const refused =
      r.ci === 'superseded'
        ? reddened(l, tip.sha ?? oid, tip.entries ?? [], noVerdict(ours))
        : reddened(l, oid, entries, undefined, [], true);
    return { status: 'False' as const, message: [...refused, retry].join('\n') };
  }
  return act === 'wait' ? { status: 'Unknown' as const, message: mergeWaitSaid(r) } : undefined;
}

/** The checks of `step` of the current try, with the condition each waits on. */
const checksOf = (step: ServedStep) => step.checks ?? (step.check ? [step.check] : []);

/** The result branch of the run: the branch of the first of its steps on one of `wf/<id>/…`. */
const branchOfRun = (r: ServedRun) =>
  r.status.steps.find((s) => s.branch !== null && s.branch.startsWith(`wf/${r.metadata.name}/`))?.branch ?? undefined;

/** Writes `written` as the condition `name` of the step's try, unless the api serves just that already. */
function write(a: Asked, served: ServedStepCheck, name: string, written: Written) {
  const was = served.condition;
  if (was?.status === written.status && (was.message ?? '') === written.message) return false;
  const ran = run('nemia', [
    'condition',
    a.id,
    a.step.name,
    name,
    '--status',
    written.status,
    '--message',
    written.message,
    '--try',
    String(a.tried),
  ]);
  if (ran.status !== 0) throw new Unread(`\`nemia condition ${a.id} ${a.step.name} ${name}\` failed: ${ran.err}`);
  process.stdout.write(`nemia ci-watch: ${a.id} ${a.step.name} ${name}: ${written.status} for try ${a.tried}\n`);
  return true;
}

/** One condition of one step, read and written; a refusal of the read is said, and the pass goes on. */
function settle(a: Asked, waiting: ServedStepCheck, name: 'ci' | 'base-ci', check: string, waits: boolean) {
  try {
    const written = name === 'ci' ? judgeHead(a, waiting, check, true) : judgeMerge(a, waiting, check, waits, true);
    if (written) write(a, waiting, name, written);
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia ci-watch: ${a.id} ${a.step.name} ${name}: ${err.message}\n`);
  }
}

/**
 * One pass over one served run: each due condition read and acted on. A read that fails for a condition is said and the next goes on.
 * @param served The run as the api serves it.
 * @param check The CI context's name (`ciCheck`).
 * @param waits Whether the factory waits on CI at the merge (`landingWaitsOnCi`).
 */
function passOver(served: ServedRun, check: string, waits: boolean) {
  const branch = branchOfRun(served);
  for (const step of served.status.steps) {
    const checks = checksOf(step);
    const given: ServedCheck[] = checks.map((c) => ({
      name: c.name,
      passed: c.verdict?.result === 'passed',
      condition: c.condition?.name ?? null,
    }));
    for (const name of ['ci', 'base-ci'] as const) {
      const waiting = checks.find((c) => c.condition?.name === name);
      if (!waiting || !conditionDue(step.status === 'checking', given, name)) continue;
      if (!branch || !step.workspace) {
        process.stderr.write(`nemia ci-watch: ${served.metadata.name} ${step.name}: no result branch or workspace to read GitHub from\n`);
        continue;
      }
      const tried = step.current?.try ?? waiting.condition?.try ?? 1;
      settle({ id: served.metadata.name, step, tried, cwd: step.workspace, branch }, waiting, name, check, waits);
    }
  }
}

/** The runs of the factory that are not finished, as the api serves them. */
function unfinished() {
  const factory = process.env.WF_FACTORY;
  const args = ['get', 'runs', ...(factory ? ['-n', factory] : ['-A']), '--field-selector', 'status.state!=finished', '-o', 'json'];
  const ran = run('nemia', args);
  if (ran.status !== 0) throw new Unread(`\`nemia ${args.join(' ')}\` failed: ${ran.err}`);
  return parsed<{ items?: ServedRun[] }>("the factory's runs", ran.out).items ?? [];
}

/** The whole run: the passes, until stopped, or one where `--once` says so. */
function main() {
  const { values } = parseArgs({
    options: { check: { type: 'string' }, 'wait-on-ci': { type: 'string' }, once: { type: 'boolean' } },
    strict: true,
  });
  const check = values.check;
  if (!check) {
    process.stderr.write("nemia ci-watch: give the CI context branch protection requires, `--check <name>` (the factory's `ciCheck`)\n");
    return 1;
  }
  const waitOn = values['wait-on-ci'];
  if (waitOn !== 'true' && waitOn !== 'false') {
    process.stderr.write("nemia ci-watch: give `--wait-on-ci true` or `--wait-on-ci false` (the factory's `landingWaitsOnCi`)\n");
    return 1;
  }
  for (;;) {
    try {
      for (const served of unfinished()) passOver(served, check, waitOn === 'true');
    } catch (err) {
      if (!(err instanceof Refusal)) throw err;
      process.stderr.write(`nemia ci-watch: ${err.message}\n`);
    }
    if (values.once) return 0;
    sleep(seconds('WF_CI_WATCH_SECONDS', PASS_SECONDS));
  }
}

process.exitCode = main();
