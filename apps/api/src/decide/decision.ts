/** What `wf decide` shows a person about a run (`GET /api/runs/:id/decision`): its branches, the lesson line, the diffs and the commands. */
import {
  branchesToRead,
  type BranchStanding,
  branchStandings,
  branchWord,
  CHECK_AFFECTING,
  closeoutAsked,
  closeoutReader,
  consumption,
  diffStat,
  exitVerdicts,
  harnessBlocked,
  isShipped,
  lessonLine,
  merges,
  phaseOfView,
  readAsks,
  resultSteps,
  runCostLines,
  sendBackTo,
  sensitiveDiff,
  touchedBy,
} from 'agent-orchestrator';
import { type Decision, decision, type GitRun, isGitRun, overBudgetLine, retryLines, roundLines, type Run } from 'agent-orchestrator/run';
import { holdingOf, holdsIn, judge, type RunHolding, type RunWaiting, waitingOf, waitsIn } from '../runs/judged.ts';
import { mergesOnto, mergeWord, type MergeWord } from './merge.ts';
import { e, judgedSteps, stepNames, viewsOf, workflowsOf } from '../store.ts';
import { type StepUsed, totalOf, usedOf } from '../detail/usage.ts';

/** What a branch touched, as `wf decide` reads it (`touchedBy`): its radius, or why git could not say. */
export type Touched = { branch: string; radius: ReturnType<typeof touchedBy> };

/**
 * Where one result branch stands against the base branch, as git says it now (`BranchStanding`) — on it, ahead of it by N commits, or gone
 * — with the fact in the package's words (`branchWord`) and how much it changed, as `wf decide` prints beside the branch (`diffStat`, git's
 * `--shortstat`): `3 files changed, 12 insertions(+), 1 deletion(-)`, trimmed. `stat` is null where git said nothing of it: a branch it
 * does not have, or one with nothing on it past the run's base.
 */
export type Standing = BranchStanding & { said: string; stat: string | null; merge: StandingMerge | null };

/**
 * Whether a branch ahead of the base still merges onto it as the base is now (`mergesOnto`, git's `merge-tree`), and that in words
 * (`mergeWord`): what an ending that merges would find. Null for a branch on the base or gone, which nothing would merge.
 */
export type StandingMerge = MergeWord & { said: string };

/** One file of a branch's check-affecting diff: its unified diff, at most `DIFF_LINES` lines, and how many more it had. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/** The check-affecting files' diff on one branch, a file each; none when no changed file is on the list; `error` when git could not say. */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/**
 * The lesson line as `wf decide` words it (`lessonLine`), without its label, and which of its three it is: a file where
 * the next agent reads was changed, nothing was, or a branch could not be read, so nobody knows.
 */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/**
 * A command `wf decide` prints, and runs none of: ship it, drop it, read it for a run worked on its base branch, each
 * once-more (`wf retry`, `wf round`) with the line it prints it in, and for a step waiting at its gate on you, the two its gate line
 * prints under the step — approve (`wf approve`) and send back (`wf retry --message`). `said` is null where the label is all it says.
 */
export type DecideCommand = {
  label: 'ship it' | 'drop it' | 'read it' | 'once more' | 'accept' | 'approve' | 'send back' | 'forget it';
  command: string;
  said: string | null;
};

/**
 * What `wf decide` shows a person about a run: what each branch it reads touched, the lesson line, the check-affecting
 * diffs in full, what each step consumed and the run's total, and the commands.
 */
