/**
 * The Subscription door's memory stand-in, held to the door's walks (`test/subscription-walks.ts`), each on a stand-in of its own: what
 * the files say (`subscription.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, subscriptionDoorMemory } from './memory.store.ts';
import { SubscriptionDoor } from './subscription.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { SUBSCRIPTION_WALKS } from '../../test/subscription-walks.ts';

for (const [name, body] of walksOn(SUBSCRIPTION_WALKS, () => ({
  door: doorFrom(SubscriptionDoor, subscriptionDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
