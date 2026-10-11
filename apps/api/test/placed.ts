/**
 * How an api test runs a package program itself: `runWith(e, program)` runs it over the engine `e`, given the git place the package
 * ships (`shipped`), as the api's own layer gives its handlers.
 */
import type { Effect } from 'effect';
import { runWith as runEngine, shipped, type EngineService, type PlaceService } from 'agent-orchestrator';

/** `program` run over the engine `e`, given the package's git place. */
export const runWith = <A, E>(e: Parameters<typeof runEngine>[0], program: Effect.Effect<A, E, EngineService | PlaceService>): Promise<A> =>
  runEngine(e, shipped(program));
