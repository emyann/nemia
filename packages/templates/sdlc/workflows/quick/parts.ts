/**
 * `node parts.ts <verb>` — the door through which the step that builds a run's change settles the other branches of its run before it
 * signs off: every `wf/<run>/<part>` beside its own `wf/<run>/<leaf>` is taken into its branch or declared replaced, so the landing,
 * which refuses a result branch the pull request leaves out (`landing.ts`), finds none. A part is judged as the landing judges it, by
 * patch and not by ancestry (`git cherry <HEAD> <tip>`, whose `+` lines are the commits whose patch `HEAD` has no equivalent of): a part
 * taken as a commit of its own is never an ancestor of `HEAD`, yet nothing of it is left out.
 *
 * - `check`, which the implement step's check runs: refuses while a part branch of this run holds a commit whose patch `HEAD` does not,
 *   naming each with those commits and the two ways to settle it — merge it into this branch, or declare it replaced.
 * - `replaced <part>…`, which the engineer types for a part whose work her branch replaced (an earlier cut of it, its work moved or
 *   made again): it removes each `wf/<run>/<part>` branch, never another, keeping its tip as `refs/backup/wf/<run>/<part>` so nothing
 *   is lost, and prints what it removed and kept. A step may not delete a branch, so the removal is this script's, read from the run's
 *   frozen workflow files (`$WF_WORKFLOW_FILES`) as `pull-request.ts` is; the engineer names each part she declared in her closeout.
 *
 * The run is read from `HEAD`, never given: a run's branch is `wf/<run>/<leaf>`, and its parts are the other branches under `wf/<run>/`.
 * Refuses, exit 1 on stderr with what to do next: a `HEAD` on no such branch; a verb it has not; a `replaced` with no part, or naming its
 * own branch, a branch the run has not, one a worktree has checked out, or one whose every commit `HEAD` already holds (nothing to
 * declare: it is taken), or whose backup ref is already there; and a part left out, at `check`.
 */
import { spawnSync } from 'node:child_process';

/** A reason the verb is refused: said on stderr, exit 1. */
class Refusal extends Error {}

/** How long a call of `git` may take, in milliseconds. */
const BOUND = 60_000;

/** Where a replaced part's tip is kept, under the run's id and the part's name. */
const BACKUP = 'refs/backup/';

/** What a part's name may be: one leaf of `wf/<run>/`, as a branch of the run is named. */
const PART = /^[^/\s]+$/;

/** What git printed for `args`, trimmed, with its exit; never thrown. */
function run(args: string[]): { status: number | null; out: string; err: string } {
  const r = spawnSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: BOUND });
  return { status: r.status, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() || (r.error?.message ?? '') };
}

/** What git printed for `args`, trimmed; refuses, saying what could not be told, when git fails. */
function git(what: string, ...args: string[]): string {
  const ran = run(args);
  if (ran.status !== 0) throw new Refusal(`cannot tell ${what}, since \`git ${args.join(' ')}\` failed: ${ran.err}`);
  return ran.out;
}

/** The branch this workspace is on, with the run it names and its leaf; refuses any other branch. */
function branchOf(): { branch: string; run: string; leaf: string } {
  const head = run(['symbolic-ref', '--short', 'HEAD']);
  const branch = head.status === 0 ? head.out : '';
  const named = /^wf\/([^/]+)\/([^/]+)$/.exec(branch);
  if (!named)
    throw new Refusal(
      `the branch here is ${branch ? `\`${branch}\`` : 'none'}, not a run's \`wf/<run>/<leaf>\`, and this script settles the parts ` +
        "of the run its branch names: run it from the step's own workspace (`git switch wf/<run>/run`)",
    );
  return { branch, run: named[1], leaf: named[2] };
}

/** The other branches of the run, each with its tip: `refs/heads/wf/<run>/*` but `own`. */
function partsOf(id: string, own: string): { branch: string; tip: string }[] {
  return git(`the branches of run ${id}`, 'for-each-ref', '--format=%(refname:short) %(objectname)', `refs/heads/wf/${id}/`)
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [branch = '', tip = ''] = line.split(' ');
      return { branch, tip };
    })
    .filter((part) => part.branch !== own);
}

/** The commits of `tip` whose patch `head` has no equivalent of, each by its short sha. */
const leftOut = (branch: string, tip: string, head: string): string[] =>
  git(`what of \`${branch}\` ${head.slice(0, 12)} has no patch of`, 'cherry', head, tip)
    .split('\n')
    .filter((line) => line.startsWith('+ '))
    .map((line) => line.slice(2, 14));

/** The command that declares `parts` replaced, as the engineer types it. */
const replacedLine = (parts: readonly string[]): string => `node "$WF_WORKFLOW_FILES/parts.ts" replaced ${parts.join(' ')}`;

