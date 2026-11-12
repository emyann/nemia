/**
 * Whether a card may be written whole (the Card's update, `PUT /api/namespaces/<factory>/cards/<name>`, which `nemia apply` sends):
 * `cardWriteRefusal`, pure, proved by `contracts/card-write.contract.ts`. The write itself is `replaceCard` (`card-write.verb.ts`).
 */
import type { CardWriteRefusalOf } from '../../contracts/card-write.contract.ts';

/**
 * Why a card's whole write is refused, the first of started, stale, `queued` changed, a retired `repo:` set
 * or changed, and no body, or null where it may be written: what
 * `replaceCard` asks before it writes anything.
 */
export const cardWriteRefusal: CardWriteRefusalOf = (ask) => {
  if (ask.started) return 'started';
  if (ask.versionSent !== undefined && ask.versionSent !== ask.versionNow) return 'stale';
  if (ask.queuedSent !== ask.queuedNow) return 'queued';
  if (ask.repoSent !== undefined && ask.repoSent !== ask.repoNow) return 'repo';
  if (ask.body === undefined || ask.body === '') return 'empty';
  return null;
};
