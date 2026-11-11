/**
 * `node pull-request.ts <verb>` — the one door through which a run's change reaches GitHub: the push of this run's own branch, and the pull
 * request CI judges. A Bash prefix rule cannot tell `git push origin wf/…` from `git push origin main`, and no agent may type either, so
 * the act is this script, read from the run's frozen carried files (`$WF_CARRIED_FILES`) as `probe.ts` is, and `gh` is denied whole to
 * the agents that run it. It imports its siblings `ci-log.ts`, the pure rules of a failing job's log and of how a check reads, and
 * `exec.ts`, how a command is run and CI waited on, and no other: a run freezes the carried folder whole, so they are beside it wherever
 * it runs.
 *
 * - `open --title <t> --body-file <f> --labels "<rules>"`, which the engineer types once a round after merging the base: it pushes her
 *   branch to `origin` and opens the pull request with the title and body she wrote, or updates the one that is open, never a draft and
 *   never forced, and labels it by the rules from the run's labels as `push --labels` does, in the same call: GitHub has no labelled
 *   create, so the labels are set through REST the moment it answers, before a CI job that reads them can start, and a check that
 *   reads a pull request's labels never sees the run's unlabelled. The rules are her step's note's, rendered from the factory's
 *   parameter, never her own; `--labels` is required, its empty value labelling nothing, and every refusal of the labels comes before
 *   the push. It prints `nemia pr: <url>` last, which goes on her closeout as an artifact value.
 * - `push`, which the round's check runs first: it pushes again, so the commit CI judges is the commit the check judges, then refuses
 *   unless an open, non-draft pull request for this branch, based on the remote's default branch, has `headRefOid` equal to `HEAD`. GitHub
 *   moves a pull request's head a moment after the push it follows, so that head is read again for a bounded few seconds (`HEAD_SECONDS`)
 *   before the refusal: a head that stays elsewhere is still refused, and says how long it was read for. `push --labels "<rules>"` labels
 *   that pull request too, from the run's own labels (`WF_LABELS`, a JSON object of strings the run gives every check and every session):
 *   each rule, the rules apart by whitespace, is `<key>=<value>:<label>`, and gives `<label>` to a run whose label `<key>` is `<value>`.
 *   The labels the rules give the run are added, and any other label a rule could give is removed, so a run relabelled is followed and a
 *   label no rule gives — a person's — is left as it is; each through REST (`issues/<n>/labels`), never `gh pr edit`, and the labels set
 *   are printed. A malformed rule, a `WF_LABELS` that is no JSON object of strings, and a label a rule gives that the repository lacks are
 *   refused before anything is pushed, and so is a run whose labels match none of the rules, a person's, naming each key the rules
 *   read, the values they take and the `nemia label run <run> <key>=<value> --overwrite` that sets one: such a pull request would carry
 *   no label a rule gives, and a check that reads its labels would fail where only the merge finds out. An empty or absent `--labels`
 *   labels nothing, and so does a check with no `WF_LABELS` at all, a run of an older Nemia, saying so.
 * - `wait --check <name>`, which the round's check runs last, `<name>` the CI context branch protection requires of the base branch (the
 *   repository's, so the check gives it): it refuses at once a pull request GitHub says is `CONFLICTING` with its base, on which no CI
 *   would come, naming the merge of the base that answers it (`mergeable`, read again for up to 15 s while GitHub says `UNKNOWN`,
 *   `WF_PR_MERGEABLE_SECONDS`); then it polls the `<name>` context of that head (`gh pr view --json statusCheckRollup`), reading only the
 *   latest run of each check there (`latest`), so a failure a later run of its check superseded is neither judged nor listed, 1800 s for it
 *   to start (`WF_CI_START_SECONDS`) and 2400 s whole (`WF_CI_WAIT_SECONDS`), `WF_CI_POLL_SECONDS` the interval. A read of the pull request
 *   or of its checks that fails — `gh` timing out, exiting non-zero, or answering no JSON — is no verdict: it is read again within the
 *   whole bound, and a read still failing there is a person's refusal, naming the last error. On a red, cancelled or
 *   absent context refuses by name with the Actions URL, the failing jobs, and from each failing job's log the lines that failed it — a
 *   test with its diff, a type or lint error — or a bounded tail where none is, GitHub's post-job lines left out — the next try reads why
 *   CI went red here, since no agent may call `gh` itself — and the `nemia retry <run> <step> --recheck` line, whose step is the check's
 *   own (`WF_STEP`). A job of the context GitHub cut off at its own `timeout-minutes` reads `cancelled` like one cancelled by concurrency
 *   or a person, and only its check run's annotations tell them apart (`gh api repos/{owner}/{repo}/check-runs/<id>/annotations`, read
 *   once per cancelled job), so one marked as having exceeded its maximum execution time is read as `TIMED_OUT`, a red (`timedOut`).
 *   A red it judged — a failure or a time-out, never one only cancelled, skipped or neutral — is not refused at once: the failed jobs
 *   of each workflow run the context's red entries name are re-run, once (`gh run rerun <id> --failed`, which brings back the jobs that
 *   depend on them), and waited on again within the same 2400 s. Once is read from GitHub, never carried: a run is re-run only while
 *   its `run_attempt` (`gh api repos/{owner}/{repo}/actions/runs/<id>`) is 1, so a `--recheck` or a later try never re-runs it again.
 *   Until GitHub has replaced every job it re-ran, the red it still shows is no verdict. The pass, or the refusal, then names the jobs
 *   re-run and how each ended the second time; a re-run still running at the bound is the work's refusal, not the person's, since the
 *   next check reads its verdict. An attempt that cannot be read, a re-run `gh` refuses, or a red entry that is no Actions job means no
 *   re-run, said in one line, and the refusal is as it would have been. A context still absent at half the start bound
 *   (`WF_CI_STUCK_SECONDS` for a test) on a head with a workflow run GitHub queued and never started has that run's workflow dispatched
 *   once on the branch (`dispatchStuck`), waited on within the same start bound; a dispatch GitHub refuses is a person's refusal at once,
 *   naming the command to type. A dispatched run's entry links its run, not a job: its failing jobs are read from the run, re-run and read
 *   as any other.
 *
 * The branch is read from `HEAD`, never given: a run's branch is `wf/<run>/<leaf>` — `wf/<run>/run` for the run's own line of work, one
 * branch per card, and `wf/<run>/<step>` for a fork beside it or a fan-in's merge — and the run it names is what the refusals print.
 * Refuses, exit 1 on stderr with what to do next: a HEAD that is on no such branch or on the remote's default branch; no `origin`; no `gh`
 * on the PATH or none authenticated; a push git rejects, which is answered by merging the base and never by a force; a draft pull request,
 * or one based on another branch; no open pull request where one is owed; a `headRefOid` that is not `HEAD`; a pull request that conflicts
 * with its base; an `open` with no `--labels`; an `open --labels` or a `push --labels` whose rules, `WF_LABELS` or the repository's
 * labels are not as above; a `wait` with no `--check`; and a CI context that is red, cancelled, skipped or never reported. A refusal a
 * change to the branch cannot answer — no `gh` or none authenticated, no `origin`, two open pull requests, a draft or another base, the
 * label rules, `WF_LABELS`, a run whose labels match no rule, or the repository's labels, a `push` or `wait` given other arguments than
 * its check line's, and a CI context never reported, still pending at the bound, or only cancelled (but at its time limit), skipped or
 * neutral — exits 78 instead (`PERSONS_EXIT`, `exec.ts`), the code the `checkFailurePolicy:` of the step whose check runs this names: the
 * run tries the step no more on it and waits on the person, who answers it, then has the check run again.
 *
 * A red the work answers says one thing more where the base is red too: the wait asks GitHub for the commit of the base the head holds
 * (`gh api repos/{owner}/{repo}/compare/<base>...<head>`), reads the CI context there over REST, and where it failed, the refusal says so
 * after its first line, with the base's jobs that did not pass and the merge of the base, so the next try reads the base's failure as
 * the base's. A hint, never a verdict: a read that fails, or a base pending, green or unreported, adds nothing, and the refusal stays
 * the work's, never the person's because of it. A green head's wait asks nothing of the base.
 */
