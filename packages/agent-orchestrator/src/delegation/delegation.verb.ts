/**
 * The programs over a factory's delegations a caller asks of the api: list and read them as objects' `Delegation`; write one whole and
 * remove one, the person's alone (`Forbidden`, `person-only`, for an agent's session). A delegation is named by its agent, in its
 * factory's namespace; none is written by default, so an agent with none approves nothing.
 */
import { Effect } from 'effect';
import { API_VERSION, PROPOSABLE_KINDS, RESOURCE_PLURALS, type Delegation, type DelegationWrite } from 'objects';
import { Invalid, Missing, type Refusal } from '../refusal/refusal.ts';
import { Forbidden, type ProposalCaller } from '../caller/index.ts';
import { DelegationDoor, type DelegationRecord } from './delegation.store.ts';

/** A delegation's `resourceVersion`: a position, not a digest — when it was last written, which a write moves on. */
const writtenPosition = (record: DelegationRecord): string => record.since;

/** A delegation as the object served: its agent's name in its factory's namespace, its grants, and when it was written. */
export const delegationObject = (record: DelegationRecord): Delegation => ({
  apiVersion: API_VERSION,
  kind: 'Delegation',
  metadata: { name: record.agent, namespace: record.factory, creationTimestamp: record.since, resourceVersion: writtenPosition(record) },
  spec: record.spec,
});

/** The refusal of an agent's session writing a delegation. */
const personOnly = (factory: string, agent: string): Forbidden =>
  new Forbidden({
    reason: 'person-only',
    message: `the person writes what an agent may approve, never an agent: ask them to write ${agent}'s delegation in ${factory}.`,
  });

/** The delegations of `factory`, by agent. */
export const delegationsList = Effect.fn('delegationsList')(function* (factory: string) {
  return (yield* (yield* DelegationDoor).delegations.list(factory)).map(delegationObject);
});

/** `agent`'s delegation in `factory`; `Missing` where the person wrote none. */
export const delegationGet = Effect.fn('delegationGet')(function* (factory: string, agent: string) {
  const record = yield* (yield* DelegationDoor).delegations.read(factory, agent);
  if (record === undefined)
    return yield* Effect.fail(
      new Missing({
        message: `${agent} has no delegation in ${factory}, so it approves nothing: write one with a PUT of /api/namespaces/${factory}/delegations/${agent}.`,
      }),
    );
  return delegationObject(record);
});

/** `agent`'s delegation in `factory` written whole by `caller`, the person: the object written. */
/** The resources a delegation may grant: the plural of each kind a proposal carries (`workflows`, `agents`, …). */
export const DELEGABLE: readonly string[] = PROPOSABLE_KINDS.map((kind) => RESOURCE_PLURALS[kind]);

/**
 * The resources of `spec` no proposal changes, refused where the delegation is written. Kubernetes' PolicyRule reads `*` as every
 * resource; a delegation names each resource it grants, so `*` is refused here as a typo is, rather than kept and granting nothing.
 */
const undelegable = (spec: DelegationWrite): string[] =>
  [...new Set(spec.rules.flatMap((rule) => rule.resources))].filter((resource) => !DELEGABLE.includes(resource));

export const delegationPut = Effect.fn('delegationPut')(function* (
  caller: ProposalCaller,
  factory: string,
  agent: string,
  spec: DelegationWrite,
): Effect.fn.Return<Delegation, Refusal | Forbidden> {
  if (caller.kind !== 'person') return yield* Effect.fail(personOnly(factory, agent));
  const unknown = undelegable(spec);
  if (unknown.length > 0)
    return yield* Effect.fail(
      new Invalid({
        message: `a delegation grants only what a proposal changes, ${DELEGABLE.join(', ')}, each by name; ${unknown.join(', ')} is none of them: name the resources it grants, and write it again. Nothing was written.`,
      }),
    );
  const record = { factory, agent, since: new Date().toISOString(), spec };
  return delegationObject(yield* (yield* DelegationDoor).delegations.write(record));
});

/** `agent`'s delegation in `factory` removed by `caller`, the person: whether one was there. */
export const delegationRemove = Effect.fn('delegationRemove')(function* (
  caller: ProposalCaller,
  factory: string,
  agent: string,
): Effect.fn.Return<boolean, Refusal | Forbidden> {
  if (caller.kind !== 'person') return yield* Effect.fail(personOnly(factory, agent));
  return yield* (yield* DelegationDoor).delegations.remove(factory, agent);
});
