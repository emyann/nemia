/**
 * What the api's discovery says it serves (agent-orchestrator, src/discovery/discovery.ts, `resourcesOf`): from the routes the
 * `Api` of `objects` serves, each read off its path (`routeOf`, whose rows a test holds), and the kinds it serves with their plurals
 * (`KINDS`, `RESOURCE_PLURALS`), one resource per kind, named by its plural, and one per sub-resource of a kind, named
 * `<plural>/<sub>`, as Kubernetes' discovery names `pods/log`. A resource is namespaced exactly when a route of it is under
 * `/api/namespaces/:namespace/`, and its verbs are exactly what its routes do, in Kubernetes' words: a `GET` of the collection is `list`,
 * and `watch` beside it, since every list is watched with `?watch=true`; a `GET` of one is `get`, a `POST` to the collection `create`,
 * a `PUT` of one `update`, a `PATCH` `patch` and a `DELETE` `delete`; a sub-resource's verb is its method's alone. A route of a plural no
 * kind is served by (`/api/builtin/mcpservers`) is said by none. The order of the resources and of their verbs is the door's.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { KindPlural, Resource, ResourceVerb, ApiRoute } from '../src/discovery/discovery.ts';

/** Every verb, to say of each whether a resource has it. */
const VERBS: readonly ResourceVerb[] = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

/** Whether `route`, a route of a kind's collection, does `verb`: a `GET` lists and watches, a `POST` creates. */
const collectionDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  route.method === 'GET' ? verb === 'list' || verb === 'watch' : route.method === 'POST' && verb === 'create';

/** Whether `route`, a route of one object by its name, does `verb`: `GET` gets, `PUT` updates, `PATCH` patches, `DELETE` deletes. */
const itemDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  verb === 'get'
    ? route.method === 'GET'
    : verb === 'update'
      ? route.method === 'PUT'
      : verb === 'patch'
        ? route.method === 'PATCH'
        : verb === 'delete' && route.method === 'DELETE';

/** Whether `route`, a route of a kind itself (no `sub`), does `verb`. */
const kindDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  route.sub === null && (route.item ? itemDoes(route, verb) : collectionDoes(route, verb));

/** Whether `route`, a route of a sub-resource, does `verb`: its method's verb alone. */
const subDoes = (route: ApiRoute, verb: ResourceVerb): boolean =>
  route.sub !== null &&
  (route.method === 'GET'
    ? verb === 'get'
    : route.method === 'POST'
      ? verb === 'create'
      : route.method === 'PUT'
        ? verb === 'update'
        : route.method === 'PATCH'
          ? verb === 'patch'
          : verb === 'delete');

/**
 * The name of `plural`'s sub-resource `sub`, `<plural>/<sub>`. Joined with `+`, which the verifier reads as the strings joined, where it
 * reads a template string as an unknown string of its parts and could not tell two names apart.
 */
const subName = (plural: string, sub: string): string => plural + '/' + sub;

/** Whether no kind and no plural is given twice, and no plural holds a `/`. */
const distinctKinds = (kinds: readonly KindPlural[]): boolean =>
  kinds.every((k, i) => !k.plural.includes('/') && !kinds.slice(0, i).some((j) => j.kind === k.kind || j.plural === k.plural));

/**
 * Whether `resources` lists `name` exactly once, and of `kind`: one resource of that name and kind, and no two of that name. Said
 * without a `.filter`, which the verifier does not read inside a quantifier.
 */
const onceAs = (resources: readonly Resource[], name: string, kind: string): boolean =>
  resources.some((r) => r.name === name && r.kind === kind) &&
  resources.every((r, i) => r.name !== name || !resources.slice(0, i).some((q) => q.name === name));

const resourcesOfSpec = spec<(routes: readonly ApiRoute[], kinds: readonly KindPlural[]) => Resource[]>({
  requires: ({ input: [, kinds] }) => distinctKinds(kinds),
  ensures: {
    oneResourcePerKind: {
      description: 'Every kind served is listed once, under its plural',
      condition: ({ input: [, kinds], output }) => kinds.every((k) => onceAs(output, k.plural, k.kind)),
    },
    onlyWhatIsServed: {
      description: "A resource listed is a kind's, or a sub-resource one of a kind's routes serves",
      condition: ({ input: [routes, kinds], output }) =>
        output.every((r) =>
          kinds.some(
            (k) =>
              r.kind === k.kind &&
              (r.name === k.plural || routes.some((t) => t.plural === k.plural && t.sub !== null && r.name === subName(k.plural, t.sub))),
          ),
        ),
    },
    everySubResourceListed: {
      description: 'Each sub-resource a route of a kind serves is listed once, of that kind',
      condition: ({ input: [routes, kinds], output }) =>
        routes.every(
          (t) => t.sub === null || kinds.every((k) => k.plural !== t.plural || onceAs(output, subName(k.plural, t.sub ?? ''), k.kind)),
        ),
    },
    verbsAreWhatTheRoutesDo: {
      description: "A kind's verbs are exactly what its routes do, and a sub-resource's what its own routes do",
      condition: ({ input: [routes, kinds], output }) =>
        output.every((r) =>
          VERBS.every(
            (v) =>
              r.verbs.includes(v) ===
              routes.some((t) =>
                kinds.some(
                  (k) =>
                    k.kind === r.kind &&
                    t.plural === k.plural &&
                    (r.name === k.plural ? kindDoes(t, v) : t.sub !== null && r.name === subName(k.plural, t.sub) && subDoes(t, v)),
                ),
              ),
          ),
        ),
    },
    eachVerbOnce: {
      description: 'A resource names each of its verbs once',
      condition: ({ output }) => output.every((r) => r.verbs.every((v, i) => !r.verbs.slice(0, i).includes(v))),
    },
    namespacedExactlyUnderANamespace: {
      description: 'A resource is namespaced exactly when a route of its kind is served under a namespace',
      condition: ({ input: [routes, kinds], output }) =>
        output.every((r) =>
          kinds.every((k) => k.kind !== r.kind || r.namespaced === routes.some((t) => t.plural === k.plural && t.namespaced)),
        ),
    },
  },
});

/** `resourcesOf`'s type, which `src/discovery/discovery.ts` takes. */
export type ResourcesOf = Implementation<typeof resourcesOfSpec>;
