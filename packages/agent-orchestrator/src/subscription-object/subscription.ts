/**
 * A subscription as an object (`Subscription`, from `objects`): what a person asked for, its `spec`, and where the deliverer is with
 * it, its `status`, read from the deliverer's file only where that file was written for this subscription (`subscriptionDelivered`,
 * proved by `contracts/subscription-status.contract.ts`), and that file read down to what the status says of it (`deliveryKept`). The
 * object itself is put together in `subscription.verb.ts`, beside its resourceVersion's digest.
 */
import type { SubscriptionDelivered } from '../../contracts/subscription-status.contract.ts';
import type { KeptDelivery } from '../subscription/index.ts';

/**
 * Where the deliverer is with a subscription, as its status says it.
 * @param sub The subscription, whose task and start the file must match.
 * @param kept The deliverer's file read down, or undefined where it has none: then the cursor is the subscription's start.
 */
export const subscriptionDelivered: SubscriptionDelivered = (sub, kept) => {
  if (kept === undefined || kept.of.task !== sub.task || kept.of.from !== sub.from) return { cursor: sub.from, pending: 0 };
  return {
    cursor: kept.cursor,
    pending: kept.pending,
    ...(kept.pending > 0 && kept.since !== undefined ? { since: kept.since } : {}),
  };
};

/**
 * The deliverer's file read down to what the status says of it: whose it is, its cursor, its digest's length, and its first fold's ms.
 * @param kept The deliverer's file as the store keeps it.
 */
export const deliveryKept = (kept: KeptDelivery) => ({
  of: { task: kept.of.task, from: kept.of.from },
  cursor: kept.cursor,
  pending: kept.digest.length,
  ...(kept.since !== undefined ? { since: kept.since.at } : {}),
});
