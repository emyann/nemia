import { queryOptions } from '@tanstack/react-query';

/** Mirrors `RunSummary` in apps/api/src/app.ts. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  steps: Array<{ name: string; taskId: string | null; branch: string | null; status: string }>;
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
  }>;
};

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
