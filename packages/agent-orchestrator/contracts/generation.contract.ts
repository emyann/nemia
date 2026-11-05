/**
 * A factory's generation after a write (agent-orchestrator, src/factories/generation.ts): `metadata.generation`, the count of
 * changes to its spec, kept on its file as `generation`. A file written before the counter reads as generation 1. A write that changes
 * the spec counts one more; a write that changes nothing of it (its status, a key no spec holds) keeps the count. What "changes the spec"
 * compares is the door's, held by a test: this law says only what the count does with the answer.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The largest whole number a double holds exactly, `Number.MAX_SAFE_INTEGER`, written out: the verifier reads no global's constant. */
const MAX_SAFE = 9_007_199_254_740_991;

/** A generation a file can hold: a whole number from 1, with room for one more. */
const held = (n: number): boolean => Number.isSafeInteger(n) && n >= 1 && n < MAX_SAFE;

/** The generation a file reads as: its own, or 1 for a file written before the counter. */
const readAs = (before: number | null): number => before ?? 1;

const generationAfterSpec = spec<(before: number | null, specChanged: boolean) => number>({
  requires: ({ input: [before] }) => before === null || held(before),
  ensures: {
    keptUnlessTheSpecChanged: {
      description: 'A write that changes nothing of the spec keeps the generation the file reads as, 1 for one without a counter',
      condition: ({ input: [before, changed], output }) => changed || output === readAs(before),
    },
    countsOneChange: {
      description: 'A write that changes the spec counts exactly one change more than the file read as',
      condition: ({ input: [before, changed], output }) => !changed || output === readAs(before) + 1,
    },
  },
});

/** `generationAfter`'s type, which `src/factories/generation.ts` takes. */
export type GenerationAfter = Implementation<typeof generationAfterSpec>;
