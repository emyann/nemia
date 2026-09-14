import fs from 'node:fs';
import { Hono } from 'hono';
import { checkStderr, closeoutAsked, closeoutOf, closeoutReader, engine, exitVerdicts, listRuns, phaseOfView, readAsks, verdictWord } from 'agent-workflows';
import { assess, composeBrief, inFlight, listing, type Assessment, type Run } from 'agent-workflows/run';
import { loadWorkflows, type Workflow } from 'agent-workflows/workflow';
import { capabilitiesOf, repoOf } from './capabilities.ts';
import { graphOf, type RunGraph } from './graph.ts';
import { workflows } from './workflows.ts';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  /** The workflow folder the run was started from, as `wf start` resolved it: its last segment names the workflow. */
  workflowDir: string;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /**
   * Whether anything of the run still moves: a task the engine holds for it — a step's or a check's, filed
   * and not settled — or a step, a check, a try or a round a tick would still file. `status` does not say: `assess` reads a
   * fan-out as failed once one step is final without letting its followers run, while a sibling still works.
   */
  moving: boolean;
  /**
   * `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. `note` is what `wf ls` prints
   * beside it, for a step tried again or about to be, or in a loop past its first round — `try 2, by retries: 1`,
   * `round 2 of 3`, `round 3 asked (wf round) — …` — and null where it prints nothing.
   */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string; note: string | null }>;
  /** Steps a person has to act on — blocked, unsigned, refused by their check, or a loop out of rounds — on a run nobody has called off. */
  waitingOnYou: string[];
};

/** A step's frontmatter, from the workflow the run is judged by. `null` where the step does not set it. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  after: string[];
  resume: string | null;
  permissionMode: string | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
  /** The step a round runs again, on a looping step. */
  loop: string | null;
  /** How many rounds its loop may run, the first included: set on every looping step, as the parser sets it. */
  rounds: number | null;
};

/** How a step signed off, when it did. */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: string[];
};

/**
 * The command a step is judged by, and what it said once it refused.
 *
 * `command` is from the workflow the run froze at `wf start`: the one the run executes. `refused` is set
 * once the check settled failed or stopped: `exit` in `wf ls`'s words (`exit 1`, `unfinished`), then the
 * end of each of its streams, as `wf decide` shows them.
 */
export type StepCheck = {
  command: string;
  refused: {
    exit: string;
    stdout: StepLog;
    stderr: StepLog;
    /** Why its output could not be read, when it could not. */
    unreadable: string | null;
  } | null;
};

/** One run in full, for a person reading it: the spec, and per step what it was told and how it went. */
export type RunDetail = {
  id: string;
  brief: string;
  repo: string;
  workflowDir: string;
  baseRef: string;
  branch: string;
  isolate: boolean;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /** As on `RunSummary`. */
  moving: boolean;
  waitingOnYou: string[];
  /** Set when the workflow folder cannot be read, or no longer has the steps the run started with. */
  warning: string | null;
  /**
   * The steps as a graph, from the workflow the run is judged by (`judgedSteps`), for every client to draw the same:
   * `graphOf`. A step the page shows and that workflow does not have waits on nothing, so it is a root.
   */
  graph: RunGraph;
  /** The recorded steps in the order the run started with them, then — on a record from before runs froze their workflow — any the folder has gained. */
  steps: Array<{
    name: string;
    /** From the workflow the run froze at `wf start`; for a record from before runs froze one, the folder. */
    spec: StepSpec | null;
    body: string | null;
    /** For a filed step, the brief the engine was filed with; for one not yet filed, what it would be given now. */
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    branch: string | null;
    status: string;
    /** As on `RunSummary`. */
    note: string | null;
    closeout: StepCloseout | null;
    /** Null for a step with no `check:` in the workflow the run froze. */
    check: StepCheck | null;
    attempts: StepAttempts;
  }>;
};

/** A step's attempts as the engine's view has them: how many, and when and how the latest went. */
export type StepAttempts = {
  count: number;
  latest: {
    startedAt: string;
    /** The harness's last word on the attempt — `done`, `failed`, `stopped`; null while it runs. */
    ended: string | null;
    /** When it ended: the `at` of the engine's `ended` event, kept as `Attempt.endedAt`; null while it runs. */
    endedAt: string | null;
    /** `harness` when the harness said it ended, `lost` when the engine stopped seeing it; null while it runs. */
    reason: string | null;
  } | null;
};

