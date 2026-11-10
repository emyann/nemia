/**
 * Whether a list's request asks for the list as a `Table` (Kubernetes' server-side printing, objects' `table.ts`): its `Accept` header
 * names `TABLE_ACCEPT` among its values, parameters spaced or not. A list endpoint that serves one reads it in its handler and answers
 * the `Table` its read model prints, or the list as it does today.
 */
import { Effect } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { TABLE_ACCEPT } from 'objects';

/** Whether `accept`, an `Accept` header's value, names `TABLE_ACCEPT` among its comma-separated values. */
export const acceptsTable = (accept: string | undefined): boolean =>
  accept !== undefined && accept.split(',').some((value) => value.replace(/\s+/g, '').toLowerCase() === TABLE_ACCEPT.toLowerCase());

/** Whether the request being answered asks for a `Table` (`acceptsTable` of its `Accept` header). */
export const wantsTable: Effect.Effect<boolean, never, HttpServerRequest.HttpServerRequest> = Effect.gen(function* () {
  const request = yield* HttpServerRequest.HttpServerRequest;
  return acceptsTable(request.headers['accept']);
});
