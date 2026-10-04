/** The runs, for the board: every run listed, one run in full, and what `wf decide` shows of it. */
import { Hono } from 'hono';
import {
  type AtWork,
  atWork,
  type BranchReader,
  branchReader,
  COMMANDS,
  runStartedAt,
  type RunTokens,
  runTokens,
  unjudgedWord,
  verifiesRest,
  runStore,
  filedTimes,
  judgedSteps,
  stepNames,
  judgedUnlessUnreadable,
  type Unreadable,
  type Views,
  viewsFor,
  viewsOf,
  workflowsOf,
  tryOf,
  type GitAsked,
  judge,
  needsOf,
  type RunHolding,
  type RunStatus,
  type RunStoppedOn,
  type RunToDecide,
  type RunWaiting,
  type Spent,
  standingsOf,
  type StepNeeds,
  restingRead,
} from 'agent-orchestrator';
import { isGitRun, type PlaceKind, placeOf, prunedKept, prunedWords, type Run } from 'agent-orchestrator/run';
import { decisionOf } from '../decide/decision.ts';
import { detail } from '../detail/index.ts';
import { type RunGraph, runGraph } from 'agent-orchestrator';
import { type ApiEnv, type Served, served } from '../layer.ts';
import { type Engine, findRun, noSuchRun } from '../store.ts';

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  /** The repository a git run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  /** The factory the run was started in, as its record names it; null for a run in the default factory, whose record names none. */
  factory: string | null;
  /** The kind of workspace its steps work in: `git`, or `folder` for a team whose every step says `workspace: folder`. */
  place: PlaceKind;
  /** Where a folder run's work is (`workRoot`), which its card names in place of a repository; null on a git run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from, as `wf start` resolved it: its last segment names the workflow. */
  workflowDir: string;
  /** The agent it tried, for a try started from an agent's page (`tryOf`, try.ts); null for every other run. */
  try: { agent: string } | null;
  createdAt: string;
  /**
   * When the run started (`runStartedAt`): its first task's filing, off the engine's feed — for a run started `--after` runs, or held for a
   * run slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is
   * filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /**
   * That `wf prune` removed the run's worktrees, and its files too once `--artifacts` did, in `wf prune`'s words — what it removed and what
   * it kept — for the mark beside its status; null on a run never pruned.
   */
  pruned: { said: string } | null;
  /** The runs this one waits on (`wf start --after`), as the record froze them at start: none for a run started without. */
  after: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  /**
   * The runs a person holds this one until (`wf hold <run> --until <run>`), as its hold file names them: none for a run nobody holds, or
   * one called off.
   */
  heldUntil: string[];
  /**
   * The hold, in the package's words (`RunHolding`); null for a run nobody holds, and one called off. While it stands nothing of the run is
   * filed and nothing is asked of anyone: no step waits on you, and no verb is offered, as `wf ls` says it.
   */
  holding: RunHolding | null;
  status: RunStatus;
  /**
   * What stopped a `failed` run in which no step broke, as `wf decide` and the feed say it: `awaiting approval` for a run at its gate,
   * `blocked` for one whose step signed off blocked. Null for every other run, one whose step broke among them.
   */
  stoppedOn: RunStoppedOn | null;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   *
   * A run waiting on runs moves: the tick files its roots once they ship. Not one waiting on a run that never ships without a
   * person — no such run, a cancelled one, a result branch gone (`RunWaiting.onYou`): nothing the tick reads will change on its own.
   * A held run the same: it moves as it would unheld while the hold may lift on its own (`RunHolding.onYou`), and files nothing until then.
   */
  moving: boolean;
  /**
   * What the run has cost so far, every step's tries together, as `wf ls` adds it up on the run's line (`runSpend`); null until a cost was
   * measured.
   */
  cost: Spent | null;
  /**
   * How long the run has been at work (`atWork`): the time any session or check of it ran, two at once counted once, and a wait at a gate,
   * a hold, a slot or another run counted for nothing — `since` while a task runs, from which the board counts on, and `endedAt` once none
   * does. Null for a run not judged (`unreadable`).
   */
  atWork: AtWork | null;
  /**
   * The tokens its sessions used, every try's, and their split by the cache, in the package's words (`runTokens`); null until a session
   * measured any, and for a run not judged.
   */
  tokens: RunTokens | null;
  /**
   * `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. `note` is what `wf ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (wf round) — …` — and null where it prints nothing.
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null } & StepNeeds>;
  /** The steps as a graph, as the run's page has it (`runGraph`): the Factory's card draws its flow off it, with no read of the run. */
  graph: RunGraph;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget — on a run nobody has called off.
   */
  waitingOnYou: string[];
  /**
   * `waitingOnYou` as `wf ls` names it after `→ waiting on you:` (`onYouWords`), one entry a step, in its order: the step's name — and for
   * a step at its gate, what is asked of you, `approve plan`.
   */
  onYou: string[];
  /**
   * What a person has to decide about the run's result, when the run is at it and nobody has (`RunToDecide`); null while there is nothing.
   */
  toDecide: RunToDecide | null;
  /**
   * Why the run is not judged, when a task it reads — its own, or one of a run it waits on — has a journal that does not read, in the
   * runtime's words; null for every run whose tasks read. Such a run is answered off its record alone (`unjudged`), as the tick leaves it
   * where it is and counts it in flight: `running`, moving, its steps as the engine last read them and the unreadable one `unreadable`,
   * nothing waiting on you and nothing to decide.
   */
  unreadable: string | null;
};