/** The tail of a step's session output, oldest line first. */
export type StepLog = {
  lines: string[];
  /**
   * Whether the api cut lines off the top. A harness can hand over less than all of its output
   * already — the detached runner keeps only its last few thousand characters — and that cut is
   * not visible here, so its first line may start mid-line.
   */
  truncated: boolean;
};

/**
 * One engine for the process, and the api only reads through it — `list`, `view` and `logs`, never
 * `tick` or `file`.
 * Filing and advancing work is `wf`'s job, so a board left open in a tab cannot start anything.
 */
const e = engine();

type TaskView = Awaited<ReturnType<typeof e.view>>;
type Views = ReadonlyMap<string, TaskView>;

/**
 * The engine's view of every task a run has filed — each step's, and each check's — for one run's page.
 * Each `view` observes every harness — a `claude agents` call, a scan of detached runs — so this is an
 * observation per filed task, and a request reads each task once. The list of every run reads them with
 * `everyView`.
 */
async function viewsOf(run: Run): Promise<Views> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
  }
  return views;
}

/**
 * The engine's view of every task in its store, over one observation, by task id.
 *
 * `list` observes the harnesses once and folds every task's journal against that; `view` observes
 * afresh on each call. A task the engine has no record of is simply absent, which reads exactly as
 * `view`'s empty state does: no brief, so `unknown`.
 */
async function everyView(): Promise<Views> {
  return new Map((await e.list()).map((view) => [view.id, view]));
}

/**
 * The run's workflow folder, read now.
 *
 * The run record is the truth about what ran; the folder is only where the prose came from, and it
 * can be edited or deleted after `wf start`. So a folder that no longer reads is a warning on the
 * run, not a failure of the request — and on a run that froze its workflow, nothing the page draws
 * comes from it. The case that made this so: an api older than the package's parser refused the
 * folder's newer keys, and every step of a run whose record had the whole graph read as a root.
 */
