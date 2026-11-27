/**
 * Where a card stands in the chains of `after:` (`chainOf`, proved by contracts/card-chain.contract.ts): the cards that wait on it, and
 * whether it is chained. Pure.
 */
import type { ChainOf } from '../../contracts/card-chain.contract.ts';

/**
 * The place of `card` among `cards`: those whose `after:` names it, and whether it is in play and tied by an `after:` to another card in
 * play.
 * @param card The card.
 * @param cards Every card of the inbox.
 */
export const chainOf: ChainOf = (card, cards) => {
  const followedBy = cards.filter((other) => other.name !== card.name && other.after.includes(card.name)).map((other) => other.name);
  const chained =
    card.inPlay &&
    cards.some((other) => other.name !== card.name && other.inPlay && (other.after.includes(card.name) || card.after.includes(other.name)));
  return { followedBy, chained };
};
