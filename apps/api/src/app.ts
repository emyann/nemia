import fs from 'node:fs';
import { Hono } from 'hono';
import { checkStderr, closeoutOf, closeoutReader, engine, listRuns, verdictWord } from 'agent-workflows';
import { assess, composeBrief, listing, type Assessment, type Run, type TaskPhase } from 'agent-workflows/run';
import { loadWorkflows, type Workflow } from 'agent-workflows/workflow';

/** Where a run stands, as `assess` decides it: `running` until every step is final one way or the other. */
export type RunStatus = Assessment['status'];

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /** `status` is what `wf ls` prints for the step — see `judge` for the one word it corrects. */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string }>;
  /** Steps a person has to act on — blocked, unsigned, or refused by their check — on a run nobody has called off. */
  waitingOnYou: string[];
};

/** A step's frontmatter. `null` where the workflow file does not set it. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  after: string[];
  resume: string | null;
  permissionMode: string | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
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
  waitingOnYou: string[];
  /** Set when the workflow folder cannot be read, or no longer has the steps the run started with. */
  warning: string | null;
  /** The recorded steps in the order the run started with them, then any the folder has gained. */
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    body: string | null;
    /** For a filed step, the brief the engine was filed with; for one not yet filed, what it would be given now. */
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    branch: string | null;
    status: string;
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
 * run, not a failure of the request.
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
      warning: `${why} The steps are listed from the run record, without their spec or prose.`,
    };
  }
}

/**
 * Which steps a run has, in the order to show them.
 *
 * Every step on the record, in the record's order — the workflow's order when the run started —
 * because the record is the truth about what ran, whatever the folder says now; `wf decide` reads
 * the record too. Then any step the folder has and the record does not: `wf start` records every
 * step it finds, so those were added since. The tick files them only on a record from before runs
 * froze their workflow, which it reads from the folder; on a run that froze one they stay `waiting`.
 */
function stepNames(run: Run, workflows: readonly Workflow[] | null): string[] {
  const added = (workflows ?? []).map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  return [...Object.keys(run.steps), ...added];
}

/** How the folder has moved away from the steps the run started with, or null if it has not. */
function driftOf(run: Run, workflows: readonly Workflow[]): string | null {
  const inFolder = new Set(workflows.map((s) => s.name));
  const removed = Object.keys(run.steps).filter((name) => !inFolder.has(name));
  const added = workflows.map((s) => s.name).filter((name) => !Object.hasOwn(run.steps, name));
  const said = [
    ...(removed.length ? [`it no longer has ${removed.join(', ')}, shown from the run record without spec or prose`] : []),
    ...(added.length ? [`it has ${added.join(', ')}, which the run did not start with`] : []),
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
 * The engine's own word for a task — `running (working)`, `needs-human`, `succeeded` — as `wf ls` shows it.
 *
 * With one correction: a task the engine has no record of is `unknown`, the line `phaseOfView` in
 * runner.ts draws. `list` passes the engine's own `pending` through for it, so a task lost from the
 * engine's store would read as queued behind a slot.
 */
const wordOf = (views: Views) => (taskId: string): string => {
  const view = views.get(taskId);
  // Every filed task has the brief it was filed with; only a task the engine never heard of has none.
  return view?.state.brief ? view.phase : 'unknown';
};

/** Settled one way or another, or not yet: all `assess` asks of a task's phase. */
const phaseOf = (views: Views) => (taskId: string): TaskPhase => views.get(taskId)?.state.settled ?? 'running';

/** Whether a task was asked for a closeout: the schema on the engine's record of its filing. `closeoutAsked` in runner.ts, not exported. */
const askedOf = (views: Views) => (taskId: string): boolean => Boolean(views.get(taskId)?.state.closeoutSchema);

/**
 * What a step's check exited with: the exit code the engine recorded off the check's process, or
 * `unfinished` when it recorded none — killed at its deadline, stopped, or never started.
 *
 * `wf ls` reads the number off the `[wf check] exit N` line the check prints last (`readVerdict`), and
 * the check's shell exits with the code it prints, so the two agree. Reading the log here would cost a
 * `logs` call per refused check, and each call observes every harness again: the list of every run would
 * observe once more for each refused check on the board, every poll.
 */
const verdictOf = (run: Run, views: Views) => (name: string): number | 'unfinished' => {
  const taskId = run.steps[name]?.check?.taskId;
  const exitCode = taskId ? views.get(taskId)?.state.attempts.at(-1)?.exitCode : null;
  return typeof exitCode === 'number' ? exitCode : 'unfinished';
};

/** What the run established, over one read of its tasks: each step's word, who is waited on, and where the run stands. */
type Judged = { words: ReadonlyMap<string, string>; waitingOnYou: string[]; status: RunStatus };

/**
 * What `wf ls` says about each step, and what `assess` says about the run.
 *
 * The words are `listing`'s — `verified ✓`, `checking`, `unverified · done`, `failed ✗ check (exit 1)`,
 * `unsigned`, `succeeded · BLOCKED`, and the engine's own word while a step runs — with `wordOf`'s one
 * correction. A step the page shows and the tick does not judge — one the folder gained after the run froze
 * its workflow, or one a pre-freeze record has and its folder lost — is worded as a `bare` step, and has no
 * say in the run's status. Everything is read off the views the request already has: calling `list` would
 * read every task again, and word only the steps the tick judges. The api test holds these words to `list`'s.
 */
function judge(run: Run, names: readonly string[], folder: readonly Workflow[] | null, views: Views): Judged {
  const steps = judgedSteps(run, folder);
  const shown = [...steps, ...names.filter((name) => !steps.some((s) => s.name === name)).map(bare)];
  const asked = askedOf(views);
  const said = listing(shown, run, wordOf(views), (name) => closeoutOf(views, run, name), asked, verdictOf(run, views));
  return {
    words: new Map(said.steps.map((s) => [s.name, s.status])),
    waitingOnYou: names.filter((name) => said.waitingOnYou.includes(name)),
    status: assess(steps, run, phaseOf(views), closeoutReader(views, run), asked).status,
  };
}

/**
 * What a step was told.
 *
 * For a filed step, the brief the engine holds: it is what the step was given. Recomposing it now
 * would not be — `composeBrief` points a step with no `after` at every step filed so far, so a
 * finished first step would read as told to look at work done after it, and an edited folder would
 * rewrite it. For a step not yet filed, what `composeBrief` would give it now. For a filed task the
 * engine has no record of, nobody can say.
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
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    status: judged.status,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: judged.words.get(name)!,
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
});

async function detail(run: Run): Promise<RunDetail> {
  const folder = workflowsOf(run);
  const workflows = folder.steps;
  const names = stepNames(run, workflows);
  const views = await viewsOf(run);
  const judged = judge(run, names, workflows, views);
  const checks = await checksOf(run, judgedSteps(run, workflows), views);
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
    waitingOnYou: judged.waitingOnYou,
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    steps: names.map((name) => {
      const step = workflows?.find((s) => s.name === name);
      const c = closeoutOf(views, run, name);
      return {
        name,
        spec: step ? specOf(step) : null,
        body: step?.body ?? null,
        told: toldOf(run, name, workflows, views),
        taskId: run.steps[name]?.taskId ?? null,
        workspace: run.steps[name]?.workspace ?? null,
        branch: run.steps[name]?.branch ?? null,
        status: judged.words.get(name)!,
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
      refused: { exit: verdictWord(verdictOf(run, views)(step.name)), stdout, stderr: tailOf(endOf(checkStderr(taskId)), CHECK_LINES), unreadable },
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
