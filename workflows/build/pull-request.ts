/**
 * `node pull-request.ts <verb>` — the one door through which a run's change reaches GitHub: the push of this run's own branch, and the
 * pull request CI judges. A Bash prefix rule cannot tell `git push origin wf/…` from `git push origin main`, and no agent may type
 * either, so the act is this script, read from the run's base as `pictures.ts` and `probe.ts` are, and `gh` is denied whole to the
 * agents that run it.
 *
 * - `open --title <t> --body-file <f>`, which the engineer types once a round after merging the base: it pushes her branch to `origin`
 *   and opens the pull request with the title and body she wrote, or updates the one that is open, never a draft and never forced. It
 *   prints `wf pr: <url>`, which goes on her closeout as an artifact value.
 * - `push`, which the round's check runs first: it pushes again, so the commit CI judges is the commit the check judges, then refuses
 *   unless an open, non-draft pull request for this branch, based on the remote's default branch, has `headRefOid` equal to `HEAD`.
 *   GitHub moves a pull request's head a moment after the push it follows, so that head is read again for a bounded few seconds
 *   (`HEAD_SECONDS`) before the refusal: a head that stays elsewhere is still refused, and says how long it was read for.
 * - `wait`, which the round's check runs last: it refuses at once a pull request GitHub says is `CONFLICTING` with its base, on which
 *   no `ci` would come, naming the merge of the base that answers it (`mergeable`, read again for up to 15 s while GitHub says
 *   `UNKNOWN`, `WF_PR_MERGEABLE_SECONDS`); then it polls the `ci` context of that head (`gh pr view --json statusCheckRollup`), 1800 s
 *   for it to start (`WF_CI_START_SECONDS`) and 2400 s whole (`WF_CI_WAIT_SECONDS`), `WF_CI_POLL_SECONDS` the interval; on a red, cancelled or
 *   absent `ci` refuses by name with the Actions URL, the failing jobs, and from each failing job's log the lines that failed it — a
 *   test with its diff, an e2e page, a type or lint error — or a bounded tail where none is, GitHub's post-job lines left out — the next try reads why CI went red here, since no agent may call `gh` itself — and the `nemia retry <run> <step> --recheck` line, whose step is the
 *   check's own (`WF_STEP`).
 *
 * The branch is read from `HEAD`, never given: a run's branch is `wf/<run>/<leaf>` — `wf/<run>/run` for the run's own line of work, one
 * branch per card, and `wf/<run>/<step>` for a fork beside it or a fan-in's merge — and the run it names is what the refusals print.
 * Refuses, exit 1 on stderr with what to do next: a HEAD that is on no such branch or on the remote's default branch; no `origin`; no
 * `gh` on the PATH or none authenticated; a push git rejects, which is answered by merging the base and never by a force; a draft pull
 * request, or one based on another branch; no open pull request where one is owed; a `headRefOid` that is not `HEAD`; a pull request
 * that conflicts with its base; and a `ci` that is
 * red, cancelled, skipped or never reported.
 */
import { spawnSync } from 'node:child_process';

/** A reason the verb is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** The one context branch protection requires of the base branch, and the only verdict this script reads (`.github/workflows/ci.yml`). */
const CONTEXT = 'ci';

/**
 * How long `ci` has to be reported at all, in seconds: a queue longer than this is a refusal, answered by a `--recheck`.
 * `WF_CI_START_SECONDS` lowers it for a test, on its own, so the two stages of the wait are told apart by a fixture.
 */
const START_SECONDS = 1800;

/**
 * How long the whole wait may take, in seconds, the start included; `WF_CI_WAIT_SECONDS` lowers it for a test. It must stay well under
 * the round check's own deadline (`CHECK_DEADLINE_SECONDS`, 3300 s), which is the whole of the clauses before it as well: a wait longer
 * than what is left of that deadline would be killed by the engine, and the person would get no refusal in words.
 * `pull-request.boundary.test.ts` holds the two numbers against each other.
 */
const WHOLE_SECONDS = 2400;

