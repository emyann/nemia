/**
 * Each templated factory's `ConflictsPending` condition, as the factory controller last wrote it to the factory's status
 * (`reconcileFactory`), read through the Factory door for the tick's pass, which hands it to the feed (`emitFeed`, `conflictLines`). A
 * factory whose file does not read, that has no status yet, or whose status says no such condition is left out: nothing read, nothing
 * said. Read again on each call, carrying nothing between them.
 */
import { Effect } from 'effect';
import type { Refusal } from '../../refusal/refusal.ts';
import { FactoryDoor } from '../door/factories.store.ts';
import type { FeedConflicts } from '../../feed/index.ts';

/** Every templated factory's `ConflictsPending` condition: whether it is `True`, and its message. */
export const conflictsNow = (): Effect.Effect<FeedConflicts, Refusal> =>
  Effect.gen(function* () {
    const listed = yield* (yield* FactoryDoor).factories.listed();
    return listed.flatMap((l) => {
      if ('error' in l) return [];
      const c = l.status?.conditions.find((condition) => condition.type === 'ConflictsPending');
      return c === undefined ? [] : [{ factory: l.name, pending: c.status === 'True', message: c.message }];
    });
  });
