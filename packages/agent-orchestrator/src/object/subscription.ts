/**
 * A subscription as an object (`Subscription`, from `objects`): what a person asked for, its `spec`, and where the deliverer is with
 * it, its `status`, read from the deliverer's file only where that file was written for this subscription (`subscriptionDelivered`,
 * proved by `contracts/subscription-status.contract.ts`), and that file read down to what the status says of it (`deliveryKept`). The
 * object itself is put together in `subscription.verb.ts`, beside its resourceVersion's digest.
 */
import type { DeliveryKept, SubscriptionDelivered } from '../../contracts/subscription-status.contract.ts';
import type { KeptDelivery } from '../subscription/subscription.ts';

/** Where the deliverer is with a subscription, as its status says it. */
export const subscriptionDelivered: SubscriptionDelivered = (sub, kept) => {
  if (kept === undefined || kept.of.task !== sub.task || kept.of.from !== sub.from) return { cursor: sub.from, pending: 0 };
  return {
    cursor: kept.cursor,
    pending: kept.pending,
    ...(kept.pending > 0 && kept.since !== undefined ? { since: kept.since } : {}),
  };
};

/** The deliverer's file read down to what the status says of it: whose it is, its cursor, its digest's length, and its first fold's ms. */
export const deliveryKept = (kept: KeptDelivery): DeliveryKept => ({
  of: { task: kept.of.task, from: kept.of.from },
  cursor: kept.cursor,
  pending: kept.digest.length,
  ...(kept.since !== undefined ? { since: kept.since.at } : {}),
});
