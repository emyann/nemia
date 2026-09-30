/** The runs, for the board: every run listed, one run in full, and what `wf decide` shows of it. */
import { isDeepStrictEqual } from 'node:util';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  type BranchReader,
  branchReader,
  forget,
  prune,
  runStartedAt,
  unhold,
  unjudgedWord,
  verifiesRest,
  runStore,
} from 'agent-orchestrator';
import { isRefusal } from 'agent-orchestrator/effect';
import { isGitRun, type PlaceKind, placeOf, pruneLines, prunedKept, prunedWords, type Run } from 'agent-orchestrator/run';
import { readBody, type BodyIssue } from '../body.ts';
import { decisionOf } from '../decide/index.ts';
import { detail } from '../detail/index.ts';
import {
  type Asked,
  holdsIn,
  judge,
  needsOf,
  type RunHolding,
  type RunStatus,
  type RunToDecide,
  type RunWaiting,
  type Spent,
  standingsOf,
  type StepNeeds,
  waitsIn,
} from './judged.ts';
import { type RunGraph, runGraph } from './graph.ts';
import { restingRead } from './resting.ts';
import { refusedBeforeReading, type Guarded } from '../guard.ts';
import { tryOf } from '../agents/try.ts';
import { type ApiEnv, type Served, served } from '../layer.ts';
import {
  type Engine,
  filedTimes,
  findRun,
  judgedSteps,
  noSuchRun,
  stepNames,
  judgedUnlessUnreadable,
  type Unreadable,
  type Views,
  viewsFor,
  viewsOf,
  workflowsOf,
} from '../store.ts';

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
type Judged = { summary: Omit<RunSummary, 'startedAt'>; asked: Asked };

async function summarize(run: Run, views: Views, reader: Engine['Service'], git: BranchReader, home: string): Promise<Judged> {
  const folder = workflowsOf(run, home).steps;
  const names = stepNames(run, folder);
  const asked: Asked = { branches: [], failed: false };
  const judged = judge(run, names, folder, views, await waitsIn(run, reader, git), await holdsIn(run, reader, git), (status, steps) =>
    standingsOf(run, steps, status, git, asked),
  );
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
    moving: judged.moving,
    cost: judged.cost,
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
    moving: true,
    cost: null,
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

const REMOVE_SHAPE = '`{}`';

/** A removal of a try's run, as the guard's refusals word it (guard.ts). */
const removeGuard = (route: string): Guarded => ({
  route,
  does: 'removes a run',
  forAnother: 'remove one',
  why: 'a run removed takes its record and every folder it worked in with it, and nothing brings them back',
  reach: "remove it on the board's run page",
  instead: "Remove it on the board's run page, or with `wf rm`",
  shape: REMOVE_SHAPE,
});

/** A person's hold lifted, as the guard's refusals word it (guard.ts). */
const liftGuard = (route: string): Guarded => ({
  route,
  does: "lifts a run's hold",
  forAnother: 'lift one',
  why: 'a hold lifted lets the run go on at the next tick, its steps filed and what they asked asked again',
  reach: "lift it on the board's run page",
  instead: "Lift it on the board's run page, or with `wf hold <run> --off`",
  shape: '`{}`',
});

/** What a prune takes, as its refusal of another content type says it: `wf prune`'s two flags, each a switch. */
const PRUNE_SHAPE = '`{ "artifacts"?: boolean, "unmerged"?: boolean }`';

/** A finished run pruned, as the guard's refusals word it (guard.ts). */
const pruneGuard = (route: string): Guarded => ({
  route,
  does: 'prunes a run',
  forAnother: 'prune one',
  why: 'a run pruned has its worktrees removed, and its files with `artifacts`, and none of its steps can be tried again, sent round or approved',
  reach: "prune it on the board's run page",
  instead: "Prune it on the board's run page, or with `wf prune <run>`",
  shape: PRUNE_SHAPE,
});

/**
 * A prune's body, as `wf prune` reads its flags: `artifacts` is `--artifacts` and `unmerged` is `--unmerged`, each absent or a boolean, and
 * nothing else — decoded with `onExcessProperty: 'error'` (`PRUNE_OPTIONS`), which reads a key it does not have before those it does.
 */
const PRUNE_BODY = Schema.Struct({ artifacts: Schema.optionalKey(Schema.Boolean), unmerged: Schema.optionalKey(Schema.Boolean) });
const PRUNE_OPTIONS = { onExcessProperty: 'error' } as const;
const PRUNE_FLAGS = { artifacts: '--artifacts', unmerged: '--unmerged' } as const;

/** Why a prune's body is not one (400), by the first thing its schema refused: every key it does not take, named at once. */
function pruneWords({ path: [key], kind, input }: BodyIssue, body: unknown): string {
  if (kind === 'excess' && typeof body === 'object' && body !== null) {
    const unknown = Object.keys(body).filter((k) => !Object.hasOwn(PRUNE_FLAGS, k));
    return `POST …/prune does not take ${unknown.map((k) => `\`${k}\``).join(', ')}: it takes ${PRUNE_SHAPE}, as \`wf prune\` takes --artifacts and --unmerged.`;
  }
  if (key === 'artifacts' || key === 'unmerged')
    return `POST …/prune takes \`${key}\` as true or false — \`wf prune\`'s ${PRUNE_FLAGS[key]} — and this request sent ${JSON.stringify(input)}.`;
  return `POST …/prune takes a JSON object: ${PRUNE_SHAPE}.`;
}

