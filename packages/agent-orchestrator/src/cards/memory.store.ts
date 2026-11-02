/**
 * The Card door's memory stand-in: a fresh layer of `CardDoor` per call, its cards and the tick's tries held in maps, built by
 * `cardDoorOver` as the files layer is, so the writes are checked the one way on both. A test gives it its program —
 * `Effect.provide(program, cardDoorMemory())` — where it needs a card to exist and nothing of the disk, and files the card through it
 * (`aCard`, `test/card-walks.ts`); the walks hold it to what the files answer. Its paths are under `MEMORY_ROOT`, named as the files
 * name them under the store's root. A card's filing time is the time it was added, kept across a write back.
 *
 * A test's alone: no file of `src` imports it (`test/boundary.test.ts`, `STAND_INS`).
 */
import path from 'node:path';
import { Layer } from 'effect';
import type { MissedStart } from '../inbox/index.ts';
import { CardDoor, cardDoorOver, cardTaken, noCardToRewrite, type CardLayer } from './cards.store.ts';

/** Where the stand-in says a card is: the root its paths are named under, as the files' are under the store's root. */
export const MEMORY_ROOT = '/memory';

/** A fresh Card door over maps: no card filed, no try written. */
export function cardDoorMemory(): Layer.Layer<never> {
  const cards = new Map<string, { text: string; filedAt: string }>();
  const tries = new Map<string, MissedStart>();
  const where = (name: string) => path.posix.join(MEMORY_ROOT, 'inbox', `${name}.md`);
  const layer: CardLayer = {
    cards: {
      entries: () =>
        [...cards.entries()]
          .map(([name, card]) => ({ file: `${name}.md`, text: card.text }))
          .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)),
      read: (name) => cards.get(name)?.text ?? null,
      filedAt: (name) => cards.get(name)?.filedAt ?? null,
      add: (name, text) => {
        if (cards.has(name)) throw cardTaken(name, where(name));
        cards.set(name, { text, filedAt: new Date().toISOString() });
        return where(name);
      },
      rewrite: (name, text) => {
        const card = cards.get(name);
        if (card === undefined) throw noCardToRewrite(name);
        cards.set(name, { ...card, text });
      },
      drop: (name) => cards.delete(name),
      where,
    },
    tries: {
      list: () => new Map([...tries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([n, t]) => [n, structuredClone(t)])),
      put: (name, tried) => void tries.set(name, structuredClone(tried)),
      drop: (name) => void tries.delete(name),
    },
  };
  return Layer.succeed(CardDoor)(cardDoorOver(layer));
}
