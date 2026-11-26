/**
 * `node pull-request.ts <verb>` — the one door through which a run's change reaches GitHub: the push of this run's own branch, and the pull
 * request CI judges. A Bash prefix rule cannot tell `git push origin wf/…` from `git push origin main`, and no agent may type either, so
 * the act is this script, read from the run's frozen carried files (`$WF_CARRIED_FILES`) as `probe.ts` is, and `gh` is denied whole to
 * the agents that run it. It imports its siblings `ci-log.ts`, the pure rule of whether a tree declares a CI workflow, and
 * `exec.ts`, how a command is run, and no other: a run freezes the carried folder whole, so they are beside it wherever it runs.
 *
 * - `branch`, which the engineer types once a round after merging the base: it pushes her branch to `origin`, never forced, and makes no
 *   call to GitHub, `git` alone reading the remote's default branch. It prints the repository (`owner/repo`), the head branch, the base
 *   and the commit, which she gives the GitHub server's `create_pull_request` (or `update_pull_request` for the one `list_pull_requests`
 *   finds open for her head): the pull request is hers to open, through the server, never a draft.
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
 * - No verb waits on CI: the CI context of the pull request's head is a condition (`ci`) that `ci-watch.ts`, sdlc's program, writes, and
 *   the round's check holds only what acts and answers in seconds.
 *
 * - `declares-ci`, which the round's `local` check asks: exit 0 where `HEAD`'s tree, or else the remote default branch's as
 *   fetched now, declares a CI workflow under `.github/workflows` (`declaresCi`, `ci-log.ts`), and 1 where neither does, so the check
 *   runs the factory's local check, no context being to come. A change that removes the base's CI workflow is
 *   still waited on: the gate is the base's, and no change turns it off.
 *
 * The branch is read from `HEAD`, never given: a run's branch is `wf/<run>/<leaf>` — `wf/<run>/run` for the run's own line of work, one
 * branch per card, and `wf/<run>/<step>` for a fork beside it or a fan-in's merge — and the run it names is what the refusals print.
 * Refuses, exit 1 on stderr with what to do next: a HEAD that is on no such branch or on the remote's default branch; no `origin`; no `gh`
 * on the PATH or none authenticated; a push git rejects, which is answered by merging the base and never by a force; a draft pull request,
 * or one based on another branch; no open pull request where one is owed; a `headRefOid` that is not `HEAD`; a pull request that conflicts
 * with its base; a `branch` given an argument; a `push --labels` whose rules, `WF_LABELS` or the repository's
 * labels are not as above. A refusal a change to the branch cannot answer — no `gh` or none authenticated, no `origin`, two open
 * pull requests, a draft or another base, the label rules, `WF_LABELS`, a run whose labels match no rule, or the repository's labels, a
 * `push` given other arguments than its check line's — exits 78 instead (`PERSONS_EXIT`, `exec.ts`), the code the `checkFailurePolicy:` of
 * the step whose check runs this names: the run tries the step no more on it and waits on the person, who answers it, then has the check
 * run again.
 */
import { declaresCi } from './ci-log.ts';
import { PERSONS_EXIT, Refusal, authed, base, git, noGh, run, type Ran, seconds, sleep } from './exec.ts';

/**
 * A refusal only a person can answer — the machine, the repository on GitHub, the factory's rules, or CI that never judged — which no
 * change to the branch answers: said as any other, and exit 78 (`PERSONS_EXIT`), which the step's `checkFailurePolicy:` names, so the
 * run waits on the person rather than try the step again.
 */
class PersonsRefusal extends Refusal {}

/**
 * How long, in seconds, the push reads the pull request's head again for before it refuses one that is not `HEAD`: GitHub moves the head
 * a moment after the push, and a read straight away can refuse a round whose push had landed. It is bounded and
 * short — the check waits on CI for far longer after it — and `WF_PR_HEAD_SECONDS` lowers it for a test.
 */
const HEAD_SECONDS = 30;

/** How long the push sleeps between two reads of the head, in seconds; `WF_PR_HEAD_POLL_SECONDS` lowers it for a test. */
const HEAD_POLL_SECONDS = 3;

