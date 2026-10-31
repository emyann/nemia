/**
 * The Run door: the one way a program reads and writes a run — its record, and the files a person keeps beside it (asks, holds, refresh
 * asks, the markers of what `nemia rm` forgets) — an Effect service, `RunDoor`, whose methods take a run's id as `RunId` and answer an
 * Effect failing with a refusal. Its shape is the run store's (`RunStore`, `record/record.ts`) but the inbox, which is the Card door's
 * (S3) and stays on `runStore` as its seam.
 *
 * Two layers: the files (`runDoorFiles`, over `filesStore`, so a record is the very bytes it was), which `runWith` gives a program that
 * was given none, and the memory stand-in (`runDoorMemory`, `memory.store.ts`), which a test gives its program through
 * `agent-orchestrator/testing`. Both are built by `runDoorOver`, so each write is checked the one way on both: a new run decodes through
 * the model's `Run` (`record/record.model.ts`) with its id as `RunId.OnCreate` checks it, and a run written back through `Run`, its
 * invariants among it — each try named by its step and number, no run waiting on itself, a landing with one outcome — or `Invalid`
 * names the check broken and nothing is written. A record already at a new run's id is `Conflict`. The walks of `test/run-walks.ts`
 * hold both layers to one table.
 */
import { Context, Effect, Layer } from 'effect';
import { doorOf, checked, type DoorOf } from '../door/door.store.ts';
import { filesStore } from '../record/files.store.ts';
import { Run as RunModel, RunId } from '../record/record.model.ts';
import type { Run, RunStore } from '../record/record.ts';

/** A layer of the Run door: the run store's groups but the inbox, as plain synchronous methods. */
export type RunsLayer = Omit<RunStore, 'inbox'>;

/** The Run door's shape: each method of `RunsLayer` answering an Effect, a run's id taken as `RunId`. */
export type RunDoorShape = DoorOf<RunsLayer, RunId>;

/** The Run door, as the service a program yields. Given by `runWith` over the files unless the program was given one. */
export class RunDoor extends Context.Service<RunDoor, RunDoorShape>()('agent-orchestrator/RunDoor') {}

/** A run written back: what the model's `Run` refuses of it, its invariants among it. */
const runChecked = checked(RunModel, (run: Run) => `run ${run.id}'s record`);

/** A new run's id, as `RunId.OnCreate` checks it: what `runId` mints, never what a stored record only has to read as. */
const idChecked = checked(RunId.OnCreate, (id: string) => `a new run under ${JSON.stringify(id)}`);

/** The door over `layer`: each method as `doorOf` makes it, a new run's and a run written back's checked before the layer writes. */
export function runDoorOver(layer: RunsLayer): RunDoorShape {
  const door = doorOf<RunsLayer, RunId>(layer);
  return {
    ...door,
    runs: {
      ...door.runs,
      create: (run) =>
        Effect.gen(function* () {
          yield* idChecked(run.id);
          yield* runChecked(run);
          return yield* door.runs.create(run);
        }),
      rewrite: (run) =>
        Effect.gen(function* () {
          yield* runChecked(run);
          return yield* door.runs.rewrite(run);
        }),
    },
  };
}

/** The run store's files but the inbox: what the files layer is over. */
const { inbox: _, ...filesRuns } = filesStore;

/** The Run door over the store's files: today's records and a person's files, unchanged on disk. */
export const runDoorFiles: Layer.Layer<RunDoor> = Layer.succeed(RunDoor)(runDoorOver(filesRuns));
