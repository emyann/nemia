/**
 * The Delegation door's contract (`DelegationDoor`, `src/delegation/delegation.store.ts`), as walks (`door-walks.ts`, awaited by
 * `walkedOn`): every method's rows, run on the keyspace and on the memory stand-in by `src/delegation/delegation.store.test.ts`. A
 * delegation written is read back whole, listed by agent in its factory alone, written again over itself, and removed, saying whether
 * one was there. And the door's refusals: a name that is no factory's or no agent's, and grants the model's `DelegationSpec` refuses
 * (`Invalid`), nothing written.
 */
import type { DelegationSpec } from 'objects';
import type { AsyncDoorWalk } from './door-walks.ts';
import { acted, settled } from './door-walks.ts';
import type { DelegationDoorShape, DelegationRecord } from '../src/delegation/delegation.store.ts';

type Walk = AsyncDoorWalk<DelegationDoorShape>;

const GRANTS: DelegationSpec = { rules: [{ resources: ['workflows'], resourceNames: [], verbs: ['update'] }] };

/** `agent`'s delegation in `factory`, granting `spec`. */
export const aDelegation = (agent: string, factory = 'acme', spec: DelegationSpec = GRANTS) =>
  ({
    factory,
    agent,
    since: '2026-11-01T00:00:00.000Z',
    spec,
  }) satisfies DelegationRecord;

export const DELEGATION_WALKS: Readonly<Record<string, readonly Walk[]>> = {
  'delegations.list': [
    { name: 'a factory with none lists none', walk: async ({ door }) => await settled(door.delegations.list('acme')), says: [] },
    {
      name: "a factory's own, by agent",
      walk: async ({ door }) => {
        await settled(door.delegations.write(aDelegation('implementer')));
        await settled(door.delegations.write(aDelegation('reviewer')));
        await settled(door.delegations.write(aDelegation('shipper', 'other')));
        return (await settled(door.delegations.list('acme'))).map((d) => d.agent);
      },
      says: ['implementer', 'reviewer'],
    },
    {
      name: 'REFUSED: a name that is no factory is Invalid',
      walk: async ({ door }) => await acted(door.delegations.list('No Factory')),
      says: { refused: 'Invalid' },
    },
  ],
  'delegations.read': [
    {
      name: 'none where none is written',
      walk: async ({ door }) => await settled(door.delegations.read('acme', 'implementer')),
      says: undefined,
    },
    {
      name: 'the delegation written, whole',
      walk: async ({ door }) => {
        await settled(door.delegations.write(aDelegation('implementer')));
        return await settled(door.delegations.read('acme', 'implementer'));
      },
      says: aDelegation('implementer'),
    },
    {
      name: 'REFUSED: a name that is no agent is Invalid',
      walk: async ({ door }) => await acted(door.delegations.read('acme', '../x')),
      says: { refused: 'Invalid' },
    },
  ],
  'delegations.write': [
    {
      name: 'written over what was there',
      walk: async ({ door }) => {
        await settled(door.delegations.write(aDelegation('implementer')));
        const wider: DelegationSpec = { rules: [{ resources: ['workflows', 'agents'], resourceNames: [], verbs: ['update', 'create'] }] };
        await settled(door.delegations.write(aDelegation('implementer', 'acme', wider)));
        return (await settled(door.delegations.read('acme', 'implementer')))?.spec.rules[0]?.resources;
      },
      says: ['workflows', 'agents'],
    },
    {
      name: 'REFUSED: grants the model refuses are Invalid, and nothing is written',
      walk: async ({ door }) => {
        const broken = { rules: [{ resources: ['workflows'], resourceNames: [], verbs: ['patch'] }] } as unknown as DelegationSpec;
        return [
          await acted(door.delegations.write(aDelegation('implementer', 'acme', broken))),
          await settled(door.delegations.read('acme', 'implementer')),
        ];
      },
      says: [{ refused: 'Invalid' }, undefined],
    },
  ],
  'delegations.remove': [
    { name: 'none there: false', walk: async ({ door }) => await settled(door.delegations.remove('acme', 'implementer')), says: false },
    {
      name: 'one there: true, and it is gone',
      walk: async ({ door }) => {
        await settled(door.delegations.write(aDelegation('implementer')));
        return [await settled(door.delegations.remove('acme', 'implementer')), await settled(door.delegations.read('acme', 'implementer'))];
      },
      says: [true, undefined],
    },
  ],
};