/**
 * Whether a run's summary may be kept (`resting.ts`): a run at rest, which nothing but a person, git or the engine's journals can move. Its
 * status final or the run pruned, nothing of it moving, waited on or held, every task it has filed settled, the workflow it is judged by
 * frozen on its record — a folder on disk is watched by nothing — and git's every answer given. The tick's own test (`atRest` in the
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
    const was = kept.get(run.id);
    if (was && !isDeepStrictEqual(was, one.summary)) {
      throw new Error(
        `The list's memo of runs at rest answered ${run.id} differently from a fresh read (WF_VERIFY_REST): something it was judged on is not watched.`,
      );
    }
    if (was) continue;
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

/**
 * The runs' routes: the list, one run in full, what `wf decide` shows of it, and the three writes the board makes on a run.
 *
 * - `GET /api/runs` — every run's summary (`RunSummary`), in the store's order. One request costs, however many runs there are, one
 *   harness observation (one `claude agents --json`, one scan of the detached runs' files), a read of every task journal in the engine's
 *   store, and each run's record and workflow folder. The records are read before the engine: `wf` files a step's task before it writes
 *   the id on the run, so every id read is in the listing that follows; the other way round, a task filed between the two reads would show
 *   as `unknown` until the next poll. A run that waits on runs reads each of them off the same views (`seenBy`): its record and git, and
 *   its tasks as they were listed. The feed's filing times are read once, on from where the last read stopped (`filedTimes`): when each
 *   run started. A run at rest is answered from the list's memo (`resting.ts`) while nothing it was judged on has moved, so a poll reads
 *   the journals of the runs still moving and of none other; the rest are read through the request's own engine and git (`viewsFor`,
 *   `branchReader`). With `WF_VERIFY_REST` a kept answer is judged afresh too, and one that differs fails the request.
 * - `GET /api/runs/:id` — a run in full (`detail`): refused with a 404 when there is no such run, and with a 502 when a task it reads does
 *   not, in the words the list says it with (`RunSummary.unreadable`).
 * - `GET /api/runs/:id/decision` — what `wf decide` shows a person (`decisionOf`). Not on the page's poll, since it runs `git diff`.
 *   Refused as the run's page is: a 404 with no such run, and a 502 when a task it reads does not, in the words the list says it with
 *   (`RunSummary.unreadable`).
 * - `DELETE /api/runs/:id` — a try's run removed, as `wf rm` removes it (`forget`): its record, and the folders it worked in with it.
 *   Guarded as a write (`removeGuard`). Only a try: any other run is a 409 naming `wf rm`, which says what it hands off and what it leaves,
 *   and a git run's worktrees and branches are a person's to read before they go. A try still working is a 409 in the package's words; a
 *   thrown refusal of the package's goes to `app.onError`, which answers it by its kind (app.ts), and any other failure is a 500.
 * - `DELETE /api/runs/:id/hold` — a person's hold lifted, as `wf hold <run> --off` lifts it (`unhold`): its file removed, and the run goes
 *   on at the next tick, what its steps asked while it was held asked again. Guarded as a write (`liftGuard`). Refused in the package's
 *   words, by `app.onError`: a run nobody holds — a pruned one among them, since no verb holds one — and a hold put again as it was lifted
 *   are a 409 (`Conflict`), a run gone since the route read it a 404; any other failure is a 502. No feed line: the tick is the feed's one
 *   writer, and the board reads the run again itself.
 * - `POST /api/runs/:id/prune` — a finished run pruned, as `wf prune <run> --yes` prunes it (`prune`), with `artifacts` its `--artifacts`
 *   and `unmerged` its `--unmerged` (`PRUNE_BODY`): its worktrees removed, and its files with `artifacts`; its record and every branch
 *   kept. Guarded as a write (`pruneGuard`). The page asks twice before it sends this, so there is no dry run here. The package decides
 *   everything and words it, and the api maps its answer to a status: refused (a folder run, a run not over, a finished run nobody merged
 *   without `unmerged`, a worktree holding what no commit has…) and nothing left to prune (one pruned already) are each a 409 in `wf
 *   prune`'s words alone, as `DELETE …` sends `forget`'s, the page saying `Not pruned` above them itself (`Refusal`); a thrown refusal of
 *   the package's goes to `app.onError`, which answers it by its kind, and any other failure is a 502. No feed line: the marker the prune
 *   writes moves the run's stamp in `runStore`, and the board reads the run again itself.
 */

