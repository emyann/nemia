/** The state machines the board draws (`GET /api/machines`, apps/api/src/machines/machines.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { get } from './read.ts';

/**
 * Mirrors `MachineListing` in apps/api/src/machines/machines.ts: a machine's name, what a person calls it, and the file it is drawn from.
 */
export type MachineListing = { name: string; title: string; source: string };

/** The fields of a `MachineListing`, which a `MachineGraph` carries too. */
const MachineListingFields = { name: Schema.String, title: Schema.String, source: Schema.String };

/** Decodes the machines there are. */
const MachinesSchema = decodes<{ machines: MachineListing[] }>()(
  Schema.Struct({
    machines: Schema.mutable(Schema.Array(Schema.Struct(MachineListingFields))),
  }),
);

/** Mirrors the runtime's `LifecycleEdge`: one edge, where it leaves from, on what event, under which guard, to where, doing what. */
export type MachineEdge = { from: string; event: string; guard?: string; to: string; action: string };

/** Decodes a `MachineEdge`: an edge under no guard has no `guard`. */
const MachineEdgeSchema = decodes<MachineEdge>()(
  Schema.Struct({
    from: Schema.String,
    event: Schema.String,
    guard: Schema.optionalKey(Schema.String),
    to: Schema.String,
    action: Schema.String,
  }),
);

/**
 * Mirrors the runtime's `LifecycleVerb`: a verb a person writes from outside the machine, the entry it journals, who writes it, the
 * states it is taken from, the state the next pass reads, and the guard its refusal asks first.
 */
export type MachineVerb = { verb: string; entry: string; by: string; from: string[]; to: string; guard: string };

/** Decodes a `MachineVerb`. */
const MachineVerbSchema = decodes<MachineVerb>()(
  Schema.Struct({
    verb: Schema.String,
    entry: Schema.String,
    by: Schema.String,
    from: Schema.mutable(Schema.Array(Schema.String)),
    to: Schema.String,
    guard: Schema.String,
  }),
);

/**
 * Mirrors `MachineGraph` in apps/api/src/machines/machines.ts: a machine's listing, its first state, every state, the final ones, every
 * edge, and every verb written from outside it, none for a machine that has no verb.
 */
export type MachineGraph = MachineListing & {
  initial: string;
  states: string[];
  final: string[];
  edges: MachineEdge[];
  verbs: MachineVerb[];
};

/** Decodes a `MachineGraph`. */
const MachineGraphSchema = decodes<MachineGraph>()(
  Schema.Struct({
    ...MachineListingFields,
    initial: Schema.String,
    states: Schema.mutable(Schema.Array(Schema.String)),
    final: Schema.mutable(Schema.Array(Schema.String)),
    edges: Schema.mutable(Schema.Array(MachineEdgeSchema)),
    verbs: Schema.mutable(Schema.Array(MachineVerbSchema)),
  }),
);

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
