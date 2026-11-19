/**
 * How an api test is given its stand-ins: the engine and the place, each named once at the file's head and new for each test.
 *
 *     const stand = eachTest(testPlace);              // agent-orchestrator/testing
 *     const engine = eachTest(testEngine);            // agent-runtime/testing
 *     const runWith = runOver(() => stand().layer);   // a package program, as `nemia` runs it
 *     const app = () => appOver(engine(), stand());   // the api, as a request reaches it
 *
 * The engine a program or the app reads is the runtime's stand-in wrapped as the real engine is (`Engine.over`, `engineOf`), and a
 * step is moved on it by hand (`engine().settle`). A test that needs the real place or the real engine says so by its name,
 * `<what>.boundary.test.ts`. `eachTest` is a copy of the orchestrator's (`packages/agent-orchestrator/test/placed.ts`), not an import
 * of it: a package's test reaches into no other package's files.
 */
import { afterEach, beforeEach } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  engineOf,
  runWith as runEngine,
  storeConfigLayer,
  type EngineService,
  type PlaceService,
  type StoreConfig,
  type StoreRoot,
} from 'agent-orchestrator';
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
  <A, E>(
    e: Parameters<typeof runEngine>[0],
    program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot | StoreConfig>,
  ): Promise<A> =>
    runEngine(e, program.pipe(Effect.provide(layerOf(given)), Effect.provide(storeConfigLayer(process.env))));

/** The engine a package program reads, over the stand-in `engine`: what `engine()` of the package is to the real one. */
export const engineFor = (engine: TestEngine): ReturnType<typeof engineOf> => engineOf(engine.layer);

/**
 * The api over the stand-ins: the app's own layer (`liveOf`), its engine `engine` and its place `stand` given after it, so they are the
 * ones its handlers read. A new app, with nothing kept between requests of another.
 */
export const appOver = (engine: TestEngine, stand: TestPlace, ...more: Layer.Layer<never>[]): ReturnType<typeof appOf>['app'] =>
  appOf(Layer.mergeAll(liveOf(), Engine.over(engine.layer), stand.layer, ...more)).app;

/** The makers `eachTest` was given in this file, in order, each with what it made for the test or `describe` running now. */
const makers: { make: () => unknown; now?: { readonly made: unknown } }[] = [];
/** Where the makers stand: the test or `describe` at the file's head they made for, and whether a test runs now. */
const at: { head?: unknown; running: boolean; making: boolean; early: boolean } = { running: false, making: false, early: false };

/** Every maker made anew, in the order given, so a later one reads the earlier ones' new makes. */
const makeAll = (): void => {
  at.making = true;
  try {
    for (const m of makers) m.now = { made: m.make() };
  } finally {
    at.making = false;
  }
};

/** The test or `describe` at the head of the file that `task` belongs to. */
const headOf = (task: { suite?: unknown; file: unknown }): unknown => {
  let top: { suite?: unknown } = task;
  while (top.suite && top.suite !== task.file) top = top.suite;
  return top;
};

/**
 * What `make` makes, new for each test at the head of the file that calls this, a `describe` being one with all its tests: the function
 * answers the one made for the test or `describe` running now, which the tests of a `describe` share. Every maker of the file is made
 * anew together, in the order given, when the next test or `describe` at the head begins: at its first test, or where a `describe`'s
 * `beforeAll` asks first, there.
 *
 * @param make what is made anew for each test or `describe` at the head of the file
 */
export function eachTest<A>(make: () => A): () => A {
  const mine: { make: () => unknown; now?: { readonly made: unknown } } = { make };
  makers.push(mine);
  if (makers.length === 1) {
    beforeEach(({ task }) => {
      const head = headOf(task);
      if (head !== at.head) {
        at.head = head;
        if (!at.early) makeAll();
        at.early = false;
      }
      at.running = true;
    });
    afterEach(() => {
      at.running = false;
    });
  }
  return () => {
    if (!at.running && !at.making && !at.early) {
      makeAll();
      at.early = true;
    }
    if (!mine.now) throw new Error('eachTest: asked before any test, where nothing is made yet: ask inside the test that uses it');
    return mine.now.made as A;
  };
}

/**
 * `seed` run before each test of the file that calls this at its head, after the stand-ins named above it are made: what every test of
 * the file reads (a task filed and settled, a run's record), set again on the test's own stand-ins.
 */
export function beforeEachTest(seed: () => void): void {
  eachTest(seed);
}