/**
 * How long, in seconds, the wait reads the pull request's `mergeable` again while GitHub answers `UNKNOWN`, which it does while it
 * computes, before it waits on `ci` all the same; `WF_PR_MERGEABLE_SECONDS` lowers it for a test. A `CONFLICTING` head is refused at
 * once: GitHub runs no `pull_request` workflow on it, so no `ci` would come.
 */
const MERGEABLE_SECONDS = 15;

/** How long the wait sleeps between two reads of `mergeable`, in seconds; `WF_PR_MERGEABLE_POLL_SECONDS` lowers it for a test. */
const MERGEABLE_POLL_SECONDS = 3;

/** How long the wait sleeps between two polls, in seconds. */
const POLL_SECONDS = 15;

/**
 * How long, in seconds, the push reads the pull request's head again for before it refuses one that is not `HEAD`: GitHub moves the head
 * a moment after the push, and a read straight away has refused a round whose push had landed (`#448`, 2026-10-21). It is bounded and
 * short — the check waits on CI for far longer after it — and `WF_PR_HEAD_SECONDS` lowers it for a test.
 */
const HEAD_SECONDS = 30;

/** How long the push sleeps between two reads of the head, in seconds; `WF_PR_HEAD_POLL_SECONDS` lowers it for a test. */
const HEAD_POLL_SECONDS = 3;

/** The most lines the refusal prints of one failing job's log: enough to read, never a log in a closeout. */
const JOB_LINES = 60;

/** The most lines the refusal prints of all the failing jobs' logs together. */
const LOG_LINES = 200;

/** The most lines from the end of a job's log the refusal prints where the log names no failing test: a typecheck, a lint, a build. */
const TAIL_LINES = 30;

/** How far past a line naming a failing test its assertion is looked for, in lines of the log, and how many of them are kept. */
const AFTER_LINES = 30;
const DETAIL_LINES = 14;

/** The most failing jobs the refusal names. */
const JOBS = 10;

/**
 * The step the `nemia retry` line names where the check's own environment does not say (`WF_STEP`, `src/check/check.ts`): the pushing step
 * of both `build` and `quick`. The branch cannot say it — a run's line of work is named for the run, not for the step that cut it.
 */
const STEP = 'implement';

/** How long a call of `git` or `gh` may take, in milliseconds. */
const BOUND = 120_000;

/** The states of a check that is not over: anything else is a verdict. */
const PENDING = new Set(['QUEUED', 'IN_PROGRESS', 'WAITING', 'PENDING', 'REQUESTED', 'EXPECTED']);

/** The one conclusion that is a pass: a skipped, cancelled or neutral `ci` is no verdict to land on. */
const PASSED = 'SUCCESS';

/** An entry of a head's check rollup, as `gh pr view --json statusCheckRollup` gives one: a check run, or a status context. */
type Entry = {
  name?: string;
  context?: string;
  status?: string;
  state?: string;
  conclusion?: string;
  detailsUrl?: string;
  targetUrl?: string;
  workflowName?: string;
};

/** A pull request as this script reads one. */
type Pr = { number: number; url: string; isDraft: boolean; baseRefName: string; headRefOid: string; mergeable?: string };

/** What a command printed: its exit, its streams, and whether there was no such command on the PATH. */
type Ran = { status: number | null; out: string; err: string; missing: boolean };

/** The most bytes a command may print before it is cut off: a test job's whole log runs past `spawnSync`'s default of 1 MiB. */
const OUTPUT_BYTES = 64 * 1024 * 1024;

/** Run `cmd` with `args`, bounded, reading nothing from stdin. */
function run(cmd: string, args: string[]): Ran {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND, maxBuffer: OUTPUT_BYTES });
  const missing = r.error !== undefined && 'code' in r.error && r.error.code === 'ENOENT';
  return { status: r.status, out: r.stdout ?? '', err: (r.stderr ?? '').trim() || (r.error?.message ?? ''), missing };
}

