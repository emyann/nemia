/**
 * Every file of `src` that still calls the module's spellings of the Subscription door — `listSubscriptions`, `putSubscription`,
 * `dropSubscription`, `readDelivery`, `writeDelivery`, `dropDelivery`, `listDeliveries` (`src/subscription/subscription.store.ts`), each
 * the door over the files at the module's root — rather than yielding the door (`SubscriptionDoor`), with how many calls do
 * (`src/subscription/subscription.store.test.ts`). A debt, and nothing else: a program yields the door, whose memory stand-in a test
 * gives it. S6 moved the deliverer, `nemia subscribe` and `nemia unsubscribe`, and Nemia's keeper onto the door, so none is left.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its calls of the module's spellings, comments left out. */
export const SUBSCRIPTION_DOOR_DEBT: Readonly<Record<string, number>> = {};
