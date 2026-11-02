/**
 * The Subscription door's memory stand-in: a fresh layer of `SubscriptionDoor` per call, its subscriptions and the deliverer's files held
 * in maps, built by `subscriptionDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its
 * program — `Effect.provide(program, subscriptionDoorMemory())` — where it needs a subscription to exist and nothing of the disk; the
 * walks (`test/subscription-walks.ts`) hold it to what the files answer. What it holds was checked as it was written, so nothing of it is
 * ever left out of the listing or unread.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import type { KeptDelivery, Subscription } from './subscription.ts';
import { noSubscription, SubscriptionDoor, subscriptionDoorOver, subscriptionTaken, type SubscriptionLayer } from './subscription.store.ts';

/** Where the stand-in says a subscription is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** The keys of `map`, sorted. */
const sorted = (map: Map<string, unknown>): string[] => [...map.keys()].sort();

/** A fresh Subscription door over maps: no subscription put, no delivery written. */
export function subscriptionDoorMemory(): Layer.Layer<never> {
  const subscriptions = new Map<string, Subscription>();
  const deliveries = new Map<string, KeptDelivery>();
  const layer: SubscriptionLayer = {
    subscriptions: {
      list: () => ({
        listed: sorted(subscriptions).flatMap((name) => {
          const subscription = subscriptions.get(name);
          return subscription === undefined ? [] : [{ name, subscription: structuredClone(subscription) }];
        }),
        left: [],
      }),
      put: (name, subscription) => {
        if (subscriptions.has(name)) throw subscriptionTaken(name);
        subscriptions.set(name, structuredClone(subscription));
      },
      drop: (name) => {
        if (!subscriptions.delete(name)) throw noSubscription(name);
      },
    },
    deliveries: {
      list: () => sorted(deliveries),
      read: (name) => {
        const kept = deliveries.get(name);
        return kept === undefined ? null : { kept: structuredClone(kept) };
      },
      write: (name, delivery) => void deliveries.set(name, structuredClone(delivery)),
      drop: (name) => void deliveries.delete(name),
    },
  };
  return Layer.succeed(SubscriptionDoor)(subscriptionDoorOver(layer));
}