function workflowsOf(run: Run): { steps: Workflow[]; warning: null } | { steps: null; warning: string } {
  try {
    return { steps: loadWorkflows(run.workflowDir), warning: null };
  } catch (err) {
    const why = fs.existsSync(run.workflowDir)
      ? `The workflow folder ${run.workflowDir} no longer reads as a workflow: ${(err as Error).message}.`
      : `The workflow folder ${run.workflowDir} is gone.`;
    return {
      steps: null,
      warning: run.workflow
        ? `${why} Nothing here is read from it: the steps, their spec, prose and graph are the workflow the run froze at \`wf start\`, which is what it is judged by.`
        : `${why} The steps are listed from the run record, without their spec or prose.`,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `wf decide` reads
 * the record too. Then any step the workflow the tick reads (`stepsOf` in runner.ts) has and the record
 * does not. On a run that froze its workflow that is the frozen one, so a step the folder gained since is
 * not shown: the tick never files it, and drawn, it would wait for ever and make a root of the graph the
 * run froze — `driftOf` names it instead. On a record from before runs froze one, the folder, whose added
 * steps the tick does file.
 */
function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (run.workflow ?? workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

/** How the folder has moved away from the steps the run started with, or null if it has not. */
function driftOf(run: Run, workflows: readonly Workflow[]): string | null {
  const inFolder = new Set(workflows.map((s) => s.name));
  const removed = Object.keys(run.steps).filter((name) => !inFolder.has(name));
  const added = workflows.map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  const shown = run.workflow ? 'shown as the run froze it' : 'shown from the run record without spec or prose';
  const said = [
    ...(removed.length ? [`it no longer has ${removed.join(', ')}, ${shown}`] : []),
    ...(added.length ? [`it has ${added.join(', ')}, which the run did not start with${run.workflow ? ' and will never file, so it is not shown' : ''}`] : []),
  ];
  return said.length ? `The workflow folder ${run.workflowDir} has changed since this run started: ${said.join('; ')}.` : null;
}

/**
 * The steps a run is judged by: the workflow it froze at `wf start`, which the tick reads (`stepsOf` in
 * runner.ts), and for a record from before runs froze one, the folder. A record whose folder no longer
 * reads is judged from the record alone, a `bare` step each.
 */
const judgedSteps = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] =>
  run.workflow ?? folder ?? Object.keys(run.steps).map(bare);

/** A step nothing defines any more. All the record says of it is its name: no `after`, `check:` or `output:`. */
const bare = (name: string): Workflow => ({ name, after: [], body: '' });

/**
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it: `list`'s,
 * which the package does not export. `unknown` where `phaseOfView` says so, for a task the engine has no record of: the
 * engine folds it to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
 */
const wordOf = (views: Views) => (taskId: string): string => {
  const view = views.get(taskId);
  return view && phaseOfView(view) !== 'unknown' ? view.phase : 'unknown';
};

/** What the run established, over one read of its tasks: each step's word and note, who is waited on, where the run stands, and whether it still moves. */
type Judged = {
  words: ReadonlyMap<string, string>;
  notes: ReadonlyMap<string, string | null>;
  waitingOnYou: string[];
  status: RunStatus;
  moving: boolean;
};

/**
 * What `wf ls` says about each step, what `assess` says about the run, and whether the run still moves.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`,
 * `unsigned`, `succeeded · BLOCKED`, `rounds exhausted`, the engine's own word while a step runs, and `unknown` for a task it
 * has no record of — and so are the notes beside them. A step and a check are read as the tick reads them, off the package's
 * own `phaseOfView`, `closeoutAsked` and `exitVerdicts`.
 *
 * Given what people asked for with `wf retry` and `wf round`, read once, as the tick reads them (`readAsks`): without them a
 * step a person asked to try again, or a loop out of rounds a person sent round once more, reads as waiting on them, and the
 * run as not moving, for as long as the tick takes to file what they asked for. A step the page shows and the tick does not judge — one a pre-freeze record has and its folder
 * lost — is worded as a `bare` step, and has no say in the run's status. Everything is read off the views the request already has: calling `list` would
 * read every task again, and word only the steps the tick judges. The api test holds these words to `list`'s.
 */
function judge(run: Run, names: readonly string[], folder: readonly Workflow[] | null, views: Views): Judged {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const asked = closeoutAsked(views);
  // Off the engine's record of each check, not the log `wf ls` reads (`readVerdict`): the check prints the code it exits with,
  // so the two agree, and a `logs` call per refused check would observe every harness again, on every poll of the list.
  const verdicts = exitVerdicts(views, run);
  // Unreadable ask files are `notes` the tick prints and does not honour; neither does the board.
  const { asks, rounds } = readAsks(run.id);
  const said = listing(shown, run, wordOf(views), (name) => closeoutOf(views, run, name), asked, verdicts, asks, rounds);
  const phase = (taskId: string) => phaseOfView(views.get(taskId));
  // Given the verdict, as the tick is: without it `assess` cannot tell a check that refused, which `retries:` tries
  // again, from one that did not finish, which waits on a person — and the status and `listing`'s words would disagree.
  const { status, ready, check, retry, round } = assess(steps, run, phase, closeoutReader(views, run), asked, verdicts, asks, rounds);
  // A record the tick cannot read — from before runs froze their workflow, its folder gone — has nothing filed
  // for it, whatever its bare steps would make ready: the tick fails on it.
  const tickReads = Boolean(run.workflow ?? folder);
  return {
    words: new Map(said.steps.map((s) => [s.name, s.status])),
    notes: new Map(said.steps.map((s) => [s.name, s.note ?? null])),
    waitingOnYou: names.filter((name) => said.waitingOnYou.includes(name)),
    status,
    // The line `cancelPlan` draws for a finished run, which `status` does not: nothing in flight, and nothing a
    // tick would still file. A cancelled run files nothing (`assess` makes nothing ready), and moves until its stop lands.
    // A round due is filed as a try is: a loop's looping step settled, and nothing of it in flight until the tick files the round.
    moving: inFlight(run, phase).length > 0 || (tickReads && (ready.length > 0 || check.length > 0 || retry.length > 0 || round.length > 0)),
  };
}

/**
 * What a step was told.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what `composeBrief` would give it now, from `workflows` — the
 * workflow the run froze, as the tick composes it. For a filed task the engine has no record of, nobody can say.
 */
function toldOf(run: Run, name: string, workflows: readonly Workflow[] | null, views: Views): string | null {
  const taskId = run.steps[name]?.taskId;
  if (taskId) return views.get(taskId)?.state.brief || null;
  const step = workflows?.find((s) => s.name === name);
  return step && workflows ? composeBrief(step, run, workflows) : null;
}

function summarize(run: Run, views: Views): RunSummary {
  const folder = workflowsOf(run).steps;
  const names = stepNames(run, folder);
  const judged = judge(run, names, folder, views);
  return {
    id: run.id,
    repo: run.repo,
    brief: run.brief,
    workflowDir: run.workflowDir,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    status: judged.status,
    moving: judged.moving,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: judged.words.get(name)!,
      note: judged.notes.get(name) ?? null,
    })),
    waitingOnYou: judged.waitingOnYou,
  };
}

