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
 * before it imports the package still does: the proposals pass every runner gives a tick's pass (`withProposalsPass`), as `nemia tick`
 * and the daemon give it, is imported when a program first runs.
 */
import { createRequire } from 'node:module';
import { afterEach, beforeEach } from 'vitest';
import { Effect, type Layer } from 'effect';
import type { Engine, EngineService } from '../src/runtime-client.ts';
import type { PlaceService } from '../src/place/place.store.ts';
import { storeConfigLayer, type StoreRoot } from '../src/config/root.store.ts';
import type { Env } from '../src/config/config.store.ts';
import type { StoreConfig } from '../src/config/config.store.ts';
import type { ProposalsAct } from '../src/apply/act.verb.ts';

/** The package's `runWith`, as a test hands it on. */
type RunWith = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService>) => Promise<A>;

/** A place as a test gives it: its layer, or what answers the layer of the test running now. */
export type Given = Layer.Layer<PlaceService> | (() => Layer.Layer<PlaceService>);

/** The layer `given` names now. */
const layerOf = (given: Given): Layer.Layer<PlaceService> => (typeof given === 'function' ? given() : given);

/** The package's own loader, for the one module a runner takes only when a program first runs, and synchronously. */
const load = createRequire(import.meta.url);

/**
 * `program` given the proposals pass a tick's pass is composed with, its module loaded only now (the file's head says why), and at
 * once, so a program a test runs with `Effect.runSync` stays synchronous.
 */
const withProposals = <A, E, R>(program: Effect.Effect<A, E, R>): Effect.Effect<A, E, Exclude<R, ProposalsAct>> =>
  Effect.suspend(() => (load('../src/apply/pass.verb.ts') as typeof import('../src/apply/pass.verb.ts')).withProposalsPass(program));

/**
 * A `runWith` over `given`: `program` run over the engine `e`, given the place `given` holds then, the store's root and settings `env`
 * names — a test's own store (`{ WF_ROOT: ROOT, … }`), or by default the throwaway `test/ambient.ts` pointed the process at — and the
 * proposals pass. A program that asks `StoreRoot` and `ProposalsAct` is composed here, as `nemia tick`'s and the daemon's are in
 * `cli/main.ts` and `up`.
 */
export const runOver =
  (runWith: RunWith, given: Given, env: Env = process.env) =>
  <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot | StoreConfig | ProposalsAct>): Promise<A> =>
    runWith(e, withProposals(program).pipe(Effect.provide(layerOf(given)), Effect.provide(storeConfigLayer(env))));

/** A runner over `given`: `program`, which asks the place and no engine, run given the place `given` holds then, and the proposals pass. */
export const runGiven =
  (given: Given, env: Env = process.env) =>
  <A, E>(program: Effect.Effect<A, E, PlaceService | StoreRoot | StoreConfig | ProposalsAct>): Promise<A> =>
    Effect.runPromise(withProposals(program).pipe(Effect.provide(layerOf(given)), Effect.provide(storeConfigLayer(env))));

/** `program` given the place `given` holds now and the proposals pass, and still to be run. */
export const givenPlace =
  (given: Given, env: Env = process.env) =>
  <A, E, R>(
    program: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E, Exclude<Exclude<Exclude<R, ProposalsAct>, PlaceService>, StoreRoot | StoreConfig>> =>
    Effect.provide(Effect.provide(withProposals(program), layerOf(given)), storeConfigLayer(env));

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
