/**
 * `node land.ts --github <true|false> --check <name> [--refresh <cmd>] [--derives <paths>] [--install <cmd>] [--local-check <cmd>]
 * [--once]` — sdlc's landing program, the long-lived process (`programs/land/program.yaml`) that lands the factory's runs one at a time,
 * outside any session, and writes the conditions the land steps of `build` and `quick` wait on. A land step is a wait node: it runs no
 * session, and passes once `turn`, `ci`, `landed` and `base-ci` are each written True for its try (`landed` alone with no remote).
 *
 * - **`turn`**, the landing's one slot (`land-write.ts`, `turnWrite`): only one run at a time holds it True with `landed` undecided, the
 *   oldest run first (`status.startedAt`, then name); every other waits, Unknown, naming the run it is behind. Where the factory names a
 *   refresh (`--refresh`, the command that derives the files `--derives` names) and the pull request's head lacks the base, the head is
 *   brought up to the base first (`refresh.ts`, the factory's `--install` run before it) and pushed, so `ci` judges the head that lands.
 * - **`landed`** on GitHub (`landWrite`): the run's own pull request merged with a merge commit at its head, `gh pr merge --merge
 *   --match-head-commit`, its title and description the message, then the repository's checkout fast-forwarded where it is clean on the
 *   base and behind. Only a pull request that is the run's own, mergeable, green at its head, holding the base where the factory refreshes
 *   and leaving no result branch out is merged.
 * - **`landed`** with no remote (`localWrite`): the repository's own checkout, clean on the base, takes every result branch of the run in
 *   one `git merge --no-ff --no-commit`; the local check (`--local-check`) judges the merged tree and the merge is committed, or taken
 *   back and False written. The message: the subject is the first line of the run's brief, the body one line per commit of the result.
 * - **`ci`** and `base-ci` are `ci-watch.ts`'s.
 *
 * **Level-triggered**: each pass reads the api, GitHub and git afresh and carries nothing between passes. Who holds the slot is read from
 * the conditions the api serves, a merge from GitHub or git, a landing a stopped program left staged from the checkout's `MERGE_HEAD`: a
 * pull request already merged, by this program before a restart or by a person, reads as landed, and nothing lands twice. A condition
 * written True or False for the try is never written again, so a person can write one by hand (`nemia condition`). A read that fails for
 * a run is said on stderr and the pass goes on. Each False names what a person does, or the `nemia retry <run> land --recheck` that
 * makes the step's next try.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { type Branch, type Pr, MERGEABLE, gh, greenAt, leftOut, origin, ownWhy, parsed, standing, tips, withCommits } from './landing.ts';
import { conditionDue } from './ci-write.ts';
import { Refusal, base, git, run, seconds, sleep } from './exec.ts';
import { type Checkout, type Pull, landWrite, localWrite, turnWrite } from './land-write.ts';
import { lacksBase, refresh } from './refresh.ts';

/** A check of a step's current try as the api serves it, with the condition it waits on where it waits on one. */
type ServedCheck = {
  name: string;
  verdict: { result: string } | null;
  condition?: { name: string; try: number; status: 'True' | 'False' | 'Unknown' | null; message: string | null };
};

/** A step of a served run, as far as the program reads one. */
type ServedStep = {
  name: string;
  status: string;
  workspace: string | null;
  branch: string | null;
  current: { try: number } | null;
  check: ServedCheck | null;
  checks?: ServedCheck[];
};

/** A served run, as far as the program reads one. */
type ServedRun = {
  metadata: { name: string };
  spec: { repo: string | null; branch: string | null; brief: string };
  status: { startedAt: string | null; steps: ServedStep[] };
};

/** What the program writes of a condition: its status and the words with it. */
type Written = { status: 'True' | 'False' | 'Unknown'; message: string };

/** What the program was started with. */
type Given = { github: boolean; check: string; refresh: string; derives: string; install: string; localCheck: string };

/** How many seconds between two passes; `WF_LAND_SECONDS` sets it. */
const PASS_SECONDS = 30;

/** How many seconds the local check may run on a merged tree; `WF_LAND_CHECK_SECONDS` sets it. */
const CHECK_SECONDS = 1800;

