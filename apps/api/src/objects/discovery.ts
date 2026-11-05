/**
 * The discovery group's handler (`objects`' `Api`, `GET /api`): every resource the api serves, read off the `Api` itself, so it cannot
 * drift from what is served. Each endpoint's path is read as a route by the package (`routeOf`), and the resources those routes and
 * `KINDS` with their plurals (`RESOURCE_PLURALS`) make are the package's (`resourcesOf`, proved by its contract); this adds each
 * resource's singular, its kind in lower case, and the list's envelope. Computed once: the `Api` does not change while the api runs.
 */
import { Effect } from 'effect';
import { HttpApiBuilder } from 'effect/http-api';
import { resourcesOf, type Route, routeOf } from 'agent-orchestrator';
import { API_VERSION, Api, type APIResourceList, KINDS, RESOURCE_PLURALS } from 'objects';

/** Every route of the `Api` discovery reads: each endpoint's method and path, those `routeOf` reads as a resource's. */
const routes: Route[] = Object.values(Api.groups).flatMap((group) =>
  Object.values(group.endpoints).flatMap((endpoint) => {
    const route = routeOf(endpoint.method, endpoint.path);
    return route === null ? [] : [route];
  }),
);

/** What `GET /api` answers. */
export const discovered: APIResourceList = {
  apiVersion: API_VERSION,
  kind: 'APIResourceList',
  groupVersion: API_VERSION,
  resources: resourcesOf(
    routes,
    KINDS.map((kind) => ({ kind, plural: RESOURCE_PLURALS[kind] })),
  ).flatMap((resource) => {
    const kind = KINDS.find((k) => k === resource.kind);
    return kind === undefined ? [] : [{ ...resource, kind, singularName: kind.toLowerCase() }];
  }),
};

export const discoveryHandlers = HttpApiBuilder.group(Api, 'discovery', (handlers) =>
  handlers.handle('resources', () => Effect.succeed(discovered)),
);
