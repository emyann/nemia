/**
 * The revision a definition is served and judged at, numbered without a write (contracts/indexed-revision.contract.ts,
 * `indexedRevision`, proved law by law): the index's record where it still holds the files, otherwise the revision a sweep would give
 * the definition now, one past the head. Pure.
 */
import type { IndexedRevisionOf } from '../../contracts/indexed-revision.contract.ts';

/**
 * A definition's revision with no write.
 * @param held The index's live record of the definition, none where no sweep has numbered it.
 * @param wanted The text the files hold of it now, none where they hold none.
 * @param head The keyspace head read beside the record.
 */
export const indexedRevision: IndexedRevisionOf = (held, wanted, head) => {
  if (wanted === null) return null;
  return held !== null && held.value === wanted ? held.revision : head + 1;
};
