/**
 * A CardList's `?search=` (agent-orchestrator, src/inbox/card-search.ts, `cardMatches`): words a person typed, each matched in a card's
 * title and its name, whatever their case. A card matches when every word is found in one or the other; no word matches every card. The
 * list splits what was typed at spaces and puts the words and the card's name and title in lower case (`searchWords`, `searched`),
 * which the verifier reads no further than this: it proves the match of the words so given. Pure.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** What a card is searched in, in lower case: its name, and its title, null where it has none. */
export type Searched = { readonly name: string; readonly title: string | null };

/** Whether `word` is found in the card's name or its title. */
const foundIn = (card: Searched, word: string) => card.name.includes(word) || (card.title !== null && card.title.includes(word));

const cardMatchesSpec = spec<(words: readonly string[], card: Searched) => boolean>({
  ensures: {
    noWordMatchesAll: {
      description: 'A search of no word matches every card',
      condition: ({ input: [words], output }) => words.length > 0 || output,
    },
    everyWordFound: {
      description: 'A card matches exactly when every word typed is found in its name or its title',
      condition: ({ input: [words, card], output }) => output === words.every((word) => foundIn(card, word)),
    },
  },
});

/** `cardMatches`'s type, which `src/inbox/card-search.ts` takes: whether the card, read in lower case, holds every one of `words`. */
export type CardMatchesOf = Implementation<typeof cardMatchesSpec>;
