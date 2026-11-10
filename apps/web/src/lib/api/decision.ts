/**
 * What the CLI's `decide` shows a person about a run (`GET /api/runs/:runId/decision`), read through the objects' client as `objects`
 * says it (`RunDecision`, `Decidable` and their parts).
 */
import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { RunDecision, type Collisions, type DecisionTouched } from 'objects';
import { call, read } from './objects.ts';

export type {
  BaseHold,
  Collisions,
  Decidable,
  DecideCommand,
  DiffFile,
  Lesson,
  RunDecision,
  RunSlot,
  SensitiveDiff,
  Standing,
  StandingMerge,
} from 'objects';

/** What a branch touched, or the sentence saying what it changed is not known. */
export type Touched = DecisionTouched;

/** What a branch touched, and among it what an agent reads and what decides a check. */
export type Radius = Exclude<Touched['radius'], { error: string }>;

/** A workspace package, a top-level directory, or `(root)`, and what a branch changed in it. */
export type Group = Radius['groups'][number];

/** A run in flight whose branch would collide with this one's. */
export type Collision = Collisions['colliding'][number];

/**
 * The decision about a run, keyed by its state's stamp (`stamp`): read again when the run moves, never polled, kept while the next one
 * is read.
 */
export const decisionQuery = (id: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'decision', stamp],
    queryFn: () => call((c) => c.runs.decision({ params: { runId: id }, query: {} }), read(RunDecision)),
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
