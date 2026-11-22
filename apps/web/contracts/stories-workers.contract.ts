/**
 * How many story files the stories' Vitest runs at once (apps/web, `.storybook/workers.ts`, `storiesWorkersOf`, read by
 * `vitest.config.ts` as the storybook project's `maxWorkers`). Each worker is a Chromium page of its own, about a gigabyte: on a person's
 * machine, or a step's, which share their memory, one at a time; under CI (`CI` set), on a runner that runs nothing else, one a core,
 * as many as the runner reports (`os.availableParallelism()`); and anywhere, as many as a person asks by `STORIES_WORKERS=<n>`. An ask
 * that is no whole number of one or more is refused, with the fix.
 */
import { assume, type Implementation, spec } from '@emyann/tsverify';
import { askedCount } from '../.storybook/asked.ts';

/**
 * What the bound is read from: whether this runs under CI (`CI` set), what `STORIES_WORKERS` holds (undefined where unset), and how
 * many cores the machine reports.
 */
export type WorkersAsked = { readonly ci: boolean; readonly asked: string | undefined; readonly cores: number };

/** The bound: as many story files at once, or a refusal of the ask, saying what to set instead. */
export type StoriesWorkers = { readonly kind: 'workers'; readonly workers: number } | { readonly kind: 'refused'; readonly message: string };

/**
 * How many story files an ask says (`.storybook/asked.ts`), or nothing where it is no whole number of one or more as decimal digits
 * with no sign, space or leading zero: a pattern, which the verifier does not read (tsverify's `docs/reads.md`: no regular expression),
 * so declared here with what the laws lean on of it, the code calling the same function, and held on real asks by `brokenOn`
 * (`test/storybook-workers.test.ts`).
 */
export const askedCountOf = assume(askedCount, {
  pure: true,
  ensures: {
    aWholeCount: {
      description: 'An ask read as a count is a whole number of one or more',
      condition: ({ output }) => output === undefined || (Number.isInteger(output) && output >= 1),
    },
  },
});

/** Whether `asked` says nothing: unset, or set empty. */
const unasked = (asked: string | undefined) => asked === undefined || asked === '';

const storiesWorkersOfSpec = spec<(asked: WorkersAsked) => StoriesWorkers>({
  requires: ({ input: [asked] }) => Number.isInteger(asked.cores) && asked.cores >= 1,
  ensures: {
    oneAtATimeByDefault: {
      description: "Off CI, with nothing asked, one story file at a time: a person's or a step's machine shares its memory",
      condition: ({ input: [asked], output }) =>
        asked.ci || !unasked(asked.asked) || (output.kind === 'workers' && output.workers === 1),
    },
    aCoreEachOnCi: {
      description: 'Under CI, with nothing asked, one story file a core, as many as the runner reports',
      condition: ({ input: [asked], output }) =>
        !asked.ci || !unasked(asked.asked) || (output.kind === 'workers' && output.workers === asked.cores),
    },
    theAskWins: {
      description: 'A whole number of one or more asked by STORIES_WORKERS is the bound, under CI or not',
      condition: ({ input: [asked], output }) =>
        unasked(asked.asked) ||
        askedCount(asked.asked) === undefined ||
        (output.kind === 'workers' && output.workers === askedCount(asked.asked)),
    },
    anyOtherAskRefused: {
      description: 'An ask that is set and is no whole number of one or more is refused, never read as a default',
      condition: ({ input: [asked], output }) =>
        (output.kind === 'refused') === (!unasked(asked.asked) && askedCount(asked.asked) === undefined),
    },
    neverNone: {
      description: 'A bound is never below one story file',
      condition: ({ output }) => output.kind === 'refused' || (Number.isInteger(output.workers) && output.workers >= 1),
    },
  },
});
export type StoriesWorkersOf = Implementation<typeof storiesWorkersOfSpec>;
