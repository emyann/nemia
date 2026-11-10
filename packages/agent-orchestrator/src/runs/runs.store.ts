/**
 * The Run door: the one way a program reads and writes a run — its record, and the files a person keeps beside it (asks, holds, refresh
 * asks, the markers of what `nemia rm` forgets) — an Effect service, `RunDoor`, whose methods take a run's id as `RunId` and answer an
 * Effect failing with a refusal. Its shape is the run store's (`RunStore`, `record/record.ts`); the inbox is the Card door's
 * (`src/cards/cards.store.ts`).
 *
 * Two layers: the files (`runDoorFiles`, over `filesStoreAt`, so a record is the very bytes it was), which the default gives a program at
 * the root it is given (`StoreRoot`), and the memory stand-in (`runDoorMemory`, `memory.store.ts`), which a test gives its program. Both
 * are built by `runDoorOver`, so each write is checked the one way on both: a new run decodes through the model's `Run`
 * (`record/record.model.ts`) with its id as `RunId.OnCreate` checks it, and a run written back through `Run`, its invariants among it —
 * each try named by its step and number, no run waiting on itself, a landing with one outcome — or `Invalid` names the check broken and
 * nothing is written. A record already at a new run's id is `Conflict`, and so is a run from a card another run from it stands for
 * (`cardStartedTwice`; the files hold it across processes by the card's claim, `claimCard`). The walks of `test/run-walks.ts` hold both
 * layers to one table.
 */
import { Context, Effect, Layer } from 'effect';
import { atOnce, doorOf, checked, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Conflict } from '../refusal/refusal.ts';
import { claimCard, filesStoreAt } from '../record/files.store.ts';
import { Run as RunModel, RunId } from '../record/record.model.ts';
import type { Run, RunStore } from '../record/record.ts';

/** A layer of the Run door: the run store's groups, as plain synchronous methods. */
export type RunsLayer = RunStore;

/** The Run door's shape: each method of `RunsLayer` answering an Effect, a run's id taken as `RunId`. */
export type RunDoorShape = DoorOf<RunsLayer, RunId>;

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

/** A record already at the id of a new run, as a refusal: the files say so by `EEXIST`, the memory by its own. */
export const runTaken = (id: string): Conflict =>
  new Conflict({ message: `run ${id} already exists: start it under a new id, or forget the one there with nemia rm ${id}` });

/** A run from a card another run from it stands for, as a refusal: one run per card, the files holding it by the card's claim. */
export const cardStartedTwice = (card: string, run: string): Conflict =>
  new Conflict({
    message: `card ${card} was started already as run ${run}: read it with nemia show ${run}, or forget it with nemia rm ${run} and start the card again`,
  });

/**
 * The run store's files at the store's root `home`, a new run's record refused as `runTaken` when one is there: what the files layer is
 * over.
 */
const filesRuns = (home: string): RunsLayer => {
  const files = filesStoreAt(home);
  return {
    ...files,
    runs: {
      ...files.runs,
      create: (run) => {
        try {
          files.runs.create(run);
        } catch (err) {
          throw (err as NodeJS.ErrnoException).code === 'EEXIST' ? runTaken(run.id) : err;
        }
        const card = run.from?.inbox;
        if (card === undefined) return;
        const claim = claimCard(home, card, run.id);
        if ('by' in claim) {
          files.runs.forget(run.id);
          throw cardStartedTwice(card, claim.by);
        }
      },
    },
  };
};

/**
 * The Run door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the files at the
 * store's root the program is given, refused `Invalid` where it was given none — so no program's requirements change while the run
 * store's callers move onto the door, and a test gives `runDoorMemory()` with no root at all (`docs/architecture.md`, *The Run door*).
 */
export const RunDoor = Context.Reference<RunDoorShape>('agent-orchestrator/RunDoor', {
  defaultValue: () => rootedDoor((root) => runDoorOver(filesRuns(root)), 'Run door'),
});

/**
 * The Run door over the store's files at `home`, as a layer: what the default gives at the root a program is given, for one that names it.
 */
export const runDoorFiles = (home: string): Layer.Layer<never> => Layer.succeed(RunDoor)(runDoorOver(filesRuns(home)));

/**
 * The Run door over the store's files at `home`, each method run at once (`atOnce`): what a plain synchronous function reads and writes
 * a run through — a page's, a refusal's words, the command line's — until a program yields `RunDoor` in its place. Never the files store
 * itself: a run written here is checked as the door checks it.
 */
export const runsAtOnce = (home: string): RunsLayer => atOnce<RunsLayer, RunId>(runDoorOver(filesRuns(home)));
