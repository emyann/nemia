/**
 * What `nemia decide` shows a person about a run (`GET /api/runs/:runId/decision`): its branches, the lesson line, the diffs and the
 * commands.
 */
import {
  branchesToRead,
  type BranchStanding,
  branchStandings,
  type BranchChanges,
  type BranchReader,
  branchWord,
  changesOf,
  COMMANDS,
  type Collisions,
  type Decided,
  decideRun,
  type StandingMerge,
  countsLine,
  type DecideCommand,
  lessonLine,
  parentsRead,
  resultSteps,
  judgedSteps,
  stepNames,
  viewsOf,
  workflowsOf,
  holdingOf,
  judge,
  type RunHolding,
  type RunWaiting,
  runWaitingOf,
  runWith,
  runStore,
  standingWhen,
} from 'agent-orchestrator';
import {
  type CheckoutHold,
  type RepositoryRun,
  holdsOf,
  isRepositoryRun,
  type Run,
  type RunSlot,
  waitedOn,
  waitsOf,
} from 'agent-orchestrator/run';
import { type Engine, runPlaced } from '../store.ts';
import { type StepUsed, totalOf, usedOf } from '../detail/usage.ts';
import type { PlaceService } from 'agent-orchestrator';

export type { DecideCommand };

/**
 * What a branch touched, as `nemia decide` reads it from the run's place (`changesOf`): its radius, or the sentence saying what it changed
 * is not known.
 */
export type Touched = { branch: string; radius: BranchChanges['radius'] };

/**
 * Where one result branch stands against the base branch, as git says it now (`BranchStanding`) — on it, ahead of it by N commits, or gone
 * — with the fact in the package's words (`branchWord`) and how much it changed, as `nemia decide` prints beside the branch
 * (`countsLine`): `3 files: +14 −1`, with `, 1 binary` where one is, or the sentence saying what it changed is not known. `stat` is null
 * for a branch with nothing on it past the run's base.
 */
export type Standing = BranchStanding & { said: string; stat: string | null; merge: StandingMerge | null };

export type { Collisions, StandingMerge };

/** One file of a branch's check-affecting diff: its unified diff, at most `DIFF_LINES` lines, and how many more it had. */
export type DiffFile = { path: string; lines: string[]; cut: number };

/**
 * The check-affecting files' diff on one branch, a file each; none when no changed file is on the list; `error`, the sentence saying it is
 * not known, when the place did not say.
 */
export type SensitiveDiff = { branch: string; files: DiffFile[]; error: string | null };

/**
 * The lesson line as `nemia decide` words it (`lessonLine`), without its label, and which of its three it is: a file where
 * the next agent reads was changed, nothing was, or a branch could not be read, so nobody knows.
 */
export type Lesson = { said: string; state: 'written' | 'nothing' | 'unknown' };

/**
 * What `nemia decide` shows a person about a run: what each branch it reads touched, the lesson line, the check-affecting
 * diffs in full, what each step consumed and the run's total, and the commands.
 */
export type Decidable = {
  /**
   * Where each result branch stands against the base branch, and how much it changed (`Standing`): the facts under the run's result, as
   * `nemia decide` prints them before anything to do about it. Empty for a run that worked on its base branch itself, which has no result
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
   * What the run has cost, as `nemia decide` prints it after its steps (`runCostLines`), without its label: `run $12.40`, with how many
   * ended attempts had no cost on them — or `run not measured`. Null before any attempt has ended.
   */
  cost: string | null;
  /** `nemia decide`'s OVER BUDGET line, saying why each step held on its budget is held (`overBudgetLine`); null when none is. */
  overBudget: string | null;
  /**
   * The commands a person may type on a run awaiting them, as the package builds them (`choicesOf`): each a bare `nemia` or `git -C` line,
   * labelled, beside the sentence it ends where it has one. None on a run that awaits nobody.
   */
  commands: DecideCommand[];
  /**
   * The run whose ending step has the repository's own checkout while this run's waits for it (`checkoutHold`); absent when none holds
   * it.
   */
  checkout?: CheckoutHold;
  /**
   * The run finished and nobody has decided it, as the package reads it (`decision`'s `awaiting`) — the reading `nemia prune` refuses
   * without `--unmerged` (`pruneRefusal`): the result branches it waits on, and `direct` for a run that worked on its base branch itself,
   * which has nothing to merge and still waits on you (its branch is the base branch). Null for a run still running with a step waiting on
   * you. A run called off, or whose branches are on the base however they got there, is `nothing`, never this.
   */
  awaiting: { branches: string[]; direct: boolean } | null;
  /**
   * At an ending's decision — its gate, or its landing a check refused — whether each branch ahead merges onto the base, which other runs
   * in flight on the base it collides with and in which files, and a merge clean as text whose landing check refused the base as it is
   * now (`Collisions`), read live by the package's decision; null at any other.
   */
  collisions: Collisions | null;
};