/** What git printed for `args`, trimmed; refuses, saying what could not be told, when git fails. */
function git(what: string, ...args: string[]): string {
  const ran = run('git', args);
  if (ran.status !== 0) throw new Refusal(`cannot tell ${what}, since \`git ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. */
function gh(...args: string[]): string {
  const ran = run('gh', args);
  if (ran.missing)
    throw new Refusal(
      'no `gh` on the PATH, and the pull request is GitHub\'s CLI\'s to open. Install it (https://cli.github.com) and run `gh auth login`',
    );
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** Whatever `gh` printed for `args`, failure included: for a read whose failure is said in words, never thrown. */
const read = (...args: string[]): Ran => run('gh', args);

/** `text` parsed as JSON; refuses, naming what was read, when it does not parse. */
function parsed<T>(what: string, text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Refusal(`cannot read ${what}: ${(err as Error).message}`);
  }
}

/**
 * The branch this workspace is on, with the run it names and its leaf; refuses any other branch. The leaf is `run` for a run's own line of
 * work and a step's name for a fork or a merge, so it is no step to type: the retry line reads the step off `WF_STEP` instead.
 */
function branchOf(): { branch: string; run: string; leaf: string } {
  const head = run('git', ['symbolic-ref', '--short', 'HEAD']);
  const branch = head.status === 0 ? head.out.trim() : '';
  const named = /^wf\/([^/]+)\/([^/]+)$/.exec(branch);
  if (!named)
    throw new Refusal(
      `the branch here is ${branch ? `\`${branch}\`` : 'none'}, not a run's \`wf/<run>/<leaf>\`, and this script pushes a run's own ` +
        "branch and no other: run it from the step's own workspace (`git switch wf/<run>/run`)",
    );
  return { branch, run: named[1], leaf: named[2] };
}

/** `gh auth status` passing; refuses with the one command a person types when it does not. */
function authed(): void {
  const status = read('auth', 'status');
  if (status.missing)
    throw new Refusal(
      'no `gh` on the PATH, and the pull request is GitHub\'s CLI\'s to open. Install it (https://cli.github.com) and run `gh auth login`',
    );
  if (status.status !== 0) throw new Refusal(`\`gh\` is not authenticated here: run \`gh auth login\`. It said: ${status.err}`);
}

