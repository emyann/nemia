/**
 * The two drains' refusals, the holder's (`Engine.drain`) and the jobs' (`Engine.drainSessions`), each a `DrainRefused`, and what each pass
 * reads of an engine's options and its store beside its harnesses (`passReadsOf`).
 */
import { Effect, Layer, Schema } from 'effect';
import { SessionsDrained } from '../core/engine/index.ts';
import { sessionDrainFile, sessionDrainOf } from '../core/engine/drain.ts';
import { own } from '../core/index.ts';
import { declares } from '../harness/declaration.ts';
import { admissionOf, declarationOf, type EngineOptions, type HarnessConfig } from './options.ts';
import { fallbackOf } from './verb-harness.ts';

/** A drain this engine will not put, and why: a holder that is no process id. Nothing was written. */
export class DrainRefused extends Schema.TaggedError<DrainRefused>()('DrainRefused', {
  message: Schema.String,
}) {}

/** Why `drain` refuses its holder, or `undefined` for a process id or null. */
export const drainRefusalOf = (holder: unknown): string | undefined =>
  holder === null || (Number.isInteger(holder) && (holder as number) > 0)
    ? undefined
    : `takes the process id of the engine that holds the attached sessions, a whole number from 1, or null to let their calls go; it was handed ${JSON.stringify(holder) ?? 'nothing'}.`;

/** `drain`'s check of its holder: fails with `DrainRefused` for what `drainRefusalOf` refuses, and does nothing otherwise. */
export const drainChecked = (holder: unknown): Effect.Effect<void, DrainRefused> => {
  const refused = drainRefusalOf(holder);
  return refused === undefined ? Effect.void : Effect.fail(new DrainRefused({ message: refused }));
};

/**
 * Why `drainSessions` refuses what it was handed, or `undefined` for one grace of whole milliseconds from 0 and no other key, or null: a
 * grace that is no length of time, or a key it does not read, would put a drain no job judges as asked.
 */
export const drainSessionsRefusalOf = (args: readonly unknown[]): string | undefined => {
  const [given] = args;
  const grace = (o: object) => Object.keys(o).length === 1 && Number.isSafeInteger((o as { graceMs?: unknown }).graceMs);
  return args.length === 1 &&
    (given === null || (typeof given === 'object' && !Array.isArray(given) && grace(given) && (given as { graceMs: number }).graceMs >= 0))
    ? undefined
    : `takes \`{ graceMs }\`, how long a call in flight is given to finish in whole milliseconds from 0, or null to lift the sessions' drain; it was handed ${args.map((a) => JSON.stringify(a) ?? 'nothing').join(', ') || 'nothing'}.`;
};

/** `drainSessions`' check of what it was handed: fails with `DrainRefused` for what `drainSessionsRefusalOf` refuses, and nothing else. */
export const drainSessionsChecked = (args: readonly unknown[]): Effect.Effect<void, DrainRefused> => {
  const refused = drainSessionsRefusalOf(args);
  return refused === undefined ? Effect.void : Effect.fail(new DrainRefused({ message: refused }));
};

/**
 * Whether the sessions' drain, read standing (`stands`), holds a task of the harness `harness` of `harnesses` (`undefined`: the
 * default, `fallback`): it stands, and the harness declares `drain`. A harness that does not — a Codex task, a command's, a remote
 * agent's — is never held by it, its deadline counted on; a runner of the consumer's, which declares nothing, is held, as every
 * harness was before harnesses declared, since the runtime cannot tell its parked end from another.
 * Exported only for the tests that import it.
 */
export const drainHolds =
  (stands: boolean, harnesses: Record<string, HarnessConfig>, fallback: string) =>
  (harness: string | undefined): boolean => {
    const config = own(harnesses, harness ?? fallback);
    if (!stands || config === undefined) return false;
    const can = declarationOf(config)?.can;
    return can === undefined || declares(can, 'drain');
  };

/**
 * What each pass of an engine over `options` reads beside its store and its harnesses: what it admits under (`admissionOf`), and
 * whether the store's sessions' drain stands, read off its file once per pass, then asked per task by its harness (`drainHolds`,
 * `SessionsDrained`, `Now.drained`).
 */
export const passReadsOf = (options: EngineOptions, harnesses: Record<string, HarnessConfig>) =>
  Layer.merge(
    admissionOf(options, harnesses),
    Layer.succeed(SessionsDrained)(() =>
      drainHolds(sessionDrainOf(sessionDrainFile(options.root)) !== null, harnesses, fallbackOf(harnesses, options.defaultHarness)),
    ),
  );
