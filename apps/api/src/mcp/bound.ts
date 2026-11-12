/**
 * What an answer of the MCP port may be for a host to read it (`answerFit`, proved by `contracts/answer-fit.contract.ts`): the bound on
 * an answer's characters (`ANSWER_BOUND`), the text and any `structuredContent`'s JSON counted together, under the 50,000 characters
 * past which Claude Code saves a tool's result to a file in place of reading it; the page a list is asked for where its call gives none
 * (`PORT_PAGE`); and what the port says of an answer past the bound that no smaller page can bring under it (`pastTheBound`), which
 * names the narrowings the tool takes, never a cut answer. Pure.
 */
import type { AnswerFitOf } from '../../contracts/answer-fit.contract.ts';

export type { AnswerFit } from '../../contracts/answer-fit.contract.ts';

/** The most characters an answer of the port holds: under Claude Code's 50,000-character threshold, with margin. */
export const ANSWER_BOUND = 40_000;

/**
 * The longest page the port judges (`answerFit` is asked of a page no longer, the port taking a longer one as this): within it, half a
 * page is a whole number the verifier proves exact.
 */
export const PAGE_MOST = 1_000_000;

/** The page a list tool asks for where its call gives no `limit`. */
export const PORT_PAGE = 20;

/**
 * What the port does with an answer of `size` characters against `bound`, asked as a page of `limit` (null where it is no page): answer
 * it within the bound; past it, ask again for a page half as long where the page holds more than one; refuse it otherwise.
 */
export const answerFit: AnswerFitOf = (size, bound, limit) => {
  if (size <= bound) return { kind: 'answer' };
  if (limit === null || limit <= 1) return { kind: 'refuse' };
  const half = limit / 2;
  return { kind: 'smaller', limit: Math.floor(half) };
};

/** The keys a call can narrow an answer by, where its tool takes them. */
const NARROWING = ['labelSelector', 'fieldSelector', 'limit', 'fields'];

/**
 * The words of a refusal of `tool`'s answer of `size` characters, past `bound`: that it is past it, and how to narrow it — the
 * narrowing keys `queryKeys` holds, or, where it holds none, a narrower read of one object.
 */
export const pastTheBound = (tool: string, size: number, bound: number, queryKeys: readonly string[]): string => {
  const keys = NARROWING.filter((key) => queryKeys.includes(key));
  const how =
    keys.length > 0
      ? `narrow it: give ${keys.join(', ')}${keys.includes('limit') ? ' (a smaller limit, then continue for the next page)' : ''}`
      : 'ask a narrower read of one object: a list tool for the names, then the tool that reads one of them, or a sub-resource of it (a step, a try, its closeout)';
  return `${tool} answered ${size} characters, past the ${bound} this port answers at once, and was not sent: ${how}.`;
};