/** The remote `origin`'s address; refuses, naming the read, where there is none. */
function origin(): string {
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (remote.status !== 0)
    throw new Refusal(
      'this repository has no `origin` remote, and the pull request is opened on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
  return remote.out.trim();
}

/** The remote's default branch, which every pull request of a run is based on. */
function base(): string {
  const name = parsed<{ defaultBranchRef?: { name?: string } }>(
    "the remote's default branch",
    gh('repo', 'view', '--json', 'defaultBranchRef'),
  ).defaultBranchRef?.name;
  if (!name) throw new Refusal('`gh repo view --json defaultBranchRef` named no default branch: the base of the pull request is unknown');
  return name;
}

/** The commit `HEAD` is on. */
const head = (): string => git('what commit HEAD is', 'rev-parse', 'HEAD');

/** The open pull requests whose head is `branch`. */
function pulls(branch: string): Pr[] {
  const text = gh('pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url,isDraft,baseRefName,headRefOid,mergeable');
  return parsed<Pr[]>(`the pull requests of ${branch}`, text);
}

/** The line the engineer types to open the pull request, for a refusal that asks for one. */
const OPEN_LINE = 'node pull-request.ts open --title "<the card\'s line>" --body-file "$WF_STEP_FILES/pr-body.md"';

/** The `gh api` form of an edit of a pull request's own fields, for a refusal that asks a person to type one. */
const API_LINE = (n: number, field: string) => `gh api -X PATCH repos/{owner}/{repo}/pulls/${n} -f ${field}`;

/** The one open pull request of `open`, read as this script requires one; refuses a draft, another base, none, or two. */
function sole(open: readonly Pr[], branch: string, onto: string): Pr {
  if (open.length === 0)
    throw new Refusal(
      `no open pull request has ${branch} as its head, and CI judges a pull request's head. Open it in your session, after you ` +
        `merged the base, with the script read from the base:\n  ${OPEN_LINE}`,
    );
  if (open.length > 1)
    throw new Refusal(
      `${open.length} open pull requests have ${branch} as its head (${open.map((pr) => `#${pr.number}`).join(', ')}), and a run has ` +
        'one: close all but one with `gh pr close <number>`, which is a person\'s to type, then retry the step with `--recheck`',
    );
  const [pr] = open;
  if (pr.isDraft)
    throw new Refusal(
      `#${pr.number} is a draft, and a draft is not judged by the \`${CONTEXT}\` context branch protection requires. A person marks it ` +
        `ready: \`gh pr ready ${pr.number}\`. Then retry the step with \`--recheck\`.`,
    );
  if (pr.baseRefName !== onto)
    throw new Refusal(
      `#${pr.number} is based on \`${pr.baseRefName}\`, not on the remote's default branch \`${onto}\`, so landing it would not land on ` +
        `the base: a person moves its base (\`gh pr edit ${pr.number} --base ${onto}\`, or \`${API_LINE(pr.number, `base=${onto}`)}\` ` +
        `where \`gh pr edit\` fails on GitHub's deprecated Projects query), then the step is retried with \`--recheck\``,
    );
  return pr;
}

/** `branch` pushed to `origin`, never forced; refuses a push git rejected, naming the merge that answers it. */
function pushing(branch: string): string {
  const pushed = run('git', ['push', 'origin', branch]);
  if (pushed.status !== 0)
    throw new Refusal(
      `\`git push origin ${branch}\` was rejected, and this script never forces a push: ${pushed.err}\n` +
        '  Merge what is on the remote into your branch and push again: `git fetch origin && git merge FETCH_HEAD`, or ' +
        '`git merge main-worktree/HEAD` where the base moved under you.',
    );
  return pushed.err || pushed.out ? (pushed.err || pushed.out).trim().split('\n')[0] : `${branch} is on origin`;
}

/** The name of a rollup entry, a check run's or a status context's. */
const nameOf = (entry: Entry): string => entry.name ?? entry.context ?? '';

/** Whether a rollup entry is not over yet. */
const pending = (entry: Entry): boolean => PENDING.has((entry.status ?? entry.state ?? '').toUpperCase());

/** The verdict of a rollup entry, a check run's conclusion or a status context's state, upper-cased; empty where it has neither. */
const verdict = (entry: Entry): string => (entry.conclusion ?? entry.state ?? '').toUpperCase();

/** Where a person reads the entry: a check run's details, a status context's target. */
const linkOf = (entry: Entry): string => entry.detailsUrl ?? entry.targetUrl ?? '';

/** The `statusCheckRollup` of `number`, as it is now. */
function rollup(number: number): Entry[] {
  const text = gh('pr', 'view', String(number), '--json', 'statusCheckRollup');
  return parsed<{ statusCheckRollup?: Entry[] }>(`the checks of #${number}`, text).statusCheckRollup ?? [];
}

/** The number of seconds `name` holds, or `fallback` where it holds no number. */
function seconds(name: string, fallback: number): number {
  const said = Number(process.env[name]);
  return Number.isFinite(said) && said >= 0 ? said : fallback;
}

/** Sleep `secs` seconds, the thread held, so the poll is one process and no timer outlives it. */
function sleep(secs: number): void {
  if (secs <= 0) return;
  const held = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(held, 0, 0, secs * 1000);
}

/** The job GitHub's own URL names for `entry` (`…/actions/runs/<run>/job/<id>`); none where its URL names no job. */
const jobIdOf = (entry: Entry): string | undefined => /\/job\/(\d+)/.exec(linkOf(entry))?.[1];

/** The byte order mark GitHub opens a job's log with, built from its code so no raw mark sits in this file. */
const BOM = String.fromCharCode(0xfeff);

/** A line of a job's log as GitHub serves it, without the timestamp it prefixes each with and the mark it opens the log with. */
const unstamped = (line: string): string =>
  line
    .replace(/\r$/, '')
    .replace(BOM, '')
    .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z ?/, '');