export const runs = new Hono<ApiEnv>()
  .get('/api/runs', (c) => served(c, async (s) => c.json(await listed(s))))
  .get('/api/runs/:id', (c) =>
    served(c, async (s) => {
      const id = c.req.param('id');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const full = await detail(run, s);
      if ('unjudged' in full) return c.json({ error: full.unjudged }, 502);
      return c.json(full);
    }),
  )
  .delete('/api/runs/:id', (c) =>
    served(c, async ({ e, home }) => {
      const id = c.req.param('id');
      const route = `DELETE /api/runs/${id}`;
      const refused = refusedBeforeReading(
        removeGuard(route),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      if (!tryOf(run, home)) {
        return c.json(
          {
            error: `${route}: the board removes only a try, a run started from an agent's page, and ${id} is a run of ${run.workflowDir}. Remove it with \`wf rm ${id}\`, which says what it hands off and what it leaves.`,
          },
          409,
        );
      }
      const gone = await forget(e, id);
      if (gone.kind === 'refused') return c.json({ error: gone.refusal }, 409);
      return c.json({ id, removed: true });
    }),
  )
  .delete('/api/runs/:id/hold', async (c) => {
    const id = c.req.param('id');
    const route = `DELETE /api/runs/${id}/hold`;
    const refused = refusedBeforeReading(
      liftGuard(route),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
    try {
      const { hold } = unhold(id);
      return c.json({ id, lifted: true, hold });
    } catch (err) {
      if (isRefusal(err)) throw err;
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: `${route}: the hold was not lifted — ${message}. Lift it with \`wf hold ${id} --off\`.` }, 502);
    }
  })
  .post('/api/runs/:id/prune', (c) =>
    served(c, async ({ e }) => {
      const id = c.req.param('id');
      const route = `POST /api/runs/${id}/prune`;
      const refused = refusedBeforeReading(
        pruneGuard(route),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const read = await readBody(c.req, PRUNE_BODY, `POST …/prune takes a JSON body: ${PRUNE_SHAPE}.`, pruneWords, PRUNE_OPTIONS);
      if ('status' in read) return c.json({ error: read.error }, read.status);
      if (!findRun(id)) return c.json({ error: noSuchRun(id) }, 404);
      try {
        const { artifacts = false, unmerged = false } = read.body;
        const p = await prune(e, id, { artifacts, unmerged, yes: true });
        if (p.kind === 'refused') return c.json({ error: p.refusal }, 409);
        if (p.kind === 'nothing') return c.json({ error: `Nothing to prune: ${p.nothing}.` }, 409);
        return c.json({ id, pruned: true, lines: pruneLines(p), worktrees: p.worktrees, artifacts: p.artifacts ?? null, left: p.left });
      } catch (err) {
        if (isRefusal(err)) throw err;
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: `${route}: ${id} was not pruned — ${message}. Prune it with \`wf prune ${id}\`.` }, 502);
      }
    }),
  )
  .get('/api/runs/:id/decision', (c) =>
    served(c, async ({ e, home }) => {
      const id = c.req.param('id');
      const run = findRun(id);
      if (!run) return c.json({ error: noSuchRun(id) }, 404);
      const { unreadable } = await viewsFor(e, [run]);
      const read = await judgedUnlessUnreadable(run, unreadable, () => decisionOf(run, e, home));
      if ('unreadable' in read) return c.json({ error: read.unreadable }, 502);
      return c.json(read.judged);
    }),
  );
