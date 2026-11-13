/**
 * Whether a card may be written whole from its text (the Card's edit, `PUT /api/namespaces/<factory>/cards/<name>/source`, which `nemia
 * inbox edit` sends): `cardEditRefusal`, pure, proved by `contracts/card-edit.contract.ts`. The write itself is `editCard`
 * (`card-edit.verb.ts`), which hands what is left to the Card's whole write (`replaceCard`).
 */
import type { CardEditRefusalOf } from '../../contracts/card-edit.contract.ts';

/**
 * Why a card's edit is refused, the first of started, its `factory:` naming another factory than the card's, and its `labels:` other than
 * the card's, or null where the rest is the Card's whole write to judge.
 */
export const cardEditRefusal: CardEditRefusalOf = (ask) => {
  if (ask.started) return 'started';
  if (ask.factoryRead !== undefined && ask.factoryRead !== ask.namespace) return 'factory';
  if (ask.labelsRead !== undefined && ask.labelsRead !== ask.labelsNow) return 'labels';
  return null;
};
