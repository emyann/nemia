/**
 * A run's decision, the one read model of what a person decides about a run (`decisionRead`, `runDecision`): what
 * `GET /api/runs/:runId/decision` serves as objects' `RunDecision` and `nemia decide` prints its screen off. Data, never lines: each
 * sentence in it is the package's own, without a screen's label. A controller, run with `runWith` over the engine, the place and the
 * store's root.
 */
import { Effect } from 'effect';
import type { Decidable, DiffFile, RunDecision, SensitiveDiff, Standing } from 'objects';
import { EngineService, over } from '../runtime-client.ts';
import { StoreRoot } from '../config/root.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { isRepositoryRun, namesInOrder, type Run } from '../record/record.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { approvedFirst, branchWord } from '../status/status.ts';
import { waitedOn } from '../wait/wait.ts';
import { standingWhen } from '../standing/standing.verb.ts';
import { parentsRead, viewedOnce } from '../views/views.verb.ts';
import { holdingOf, judge, runWaitingOf } from '../summary/judged.verb.ts';
import { judgedSteps, judgedUnlessUnreadable, stepNames, viewsFor, viewsOf, workflowsOf } from '../summary/reads.verb.ts';
import { branchesToRead, CHECK_AFFECTING, countsLine, lessonOf, resultSteps } from '../branches/index.ts';
import { branchStandings, type BranchReader } from '../branches/branches.store.ts';
import { changesOf, type BranchChanges } from '../branches/changes.store.ts';
import { mergesRead } from '../branches/merges.verb.ts';
import type { Collisions } from '../collide/collide.ts';
import { totalOf, usedOf } from '../resource/usage.ts';
import { decideRun, type Decided } from './decide.verb.ts';
import { holdsOf, waitsOf } from '../wait/wait.ts';

/** How many lines of one file's check-affecting diff a decision carries. `nemia decide` prints them all, off the place's whole diff. */
export const DIFF_LINES = 400;

/**
 * What a read of a run's decision gives: the run as the store has it, the decision (`RunDecision`); the package's whole reading of the
 * run (`Decided`), where the decision read it — a run running, held by the cap, or decidable — and what each branch read changed
 * (`touched`, with the diffs of the files `sensitive` names) and what each result branch the run awaits changed (`results`), each as the
 * place said it, for a screen that prints them whole.
 */
export type DecisionRead = { run: Run; decision: RunDecision; decided?: Decided; touched: BranchChanges[]; results: BranchChanges[] };

/** How a decision is read: the globs whose changed files' diffs it carries, the check-affecting ones by default. */
export type DecisionHow = { sensitive?: readonly string[] };

/**
 * A diff `git diff` gave for several files, one entry per file, each cut to `DIFF_LINES`. Named for a person — `from → to` for a rename —
 * off the file's own header lines, before its first hunk.
 */
