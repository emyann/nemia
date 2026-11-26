/**
 * The Subscription door's memory stand-in: a fresh layer of `SubscriptionDoor` per call, its subscriptions and deliveries held in a
 * keyspace of its own in memory (`memoryKeyspace`), built by `subscriptionDoorOver` over `subscriptionRecords` as the rooted door is, so
 * the walks (`test/subscription-walks.ts`) hold one code. A test gives it its program — `Effect.provide(program,
 * subscriptionDoorMemory())` — where it needs a subscription to exist and nothing of the disk.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { memoryKeyspace } from '../keyspace/keyspace.store.ts';
import { SubscriptionDoor, subscriptionDoorOver, subscriptionRecords } from './subscription.store.ts';

/** Where the stand-in says a subscription is: the root its paths are named under, as the rooted door's are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** A fresh Subscription door over a keyspace in memory: no subscription put, no delivery written. */
export const subscriptionDoorMemory = () => Layer.succeed(SubscriptionDoor)(subscriptionDoorOver(subscriptionRecords(memoryKeyspace())));
