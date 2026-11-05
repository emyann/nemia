/**
 * What the api's discovery says it serves (agent-orchestrator, src/object/discovery.ts, `resourcesOf`; no code yet): from the routes the
 * `Api` of `objects` serves, each read off its path (`routeOf`, whose rows a test holds), and the kinds it serves with their plurals
 * (`KINDS`, `RESOURCE_PLURALS`), one resource per kind, named by its plural, and one per sub-resource of a kind, named
 * `<plural>/<sub>`, as Kubernetes' discovery names `pods/log`. A resource is namespaced exactly when a route of it is under
 * `/api/namespaces/:namespace/`, and its verbs are exactly what its routes do, in Kubernetes' words: a `GET` of the collection is `list`,
 * and `watch` beside it, since every list is watched with `?watch=true`; a `GET` of one is `get`, a `POST` to the collection `create`,
 * a `PUT` of one `update`, a `PATCH` `patch` and a `DELETE` `delete`; a sub-resource's verb is its method's alone. A route of a plural no
 * kind is served by (`/api/builtin/mcpservers`) is said by none. The order of the resources and of their verbs is the door's.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A method a route of the `Api` answers, as discovery reads it. */
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A verb of a resource, in Kubernetes' words, as `objects` will name them (`RESOURCE_VERBS`). Declared here until it does. */
export type ResourceVerb = 'get' | 'list' | 'watch' | 'create' | 'update' | 'patch' | 'delete';

/**
 * A route as its path reads: the plural after `/api/` or `/api/namespaces/:namespace/`, whether it is under a namespace, whether a name
 * follows the plural (`item`), and the words after it with the names left out (`sub`, `steps/retry`), null where none follow. Declared
 * here until `src/object/discovery.ts` holds it.
 */
export type Route = {
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

/** Every verb, to say of each whether a resource has it. */
const VERBS: readonly ResourceVerb[] = ['get', 'list', 'watch', 'create', 'update', 'patch', 'delete'];

/** Whether `route`, a route of a kind itself (no `sub`), does `verb`. */
const kindDoes = (route: Route, verb: ResourceVerb): boolean =>
  route.sub === null &&
  (verb === 'list' || verb === 'watch'
    ? route.method === 'GET' && !route.item
    : verb === 'get'
      ? route.method === 'GET' && route.item
      : verb === 'create'
        ? route.method === 'POST' && !route.item
        : verb === 'update'
          ? route.method === 'PUT' && route.item
          : verb === 'patch'
            ? route.method === 'PATCH' && route.item
            : route.method === 'DELETE' && route.item);

/** Whether `route`, a route of a sub-resource, does `verb`: its method's verb alone. */
const subDoes = (route: Route, verb: ResourceVerb): boolean =>
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

/** Whether no kind and no plural is given twice, and no plural holds a `/`. */
const distinctKinds = (kinds: readonly KindPlural[]): boolean =>
  kinds.every(
    (k, i) => !k.plural.includes('/') && !kinds.slice(0, i).some((j) => j.kind === k.kind || j.plural === k.plural),
  );

/** The resources named `name` among `resources`. */
const named = (resources: readonly Resource[], name: string): Resource[] => resources.filter((r) => r.name === name);

const resourcesOfSpec = spec<(routes: readonly Route[], kinds: readonly KindPlural[]) => Resource[]>({
  requires: ({ input: [, kinds] }) => distinctKinds(kinds),
  ensures: {
    oneResourcePerKind: {
      description: 'Every kind served is listed once, under its plural',
      condition: ({ input: [, kinds], output }) =>
        kinds.every((k) => named(output, k.plural).length === 1 && named(output, k.plural).every((r) => r.kind === k.kind)),
    },
    onlyWhatIsServed: {
      description: "A resource listed is a kind's, or a sub-resource one of a kind's routes serves",
      condition: ({ input: [routes, kinds], output }) =>
        output.every((r) =>
          kinds.some(
            (k) =>
              r.kind === k.kind &&
              (r.name === k.plural || routes.some((t) => t.plural === k.plural && t.sub !== null && r.name === `${k.plural}/${t.sub}`)),
          ),
        ),
    },
    everySubResourceListed: {
      description: 'Each sub-resource a route of a kind serves is listed once, of that kind',
      condition: ({ input: [routes, kinds], output }) =>
        routes.every(
          (t) =>
            t.sub === null ||
            kinds.every(
              (k) =>
                k.plural !== t.plural ||
                (named(output, `${k.plural}/${t.sub}`).length === 1 &&
                  named(output, `${k.plural}/${t.sub}`).every((r) => r.kind === k.kind)),
            ),
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
                    (r.name === k.plural ? kindDoes(t, v) : t.sub !== null && r.name === `${k.plural}/${t.sub}` && subDoes(t, v)),
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

/** `resourcesOf`'s type, which `src/object/discovery.ts` takes. */
export type ResourcesOf = Implementation<typeof resourcesOfSpec>;