/**
 * A run's decision. `waiting` for a run whose roots wait on runs that have not shipped: `nemia decide` says that, and offers nothing else —
 * and the hold beside it, `holding`, for one a person also holds, as `nemia decide` says both. `holding` alone for a run a person holds
 * with `nemia hold`: `nemia decide` says the hold and what lifts it, and offers nothing, since every verb that would release work is
 * refused while it stands (`heldRefusal`). `running` while it runs and nobody is waited on — `nemia decide`'s "nothing to decide yet", with
 * no git asked — and `held` beside it for a run the cap on runs in flight holds, with the count it is held at (`slotsOf`). `nothing`, in
 * `nemia decide`'s words, for a run called off or whose branches are already on its base. Else what there is to decide.
 */
export type RunDecision =
  | { waiting: RunWaiting; holding?: RunHolding }
  | { holding: RunHolding }
  | { running: true; held?: RunSlot }
  | { nothing: string }
  | Decidable;

/** How many lines of one file's check-affecting diff the board is given. `nemia decide` prints them all. */
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

/** A branch's check-affecting diff, as `inFullLines` reads what the place gave (`BranchChanges.inFull`): an error, none, or the files. */
function sensitiveOf({ branch, inFull }: BranchChanges): SensitiveDiff {
  if (typeof inFull !== 'string') return { branch, files: [], error: inFull.error };
  return { branch, files: inFull.trim() ? diffFiles(inFull) : [], error: null };
}

/** The line `lessonLine` prints, and which of its three it is. */
function lessonOf(touched: readonly Touched[]): Lesson {
  const said = lessonLine(touched).replace(/^lesson\s+/, '');
  if (touched.some((t) => 'error' in t.radius)) return { said, state: 'unknown' };
  return { said, state: touched.some((t) => !('error' in t.radius) && t.radius.lessons.length) ? 'written' : 'nothing' };
}

/** The merge check, the table's entry served on the api alone. */
const MERGES = COMMANDS.find((c) => c.name === 'merges')!;

/**
 * What `nemia decide` shows a person about a run, decided by the package (`decideRun`, the handler of the command table's `decide`): its
 * decision, commands (`choicesOf`), costs and checkout, read with the branches and diffs the api reads beside them.
 *
 * Where the branches stand is asked of their places at most once, live, as a person's verb asks it (`standingWhen`), the same ask handed to
 * the package's decision, and only where it is read: for the runs it waits on, and for a run judged neither running nor called off without
 * it, then judged over it. First, as the CLI asks it first, off the runs it waits on and is held until, each read once (`parentsRead`): a
 * run whose roots wait on runs that have not shipped is `waiting`, and none of its tasks is read. Then a run a person holds is `holding`,
 * and none is read either: what is in flight is on its detail, and nothing is offered. Else the run is judged (`judge`) over those runs. A
 * run still running with nobody waited on (`judge`, the listing's word) is `running`, with the slot the cap holds it for — its
 * `WF_MAX_RUNS` before any pass is `env`'s, the app's environment, as `GET /api/ceilings` reads it — and git is asked nothing more: the
 * page asks while a run is decidable, and the Factory's card only for a run waiting on you, but a request is a request. Called off, or
 * already shipped, is `nothing`.
 *
 * Then the branches the CLI reads (`branchesToRead`) — the result branches, or every branch a step worked on when no terminal step has one,
 * never the base branch of a run that cut worktrees, whose work is not on it — and the result branches' counts, each read from the run's
 * place on this request (`changesOf`), with the default check-affecting files' diffs. What the place could not say is an `error` on its
 * entry, the sentence saying it is not known, never a failed request nor a branch that changed nothing. Two of the place's reports a
 * request, so read once, never on a poll. For a run still running with a step waiting on you, the branches read are the result steps'
 * (`resultSteps`), as the decision reads them once it is not. A folder run has no repository to ask, so none of git is read for it.
 * `standings` are none for a run that worked on its base branch itself, whose standing would read `main is on main`.
 */
export async function decisionOf(
  run: Run,
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  home: string,
  env: NodeJS.ProcessEnv,
): Promise<RunDecision> {
  const live = await runPlaced(placeService, e, standingWhen(runStore.runs.list(), run.id));
  const parent = await runWith(e, parentsRead(run, await runWith(e, live.when(waitedOn(run).length > 0))));
  const waiting = runWaitingOf(run, waitsOf(run, parent));
  const holding = holdingOf(run, holdsOf(run, parent));
  if (waiting) return { waiting, ...(holding ? { holding } : {}) };
  if (holding) return { holding };
  const folder = workflowsOf(run, home).steps;
  const views = await runWith(e, viewsOf(run, e));
  const judgedOver = (git: BranchReader) =>
    runPlaced(placeService, e, judge(run, stepNames(run, folder), folder, views, { reader: e, git, parent }));
  const { judged, git } = await judgedLive(judgedOver, (need) => runWith(e, live.when(need)));
  if (judged.status === 'cancelled') return { nothing: `cancelled at ${run.cancelledAt} — nothing to decide` };
  const decided = await runPlaced(placeService, e, decideRun(run.id, env, live));
  if (judged.status === 'running' && !judged.waitingOnYou.length) return { running: true, ...(decided.held ? { held: decided.held } : {}) };
  const d = decided.decision;
  const nothing = nothingOf(run, d);
  if (nothing) return { nothing };
  const steps = judgedSteps(run, folder);
  const collisions = decided.collisions ?? null;
  const { read, standings } = await branchesOf(
    e,
    placeService,
    run,
    git,
    steps,
    d.kind === 'awaiting' ? d.branches : undefined,
    collisions,
  );
  const touched = read.map(({ branch, radius }) => ({ branch, radius }));
  const filed = Object.keys(run.steps).filter((name) => run.steps[name]?.taskId);
  return {
    standings,
    touched,
    lesson: lessonOf(touched),
    sensitive: read.map(sensitiveOf),
    used: Object.fromEntries(filed.map((name) => [name, usedOf(decided.used[name], steps.find((s) => s.name === name)?.context)])),
    total: totalOf(
      steps,
      filed.map((name) => [name, decided.used[name]] as const),
    ),
    cost: decided.runCost[0]?.replace(/^cost\s+/, '') ?? null,
    overBudget: decided.overBudgetLine ?? null,
    commands: decided.commands,
    ...(decided.checkout ? { checkout: decided.checkout } : {}),
    awaiting: d.kind === 'awaiting' ? { branches: d.branches, direct: d.direct } : null,
    collisions,
  };
}

