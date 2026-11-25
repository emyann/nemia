/**
 * The Delegation door's memory stand-in: a fresh layer of `DelegationDoor` per call, its delegations held in a keyspace of its own in
 * memory (`memoryKeyspace`), built by `delegationDoorOver` over `delegationRecords` as the rooted door is, so the walks hold one code. A
 * test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { memoryKeyspace } from '../keyspace/keyspace.store.ts';
import { DelegationDoor, delegationDoorOver, delegationRecords } from './delegation.store.ts';

/** A fresh Delegation door over a keyspace in memory: no delegation written. */
export const delegationDoorMemory = () => Layer.succeed(DelegationDoor)(delegationDoorOver(delegationRecords(memoryKeyspace())));