/** A line without the prefix a tool gave it (turbo's `pkg:test: `), as `failingLines` in `src/check/check.ts` reads one. */
const bare = (line: string): string => line.replace(/^\S+:\S+: /, '');

/** A line without the worker's prefix the e2e gives it (`[w1] `), on top of a tool's (`bare`). */
const unworked = (line: string): string => bare(line).replace(/^\[w\d+\] /, '');

/**
 * Whether `line` fails a job: a test node's reporters name, `✖` (spec) or `not ok ` (TAP) after its indent — never the heading
 * `✖ failing tests:` the spec reporter lists them again under, the rule of `failingLines` (`src/check/check.ts`), copied, since this
 * script imports nothing of the package — or the e2e's `e2e: FAILED — <page>` (`exitOn`, `apps/web/test/e2e/visit.ts`), a TypeScript
 * error (`<path>(<line>,<col>): error TS<n>: …`) or oxlint's ` x <rule>: …` (`×` where it draws).
 */
const failing = (line: string): boolean => {
  const said = unworked(line);
  const test = /^\s*((?:✖|not ok ).*)$/.exec(said);
  if (test !== null) return !test[1].startsWith('✖ failing tests:');
  return said.startsWith('e2e: FAILED — ') || /^\s*\S.*?(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d+: /.test(said) || /^\s*[x×] \S+: /.test(said);
};

/** Whether `line` ends the lines that tell one failing test: the next test, a pass, a summary, the spec reporter's location line. */
const ends = (line: string): boolean => /^\s*(?:✔|ℹ|ok |# Subtest|test at )/.test(bare(line)) || failing(line);

/**
 * Whether `line` tells why a test failed: an error's line (`AssertionError …`, `Error: …`), the diff (`+ actual - expected`, `+`, `-`), or
 * the location oxlint draws under its rule (`,-[src/a.ts:3:7]`, `╭─[…]`).
 */
const detail = (line: string): boolean => {
  const said = bare(line).trim();
  return /^[+-](?:\s|$)/.test(said) || /^(?:,-|╭─)\[/.test(said) || (/error/i.test(said) && !said.startsWith('at '));
};

/**
 * Whether `line` is GitHub's own after the job's steps ran: the post-job cleanup, the git commands it runs there, the orphans it ends.
 * A tail drops them, and everything from `Post job cleanup.` on: none of it says why the job failed.
 */
const postJob = (line: string): boolean => /^(?:Post job cleanup\.?|\[command\]\/usr\/bin\/git |Cleaning up orphan processes)/.test(line.trim());

/**
 * What a failing job's log says of why it failed: each line that fails it (`failing`) once, in order, with the lines after it that tell
 * why (`detail`) — the occurrence that tells most, since the spec reporter prints the test bare where it ran and with its error under
 * `✖ failing tests:`, and the e2e prints its headline again on each stream — bounded by `JOB_LINES`. A log with no such line gives its
 * last `TAIL_LINES` before GitHub's post-job lines (`postJob`) instead.
 */
function failures(log: string): { lines: string[]; tests: boolean } {
  const all = log.split('\n').map(unstamped);
  const told = new Map<string, string[]>();
  all.forEach((line, i) => {
    if (!failing(line)) return;
    const after: string[] = [];
    for (const next of all.slice(i + 1, i + 1 + AFTER_LINES)) {
      if (ends(next)) break;
      if (detail(next) && after.length < DETAIL_LINES) after.push(next);
    }
    const key = unworked(line).trim();
    if ((told.get(key)?.length ?? -1) <= after.length) told.set(key, [line, ...after]);
  });
  if (told.size) return { lines: [...told.values()].flat().slice(0, JOB_LINES), tests: true };
  const cleanup = all.findIndex((line) => /^Post job cleanup\.?$/.test(line.trim()));
  const ran = cleanup === -1 ? all : all.slice(0, cleanup);
  return { lines: ran.filter((line) => line.trim() && !postJob(line)).slice(-TAIL_LINES), tests: false };
}

/**
 * Why CI went red, for the next try to read: each entry of `entries` that did not pass, by name and verdict with its URL; then, for each
 * that names a job, its log read by the job's id (`gh api repos/{owner}/{repo}/actions/jobs/<id>/logs`, which answers where `gh run view
 * --log-failed` prints nothing), headed by the job's name: the lines that failed it with what tells why (`failures`), or its tail where it
 * names none, bounded by `LOG_LINES` in all. The `ci` context itself, which only gathers the others, comes last. No agent of this team may call
 * `gh`, so this is the whole of what the next try is handed.
 */
function why(entries: readonly Entry[]): string[] {
  const failed = entries.filter((entry) => !pending(entry) && verdict(entry) !== PASSED);
  const named = failed.slice(0, JOBS).map((entry) => `  ${nameOf(entry)}: ${verdict(entry) || 'no verdict'} ${linkOf(entry)}`.trimEnd());
  const more = failed.length > named.length ? [`  … and ${failed.length - named.length} more`] : [];
  const jobs = new Map<string, string>();
  const ordered = [...failed.filter((entry) => nameOf(entry) !== CONTEXT), ...failed.filter((entry) => nameOf(entry) === CONTEXT)];
  for (const entry of ordered.slice(0, JOBS)) {
    const id = jobIdOf(entry);
    if (id && !jobs.has(id)) jobs.set(id, nameOf(entry));
  }
  const logs: string[] = [];
  for (const [id, name] of jobs) {
    const left = LOG_LINES - logs.length;
    if (left <= 1) {
      logs.push(`… the logs of the other jobs are cut: \`gh api repos/{owner}/{repo}/actions/jobs/<id>/logs\` reads each`);
      break;
    }
    const api = `gh api repos/{owner}/{repo}/actions/jobs/${id}/logs`;
    const log = read('api', `repos/{owner}/{repo}/actions/jobs/${id}/logs`);
    if (log.status !== 0 || !log.out.trim()) {
      logs.push(`${name} (job ${id}): \`${api}\` gave no log${log.err ? `: ${log.err.split('\n')[0]}` : ''}`);
      continue;
    }
    const said = failures(log.out);
    const lines = said.lines.slice(0, left - 1).map((line) => `  ${line}`);
    logs.push(said.tests ? `${name} (job ${id}), the lines that failed it:` : `${name} (job ${id}), the last ${lines.length} lines of its log:`, ...lines);
  }
  return ['the jobs that did not pass:', ...named, ...more, ...logs];
}

/** The options of `open`: the title and the file its body is read from. */
function openArgs(args: string[]): { title: string; bodyFile: string } {
  const opts: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const [flag, value] = [args[i], args[i + 1]];
    if ((flag !== '--title' && flag !== '--body-file') || !value)
      throw new Refusal(`\`${flag}\` is not an option of open: give --title "<the card's line>" --body-file <file>, each with a value`);
    opts[flag] = value;
  }
  if (!opts['--title'] || !opts['--body-file'])
    throw new Refusal(
      'open takes the title and the body you wrote, and writes neither itself: ' +
        'give `--title "<the card\'s line>" --body-file <a file in your files directory>`',
    );
  return { title: opts['--title'], bodyFile: opts['--body-file'] };
}

/** The branch, the run it names and its leaf, with the remote's default branch, every guard of the act passed. */
function placed(): { branch: string; run: string; leaf: string; onto: string } {
  const named = branchOf();
  origin();
  authed();
  const onto = base();
  if (named.branch === onto)
    throw new Refusal(
      `HEAD is on \`${onto}\`, the remote's default branch, and this script never pushes the base: switch to the run's own branch ` +
        `(\`git switch wf/${named.run}/${named.leaf}\`) and run it again`,
    );
  return { ...named, onto };
}

/**
 * `pr`'s title and body set to `title` and the contents of `bodyFile`, through REST rather than `gh pr edit`: that command's GraphQL
 * query asks for `repository.pullRequest.projectCards`, which GitHub refuses since it deprecated Projects (classic), so it fails on a
 * pull request this script has every right to edit. `-F body=@<file>` has `gh` read the file, as `--body-file` did.
 */
function edited(n: number, title: string, bodyFile: string): void {
  gh('api', '-X', 'PATCH', `repos/{owner}/{repo}/pulls/${n}`, '-f', `title=${title}`, '-F', `body=@${bodyFile}`);
}

/** `open`: the branch pushed and the pull request opened or brought up to date, and its address for the closeout. */
function open(args: string[]): string[] {
  const { title, bodyFile } = openArgs(args);
  const { branch, onto } = placed();
  const already = pulls(branch);
  const standing = already.length ? sole(already, branch, onto) : undefined;
  const said = [pushing(branch)];
  if (standing) {
    const pr = standing;
    edited(pr.number, title, bodyFile);
    return [...said, `#${pr.number} brought up to date with the title and body you wrote`, pr.url];
  }
  const url = gh('pr', 'create', '--base', onto, '--head', branch, '--title', title, '--body-file', bodyFile).split('\n').at(-1) ?? '';
  return [...said, 'opened', url.trim()];
}

/**
 * The one open pull request of `branch`, read again until its head is `at` or the bound is out: GitHub reports the head of a push a
 * moment after it, so the first read after a push that landed can still name the commit before it. Refuses a head that stays elsewhere.
 */
function headed(branch: string, onto: string, at: string): Pr {
  const whole = seconds('WF_PR_HEAD_SECONDS', HEAD_SECONDS);
  const poll = seconds('WF_PR_HEAD_POLL_SECONDS', HEAD_POLL_SECONDS);
  const began = Date.now();
  for (;;) {
    const pr = sole(pulls(branch), branch, onto);
    if (pr.headRefOid === at) return pr;
    const secs = Math.round((Date.now() - began) / 1000);
    if (Date.now() - began >= whole * 1000)
      throw new Refusal(
        `#${pr.number} has ${pr.headRefOid.slice(0, 12)} as its head and this workspace is on ${at.slice(0, 12)}, ${secs} s after the ` +
          `push, so CI's verdict would be for another commit than the one this check judges. Open or update the pull request from this ` +
          `workspace:\n  ${OPEN_LINE}`,
      );
    sleep(poll);
  }
}

/** `push`: the commit CI judges made the commit the check judges, proven by the pull request's head. */
function push(): string[] {
  const { branch, onto } = placed();
  const said = pushing(branch);
  const at = head();
  const pr = headed(branch, onto, at);
  return [said, `#${pr.number} is at ${at.slice(0, 12)}, the commit this check judges: ${pr.url}`];
}

/** How the wait reads the `ci` entries of a head: none reported, none over yet, every one passed, or one that did not. */
type Seen = 'absent' | 'pending' | 'passed' | 'failed';

/** How `ours`, the `ci` entries of the head, read now. */
function seenOf(ours: readonly Entry[]): Seen {
  if (ours.length === 0) return 'absent';
  if (ours.every(pending)) return 'pending';
  return ours.every((entry) => verdict(entry) === PASSED) ? 'passed' : 'failed';
}

/** The refusal of a `ci` that gave a verdict this round cannot land on: what it said, why, and what to type next. */
const redly = (pr: Pr, ours: readonly Entry[], entries: readonly Entry[], retry: string): string =>
  [
    `\`${CONTEXT}\` for #${pr.number} is ${ours.map(verdict).join(', ').toLowerCase()}, so this round is red where it is judged.`,
    `  The Actions URL: ${linkOf(ours[0]) || `${pr.url}/checks`}`,
    ...why(entries),
    retry,
  ].join('\n');

/** The refusal of a `ci` that never came, or never finished, within the bound the wait carries. */
function unanswered(seen: Seen, pr: Pr, ours: readonly Entry[], entries: readonly Entry[], secs: number, retry: string): string {
  const checks = `${pr.url}/checks`;
  if (seen === 'pending')
    return [
      `\`${CONTEXT}\` for #${pr.number} was still ${ours.map((entry) => (entry.status ?? entry.state ?? '').toLowerCase()).join(', ')} after ${secs} s.`,
      `  The Actions URL: ${linkOf(ours[0]) || checks}`,
      retry,
    ].join('\n');
  return [
    `no \`${CONTEXT}\` context was reported for #${pr.number} within ${secs} s, and \`${CONTEXT}\` is the one context the base branch ` +
      'requires: nothing has judged this commit.',
    `  The Actions URL: ${checks}`,
    ...(entries.length ? why(entries) : ['no check at all was reported for this head']),
    retry,
  ].join('\n');
}

/**
 * The one open pull request of `branch`, read again while GitHub says its `mergeable` is `UNKNOWN` and the bound is not out; refuses one
 * GitHub says is `CONFLICTING`, naming the merge that answers it. Any other answer, `UNKNOWN` to the end included, is waited on as before.
 */
function unconflicted(branch: string, onto: string): Pr {
  const whole = seconds('WF_PR_MERGEABLE_SECONDS', MERGEABLE_SECONDS);
  const poll = seconds('WF_PR_MERGEABLE_POLL_SECONDS', MERGEABLE_POLL_SECONDS);
  const began = Date.now();
  for (;;) {
    const pr = sole(pulls(branch), branch, onto);
    const said = (pr.mergeable ?? '').toUpperCase();
    if (said === 'CONFLICTING')
      throw new Refusal(
        [
          `GitHub says #${pr.number} conflicts with its base \`${onto}\`, and it runs no \`pull_request\` workflow on a conflicting ` +
            `head, so no \`${CONTEXT}\` would come. Merge the base into the run's branch in your session, resolve the conflicts, ` +
            'commit, and open the round again with the script read from the base:',
          '  git merge main-worktree/HEAD',
          `  ${OPEN_LINE}`,
        ].join('\n'),
      );
    if (said !== 'UNKNOWN' || Date.now() - began >= whole * 1000) return pr;
    sleep(poll);
  }
}

/** `wait`: the `ci` context of the pull request's head, waited out and read; its refusal says why CI went red. */
function wait(): string[] {
  const { branch, run: ofRun, onto } = placed();
  const retry = `  Then: nemia retry ${ofRun} ${process.env.WF_STEP || STEP} --recheck`;
  const pr = unconflicted(branch, onto);
  const whole = seconds('WF_CI_WAIT_SECONDS', WHOLE_SECONDS);
  const start = Math.min(seconds('WF_CI_START_SECONDS', START_SECONDS), whole);
  const poll = seconds('WF_CI_POLL_SECONDS', POLL_SECONDS);
  const began = Date.now();
  const over = (secs: number): boolean => Date.now() - began >= secs * 1000;
  for (;;) {
    const entries = rollup(pr.number);
    const ours = entries.filter((entry) => nameOf(entry) === CONTEXT);
    const seen = seenOf(ours);
    if (seen === 'passed') return [`\`${CONTEXT}\` passed on ${pr.headRefOid.slice(0, 12)}: ${pr.url}`];
    if (seen === 'failed') throw new Refusal(redly(pr, ours, entries, retry));
    const bound = seen === 'absent' ? start : whole;
    if (over(bound)) throw new Refusal(unanswered(seen, pr, ours, entries, bound, retry));
    sleep(poll);
  }
}

/** The verbs, by name, each with the tag its lines are printed under. */
const VERBS: Record<string, { tag: string; act: (args: string[]) => string[] }> = {
  open: { tag: 'wf pr', act: open },
  push: { tag: 'wf pr', act: () => push() },
  wait: { tag: 'wf ci', act: () => wait() },
};

/** The whole run: exit 0 with what was done on stdout, 1 with the refusal on stderr, each line under the verb's tag. */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  const named = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  const tag = named?.tag ?? 'wf pr';
  try {
    if (!named) throw new Refusal(`\`${verb}\` is no verb: give open, push or wait`);
    for (const line of named.act(args)) process.stdout.write(`${tag}: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`${tag}: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
