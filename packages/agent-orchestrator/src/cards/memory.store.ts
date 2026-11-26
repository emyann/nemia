/**
 * The Card door's memory stand-in: a fresh layer of `CardDoor` per call, its cards and the tick's tries held in a keyspace of its own in
 * memory (`memoryKeyspace`), built by `cardDoorOver` over `cardRecords` as the rooted door is, so the walks (`test/card-walks.ts`) hold
 * one code. A test gives it its program — `Effect.provide(program, cardDoorMemory())` — where it needs a card to exist and nothing of
 * the disk, and files the card through it (`aCard`, `test/card-walks.ts`). A card's filing time is the time it was added, kept across a
 * write back.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import { Layer } from 'effect';
import { memoryKeyspace } from '../keyspace/keyspace.store.ts';
import { CardDoor, cardDoorOver, cardRecords } from './cards.store.ts';

/** Where the stand-in says a card is: the root its side is named under, as the rooted door's are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** A fresh Card door over a keyspace in memory: no card filed, no try written. */
export const cardDoorMemory = () => Layer.succeed(CardDoor)(cardDoorOver(cardRecords(memoryKeyspace())));
