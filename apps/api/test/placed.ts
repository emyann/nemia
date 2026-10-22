/**
 * How an api test runs a package program itself: `runWith(e, program)` runs it over the engine `e`, given the git place the package
 * ships (`shipped`), as the api's own layer gives its handlers.
 */
import type { Effect } from 'effect';
import { Effect as Eff } from 'effect';
import { runWith as runEngine, shipped, storeRootLayer, type EngineService, type PlaceService, type StoreRoot } from 'agent-orchestrator';

/** `program` run over the engine `e`, given the package's git place and the store root this test process's `WF_ROOT` names. */
export const runWith = <A, E>(
  e: Parameters<typeof runEngine>[0],
  program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot>,
): Promise<A> => runEngine(e, shipped(program.pipe(Eff.provide(storeRootLayer(process.env)))));
