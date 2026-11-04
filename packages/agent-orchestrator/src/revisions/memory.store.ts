/**
 * The Ledger door's memory stand-in: a fresh layer of `LedgerDoor` per call, each kind and name's entries held in a map, built by
 * `ledgerDoorOver` as the files layer is, so an append is checked the one way on both, and numbered by `revisionNow` as the files number
 * it. A test gives it its program — `Effect.provide(program, ledgerDoorMemory())` — where it needs a ledger and nothing of the disk; the
 * walks (`test/ledger-walks.ts`) hold it to what the files answer. `MEMORY_ROOT` is the root its side is named under, as the files'
 * are under the store's root; no answer of the door names a path.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { revisionNow, type Revision } from './revisions.ts';
import { LedgerDoor, ledgerDoorOver, type LedgerLayer, type RevisionOf } from './revisions.store.ts';

/** The root the stand-in's side is named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** A fresh Ledger door over a map: no ledger written. */
export function ledgerDoorMemory(): Layer.Layer<never> {
  const ledgers = new Map<string, Revision[]>();
  const keyOf = ({ kind, name }: RevisionOf) => `${kind}/${name}`;
  const of = (at: RevisionOf): Revision[] => (ledgers.get(keyOf(at)) ?? []).map((e) => ({ ...e }));
  const layer: LedgerLayer = {
    entries: {
      of,
      append: (at, hash, when) => {
        const entries = ledgers.get(keyOf(at)) ?? [];
        const now = revisionNow(entries, hash, when);
        if (!entries.includes(now)) ledgers.set(keyOf(at), [...entries, now]);
        return { ...now };
      },
    },
  };
  return Layer.succeed(LedgerDoor)(ledgerDoorOver(layer));
}