/** The most bytes the local check may print before it is cut off. */
const OUTPUT_BYTES = 64 * 1024 * 1024;

/** The refusal where the world could not be read: said on stderr for the run and the pass goes on. */
class Unread extends Refusal {}

/** The folder the program was started in, which every pass begins in: a run's worktree it read in may be gone by the next. */
const HOME = process.cwd();

/** The first twelve characters of a commit. */
const short = (sha: string) => sha.slice(0, 12);

/** The line a person types to have the land step try again, which a False ends with. */
const retryLine = (id: string) => `Then: nemia retry ${id} land --recheck`;

/** The checks of `step` of the current try, with the condition each waits on. */
const checksOf = (step: ServedStep) => step.checks ?? (step.check ? [step.check] : []);

/** The condition `name` of the step, as served, where the step waits on it. */
const waitOn = (step: ServedStep, name: string) => checksOf(step).find((c) => c.condition?.name === name);

/** Whether each check listed before the first that waits on the condition `name` passed on this try, in order. */
const aheadOf = (checks: readonly ServedCheck[], name: string) => {
  const at = checks.findIndex((c) => c.condition?.name === name);
  return checks.slice(0, at < 0 ? 0 : at).map((c) => c.verdict?.result === 'passed');
};

/** Whether the api serves the condition as decided for the try: `True` or `False`, which the program leaves alone. */
const decidedIn = (served: ServedCheck) => served.condition?.status === 'True' || served.condition?.status === 'False';

/** The folder the run's pull request is read in: the workspace of its first step on one of `wf/<id>/…`, else the repository's. */
const folderOf = (r: ServedRun) =>
  r.status.steps.find((s) => s.workspace !== null && s.branch?.startsWith(`wf/${r.metadata.name}/`))?.workspace ?? r.spec.repo ?? undefined;

/** Whether the run holds the landing's slot: a land step checking, `turn` True for its try and `landed` not decided. */
const holds = (r: ServedRun) =>
  r.status.steps.some((s) => {
    const [turn, landed] = [waitOn(s, 'turn'), waitOn(s, 'landed')];
    return s.status === 'checking' && turn?.condition?.status === 'True' && landed !== undefined && !decidedIn(landed);
  });

/** Writes `written` as the condition `name` of the step's try, unless the api serves just that already. */
function write(id: string, step: ServedStep, served: ServedCheck, name: string, written: Written) {
  const was = served.condition;
  const tried = step.current?.try ?? was?.try ?? 1;
  if (was?.status === written.status && (was.message ?? '') === written.message) return;
  const ran = run('nemia', [
    'condition',
    id,
    step.name,
    name,
    '--status',
    written.status,
    '--message',
    written.message,
    '--try',
    String(tried),
  ]);
  if (ran.status !== 0) throw new Unread(`\`nemia condition ${id} ${step.name} ${name}\` failed: ${ran.err}`);
  process.stdout.write(`nemia land: ${id} ${step.name} ${name}: ${written.status} for try ${tried}\n`);
}

/** Works in `dir` from now on: every read of git and `gh` below is made there. */
function at(dir: string | undefined) {
  if (!dir || !fs.existsSync(dir)) throw new Unread(`the folder ${dir ?? '(none)'} to read the repository in does not exist`);
  process.chdir(dir);
}

/** How the run's pull requests stand as `Pull` says, with the one open pull request and the merge commit where there is one. */
function pullOf(id: string) {
  const { merged, open } = standing(id);
  if (merged.length > 1 || open.length > 1 || (merged.length === 1 && open.length === 1))
    return {
      pull: 'other' as const,
      why: `the run has ${merged.length} merged and ${open.length} open pull requests, and a run lands one`,
    };
  if (merged.length === 1) {
    const oid = merged[0].mergeCommit?.oid;
    if (!oid) return { pull: 'other' as const, why: `#${merged[0].number} is merged but names no merge commit: read ${merged[0].url}` };
    run('git', ['fetch', 'origin']);
    const parents = run('git', ['rev-list', '--parents', '-n', '1', oid]);
    if (parents.status !== 0)
      throw new Unread(`${short(oid)}, the merge commit of #${merged[0].number}, is not in this repository after a fetch`);
    if (parents.out.trim().split(' ').length - 1 < 2)
      return {
        pull: 'other' as const,
        why: `#${merged[0].number} landed as ${short(oid)}, which is not a merge commit: it was squashed or rebased`,
      };
    return { pull: 'merged' as const, pr: merged[0], oid };
  }
  if (open.length === 1) {
    const pull: Pull = (open[0].mergeable ?? '').toUpperCase() === 'CONFLICTING' ? 'conflicting' : 'open';
    return { pull, pr: open[0] };
  }
  return { pull: 'none' as const };
}

