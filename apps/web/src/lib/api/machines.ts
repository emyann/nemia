/** The state machines the board draws (`GET /api/machines`, apps/api/src/machines/machines.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';

/**
 * Mirrors `MachineListing` in apps/api/src/machines/machines.ts: a machine's name, what a person calls it, and the file it is drawn from.
 */
export type MachineListing = { name: string; title: string; source: string };

/** Mirrors the runtime's `LifecycleEdge`: one edge, where it leaves from, on what event, under which guard, to where, doing what. */
export type MachineEdge = { from: string; event: string; guard?: string; to: string; action: string };

/**
 * Mirrors `MachineGraph` in apps/api/src/machines/machines.ts: a machine's listing, its first state, every state, the final ones, every
 * edge.
 */
export type MachineGraph = MachineListing & { initial: string; states: string[]; final: string[]; edges: MachineEdge[] };

/** The machines there are, by name. Read again on each visit: a machine changes only with the code. */
export const machinesQuery = queryOptions({
  queryKey: ['machines'],
  queryFn: () => get<{ machines: MachineListing[] }>('/api/machines'),
});

/** One machine's graph, read off its code by the api. */
export const machineQuery = (name: string) =>
  queryOptions({
    queryKey: ['machines', name],
    queryFn: () => get<MachineGraph>(`/api/machines/${encodeURIComponent(name)}`),
  });
