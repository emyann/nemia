import fs from 'node:fs';
import { Hono } from 'hono';
import { closeoutOf, engine, listRuns } from 'agent-workflows';
import { composeBrief, type Run } from 'agent-workflows/run';
import { loadWorkflows, type Workflow } from 'agent-workflows/workflow';

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  /** `status` is what `wf ls` prints for the step — see `statusOf` for the one word it corrects. */
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string }>;
  /** Steps that signed off blocked, on a run nobody has called off. */
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
  }>;
};

/**
 * One engine for the process, and the api only reads through it — `view`, never `tick` or `file`.
 * Filing and advancing work is `wf`'s job, so a board left open in a tab cannot start anything.
 */
const e = engine();

type TaskView = Awaited<ReturnType<typeof e.view>>;
type Views = ReadonlyMap<string, TaskView>;

/**
 * The engine's view of every task a run has filed. Each `view` observes every harness — a
 * `claude agents` call, a scan of detached runs — so a request reads each task once.
 */
async function viewsOf(run: Run): Promise<Views> {
  const views = new Map<string, TaskView>();
  for (const { taskId } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
  }
  return views;
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
 * step it finds, so those were added since, and the tick will file them, because it reads the folder.
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
 * What `wf ls` says about a step, over one read of its task.
 *
 * `listing`'s rule (agent-workflows/src/run.ts), with one correction: a task the engine has no
 * record of is `unknown`, the line `phaseOfView` in runner.ts draws. `list` passes the engine's own
 * `pending` through for it, so a task lost from the engine's store would read as queued behind a
 * slot. Worded here rather than by calling `list`, which words only the steps now in the folder and
 * would read every task a second time. The api test holds these words to `list`'s wherever `list`
 * is right.
 */
function statusOf(run: Run, name: string, views: Views): string {
  const taskId = run.steps[name]?.taskId;
  if (!taskId) return 'waiting';
  const view = views.get(taskId);
  // Every filed task has the brief it was filed with; only a task the engine never heard of has none.
  if (!view?.state.brief) return 'unknown';
  const c = closeoutOf(views, run, name);
  if (!c) return view.phase;
  if ('error' in c) return `${view.phase} · closeout unreadable`;
  return `${view.phase} · ${c.outcome === 'blocked' ? 'BLOCKED' : 'done'}`;
}

/** Steps that signed off blocked, on a run nobody has called off. */
const waitingOn = (run: Run, names: readonly string[], views: Views): string[] =>
  run.cancelledAt
    ? []
    : names.filter((name) => {
        const c = closeoutOf(views, run, name);
        return c !== undefined && !('error' in c) && c.outcome === 'blocked';
      });

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

async function summarize(run: Run): Promise<RunSummary> {
  const names = stepNames(run, workflowsOf(run).steps);
  const views = await viewsOf(run);
  return {
    id: run.id,
    repo: run.repo,
    brief: run.brief,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    steps: names.map((name) => ({
      name,
      taskId: run.steps[name]?.taskId ?? null,
      branch: run.steps[name]?.branch ?? null,
      status: statusOf(run, name, views),
    })),
    waitingOnYou: waitingOn(run, names, views),
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
    waitingOnYou: waitingOn(run, names, views),
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
        status: statusOf(run, name, views),
        // An unreadable closeout is already in `status`; there is nothing here to show of it.
        closeout: c && !('error' in c)
          ? { outcome: c.outcome, summary: c.summary, needs: c.needs ?? null, artifacts: c.artifacts }
          : null,
      };
    }),
  };
}

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/runs', async (c) => {
    // One run at a time, as `wf ls` does: every task read starts a harness observation.
    const runs: RunSummary[] = [];
    for (const run of listRuns()) runs.push(await summarize(run));
    return c.json(runs);
  })
  .get('/api/runs/:id', async (c) => {
    const id = c.req.param('id');
    // Found among the runs the store has, not read by path, so no id can name a file outside it.
    const run = listRuns().find((r) => r.id === id);
    if (!run) {
      return c.json({ error: `No run '${id}' in this store. GET /api/runs (or \`wf ls\`) lists the runs it has; check WF_ROOT if you expected it here.` }, 404);
    }
    return c.json(await detail(run));
  });