/** `commits` of the run's result branches the base lacks, one line each, as the merge's body: its subjects as git holds them. */
const subjectsOf = (named: readonly Branch[], onto: string) =>
  named
    .map((it) => git(`the commits of ${it.branch}`, 'log', '--no-merges', '--reverse', '--format=- %s', `${onto}..${it.branch}`))
    .filter(Boolean)
    .join('\n');

/**
 * The repository's own checkout fast-forwarded onto `origin/<onto>` where it is clean on the base with no merge in progress, and behind
 * it: what was done, in words. Never merges in a person's checkout, and never refuses: the next run's landing brings it up.
 */
function forwarded(repo: string | null, onto: string) {
  if (!repo) return 'the repository has no checkout here to fast-forward';
  const hold = (...args: string[]) => run('git', args, repo);
  if (hold('fetch', 'origin').status !== 0) return `\`git fetch origin\` failed in ${repo}: the checkout is brought up by the next landing`;
  const on = hold('symbolic-ref', '--short', 'HEAD').out.trim();
  const dirty = hold('status', '--porcelain', '--untracked-files=no').out.trim();
  if (on !== onto || dirty || hold('rev-parse', '-q', '--verify', 'MERGE_HEAD').status === 0)
    return `the checkout ${repo} is not clean on \`${onto}\`, so it was not fast-forwarded: the next landing brings it up`;
  if (hold('merge', '--ff-only', `origin/${onto}`).status !== 0)
    return `\`${onto}\` in ${repo} was not fast-forwarded to origin/${onto}: it holds commits upstream does not`;
  return `\`${onto}\` in ${repo} is fast-forwarded to ${short(hold('rev-parse', 'HEAD').out.trim())}`;
}

/** What the program learns of a run's pull request for a pass over its land step, on GitHub. */
function readGithub(served: ServedRun, given: Given, holder: string | undefined) {
  const id = served.metadata.name;
  at(folderOf(served));
  origin();
  const onto = base('the landing', gh);
  const named = tips(id);
  const found = pullOf(id);
  const pr: Pr | undefined = 'pr' in found ? found.pr : undefined;
  const ownNot = pr && found.pull !== 'merged' ? ownWhy(pr, onto, named) : undefined;
  const ours = pr !== undefined && found.pull !== 'merged' && ownNot === undefined;
  return { id, onto, named, found, pr, ownNot, ours, held: holder !== undefined, holder, given };
}

/** The turn: what the program does for `turn`, and the condition it writes for it. */
function turnOf(served: ServedRun, waiting: ServedCheck, given: Given, holder: string | undefined, due: boolean) {
  const r = readGithub(served, given, holder);
  const refreshes = given.refresh !== '';
  const lacks = refreshes && r.ours && r.pr !== undefined && lacksBase(r.onto, r.pr.headRefOid, retryLine(r.id));
  const act = turnWrite({ due, decided: decidedIn(waiting), held: r.held, pull: r.found.pull, ours: r.ours, refreshes, lacksBase: lacks });
  if (act === 'nothing') return undefined;
  if (act === 'pass')
    return {
      status: 'True' as const,
      message:
        r.found.pull === 'merged'
          ? `#${r.pr?.number} is merged already`
          : `the landing's turn: ${short(r.pr?.headRefOid ?? '')} needs no refresh, and ci judges it`,
    };
  if (act === 'wait')
    return {
      status: 'Unknown' as const,
      message: r.held
        ? `waiting behind ${r.holder}, which is landing: one run lands at a time`
        : `no open pull request has a branch of \`wf/${r.id}/\` as its head: the implement step opens it`,
    };
  if (act === 'refuse')
    return {
      status: 'False' as const,
      message: `${('why' in r.found ? r.found.why : r.ownNot) ?? "the pull request is not the run's own"}. Nothing is merged.\n${retryLine(r.id)}`,
    };
  const pr = r.pr!;
  try {
    const head = refresh({
      pr: pr.number,
      branch: pr.headRefName,
      tip: pr.headRefOid,
      onto: r.onto,
      command: given.refresh,
      derives: given.derives,
      install: given.install,
      retry: retryLine(r.id),
    });
    return {
      status: 'True' as const,
      message: head
        ? `the landing's turn: \`${pr.headRefName}\` lacked \`${r.onto}\`, which is merged into it and refreshed (\`${given.refresh}\`); ${short(head)} is pushed, and ci judges it`
        : `the landing's turn: merging \`${r.onto}\` into \`${pr.headRefName}\` changed nothing the refresh derives, so ci judges ${short(pr.headRefOid)} as it is`,
    };
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    return { status: 'False' as const, message: err.message };
  }
}