/** A run's summary but when it started, which is read off the feed on each request, and what git was asked for it. */
type Judged = { summary: Omit<RunSummary, 'startedAt'>; asked: GitAsked };

async function summarize(run: Run, views: Views, reader: Engine['Service'], git: BranchReader, home: string): Promise<Judged> {
  const folder = workflowsOf(run, home).steps;
  const names = stepNames(run, folder);
  const asked: GitAsked = { branches: [], failed: false };
  const judged = await judge(run, names, folder, views, {
    reader,
    git,
    standings: (status, steps) => standingsOf(run, steps, status, git, asked),
  });
  const summary = {
    id: run.id,
    repo: run.repo ?? null,
    factory: run.factory ?? null,
    place: placeOf(run),
    work: isGitRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: run.after ?? [],
    waiting: judged.waiting,
    heldUntil: judged.holding ? run.hold!.until : [],
    holding: judged.holding,
    status: judged.status,
    stoppedOn: judged.stoppedOn,
    moving: judged.moving,
    cost: judged.cost,
    atWork: atWork(run, views),
    tokens: runTokens(run, views),
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: judged.words.get(name)!,
      note: judged.notes.get(name) ?? null,
      ...needsOf(run, name, views, judged),
    })),
    graph: runGraph(judgedSteps(run, folder), names),
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
    unreadable: null,
  };
  return { summary, asked };
}

/**
 * A run a task of which does not read, answered off its record: what it asked, where, its steps and their graph, and each step's word off
 * the views that did read — `unreadable` for a step any task of which does not, its check's or an earlier try's among them (`unjudgedWord`)
 * — with `said` as `unreadable`. Nothing judged: the tick does not advance it either, and counts it in flight, so it is `running` and
 * moving until the journal reads again.
 */
