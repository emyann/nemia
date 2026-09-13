import { queryOptions } from '@tanstack/react-query';

/** Mirrors `RunSummary` in apps/api/src/app.ts. */
export type RunSummary = {
  id: string;
  repo: string;
  brief: string;
  createdAt: string;
  cancelledAt: string | null;
  steps: Array<{ name: string; taskId: string | null; branch: string | null }>;
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const runsQuery = queryOptions({
  queryKey: ['runs'],
  queryFn: () => get<RunSummary[]>('/api/runs'),
  refetchInterval: 5_000,
});