/** `check`: refuses while a part of this run holds a commit `HEAD` has no patch of. */
function check(args: string[]): string[] {
  if (args.length) throw new Refusal(`\`check\` takes nothing, not \`${args.join(' ')}\``);
  const { branch, run: id } = branchOf();
  const head = git('what commit HEAD is', 'rev-parse', 'HEAD');
  const parts = partsOf(id, branch);
  const left = parts.map((part) => ({ ...part, commits: leftOut(part.branch, part.tip, head) })).filter((part) => part.commits.length);
  if (left.length)
    throw new Refusal(
      `${left.map((part) => `\`${part.branch}\` (${part.commits.join(', ')})`).join(', ')} ${left.length === 1 ? 'holds' : 'hold'} ` +
        `work whose patch \`${branch}\` does not, and the landing refuses a result branch its pull request leaves out. Settle each ` +
        `before you sign off: take it (\`git merge <branch>\`, or its commits as commits of your own), or, where \`${branch}\` ` +
        `replaced its work, declare it replaced (\`${replacedLine(left.map((part) => part.branch.slice(`wf/${id}/`.length)))}\`) ` +
        'and name it in your closeout',
    );
  return [
    parts.length
      ? `every part of run ${id} is held by \`${branch}\`: ${parts.map((part) => `\`${part.branch}\``).join(', ')}`
      : `run ${id} has no branch but \`${branch}\``,
  ];
}

/** The branches checked out in a worktree of this repository, by full ref name. */
const checkedOut = (): Set<string> =>
  new Set(
    git('which branches a worktree has checked out', 'worktree', 'list', '--porcelain')
      .split('\n')
      .filter((line) => line.startsWith('branch '))
      .map((line) => line.slice('branch '.length)),
  );

/** `replaced <part>…`: removes each part's branch, keeping its tip under `refs/backup/`; refuses all before it removes any. */
function replaced(args: string[]): string[] {
  if (args.length === 0) throw new Refusal('`replaced` names the parts it declares: `node "$WF_WORKFLOW_FILES/parts.ts" replaced <part>…`');
  const { branch, run: id, leaf } = branchOf();
  const head = git('what commit HEAD is', 'rev-parse', 'HEAD');
  const parts = new Map(partsOf(id, branch).map((part) => [part.branch, part.tip]));
  const busy = checkedOut();
  const settled = [...new Set(args)].map((part) => {
    if (!PART.test(part))
      throw new Refusal(`\`${part}\` is no part's name: give the leaf of its branch, \`<part>\` of \`wf/${id}/<part>\``);
    if (part === leaf) throw new Refusal(`\`${branch}\` is this step's own branch, and a step declares only another part replaced`);
    const named = `wf/${id}/${part}`;
    const tip = parts.get(named);
    if (!tip)
      throw new Refusal(
        `run ${id} has no branch \`${named}\`: its parts are ${[...parts.keys()].map((b) => `\`${b}\``).join(', ') || 'none'}`,
      );
    if (busy.has(`refs/heads/${named}`))
      throw new Refusal(
        `\`${named}\` is checked out in a worktree (\`git worktree list\`): remove the part's worktree (\`git worktree remove <path>\`) ` +
          'once you have read it, then declare it again',
      );
    if (leftOut(named, tip, head).length === 0)
      throw new Refusal(
        `every commit of \`${named}\` has its patch on \`${branch}\` already: it is taken, the landing counts it so, and there is ` +
          'nothing to declare',
      );
    const backup = `${BACKUP}${named}`;
    if (run(['rev-parse', '--verify', '--quiet', backup]).status === 0)
      throw new Refusal(`\`${backup}\` is there already, and this script never overwrites a kept tip: a person reads it and removes it`);
    return { named, tip, backup };
  });
  return settled.map(({ named, tip, backup }) => {
    git(`whether \`${backup}\` could be made`, 'update-ref', backup, tip, '');
    git(`whether \`${named}\` could be removed`, 'update-ref', '-d', `refs/heads/${named}`, tip);
    return `\`${named}\` removed as replaced; its tip ${tip.slice(0, 12)} is kept as \`${backup}\``;
  });
}

/** The verbs, by name. */
const VERBS: Record<string, (args: string[]) => string[]> = { check, replaced };

/** The whole run: exit 0 with what was done on stdout, or the refusal on stderr with 1; each line under `nemia parts`. */
function main(): number {
  const [verb = '', ...args] = process.argv.slice(2);
  try {
    const act = Object.hasOwn(VERBS, verb) ? VERBS[verb] : undefined;
    if (!act) throw new Refusal(`\`${verb}\` is no verb: give check or replaced`);
    for (const line of act(args)) process.stdout.write(`nemia parts: ${line}\n`);
    return 0;
  } catch (err) {
    if (!(err instanceof Refusal)) throw err;
    process.stderr.write(`nemia parts: ${err.message}\n`);
    return 1;
  }
}

process.exitCode = main();
