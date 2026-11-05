/**
 * Where the deliverer is with a subscription, as its `Subscription` object's status says it (agent-orchestrator,
 * src/subscription-object/subscription.ts; no code yet): the byte of the feed every line before which is delivered or folded (`cursor`), how many
 * routine lines are folded and not yet said (`pending`, the digest's length), and when the first of them was folded (`since`, ms).
 *
 * The deliverer's file speaks for the subscription only where it was written for it, the same task and the same `from` (`resumedAt`,
 * src/subscription/subscription.ts): a file left by another of the same name, or none, means the deliverer is where the subscription
 * starts, at its `from`, with nothing pending. A digest that holds nothing has no `since`.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** The subscription as a person asked for it: the task it tells, and the byte of the feed its news starts from. */
export type SubscriptionAsked = { readonly task: string; readonly from: number };

/**
 * The deliverer's file as read: the subscription it was written for (`of`), its cursor, the count of lines in its digest, and when the
 * first was folded (ms). Declared here until `src/subscription-object/subscription.ts` holds it.
 */
export type DeliveryKept = {
  readonly of: { readonly task: string; readonly from: number };
  readonly cursor: number;
  readonly pending: number;
  readonly since?: number;
};

/** What the status says of the deliverer. Declared here until `src/subscription-object/subscription.ts` holds it. */
export type DeliveredStatus = { readonly cursor: number; readonly pending: number; readonly since?: number };

/** A count: a whole number from 0, safe in a double. */
const count = (n: number): boolean => Number.isSafeInteger(n) && n >= 0;

/** Whether the deliverer's file was written for this subscription. */
const itsOwn = (sub: SubscriptionAsked, kept: DeliveryKept | undefined): kept is DeliveryKept =>
  kept !== undefined && kept.of.task === sub.task && kept.of.from === sub.from;

const subscriptionDeliveredSpec = spec<(sub: SubscriptionAsked, kept: DeliveryKept | undefined) => DeliveredStatus>({
  requires: ({ input: [sub, kept] }) =>
    count(sub.from) &&
    (kept === undefined ||
      (count(kept.cursor) && count(kept.pending) && count(kept.of.from) && (kept.since === undefined || Number.isFinite(kept.since)))),
  ensures: {
    whereItsOwnFileSays: {
      description: "Where the deliverer's file was written for this subscription, the status is where that file says",
      condition: ({ input: [sub, kept], output }) =>
        !itsOwn(sub, kept) || (output.cursor === kept.cursor && output.pending === kept.pending),
    },
    atItsStartOtherwise: {
      description: 'Where no file was written for this subscription, the deliverer is at its from, with nothing pending',
      condition: ({ input: [sub, kept], output }) =>
        itsOwn(sub, kept) || (output.cursor === sub.from && output.pending === 0 && output.since === undefined),
    },
    noSinceWithNothingPending: {
      description: 'A digest that holds nothing has no since',
      condition: ({ output }) => output.pending > 0 || output.since === undefined,
    },
    sinceKeptWhilePending: {
      description: "While lines are pending, since is when the deliverer's own file says the first was folded",
      condition: ({ input: [sub, kept], output }) => !itsOwn(sub, kept) || kept.pending === 0 || output.since === kept.since,
    },
  },
});

/** `subscriptionDelivered`'s type, which `src/subscription-object/subscription.ts` takes. */
export type SubscriptionDelivered = Implementation<typeof subscriptionDeliveredSpec>;
