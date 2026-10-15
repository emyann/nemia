/**
 * The engine's `compact` verb, and what refuses it: each harness's captures of its ended sessions rewritten to what their readers read
 * (`RunnerOps.compact`), or counted.
 */
import { Effect, Schema } from 'effect';
import type { RunnerError, SessionsCompacted } from '../harness/index.ts';
import type { SeamOps } from '../a2a/index.ts';

/** Why `compact` did nothing: an argument other than nothing or `{ yes }`, a boolean. */
export class CompactRefused extends Schema.TaggedError<CompactRefused>()('CompactRefused', { message: Schema.String }) {}

/** What `compact` did, or would do without `yes`, by harness: each harness that keeps less of an ended capture (`SessionsCompacted`). */
export type CompactReport = { compacted: boolean; harnesses: Record<string, SessionsCompacted> };

/** Whether `args` are what `compact` takes: nothing, or one `{ yes }` whose `yes` is absent or a boolean, and no other key. */
const taken = (args: readonly unknown[]): boolean => {
  if (args.length === 0) return true;
  if (args.length > 1) return false;
  const [options] = args;
  if (options === undefined) return true;
  if (typeof options !== 'object' || options === null || Array.isArray(options)) return false;
  const { yes } = options as { yes?: unknown };
  return Object.keys(options).every((key) => key === 'yes') && (yes === undefined || typeof yes === 'boolean');
};

/**
 * `compact` over `runners`, the engine's harnesses as the seam offers them: asks each harness with a `compact`, one after another,
 * to count its ended sessions' captures and what they would keep, or with `{ yes: true }` to rewrite them; a harness without it is
 * not asked. Refuses any argument but nothing or `{ yes }`, writing nothing; a harness's `RunnerError` fails the call.
 */
export const compactVerbOf = (runners: Record<string, SeamOps>) =>
  Effect.fn('Engine.compact')(function* (options?: { yes?: boolean }): Effect.fn.Return<CompactReport, CompactRefused | RunnerError> {
    const args = [...arguments];
    if (!taken(args)) {
      return yield* Effect.fail(
        new CompactRefused({
          message: `takes nothing to count what the captures of ended sessions would keep, or \`{ yes: true }\` to rewrite them; it was handed ${args.map((a) => JSON.stringify(a)).join(', ')}: nothing was written.`,
        }),
      );
    }
    const dry = options?.yes !== true;
    const harnesses: Record<string, SessionsCompacted> = {};
    for (const [name, ops] of Object.entries(runners)) if (ops.compact) harnesses[name] = yield* ops.compact({ dry });
    return { compacted: !dry, harnesses };
  });
