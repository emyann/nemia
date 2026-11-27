/**
 * A CardList's `?search=` (`cardMatches`, proved by contracts/card-search.contract.ts): words each found in a card's title or name,
 * whatever their case. `searchWords` and `searched` put what was typed and the card in lower case, which the proof leaves to a test.
 * Pure.
 */
import type { CardMatchesOf } from '../../contracts/card-search.contract.ts';

/**
 * Whether the card, in lower case, holds every one of `words`.
 * @param words The words typed, in lower case.
 * @param card The card's name and its title, null where it has none, each in lower case.
 */
export const cardMatches: CardMatchesOf = (words, card) =>
  words.every((word) => card.name.includes(word) || (card.title !== null && card.title.includes(word)));

/**
 * The words of a search: what was typed, in lower case, split at spaces, none empty.
 * @param search The `?search=` a list of cards is asked with.
 */
export const searchWords = (search: string) =>
  search
    .toLowerCase()
    .split(' ')
    .filter((word) => word !== '');

/**
 * What a card is searched in: its name and its title, in lower case.
 * @param card The card's name and its title, null where it has none.
 */
export const searched = (card: { readonly name: string; readonly title: string | null }) => ({
  name: card.name.toLowerCase(),
  title: card.title === null ? null : card.title.toLowerCase(),
});