/** The pull request merged with its title and description as the message, and the checkout fast-forwarded: the condition's word. */
function mergedOn(served: ServedRun, pr: Pr, onto: string) {
  const id = served.metadata.name;
  const said = parsed<{ title: string; body: string }>(`#${pr.number}`, gh('pr', 'view', String(pr.number), '--json', 'title,body'));
  const merged = run('gh', [
    'pr',
    'merge',
    String(pr.number),
    '--merge',
    '--match-head-commit',
    pr.headRefOid,
    '--subject',
    said.title,
    '--body',
    said.body,
  ]);
  if (merged.status !== 0)
    return {
      status: 'False' as const,
      message: `GitHub declined to merge #${pr.number} at ${short(pr.headRefOid)}: ${merged.err}\nNothing landed. Read ${pr.url}.\n${retryLine(id)}`,
    };
  return {
    status: 'True' as const,
    message: `#${pr.number} merged at ${short(pr.headRefOid)} with a merge commit: ${pr.url}. ${forwarded(served.spec.repo, onto)}`,
  };
}

/** What `landed` is not ready for, in words, where the pull request is not merged. */
function whyNot(
  r: ReturnType<typeof readGithub>,
  mergeable: string,
  green: { ok: boolean; words: string },
  current: boolean,
  left: ReturnType<typeof leftOut>,
) {
  if (r.found.pull === 'other') return 'why' in r.found ? r.found.why : 'the run has several pull requests';
  if (r.found.pull === 'merged')
    return `the merge of #${r.pr?.number} leaves out ${withCommits(left)}, commits whose patch it does not hold`;
  if (!r.pr) return 'no pull request of the run is open';
  if (r.ownNot) return r.ownNot;
  if (mergeable !== MERGEABLE)
    return `GitHub says #${r.pr.number} is \`${r.pr.mergeable ?? 'unknown'}\`, not \`${MERGEABLE}\`: the branch is brought up to its base by a person, then ${retryLine(r.id).toLowerCase()}`;
  if (!green.ok) return `${green.words}, and only a green pull request lands`;
  if (!current) return `\`${r.onto}\` moved past ${short(r.pr.headRefOid)}, the head ci judged, so it would not land as judged`;
  return `merging #${r.pr.number} would leave out ${withCommits(left)}, commits whose patch ${short(r.pr.headRefOid)} does not hold: a person merges them into \`${r.pr.headRefName}\` and pushes it`;
}

/** What the program reads of the run's pull request for `landed`: what `landWrite` asks, and the words that say why it refused. */
function readLanded(served: ServedRun, given: Given) {
  const r = readGithub(served, given, undefined);
  const pr = r.pr;
  const merged = r.found.pull === 'merged';
  const head = ('oid' in r.found ? r.found.oid : pr?.headRefOid) ?? '';
  const left = head ? leftOut(r.named, head) : [];
  const mergeable = (pr?.mergeable ?? '').toUpperCase();
  const judge = pr !== undefined && !merged && r.ours;
  const green = judge ? greenAt(pr, given.check) : { ok: false, words: 'there is no pull request to judge' };
  const current = given.refresh === '' || !(judge && lacksBase(r.onto, pr.headRefOid, retryLine(r.id)));
  return { r, head, left, mergeable, green, current };
}

