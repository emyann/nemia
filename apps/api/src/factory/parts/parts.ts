/**
 * What the handlers of a factory and its parts share: a list query as the package reads it, `?labelSelector=` and its retired spelling
 * `?selector=` read the same, each given again for another (OR); and a name that is no factory's refused `Invalid` before anything is
 * read. Their writes are guarded as every write is, before their body is read (`writeGuard`, guard.ts).
 */
import { factoryNameRefusal, Invalid as Refused, type ObjectQuery } from 'agent-orchestrator';

/** One selector, several, or none, as a list. */
const listOf = (given: string | readonly string[] | undefined) =>
  given === undefined ? [] : typeof given === 'string' ? [given] : [...given];

/** A list's query as the `Api` decodes it. */
export type ListQuery = {
  readonly limit?: string;
  readonly continue?: string;
  readonly labelSelector?: string | readonly string[];
  readonly selector?: string | readonly string[];
};

/**
 * A list's query as the package reads it.
 * @param query The list's query, as the endpoint decodes it.
 */
export const queryOf = (query: ListQuery) =>
  ({
    limit: query.limit === undefined ? null : Number(query.limit),
    continue: query.continue,
    labelSelector: [...listOf(query.labelSelector), ...listOf(query.selector)],
  }) satisfies ObjectQuery as ObjectQuery;

/**
 * `name` as a factory's, or `Invalid` in the package's words, the route named, before anything is read.
 * @param route The route, as the refusal names it.
 * @param name The factory's name, as the request gives it.
 */
export const factoryNamed = (route: string, name: string) => {
  const wrong = factoryNameRefusal(name);
  if (wrong !== undefined) throw new Refused({ message: `${route}: ${wrong}` });
};
