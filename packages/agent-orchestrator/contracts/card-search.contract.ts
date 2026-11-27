/**
 * A CardList's `?search=` (agent-orchestrator, src/inbox/card-search.ts, `cardMatches`): words a person typed, each matched in a card's
 * title and its name, whatever their case. A card matches when every word is found in one or the other; no word matches every card.
 * Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a card is searched in: its name, and its title, null where it has none. */
export type Searched = { readonly name: string; readonly title: string | null };

/** The words of `search`, split at spaces, none empty, in lower case. */
const wordsOf = (search: string) =>
  search
    .toLowerCase()
    .split(' ')
    .filter((word) => word !== '');

/** Whether `word`, in lower case, is found in the card's name or its title, whatever their case. */
const foundIn = (card: Searched, word: string) =>
  card.name.toLowerCase().includes(word) || (card.title !== null && card.title.toLowerCase().includes(word));

const cardMatchesSpec = spec<(search: string, card: Searched) => boolean>({
  ensures: {
    noWordMatchesAll: {
      description: 'A search of no word matches every card',
      condition: ({ input: [search], output }) => wordsOf(search).length > 0 || output,
    },
    everyWordFound: {
      description: 'A card matches exactly when every word typed is found in its name or its title, whatever the case',
      condition: ({ input: [search, card], output }) => output === wordsOf(search).every((word) => foundIn(card, word)),
    },
  },
});

/** `cardMatches`'s type, which `src/inbox/card-search.ts` takes: whether the card matches the words of `search`. */
export type CardMatchesOf = Implementation<typeof cardMatchesSpec>;