/** What the program does for `landed` on GitHub, and the condition it writes. */
function landedOn(served: ServedRun, waiting: ServedCheck, given: Given, due: boolean) {
  const { r, head, left, mergeable, green, current } = readLanded(served, given);
  const act = landWrite({
    due,
    decided: decidedIn(waiting),
    pull: r.found.pull,
    ours: r.ours,
    mergeable: mergeable === MERGEABLE ? 'yes' : mergeable === 'CONFLICTING' ? 'no' : 'unknown',
    green: green.ok,
    current,
    leftOut: left.length > 0,
  });
  if (act === 'nothing') return undefined;
  if (act === 'pass')
    return {
      status: 'True' as const,
      message: `#${r.pr?.number} is merged as ${short(head)}, a merge commit holding every result branch. ${forwarded(served.spec.repo, r.onto)}`,
    };
  if (act === 'wait') return { status: 'Unknown' as const, message: `GitHub has not yet said whether #${r.pr?.number} can be merged` };
  if (act === 'merge') return mergedOn(served, r.pr!, r.onto);
  return { status: 'False' as const, message: `${whyNot(r, mergeable, green, current, left)}. Nothing is merged.\n${retryLine(r.id)}` };
}

/** The repository's checkout read as the local landing needs it: ready, holding a merge of this run's, or a person's. */
function checkoutOf(repo: string, onto: string, named: readonly Branch[]) {
  const here = (...args: string[]) => run('git', args, repo);
  const heads = here('rev-parse', '-q', '--verify', 'MERGE_HEAD').status === 0 ? readHeads(repo) : [];
  if (heads.length) {
    const ours = heads.every((head) => named.some((it) => it.tip === head));
    return { checkout: (ours ? 'ours' : 'busy') as Checkout, why: ours ? '' : 'a merge of something else is in progress in it' };
  }
  const on = here('symbolic-ref', '--short', 'HEAD').out.trim();
  if (on !== onto) return { checkout: 'busy' as Checkout, why: `it is on \`${on || 'no branch'}\`, not on the base branch \`${onto}\`` };
  const dirty = here('status', '--porcelain', '--untracked-files=no').out.trim();
  if (dirty) return { checkout: 'busy' as Checkout, why: `it has uncommitted changes:\n${dirty}` };
  return { checkout: 'ready' as Checkout, why: '' };
}

/** The commits a merge in progress in `repo` merges: the lines of its `MERGE_HEAD`. */
function readHeads(repo: string) {
  const file = run('git', ['rev-parse', '--git-path', 'MERGE_HEAD'], repo).out.trim();
  const path = file.startsWith('/') ? file : `${repo}/${file}`;
  return fs.existsSync(path) ? fs.readFileSync(path, 'utf8').split('\n').filter(Boolean) : [];
}

/** The local check run by `sh -c` on the tree staged in `repo`: its exit and the end of what it printed. */
function judged(repo: string, command: string) {
  const ran = spawnSync('sh', ['-c', command], {
    cwd: repo,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: seconds('WF_LAND_CHECK_SECONDS', CHECK_SECONDS) * 1000,
    maxBuffer: OUTPUT_BYTES,
  });
  const said = `${ran.stdout ?? ''}${ran.stderr ?? ''}${ran.error?.message ?? ''}`.trim().split('\n').slice(-30).join('\n');
  return { ok: ran.status === 0, status: ran.status, said };
}

/** The merge in progress in `repo` taken back, and what the check wrote of the tree. */
const taken = (repo: string) => {
  run('git', ['merge', '--abort'], repo);
  run('git', ['reset', '-q', '--hard'], repo);
};

