/**
 * The subscriptions as objects (`subscriptionList`, `subscriptionObject`, subscription.verb.ts), over the Subscription door's memory
 * stand-in: each listed with its status from its own delivery (cursor, pending, since); a delivery written for another task or another
 * `from` read as the subscription's start; a get by name, and a `Missing`; a bad selector or limit `Invalid`. And over the files, a
 * deliverer's file that does not read says why in `status.error`, the subscription read at its start. Kinds are asserted, never sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Effect, Exit, Schema } from 'effect';
import { Subscription, SubscriptionList } from 'objects';
import { SubscriptionDoor, deliveryFileAt, subscriptionDoorFiles } from '../subscription/subscription.store.ts';
import { subscriptionDoorMemory } from '../subscription/memory.store.ts';
import { SubscriptionName } from '../feed/feed.model.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Invalid, Missing } from '../refusal/refusal.ts';
import { scratch } from 'test-kit/scratch';
import { aDelivery, aSubscription } from '../../test/subscription-walks.ts';
import type { KeptDelivery, Subscription as Asked } from '../subscription/subscription.ts';
import { subscriptionList, subscriptionObject } from './subscription.verb.ts';

/** The store each test plants: subscriptions by name, and deliveries by name. */
type Planted = { subscriptions: Record<string, Asked>; deliveries?: Record<string, KeptDelivery> };

/** `program` after `planted` is put through the door. */
const planting = <A, E, R>(planted: Planted, program: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const door = yield* SubscriptionDoor;
    for (const [name, sub] of Object.entries(planted.subscriptions)) yield* door.subscriptions.put(SubscriptionName.read(name), sub);
    for (const [name, kept] of Object.entries(planted.deliveries ?? {})) yield* door.deliveries.write(SubscriptionName.read(name), kept);
    return yield* program;
  });

/** `program` run on a fresh memory door after `planted`. */
const over = <A, E>(planted: Planted, program: Effect.Effect<A, E>) =>
  Effect.runSyncExit(planting(planted, program).pipe(Effect.provide(subscriptionDoorMemory())));

/** The success of `exit`, or a failure of the test naming what it failed with. */
const ok = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw new Error(`expected a success, got ${String(exit.cause)}`);
};

/** The error `exit` failed with. */
const failed = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  assert.ok(Exit.isFailure(exit));
  const found = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return found && 'error' in found ? found.error : undefined;
};

test('each subscription is listed with its status from its own delivery', () => {
  const list = ok(
    over(
      {
        subscriptions: { zeta: aSubscription('nemia-1'), alpha: aSubscription('nemia-2', { scope: { atLeast: 'semi-auto' } }) },
        deliveries: { zeta: aDelivery(300, 'nemia-1') },
      },
      subscriptionList({}),
    ),
  );
  Schema.decodeUnknownSync(SubscriptionList)(list);
  assert.deepEqual(
    list.items.map((s) => s.metadata.name),
    ['alpha', 'zeta'],
  );
  const zeta = list.items[1];
  assert.equal(zeta?.metadata.namespace, undefined);
  assert.deepEqual(zeta?.spec, { task: 'nemia-1', selectors: ['reason=Blocked'], digestEvery: 60 });
  assert.deepEqual(zeta?.status, { from: 120, cursor: 300, pending: 2, since: new Date(1_000).toISOString() });
  assert.deepEqual(list.items[0]?.spec.scope, { atLeast: 'semi-auto' });
  assert.deepEqual(list.items[0]?.status, { from: 120, cursor: 120, pending: 0 });
});

test('a delivery written for another task or another from reads as the subscription at its start', async (t) => {
  for (const [name, kept] of [
    ['another task', aDelivery(300, 'nemia-9')],
    ['another from', { ...aDelivery(300, 'nemia-1'), of: { task: 'nemia-1', from: 7 } }],
  ] as const)
    await t.test(name, () => {
      const one = ok(over({ subscriptions: { mill: aSubscription('nemia-1') }, deliveries: { mill: kept } }, subscriptionObject('mill')));
      assert.deepEqual(one.status, { from: 120, cursor: 120, pending: 0 });
    });
});

test('a get answers the subscription by its name, its version changing with its status', () => {
  const planted = { subscriptions: { mill: aSubscription('nemia-1') } };
  const one = ok(over(planted, subscriptionObject('mill')));
  Schema.decodeUnknownSync(Subscription)(one);
  assert.equal(one.kind, 'Subscription');
  assert.equal(one.metadata.name, 'mill');
  const moved = ok(over({ ...planted, deliveries: { mill: aDelivery(300, 'nemia-1') } }, subscriptionObject('mill')));
  assert.notEqual(moved.metadata.resourceVersion, one.metadata.resourceVersion);
});

test('a name no subscription has is Missing', () => {
  assert.ok(failed(over({ subscriptions: { mill: aSubscription() } }, subscriptionObject('drafter'))) instanceof Missing);
});

test('a bad labelSelector or limit is Invalid', () => {
  const planted = { subscriptions: { mill: aSubscription() } };
  assert.ok(failed(over(planted, subscriptionList({ labelSelector: ['=='] }))) instanceof Invalid);
  assert.ok(failed(over(planted, subscriptionList({ limit: -1 }))) instanceof Invalid);
});

test('on the files, a delivery that does not read says why in status.error, and the file is born when it was put', () => {
  const root = scratch('subscription-object-');
  const program = Effect.gen(function* () {
    yield* planting({ subscriptions: { mill: aSubscription('nemia-1') } }, Effect.void);
    fs.writeFileSync(deliveryFileAt(root, 'mill'), 'not json\n');
    return yield* subscriptionObject('mill');
  });
  const one = ok(Effect.runSyncExit(program.pipe(Effect.provide(subscriptionDoorFiles(root)), Effect.provideService(StoreRoot, root))));
  Schema.decodeUnknownSync(Subscription)(one);
  assert.equal(one.status.cursor, 120);
  assert.equal(one.status.pending, 0);
  assert.equal(one.status.since, undefined);
  assert.equal(typeof one.status.error, 'string');
  assert.notEqual(one.metadata.creationTimestamp, new Date(0).toISOString());
});