import { PASSED, type Seen, JOBS, checkKey, failures, latest, linkOf, listing, nameOf, pending, seenOf, verdict } from './ci-log.ts';
import {
  PERSONS_EXIT,
  POLL_SECONDS,
  Refusal,
  START_SECONDS,
  WHOLE_SECONDS,
  authed,
  base,
  git,
  noGh,
  run,
  type Ran,
  seconds,
  sleep,
} from './exec.ts';

/**
 * A refusal only a person can answer — the machine, the repository on GitHub, the factory's rules, or CI that never judged — which no
 * change to the branch answers: said as any other, and exit 78 (`PERSONS_EXIT`), which the step's `checkFailurePolicy:` names, so the
 * run waits on the person rather than try the step again.
 */
class PersonsRefusal extends Refusal {}

/**
 * How long, in seconds, the wait reads the pull request's `mergeable` again while GitHub answers `UNKNOWN`, which it does while it
 * computes, before it waits on CI all the same; `WF_PR_MERGEABLE_SECONDS` lowers it for a test. A `CONFLICTING` head is refused at
 * once: GitHub runs no `pull_request` workflow on it, so no CI would come.
 */
const MERGEABLE_SECONDS = 15;

/** How long the wait sleeps between two reads of `mergeable`, in seconds; `WF_PR_MERGEABLE_POLL_SECONDS` lowers it for a test. */
const MERGEABLE_POLL_SECONDS = 3;

/**
 * How long, in seconds, the push reads the pull request's head again for before it refuses one that is not `HEAD`: GitHub moves the head
 * a moment after the push, and a read straight away can refuse a round whose push had landed. It is bounded and
 * short — the check waits on CI for far longer after it — and `WF_PR_HEAD_SECONDS` lowers it for a test.
 */
const HEAD_SECONDS = 30;

/** How long the push sleeps between two reads of the head, in seconds; `WF_PR_HEAD_POLL_SECONDS` lowers it for a test. */
const HEAD_POLL_SECONDS = 3;

/** The most lines the refusal prints of all the failing jobs' logs together. */
const LOG_LINES = 200;

/**
 * The step the `nemia retry` line names where the check's own environment does not say (`WF_STEP`, `src/check/check.ts`): the pushing step
 * of both `build` and `quick`. The branch cannot say it — a run's line of work is named for the run, not for the step that cut it.
 */
const STEP = 'implement';

/**
 * An entry of a head's check rollup, as `gh pr view --json statusCheckRollup` gives one: a check run, or a status context, each field
 * absent where gh exports none. `startedAt` is when a check run started; Go's zero time (`0001-01-01T00:00:00Z`) for one still queued.
 * Apart from `landing.ts`'s on purpose: a re-run of a red is asked by its workflow, so this one reads `workflowName`.
 */
type Entry = Partial<Record<EntryField, string>>;
type EntryField = 'name' | 'context' | 'status' | 'state' | 'conclusion' | 'detailsUrl' | 'targetUrl' | 'workflowName' | 'startedAt';

/**
 * A pull request as this script reads one: what it is and what it is on, then what `pulls` reads of it besides. Apart from
 * `landing.ts`'s, which reads a state and a merge commit, never labels.
 */
type Pr = Opened & { mergeable?: string; labels?: { name: string }[] };
type Opened = { number: number; url: string; isDraft: boolean; baseRefName: string; headRefOid: string };

/** The act this script needs `gh` for, which a refusal names where there is none, whichever call finds it out. */
const OPENING = 'opening the pull request';

/**
 * What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. Apart from
 * `landing.ts`'s on purpose: a missing `gh` here is a person's refusal, exit 78.
 */