/**
 * A run judged first over nothing asked of git (`judgedOver`), then again over where its branches stand, asked then (`when`), unless it
 * is called off or running with nobody waited on, which reads none of it: the judgement, and the reader it was judged over.
 */
async function judgedLive<J extends { status: string; waitingOnYou: readonly unknown[] }>(
  judgedOver: (git: BranchReader) => Promise<J>,
  when: (need: boolean) => Promise<BranchReader>,
): Promise<{ judged: J; git: BranchReader }> {
  const unasked = await judgedOver(await when(false));
  const settled = unasked.status === 'cancelled' || (unasked.status === 'running' && !unasked.waitingOnYou.length);
  const git = await when(!settled);
  return { judged: settled ? unasked : await judgedOver(git), git };
}

/** What `nemia decide` says of a run with nothing to decide: called off, or its branches already on the base; undefined for any other. */
function nothingOf(run: Run, d: Decided['decision']): string | undefined {
  if (d.kind === 'cancelled') return `cancelled at ${d.at} — nothing to decide`;
  if (d.kind === 'shipped') return `shipped — ${d.branches.join(', ')} is already on ${run.branch}`;
  return undefined;
}

/**
 * What each branch the CLI reads changed (`branchesToRead`, `changesOf`), and where each result branch stands against the base
 * (`Standing`): the branches `awaiting` names, or the result steps' while the run still runs. None for a folder run, and no standings for a
 * run that worked on its base branch itself. Whether each branch ahead merges onto the base is the decision's own trial at an ending
 * (`collisions`), and the table's merge check (`MERGES`) at any other.
 */
async function branchesOf(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  run: Run,
  git: BranchReader,
  steps: Parameters<typeof resultSteps>[0],
  awaiting: string[] | undefined,
  collisions: Collisions | null,
) {
  const results = [
    ...new Set(
      resultSteps(steps)
        .map((s) => run.steps[s.name]?.branch)
        .filter((b): b is string => Boolean(b)),
    ),
  ];
  if (!isRepositoryRun(run)) return { read: [], standings: [] };
  const toRead = branchesToRead(
    awaiting ?? results,
    Object.values(run.steps).map((s) => s.branch),
    run.isolate ? run.branch : undefined,
  );
  const changes = changesOf(placeService, run, [...toRead, ...(run.isolate ? results : [])]);
  const read = toRead.map((branch) => changes.find((c) => c.branch === branch)!);
  if (!run.isolate) return { read, standings: [] };
  const stands = branchStandings(run, results, git);
  const merges = collisions
    ? Object.fromEntries(collisions.base.map(({ branch, ...merge }) => [branch, merge]))
    : await mergesOf(e, placeService, run, stands);
  const standings: Standing[] = stands.map((s) => ({
    ...s,
    said: branchWord(run, s),
    stat: statOf(changes.find((c) => c.branch === s.branch)!.radius),
    merge: s.where === 'ahead' ? (merges[s.branch] ?? null) : null,
  }));
  return { read, standings };
}

/** How much a branch changed, in `nemia decide`'s words (`countsLine`), or the sentence saying it is not known; null for nothing. */
const statOf = (radius: BranchChanges['radius']): string | null => ('error' in radius ? radius.error : countsLine(radius));

/**
 * Whether each branch ahead of the base still merges onto it (`StandingMerge`), keyed by branch, as the table's merge check answers it
 * (`MERGES`, served on the api alone); none asked when no branch is ahead, which nothing would merge.
 */
async function mergesOf(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  run: RepositoryRun,
  standings: readonly BranchStanding[],
) {
  const branches = standings.filter((s) => s.where === 'ahead').map((s) => s.branch);
  if (!branches.length) return {};
  return (await runPlaced(placeService, e, MERGES.handler({ runId: run.id, branches }))) as Record<string, StandingMerge>;
}
