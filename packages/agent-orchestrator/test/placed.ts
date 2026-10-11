/**
 * How a test gives its programs a place: `runOver(runWith, layer)` answers a `runWith` whose programs may ask the place, each given
 * `layer`. A test file says its place once, by name, at its head: `const runWith = runOver(runEngine, gitPlaceLayer);`. This file loads
 * no part of the package, so a test that sets its environment before it imports the package still does.
 */
import { Effect, type Layer } from 'effect';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { PlaceService } from '../src/place/place.store.ts';

/** The package's `runWith`, as a test hands it on. */
type RunWith = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService>) => Promise<A>;

/** A `runWith` over `layer`: `program` run over the engine `e`, given the place `layer` holds. */
export const runOver =
  (runWith: RunWith, layer: Layer.Layer<PlaceService>) =>
  <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService | PlaceService>): Promise<A> =>
    runWith(e, program.pipe(Effect.provide(layer)));

/** A runner over `layer`: `program`, which asks the place and no engine, run given the place `layer` holds. */
export const runGiven =
  (layer: Layer.Layer<PlaceService>) =>
  <A, E>(program: Effect.Effect<A, E, PlaceService>): Promise<A> =>
    Effect.runPromise(program.pipe(Effect.provide(layer)));

/** `program` given the place `layer` holds, and still to be run. */
export const givenPlace =
  (layer: Layer.Layer<PlaceService>) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, PlaceService>> =>
    Effect.provide(program, layer);
