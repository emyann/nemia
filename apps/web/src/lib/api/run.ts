/**
 * The reads of one run: its object (`GET /api/runs/:id`) and each step's tries and what it was told, read through the objects' client
 * (`objects.ts`) as `objects` defines them, and the run's lines — the commands a person types and where its workflow's page is, which
 * the api serves by hand beside the object. What the run's pages draw is composed from them (`runViewOf`, `lib/runView.ts`).
 */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { decodes } from './decodes.ts';
import { pace } from '../feed.ts';
import { get } from './read.ts';
import { retryUnlessGone, readGone } from './gone.ts';
import { WorkflowPageAddressSchema, type WorkflowPageAddress } from './address.ts';
import type { StepTold, StepTry } from 'objects';
import { runs } from './objects.ts';

/** A step's lines beside its controls: its approval at its gate, a try in its session, and words said to it. */
export type StepCommands = { approve: string; retry: string; say: string };

/**
 * Mirrors `RunLinesAnswer` in apps/api/src/runs/runs.ts: the lines a person types about a run, built off the orchestrator's command
 * table — what there is to decide, the refresh of its revisions, where it came from (null for a run started from no card) and each
 * frozen step's approve, retry and say — and where its workflow's page is on the board, null where the api cannot say.
 */
export type RunLines = {
  decide: string;
  refresh: string;
  fromNote: string | null;
  steps: Record<string, StepCommands>;
  workflowPage: WorkflowPageAddress | null;
};

const StepCommandsSchema = decodes<StepCommands>()(Schema.Struct({ approve: Schema.String, retry: Schema.String, say: Schema.String }));

/** Decodes a `RunLines`. */
export const RunLinesSchema = decodes<RunLines>()(
  Schema.Struct({
    decide: Schema.String,
    refresh: Schema.String,
    fromNote: Schema.NullOr(Schema.String),
    steps: Schema.Record(Schema.String, StepCommandsSchema),
    workflowPage: Schema.NullOr(WorkflowPageAddressSchema),
  }),
);

export { retryUnlessGone, readGone } from './gone.ts';

/** The run's path under the api. */
const runPath = (id: string): string => `/api/runs/${encodeURIComponent(id)}`;

/**
 * The run object, under the run's own key, which every event of the feed about the run reads again, exactly, and which the board polls
 * at `pace` while it does not follow the feed. A 404 is the run gone (`readGone`), not tried again.
 */
export const runObjectQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id],
    queryFn: () => runs.show(id),
    refetchInterval: () => pace(5_000),
    retry: retryUnlessGone,
  });

/**
 * Every try of a step, earliest first, the current one last, keyed by the step's state in the object (`stepStamp`): the feed never names
 * this key, so the tries are read again only when the step moves, and by a person's write that changes one (`runsMoved`). A step the api
 * has no tries of — a run gone — reads as none, for the object's read to say the run is gone.
 */
export const stepTriesQuery = (id: string, step: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'steps', step, 'tries', stamp],
    queryFn: (): Promise<readonly StepTry[]> =>
      runs.tries(id, step).then(
        (read) => read.tries,
        (error: unknown) => {
          if (readGone(error)) return [];
          throw error;
        },
      ),
    staleTime: Infinity,
    retry: retryUnlessGone,
  });

/** What a step was told, keyed as its tries are (`stepTriesQuery`); null for a step the api has no told of. */
export const stepToldQuery = (id: string, step: string, stamp: string) =>
  queryOptions({
    queryKey: ['runs', id, 'steps', step, 'told', stamp],
    queryFn: (): Promise<StepTold | null> =>
      runs.told(id, step).then(
        (read) => read,
        (error: unknown) => {
          if (readGone(error)) return null;
          throw error;
        },
      ),
    staleTime: Infinity,
    retry: retryUnlessGone,
  });

/** The run's lines (`RunLines`): read once a page, never polled, since nothing a run does changes them. */
export const runLinesQuery = (id: string) =>
  queryOptions({
    queryKey: ['runs', id, 'lines'],
    queryFn: () => get(`${runPath(id)}/lines`, RunLinesSchema),
    staleTime: Infinity,
    retry: retryUnlessGone,
  });
