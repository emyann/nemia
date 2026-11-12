/**
 * `nemia pause-timeout [<d>]`: the store's pause timeout, how long a person's pause, a restart and an upgrade give each tool call in flight
 * before it is cut. Bare, the timeout in force, as `nemia level` says the level; given a duration, the timeout written (`putTimeout`).
 * Served on both sides, typed by its `input` (`TimeoutInput`): the api reads it as the server's `pauseTimeout` (`GET /api/pause/timeout`)
 * and writes it as `setPauseTimeout` (`PUT /api/pause/timeout`, `{ timeout }`), each calling this handler.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Effect, Schema } from 'effect';
import { tried } from '../runtime-client.ts';
import type { Args } from '../command/command.ts';
import { checked, type Command } from '../command/entry.verb.ts';
import { PAUSE, PAUSE_NOW, PAUSED, RESUME } from './commands.verb.ts';
import { timeoutAt, putTimeout, type TimeoutAt } from './pause-timeout.store.ts';
import { timeoutRefusal, timeoutWords } from './pause.ts';

/** The timeout given, or undefined for a bare `nemia pause-timeout`. */
const textOf = (args: Args): string | undefined => (typeof args.timeout === 'string' ? args.timeout : undefined);

/** What `nemia pause-timeout` takes: the timeout to set (`10m`), or none for the one in force; the api's `PUT` body, and its `GET` none. */
export const TimeoutInput = Schema.Struct({ timeout: Schema.optionalKey(Schema.String) });
export type TimeoutInput = typeof TimeoutInput.Type;

/** `nemia pause-timeout`'s form, as each of its refusals ends on it. */
const TIMEOUT_SHAPE = 'nemia pause-timeout [<d>]';

/** Why the timeout `text` is refused, ending on the form the command takes; null where it is none, or one in its form. */
const timeoutCheck = (text: string | undefined): string | null => {
  const wrong = text === undefined ? undefined : timeoutRefusal(text);
  return wrong === undefined ? null : `${wrong}: ${TIMEOUT_SHAPE}, as nemia pause-timeout 10m.`;
};

/** What `nemia pause-timeout` answers: the timeout in force, and whether this call wrote it. */
export type TimeoutAnswer = { timeout: TimeoutAt; wrote: boolean };

/** The timeout in force, in one line: the default, or the one set and when. */
const timeoutLine = ({ ms, set, at }: TimeoutAt): string =>
  `the store's pause timeout is ${timeoutWords(ms)}${set ? (at ? `, set ${at}` : '') : ' (the default)'}`;

/**
 * `nemia pause-timeout`: the store's pause timeout, read bare and written given a duration. Refused: a timeout out of its form, a file that
 * does not read.
 */
export const TIMEOUT: Command<TimeoutAnswer, TimeoutInput> = {
  name: 'pause-timeout',
  served: [{ endpoint: 'server.pauseTimeout' }, { endpoint: 'server.setPauseTimeout', as: 'pause_timeout_set' }],
  usage: '[<d>]',
  help: [
    "the store's pause timeout: how long nemia pause, nemia service restart and",
    'nemia upgrade give each tool call in flight to end before it is cut; bare,',
    'the timeout in force (10m by default); given one, sets it: digits and s, m',
    'or h, from 1s to 23h, as 90s, 10m or 2h. nemia pause --timeout <d> gives one',
    'pause a timeout of its own',
  ],
  spec: {
    positionals: [{ key: 'timeout', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia pause-timeout takes one timeout, not ${arg}: ${TIMEOUT_SHAPE}, as nemia pause-timeout 10m.`,
  },
  check: (args) => timeoutCheck(textOf(args)),
  writes: true,
  class: 'ask',
  input: TimeoutInput,
  handler: ({ timeout: text }) =>
    Effect.gen(function* () {
      yield* checked(timeoutCheck(text));
      const home = yield* StoreRoot;
      return yield* tried(() =>
        text === undefined
          ? ({ timeout: timeoutAt(home), wrote: false } satisfies TimeoutAnswer)
          : ({ timeout: putTimeout(home, text), wrote: true } satisfies TimeoutAnswer),
      );
    }).pipe(Effect.withSpan('pause-timeout')),
  print: ({ timeout, wrote }) =>
    wrote
      ? [
          `the store's pause timeout is now ${timeoutWords(timeout.ms)}: each pause, restart and upgrade gives a call in flight ${timeoutWords(timeout.ms)} before it is cut`,
        ]
      : [timeoutLine(timeout)],
};

/** The pause's commands, in the table's order: the pause, its timeout, the resume, and the api's two reads of it. */
export const PAUSE_ENTRIES: readonly Command[] = [PAUSE, TIMEOUT, RESUME, PAUSED, PAUSE_NOW];
