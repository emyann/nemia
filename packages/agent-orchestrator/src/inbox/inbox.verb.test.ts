/**
 * The queue's tick ignores what it cannot tidy, and says so: a stale try that cannot be removed is left for a later pass, and the
 * failure is logged at the unhandled level before it is ignored (`dropStaleTries`, `startQueued`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cause, Effect, Layer, Logger } from 'effect';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { CardDoor, cardDoorOver, type CardLayer } from '../cards/cards.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { startQueued } from './inbox.verb.ts';
import type { MissedStart } from './index.ts';

const stand = eachTest(testPlace);

const tried: MissedStart = { at: '2026-11-05T10:00:00.000Z', text: '# Gone\n', repo: '/repo', why: 'not offered', refused: true };

/** A Card door with no card, one try of a card no longer queued, and a disk that refuses to remove it. */
const stuckTries = (): Layer.Layer<never> => {
  const layer: CardLayer = {
    cards: {
      entries: () => [],
      read: () => null,
      filedAt: () => null,
      entryAt: () => null,
      entryText: () => null,
      add: () => '/memory/inbox/never.md',
      rewrite: () => undefined,
      drop: () => false,
      where: (name) => `/memory/inbox/${name}.md`,
    },
    tries: {
      list: () => new Map([['gone', tried]]),
      put: () => undefined,
      drop: () => {
        throw new Error('EACCES: permission denied, unlink queue/gone.json');
      },
    },
  };
  return Layer.succeed(CardDoor)(cardDoorOver(layer));
};

test('a stale try that cannot be removed is ignored, and logged first', async () => {
  const logged: { level: string; message: unknown; cause: string }[] = [];
  const keeper = Logger.make(({ logLevel, message, cause }) => void logged.push({ level: logLevel, message, cause: Cause.pretty(cause) }));
  const started = await Effect.runPromise(
    startQueued('/repo').pipe(Effect.provide(Layer.mergeAll(stand().layer, stuckTries(), runDoorMemory(), Logger.layer([keeper])))),
  );
  assert.equal(started, undefined, 'no card queued, so none is started, and the failure stops nothing');
  assert.equal(logged.length, 1, 'the one failure ignored is the one line logged');
  assert.equal(logged[0]?.level, 'Error', 'the unhandled level, which defaults to Error');
  assert.match(JSON.stringify(logged[0]?.message), /gone/, 'the line names the card whose try was left');
  assert.match(logged[0]?.cause ?? '', /EACCES/, 'and the failure it ignored, as its cause');
});