/** Every result branch staged in one merge in `repo`, judged by the local check and committed; or taken back and False. */
function mergedHere(served: ServedRun, repo: string, onto: string, named: readonly Branch[], given: Given) {
  const id = served.metadata.name;
  const subject = served.spec.brief.split('\n')[0].trim() || `Land ${id}`;
  const body = subjectsOf(named, onto);
  const staged = run('git', ['merge', '-q', '--no-ff', '--no-commit', ...named.map((it) => it.tip)], repo);
  if (run('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], repo).status !== 0)
    return {
      status: 'False' as const,
      message: `\`git merge\` of ${named.map((it) => it.branch).join(', ')} did not start in ${repo}: ${staged.err}\nNothing is merged.\n${retryLine(id)}`,
    };
  const conflicts = run('git', ['diff', '--name-only', '--diff-filter=U'], repo).out.trim();
  if (conflicts || staged.status !== 0) {
    taken(repo);
    return {
      status: 'False' as const,
      message: `merging the run's result into \`${onto}\` conflicts in ${conflicts.split('\n').join(', ') || 'a path'}: the base moved under the work, and a person merges \`${onto}\` into the run's branch and resolves it. The merge is taken back.\n${retryLine(id)}`,
    };
  }
  if (given.localCheck) {
    const checked = judged(repo, given.localCheck);
    if (!checked.ok) {
      taken(repo);
      return {
        status: 'False' as const,
        message: `the local check (\`${given.localCheck}\`) ${checked.status === null ? 'did not finish' : `exited ${checked.status}`} on the merged tree, which is taken back; \`${onto}\` is as it was. It said:\n${checked.said}\nA person fixes what it names on the branch.\n${retryLine(id)}`,
      };
    }
    run('git', ['checkout', '-q', '--', '.'], repo);
  }
  const made = run('git', ['commit', '-q', '--no-verify', '-m', subject, ...(body ? ['-m', body] : [])], repo);
  if (made.status !== 0) {
    taken(repo);
    return {
      status: 'False' as const,
      message: `\`git commit\` failed in ${repo}: ${made.err}\nThe merge is taken back.\n${retryLine(id)}`,
    };
  }
  return {
    status: 'True' as const,
    message: `the run's result is merged into \`${onto}\` in ${repo} as ${short(run('git', ['rev-parse', 'HEAD'], repo).out.trim())}: ${subject}`,
  };
}

/** What the program does for `landed` with no remote, and the condition it writes. */
function landedHere(served: ServedRun, waiting: ServedCheck, given: Given, due: boolean) {
  const id = served.metadata.name;
  const [repo, onto] = [served.spec.repo, served.spec.branch];
  if (!repo || !onto) throw new Unread(`${id} names no repository or base branch to land in`);
  at(repo);
  const named = tips(id);
  if (named.length === 0)
    throw new Unread(
      `${repo} has no branch under \`wf/${id}/\`: fetch the run's result branches into it, \`git fetch origin "+refs/heads/wf/${id}/*:refs/heads/wf/${id}/"\``,
    );
  const on = leftOut(named, onto).length === 0;
  const { checkout, why } = checkoutOf(repo, onto, named);
  const act = localWrite({ due, decided: decidedIn(waiting), onBase: on, checkout });
  if (act === 'nothing') return undefined;
  if (act === 'abort') {
    run('git', ['merge', '--abort'], repo);
    run('git', ['reset', '-q', '--hard'], repo);
    process.stdout.write(`nemia land: ${id}: took back a merge a stopped landing left staged in ${repo}\n`);
    return undefined;
  }
  if (act === 'pass')
    return {
      status: 'True' as const,
      message: `every commit of \`wf/${id}/\` is on \`${onto}\` in ${repo}, by its patch, at ${short(run('git', ['rev-parse', onto], repo).out.trim())}`,
    };
  if (act === 'wait')
    return {
      status: 'Unknown' as const,
      message: `waiting: the checkout ${repo} is a person's now, and a landing never merges into one — ${why}. A person finishes with it (\`git switch ${onto}\`, commit or stash), and the landing goes on`,
    };
  return mergedHere(served, repo, onto, named, given);
}

/** What the program does for the condition `name` of the step, which is due and not decided: the word it writes, where it writes one. */
function actOn(served: ServedRun, step: ServedStep, name: 'turn' | 'landed', given: Given, holder: string | undefined) {
  const waiting = waitOn(step, name);
  if (!waiting) return undefined;
  if (name === 'turn') return turnOf(served, waiting, given, holder, true);
  return given.github ? landedOn(served, waiting, given, true) : landedHere(served, waiting, given, true);
}

/** Whether the step has reached the condition `name`, which waits and is not yet decided for its try. */
const undecided = (step: ServedStep, name: string) => {
  const waiting = waitOn(step, name);
  return waiting !== undefined && !decidedIn(waiting) && conditionDue(step.status === 'checking', true, aheadOf(checksOf(step), name));
};

/** One due condition of one step, read and written, with the slot's holders kept; a read that fails is said, and the pass goes on. */
function settle(served: ServedRun, step: ServedStep, name: 'turn' | 'landed', given: Given, holders: Set<string>) {
  const id = served.metadata.name;
  try {
    const written = actOn(
      served,
      step,
      name,
      given,
      [...holders].find((it) => it !== id),
    );
    if (!written) return;
    write(id, step, waitOn(step, name)!, name, written);
    if (name === 'turn' && written.status === 'True') holders.add(id);
    if (name === 'landed' && written.status !== 'Unknown') holders.delete(id);
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia land: ${id} ${step.name} ${name}: ${err.message}\n`);
  }
}

/** One run's land step: each due condition read and written. */
function passOver(served: ServedRun, given: Given, holders: Set<string>) {
  for (const step of served.status.steps)
    for (const name of given.github ? (['turn', 'landed'] as const) : (['landed'] as const))
      if (undecided(step, name)) settle(served, step, name, given, holders);
}

/** The runs of the factory that are not finished, as the api serves them, the oldest first. */
function unfinished() {
  const factory = process.env.WF_FACTORY;
  const args = ['get', 'runs', ...(factory ? ['-n', factory] : ['-A']), '--field-selector', 'status.state!=finished', '-o', 'json'];
  const ran = run('nemia', args);
  if (ran.status !== 0) throw new Unread(`\`nemia ${args.join(' ')}\` failed: ${ran.err}`);
  const items = parsed<{ items?: ServedRun[] }>("the factory's runs", ran.out).items ?? [];
  const when = (r: ServedRun) => r.status.startedAt ?? '￿';
  return items.sort((a, b) => when(a).localeCompare(when(b)) || a.metadata.name.localeCompare(b.metadata.name));
}

/** What the program was started with, read from its flags; refuses, saying which flag, where one is missing or wrong. */
function givenOf(argv: readonly string[]) {
  const { values } = parseArgs({
    args: [...argv],
    options: {
      github: { type: 'string' },
      check: { type: 'string' },
      refresh: { type: 'string' },
      derives: { type: 'string' },
      install: { type: 'string' },
      'local-check': { type: 'string' },
      once: { type: 'boolean' },
    },
    strict: true,
  });
  if (values.github !== 'true' && values.github !== 'false')
    throw new Refusal("give `--github true` or `--github false` (the factory's `github`)");
  if (values.github === 'true' && !values.check)
    throw new Refusal("give the CI context branch protection requires, `--check <name>` (the factory's `ciCheck`)");
  return {
    given: {
      github: values.github === 'true',
      check: values.check ?? '',
      refresh: (values.refresh ?? '').trim(),
      derives: (values.derives ?? '').trim(),
      install: (values.install ?? '').trim(),
      localCheck: (values['local-check'] ?? '').trim(),
    } satisfies Given,
    once: values.once === true,
  };
}

/** One pass over every unfinished run, the oldest first; the pass's folder is the program's own, which no run's worktree outlives. */
function passes(given: Given) {
  process.chdir(HOME);
  const runs = unfinished();
  const holders = new Set(runs.filter(holds).map((r) => r.metadata.name));
  for (const served of runs) {
    process.chdir(HOME);
    passOver(served, given, holders);
  }
}

/** The whole run: the passes, until stopped, or one where `--once` says so. */
function main() {
  let started: ReturnType<typeof givenOf>;
  try {
    started = givenOf(process.argv.slice(2));
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia land: ${err.message}\n`);
    return 1;
  }
  for (;;) {
    try {
      passes(started.given);
    } catch (err) {
      if (!(err instanceof Refusal)) throw err;
      process.stderr.write(`nemia land: ${err.message}\n`);
    }
    if (started.once) return 0;
    sleep(seconds('WF_LAND_SECONDS', PASS_SECONDS));
  }
}

process.exitCode = main();
