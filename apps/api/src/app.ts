import fs from 'node:fs';
import { Hono } from 'hono';
import { closeoutOf, engine, list, listRuns } from 'agent-workflows';
import { composeBrief, type Run } from 'agent-workflows/run';
import { loadWorkflows, type Workflow } from 'agent-workflows/workflow';

/** A run as the web app lists it: what was asked, where, and what each step is doing. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  /** `status` is what `wf ls` prints for the step, word for word. */
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
  /** Why `spec`, `body` and `told` are null: the workflow folder could not be read. */
  warning: string | null;
  /** In workflow order. */
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    body: string | null;
    /** What the step was actually given, as `composeBrief` writes it. */
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
type Listing = Awaited<ReturnType<typeof list>>;

/**
 * The engine's view of every task a run has filed. Each `view` observes every harness — a
 * `claude agents` call, a scan of detached runs — so a request reads each task once.
 */
async function viewsOf(run: Run): Promise<Map<string, TaskView>> {
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
      warning: `${why} The steps are listed from the run record, without their spec, their prose, or what they were told.`,
    };
  }
}

/**
 * `wf ls`'s words for a run whose workflow folder cannot be read.
 *
 * `list` is where those words come from, but it loads the folder before it says anything and throws
 * when the folder is gone — while the record still says which steps ran and the engine still knows
 * how they went. Nothing agent-workflows exports applies the rule without the folder, so this repeats
 * `listing` (agent-workflows/src/run.ts) over the record's steps. The api test holds the two in step.
 */
function recordListing(run: Run, views: ReadonlyMap<string, TaskView>): Listing {
  const waitingOnYou: string[] = [];
  const steps = Object.entries(run.steps).map(([name, { taskId, branch = null }]) => {
    if (!taskId) return { name, status: 'waiting', branch };
    const phase = views.get(taskId)?.phase ?? 'unknown';
    const c = closeoutOf(views, run, name);
    if (!c) return { name, status: phase, branch };
    if ('error' in c) return { name, status: `${phase} · closeout unreadable`, branch };
    if (c.outcome === 'blocked') waitingOnYou.push(name);
    return { name, status: `${phase} · ${c.outcome === 'blocked' ? 'BLOCKED' : 'done'}`, branch };
  });
  return { steps, waitingOnYou: run.cancelledAt ? [] : waitingOnYou };
}

const listingOf = async (run: Run, steps: Workflow[] | null, views?: ReadonlyMap<string, TaskView>): Promise<Listing> =>
  steps ? list(e, run) : recordListing(run, views ?? (await viewsOf(run)));

async function summarize(run: Run): Promise<RunSummary> {
  const { steps, waitingOnYou } = await listingOf(run, workflowsOf(run).steps);
  return {
    id: run.id,
    repo: run.repo,
    brief: run.brief,
    createdAt: run.createdAt,
    cancelledAt: run.cancelledAt ?? null,
    steps: steps.map(({ name, status, branch }) => ({ name, taskId: run.steps[name]?.taskId ?? null, branch, status })),
    waitingOnYou,
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
  const { steps: workflows, warning } = workflowsOf(run);
  const views = await viewsOf(run);
  const { steps, waitingOnYou } = await listingOf(run, workflows, views);
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
    waitingOnYou,
    warning,
    steps: steps.map(({ name, status, branch }) => {
      const step = workflows?.find((s) => s.name === name);
      const c = closeoutOf(views, run, name);
      return {
        name,
        spec: step ? specOf(step) : null,
        body: step?.body ?? null,
        told: step && workflows ? composeBrief(step, run, workflows) : null,
        taskId: run.steps[name]?.taskId ?? null,
        workspace: run.steps[name]?.workspace ?? null,
        branch,
        status,
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
