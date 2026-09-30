/** The state machines the board draws (`GET /api/machines`, apps/api/src/machines/machines.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';

/**
 * Mirrors `MachineListing` in apps/api/src/machines/machines.ts: a machine's name, what a person calls it, and the file it is drawn from.
 */
export type MachineListing = { name: string; title: string; source: string };

/** The fields of a `MachineListing`, which a `MachineGraph` carries too. */
const MachineListingFields = { name: Schema.String, title: Schema.String, source: Schema.String };

/** Decodes the machines there are. */
const MachinesSchema = Schema.Struct({
  machines: Schema.mutable(Schema.Array(Schema.Struct(MachineListingFields))),
}) satisfies Schema.Schema<{ machines: MachineListing[] }>;

/** Mirrors the runtime's `LifecycleEdge`: one edge, where it leaves from, on what event, under which guard, to where, doing what. */
export type MachineEdge = { from: string; event: string; guard?: string; to: string; action: string };

/** Decodes a `MachineEdge`: an edge under no guard has no `guard`. */
const MachineEdgeSchema = Schema.Struct({
  from: Schema.String,
  event: Schema.String,
  guard: Schema.optionalKey(Schema.String),
  to: Schema.String,
  action: Schema.String,
}) satisfies Schema.Schema<MachineEdge>;

/**
 * Mirrors `MachineGraph` in apps/api/src/machines/machines.ts: a machine's listing, its first state, every state, the final ones, every
 * edge.
 */
export type MachineGraph = MachineListing & { initial: string; states: string[]; final: string[]; edges: MachineEdge[] };

/** Decodes a `MachineGraph`. */
const MachineGraphSchema = Schema.Struct({
  ...MachineListingFields,
  initial: Schema.String,
  states: Schema.mutable(Schema.Array(Schema.String)),
  final: Schema.mutable(Schema.Array(Schema.String)),
  edges: Schema.mutable(Schema.Array(MachineEdgeSchema)),
}) satisfies Schema.Schema<MachineGraph>;

/** The machines there are, by name. Read again on each visit: a machine changes only with the code. */
export const machinesQuery = queryOptions({
  queryKey: ['machines'],
  queryFn: () => get('/api/machines', MachinesSchema),
});

/** One machine's graph, read off its code by the api. */
export const machineQuery = (name: string) =>
  queryOptions({
    queryKey: ['machines', name],
    queryFn: () => get(`/api/machines/${encodeURIComponent(name)}`, MachineGraphSchema),
  });
