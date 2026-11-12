/**
 * How a client of the `Api` sends a write: as JSON. The api's write guard refuses a write (any method but GET and HEAD) that does not say
 * `content-type: application/json`, a body any page could send without asking; a typed client gives an endpoint with no payload no body
 * at all, so the one typed client of the `Api` (`apiClient`, `api-client.ts`), which every consumer of the api makes, maps its
 * requests through `jsonBodied`.
 */
import { HttpClientRequest } from 'effect/http';

/**
 * `request`, where it is a write with no body, with `{}` as its body, sent as `content-type: application/json`; a read, and a write with
 * a body of its own, as it is.
 */
export const jsonBodied = (request: HttpClientRequest.HttpClientRequest): HttpClientRequest.HttpClientRequest =>
  request.method === 'GET' || request.method === 'HEAD' || request.body._tag !== 'Empty'
    ? request
    : HttpClientRequest.bodyJsonUnsafe(request, {});
