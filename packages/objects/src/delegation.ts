/**
 * The Delegation: what the person lets one agent approve in a factory, unasked, at `auto` — Kubernetes' Role and its RoleBinding in one
 * object, since a role is never shared between agents here. Named by its agent, in the factory's namespace; its rules are Kubernetes'
 * PolicyRule fields, the resources, the names among them (every name where empty) and the verbs. None by default: an agent with no
 * delegation approves nothing. Written by the person alone.
 *
 * Beside it, the body a write is sent (`DelegationWrite`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CHANGE_VERBS } from './words.ts';

/**
 * One grant: the resources (`workflows`, `agents`, …), the names among them (every name where empty), and the verbs. Where it departs from
 * Kubernetes' PolicyRule: no `*` for every resource, nor any resource a proposal does not change — each resource is named, and the
 * orchestrator refuses one it does not know when the delegation is written, so a grant never reads wider, or narrower, than it says.
 */
export const DelegationRule = Schema.Struct({
  resources: Schema.Array(Schema.String),
  resourceNames: Schema.Array(Schema.String),
  verbs: Schema.Array(Schema.Literals(CHANGE_VERBS)),
});
export type DelegationRule = typeof DelegationRule.Type;

/** What the agent named by the object may approve: its grants. */
export const DelegationSpec = Schema.Struct({ rules: Schema.Array(DelegationRule) });
export type DelegationSpec = typeof DelegationSpec.Type;

/** A delegation, as an object; its name is the agent's. */
export const Delegation = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Delegation'),
  metadata: ObjectMeta,
  spec: DelegationSpec,
});
export type Delegation = typeof Delegation.Type;

/** A page of a factory's delegations. */
export const DelegationList = listOf('Delegation', Delegation);
export type DelegationList = typeof DelegationList.Type;

/** A delegation written whole (`PUT …/delegations/<agent>`). */
export const DelegationWrite = DelegationSpec;
export type DelegationWrite = typeof DelegationWrite.Type;
