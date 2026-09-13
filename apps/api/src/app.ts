import { Hono } from 'hono';
import { listRuns } from 'agent-workflows';
import type { Run } from 'agent-workflows/run';

/** A run as the web app sees it: what was asked, where, and which steps it has. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  steps: Array<{ name: string; taskId: string | null; branch: string | null }>;
};

const summarize = (run: Run): RunSummary => ({
  id: run.id,
  repo: run.repo,
  brief: run.brief,
  createdAt: run.createdAt,
  cancelledAt: run.cancelledAt ?? null,
  steps: Object.entries(run.steps).map(([name, step]) => ({
    name,
    taskId: step.taskId,
    branch: step.branch ?? null,
  })),
});

export const app = new Hono()
  .get('/api/health', (c) => c.json({ ok: true }))
  .get('/api/runs', (c) => c.json(listRuns().map(summarize)));
