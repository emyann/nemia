/**
 * The Delegation door's memory stand-in: a fresh layer of `DelegationDoor` per call, its delegations held in a map, built by
 * `delegationDoorOver` as the files layer is. A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { DelegationDoor, delegationDoorOver, delegationNamed, type DelegationRecord } from './delegation.store.ts';

/** A fresh Delegation door over a map: no delegation written. */
export function delegationDoorMemory(): Layer.Layer<never> {
  const held = new Map<string, DelegationRecord>();
  const key = (factory: string, agent: string): string => {
    delegationNamed(factory, agent);
    return `${factory}/${agent}`;
  };
  return Layer.succeed(DelegationDoor)(
    delegationDoorOver({
      delegations: {
        list: (factory) => {
          delegationNamed(factory, 'any');
          return [...held.values()]
            .filter((d) => d.factory === factory)
            .sort((a, b) => (a.agent < b.agent ? -1 : a.agent > b.agent ? 1 : 0));
        },
        read: (factory, agent) => held.get(key(factory, agent)),
        write: (record) => {
          held.set(key(record.factory, record.agent), record);
          return record;
        },
        remove: (factory, agent) => held.delete(key(factory, agent)),
      },
    }),
  );
}
