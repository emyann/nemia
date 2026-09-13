import { queryOptions } from '@tanstack/react-query';

/** Mirrors `RunStatus` in apps/api/src/app.ts: where `assess` puts the run. */
export type RunStatus = 'running' | 'succeeded' | 'failed' | 'cancelled';

/** Mirrors `RunSummary` in apps/api/src/app.ts. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  status: RunStatus;
  /** Whether anything of the run still moves: a task the engine holds for it, or a step or check a tick would still file. */
  moving: boolean;
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string }>;
  /** Steps a person has to act on — blocked, unsigned, or refused by their check. Empty on a cancelled run. */
  waitingOnYou: string[];
};

/** Mirrors `StepSpec` in apps/api/src/app.ts. */
export type StepSpec = {
  harness: string | null;
  model: string | null;
  after: string[];
  resume: string | null;
  permissionMode: string | null;
  deadlineSeconds: number | null;
  maxAttempts: number | null;
};

/** Mirrors `StepCloseout` in apps/api/src/app.ts. */
export type StepCloseout = {
  outcome: 'done' | 'blocked';
  summary: string;
  needs: string | null;
  artifacts: string[];
};

/**
 * Mirrors `StepCheck` in apps/api/src/app.ts: the command a step is judged by, from the workflow the run
 * froze, and once its check refused, the exit in `wf ls`'s words and the end of each stream.
 */
export type StepCheck = {
  command: string;
  refused: { exit: string; stdout: StepLog; stderr: StepLog; unreadable: string | null } | null;
};

/** Mirrors `RunDetail` in apps/api/src/app.ts. */
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
  moving: boolean;
  waitingOnYou: string[];
  warning: string | null;
  steps: Array<{
    name: string;
    spec: StepSpec | null;
    body: string | null;
    told: string | null;
    taskId: string | null;
    workspace: string | null;
    branch: string | null;
    status: string;
    closeout: StepCloseout | null;
    /** Null for a step with no `check:`. */
    check: StepCheck | null;
    attempts: StepAttempts;
  }>;
};

/**
 * Mirrors `StepAttempts` in apps/api/src/app.ts. `endedAt` is when the latest attempt ended — the
 * engine's `Attempt.endedAt` — and null while it runs or on a record from before the engine kept it.
 */
export type StepAttempts = {
  count: number;
  latest: { startedAt: string; ended: string | null; endedAt: string | null; reason: string | null } | null;
};

/** Mirrors `StepLog` in apps/api/src/app.ts. */
export type StepLog = { lines: string[]; truncated: boolean };

/**
 * A step's output, read on the page's beat while the step runs and left alone once it is not.
 *
 * Whether it runs is in the key, so the output is read once more when a step stops: the last beat
 * before it stopped can miss how it ended.
 */
export const stepLogQuery = (runId: string, step: string, running: boolean) =>
  queryOptions({
    queryKey: ['runs', runId, 'steps', step, 'log', running ? 'running' : 'not running'],
    queryFn: () => get<StepLog>(`/api/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}/log`),
    refetchInterval: running ? 5_000 : false,
  });

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) {
    // The api says what to do next in `error`, which is worth more than the status line.
    const said = await res.json().then((body: { error?: unknown }) => body.error, () => undefined);
    throw new Error(typeof said === 'string' ? said : `GET ${path} answered ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get<RunSummary[]>('/api/runs'),
  refetchInterval: 5_000,
});

export const runQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id],
    queryFn: () => get<RunDetail>(`/api/runs/${encodeURIComponent(id)}`),
    refetchInterval: 5_000,
  });
