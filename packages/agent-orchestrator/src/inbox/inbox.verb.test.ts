/**
 * The queue's tick ignores what it cannot tidy, and says so: a stale try that cannot be removed is left for a later pass, and the
 * failure is logged at the unhandled level before it is ignored (`dropStaleTries`, `startQueued`). And it starts no card that waits on a
 * card of its `after:` not landed, and takes it on the pass after that card lands.
 */
import { configGiven } from '../../test/config-given.ts';
import { STORE } from '../../test/ambient.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Cause, Effect, Layer, Logger } from 'effect';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest } from '../../test/placed.ts';
import { CardDoor, cardDoorOver, type CardLayer } from '../cards/cards.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { startQueued } from './inbox.verb.ts';
import type { MissedStart } from './index.ts';
import { CardName } from './inbox.model.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { aCard } from '../../test/card-walks.ts';
import { aRun } from '../../test/run-walks.ts';
import type { Run } from '../record/record.ts';

const stand = eachTest(testPlace);

const tried: MissedStart = { at: '2026-11-05T10:00:00.000Z', text: '# Gone\n', repo: '/repo', why: 'not offered', refused: true };

/** A Card door with no card, one try of a card no longer queued, and a disk that refuses to remove it. */
const stuckTries = () => {
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
    startQueued('/repo').pipe(
      Effect.provide(Layer.mergeAll(stand().layer, stuckTries(), runDoorMemory(), Logger.layer([keeper]), configGiven(STORE, process.env))),
    ),
  );
  assert.equal(started, undefined, 'no card queued, so none is started, and the failure stops nothing');
  assert.equal(logged.length, 1, 'the one failure ignored is the one line logged');
  assert.equal(logged[0]?.level, 'Error', 'the unhandled level, which defaults to Error');
  assert.match(JSON.stringify(logged[0]?.message), /gone/, 'the line names the card whose try was left');
  assert.match(logged[0]?.cause ?? '', /EACCES/, 'and the failure it ignored, as its cause');
});

test('a queued card that waits on a card whose run has not landed is not started; on the pass after that run lands, it is the card taken', async () => {
  const first: Run = { ...aRun('a-run-k2q9'), from: { inbox: 'a-1x2y' } };
  const pass = (landed: boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const door = yield* CardDoor;
        yield* door.cards.add(CardName.read('a-1x2y'), aCard('First', { workflow: 'dev' }));
        yield* door.cards.add(
          CardName.read('b-3z4w'),
          aCard('Second', { workflow: 'dev', queued: '2026-09-16T09:00:00.000Z', after: 'a-1x2y' }),
        );
        return yield* startQueued('/repo', [first], () => Effect.succeed(landed));
      }).pipe(Effect.provide(Layer.mergeAll(stand().layer, cardDoorMemory(), runDoorMemory(), configGiven(STORE, process.env)))),
    );
  assert.equal(await pass(false), undefined, 'the card waits: nothing is taken');
  assert.equal((await pass(true))?.card, 'b-3z4w', 'its card landed: the queue takes it');
});
