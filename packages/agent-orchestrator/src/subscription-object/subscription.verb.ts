/**
 * The subscriptions as objects (`Subscription`, `SubscriptionList`, from `objects`), read through the Subscription door: each listed
 * subscription with where the deliverer is with it, its own file read (`subscriptionObjectOf`). A deliverer's file that does not read
 * says why in `status.error`, the subscription read at its start. A subscription's `creationTimestamp` is its file's birth where the
 * program is given the store's root, and the epoch where it is not (the memory door names no file). A subscription file left out of
 * the door's listing is no object: the deliverer says its words, and `nemia subscriptions` lists them.
 */
import path from 'node:path';
import { Effect, Option } from 'effect';
import { API_VERSION, type Subscription, type SubscriptionList } from 'objects';
import type { DeliveryKept } from '../../contracts/subscription-status.contract.ts';
import { StoreRoot } from '../config/root.store.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { bornAt, objectsListed, versionOf, type ObjectQuery } from '../object/listed.verb.ts';
import { noSubscription, subscriptionFileAt, SubscriptionDoor, type Listed } from '../subscription/subscription.store.ts';
import { deliveryKept, subscriptionDelivered } from './subscription.ts';

/**
 * The object of the subscription `listed`, of where the deliverer is with it (`delivered`, its file read down, or undefined where none
 * is), born at `born`, with the words of why the deliverer's file did not read where it did not (`error`).
 */
export const subscriptionObjectOf = (listed: Listed, delivered: DeliveryKept | undefined, born: string, error?: string): Subscription => {
  const { task, selectors, digestEvery, from, scope } = listed.subscription;
  const at = subscriptionDelivered({ task, from }, delivered);
  const spec = { task, selectors: [...selectors], digestEvery, ...(scope !== undefined ? { scope: { atLeast: scope.atLeast } } : {}) };
  const status = {
    from,
    cursor: at.cursor,
    pending: at.pending,
    ...(at.since !== undefined ? { since: new Date(at.since).toISOString() } : {}),
    ...(error !== undefined ? { error } : {}),
  };
  return {
    apiVersion: API_VERSION,
    kind: 'Subscription',
    metadata: { name: listed.name, creationTimestamp: born, resourceVersion: versionOf(spec, status) },
    spec,
    status,
  };
};

/** The object of `listed`, its delivery read through the door, born at its file under `root` where one is given. */
const objectOf = (listed: Listed, root: Option.Option<string>) =>
  Effect.gen(function* () {
    const door = yield* SubscriptionDoor;
    const read = yield* door.deliveries.read(SubscriptionName.read(listed.name));
    const born = Option.match(root, {
      onNone: () => new Date(0).toISOString(),
      onSome: (home) => bornAt(path.resolve(subscriptionFileAt(home, listed.name))),
    });
    if (read === null) return subscriptionObjectOf(listed, undefined, born);
    if ('unread' in read) return subscriptionObjectOf(listed, undefined, born, read.unread);
    return subscriptionObjectOf(listed, deliveryKept(read.kept), born);
  });

/** Every subscription's object, sorted by name. */
const subscriptionObjects = Effect.gen(function* () {
  const door = yield* SubscriptionDoor;
  const root = yield* Effect.serviceOption(StoreRoot);
  const { listed } = yield* door.subscriptions.list();
  return yield* Effect.forEach(listed, (one) => objectOf(one, root));
});

/** A page of the subscriptions, as `SubscriptionList`: those its selectors keep, sorted by name, cut by its limit after its continue. */
export const subscriptionList = Effect.fn('subscriptionList')(function* (query: ObjectQuery) {
  const items: Subscription[] = yield* subscriptionObjects;
  const list: SubscriptionList = yield* objectsListed('Subscription', items, query, 'subscription');
  return list;
});

/** The subscription `name`, as its object: `Missing` where no subscription is named so. */
export const subscriptionObject = Effect.fn('subscriptionObject')(function* (name: string) {
  const door = yield* SubscriptionDoor;
  const { listed } = yield* door.subscriptions.list();
  const one = listed.find((l) => l.name === name);
  if (one === undefined) return yield* noSubscription(name);
  const object: Subscription = yield* objectOf(one, yield* Effect.serviceOption(StoreRoot));
  return object;
});
