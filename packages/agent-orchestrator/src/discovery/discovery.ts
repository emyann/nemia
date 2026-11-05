/**
 * What the api's discovery says it serves: each route of the `Api` read off its path (`routeOf`, whose rows discovery.test.ts holds),
 * and the resources those routes and the kinds served make (`resourcesOf`, proved by contracts/discovery.contract.ts), one per kind under
 * its plural and one per `<plural>/<sub>`, their verbs in Kubernetes' words. Pure.
 */
import type { ResourcesOf } from '../../contracts/discovery.contract.ts';

/** A method a route of the `Api` answers, as discovery reads it. */
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A verb of a resource, in Kubernetes' words, as `objects` names them (`RESOURCE_VERBS`). */
export type ResourceVerb = 'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete';

/**
 * A route as its path reads: the plural after `/api/` or `/api/namespaces/:namespace/`, whether it is under a namespace, whether a name
 * follows the plural (`item`), and the words after it with the names left out (`sub`, `steps/retry`), null where none follow.
 */
export type ApiRoute = {
  readonly method: RouteMethod;
  readonly plural: string;
  readonly namespaced: boolean;
  readonly item: boolean;
  readonly sub: string | null;
};

/** A kind the api serves, and the plural its paths name it by. */
export type KindPlural = { readonly kind: string; readonly plural: string };

/** A resource discovery lists: its name (a plural, or `<plural>/<sub>`), its kind, whether a namespace holds it, and its verbs. */
export type Resource = { readonly name: string; readonly kind: string; readonly namespaced: boolean; readonly verbs: ResourceVerb[] };

export type { ResourcesOf };

/** The methods discovery reads a route of, each a verb of Kubernetes'. */
const ROUTE_METHODS: readonly RouteMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

/** Whether a path's segment is a name the route is given (`:name`), not a word of it. */
const isParam = (segment: string): boolean => segment.startsWith(':');

/**
 * The route `method` and `path` (the `Api`'s, with `:param` segments) read as: its plural, the first word after `/api/` or after
 * `/api/namespaces/:namespace/`; whether a name follows it; and the words after it, its names left out, joined by `/`. Null where the
 * method is none discovery reads, the path is not under `/api/`, or a segment is empty or the plural is a name.
 */
export const routeOf = (method: string, path: string): ApiRoute | null => {
  const routeMethod = ROUTE_METHODS.find((m) => m === method);
  if (routeMethod === undefined || !path.startsWith('/api/')) return null;
  const segments = path.slice('/api/'.length).split('/');
  if (segments.some((s) => s === '')) return null;
  const namespaced = segments.length > 2 && segments[0] === 'namespaces' && segments[1] !== undefined && isParam(segments[1]);
  const [plural, ...rest] = namespaced ? segments.slice(2) : segments;
  if (plural === undefined || isParam(plural)) return null;
  const words = rest.filter((s) => !isParam(s));
  return {
    method: routeMethod,
    plural,
    namespaced,
    item: rest[0] !== undefined && isParam(rest[0]),
    sub: words.length === 0 ? null : words.join('/'),
  };
};

/** Every verb, in the order discovery names them. */
const VERBS: readonly ResourceVerb[] = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

/** The verb a method is, said of one object: what a sub-resource's route does, and a kind's route of one by its name. */
const verbOfMethod = (method: RouteMethod): ResourceVerb =>
  method === 'GET' ? 'get' : method === 'POST' ? 'create' : method === 'PUT' ? 'update' : method === 'PATCH' ? 'patch' : 'delete';

/**
 * Whether `route` does `verb` of the resource it names: a sub-resource's route its method's verb alone; a kind's route of the
 * collection `list` and `watch` (every list is watched with `?watch=true`) where it is a `GET`, `create` where it is a `POST`; and of one
 * by its name its method's verb, but `create`, which is the collection's.
 */
const routeDoes = (route: ApiRoute, verb: ResourceVerb): boolean => {
  if (route.sub !== null) return verbOfMethod(route.method) === verb;
  if (!route.item) return route.method === 'GET' ? verb === 'list' || verb === 'watch' : route.method === 'POST' && verb === 'create';
  return route.method !== 'POST' && verbOfMethod(route.method) === verb;
};

/** The verbs the routes of `kind`'s plural with sub-resource `sub` (null for the kind itself) do, in the order discovery names them. */
const verbsOf = (routes: readonly ApiRoute[], kind: KindPlural, sub: string | null): ResourceVerb[] =>
  VERBS.flatMap((v) => (routes.some((t) => t.plural === kind.plural && t.sub === sub && routeDoes(t, v)) ? [v] : []));

/** Whether a route of `kind`'s plural is under a namespace, which makes the kind and each of its sub-resources namespaced. */
const namespacedOf = (routes: readonly ApiRoute[], kind: KindPlural): boolean =>
  routes.some((t) => t.plural === kind.plural && t.namespaced);

/** The sub-resource the route at `i` of `routes` is the first of, where a kind has its plural; null for any other route. */
const subResourceAt = (routes: readonly ApiRoute[], kinds: readonly KindPlural[], t: ApiRoute, i: number): Resource | null => {
  const kind = kinds.find((k) => k.plural === t.plural);
  return kind === undefined || t.sub === null || routes.slice(0, i).some((u) => u.plural === t.plural && u.sub === t.sub)
    ? null
    : { name: kind.plural + '/' + t.sub, kind: kind.kind, namespaced: namespacedOf(routes, kind), verbs: verbsOf(routes, kind, t.sub) };
};

/**
 * What discovery lists of `routes` for `kinds`: each kind under its plural, in their order, then each sub-resource a kind's routes serve,
 * at its first route; a route whose plural no kind has is listed by none.
 */
export const resourcesOf: ResourcesOf = (routes, kinds) =>
  [
    ...kinds.map((kind): Resource | null => ({
      name: kind.plural,
      kind: kind.kind,
      namespaced: namespacedOf(routes, kind),
      verbs: verbsOf(routes, kind, null),
    })),
    ...routes.map((t, i) => subResourceAt(routes, kinds, t, i)),
  ].filter((r) => r !== null);
