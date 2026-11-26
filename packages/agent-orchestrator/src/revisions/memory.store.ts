/**
 * The Ledger door's memory stand-in: a fresh layer of `LedgerDoor` per call, its ledgers held in a keyspace of its own in memory
 * (`memoryKeyspace`), built by `ledgerDoorOver` over `ledgerRecords` as the rooted door is, so the walks (`test/ledger-walks.ts`) hold one
 * code. A test gives it its program — `Effect.provide(program, ledgerDoorMemory())` — where it needs a ledger and nothing of the disk.
 * `MEMORY_ROOT` is the root its side is named under; no answer of the door names a path.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { memoryKeyspace } from '../keyspace/keyspace.store.ts';
import { LedgerDoor, ledgerDoorOver, ledgerRecords } from './revisions.store.ts';

/** The root the stand-in's side is named under, as the rooted door's are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** A fresh Ledger door over a keyspace in memory: no ledger written. */
export const ledgerDoorMemory = () => Layer.succeed(LedgerDoor)(ledgerDoorOver(ledgerRecords(memoryKeyspace())));