export type Decidable = {
  /**
   * Where each result branch stands against the base branch, and how much it changed (`Standing`): the facts under the run's result, as
   * `wf decide` prints them before anything to do about it. Empty for a run that worked on its base branch itself, which has no result
   * branch of its own, and for one whose steps recorded none.
   */
  standings: Standing[];
  touched: Touched[];
  lesson: Lesson;
  sensitive: SensitiveDiff[];
  used: Record<string, StepUsed>;
  /** Every filed step's `used` summed: a count only where every one of them measured it. */
  total: StepUsed;
  /**
   * What the run has cost, as `wf decide` prints it after its steps (`runCostLines`), without its label: `run $12.40`, with how many ended
   * attempts had no cost on them — or `run not measured`. Null before any attempt has ended.
   */
  cost: string | null;
  /** `wf decide`'s OVER BUDGET line, saying why each step held on its budget is held (`overBudgetLine`); null when none is. */
  overBudget: string | null;
  commands: DecideCommand[];
  /**
   * The run finished and nobody has decided it, as the package reads it (`decision`'s `awaiting`) — the reading `wf prune` refuses without
   * `--unmerged` (`pruneRefusal`): the result branches it waits on, and `direct` for a run that worked on its base branch itself, which has
   * nothing to merge and still waits on you (its branch is the base branch). Null for a run still running with a step waiting on you. A run called off, or whose branches are
   * on the base however they got there, is `nothing`, never this.
   */
  awaiting: { branches: string[]; direct: boolean } | null;
};

/**
 * A run's decision. `waiting` for a run whose roots wait on runs that have not shipped: `wf decide` says that, and offers
 * nothing else — and the hold beside it, `holding`, for one a person also holds, as `wf decide` says both. `holding` alone for a run a
 * person holds (`wf hold`): `wf decide` says the hold and what lifts it, and offers nothing, since every verb that would release work is
 * refused while it stands (`heldRefusal`). `running` while it runs and nobody is waited on — `wf decide`'s "nothing to decide yet", with no
 * git asked. `nothing`, in `wf decide`'s words, for a run called off or whose branches are already on its base. Else
 * what there is to decide.
 */
export type RunDecision =
  | { waiting: RunWaiting; holding?: RunHolding }
  | { holding: RunHolding }
  | { running: true }
  | { nothing: string }
  | Decidable;

/** How many lines of one file's check-affecting diff the board is given. `wf decide` prints them all. */
export const DIFF_LINES = 400;

/**
 * A diff `git diff` gave for several files, one entry per file, each cut to `DIFF_LINES`. Named for a person — `from → to`
 * for a rename — off the file's own header lines, before its first hunk.
 */
export function diffFiles(diff: string): DiffFile[] {
  const files: string[][] = [];
  for (const line of diff.replace(/\n$/, '').split('\n')) {
    if (line.startsWith('diff --git ') || !files.length) files.push([]);
    files.at(-1)!.push(line);
  }
  return files.map((lines) => ({ path: diffPath(lines), lines: lines.slice(0, DIFF_LINES), cut: Math.max(0, lines.length - DIFF_LINES) }));
}

/**
 * The path one file's diff is about, off its header lines: `from → to` for a rename, else the `+++` side, else the `---` side. A binary
 * file or a mode change has neither: its `diff --git a/<path> b/<path>` line, whose two halves are the same path, names it.
 */
function diffPath(lines: readonly string[]): string {
  const hunk = lines.findIndex((line) => line.startsWith('@@'));
  const head = hunk < 0 ? lines : lines.slice(0, hunk);
  const after = (prefix: string) =>
    head
      .find((line) => line.startsWith(prefix))
      ?.slice(prefix.length)
      .replace(/\t$/, '');
  const [from, to] = [after('rename from '), after('rename to ')];
  if (from && to) return `${from} → ${to}`;
  for (const [prefix, side] of [
    ['+++ ', 'b/'],
    ['--- ', 'a/'],
  ] as const) {
    const named = after(prefix);
    if (named && named !== '/dev/null') return named.startsWith(side) ? named.slice(side.length) : named;
  }
  const both = (head[0] ?? '').slice('diff --git '.length);
  const half = (both.length - 1) / 2;
  return Number.isInteger(half) && both.slice(2, half) === both.slice(half + 3) ? both.slice(2, half) : both;
}

