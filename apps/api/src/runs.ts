/** The runs, for the board: every run listed, one run in full, and what `wf decide` shows of it. */
import { Hono } from 'hono';
import { listRuns, runStartedAt } from 'agent-workflows';
import { isGitRun, type PlaceKind, placeOf, type Run } from 'agent-workflows/run';
import { decisionOf } from './decision.ts';
import { detail } from './detail.ts';
import { judge, needsOf, type RunStatus, type RunToDecide, type RunWaiting, type Spent, standingsOf, type StepNeeds, waitsIn } from './judged.ts';
import { everyView, filedTimes, findRun, noSuchRun, seenBy, stepNames, type Views, workflowsOf } from './store.ts';

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  /** The repository a git run is about; null for a folder run (`place`), which has none. */
  repo: string | null;
  /** The kind of workspace its steps work in: `git`, or `folder` for a team whose every step says `workspace: folder`. */
  place: PlaceKind;
  /** Where a folder run's work is (`workRoot`), which its card names in place of a repository; null on a git run. */
  work: string | null;
  brief: string;
  /** The workflow folder the run was started from, as `wf start` resolved it: its last segment names the workflow. */
  workflowDir: string;
  createdAt: string;
  /**
   * When the run started (`runStartedAt`): its first task's filing, off the engine's feed — for a run started `--after` runs, or held for a
   * run slot, well after `createdAt`. `createdAt` for a run started whose filings the feed does not have; null while nothing of it is filed.
   */
  startedAt: string | null;
  cancelledAt: string | null;
  /** The runs this one waits on (`wf start --after`), as the record froze them at start: none for a run started without. */
  after: string[];
  /** The runs its roots still wait on, in the package's words (`RunWaiting`); null once there are none, or the run has started. */
  waiting: RunWaiting | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   *
   * A run waiting on runs moves: the tick files its roots once they ship. Not one waiting on a run that never ships without a
   * person — no such run, a cancelled one, a result branch gone (`RunWaiting.onYou`): nothing the tick reads will change on its own.
   */
  moving: boolean;
  /** What the run has cost so far, every step's tries together, as `wf ls` adds it up on the run's line (`runSpend`); null until a cost was measured. */
  cost: Spent | null;
  /**
   * `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. `note` is what `wf ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (wf round) — …` — and null where it prints nothing.
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null } & StepNeeds>;
  /**
   * Steps a person has to act on — blocked, unsigned, refused by their check, awaiting approval at their gate, out of rounds or past their
   * budget — on a run nobody has called off.
   */
  waitingOnYou: string[];
  /**
   * `waitingOnYou` as `wf ls` names it after `→ waiting on you:` (`onYouWords`), one entry a step, in its order: the step's name — and for a
   * step at its gate, what is asked of you, `approve plan`.
   */
  onYou: string[];
  /** What a person has to decide about the run's result, when the run is at it and nobody has (`RunToDecide`); null while there is nothing. */
  toDecide: RunToDecide | null;
};

async function summarize(run: Run, views: Views, filed: ReadonlyMap<string, string>): Promise<RunSummary> {
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const judged = judge(run, names, folder, views, await waitsIn(run, seenBy(views)), (status, steps) => standingsOf(run, steps, status));
  return {
    id: run.id,
    repo: run.repo ?? null,
    place: placeOf(run),
    work: isGitRun(run) ? null : run.workspace,
    brief: run.brief,
    workflowDir: run.workflowDir,
    createdAt: run.createdAt,
    startedAt: runStartedAt(run, filed),
    cancelledAt: run.cancelledAt ?? null,
    after: run.after ?? [],
    waiting: judged.waiting,
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
    waitingOnYou: judged.waitingOnYou,
    onYou: judged.onYou,
    toDecide: judged.toDecide,
  };
}

export const runs = new Hono()
  .get('/api/runs', async (c) => {
    // What one request costs, however many runs there are: one harness observation (one
    // `claude agents --json`, one scan of the detached runs' files), a read of every task journal in
    // the engine's store, and each run's record and workflow folder. It was a `view` — so an
    // observation — per filed step of every run: dozens of `claude agents` calls a poll.
    //
    // The records before the engine: `wf` files a step's task before it writes the id on the run, so
    // every id read here is in the listing that follows. The other way round, a task filed between
    // the two reads would show as `unknown` until the next poll.
    //
    // A run that waits on runs reads each of them off the same views (`seenBy`): its record and git, and its tasks as they were listed.
    //
    // And the feed's filing times, once, read on from where the last read stopped (`filedTimes`): when each run started.
    const runs = listRuns();
    const views = await everyView();
    const filed = await filedTimes();
    const summaries: RunSummary[] = [];
    for (const run of runs) summaries.push(await summarize(run, views, filed));
    return c.json(summaries);
  })
  .get('/api/runs/:id', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await detail(run));
  })
  // What `wf decide` shows a person (`decisionOf`): not on the page's poll, since it runs `git diff`.
  .get('/api/runs/:id/decision', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await decisionOf(run));
  });
