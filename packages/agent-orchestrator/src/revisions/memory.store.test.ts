/**
 * The Ledger door's memory stand-in, held to the door's walks (`test/ledger-walks.ts`), each on a stand-in of its own: what the files
 * say (`revisions.store.test.ts` runs the same walks on them), the stand-in says.
 */
import { test } from 'node:test';
import { MEMORY_ROOT, ledgerDoorMemory } from './memory.store.ts';
import { LedgerDoor } from './revisions.store.ts';
import { doorFrom, walksOn } from '../../test/door-walks.ts';
import { LEDGER_WALKS } from '../../test/ledger-walks.ts';

for (const [name, body] of walksOn(LEDGER_WALKS, () => ({
  door: doorFrom(LedgerDoor, ledgerDoorMemory()),
  root: MEMORY_ROOT,
  layer: 'memory',
})))
  test(name, body);