const specOf = (step: Workflow): StepSpec => ({
  harness: step.harness ?? null,
  model: step.model ?? null,
  after: step.after,
  resume: step.resume ?? null,
  permissionMode: step.permissionMode ?? null,
  deadlineSeconds: step.deadlineSeconds ?? null,
  maxAttempts: step.maxAttempts ?? null,
  loop: step.loop ?? null,
  rounds: step.rounds ?? null,
});

/**
 * Where what a page shows of a step's workflow is read from: the workflow the run froze at `wf start`, which the tick
 * files from and `judgedSteps` judges by; the folder only for a record from before runs froze one. Null when neither reads.
 */
const shownWorkflow = (run: Run, folder: readonly Workflow[] | null): readonly Workflow[] | null => run.workflow ?? folder;

async function detail(run: Run): Promise<RunDetail> {
  const folder = workflowsOf(run);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  const views = await viewsOf(run);
  const judged = judge(run, names, workflows, views);
  const steps = judgedSteps(run, workflows);
  const checks = await checksOf(run, steps, views);
  const source = shownWorkflow(run, workflows);
  return {
    id: run.id,
    brief: run.brief,
    repo: run.repo,
    workflowDir: run.workflowDir,
    baseRef: run.baseRef,
    branch: run.branch,
    isolate: run.isolate,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    status: judged.status,
    moving: judged.moving,
    waitingOnYou: judged.waitingOnYou,
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    // The steps `judge` words: the judged workflow, then a `bare` step for each one the page shows beside it.
    graph: graphOf([...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)]),
    steps: names.map((name) => {
      const step = source?.find((s) => s.name === name);
      const c = closeoutOf(views, run, name);
      return {
        name,
        spec: step ? specOf(step) : null,
        body: step?.body ?? null,
        told: toldOf(run, name, source, views),
        taskId: run.steps[name]?.taskId ?? null,
        workspace: run.steps[name]?.workspace ?? null,
        branch: run.steps[name]?.branch ?? null,
        status: judged.words.get(name)!,
        note: judged.notes.get(name) ?? null,
        // An unreadable closeout is already in `status`; there is nothing here to show of it.
        closeout: c && !('error' in c)
          ? { outcome: c.outcome, summary: c.summary, needs: c.needs ?? null, artifacts: c.artifacts }
          : null,
        check: checks.get(name) ?? null,
        attempts: attemptsOf(run, name, views),
      };
    }),
  };
}

/** Off the engine's view of the step's task. A step with no task, or one the engine has lost, has had none. */
function attemptsOf(run: Run, name: string, views: Views): StepAttempts {
  const taskId = run.steps[name]?.taskId;
  const attempts = (taskId && views.get(taskId)?.state.attempts) || [];
  const latest = attempts.at(-1);
  return {
    count: attempts.length,
    latest: latest ? { startedAt: latest.startedAt, ended: latest.ended, endedAt: latest.endedAt ?? null, reason: latest.reason } : null,
  };
}

/** How much of a step's output the board is given: the end of it, which is where a running step is. */
const LOG_LINES = 200;

/** The last `max` lines of a session's output, and whether there were more. */
function tailOf(output: string, max: number): StepLog {
  const lines = output.split(/\r?\n/);
  // Output that ends in a newline has not begun another line.
  if (lines.at(-1) === '') lines.pop();
  return lines.length > max ? { lines: lines.slice(-max), truncated: true } : { lines, truncated: false };
}