/** A branch's check-affecting diff, as `inFullLines` reads what `sensitiveDiff` gave: an error, none, or the files. */
function sensitiveOf(run: GitRun, t: Touched): SensitiveDiff {
  if ('error' in t.radius) return { branch: t.branch, files: [], error: t.radius.error };
  const diff = sensitiveDiff(run, t, CHECK_AFFECTING);
  if (diff === undefined) return { branch: t.branch, files: [], error: `git could not diff ${t.branch}` };
  return { branch: t.branch, files: diff.trim() ? diffFiles(diff) : [], error: null };
}

/** The line `lessonLine` prints, and which of its three it is. */
function lessonOf(touched: readonly Touched[]): Lesson {
  const said = lessonLine(touched).replace(/^lesson\s+/, '');
  if (touched.some((t) => 'error' in t.radius)) return { said, state: 'unknown' };
  return { said, state: touched.some((t) => !('error' in t.radius) && t.radius.lessons.length) ? 'written' : 'nothing' };
}

/**
 * A once-more line's command: `wf retry <run> <step>`, `--recheck` when it says so, `--fresh` for a step `denials: fail` stopped (whose
 * offer is a new session, told to do without the call), or `wf round <run> <step>` — with `--budget <amount>` past a cap — after the colon
 * and two spaces. Or a send-back from an ending that stopped on the base branch, which needs its words:
 * `wf retry <run> <step> --message "<objection>"`. Or, at the cap, `wf accept <run> <step> --message "<why>"`, the other answer — which
 * the board also presses itself, through `POST /api/runs/:id/steps/:step/accept`, reading the step off this command (`acceptStepOf` in
 * apps/web/src/lib/decide.ts).
 *
 * A verb this does not know is not dropped: `commandsOf` falls back to the whole English sentence, which the board then offers as a
 * command to copy and run. So an offer worded in the package goes in here in the same change (CLAUDE.md).
 *
 * A held run (`wf hold`) has no offer for this to read: `decisionOf` answers it `holding` before any line is made. The package's own lines
 * say the hold where they would offer a verb — `held until a-1 ships; once more is asked once the hold lifts` (`heldLater` in run.ts) — a
 * sentence with no `wf` verb in it, which would reach a person as a command to run if one got here.
 */
const ONCE_MORE = /:\s{2}(wf (?:retry|round|accept) \S+ \S+(?: --recheck| --fresh| --budget <amount>| --message "<(?:objection|why)>")?)/;

/**
 * A step waiting at its gate on a person, and the steps a send-back of it names (`sendBackTo`): what `wf decide` prints under the step, as
 * the facts it prints them from rather than the sentence it prints. Empty `back` for an ending step that waits on nothing, which has no
 * work to object to, and several for one that waits on several — `wf decide` prints a line for each.
 */
type AtGate = { step: string; back: string[] };

/**
 * The commands `wf decide` prints on a run awaiting a person: once more for each step it offers, the approval and a send-back for each step
 * waiting at its gate on you (`gates`), then ship it and drop it for the branches, or read it for a run worked on its base branch — which
 * has nothing to merge, nor a branch to delete. A folder run has none of those: its work stays where it is until a person is done with it,
 * and forgetting it is the one command `wf decide` prints (cli.ts, `!git`), and nothing about git.
 *
 * The gate's commands are built from the steps a send-back names and not read out of the package's own gate line: that line has no
 * send-back at all for an ending step that waits on nothing, and joins the commands with ` or ` for one that waits on several, and a run
 * whose only remaining action is an approval must not be handed an empty list of commands because a sentence did not parse.
 *
 * `endingMerges` is whether a step of the workflow acts on the base branch itself (`workspace: main`): ship it and drop it are for the folder
 * that says nothing about what happens when the work is done, and a folder that says it in prose does not also tell a person to type
 * `git merge` — its ending step is what merges, and a run parked at that step's gate is one approval away from doing it. As `wf decide`
 * decides it (cli.ts, `!merges(steps)`).
 */
