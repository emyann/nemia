/**
 * The face of the subscription's pure code: what a read of the feed comes to for a subscriber, the words it is told, the refusals of one
 * asked for (`subscription.ts`), and the conversion of a record that still holds the former `wake` key (`former-wake.ts`). A file outside
 * this folder imports it here (`test/layout.test.ts`); the files on disk are `subscription.store.ts`'s, and the deliverer and the commands
 * are `deliver.verb.ts`'s and `subscription.verb.ts`'s.
 */
export { BOOKMARK_EVERY, bookmarkLine, DEFAULT_SELECTORS, subscriptionNameRefusal, watchedLine } from './subscription.ts';
export type { KeptDelivery, Watched } from './subscription.ts';
export { FORMER_DEFAULT_WAKE, FORMER_NEMIA_WAKE, selectorsOfWake } from './former-wake.ts';
