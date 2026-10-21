/**
 * A test's stand-in for time: Effect's `TestClock`, which says each rest a program asked for and each one that woke.
 *
 * `TestClock.adjust` wakes only the sleeps already asked, and a controller's loop reaches its rest after real work, so a test waits for
 * the rest it counts (`asked`, on `bell`) before it moves the clock, by the shipped duration written as a literal. Nothing here is a
 * service of `src`: `Clock` is Effect's reference with a live default, and only a test replaces it.
 */
import { Clock, Duration, Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { bell, type Bell } from 'agent-runtime/testing';

/** A steered clock: its layer, the rests asked and woken in milliseconds, in order, the bell rung at each, and the hand that moves it. */
export type Steered = {
  layer: Layer.Layer<never>;
  asked: number[];
  woken: number[];
  bell: Bell;
  adjust: (by: Duration.Input) => Promise<void>;
};

/**
 * A clock no real time moves, for one program. It is moved by nothing once as it is made, which ends `TestClock`'s own real-time warning
 * of a clock nobody moves: that warning's timer would hold a failed test's process open, and its line would reach the test's logger.
 *
 * @returns `layer`, which gives the program its clock; `asked`, each sleep's milliseconds as it is asked, `bell` rung with it; `woken`,
 *   each sleep's milliseconds once the program runs on past it; and `adjust`, which moves the clock by a duration, waking the sleeps
 *   asked that end within it, and answers once the fibers woken had their turn
 * @throws from `adjust`, when no program was given the layer yet: there is no clock to move
 */
export function steeredClock(): Steered {
  const asked: number[] = [];
  const woken: number[] = [];
  const rung = bell();
  let made: TestClock.TestClock | undefined;
  const layer = Layer.effect(
    Clock.Clock,
    Effect.gen(function* () {
      const clock = yield* TestClock.make();
      yield* clock.adjust(0);
      made = clock;
      const sleep = (duration: Duration.Duration) =>
        Effect.suspend(() => {
          const ms = Duration.toMillis(duration);
          asked.push(ms);
          rung.ring();
          return clock.sleep(duration).pipe(
            Effect.andThen(
              Effect.sync(() => {
                woken.push(ms);
                rung.ring();
              }),
            ),
          );
        });
      return { ...clock, sleep };
    }),
  );
  const adjust = async (by: Duration.Input): Promise<void> => {
    if (!made) throw new Error('steeredClock: no program was given this clock yet, so there is none to move; provide its `layer` first');
    await Effect.runPromise(made.adjust(by));
    await new Promise<void>((turn) => setImmediate(turn));
  };
  return { layer, asked, woken, bell: rung, adjust };
}
