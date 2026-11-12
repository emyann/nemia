/**
 * A CardList's `?fieldSelector=` (`cardPlaySelector`, proved by contracts/card-play-selector.contract.ts): `status.inPlay`, then one of
 * Kubernetes' operators `=`, `==` or `!=`, then `true` or `false` — whether a card is still in play (`cardInPlay`). An empty selector is
 * every card, the list's to read before this is asked. Pure.
 */
import type { CardPlaySelectorOf } from '../../contracts/card-play-selector.contract.ts';

export type { CardPlaySelector } from '../../contracts/card-play-selector.contract.ts';

/** The field a card's list is selected by. */
const FIELD = 'status.inPlay';

/** `word` as a boolean, or null where it is neither. */
const valueOf = (word: string): boolean | null => (word === 'true' ? true : word === 'false' ? false : null);

/** The selector `text` spells: `status.inPlay`, then `==`, `!=` or `=`, then `true` or `false`; null for anything else. */
export const cardPlaySelector: CardPlaySelectorOf = (text) => {
  if (!text.startsWith(FIELD)) return null;
  const rest = text.slice(FIELD.length);
  const operator = rest.startsWith('==') ? '==' : rest.startsWith('!=') ? '!=' : rest.startsWith('=') ? '=' : null;
  if (operator === null) return null;
  const value = valueOf(rest.slice(operator.length));
  return value === null ? null : { inPlay: operator === '!=' ? !value : value };
};
