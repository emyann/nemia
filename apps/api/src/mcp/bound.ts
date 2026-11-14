/**
 * What an answer of the MCP port may be for a host to read it (`answerFit`, proved by `contracts/answer-fit.contract.ts`): the bound on
 * an answer's characters (`ANSWER_BOUND`), the text and any `structuredContent`'s JSON counted together, under the 50,000 characters
 * past which a host saves a tool's result to a file in place of reading it; the page a list is asked for where its call gives none
 * (`PORT_PAGE`); and what the port says of an answer past the bound that no smaller page can bring under it (`pastTheBound`), which
 * names the narrowings the read takes (`narrowingOf`, its keys in `objects`' `READS`), never a cut answer. Pure.
 */
import type { AnswerFitOf } from '../../contracts/answer-fit.contract.ts';

export type { AnswerFit } from '../../contracts/answer-fit.contract.ts';
export { PAGE_MOST } from './page.ts';

/** The most characters an answer of the port holds: under the 50,000 past which a host saves a result to a file, with margin. */
export const ANSWER_BOUND = 40_000;

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

/** The keys a call can narrow an answer by, where its tool takes them and its endpoint names none of its own in `READS`. */
const NARROWING = ['labelSelector', 'fieldSelector', 'limit', 'fields'];

/** The keys that count what a read answers: a list's page, a cursor's events, a log's lines, a body's characters. */
const COUNTS = ['limit', 'last', 'tail', 'bodyLimit'];

/**
 * Whether `key`, sent as `value`, already asks the least of its read: a count of 1, or a list of fields or diffs that names none. A
 * refusal never asks a call to narrow by it again.
 */
const atNarrowest = (key: string, value: unknown): boolean =>
  COUNTS.includes(key) ? String(value) === '1' : (key === 'fields' || key === 'diffs') && value === '';

/**
 * The keys a refusal of a read names to narrow it: the read's own (`narrow`, its entry in `READS`), or, for an endpoint that names none,
 * those of `NARROWING` its query takes (`queryKeys`); less each the call already `sent` at its narrowest.
 */
export const narrowingOf = (
  narrow: readonly string[] | undefined,
  queryKeys: readonly string[],
  sent: Readonly<Record<string, unknown>>,
): string[] =>
  (narrow ?? NARROWING.filter((key) => queryKeys.includes(key))).filter((key) => !(key in sent && atNarrowest(key, sent[key])));

/**
 * The words of a refusal of `tool`'s answer of `size` characters, past `bound`: that it is past it, and how to narrow it — the
 * narrowing keys `keys` holds (`narrowingOf`), or, where it holds none, a narrower read of one object.
 */
export const pastTheBound = (tool: string, size: number, bound: number, keys: readonly string[]): string => {
  const how =
    keys.length > 0
      ? `narrow it: give ${keys.join(', ')}${keys.includes('limit') ? ' (a smaller limit, then continue for the next page)' : ''}`
      : 'ask a narrower read of one object: a list tool for the names, then the tool that reads one of them, or a sub-resource of it (a step, a try, its closeout)';
  return `${tool} answered ${size} characters, past the ${bound} this port answers at once, and was not sent: ${how}.`;
};
