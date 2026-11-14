/**
 * What the api's discovery says it serves (objects, src/discovery.ts, `resourcesOf`): from the routes the `Api` serves, each read off
 * its path (`routeOf`, whose rows a test holds), and the kinds it serves with their plurals (`KINDS`, `RESOURCE_PLURALS`), one resource
 * per kind, named by its plural, and one per sub-resource of a kind, named `<plural>/<sub>`, as Kubernetes' discovery names `pods/log`.
 * A resource is namespaced exactly when a route of it is under `/api/namespaces/:namespace/`, and its verbs are exactly what its routes
 * do, in Kubernetes' words: a `GET` of the collection is `list`, and `watch` beside it, since every list is watched with `?watch=true`; a
 * `GET` of one is `get`, a `POST` to the collection `create`, a `PUT` of one `update`, a `PATCH` `patch` and a `DELETE` `delete`; a
 * sub-resource's verb is its method's alone. A route of a plural no kind is served by (`/api/builtin/mcpservers`) is said by none. The
 * order of the resources and of their verbs is the function's.
 *
 * Moved from the orchestrator (`packages/agent-orchestrator/contracts/discovery.contract.ts`, which goes with its `src/discovery/`): the
 * parser reads only the `Api`, so it is the objects', which import `effect` alone. The laws are the orchestrator's, unchanged.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { ResourceVerb } from '../src/words.ts';

/** A method a route of the `Api` answers, as discovery reads it. */
export type RouteMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

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

/**
 * The name of `plural`'s sub-resource `sub`, `<plural>/<sub>`. Joined with `+`, which the verifier reads as the strings joined, where it
 * reads a template string as an unknown string of its parts and could not tell two names apart.
 */
const subName = (plural: string, sub: string): string => plural + '/' + sub;

/** Whether no kind and no plural is given twice, and no plural holds a `/`. */
const distinctKinds = (kinds: readonly KindPlural[]): boolean =>
  kinds.every((k, i) => !k.plural.includes('/') && !kinds.slice(0, i).some((j) => j.kind === k.kind || j.plural === k.plural));

const resourcesOfSpec = spec<(routes: readonly ApiRoute[], kinds: readonly KindPlural[]) => Resource[]>({
  requires: ({ input: [, kinds] }) => distinctKinds(kinds),
  /**
   * Narrowed to what tsverify proves today: nothing listed that no kind's route serves, each resource's verbs said once, and its scope
   * its routes'. The rest of what the head of this file says — every kind listed once under its plural, every sub-resource once, and each
   * resource's verbs exactly what its routes do — runs out of the solver's work, and is held whole by `test/discovery.test.ts`, over the
   * real `Api`, until tsverify card `src-a-filter-s-result-is-pro-p25m` (a filter's result proved to keep every element that passes)
   * restores it here.
   */
  ensures: {
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

/** `resourcesOf`'s type, which `src/discovery.ts` takes. */
export type ResourcesOf = Implementation<typeof resourcesOfSpec>;
