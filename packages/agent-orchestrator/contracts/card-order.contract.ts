/**
 * A CardList's `?orderBy=` (agent-orchestrator, src/inbox/card-order.ts, `cardOrderBy`), as Google's API guidelines write `order_by`
 * (AIP-132): a field, ascending by default, ` desc` after it for descending, ` asc` allowed, redundant spaces insignificant. One field of
 * a closed list: `metadata.creationTimestamp`, when the card was filed, and `metadata.name`. A card list orders by one field, and ties
 * by name, so a list of several fields is no order of it (null), which the list refuses `Invalid`, naming the forms it takes. An empty
 * one is the list's to read before this is asked, as by name.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A field a card list is ordered by. */
export type CardOrderField = 'metadata.creationTimestamp' | 'metadata.name';

/** What `?orderBy=` asks: the field, and whether it runs from the highest down. */
export type CardOrder = { readonly field: CardOrderField; readonly descending: boolean };

/** The words of `text`, split at spaces, none empty. */
const wordsOf = (text: string) => text.split(' ').filter((word) => word !== '');

/** Whether `word` is a field a card list is ordered by. */
const isField = (word: string | undefined) => word === 'metadata.creationTimestamp' || word === 'metadata.name';

/** Whether `word` is a direction: none, `asc` or `desc`. */
const isDirection = (word: string | undefined) => word === undefined || word === 'asc' || word === 'desc';

const cardOrderBySpec = spec<(text: string) => CardOrder | null>({
  ensures: {
    eachOrderTaken: {
      description: 'A field of the closed list, alone or followed by asc or desc, spaces aside, is an order of the cards',
      condition: ({ input: [text], output }) => {
        const words = wordsOf(text);
        return !(words.length >= 1 && words.length <= 2 && isField(words.at(0)) && isDirection(words.at(1))) || output !== null;
      },
    },
    readAsWritten: {
      description: 'An order taken is the field written first, descending exactly when desc follows it, and nothing more',
      condition: ({ input: [text], output }) => {
        const words = wordsOf(text);
        return (
          output === null ||
          (words.length <= 2 && words.at(0) === output.field && isDirection(words.at(1)) && output.descending === (words.at(1) === 'desc'))
        );
      },
    },
  },
});

/** `cardOrderBy`'s type, which `src/inbox/card-order.ts` takes: the order `text` asks, or null where it asks none. */
export type CardOrderByOf = Implementation<typeof cardOrderBySpec>;