/**
 * A pull request as this script reads one: what it is and what it is on, then what `pulls` reads of it besides. Apart from
 * `landing.ts`'s, which reads a state and a merge commit, never labels.
 */
type Pr = Opened & { labels?: { name: string }[] };
type Opened = { number: number; url: string; isDraft: boolean; baseRefName: string; headRefOid: string };

/** The act this script needs `gh` for, which a refusal names where there is none, whichever call finds it out. */
const OPENING = 'opening the pull request';

/**
 * What `gh` printed for `args`, trimmed; refuses, naming what it was asked, when `gh` fails or is not there. Apart from
 * `landing.ts`'s on purpose: a missing `gh` here is a person's refusal, exit 78.
 */
function gh(...args: string[]) {
  const ran = run('gh', args);
  if (ran.missing) throw new PersonsRefusal(noGh(OPENING));
  if (ran.status !== 0) throw new Refusal(`\`gh ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out.trim();
}

/** `text` parsed as JSON; refuses, naming what was read and what it said, when it does not parse. Apart: it shares `hinted` with reads. */
function parsed<T>(what: string, text: string) {
  const said = hinted<T>(text);
  if (said === undefined) throw new Refusal(`cannot read ${what}, which is no JSON: ${text.trim().slice(0, 200)}`);
  return said;
}

/**
 * `said` parsed as JSON, a read's output where it passed; `undefined` where it failed or does not parse: for a read that only hints,
 * whose failure is no refusal.
 */
function hinted<T>(said: string | Ran) {
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
function branchOf() {
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
function origin() {
  const remote = run('git', ['remote', 'get-url', 'origin']);
  if (remote.status !== 0)
    throw new PersonsRefusal(
      'this repository has no `origin` remote, and the pull request is opened on it: see `git remote -v`, and add it with ' +
        '`git remote add origin <address>`',
    );
  return remote.out.trim();
}

/** The commit `HEAD` is on. */
const head = () => git('what commit HEAD is', 'rev-parse', 'HEAD');

/** The open pull requests whose head is `branch`; apart from `landing.ts`'s, which reads every state of the run's branches. */
function pulls(branch: string) {
  const fields = 'number,url,isDraft,baseRefName,headRefOid,labels';
  return parsed<Pr[]>(`the pull requests of ${branch}`, gh('pr', 'list', '--head', branch, '--state', 'open', '--json', fields));
}

/**
 * The line the engineer types to push her branch, then what she does with the server, for a refusal that asks for one: the pull request
 * is opened with `create_pull_request` (`owner`, `repo`, `head`, `base`, `title`, `body`, never `draft`) where `list_pull_requests`
 * finds none open for her head, and brought up to date with `update_pull_request` (its pull request's number, `title`, `body`)
 * where it finds one.
 */
const OPEN_LINE =
  'node "$WF_CARRIED_FILES/pull-request.ts" branch, then the GitHub server\'s `create_pull_request` (or `update_pull_request` ' +
  'where `list_pull_requests` finds one open for the head)';

/** The `gh api` form of an edit of a pull request's own fields, for a refusal that asks a person to type one. */
const API_LINE = (n: number, field: string) => `gh api -X PATCH repos/{owner}/{repo}/pulls/${n} -f ${field}`;

/**
 * The one open pull request of `push`, read as this script requires one; refuses a draft, another base, none, or two. Apart from
 * `landing.ts`'s, which tells a merged pull request from an open one instead.
 */
function sole(open: readonly Pr[], branch: string, onto: string) {
  if (open.length === 0)
    throw new Refusal(
      `no open pull request has ${branch} as its head, and CI judges a pull request's head. Open it in your session, after you ` +
        `merged the base, by pushing it and opening it through the server:\n  ${OPEN_LINE}`,
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
  return pr satisfies Pr;
}

/** `branch` pushed to `origin`, never forced; refuses a push git rejected, naming the merge that answers it. */
function pushing(branch: string) {
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
function labelRules(args: readonly string[]) {
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
function runLabels() {
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
function repoLabels() {
  const names = gh('api', '--paginate', 'repos/{owner}/{repo}/labels?per_page=100', '--jq', '.[].name');
  return new Set(names.split(/\s*\n\s*/).filter(Boolean));
}

/**
 * What `push --labels` has to set, worked out before anything is pushed: the labels the rules give the run, and every label a rule could
 * give; `undefined` where there is nothing to set. Refuses a label a rule gives that the repository lacks.
 */
function labelPlan(rules: readonly LabelRule[], run: string) {
  if (rules.length === 0)
    return undefined satisfies { want: Set<string>; givable: Set<string> } | { note: string } | undefined as
      | { want: Set<string>; givable: Set<string> }
      | { note: string }
      | undefined;
  const ofRun = runLabels();
  if (ofRun === undefined)
    return { note: "no label is set: this was given no WF_LABELS, the run's labels, which a later Nemia gives it" } satisfies
      | { want: Set<string>; givable: Set<string> }
      | { note: string }
      | undefined as { want: Set<string>; givable: Set<string> } | { note: string } | undefined;
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
  return { want, givable } satisfies { want: Set<string>; givable: Set<string> } | { note: string } | undefined as
    | { want: Set<string>; givable: Set<string> }
    | { note: string }
    | undefined;
}

/**
 * Why a run whose labels match none of `rules` is refused: each key the rules read, the run's value of it and the values the rules take,
 * and the `nemia label run` that sets one. A pull request no rule labels fails a check that reads its labels, found out at the merge.
 */
function unmatched(rules: readonly LabelRule[], ofRun: Record<string, string>, run: string) {
  const has = (key: string) => (Object.hasOwn(ofRun, key) ? `${key}=${ofRun[key]}` : `no ${key}`);
  const takes = (key: string) => `${key}=${rules.flatMap((rule) => (rule.key === key ? [rule.value] : [])).join('|')}`;
  const keys = [...new Set(rules.map((rule) => rule.key))].map((key) => `\n  the run has ${has(key)}; the rules take ${takes(key)}`);
  const fix = `\n  label the run with one, \`nemia label run ${run} <key>=<value> --overwrite\`, then type this again`;
  return `this run's labels match none of the factory's label rules, so its pull request would carry no label:${keys.join('')}${fix}`;
}

/**
 * The labels of `pr` set to `want`, through REST (`issues/<n>/labels`), never `gh pr edit`, whose GraphQL query asks for the project cards
 * GitHub refuses since it deprecated Projects (classic): what it lacks of `want` added, and
 * what it carries of `givable` and not of `want` removed, a label no rule gives left as it is. The line that says what it set.
 */
function relabelled(pr: Pr, plan: { want: Set<string>; givable: Set<string> }) {
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

/** The branch, the run it names and its leaf, with the remote's default branch, every guard of the act passed. */
function placed() {
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

/** The remote's default branch, as git reads it (`git ls-remote --symref origin HEAD`); refuses where `origin` names none. */
function defaultBranch() {
  const said = git('the remote default branch', 'ls-remote', '--symref', 'origin', 'HEAD');
  const name = /^ref: refs\/heads\/(\S+)\s+HEAD$/m.exec(said)?.[1];
  if (!name) throw new Refusal('`git ls-remote --symref origin HEAD` named no default branch: the base of the pull request is unknown');
  return name;
}

/** `owner/repo` of the GitHub address `url`, as the server's tools take them; the address itself where it is none. */
function repoOf(url: string) {
  const named = /[:/]([^/:]+)\/([^/]+?)(?:\.git)?\/?$/.exec(url);
  return named ? `${named[1]}/${named[2]}` : url;
}

/**
 * `branch`: the run's branch pushed, never forced, and no call to GitHub. It prints what the engineer gives the server's
 * `create_pull_request` and `update_pull_request` — `owner/repo`, the head branch, the base and the commit — and the address of nothing:
 * she opens the pull request herself. Takes no argument.
 */
function branched(args: string[]) {
  if (args.length)
    throw new Refusal(`branch takes no argument, and was given ${args.join(' ')}: type the line your note gives,\n  ${OPEN_LINE}`);
  const named = branchOf();
  const address = origin();
  const onto = defaultBranch();
  if (named.branch === onto)
    throw new Refusal(
      `HEAD is on \`${onto}\`, the remote's default branch, and this script never pushes the base: switch to the run's own branch ` +
        `(\`git switch wf/${named.run}/${named.leaf}\`) and run it again`,
    );
  const pushed = pushing(named.branch);
  return [pushed, `repository ${repoOf(address)}`, `head ${named.branch}`, `base ${onto}`, `commit ${head()}`] satisfies string[];
}

/**
 * The one open pull request of `branch`, read again until its head is `at` or the bound is out: GitHub reports the head of a push a
 * moment after it, so the first read after a push that landed can still name the commit before it. Refuses a head that stays elsewhere.
 */
function headed(branch: string, onto: string, at: string) {
  const whole = seconds('WF_PR_HEAD_SECONDS', HEAD_SECONDS);
  const poll = seconds('WF_PR_HEAD_POLL_SECONDS', HEAD_POLL_SECONDS);
  const began = Date.now();
  for (;;) {
    const pr = sole(pulls(branch), branch, onto);
    if (pr.headRefOid === at) return pr satisfies Pr;
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
function push(args: string[]) {
  const rules = labelRules(args);
  const { branch, run, onto } = placed();
  const plan = labelPlan(rules, run);
  const said = pushing(branch);
  const at = head();
  const pr = headed(branch, onto, at);
  const proven = `#${pr.number} is at ${at.slice(0, 12)}, the commit this check judges: ${pr.url}`;
  if (plan === undefined) return [said, proven] satisfies string[];
  return [said, proven, 'note' in plan ? plan.note : relabelled(pr, plan)] satisfies string[];
}

/**
 * `declares-ci`: passes where `HEAD`'s tree declares a CI workflow (`declaresCi`), or else the remote default branch's, fetched now, so
 * the round's check waits on its context, and refuses, exit 1, where neither declares one, so the check judges the round by the factory's
 * local check in place of a wait on a context that will not come. The base is read only where the head declares none.
 */
function declaresCiAtHead(args: string[]) {
  if (args.length) throw new Refusal(`declares-ci takes nothing, and was given ${args.join(' ')}: type it alone`);
  if (declaresCi(workflowsAt('HEAD'))) return ['HEAD declares a CI workflow in .github/workflows: its context judges the round'];
  const onto = base('the round', gh);
  git(`the remote default branch \`${onto}\``, 'fetch', '-q', 'origin', onto);
  if (declaresCi(workflowsAt('FETCH_HEAD')))
    return [
      `HEAD declares no CI workflow, and \`${onto}\` does: the base's context judges the round, which a change that removes its ` +
        'workflow does not turn off',
    ];
  throw new Refusal(
    `neither HEAD nor \`${onto}\` declares a CI workflow under .github/workflows, so no context will come: the local check judges it`,
  );
}

/** The paths under `.github/workflows` in the tree of `rev`, a revision of this checkout. */
const workflowsAt = (rev: string) => git(`the files of ${rev}`, 'ls-tree', '-r', '--name-only', rev, '--', '.github/workflows').split('\n');

/** The verbs, by name, each with the tag its lines are printed under. */
const VERBS: Record<string, { tag: string; act: (args: string[]) => string[] }> = {
  branch: { tag: 'nemia pr', act: branched },
  push: { tag: 'nemia pr', act: push },
  'declares-ci': { tag: 'nemia ci', act: declaresCiAtHead },
};

/**
 * The whole run: exit 0 with what was done on stdout, or the refusal on stderr, each line under the verb's tag, with 78 for a person's
 * (`PERSONS_EXIT`) and 1 for any other.
 */
function main() {
  const [verb = '', ...args] = process.argv.slice(2);
  const named = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
  const tag = named?.tag ?? 'nemia pr';
  try {
    if (!named) throw new Refusal(`\`${verb}\` is no verb: give branch, push or declares-ci`);
    for (const line of named.act(args)) process.stdout.write(`${tag}: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`${tag}: ${err.message}\n`);
    return err instanceof PersonsRefusal ? PERSONS_EXIT : 1;
  }
}

process.exitCode = main();
