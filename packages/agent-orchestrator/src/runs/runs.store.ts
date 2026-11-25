/**
 * The Run door: the one way a program reads and writes a run — its record, its claim on the card it was started from, a person's asks of
 * it, and the files a person keeps beside it (holds, refresh asks, the markers of what `nemia rm` forgets) — an Effect service, `RunDoor`,
 * whose methods take a run's id as `RunId` and answer an Effect failing with a refusal. Its shape is the run store's (`RunStore`,
 * `record/record.ts`); the inbox is the Card door's (`src/cards/cards.store.ts`).
 *
 * Two layers: the keyspace (`runRecords`, `records.store.ts`), each method an Effect over the store's SQLite file (`<root>/db/state.db`)
 * with a person's markers as files beside it, which the default gives a program at the root it is given (`StoreRoot`); and the memory
 * stand-in (`runDoorMemory`, `memory.store.ts`), plain synchronous methods made a door by `doorOf`, which a test gives its program. No
 * synchronous spelling of the door is left: a caller yields it. Both are checked by `runDoorOver`, so each write is checked the one way on
 * both: a new run decodes through the model's `Run` (`record/record.model.ts`) with its id as `RunId.OnCreate` checks it, and a run written
 * back through `Run`, its invariants among it — each try named by its step and number, no run waiting on itself, a landing with one outcome
 * — or `Invalid` names the check broken and nothing is written. A record already at a new run's id is `Conflict` (`runTaken`), and so is a
 * run from a card another run from it stands for (`cardStartedTwice`), the claim made in the transaction that makes the run. The walks of
 * `test/run-walks.ts` hold both layers to one table.
 */
import { keptRecords, type RecordMemo } from '../rest/index.ts';
import { Context, Effect, Layer } from 'effect';
import { doorOf, checked, rootedDoor, type DoorOf } from '../door/door.store.ts';
import { Run as RunModel, RunId } from '../record/record.model.ts';
import type { Run, RunStore } from '../record/record.ts';
import { runKeyspace, runKeyspaceHeld, runRecords } from './records.store.ts';

export { cardStartedTwice, runTaken } from './records.store.ts';

/** The memory stand-in's layer of the Run door: the run store's groups, as plain synchronous methods. */
export type RunsLayer = RunStore;

/** The Run door's shape: each method of `RunsLayer` answering an Effect, a run's id taken as `RunId`. */
export type RunDoorShape = DoorOf<RunsLayer, RunId>;

/** A run written back: what the model's `Run` refuses of it, its invariants among it. */
const runChecked = checked(RunModel, (run: Run) => `run ${run.id}'s record`);

/** A new run's id, as `RunId.OnCreate` checks it: what `runId` mints, never what a stored record only has to read as. */
const idChecked = checked(RunId.OnCreate, (id: string) => `a new run under ${JSON.stringify(id)}`);

/**
 * The door `door` checked: a new run's and a run written back's checked before the layer writes, and the pass's settle with its record.
 * @param door The Run door's layer: the keyspace's, or the memory's made a door.
 */
export function runDoorChecked(door: RunDoorShape) {
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
      settle: (run, spent) =>
        Effect.gen(function* () {
          if (spent.write) yield* runChecked(run);
          return yield* door.runs.settle(run, spent);
        }),
    },
  } satisfies RunDoorShape;
}

/**
 * The door over the synchronous layer `layer`, checked (`runDoorChecked`): the memory stand-in's.
 * @param layer The run store the door is over.
 */
export const runDoorOver = (layer: RunsLayer) => runDoorChecked(doorOf<RunsLayer, RunId>(layer));

/**
 * The Run door over the keyspace of the store `home`, a person's markers files beside it.
 * @param home The store's root folder.
 */
const keyspaceDoor = (home: string) => runDoorChecked(runRecords(home, runKeyspace(home), runKeyspaceHeld(home)));

/**
 * The Run door, as the service a program yields: a reference whose default is rooted (`rootedDoor`) — the door over the keyspace of the
 * store's root the program is given, refused `Invalid` where it was given none — and a test gives `runDoorMemory()` with no root at all
 * (`docs/architecture.md`, *The Run door*).
 */
export const RunDoor = Context.Reference<RunDoorShape>('agent-orchestrator/RunDoor', {
  defaultValue: () => rootedDoor(keyspaceDoor, 'Run door'),
});

/**
 * The Run door over the keyspace of the store `home`, as a layer: what the default gives at the root a program is given, for one that
 * names it.
 * @param home The store's root folder.
 */
export const runDoorKeyspace = (home: string) => Layer.succeed(RunDoor)(keyspaceDoor(home));

/**
 * Every run of the store as `project` reads it, off `memo` where one is handed in (`keptRecords`): the store stamped through the door
 * before any record is read (`runs.stamps`), each run whose stamp stands answered from memory, and each other read through the door. With
 * no memo — the command line's reads, and a test's cold read — every record is read in one listing, and nothing is kept. `verify` says
 * whether each kept projection is judged afresh too (`WF_VERIFY_REST`, the program's `StoreConfig`).
 * @param memo The projections kept from the reads before; undefined where nothing is kept.
 * @param project What each run is read as.
 * @param verify Whether each kept projection is judged afresh too.
 */
export const keptRuns = <P>(memo: RecordMemo<P> | undefined, project: (run: Run) => P, verify: boolean) =>
  Effect.gen(function* () {
    const door = (yield* RunDoor).runs;
    const stamps = yield* door.stamps();
    const due = memo === undefined || verify ? undefined : [...stamps].filter(([id, stamp]) => memo.runs.get(id)?.stamp !== stamp);
    const runs =
      due === undefined || due.length === stamps.size
        ? yield* door.list()
        : (yield* Effect.forEach(due, ([id]) => door.find(RunId.read(id)))).filter((run) => run !== undefined);
    const byId = new Map(runs.map((run) => [run.id, run]));
    return keptRecords(memo, { stamps, find: (id) => byId.get(id), verify }, project);
  });

/**
 * The run `id` as the Run door finds it among the ids the store lists (`runs.find`), never read by a path made of it: undefined where
 * the store has no such run. What a reader outside the package, which holds the id as a request gave it, finds a run by.
 * @param id The run's id, as a caller gives it.
 */
export const runFound = (id: string) => Effect.flatMap(RunDoor, (door) => door.runs.find(RunId.read(id)));
