/**
 * Read by `plain-faces.test.ts` alone, as an entry would be: a plain face that runs a program for its caller, an engine of Promise
 * methods, and beside them what an entry may export — a pure function and a verb that is an Effect. The test must name the first two.
 */
import { Effect } from 'effect';

/** A program run for its caller: refused. */
export const promiseFace = (n: number) => Effect.runPromise(Effect.succeed(n)) satisfies Promise<number>;

/** An engine whose verbs answer Promises: refused. */
export const promiseEngine = () => ({ file: (brief: string) => Effect.runPromise(Effect.succeed(brief)) satisfies Promise<string>, size: () => 1 });

/** A pure function: taken. */
export const pure = (n: number) => (n + 1);

/** A verb as an Effect: taken. */
export const verb = (n: number) => Effect.succeed(n) satisfies Effect.Effect<number>;
