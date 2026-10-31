/**
 * How an api test not yet on the stand-ins runs a package program itself: `runWith(e, program)` runs it over the engine `e`, given the
 * builtin git place of the package (`builtin`), as the api's own layer gives its handlers. A file that imports this reaches the real place,
 * and is on `stand-ins.baseline.ts` or named `<what>.boundary.test.ts`: a test given the test place runs its programs with the
 * `runOver` of `placed.ts`.
 */
import type { Effect } from 'effect';
import { Effect as Eff } from 'effect';
import { runWith as runEngine, builtin, storeRootLayer, type EngineService, type PlaceService, type StoreRoot } from 'agent-orchestrator';

/** `program` run over the engine `e`, given the package's git place and the store root this test process's `WF_ROOT` names. */
export const runWith = <A, E>(
  e: Parameters<typeof runEngine>[0],
  program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot>,
): Promise<A> => runEngine(e, builtin(program.pipe(Eff.provide(storeRootLayer(process.env)))));