export function diffFiles(diff: string): DiffFile[] {
  const files: string[][] = [];
  for (const line of diff.replace(/\n$/, '').split('\n')) {
    const last = files.at(-1);
    if (line.startsWith('diff --git ') || last === undefined) files.push([line]);
    else last.push(line);
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

/** A branch's check-affecting diff, off what the place gave (`BranchChanges.inFull`): an error, none, or the files. */
function sensitiveOf({ branch, inFull }: BranchChanges): SensitiveDiff {
  if (typeof inFull !== 'string') return { branch, files: [], error: inFull.error };
  return { branch, files: inFull.trim() ? diffFiles(inFull) : [], error: null };
}

/**
 * A run's decision, in one order. Called off is `nothing`, and nothing is read. Then the runs it waits on and is held until, each read
 * once (`parentsRead`): a run whose roots wait on runs that have not landed is `waiting` — with its hold beside it — and one a person holds
 * is `holding`; none of its tasks is read for either. Else the run is judged (`judge`) and decided (`decideRun`), where its branches stand
 * asked of their places at most once, live (`standingWhen`), and only where it is read. A run the cap on runs in flight holds is `running`
 * with its slot (its `WF_MAX_RUNS` before any pass is `env`'s), as is a run still running with nobody waited on. A run whose branches are
 * already on its base is `nothing`, with an approved ending that never ran named. Else what there is to decide (`Decidable`), with the
 * branches read: the ones the run awaits, or the result steps' while a run still running has a step waiting on you, and every branch a
 * step worked on when no terminal step has one (`branchesToRead`), never the base branch of a run that cut worktrees, each read from the
 * run's place on this read (`changesOf`). What the place could not say is an `error` on its entry, never a failed read. A folder run has
 * no repository to ask, and a run that worked on its base branch itself no standings.
 *
 * Fails with `Missing` for a run the store does not have; a journal that does not read fails as the runtime fails it (`runDecision`
 * words it).
 */
export const decisionRead = Effect.fn('decisionRead')(function* (id: string, env: NodeJS.ProcessEnv = process.env, how: DecisionHow = {}) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const none = { run, touched: [], results: [] };
  if (run.cancelledAt)
    return { decision: { nothing: `cancelled at ${run.cancelledAt} — nothing to decide` }, ...none } satisfies DecisionRead;
  const e = viewedOnce(yield* EngineService);
  const live = yield* standingWhen(yield* (yield* RunDoor).runs.list(), run.id);
  const parent = yield* parentsRead(run, yield* live.when(waitedOn(run).length > 0)).pipe(over(e));
  const waiting = runWaitingOf(run, waitsOf(run, parent));
  const holding = holdingOf(run, holdsOf(run, parent));
  if (waiting) return { decision: { waiting, ...(holding ? { holding } : {}) }, ...none } satisfies DecisionRead;
  if (holding) return { decision: { holding }, ...none } satisfies DecisionRead;
  const folder = workflowsOf(run, yield* StoreRoot).steps;
  const views = yield* viewsOf(run, e);
  const judgedOver = (git: BranchReader) => judge(run, stepNames(run, folder), folder, views, { reader: e, git, parent });
  const unasked = yield* judgedOver(yield* live.when(false));
  const settled = unasked.status === 'running' && !unasked.waitingOnYou.length;
  const git = yield* live.when(!settled);
  const judged = settled ? unasked : yield* judgedOver(git);
  const decided = yield* decideRun(run.id, env, live).pipe(over(e));
  if (decided.held) return { decision: { running: true, held: decided.held }, decided, ...none } satisfies DecisionRead;
  if (judged.status === 'running' && !judged.waitingOnYou.length)
    return { decision: { running: true }, decided, ...none } satisfies DecisionRead;
  const d = decided.decision;
  if (d.kind === 'landed')
    return { decision: { nothing: landedWords(run, d.branches, decided.steps) }, decided, ...none } satisfies DecisionRead;
  const steps = judgedSteps(run, folder);
  const collisions = decided.collisions ?? null;
  const read = yield* branchesOf(run, git, steps, decided, d.kind === 'awaiting' ? d.branches : undefined, collisions, how);
  const touched = read.touched.map(({ branch, radius }) => ({ branch, radius }));
  const filed = Object.keys(run.steps).filter((name) => run.steps[name]?.taskId);
  const decision: Decidable = {
    standings: read.standings,
    touched,
    lesson: lessonOf(touched),
    sensitive: read.touched.map(sensitiveOf),
    used: Object.fromEntries(filed.map((name) => [name, usedOf(decided.used[name], steps.find((s) => s.name === name)?.context)])),
    total: totalOf(
      steps,
      filed.map((name) => [name, decided.used[name]] as const),
    ),
    cost: decided.runCostSaid,
    overBudget: decided.overBudgetLine ?? null,
    commands: decided.commands,
    ...(decided.checkout ? { baseHeldBy: decided.checkout } : {}),
    awaiting: d.kind === 'awaiting' ? { branches: d.branches, direct: d.direct } : null,
    collisions,
  };
  return { run, decision, decided, touched: read.touched, results: read.results } satisfies DecisionRead;
});

/**
 * A run's decision as the api serves it (`decisionRead`), or why it is not judged, in the words the board says it with
 * (`judgedUnlessUnreadable`): its unfrozen workflow folder that does not load, or a task's journal the runtime left out. Its tasks and
 * those of the runs it waits on are read once, over one look at the harnesses (`viewsFor`), which
 * the decision reads them through.
 */
export const runDecision = Effect.fn('runDecision')(function* (id: string, env: NodeJS.ProcessEnv = process.env) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(id));
  const { unreadable, reader } = yield* viewsFor(yield* EngineService, [run]);
  const read = yield* judgedUnlessUnreadable(run, unreadable, () => decisionRead(id, env).pipe(over(reader)));
  const answer: { decision: RunDecision } | { unjudged: string } =
    'unreadable' in read ? { unjudged: read.unreadable } : { decision: read.judged.decision };
  return answer;
});

