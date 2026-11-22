/**
 * Whether a list's request asks for the list as a `Table` (Kubernetes' server-side printing, objects' `table.ts`): its `Accept` header
 * names `TABLE_ACCEPT` among its values, parameters spaced or not. A list endpoint that serves one reads it in its handler and answers
 * the `Table` its read model prints, or the list as it does today.
 */
import { Effect } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { TABLE_ACCEPT, type Table } from 'objects';

/**
 * Whether `accept`, an `Accept` header's value, names `TABLE_ACCEPT` among its comma-separated values.
 * @param accept The Accept header's value, or undefined where the request sends none.
 */
export const acceptsTable = (accept: string | undefined) =>
  accept !== undefined && accept.split(',').some((value) => value.replace(/\s+/g, '').toLowerCase() === TABLE_ACCEPT.toLowerCase());

/** Whether the request being answered asks for a `Table` (`acceptsTable` of its `Accept` header). */
export const wantsTable: Effect.Effect<boolean, never, HttpServerRequest.HttpServerRequest> = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return acceptsTable(request.headers['accept']);
});

/**
 * `list`, the effect that answers a list's page, as the request asks it: the page itself, or `print`'s table of it where the request asks
 * for a `Table` (`wantsTable`).
 * @param list The effect that answers the page.
 * @param print The kind's table of a page (the orchestrator's `<kind>Table`).
 */
export const listOrTable = <L, E, R>(list: Effect.Effect<L, E, R>, print: (page: L) => Table) =>
  Effect.flatMap(wantsTable, (table) => Effect.map(list, (page) => (table ? print(page) : page)));
