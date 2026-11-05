/**
 * What the api says it serves (`GET /api`), Kubernetes' discovery for the one group version Nemia has: an `APIResourceList` of
 * `nemia/v1`, each resource a kind under its plural or a sub-resource of one (`runs/hold`), whether a namespace holds it, and its verbs.
 * One group version, so `/api` answers its resources directly rather than a list of group versions.
 */
import { Schema } from 'effect';
import { API_VERSION } from './meta.ts';
import { KINDS, RESOURCE_VERBS } from './words.ts';

/** One resource the api serves: its name (a plural, or `<plural>/<sub>`), its singular, its scope, its kind and its verbs. */
export const APIResource = Schema.Struct({
  name: Schema.String,
  singularName: Schema.String,
  namespaced: Schema.Boolean,
  kind: Schema.Literals(KINDS),
  verbs: Schema.Array(Schema.Literals(RESOURCE_VERBS)),
});
export type APIResource = typeof APIResource.Type;

/** Every resource the api serves of `nemia/v1`. */
export const APIResourceList = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('APIResourceList'),
  groupVersion: Schema.Literal(API_VERSION),
  resources: Schema.Array(APIResource),
});
export type APIResourceList = typeof APIResourceList.Type;
