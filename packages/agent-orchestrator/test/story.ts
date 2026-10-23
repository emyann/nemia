/**
 * A story told as one test: a person's walk through a run, its checkpoints named subtests that share the state the walk built.
 *
 *     const stage = staged({ runWith: runEngine, main: cli, engineOf });
 *     test('a gated run waits for its approval, then goes on', async (t) => {
 *       const s = story(t);
 *       await s.test('start freezes the gate', async () => { … stage.runPlaced(startRun(…)) … });
 *       await s.test('the tick holds the gated step', async () => { … });
 *     });
 *
 * The checkpoints themselves, skipped after one fails, are `story` of `checkpoints.ts`, re-exported here; that file imports nothing,
 * so the api and the web keep copies of it.
 *
 * The stage is what a story's checkpoints share, made new for each top-level test (`eachTest`): the test place, the engine's stand-in
 * and the controllers' engine over it, `runWith`/`runPlaced`/`main` given that place, and a steered clock made on first ask. It
 * reaches nothing real, so a file told on it stays off `stand-ins.baseline.ts`. The file hands in the runner's `runWith`, the CLI's
 * `main` and the client's `engineOf`, which it imports after setting its environment: this module loads no value of `src`, where a
 * store may read its root as it loads, so a file may import it at its head.
 */
import type { Effect } from 'effect';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../place/memory/index.ts';
import type { Engine, EngineService, engineOf } from '../src/runtime-client.ts';
import type { Place, PlaceService } from '../src/place/place.store.ts';
import type { StoreRoot } from '../src/config/root.store.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import { steeredClock, type Steered } from './steered.ts';

export { story, type Story, type Teller } from './checkpoints.ts';

/** The runner's `runWith`, as a test hands it on. */
type RunWith = <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService>) => Promise<A>;

/** The CLI's `main`, as `src/cli/main.ts` exports it: argv, an engine, the demand host (its default), and the place it is given. */
type Main = (argv: string[], e: Engine | undefined, demand: undefined, place: Place) => Promise<unknown>;

/** The engine's stand-in, as `testEngine` makes it. */
type TestEngine = ReturnType<typeof testEngine>;

/** The engine's stand-in, `settle` taking the attempt's closeout and exit code as arguments, and the controllers' engine over it. */
export type Board = Omit<TestEngine, 'settle'> & {
  settle: (id: string, phase: string, closeout?: unknown, exitCode?: number) => void;
  e: Engine;
};

/** What a story's checkpoints share, new for each top-level test. */
export type Stage = {
  /** The test place: its layer, its `world` and the `place` a command is given. */
  place: () => ReturnType<typeof testPlace>;
  /** The engine's stand-in and the controllers' engine over it. */
  board: () => Board;
  /** `program` over the engine `e`, given this test's place and the store's root. */
  runWith: <A, E>(e: Engine, program: Effect.Effect<A, E, EngineService | PlaceService | StoreRoot>) => Promise<A>;
  /** `program`, which asks no engine, given this test's place. */
  runPlaced: <A, E>(program: Effect.Effect<A, E, PlaceService | StoreRoot>) => Promise<A>;
  /** `nemia argv` as a person types it, over `e` (the board's engine when none is named), given this test's place. */
  main: (argv: string[], e?: Engine) => Promise<unknown>;
  /** A clock no real time moves, made the first time it is asked in this test. */
  clock: () => Steered;
};

/**
 * The stage of each top-level test of the file that calls this at its head, as `eachTest` makes it: a story's checkpoints, its
 * subtests, share their test's.
 */
export function staged(given: { runWith: RunWith; main: Main; engineOf: typeof engineOf }): Stage {
  const stand = eachTest(testPlace);
  const each = eachTest(() => {
    const made = testEngine();
    const settle = (id: string, phase: string, closeout?: unknown, exitCode?: number) =>
      made.settle(id, phase, { ...(closeout === undefined ? {} : { closeout }), ...(exitCode === undefined ? {} : { exitCode }) });
    const board: Board = { ...made, settle, e: given.engineOf(made.layer) };
    return { board, clock: undefined as Steered | undefined };
  });
  return {
    place: stand,
    board: () => each().board,
    runWith: runOver(given.runWith, () => stand().layer),
    runPlaced: runGiven(() => stand().layer),
    main: (argv, e) => given.main(argv, e ?? each().board.e, undefined, stand().place),
    clock: () => {
      const now = each();
      now.clock ??= steeredClock();
      return now.clock;
    },
  };
}