function unjudged(run: Run, views: Views, unreadable: Unreadable, said: string, home: string): Omit<RunSummary, 'startedAt'> {
  const folder = workflowsOf(run, home).steps;
  const names = stepNames(run, folder);
  const wordOf = unjudgedWord(views, unreadable);
  return {
    id: run.id,
    repo: run.repo ?? null,
    factory: run.factory ?? null,
    place: placeOf(run),
    work: isGitRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    try: tryOf(run, home),
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    pruned: run.pruned ? { said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}` } : null,
    after: run.after ?? [],
    waiting: null,
    heldUntil: run.hold && !run.cancelledAt ? run.hold.until : [],
    holding: null,
    status: 'running',
    stoppedOn: null,
    moving: true,
    cost: null,
    atWork: null,
    tokens: null,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: wordOf(run.steps[name]),
      note: null,
      needs: null,
      blockedByHarness: false,
      waitingFor: null,
      approve: null,
      denied: null,
    })),
    graph: runGraph(judgedSteps(run, folder), names),
    waitingOnYou: [],
    onYou: [],
    toDecide: null,
    unreadable: said,
  };
}

/** A run judged, or answered off its record (`unjudged`) when a task it reads does not (`judgedUnlessUnreadable`). */
async function judgedOrNot(
  run: Run,
  views: Views,
  unreadable: Unreadable,
  reader: Engine['Service'],
  git: BranchReader,
  home: string,
): Promise<Judged | { unjudged: Omit<RunSummary, 'startedAt'> }> {
  const one = await judgedUnlessUnreadable(run, unreadable, () => summarize(run, views, reader, git, home));
  return 'judged' in one ? one.judged : { unjudged: unjudged(run, views, unreadable, one.unreadable, home) };
}

/**
 * Runs judged now, as the list judges them and never from its memo: for a write that must know whether one still moves (a try, agents.ts).
 */
export async function judgedNow(e: Engine['Service'], home: string, some: readonly Run[]): Promise<Array<Omit<RunSummary, 'startedAt'>>> {
  const { views, reader, unreadable } = await viewsFor(e, some);
  const git = branchReader();
  const out: Array<Omit<RunSummary, 'startedAt'>> = [];
  for (const run of some) {
    const one = await judgedOrNot(run, views, unreadable, reader, git, home);
    out.push('unjudged' in one ? one.unjudged : one.summary);
  }
  return out;
}

/**
 * Whether a run's summary may be kept (`restingRead`): a run at rest, which nothing but a person, git or the engine's journals can move.
 * Its status final or the run pruned, nothing of it moving, waited on or held, every task it has filed settled, the workflow it is judged
 * by frozen on its record — a folder on disk is watched by nothing — and git's every answer given. The tick's own test (`atRest` in the
 * package's rest.ts) reads what a pass would file; this reads what the list says, which is what it keeps.
 */
async function atRest(run: Run, judged: Judged, reader: Engine['Service']): Promise<boolean> {
  const { summary, asked } = judged;
  if (!run.workflow || run.hold || asked.failed || summary.moving || summary.waiting || summary.holding) return false;
  if (!run.pruned && !['succeeded', 'failed', 'cancelled'].includes(summary.status)) return false;
  return [...(await viewsOf(run, reader)).values()].every((view) => view.state.settled);
}

/**
 * Every run's summary, in the store's order, as `GET /api/runs` answers it: through the app's engine and root, off its memo of runs at
 * rest (`ReadMemo`), verified as its environment says (`WF_VERIFY_REST`).
 */
async function listed({ e, env, home, memo }: Served): Promise<RunSummary[]> {
  const read = await restingRead(e, memo.resting, verifiesRest(env));
  const runs = runStore.runs.list();
  read.only(runs.map((run) => run.id));
  const filed = await filedTimes(e, memo.filings);
  const kept = new Map<string, Omit<RunSummary, 'startedAt'>>();
  const toJudge: Run[] = [];
  for (const run of runs) {
    const answer = read.kept(run);
    if (answer) kept.set(run.id, answer);
    if (!answer || read.verify) toJudge.push(run);
  }
  const { views, reader, unreadable } = await viewsFor(e, toJudge, () => runs);
  const git = branchReader();
  git.prime(toJudge);
  const judged = new Map<string, Judged>();
  const notJudged = new Map<string, Omit<RunSummary, 'startedAt'>>();
  for (const run of toJudge) {
    const one = await judgedOrNot(run, views, unreadable, reader, git, home);
    if ('unjudged' in one) {
      notJudged.set(run.id, one.unjudged);
      kept.delete(run.id);
      read.drop(run);
      continue;
    }
    judged.set(run.id, one);
    read.answered(run, one.summary);
    if (kept.has(run.id)) continue;
    if (await atRest(run, one, reader)) read.keep(run, one.summary, one.asked.branches, git.heads);
    else read.drop(run);
  }
  const summaries: RunSummary[] = runs.map((run) => {
    const summary = judged.get(run.id)?.summary ?? notJudged.get(run.id) ?? kept.get(run.id)!;
    if (kept.has(run.id)) read.hit();
    return { ...summary, startedAt: runStartedAt(run, filed) };
  });
  return summaries;
}

/** One run read for its page (`run`), an entry of the package's table the api serves alone: on `GET /api/runs/:id`. */
const RUN = COMMANDS.find((c) => c.name === 'run')!;

/**
 * The runs' routes: the list, one run in full, and what `wf decide` shows of it. The board's writes on a run — its removal and its prune
 * among them — are the command table's routes (`commands`, commands/routes.ts).
 *
 * - `GET /api/runs` — every run's summary (`RunSummary`), in the store's order. One request costs, however many runs there are, one
 *   harness observation (one `claude agents --json`, one scan of the detached runs' files), a read of every task journal in the engine's
 *   store, and each run's record and workflow folder. The records are read before the engine: `wf` files a step's task before it writes
 *   the id on the run, so every id read is in the listing that follows; the other way round, a task filed between the two reads would show
 *   as `unknown` until the next poll. A run that waits on runs reads each of them off the same views (`seenBy`): its record and git, and
 *   its tasks as they were listed. The feed's filing times are read once, on from where the last read stopped (`filedTimes`): when each
 *   run started. A run at rest is answered from the list's memo (`restingRead`) while nothing it was judged on has moved, so a poll reads
 *   the journals of the runs still moving and of none other; the rest are read through the request's own engine and git (`viewsFor`,
 *   `branchReader`). With `WF_VERIFY_REST` a kept answer is judged afresh too, and one that differs fails the request.
 * - `GET /api/runs/:id` — a run in full (`detail`), found by the package's entry (`run`): refused with a 404 when there is no such run,
 *   and with a 502 when a task it reads does not, in the words the list says it with (`RunSummary.unreadable`).
 * - `GET /api/runs/:runId/decision` — what `wf decide` shows a person (`decisionOf`), the route of its entry of the command table. Not on
 *   the page's poll, since it runs `git diff`. Refused as the run's page is: a 404 with no such run, and a 502 when a task it reads does
 *   not, in the words the list says it with (`RunSummary.unreadable`).
 */

export const runs = new Hono<ApiEnv>()
  .get('/api/runs', (c) => served(c, async (s) => c.json(await listed(s))))
  .get('/api/runs/:id', (c) =>
    served(c, async (s) => {
      const id = c.req.param('id');
      const { run } = (await RUN.handler(s.e, { id })) as { run: Run | null };
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const full = await detail(run, s);
      if ('unjudged' in full) return c.json({ error: full.unjudged }, 502);
      return c.json(full);
    }),
  )
  .get('/api/runs/:runId/decision', (c) =>
    served(c, async ({ e, home, env }) => {
      const id = c.req.param('runId');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const { unreadable } = await viewsFor(e, [run]);
      const read = await judgedUnlessUnreadable(run, unreadable, () => decisionOf(run, e, home, env));
      if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
      return c.json(read.judged);
    }),
  );
