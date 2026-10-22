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
 * - `wait`, which the round's check runs last: it polls the `ci` context of that head (`gh pr view --json statusCheckRollup`), 1800 s
 *   for it to start (`WF_CI_START_SECONDS`) and 2400 s whole (`WF_CI_WAIT_SECONDS`), `WF_CI_POLL_SECONDS` the interval; on a red, cancelled or
 *   absent `ci` refuses by name with the Actions URL, the failing jobs, a bounded tail of each failing job's log — the next try reads
 *   why CI went red here, since no agent may call `gh` itself — and the `nemia retry <run> <step> --recheck` line, whose step is the
 *   check's own (`WF_STEP`).
 *
 * The branch is read from `HEAD`, never given: a run's branch is `wf/<run>/<leaf>` — `wf/<run>/run` for the run's own line of work, one
 * branch per card, and `wf/<run>/<step>` for a fork beside it or a fan-in's merge — and the run it names is what the refusals print.
 * Refuses, exit 1 on stderr with what to do next: a HEAD that is on no such branch or on the remote's default branch; no `origin`; no
 * `gh` on the PATH or none authenticated; a push git rejects, which is answered by merging the base and never by a force; a draft pull
 * request, or one based on another branch; no open pull request where one is owed; a `headRefOid` that is not `HEAD`; and a `ci` that is
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

/** The most lines of a failing job's log the refusal prints, from its end: enough to read, never a log in a closeout. */
const LOG_LINES = 40;

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
type Pr = { number: number; url: string; isDraft: boolean; baseRefName: string; headRefOid: string };

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
  const text = gh('pr', 'list', '--head', branch, '--state', 'open', '--json', 'number,url,isDraft,baseRefName,headRefOid');
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

/** The workflow run GitHub's own URLs name in `entries`, as `gh run view` takes it; none where no URL names one. */
const runIdOf = (entries: readonly Entry[]): string | undefined => {
  for (const entry of entries) {
    const found = /\/actions\/runs\/(\d+)/.exec(linkOf(entry));
    if (found) return found[1];
  }
  return undefined;
};

/**
 * Why CI went red, for the next try to read: each entry of `entries` that did not pass, by name and verdict with its URL, and a bounded
 * tail of the failing jobs' log (`gh run view <id> --log-failed`). No agent of this team may call `gh`, so this is the whole of what the
 * next try is handed.
 */
function why(entries: readonly Entry[]): string[] {
  const failed = entries.filter((entry) => !pending(entry) && verdict(entry) !== PASSED);
  const named = failed.slice(0, JOBS).map((entry) => `  ${nameOf(entry)}: ${verdict(entry) || 'no verdict'} ${linkOf(entry)}`.trimEnd());
  const more = failed.length > named.length ? [`  … and ${failed.length - named.length} more`] : [];
  const id = runIdOf(failed.length ? failed : entries);
  if (!id) return ['the jobs that did not pass:', ...named, ...more];
  const log = read('run', 'view', id, '--log-failed');
  const lines = (log.out || log.err).split('\n').filter(Boolean);
  const tail = lines.slice(-LOG_LINES).map((line) => `  ${line}`);
  return [
    'the jobs that did not pass:',
    ...named,
    ...more,
    ...(tail.length
      ? [`the last ${tail.length} lines of \`gh run view ${id} --log-failed\`:`, ...tail]
      : [`\`gh run view ${id} --log-failed\` printed nothing a person may read here`]),
  ];
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

/** `wait`: the `ci` context of the pull request's head, waited out and read; its refusal says why CI went red. */
function wait(): string[] {
  const { branch, run: ofRun, onto } = placed();
  const pr = sole(pulls(branch), branch, onto);
  const retry = `  Then: nemia retry ${ofRun} ${process.env.WF_STEP || STEP} --recheck`;
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
