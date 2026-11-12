/**
 * The store's pause, entries of the command table: `nemia pause` and `nemia resume`, and the api's reads of the pause that stands and of
 * what a pause at once would stop.
 */
import { StoreRoot } from '../config/root.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import { readPause, resumePause } from './pause.store.ts';
import { nowRead, pauseNow, pauseParked } from './pause.verb.ts';
import { NOW_COST, nowLines, type Interrupt, type Pause, type Paused, type PausedNow } from './pause.ts';
import { Effect, Schema } from 'effect';
import { PAUSE_WORDS, pauseRefusal, PauseWrite, RESUME_WORDS } from 'objects';
import { pausedRead } from '../list/list.verb.ts';
import { sessionsDrained, tried } from '../runtime-client.ts';
import type { Command, Served } from '../command/entry.verb.ts';
import { saidOf } from '../command/command.ts';

/**
 * What `nemia pause --now` without `--yes` says, before anything acts: the pause that stands, if one does, and each task at work but a
 * landing.
 */
type PauseNowRead = { pause: Pause | null; interrupts: Interrupt[] };

/** What `nemia pause` answers: the pause put; with `now`, what it did (`PausedNow`). */
type PauseAnswer = { pause: Pause } | PausedNow;

/**
 * `nemia pause`'s handler, by its input: a plain pause, which parks every session at its call's end within `timeout` or the store's
 * timeout (`timeoutAt`), refused while one stands; `now`, which pauses at once. Its input refused first, as `Invalid`, whoever calls it.
 */
const pauseBy = Effect.fnUntraced(function* (input: PauseWrite, home: string) {
  const wrong = pauseRefusal(input);
  if (wrong !== null) return yield* Effect.fail(new Invalid({ message: wrong }));
  const said = { why: saidOf(input, 'why'), by: saidOf(input, 'by') };
  if (input.now !== true) return { pause: yield* pauseParked(said, input.timeout, home) } satisfies PauseAnswer;
  return (yield* pauseNow(said)) satisfies PauseAnswer;
});

/**
 * What `nemia pause --now` would cut, said and nothing written: the pause that stands and each task at work but a landing. The CLI's own
 * question before it acts (`--yes` acts); the board asks its own, reading `GET /api/pause/now`.
 */
export const pauseNowPreview = Effect.fnUntraced(function* () {
  const home = yield* StoreRoot;
  return { pause: readPause(home), interrupts: yield* nowRead() } satisfies PauseNowRead;
});

/** The lines `nemia pause --now` prints of what it would cut (`pauseNowPreview`). */
export const pauseNowPreviewLines = ({ pause, interrupts }: PauseNowRead): readonly string[] => nowLines(interrupts, pause !== null);

/**
 * `nemia pause`: the store paused, every session parked at its tool call's end within the timeout (`pauseParked`), on `POST /api/pause`
 * too; the pause as written, its timeout `--timeout` (`timeout` in the body) or the store's. Refused while a pause stands (`Conflict`).
 * `now` pauses at once (`pauseNow`). The verb takes no yes: `--yes` is the CLI's, whose runner says what `--now` would cut and acts on
 * `--yes` alone (`pauseNowPreview`).
 */
export const PAUSE: Served<PauseAnswer, PauseWrite> = {
  ...PAUSE_WORDS,
  input: PauseWrite,
  handler: (input) => Effect.flatMap(StoreRoot, (home) => pauseBy(input, home)),
};

/** What `nemia resume`'s handler takes: nothing. */
const ResumeInput = Schema.Struct({});
type ResumeInput = typeof ResumeInput.Type;

/**
 * `nemia resume`: the store's pause lifted (`resumePause`), then the sessions' drain, each session parked going on as the same try; on
 * `DELETE /api/pause` too; the pause lifted. Refused with none (`Missing`).
 */
export const RESUME: Served<{ pause: Pause }, ResumeInput> = {
  ...RESUME_WORDS,
  input: ResumeInput,
  handler: () =>
    Effect.flatMap(StoreRoot, (home) => tried(() => ({ pause: resumePause(home) }))).pipe(Effect.tap(() => sessionsDrained(null))),
};

/** The store's pause and the checks it holds, a landing with its merge staged among them (`pausedRead`), which the api alone serves. */
export const PAUSED: Command<Paused> = {
  name: 'paused',
  served: [{ endpoint: 'server.paused' }],
  usage: '',
  help: ["the store's pause, what finishes under it, and each check it holds, a landing with its merge staged among them"],
  spec: { positionals: [], flags: [], unknown: (arg) => `the pause takes no ${arg}.` },
  writes: false,
  class: 'read',
  only: {
    side: 'api',
    why: 'the board says the pause in its bottom bar; at the command line, nemia ls says it, what finishes and each check it holds',
  },
  handler: () => pausedRead(),
  print: () => [],
};

/** What a pause at once would stop (`nowRead`), and what it costs (`NOW_COST`): the board's confirm, which the api alone serves. */
export const PAUSE_NOW: Command<{ interrupts: Interrupt[]; cost: string }> = {
  name: 'pause now',
  served: [{ endpoint: 'server.pauseNow' }],
  usage: '',
  help: ['what a pause at once would stop, each task at work but a landing, and what that costs'],
  spec: { positionals: [], flags: [], unknown: (arg) => `what a pause at once would stop takes no ${arg}.` },
  writes: false,
  class: 'read',
  only: { side: 'api', why: 'the board confirms a pause at once with it; at the command line, nemia pause --now says it' },
  handler: Effect.fnUntraced(function* (_args, kept) {
    return { interrupts: yield* nowRead(kept?.records?.pause), cost: NOW_COST };
  }),
  print: () => [],
};