function commandsOf(
  run: Run,
  d: Decision,
  offers: readonly string[],
  gates: readonly AtGate[] = [],
  endingMerges = false,
): DecideCommand[] {
  if (d.kind !== 'awaiting') return [];
  const once = [
    ...offers.map((said): DecideCommand => {
      const command = ONCE_MORE.exec(said)?.[1] ?? said;
      const label = command.startsWith('wf accept ') ? 'accept' : command.endsWith('--message "<objection>"') ? 'send back' : 'once more';
      return { label, command, said };
    }),
    ...gates.flatMap(({ step, back }): DecideCommand[] => {
      const approve = `wf approve ${run.id} ${step}`;
      return [
        { label: 'approve', command: approve, said: `${step} waits at its gate — with words: ${approve} --message "<words>"` },
        ...back.map((name): DecideCommand => ({
          label: 'send back',
          command: `wf retry ${run.id} ${name} --message "<objection>"`,
          said: null,
        })),
      ];
    }),
  ];
  if (!isGitRun(run))
    return [...once, { label: 'forget it', command: `wf rm ${run.id}`, said: 'forgets the run with its folders and files' }];
  if (d.direct) {
    const said = `worked directly on ${run.branch}; nothing to merge; the base was ${run.baseRef}`;
    return [...once, { label: 'read it', command: `git -C ${run.repo} diff ${run.baseRef}...${run.branch}`, said }];
  }
  const first = endingMerges ? undefined : d.branches[0];
  return [
    ...once,
    ...(first
      ? ([
          { label: 'ship it', command: `git -C ${run.repo} merge --no-ff ${first}`, said: null },
          { label: 'drop it', command: `git -C ${run.repo} branch -D ${d.branches.join(' ')}`, said: null },
        ] satisfies DecideCommand[])
      : []),
  ];
}

/**
 * What `wf decide` shows a person about a run, read off one read of its tasks.
 *
 * A run still running with nobody waited on is `running`, and git is not asked a thing: the page asks while a run is
 * decidable, and the Factory's card only for a run waiting on you, but a request is a request. Otherwise judged as the
 * CLI judges it (`decision`): called off, or already shipped, is `nothing`. Then the branches the CLI reads
 * (`branchesToRead`) — the result branches, or every branch a step worked on when no terminal step has one, never the base branch of a
 * run that cut worktrees, whose work is not on it — each
 * read with `touchedBy`, and with `sensitiveDiff` over the default check-affecting list. A branch git cannot read is
 * an `error` on its entry, never a failed request. A few `git` calls a branch, so read once, never on a poll.
 *
 * First, as `wf decide` asks it first: a run whose roots wait on runs that have not shipped is `waiting`, and nothing else is read. Then a
 * run a person holds is `holding`, and nothing else is read either: what is in flight is on its detail, and nothing is offered.
 *
 * The run is judged without the branch standings, which this answer does not carry: a run still running is answered `running` without
 * one `git` being run for it, and what there is to decide is on the run's own detail, off its own read. `decision` is given the harness's
 * word, as `wf decide` reads it — a person's try of a session the harness blocked is waited on too — and what each task's sessions cost
 * (`spendReader`): a step over its budget, or ended at it, is waited on, and offered its try or round with `--budget`.
 *
 * For a run still running with a step waiting on you, the branches read are the result steps' (`resultSteps`), as `decision` reads them
 * once it is not: the terminal steps, and for a terminal step that works in the repository's own checkout, the steps it waits on, whose
 * work it acts on. A folder run has no repository to ask, so none of git is read for it: what its steps made is in their artifacts.
 * `standings` are none for a run that worked on its base branch itself, whose standing would read `main is on main` and whose own line
 * says so instead. A pruned run is offered no once-more, whose verbs each refuse it (`prunedRefusal`): the package's lines say so
 * themselves, for `wf decide` and for this. A step waiting at its gate on you — not one a person has sent back already, which waits on
 * nobody — is offered with the steps its send-back names (`sendBackTo`), which is what `wf decide` prints under the step; the word is
 * `listing`'s, as `needsOf` reads it for the verb.
 */