function gh(...args: string[]): string {
  const ran = run('gh', args);
  if (ran.missing) throw new PersonsRefusal(noGh(OPENING));
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** Whatever `gh` printed for `args`, failure included: for a read whose failure is said in words, never thrown. */
const read = (...args: string[]): Ran => run('gh', args);

/** `text` parsed as JSON; refuses, naming what was read and what it said, when it does not parse. Apart: it shares `hinted` with reads. */
function parsed<T>(what: string, text: string): T {
  const said = hinted<T>(text);
  if (said === undefined) throw new Refusal(`cannot read ${what}, which is no JSON: ${text.trim().slice(0, 200)}`);
  return said;
}

/**
 * `said` parsed as JSON, a read's output where it passed; `undefined` where it failed or does not parse: for a read that only hints,
 * whose failure is no refusal.
 */
function hinted<T>(said: string | Ran): T | undefined {
  try {
    return JSON.parse(typeof said === 'string' ? said : said.status === 0 ? said.out : '') as T;
  } catch {
    return undefined;
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

/** The remote `origin`'s address; refuses, naming the read, where there is none. Apart from `landing.ts`'s: this one returns it. */
function origin(): string {
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (remote.status !== 0)
    throw new PersonsRefusal(
      'this repository has no `origin` remote, and the pull request is opened on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
  return remote.out.trim();
}

/** The commit `HEAD` is on. */
const head = (): string => git('what commit HEAD is', 'rev-parse', 'HEAD');

/** The open pull requests whose head is `branch`; apart from `landing.ts`'s, which reads every state of the run's branches. */
function pulls(branch: string): Pr[] {
  const fields = 'number,url,isDraft,baseRefName,headRefOid,mergeable,labels';
  return parsed<Pr[]>(`the pull requests of ${branch}`, gh('pr', 'list', '--head', branch, '--state', 'open', '--json', fields));
}

/** The line the engineer types to open the pull request, for a refusal that asks for one. */
const OPEN_LINE =
  'node "$WF_CARRIED_FILES/pull-request.ts" open --title "<the card\'s line>" --body-file "$WF_STEP_FILES/pr-body.md" ' +
  '--labels "<the rules your step\'s note gives>"';

/** The `gh api` form of an edit of a pull request's own fields, for a refusal that asks a person to type one. */
const API_LINE = (n: number, field: string) => `gh api -X PATCH repos/{owner}/{repo}/pulls/${n} -f ${field}`;

/**
 * The one open pull request of `open`, read as this script requires one; refuses a draft, another base, none, or two. Apart from
 * `landing.ts`'s, which tells a merged pull request from an open one instead.
 */
function sole(open: readonly Pr[], branch: string, onto: string): Pr {
  if (open.length === 0)
    throw new Refusal(
      `no open pull request has ${branch} as its head, and CI judges a pull request's head. Open it in your session, after you ` +
        `merged the base, with the script of the run's workflow files:\n  ${OPEN_LINE}`,
    );
  if (open.length > 1)
    throw new PersonsRefusal(
      `${open.length} open pull requests have ${branch} as its head (${open.map((pr) => `#${pr.number}`).join(', ')}), and a run has ` +
        "one: close all but one with `gh pr close <number>`, which is a person's to type, then retry the step with `--recheck`",
    );
  const [pr] = open;
  if (pr.isDraft)
    throw new PersonsRefusal(
      `#${pr.number} is a draft, and a draft is not judged by the CI context branch protection requires. A person marks it ` +
        `ready: \`gh pr ready ${pr.number}\`. Then retry the step with \`--recheck\`.`,
    );
  if (pr.baseRefName !== onto)
    throw new PersonsRefusal(
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

/** A rule of `push --labels`: a run whose label `key` is `value` gets the pull request label `label`. */
type LabelRule = { key: string; value: string; label: string };

/** A rule as written: a key with no `=`, a value with no `:`, and the label, each non-empty and with no whitespace. */
const RULE = /^([^=\s]+)=([^:\s]+):(\S+)$/;

/** The rules of `push --labels`, from its arguments; none where it was given none, or an empty string. Refuses anything else. */
function labelRules(args: readonly string[]): LabelRule[] {
  if (args.length === 0) return [];
  const [flag, given, ...rest] = args;
  if (flag !== '--labels' || given === undefined || rest.length)
    throw new PersonsRefusal(
      'push takes `--labels "<rules>"` and nothing else, each rule `<key>=<value>:<label>` and the rules apart by spaces: give it ' +
        'as the step\'s check gives it, `node "$WF_CARRIED_FILES/pull-request.ts" push --labels "<rules>"`',
    );
  return given
    .split(/\s+/)
    .filter(Boolean)
    .map((rule) => {
      const named = RULE.exec(rule);
      if (!named)
        throw new PersonsRefusal(
          `\`${rule}\` is no rule of --labels, which are each \`<key>=<value>:<label>\` (\`kind=bug:bug\` labels \`bug\` the pull ` +
            "request of a run labelled kind=bug): fix the factory's parameter that gives them, then retry the step with `--recheck`",
        );
      return { key: named[1], value: named[2], label: named[3] };
    });
}

/**
 * The run's own labels, from `WF_LABELS`; `undefined` where the check was given none, which a run of an older Nemia does not. Refuses
 * a value that is no JSON object of strings.
 */
function runLabels(): Record<string, string> | undefined {
  const said = process.env.WF_LABELS;
  if (said === undefined) return undefined;
  const read = hinted<unknown>(said);
  if (typeof read !== 'object' || read === null || Array.isArray(read) || !Object.values(read).every((value) => typeof value === 'string'))
    throw new PersonsRefusal(
      `WF_LABELS is \`${said}\`, not a JSON object of strings such as {"kind":"bug"}: it is the run's labels, which the run gives ` +
        'its check; run the check in a run (`nemia retry <run> <step> --recheck`), or set it so by hand',
    );
  return read as Record<string, string>;
}

/** The labels the repository has, every page of them. */
function repoLabels(): Set<string> {
  const names = gh('api', '--paginate', 'repos/{owner}/{repo}/labels?per_page=100', '--jq', '.[].name');
  return new Set(names.split(/\s*\n\s*/).filter(Boolean));
}

/**
 * What `push --labels` has to set, worked out before anything is pushed: the labels the rules give the run, and every label a rule could
 * give; `undefined` where there is nothing to set. Refuses a label a rule gives that the repository lacks.
 */
function labelPlan(rules: readonly LabelRule[], run: string): { want: Set<string>; givable: Set<string> } | { note: string } | undefined {
  if (rules.length === 0) return undefined;
  const ofRun = runLabels();
  if (ofRun === undefined) return { note: "no label is set: this was given no WF_LABELS, the run's labels, which a later Nemia gives it" };
  if (!rules.some((rule) => Object.hasOwn(ofRun, rule.key) && ofRun[rule.key] === rule.value))
    throw new PersonsRefusal(unmatched(rules, ofRun, run));
  const givable = new Set(rules.map((rule) => rule.label));
  const has = repoLabels();
  const lacking = [...givable].filter((label) => !has.has(label));
  if (lacking.length)
    throw new PersonsRefusal(
      `the repository has no label ${lacking.map((label) => `\`${label}\``).join(', ')}, which --labels gives: create it ` +
        `(${lacking.map((label) => `\`gh label create ${label}\``).join(', ')}), or take it out of the factory's rules, then retry ` +
        'the step with `--recheck`',
    );
  const want = new Set(rules.filter((rule) => Object.hasOwn(ofRun, rule.key) && ofRun[rule.key] === rule.value).map((rule) => rule.label));
  return { want, givable };
}

/**
 * Why a run whose labels match none of `rules` is refused: each key the rules read, the run's value of it and the values the rules take,
 * and the `nemia label run` that sets one. A pull request no rule labels fails a check that reads its labels, found out at the merge.
 */
function unmatched(rules: readonly LabelRule[], ofRun: Record<string, string>, run: string): string {
  const has = (key: string): string => (Object.hasOwn(ofRun, key) ? `${key}=${ofRun[key]}` : `no ${key}`);
  const takes = (key: string): string => `${key}=${rules.flatMap((rule) => (rule.key === key ? [rule.value] : [])).join('|')}`;
  const keys = [...new Set(rules.map((rule) => rule.key))].map((key) => `\n  the run has ${has(key)}; the rules take ${takes(key)}`);
  const fix = `\n  label the run with one, \`nemia label run ${run} <key>=<value> --overwrite\`, then type this again`;
  return `this run's labels match none of the factory's label rules, so its pull request would carry no label:${keys.join('')}${fix}`;
}

/**
 * The labels of `pr` set to `want`, through REST (`issues/<n>/labels`) for the reason `edited` says: what it lacks of `want` added, and
 * what it carries of `givable` and not of `want` removed, a label no rule gives left as it is. The line that says what it set.
 */
function relabelled(pr: Pr, plan: { want: Set<string>; givable: Set<string> }): string {
  const has = new Set((pr.labels ?? []).map((label) => label.name));
  const adding = [...plan.want].filter((label) => !has.has(label));
  const removing = [...has].filter((label) => plan.givable.has(label) && !plan.want.has(label));
  if (adding.length)
    gh('api', '-X', 'POST', `repos/{owner}/{repo}/issues/${pr.number}/labels`, ...adding.flatMap((label) => ['-f', `labels[]=${label}`]));
  for (const label of removing) gh('api', '-X', 'DELETE', `repos/{owner}/{repo}/issues/${pr.number}/labels/${encodeURIComponent(label)}`);
  const set = plan.want.size ? [...plan.want].join(', ') : 'none';
  const moved = [...adding.map((label) => `+${label}`), ...removing.map((label) => `-${label}`)];
  return `#${pr.number} carries the labels its run's give: ${set}${moved.length ? ` (${moved.join(' ')})` : ''}`;
}

/** The `statusCheckRollup` of `number`, as it is now. */
function rollup(number: number): Entry[] {
  const text = gh('pr', 'view', String(number), '--json', 'statusCheckRollup');
  return parsed<{ statusCheckRollup?: Entry[] }>(`the checks of #${number}`, text).statusCheckRollup ?? [];
}

/** The job GitHub's own URL names for `entry` (`…/actions/runs/<run>/job/<id>`); none where its URL names no job. */
const jobIdOf = (entry: Entry): string | undefined => /\/job\/(\d+)/.exec(linkOf(entry))?.[1];

/**
 * The workflow run GitHub's own URL names for `entry`: a job's (`…/actions/runs/<run>/job/<id>`), or the run's own
 * (`…/actions/runs/<run>`), which is what the rollup entry of a run started by `workflow_dispatch` links; none where it is no Actions run.
 */
const runIdOf = (entry: Entry): string | undefined => /\/actions\/runs\/(\d+)(?:[/?#]|$)/.exec(linkOf(entry))?.[1];

/** A job of a workflow run, as `gh api repos/{owner}/{repo}/actions/runs/<id>/jobs` gives one. */
type Job = { id?: number; name?: string; status?: string; conclusion?: string | null; html_url?: string };

/** The jobs of the workflow run `id`, its latest attempt's, as GitHub says; `undefined` where they cannot be read. */
const jobsOf = (id: string): Job[] | undefined =>
  hinted<{ jobs?: Job[] }>(read('api', `repos/{owner}/{repo}/actions/runs/${id}/jobs`))?.jobs;

/**
 * `entry` as the jobs that failed it: itself where it names a job or no Actions run, and where it names only a run — the rollup entry of
 * a run started by `workflow_dispatch` links the run, not a job — that run's jobs that did not pass, read from GitHub, each as an entry
 * linking its job, so their logs are read as a `pull_request` run's are; itself still where none can be read.
 */
function jobsFailing(entry: Entry): Entry[] {
  const id = runIdOf(entry);
  if (jobIdOf(entry) || !id) return [entry];
  const runUrl = linkOf(entry).replace(/(\/actions\/runs\/\d+).*$/, '$1');
  const failed = (jobsOf(id) ?? [])
    .map((job): Entry => ({
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
 * Why CI went red, for the next try to read: each entry of `entries` that did not pass, by name and verdict with its URL; then, for each
 * that names a job, its log read by the job's id (`gh api repos/{owner}/{repo}/actions/jobs/<id>/logs`, which answers where `gh run view
 * --log-failed` prints nothing), headed by the job's name: the lines that failed it with what tells why (`failures`), or its tail where it
 * names none, bounded by `LOG_LINES` in all. The `check` context itself, which may only gather the others, comes last. No agent of this
 * team may call `gh`, so this is the whole of what the next try is handed.
 */
function why(entries: readonly Entry[], check: string): string[] {
  const failed = entries.filter((entry) => !pending(entry) && verdict(entry) !== PASSED).flatMap(jobsFailing);
  const jobs = new Map<string, string>();
  const ordered = [...failed.filter((entry) => nameOf(entry) !== check), ...failed.filter((entry) => nameOf(entry) === check)];
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
    logs.push(
      said.tests ? `${name} (job ${id}), the lines that failed it:` : `${name} (job ${id}), the last ${lines.length} lines of its log:`,
      ...lines,
    );
  }
  return ['the jobs that did not pass:', ...listing(failed), ...logs];
}

/**
 * The mark GitHub leaves on a job it cut off because it ran past its own `timeout-minutes`: the job's conclusion is `cancelled`, as a
 * job cancelled by concurrency or by a person is, and no field of the job or of its check run says otherwise; only an annotation of its
 * check run does, `The job has exceeded the maximum execution time of 45m0s` (as read off public runs; a concurrency's
 * cancel says `Canceling since a higher priority waiting request … exists` there instead).
 */
const TIME_LIMIT = /has exceeded the maximum execution time/;

/** Whether GitHub cut the job `id` off at its time limit, by its check run's annotations, read once per job; unread, it was not. */
const cutOff = (() => {
  const known = new Map<string, boolean>();
  return (id: string): boolean => {
    const was = known.get(id);
    if (was !== undefined) return was;
    const notes = hinted<unknown>(read('api', `repos/{owner}/{repo}/check-runs/${id}/annotations?per_page=100`));
    const marked =
      Array.isArray(notes) &&
      notes.some((note: { message?: unknown } | null) => typeof note?.message === 'string' && TIME_LIMIT.test(note.message));
    known.set(id, marked);
    return marked;
  };
})();

/**
 * `entries` with each cancelled job of the CI context `check` that GitHub cut off at its time limit (`cutOff`) read as GitHub's own
 * conclusion for it, `TIMED_OUT`: a red, the work's, re-run once as any red, since a test that hangs is the change's to answer. A
 * cancelled entry without the mark, or that names no job, stays cancelled, a person's.
 */
const timedOut = (entries: readonly Entry[], check: string): Entry[] =>
  entries.map((entry) => {
    const id = jobIdOf(entry);
    const cancelled = nameOf(entry) === check && !pending(entry) && verdict(entry) === 'CANCELLED';
    return cancelled && id && cutOff(id) ? { ...entry, conclusion: 'TIMED_OUT' } : entry;
  });

/** The options of `open`: the title, the file its body is read from, and the rules it labels by, `--labels ""` giving none. */
function openArgs(args: string[]): { title: string; bodyFile: string; rules: LabelRule[] } {
  const opts = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) opts.set(args[i] ?? '', args[i + 1] ?? '');
  const [title, bodyFile, labels] = ['--title', '--body-file', '--labels'].map((flag) => opts.get(flag));
  if (!title || !bodyFile || labels === undefined || opts.size !== 3 || args.length !== 6)
    throw new Refusal(
      "open takes the title and the body you wrote, which it writes neither of, and the rules your step's note gives, " +
        `\`--labels ""\` where it gives none, each once and nothing else: type the line your note gives,\n  ${OPEN_LINE}`,
    );
  return { title, bodyFile, rules: labelRules(['--labels', labels]) };
}

/** The branch, the run it names and its leaf, with the remote's default branch, every guard of the act passed. */
function placed(): { branch: string; run: string; leaf: string; onto: string } {
  const named = branchOf();
  origin();
  authed(OPENING, PersonsRefusal);
  const onto = base('the pull request', gh);
  if (named.branch === onto)
    throw new Refusal(
      `HEAD is on \`${onto}\`, the remote's default branch, and this script never pushes the base: switch to the run's own branch ` +
        `(\`git switch wf/${named.run}/${named.leaf}\`) and run it again`,
    );
  return { ...named, onto };
}

/**
 * `pr`'s title and body set to `title` and the contents of `bodyFile`, through REST rather than `gh pr edit`: that command's GraphQL
 * query asks for the pull request's project cards, which GitHub refuses since it deprecated Projects (classic), so it fails on a
 * pull request this script has every right to edit. `-F body=@<file>` has `gh` read the file, as `--body-file` did.
 */
function edited(n: number, title: string, bodyFile: string): void {
  gh('api', '-X', 'PATCH', `repos/{owner}/{repo}/pulls/${n}`, '-f', `title=${title}`, '-F', `body=@${bodyFile}`);
}

/**
 * `open`: the branch pushed and the pull request opened or brought up to date, labelled by the rules from the run's labels, and its
 * address last, for the closeout. Every refusal of the labels comes before the push.
 */
function open(args: string[]): string[] {
  const { title, bodyFile, rules } = openArgs(args);
  const { branch, run, onto } = placed();
  const plan = labelPlan(rules, run);
  const already = pulls(branch);
  const standing = already.length ? sole(already, branch, onto) : undefined;
  const said = [pushing(branch)];
  const labelling = (pr: () => Pr): string[] => (plan === undefined ? [] : ['note' in plan ? plan.note : relabelled(pr(), plan)]);
  if (standing) {
    edited(standing.number, title, bodyFile);
    const updated = `#${standing.number} brought up to date with the title and body you wrote`;
    return [...said, updated, ...labelling(() => standing), standing.url];
  }
  const printed = gh('pr', 'create', '--base', onto, '--head', branch, '--title', title, '--body-file', bodyFile);
  const url = printed.split('\n').at(-1)?.trim() ?? '';
  const number = Number(/\/pull\/(\d+)$/.exec(url)?.[1]);
  const made: Pr = { number, url, isDraft: false, baseRefName: onto, headRefOid: '', labels: [] };
  return [...said, 'opened', ...labelling(() => (number > 0 ? made : sole(pulls(branch), branch, onto))), url];
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

/**
 * `push [--labels "<rules>"]`: the commit CI judges made the commit the check judges, proven by the pull request's head, and the pull
 * request labelled by the rules from the run's labels. Every refusal of the labels comes before the push.
 */
function push(args: string[]): string[] {
  const rules = labelRules(args);
  const { branch, run, onto } = placed();
  const plan = labelPlan(rules, run);
  const said = pushing(branch);
  const at = head();
  const pr = headed(branch, onto, at);
  const proven = `#${pr.number} is at ${at.slice(0, 12)}, the commit this check judges: ${pr.url}`;
  if (plan === undefined) return [said, proven];
  return [said, proven, 'note' in plan ? plan.note : relabelled(pr, plan)];
}

/**
 * Whether a rollup entry is over and judged the commit red: a verdict that is no pass, and not cancelled, skipped or neutral, which judge
 * nothing — CI's or a person's to run again, not the branch's to answer.
 */
const judgedRed = (entry: Entry): boolean => !pending(entry) && ![PASSED, 'CANCELLED', 'SKIPPED', 'NEUTRAL'].includes(verdict(entry));

/** A check run or a status context as REST gives one (`commits/<sha>/check-runs`, `commits/<sha>/status`); apart: it is spread whole. */
type Rest = Partial<Record<string, string>>;

/**
 * A commit's check runs and status contexts as `Entry`s, read over REST. Check runs come lower-case, a conclusion null until one is
 * over, which `pending` and `verdict` read as they read the rollup's, upper-casing; only where a person reads each is named as the
 * rollup names it. The combined status's own `state` is never read: a repository whose CI is all check runs answers `pending` with no
 * status at all. Each read goes through `read`, so a failure is no throw: a read that fails gives no entries. Apart from `landing.ts`'s
 * on purpose: the base's red here is a hint, never a verdict.
 */
function entriesAt(sha: string): Entry[] {
  const at = `repos/{owner}/{repo}/commits/${sha}`;
  const runs = hinted<{ check_runs?: Rest[] }>(read('api', `${at}/check-runs?per_page=100`))?.check_runs ?? [];
  const statuses = hinted<{ statuses?: Rest[] }>(read('api', `${at}/status`))?.statuses ?? [];
  return [...runs, ...statuses].map((r) => ({ ...r, detailsUrl: r.html_url ?? r.details_url, targetUrl: r.target_url ?? undefined }));
}

/**
 * What the refusal of a red `check` says of the base, where `check` is red on `onto` too at the commit the head holds (`compare`'s merge
 * base): that it is, the base's jobs that did not pass, and how to read the head's lines against them. A hint, never a verdict: a read
 * that fails, or a base pending, green or with no `check`, adds nothing, and the refusal is as it was.
 */
function baseRed(pr: Pr, onto: string, check: string): string[] {
  const sha = hinted<{ merge_base_commit?: Rest }>(read('api', `repos/{owner}/{repo}/compare/${onto}...${pr.headRefOid}`))
    ?.merge_base_commit?.sha;
  const entries = sha ? entriesAt(sha) : [];
  if (!sha || seenOf(entries.filter((entry) => nameOf(entry) === check)) !== 'failed') return [];
  return [
    `  \`${check}\` is red on \`${onto}\` too, at ${sha.slice(0, 12)}, the base this head holds: a job failing there fails here whatever`,
    `  this change does, so read the lines below against its jobs that did not pass, and merge \`${onto}\` where it moved since:`,
    ...listing(entries.filter((entry) => !pending(entry) && ![PASSED, 'SKIPPED', 'NEUTRAL'].includes(verdict(entry)))),
    '  git merge main-worktree/HEAD',
  ];
}

/**
 * The refusal of a CI context `check` that gave a verdict this round cannot land on: what it said, where it judged the commit red what
 * the base `onto` says of it (`baseRed`), why, and what to type next; `rerun`, the lines that say what was re-run and how it ended, or
 * why nothing was, after its first line.
 */
const redly = (pr: Pr, check: string, ours: Entry[], entries: Entry[], retry: string, onto: string, rerun: string[] = []): string =>
  [
    `\`${check}\` for #${pr.number} is ${ours.map(verdict).join(', ').toLowerCase()}, so this round is red where it is judged.`,
    ...rerun,
    ...(ours.some(judgedRed) ? baseRed(pr, onto, check) : []),
    `  The Actions URL: ${linkOf(ours[0]) || `${pr.url}/checks`}`,
    ...why(entries, check),
    retry,
  ].join('\n');

/** How a CI entry not over stands, lower-cased; one over, whose re-run GitHub has not shown yet, is awaiting it. */
const stateOf = (entry: Entry): string => (pending(entry) ? (entry.status ?? entry.state ?? '').toLowerCase() : 'awaiting its re-run');

/** The refusal of a CI context `check` that never came, or never finished, within the bound the wait carries. */
function unanswered(seen: Seen, pr: Pr, check: string, ours: Entry[], entries: Entry[], secs: number, tail: string[]): string {
  const checks = `${pr.url}/checks`;
  if (seen === 'pending')
    return [
      `\`${check}\` for #${pr.number} was still ${ours.map(stateOf).join(', ')} after ${secs} s.`,
      `  The Actions URL: ${linkOf(ours[0]) || checks}`,
      ...tail,
    ].join('\n');
  return [
    `no \`${check}\` context was reported for #${pr.number} within ${secs} s, and \`${check}\` is the one context the base branch ` +
      'requires: nothing has judged this commit.',
    `  The Actions URL: ${checks}`,
    ...(entries.length ? why(entries, check) : ['no check at all was reported for this head']),
    ...tail,
  ].join('\n');
}

/**
 * The one open pull request of `branch`, read again while GitHub says its `mergeable` is `UNKNOWN` and the bound is not out; refuses one
 * GitHub says is `CONFLICTING`, naming the merge that answers it. Any other answer, `UNKNOWN` to the end included, is waited on as before.
 */
function unconflicted(branch: string, onto: string, check: string, began: number, retry: string): Pr {
  const whole = seconds('WF_PR_MERGEABLE_SECONDS', MERGEABLE_SECONDS);
  const poll = seconds('WF_PR_MERGEABLE_POLL_SECONDS', MERGEABLE_POLL_SECONDS);
  for (;;) {
    const pr = sole(
      retried(`the pull request of \`${branch}\``, () => pulls(branch), began, retry),
      branch,
      onto,
    );
    const said = (pr.mergeable ?? '').toUpperCase();
    if (said === 'CONFLICTING')
      throw new Refusal(
        `GitHub says #${pr.number} conflicts with its base \`${onto}\`, and it runs no \`pull_request\` workflow on a conflicting ` +
          `head, so no \`${check}\` would come. Merge the base into the run's branch in your session, resolve the conflicts, ` +
          `commit, and open the round again with the script of the run's workflow files:\n  git merge main-worktree/HEAD\n  ${OPEN_LINE}`,
      );
    if (said !== 'UNKNOWN' || Date.now() - began >= whole * 1000) return pr;
    sleep(poll);
  }
}

/**
 * What `value` reads of GitHub, read again while it fails — `gh` timing out, exiting non-zero, or answering no JSON, none of which is a
 * verdict — until the wait's whole bound since `began` (`WF_CI_WAIT_SECONDS`), where the last error is a person's refusal. A person's
 * refusal, such as no `gh` at all, stands at once.
 */
function retried<T>(what: string, value: () => T, began: number, retry: string): T {
  for (;;) {
    try {
      return value();
    } catch (err) {
      if (!(err instanceof Refusal) || err instanceof PersonsRefusal) throw err;
      const whole = seconds('WF_CI_WAIT_SECONDS', WHOLE_SECONDS);
      if (Date.now() - began >= whole * 1000)
        throw new PersonsRefusal(`${what} could not be read from GitHub within ${whole} s; the last read said: ${err.message}\n${retry}`);
      sleep(seconds('WF_CI_POLL_SECONDS', POLL_SECONDS));
    }
  }
}

/** What the wait re-ran of a red head: the workflow runs, their red jobs as they were, and the lines that say why a run was not re-run. */
type Rerun = { runs: string[]; was: Entry[]; lines: string[] };

/**
 * The failed jobs of each workflow run a red entry of `ours`, the CI context's, names re-run, once, where it failed; none asked of a
 * context pending, green, or only cancelled, skipped or neutral. Once: only a run GitHub says is on its first attempt (`run_attempt`), so
 * whichever invocation asks, a run is re-run once at most. A run whose attempt cannot be read, or whose re-run `gh` refuses, is not, and
 * a red entry that names no Actions job cannot be; each is said in a line. `entries`, the head's latest checks, give the jobs re-run.
 */
function rerunOnce(ours: readonly Entry[], entries: readonly Entry[]): Rerun | undefined {
  const red = ours.filter(judgedRed);
  if (seenOf(ours) !== 'failed' || !red.length) return undefined;
  const lines = red.filter((entry) => !runIdOf(entry)).map((entry) => `  not re-run: ${nameOf(entry)} names no job of an Actions run`);
  const runs = [...new Set(red.flatMap((entry) => runIdOf(entry) ?? []))].filter((id) => {
    const attempt = hinted<{ run_attempt?: number }>(read('api', `repos/{owner}/{repo}/actions/runs/${id}`))?.run_attempt;
    const asked = attempt === 1 ? read('run', 'rerun', id, '--failed') : undefined;
    const not = asked
      ? `\`gh run rerun ${id} --failed\` failed: ${asked.err.split('\n')[0]}`
      : `its attempt is ${attempt ?? 'unread'}, not 1`;
    if (asked?.status !== 0) lines.push(`  not re-run: run ${id}, as ${not}`);
    return asked?.status === 0;
  });
  return { runs, was: entries.filter((entry) => judgedRed(entry) && runs.includes(runIdOf(entry) ?? '')), lines };
}

/**
 * Which run of a check `entry` is: its job's id, or, for an entry that links only its workflow run (a dispatched run's), that link and
 * when it started, since a re-run keeps the run's link and starts the job again.
 */
const attemptOf = (entry: Entry): string => jobIdOf(entry) ?? `${linkOf(entry)}@${entry.startedAt ?? ''}`;

/** How a job the wait re-ran ended the second time, by `entries`: empty while GitHub still shows its first time, which is no verdict. */
function second(entries: readonly Entry[], was: Entry): string {
  const now = entries.find((entry) => checkKey(entry) === checkKey(was));
  return !now || attemptOf(now) === attemptOf(was) ? '' : (verdict(now) || now.status || 'no verdict').toLowerCase();
}

/** What the wait re-ran and how each job ended the second time, then why any run was not re-run; nothing where it asked nothing. */
function rerunSaid(rerun: Rerun | undefined, entries: readonly Entry[]): string[] {
  if (!rerun?.runs.length) return rerun?.lines ?? [];
  const jobs = rerun.was.map((was) => `${nameOf(was)}: ${second(entries, was) || 'not replaced yet'}`);
  return [`  re-ran the failed jobs of run ${rerun.runs.join(', ')} once; the second time, ${jobs.join(', ')}`, ...rerun.lines];
}

/** How the CI context's entries `ours` read now, where a job the wait re-ran still shows its first time in `entries`: not over yet. */
const seenAfter = (rerun: Rerun | undefined, entries: readonly Entry[], ours: readonly Entry[]): Seen =>
  rerun?.was.some((was) => !second(entries, was)) ? 'pending' : seenOf(ours);

/** What a refusal at the bound says after the re-run's lines, where a re-run was still running: the work's, answered by no change. */
const RERUNNING =
  "  the next check reads the re-run's own verdict and re-runs nothing again: change nothing for it, and sign off as before";

/** A workflow run of a commit, as `gh run list --commit <sha> --json databaseId,workflowName,status,event` gives one. */
type Listed = { databaseId?: number; workflowName?: string; status?: string; event?: string };

/** What the wait dispatched of a head whose runs never started: the workflows dispatched, and the lines that say what it did and why. */
type Dispatch = { dispatched: string[]; refused: string[]; lines: string[] };

/**
 * The workflow file of the run `id`, by the name `gh workflow run` takes (the last part of the path GitHub gives the run), as GitHub says;
 * `undefined` where it cannot be read.
 */
function fileOf(id: string): string | undefined {
  const at = hinted<{ path?: string }>(read('api', `repos/{owner}/{repo}/actions/runs/${id}`))?.path;
  return at ? (at.split('@')[0] ?? at).split('/').pop() : undefined;
}

/**
 * The inputs `yaml`, a workflow file, requires of a `workflow_dispatch`: each input under its `workflow_dispatch:`'s `inputs:` that says
 * `required: true`. Read by indentation, as no YAML parser is beside this script; a file it cannot read so gives none, and the command
 * it is told then is one GitHub refuses naming the input it lacks.
 */
function requiredInputs(yaml: string): string[] {
  const lines = yaml.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#'));
  const indent = (line: string): number => line.search(/\S/);
  const under = (at: number): number[] => {
    const out: number[] = [];
    for (let i = at + 1; i < lines.length && indent(lines[i] ?? '') > indent(lines[at] ?? ''); i++) out.push(i);
    return out;
  };
  const key = (at: number, word: string): boolean => new RegExp(`^\\s*${word}:\\s*(?:#.*)?$`).test(lines[at] ?? '');
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
 * The workflows of the head `sha` whose run GitHub queued and never started, dispatched once each on `branch`. A run GitHub creates during
 * an incident of its Actions can stay `queued` with no job for good, which `gh run cancel`, its force-cancel and `gh run rerun` all refuse,
 * so no re-run frees it: a `workflow_dispatch` at the branch does, its check runs attaching to the head commit, where the pull request's
 * rollup reads them. A dispatched run checks the branch head, not the merge ref a `pull_request` run checks: the landing's wait on the
 * base branch's own context at the merge commit stays the last word on the merged tree. The workflow is the stuck run's own, read from
 * GitHub (`gh run list --commit`), never a name the template knows. Once is read from GitHub, never carried: a workflow that already has
 * a `workflow_dispatch` run on the head is not dispatched again, so a `--recheck` or a later try never dispatches it twice. A run whose
 * jobs cannot be read is not dispatched, and a dispatch GitHub refuses (no `workflow_dispatch` trigger, a required input, a token that
 * may not) names the stuck run and the command a person types, with `-f` for each input the file requires; each said in a line.
 */
function dispatchStuck(sha: string, branch: string): Dispatch {
  const runs = hinted<Listed[]>(read('run', 'list', '--commit', sha, '--json', 'databaseId,workflowName,status,event'));
  if (!Array.isArray(runs))
    return { dispatched: [], refused: [], lines: [`  not dispatched: the workflow runs of ${sha.slice(0, 12)} could not be read`] };
  const already = new Set(runs.filter((r) => r.event === 'workflow_dispatch').map((r) => r.workflowName ?? ''));
  const done: Dispatch = { dispatched: [], refused: [], lines: [] };
  const handled = new Set<string>();
  for (const r of runs) {
    const name = r.workflowName ?? '';
    if ((r.status ?? '').toLowerCase() !== 'queued' || r.event === 'workflow_dispatch' || r.databaseId === undefined || handled.has(name))
      continue;
    const id = String(r.databaseId);
    const jobs = jobsOf(id);
    if (!jobs) {
      done.lines.push(`  not dispatched: run ${id} of ${name} is queued, and its jobs could not be read`);
      continue;
    }
    if (jobs.some((job) => (job.status ?? '').toLowerCase() !== 'queued')) continue;
    handled.add(name);
    if (already.has(name)) {
      done.lines.push(`  run ${id} of ${name} is queued with no job started, and ${name} was dispatched on this head already: not again`);
      continue;
    }
    const file = fileOf(id) ?? name;
    const command = `gh workflow run ${file} --ref ${branch}`;
    const asked = read('workflow', 'run', file, '--ref', branch);
    if (asked.status === 0) {
      done.dispatched.push(name);
      done.lines.push(`  dispatched ${name} once (\`${command}\`): its run ${id} on this head was queued with no job started`);
      continue;
    }
    const yaml = read('workflow', 'view', file, '--yaml', '--ref', branch);
    const inputs = yaml.status === 0 ? requiredInputs(yaml.out) : [];
    done.refused.push(name);
    done.lines.push(
      `  not dispatched: run ${id} of ${name} is queued with no job started, which no re-run or cancel frees, and \`${command}\` ` +
        `failed: ${asked.err.split('\n')[0]}`,
      '  dispatch it on the branch yourself, giving the workflow a `workflow_dispatch` trigger first where it has none, then retry:',
      `  ${[command, ...inputs.map((input) => `-f ${input}=<value>`)].join(' ')}`,
    );
  }
  return done;
}

/** The CI context `wait` reads, from `--check <name>`; refuses a wait given none, or given anything else. */
function checkOf(args: readonly string[]): string {
  const [flag, name, ...rest] = args;
  if (flag !== '--check' || !name || name.startsWith('--') || rest.length)
    throw new PersonsRefusal(
      'wait takes `--check <name>`, the CI context branch protection requires of the base branch, and nothing else: give it as ' +
        'the step\'s check gives it, `node "$WF_CARRIED_FILES/pull-request.ts" wait --check <name>`',
    );
  return name;
}

/** Whether the wait looks for the head's runs GitHub never started: its context still absent once `stuck` seconds since `began` are out. */
const dispatchDue = (seen: Seen, began: number, stuck: number): boolean => seen === 'absent' && Date.now() - began >= stuck * 1000;

/**
 * The refusal of a context with no verdict where the wait stops, `say` given its tail: the work's while a re-run it asked still runs, since
 * the next check reads that verdict, else the person's; each with `said` and the retry line after it.
 */
const stalled = (rerun: Rerun | undefined, said: string[], retry: string, say: (tail: string[]) => string): Refusal =>
  rerun?.runs.length ? new Refusal(say([...said, RERUNNING, retry])) : new PersonsRefusal(say([...said, retry]));

/** What the wait dispatched, then what it re-ran and how each job ended the second time; nothing where it asked neither. */
const waitSaid = (dispatch: Dispatch | undefined, rerun: Rerun | undefined, entries: readonly Entry[]): string[] => [
  ...(dispatch?.lines ?? []),
  ...rerunSaid(rerun, entries),
];

/**
 * The seconds a context still absent is waited on before the head's runs GitHub never started are looked for (`dispatchStuck`): half the
 * start bound `start`, within it; `WF_CI_STUCK_SECONDS` sets it for a test.
 */
const stuckSeconds = (start: number): number => Math.min(seconds('WF_CI_STUCK_SECONDS', start / 2), start);

/**
 * The seconds the wait waited when it stops on a context with no verdict: `bound`, once it is out, or at once where every dispatch it asked
 * GitHub refused, since nothing is then to come and the person's command is said now; `undefined` while it waits on.
 */
function stopsAt(began: number, bound: number, dispatch: Dispatch | undefined): number | undefined {
  const waited = Date.now() - began;
  if (waited >= bound * 1000) return bound;
  return dispatch?.refused.length && !dispatch.dispatched.length ? Math.floor(waited / 1000) : undefined;
}

/**
 * `wait --check <name>`: that context of the pull request's head, waited out and read, a red re-run once first (`rerunOnce`) within the
 * same bound, and, where the context is still absent at half the start bound, each workflow of the head GitHub queued and never started
 * dispatched once on the branch (`dispatchStuck`), waited on within the same start bound; its refusal says why CI went red, and what the
 * re-run or the dispatch did.
 */
function wait(args: string[]): string[] {
  const check = checkOf(args);
  const { branch, run: ofRun, onto } = placed();
  const retry = `  Then: nemia retry ${ofRun} ${process.env.WF_STEP || STEP} --recheck`;
  const began = Date.now();
  const pr = unconflicted(branch, onto, check, began, retry);
  const whole = seconds('WF_CI_WAIT_SECONDS', WHOLE_SECONDS);
  const start = Math.min(seconds('WF_CI_START_SECONDS', START_SECONDS), whole);
  const poll = seconds('WF_CI_POLL_SECONDS', POLL_SECONDS);
  const stuck = stuckSeconds(start);
  let rerun: Rerun | undefined;
  let dispatch: Dispatch | undefined;
  for (;;) {
    const entries = timedOut(latest(retried(`the checks of #${pr.number}`, () => rollup(pr.number), began, retry)), check);
    const ours = entries.filter((entry) => nameOf(entry) === check);
    const red = ours.filter(judgedRed);
    rerun ??= rerunOnce(ours, entries);
    const seen = seenAfter(rerun, entries, ours);
    dispatch ??= dispatchDue(seen, began, stuck) ? dispatchStuck(pr.headRefOid, branch) : undefined;
    const said = waitSaid(dispatch, rerun, entries);
    if (seen === 'passed') return [...said.map((line) => line.trim()), `\`${check}\` passed on ${pr.headRefOid.slice(0, 12)}: ${pr.url}`];
    if (seen === 'failed') throw new (red.length ? Refusal : PersonsRefusal)(redly(pr, check, ours, entries, retry, onto, said));
    const stopped = stopsAt(began, seen === 'absent' ? start : whole, dispatch);
    if (stopped !== undefined) throw stalled(rerun, said, retry, (tail) => unanswered(seen, pr, check, ours, entries, stopped, tail));
    sleep(poll);
  }
}

/** The verbs, by name, each with the tag its lines are printed under. */
const VERBS: Record<string, { tag: string; act: (args: string[]) => string[] }> = {
  open: { tag: 'nemia pr', act: open },
  push: { tag: 'nemia pr', act: push },
  wait: { tag: 'nemia ci', act: wait },
};

/**
 * The whole run: exit 0 with what was done on stdout, or the refusal on stderr, each line under the verb's tag, with 78 for a person's
 * (`PERSONS_EXIT`) and 1 for any other.
 */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  const named = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  const tag = named?.tag ?? 'nemia pr';
  try {
    if (!named) throw new Refusal(`\`${verb}\` is no verb: give open, push or wait`);
    for (const line of named.act(args)) process.stdout.write(`${tag}: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`${tag}: ${err.message}\n`);
    return err instanceof PersonsRefusal ? PERSONS_EXIT : 1;
  }
}

process.exitCode = main();
