/**
 * How an api test is given its stand-ins: the engine and the place, each named once at the file's head and new for each test.
 *
 *     const stand = eachTest(testPlace);              // agent-orchestrator/testing
 *     const engine = eachTest(testEngine);            // agent-runtime/testing
 *     const runWith = runOver(() => stand().layer);   // a package program, as `nemia` runs it
 *     const app = () => appOver(engine(), stand());   // the api, as a request reaches it
 *
 * The engine a program or the app reads is the runtime's stand-in wrapped as the shipped engine is (`Engine.over`, `engineOf`), and a
 * step is moved on it by hand (`engine().settle`). A test that needs the real place or the real engine says so by its name,
 * `<what>.boundary.test.ts`. `eachTest` is a copy of the orchestrator's (`packages/agent-orchestrator/test/placed.ts`), not an import
 * of it: a package's test reaches into no other package's files.
 */
import { afterEach, beforeEach } from 'node:test';
import { Effect, Layer } from 'effect';
import { engineOf, runWith as runEngine, storeRootLayer, type EngineService, type PlaceService, type StoreRoot } from 'agent-orchestrator';
import type { TestEngine } from 'agent-runtime/testing';
import type { TestPlace } from 'agent-orchestrator/testing';
import { appOf, liveOf } from '../src/app.ts';
import { Engine } from '../src/store.ts';

/** A place as a test gives it: its layer, or what answers the layer of the test running now. */
export type Given = Layer.Layer<PlaceService> | (() => Layer.Layer<PlaceService>);

/** The layer `given` names now. */
const layerOf = (given: Given): Layer.Layer<PlaceService> => (typeof given === 'function' ? given() : given);

/**
 * A `runWith` over `given`: `program` run over the engine `e`, given the place `given` holds then and the store root this test
 * process's `WF_ROOT` names (`test/harness.ts`), as the api's layer composes a handler's.
 */
export const runOver =
  (given: Given) =>
  <A, E>(e: Parameters<typeof runEngine>[0], program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot>): Promise<A> =>
    runEngine(e, program.pipe(Effect.provide(layerOf(given)), Effect.provide(storeRootLayer(process.env))));

/** The engine a package program reads, over the stand-in `engine`: what `engine()` of the package is to a shipped one. */
export const engineFor = (engine: TestEngine): ReturnType<typeof engineOf> => engineOf(engine.layer);

/**
 * The api over the stand-ins: the app's own layer (`liveOf`), its engine `engine` and its place `stand` given after it, so they are the
 * ones its handlers read. A new app, with nothing kept between requests of another.
 */
export const appOver = (engine: TestEngine, stand: TestPlace, ...more: Layer.Layer<never>[]): ReturnType<typeof appOf>['app'] =>
  appOf(Layer.mergeAll(liveOf(), Engine.over(engine.layer), stand.layer, ...more)).app;

/**
 * What `make` makes, new for each test of the file that calls this at its head: the function answers the one made for the test running
 * now, which its subtests share. It throws before the first test, where none is made yet.
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

/**
 * `seed` run before each test of the file that calls this at its head, after the stand-ins named above it are made: what every test of
 * the file reads (a task filed and settled, a run's record), set again on the test's own stand-ins.
 */
export function beforeEachTest(seed: () => void): void {
  eachTest(seed);
}
