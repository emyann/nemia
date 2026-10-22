/**
 * How a test gives its programs a place: `runOver(runWith, layer)` answers a `runWith` whose programs may ask the place, each given
 * `layer`. A test file says its place once, by name, at its head. The test place, new for each test of the file:
 *
 *     const stand = eachTest(testPlace);
 *     const runWith = runOver(runEngine, () => stand().layer);
 *
 * and git, for a file about git: `const runWith = runOver(runEngine, gitPlaceLayer);`, a line that belongs to a file named
 * `<what>.boundary.test.ts`, since `stand-ins.test.ts` refuses the git place named in any other. A place is given as its layer, or
 * as a function that answers it, asked at each run. This file loads no part of the package, so a test that sets its environment
 * before it imports the package still does.
 */
import { afterEach, beforeEach } from 'node:test';
import { Effect, type Layer } from 'effect';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import { storeRootLayer, type StoreRoot } from '../src/config/root.store.ts';

/** The package's `runWith`, as a test hands it on. */
type RunWith = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService>) => Promise<A>;

/** A place as a test gives it: its layer, or what answers the layer of the test running now. */
export type Given = Layer.Layer<PlaceService> | (() => Layer.Layer<PlaceService>);

/** The layer `given` names now. */
const layerOf = (given: Given): Layer.Layer<PlaceService> => (typeof given === 'function' ? given() : given);

/**
 * A `runWith` over `given`: `program` run over the engine `e`, given the place `given` holds then, and the store's root from the
 * process's own environment — the throwaway `test/ambient.ts` pointed `WF_ROOT` at, which is where a test's store is. A program that
 * asks `StoreRoot` is composed here, as the daemon's is in `cli/main.ts` and the api's in `app.ts`.
 */
export const runOver =
  (runWith: RunWith, given: Given) =>
  <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot>): Promise<A> =>
    runWith(e, program.pipe(Effect.provide(layerOf(given)), Effect.provide(storeRootLayer(process.env))));

/** A runner over `given`: `program`, which asks the place and no engine, run given the place `given` holds then. */
export const runGiven =
  (given: Given) =>
  <A, E>(program: Effect.Effect<A, E, PlaceService | StoreRoot>): Promise<A> =>
    Effect.runPromise(program.pipe(Effect.provide(layerOf(given)), Effect.provide(storeRootLayer(process.env))));

/** `program` given the place `given` holds now, and still to be run. */
export const givenPlace =
  (given: Given) =>
  <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<Exclude<R, PlaceService>, StoreRoot>> =>
    Effect.provide(Effect.provide(program, layerOf(given)), storeRootLayer(process.env));

/**
 * What `make` makes, new for each test of the file that calls this at its head: the function answers the one made for the test running
 * now, which its subtests share. It throws before the first test, where none is made yet. A file whose tests run at once makes its own
 * in each.
 */
export function eachTest<A>(make: () => A): () => A {
  let now: { readonly made: A } | undefined;
  let depth = 0;
  beforeEach(() => {
    if (depth === 0) now = { made: make() };
    depth += 1;
  });
  afterEach(() => {
    depth -= 1;
  });
  return () => {
    if (!now) throw new Error('eachTest: asked before any test, where nothing is made yet: ask inside the test that uses it');
    return now.made;
  };
}
