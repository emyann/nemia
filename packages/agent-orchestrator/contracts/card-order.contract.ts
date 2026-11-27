/**
 * A CardList's `?orderBy=` (agent-orchestrator, src/inbox/card-order.ts, `cardOrderBy`), as Google's API guidelines write order_by
 * (AIP-132): a field, ascending by default, ` desc` after it for descending, ` asc` allowed. One field of a closed list:
 * `metadata.creationTimestamp`, when the card was filed, and `metadata.name`. A card list orders by one field, and ties by name, so a
 * list of several fields is no order of it (null), which the list refuses `Invalid`, naming the forms it takes. An empty one is the
 * list's to read before this is asked, as by name. A departure from AIP-132, stated: its redundant spaces are not insignificant here,
 * the verifier reading no string split, so the one space is the only one taken.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A field a card list is ordered by. */
export type CardOrderField = 'metadata.creationTimestamp' | 'metadata.name';

/** What `?orderBy=` asks: the field, and whether it runs from the highest down. */
export type CardOrder = { readonly field: CardOrderField; readonly descending: boolean };

/** Whether `text` is `field` followed by `suffix`. */
const spelled = (text: string, field: string, suffix: string) => text === field + suffix;

/** Whether `text` asks `field`, ascending (alone, or ` asc`) or descending (` desc`). */
const asksAsc = (text: string, field: string) => spelled(text, field, '') || spelled(text, field, ' asc');

const cardOrderBySpec = spec<(text: string) => CardOrder | null>({
  ensures: {
    eachOrderTaken: {
      description: 'A field of the closed list, alone or followed by one space and asc or desc, is an order of the cards',
      condition: ({ input: [text], output }) =>
        !(
          asksAsc(text, 'metadata.creationTimestamp') ||
          spelled(text, 'metadata.creationTimestamp', ' desc') ||
          asksAsc(text, 'metadata.name') ||
          spelled(text, 'metadata.name', ' desc')
        ) || output !== null,
    },
    readAsWritten: {
      description: 'An order taken is the field written first, descending exactly when desc follows it, and nothing more',
      condition: ({ input: [text], output }) =>
        output === null || (output.descending ? spelled(text, output.field, ' desc') : asksAsc(text, output.field)),
    },
  },
});

/** `cardOrderBy`'s type, which `src/inbox/card-order.ts` takes: the order `text` asks, or null where it asks none. */
export type CardOrderByOf = Implementation<typeof cardOrderBySpec>;
