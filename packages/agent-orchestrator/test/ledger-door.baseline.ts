/**
 * Every file of `src` that still calls the ledger's synchronous spellings (`ledgerOf`, `appendRevision`) rather than yielding the Ledger
 * door (`LedgerDoor`, `src/revisions/revisions.store.ts`), with how many uses do (`src/revisions/revisions.store.test.ts`): a call, or the
 * function handed on as a value. A debt, and nothing else: `pin.verb.ts`'s pass reader (`passRevisions`, `lookedUp`) is synchronous, and
 * S6 did not convert it. A re-export (`src/runner.ts`) is the api's spelling, not a use.
 *
 * It only shrinks: a file converted takes its line away, a count cut is lowered here, and a file this does not name may hold none at all.
 */

/** Each file by its path from the package, and its uses of the ledger's synchronous spellings, comments and bindings left out. */
export const LEDGER_DOOR_DEBT: Readonly<Record<string, number>> = {
  'src/revisions/pin.verb.ts': 2,
};
