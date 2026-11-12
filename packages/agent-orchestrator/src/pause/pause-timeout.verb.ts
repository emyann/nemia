/**
 * `nemia pause-timeout [<d>]`: the store's pause timeout, how long a person's pause, a restart and an upgrade give each tool call in flight
 * before it is cut. Bare, the timeout in force, as `nemia level` says the level; given a duration, the timeout written (`putTimeout`).
 * Served on both sides, typed by its `input` (`TimeoutInput`): the api reads it as the server's `pauseTimeout` (`GET /api/pause/timeout`)
 * and writes it as `setPauseTimeout` (`PUT /api/pause/timeout`, `{ timeout }`), each calling this handler.
 */
import { PAUSE_TIMEOUT_WORDS, pauseTimeoutCheck } from 'objects';
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import { checked, tableEntry, type Served, type Command } from '../command/entry.verb.ts';
import { PAUSE, PAUSE_NOW, PAUSED, RESUME } from './commands.verb.ts';
import { timeoutAt, putTimeout, type TimeoutAt } from './pause-timeout.store.ts';

/** What `nemia pause-timeout` takes: the timeout to set (`10m`), or none for the one in force; the api's `PUT` body, and its `GET` none. */
export const TimeoutInput = Schema.Struct({ timeout: Schema.optionalKey(Schema.String) });
export type TimeoutInput = typeof TimeoutInput.Type;

/** What `nemia pause-timeout` answers: the timeout in force, and whether this call wrote it. */
export type TimeoutAnswer = { timeout: TimeoutAt; wrote: boolean };

/**
 * `nemia pause-timeout`: the store's pause timeout, read bare and written given a duration. Refused: a timeout out of its form, a file that
 * does not read.
 */
export const TIMEOUT: Served<TimeoutAnswer, TimeoutInput> = {
  ...PAUSE_TIMEOUT_WORDS,
  input: TimeoutInput,
  handler: ({ timeout: text }) =>
    Effect.gen(function* () {
      yield* checked(pauseTimeoutCheck({ timeout: text }));
      const home = yield* StoreRoot;
      return yield* tried(() =>
        text === undefined
          ? ({ timeout: timeoutAt(home), wrote: false } satisfies TimeoutAnswer)
          : ({ timeout: putTimeout(home, text), wrote: true } satisfies TimeoutAnswer),
      );
    }).pipe(Effect.withSpan('pause-timeout')),
};

/** The pause's commands, in the table's order: the pause, its timeout, the resume, and the api's two reads of it. */
export const PAUSE_ENTRIES: readonly (Command | Served)[] = [tableEntry(PAUSE), tableEntry(TIMEOUT), tableEntry(RESUME), PAUSED, PAUSE_NOW];