/** How many lines of each stream a refused check shows: as many as `wf decide` does (`CHECK_TAIL_LINES`). */
const CHECK_LINES = 20;

/**
 * Each judged step's check: its command, and for a check that refused, what it said — what `checkReports`
 * in runner.ts reads for `wf ls` and `wf decide`, which the package does not export. A `logs` call per
 * refused check, which observes every harness again: on one run's page, and never on the list.
 */
async function checksOf(run: Run, steps: readonly Workflow[], views: Views): Promise<Map<string, StepCheck>> {
  const checks = new Map<string, StepCheck>();
  for (const step of steps) {
    if (!step.check) continue;
    const taskId = run.steps[step.name]?.check?.taskId;
    const settled = taskId ? views.get(taskId)?.state.settled : null;
    if (!taskId || (settled !== 'failed' && settled !== 'stopped')) {
      checks.set(step.name, { command: step.check, refused: null });
      continue;
    }
    let stdout: StepLog = { lines: [], truncated: false };
    let unreadable: string | null = null;
    try {
      stdout = tailOf(await e.logs(taskId), CHECK_LINES);
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      unreadable = `Could not read the output of its check (task ${taskId}): ${why}. \`wf decide ${run.id}\` reads it the same way from the command line.`;
    }
    checks.set(step.name, {
      command: step.check,
      // A check is filed for the step, so the engine's record has a verdict for it: an exit code, or `unfinished`.
      refused: { exit: verdictWord(exitVerdicts(views, run)(step.name)!), stdout, stderr: tailOf(endOf(checkStderr(taskId)), CHECK_LINES), unreadable },
    });
  }
  return checks;
}

/** The end of a file that may be large, or absent: a check stopped before it started wrote no stderr. */
function endOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

/** Found among the runs the store has, not read by path, so no id can name a file outside it. */
const findRun = (id: string): Run | undefined => listRuns().find((r) => r.id === id);

const noSuchRun = (id: string) =>
  `No run '${id}' in this store. GET /api/runs (or \`wf ls\`) lists the runs it has; check WF_ROOT if you expected it here.`;

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  // What the repository offers a step, read from the checkout on each request (capabilities.ts). Each MCP server
  // the settings enable is started and asked for its tools once while the api runs; one that fails is an `error`
  // on its entry, never a failed request.
  .get('/api/capabilities', async (c) => c.json(await capabilitiesOf(repoOf())))
  // A repository's workflows, listed, and a run of one started — the board's one write (workflows.ts).
  .route('/', workflows)
  .get('/api/runs', async (c) => {
    // What one request costs, however many runs there are: one harness observation (one
    // `claude agents --json`, one scan of the detached runs' files), a read of every task journal in
    // the engine's store, and each run's record and workflow folder. It was a `view` — so an
    // observation — per filed step of every run: dozens of `claude agents` calls a poll.
    //
    // The records before the engine: `wf` files a step's task before it writes the id on the run, so
    // every id read here is in the listing that follows. The other way round, a task filed between
    // the two reads would show as `unknown` until the next poll.
    const runs = listRuns();
    const views = await everyView();
    return c.json(runs.map((run) => summarize(run, views)));
  })
  .get('/api/runs/:id', async (c) => {
    const id = c.req.param('id');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    return c.json(await detail(run));
  })
  .get('/api/runs/:id/steps/:step/log', async (c) => {
    const id = c.req.param('id');
    const step = c.req.param('step');
    const run = findRun(id);
    if (!run) return c.json({ error: noSuchRun(id) }, 404);
    // The steps the run's page shows: those on the record, and any the folder has gained since.
    if (!stepNames(run, workflowsOf(run).steps).includes(step)) {
      return c.json({ error: `Run '${id}' has no step '${step}'. GET /api/runs/${id} lists the steps it has.` }, 404);
    }
    const taskId = run.steps[step]?.taskId;
    if (!taskId) return c.json({ lines: [], truncated: false } satisfies StepLog);
    try {
      return c.json(tailOf(await e.logs(taskId), LOG_LINES));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      return c.json({
        error: `Could not read the output of step '${step}' (task ${taskId}): ${why}. \`wf logs ${id} ${step}\` reads it the same way from the command line, with the error in full.`,
      }, 502);
    }
  });
