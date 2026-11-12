/**
 * Whether a tool's answer fits what a host reads (apps/api, src/mcp/bound.ts, `answerFit`): the port's bound on the text of a tool's
 * answer (`ANSWER_BOUND`, characters), which Claude Code reads whole only under 50,000 characters, and what the port does with an answer
 * past it. An answer within the bound is answered. One past it is never cut: where it is a page of a list (the call asked `limit`, the
 * caller's or the port's own default page) and a smaller page is still a page, the port asks again for one at most half as long, so the
 * loop ends; where it is no page, or a page of one already, it is refused, in words that say how to narrow it. A page is judged up to
 * `PAGE_MOST` long, where half of it is a whole number exactly. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import { PAGE_MOST } from '../src/mcp/bound.ts';

/** What the port does with an answer: answer it, ask again for a page of `limit`, or refuse it with how to narrow it. */
export type AnswerFit = { readonly kind: 'answer' } | { readonly kind: 'smaller'; readonly limit: number } | { readonly kind: 'refuse' };

/** Whether `n` is a count: a whole number from `least`. */
const countFrom = (n: number, least: number): boolean => Number.isInteger(n) && n >= least;

/** Whether an answer of `size` characters is past `bound`. */
const past = (size: number, bound: number): boolean => size > bound;

/** Whether a page of `limit` can be asked smaller and still be a page: it is a page, of more than one. */
const shrinks = (limit: number | null): boolean => limit !== null && limit > 1;

const answerFitSpec = spec<(size: number, bound: number, limit: number | null) => AnswerFit>({
  requires: ({ input: [size, bound, limit] }) => countFrom(size, 0) && countFrom(bound, 1) && (limit === null || (countFrom(limit, 1) && limit <= PAGE_MOST)),
  ensures: {
    answeredExactlyWithinTheBound: {
      description: 'An answer is sent exactly when its text is within the bound',
      condition: ({ input: [size, bound], output }) => (output.kind === 'answer') === !past(size, bound),
    },
    aPageTooLongIsAskedSmaller: {
      description: 'A page past the bound, of more than one, is asked again smaller rather than cut or refused',
      condition: ({ input: [size, bound, limit], output }) => !(past(size, bound) && shrinks(limit)) || output.kind === 'smaller',
    },
    aSmallerPageIsAtMostHalfAndStillAPage: {
      description: 'A page asked again is at least one and at most half the page asked before, so the asking ends',
      condition: ({ input: [, , limit], output }) =>
        output.kind !== 'smaller' || (limit !== null && countFrom(output.limit, 1) && output.limit * 2 <= limit),
    },
    refusedWhereNoSmallerPageIs: {
      description: 'An answer past the bound that is no page, or a page of one, is refused, never cut',
      condition: ({ input: [size, bound, limit], output }) => !(past(size, bound) && !shrinks(limit)) || output.kind === 'refuse',
    },
  },
});

/** `answerFit`'s type, which `src/mcp/bound.ts` takes. */
export type AnswerFitOf = Implementation<typeof answerFitSpec>;
