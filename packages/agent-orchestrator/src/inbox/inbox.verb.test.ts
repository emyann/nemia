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
import { CardDoor, cardDoorOver, type CardDoorShape } from '../cards/cards.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { releasedThrough, startQueued, waitingOf } from './inbox.verb.ts';
import { engineOf } from '../runtime-client.ts';
import { testEngine } from 'agent-runtime/testing';
import type { ParentRun } from '../wait/wait.ts';
import type { MissedStart } from './index.ts';
import { CardName } from './inbox.model.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { aCard } from '../../test/card-walks.ts';
import { aRun } from '../../test/run-walks.ts';
import type { Run } from '../record/record.ts';

const stand = eachTest(testPlace);
const engine = eachTest(testEngine);

const tried: MissedStart = { at: '2026-11-05T10:00:00.000Z', text: '# Gone\n', repo: '/repo', why: 'not offered', refused: true };

/** A Card door with no card, one try of a card no longer queued, and a disk that refuses to remove it. */
const stuckTries = () => {
  const layer: CardDoorShape = {
    cards: {
      entries: () => Effect.succeed([]),
      read: () => Effect.succeed(null),
      filedAt: () => Effect.succeed(null),
      revision: () => Effect.succeed(null),
      entryAt: () => Effect.succeed(null),
      entryText: () => Effect.succeed(null),
      add: () => Effect.succeed('/registry/cards/never'),
      rewrite: () => Effect.void,
      drop: () => Effect.succeed(false),
      where: (name) => Effect.succeed(`/registry/cards/${name}`),
    },
    tries: {
      list: () => Effect.succeed(new Map([['gone', tried]])),
      put: () => Effect.void,
      drop: () => Effect.die(new Error('EACCES: permission denied, unlink queue/gone.json')),
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
  const pass = (released: boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const door = yield* CardDoor;
        yield* door.cards.add(CardName.read('a-1x2y'), aCard('First', { workflow: 'dev' }));
        yield* door.cards.add(
          CardName.read('b-3z4w'),
          aCard('Second', { workflow: 'dev', queued: '2026-09-16T09:00:00.000Z', after: 'a-1x2y' }),
        );
        return yield* startQueued('/repo', [first], () => Effect.succeed(released));
      }).pipe(Effect.provide(Layer.mergeAll(stand().layer, cardDoorMemory(), runDoorMemory(), configGiven(STORE, process.env)))),
    );
  assert.equal(await pass(false), undefined, 'the card waits: nothing is taken');
  assert.equal((await pass(true))?.card, 'b-3z4w', 'its card landed: the queue takes it');
});

test("through the pass's landing read (`releasedThrough` over `Parents.read`), a queued card waits while its card's run has not released its waiters, and is taken once it has", async () => {
  const first: Run = { ...aRun('a-run-k2q9'), from: { inbox: 'a-1x2y' } };
  const pass = (released: boolean) =>
    Effect.runPromise(
      Effect.gen(function* () {
        const door = yield* CardDoor;
        yield* door.cards.add(CardName.read('a-1x2y'), aCard('First', { workflow: 'dev' }));
        yield* door.cards.add(
          CardName.read('b-3z4w'),
          aCard('Second', { workflow: 'dev', queued: '2026-09-16T09:00:00.000Z', after: 'a-1x2y' }),
        );
        const read = new Map<string, ParentRun>([
          ['a-run-k2q9', { standing: released ? { kind: 'released', by: 'succeeded' } : { kind: 'waiting', on: 'running' } }],
        ]);
        return yield* startQueued('/repo', [first], releasedThrough(engineOf(engine().layer), { read }));
      }).pipe(Effect.provide(Layer.mergeAll(stand().layer, cardDoorMemory(), runDoorMemory(), configGiven(STORE, process.env)))),
    );
  assert.equal(await pass(false), undefined, 'its run has not released its waiters: nothing is taken');
  assert.equal((await pass(true))?.card, 'b-3z4w', 'its run released its waiters: the queue takes it');
});

test('`waitingOf` follows a card to the card a node of its run filed (`sent`) and to the card it was sent on as (`<run>-resent`), reading the landing of each run once', () => {
  const at = '2026-11-01T10:00:00.000Z';
  const routed: Run = {
    ...aRun('a-run-k2q9'),
    from: { inbox: 'a-1x2y' },
    steps: { route: { taskId: 'a-run-k2q9-route', sent: { card: 'a2-3z4w', at } } },
  };
  const onward: Run = { ...aRun('a2-run-m5n6'), from: { inbox: 'a2-3z4w' } };
  const resent: Run = { ...aRun('x-run-p7q8'), from: { inbox: 'x-5v6u' } };
  const files = [
    { file: 'b-9r8s.md', text: '---\nworkflow: dev\nafter: a-1x2y, x-5v6u, gone-1a2b\n---\nSecond.\n' },
    { file: 'a-1x2y.md', text: '---\nworkflow: dev\n---\nFirst.\n' },
    { file: 'x-run-p7q8-resent.md', text: '---\nworkflow: dev\n---\nSent on.\n' },
  ];
  const asked: string[] = [];
  const landed = (id: string) => Effect.sync(() => (asked.push(id), id === 'a2-run-m5n6'));
  const waiting = Effect.runSync(waitingOf(files, [routed, onward, resent], landed));
  assert.ok(waiting, 'a card not started names cards in its after:, so they are read');
  assert.deepEqual(waiting.look('a-1x2y'), { known: true, runs: [{ id: 'a-run-k2q9', landed: false }], onward: ['a2-3z4w'] });
  assert.deepEqual(waiting.look('a2-3z4w'), { known: true, runs: [{ id: 'a2-run-m5n6', landed: true }], onward: [] });
  assert.deepEqual(waiting.look('x-5v6u'), { known: true, runs: [{ id: 'x-run-p7q8', landed: false }], onward: ['x-run-p7q8-resent'] });
  assert.deepEqual(waiting.look('x-run-p7q8-resent'), { known: true, runs: [], onward: [] }, 'in the inbox, with no run of its own yet');
  assert.equal(waiting.look('gone-1a2b').known, false, 'neither in the inbox nor started from');
  assert.deepEqual([...asked].sort(), ['a-run-k2q9', 'a2-run-m5n6', 'x-run-p7q8'], 'each run read once');
  assert.equal(Effect.runSync(waitingOf(files.slice(1), [routed], landed)), undefined, 'no card names one: nothing is read');
});