export async function decisionOf(run: Run): Promise<RunDecision> {
  const waits = await waitsIn(run, e);
  const waiting = waitingOf(run, waits);
  const holds = await holdsIn(run, e);
  const holding = holdingOf(run, holds);
  if (waiting) return { waiting, ...(holding ? { holding } : {}) };
  if (holding) return { holding };
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const views = await viewsOf(run);
  const judged = judge(run, names, folder, views, waits, holds);
  if (judged.status === 'cancelled') return { nothing: `cancelled at ${run.cancelledAt} — nothing to decide` };
  if (judged.status === 'running' && !judged.waitingOnYou.length) return { running: true };

  const steps = judgedSteps(run, folder);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdicts = exitVerdicts(views, run);
  const { asks, rounds } = readAsks(run.id);
  const { spendOf } = judged;
  const d = decision(
    steps,
    run,
    phase,
    (branch) => isGitRun(run) && isShipped(run, branch),
    reader,
    asked,
    verdicts,
    asks,
    rounds,
    harnessBlocked(views),
    spendOf,
  );
  if (d.kind === 'cancelled') return { nothing: `cancelled at ${d.at} — nothing to decide` };
  if (d.kind === 'shipped') return { nothing: `shipped — ${d.branches.join(', ')} is already on ${run.branch}` };

  const results = [
    ...new Set(
      resultSteps(steps)
        .map((s) => run.steps[s.name]?.branch)
        .filter((b): b is string => Boolean(b)),
    ),
  ];
  const result = d.kind === 'awaiting' ? d.branches : results;
  const git = isGitRun(run) ? run : undefined;
  const touched: Touched[] = !git
    ? []
    : branchesToRead(
        result,
        Object.values(git.steps).map((s) => s.branch),
        git.isolate ? git.branch : undefined,
      ).map((branch) => ({ branch, radius: touchedBy(git, branch) }));
  const standings: Standing[] = git?.isolate
    ? branchStandings(git, results).map((s) => ({
        ...s,
        said: branchWord(git, s),
        stat: diffStat(git, s.branch).trim() || null,
        merge: mergeOf(git, s),
      }))
    : [];
  const consumed = consumption(views, run);
  const filed = Object.keys(run.steps).filter((name) => run.steps[name]?.taskId);
  const offers = [...roundLines(steps, run, d, spendOf), ...retryLines(steps, run, d, phase, reader, asked, spendOf, verdicts)];
  const gates: AtGate[] = steps
    .filter((step) => judged.words.get(step.name) === 'awaiting approval' && judged.waitingOnYou.includes(step.name))
    .map((step) => ({ step: step.name, back: sendBackTo(step, run) }));
  return {
    standings,
    touched,
    lesson: lessonOf(touched),
    sensitive: git ? touched.map((t) => sensitiveOf(git, t)) : [],
    used: Object.fromEntries(filed.map((name) => [name, usedOf(consumed[name], steps.find((s) => s.name === name)?.context)])),
    total: totalOf(
      steps,
      filed.map((name) => [name, consumed[name]] as const),
    ),
    cost: runCostLines(run, spendOf)[0]?.replace(/^cost\s+/, '') ?? null,
    overBudget: overBudgetLine(steps, run, d, spendOf) ?? null,
    commands: commandsOf(run, d, offers, gates, merges(steps)),
    awaiting: d.kind === 'awaiting' ? { branches: d.branches, direct: d.direct } : null,
  };
}

/** Whether a branch ahead of the base still merges onto it (`StandingMerge`); null for one that is not ahead, which nothing would merge. */
function mergeOf(run: GitRun, standing: BranchStanding): StandingMerge | null {
  if (standing.where !== 'ahead') return null;
  const merge = mergesOnto(run.repo, run.branch, standing.branch);
  return { ...merge, said: mergeWord(merge, run.branch) };
}
