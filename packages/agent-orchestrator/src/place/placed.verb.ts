/**
 * A program run on the place this package ships: `runShipped`, what a one-off command runs its program with, at the edge where the
 * command is composed. A program that lives as long as its process is given `gitPlaceLayer` beside its other layers instead.
 */
import { Effect } from 'effect';
import { runWith, type Engine, type EngineService } from '../runtime-client.ts';
import type { PlaceService } from './place.store.ts';
import { gitPlaceLayer } from './shipped.store.ts';

/** `program` run over the engine `e` (`runWith`) and the place the package ships (`gitPlaceLayer`). */
export const runShipped = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService | PlaceService>): Promise<A> =>
  runWith(e, program.pipe(Effect.provide(gitPlaceLayer)));
