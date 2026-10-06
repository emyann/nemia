/** What a look logged as a warning, kept beside what it answered, for tests of a runner that says why it read a session as it did. */
import { Effect, Logger } from 'effect';

/** Runs `look`, keeping every line logged as a warning. */
export const warned = async <A>(look: Effect.Effect<A, unknown>): Promise<{ value: A; warnings: string[] }> => {
  const warnings: string[] = [];
  const keeper = Logger.make(({ message, logLevel }) => {
    if (logLevel === 'Warn') warnings.push((Array.isArray(message) ? message : [message]).join(' '));
  });
  const value = await Effect.runPromise(look.pipe(Effect.provide(Logger.layer([keeper]))));
  return { value, warnings };
};