/** What a run whose branches are already on its base says: that, and an ending approved first that never ran, nothing left for it. */
function landedWords(run: Run, branches: readonly string[], steps: Decided['steps']): string {
  const unrun = steps.find((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId);
  const never = unrun
    ? `\n  ${unrun.name} never ran: nothing is left for it to merge, and nothing waits on you — close the record if you want it closed: nemia cancel ${run.id}`
    : '';
  return `landed — ${branches.join(', ')} is already on ${run.branch}${never}`;
}

/** What `branch` changed among `changes`, which `changesOf` gives for each branch it was asked: thrown, naming it, where none. */
function changeOf(changes: readonly BranchChanges[], branch: string): BranchChanges {
  const change = changes.find((c) => c.branch === branch);
  if (change === undefined) throw new Error(`\`changesOf\` gave nothing for the branch ${branch}, which it was asked to read.`);
  return change;
}

/**
 * What each branch to read changed (`branchesToRead`, in the order the run's steps run, `namesInOrder`), what each branch the run awaits
 * changed, and where each result branch stands against the base (`Standing`), all off one read of the place (`changesOf`). Whether each
 * branch ahead merges onto the base is the decision's own trial at an ending (`collisions`), and a trial merge (`mergesRead`) at any other.
 */
const branchesOf = Effect.fnUntraced(function* (
  run: Run,
  git: BranchReader,
  steps: Parameters<typeof resultSteps>[0],
  decided: Decided,
  awaiting: string[] | undefined,
  collisions: Collisions | null,
  how: DecisionHow,
): Effect.fn.Return<{ touched: BranchChanges[]; results: BranchChanges[]; standings: Standing[] }, Refusal, PlaceService> {
  if (!isRepositoryRun(run)) return { touched: [], results: [], standings: [] };
  const place = yield* PlaceService;
  const results = [
    ...new Set(
      resultSteps(steps)
        .map((s) => run.steps[s.name]?.branch)
        .filter((b): b is string => Boolean(b)),
    ),
  ];
  const branches = awaiting ?? results;
  const toRead = branchesToRead(
    branches,
    namesInOrder(run, decided.steps).map((name) => run.steps[name]?.branch),
    run.isolate ? run.branch : undefined,
  );
  const changes = changesOf(place, run, [...toRead, ...branches, ...(run.isolate ? results : [])], how.sensitive ?? CHECK_AFFECTING);
  const touched = toRead.map((branch) => changeOf(changes, branch));
  const read = branches.map((branch) => changeOf(changes, branch));
  if (!run.isolate) return { touched, results: read, standings: [] };
  const stands = branchStandings(run, results, git);
  const merges = collisions
    ? Object.fromEntries(collisions.base.map(({ branch, ...merge }) => [branch, merge]))
    : yield* mergesRead(
        run.id,
        stands.filter((s) => s.where === 'ahead').map((s) => s.branch),
      );
  const standings = stands.map((s) => ({
    ...s,
    said: branchWord(run, s),
    stat: statOf(changeOf(changes, s.branch).radius),
    merge: s.where === 'ahead' ? (merges[s.branch] ?? null) : null,
  }));
  return { touched, results: read, standings };
});

/** How much a branch changed, in `nemia decide`'s words (`countsLine`), or the sentence saying it is not known; null for nothing. */
const statOf = (radius: BranchChanges['radius']): string | null => ('error' in radius ? radius.error : countsLine(radius));
