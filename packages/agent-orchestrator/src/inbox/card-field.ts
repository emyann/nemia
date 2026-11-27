/**
 * A CardList's `?fieldSelector=` terms (`cardFieldTerm`, proved by contracts/card-field-selector.contract.ts): `status.inPlay` and
 * `status.chained`, each `true` or `false`, and `status.phase`, one of the seven phases, with one of Kubernetes' operators `=`, `==` or
 * `!=`. A selector is its terms joined by commas, all of which a card must keep (`fieldSelects`). Pure.
 */
import type { CardPhase } from 'objects';
import type { CardFieldTermOf } from '../../contracts/card-field-selector.contract.ts';

/** `word` as a boolean, or null where it is neither. */
const flagOf = (word: string) => (word === 'true' ? true : word === 'false' ? false : null);

/** `word` as a phase, or null where it is none. */
const phaseOf = (word: string) =>
  word === 'notStarted' ||
  word === 'blocked' ||
  word === 'waiting' ||
  word === 'working' ||
  word === 'done' ||
  word === 'failed' ||
  word === 'cancelled'
    ? word
    : null;

/** The operator an `operator` followed by the value begins `rest` with: `==`, `!=` or `=`; null for none. */
const operatorOf = (rest: string) => (rest.startsWith('==') ? '==' : rest.startsWith('!=') ? '!=' : rest.startsWith('=') ? '=' : null);

/**
 * The term `text` spells: a field, `==`, `!=` or `=`, then a value of that field; null for anything else.
 * @param text One term of a field selector, as given.
 */
export const cardFieldTerm: CardFieldTermOf = (text) => {
  if (text.startsWith('status.phase')) {
    const rest = text.slice('status.phase'.length);
    const operator = operatorOf(rest);
    const value = operator === null ? null : phaseOf(rest.slice(operator.length));
    return operator === null || value === null ? null : { field: 'status.phase', equals: operator !== '!=', value };
  }
  const field = text.startsWith('status.inPlay')
    ? ('status.inPlay' as const)
    : text.startsWith('status.chained')
      ? ('status.chained' as const)
      : null;
  if (field === null) return null;
  const rest = text.slice(field.length);
  const operator = operatorOf(rest);
  const value = operator === null ? null : flagOf(rest.slice(operator.length));
  return operator === null || value === null ? null : { field, equals: operator !== '!=', value };
};

/** One term of a field selector, as `cardFieldTerm` reads it. */
export type FieldTerm = NonNullable<ReturnType<CardFieldTermOf>>;

/** What a term reads of a card: whether it is in play, whether it is chained, and its phase. */
export type FieldRead = { readonly inPlay: boolean; readonly chained: boolean; readonly phase: CardPhase };

/**
 * Whether every one of `terms` keeps the card `card` describes.
 * @param terms The terms of a field selector, each from `cardFieldTerm`.
 * @param card What the terms read of the card.
 */
export const fieldSelects = (terms: readonly FieldTerm[], card: FieldRead) =>
  terms.every((term) => {
    const held =
      term.field === 'status.phase'
        ? card.phase === term.value
        : (term.field === 'status.inPlay' ? card.inPlay : card.chained) === term.value;
    return held === term.equals;
  });
