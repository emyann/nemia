/**
 * A typed entry's own check of what it was handed (`checked`): the refusal its spec's `check` words, said before anything is read. The
 * CLI runs the `check` on what it parsed first; the api hands the entry's `input` straight to its handler, which runs the same words
 * through this, so a request is refused as the command line is.
 */
import { Effect } from 'effect';
import { Invalid } from '../refusal/refusal.ts';

/** Nothing where `wrong` is none; else `Invalid` in its words. */
export const checked = (wrong: string | null | undefined): Effect.Effect<void, Invalid> =>
  wrong ? Effect.fail(new Invalid({ message: wrong })) : Effect.void;
