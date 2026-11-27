/**
 * A CardList's `?orderBy=` (`cardOrderBy`, proved by contracts/card-order.contract.ts), as AIP-132 writes `order_by`: one field of a
 * closed list, ascending unless ` desc` follows. Pure.
 */
import type { CardOrderByOf } from '../../contracts/card-order.contract.ts';

/**
 * The order `text` asks: `metadata.creationTimestamp` or `metadata.name`, then ` asc` or ` desc` or nothing; null for anything else.
 * @param text The orderBy a list of cards is asked with, as given.
 */
export const cardOrderBy: CardOrderByOf = (text) => {
  const field = text.startsWith('metadata.creationTimestamp')
    ? ('metadata.creationTimestamp' as const)
    : text.startsWith('metadata.name')
      ? ('metadata.name' as const)
      : null;
  if (field === null) return null;
  const rest = text.slice(field.length);
  if (rest === '' || rest === ' asc') return { field, descending: false };
  return rest === ' desc' ? { field, descending: true } : null;
};
