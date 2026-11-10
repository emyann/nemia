/**
 * The store's pause, entries of the command table: `nemia pause` and `nemia resume`, and the api's reads of the pause that stands and of
 * what a pause at once would stop.
 */
import { Invalid } from '../refusal/refusal.ts';
import { BY_CAP, WHY_CAP } from '../record/record.ts';
import { readPause, resumePause } from './pause.store.ts';
import { nowRead, pauseNow, pauseParked } from './pause.verb.ts';
import {
  NOW_COST,
  pauseTimeoutRefusal,
  timeoutFlag,
  nowLines,
  pausedNowLines,
  pauseWords,
  RESUMED,
  type Interrupt,
  type Pause,
  type Paused,
  type PausedNow,
} from './pause.ts';
import { Effect, Schema } from 'effect';
import { PauseWrite } from 'objects';
import { pausedRead } from '../list/list.verb.ts';
import { sessionsDrained, tried } from '../runtime-client.ts';
import type { Command } from '../command/entry.verb.ts';
import { saidFlags, saidOf, saidRefusal, takesFor, takesOf, type Args, type Said } from '../command/command.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `nemia pause`'s form, as each of its refusals ends on it. */
const PAUSE_SHAPE = 'nemia pause [--why "<words>"] [--by <name>] [--timeout <d> | --now [--yes]]';

/** `nemia pause`'s `--why` and `--by`. */
const PAUSE_SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the store is paused', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who pauses it, by a name', cap: BY_CAP },
];

/** `nemia pause`'s `--why` and `--by`, each with its refusal of a value left out. */
const PAUSE_TAKES = takesOf(PAUSE_SAID, PAUSE_SHAPE);

/**
 * What `nemia pause --now` without `--yes` says, before anything acts: the pause that stands, if one does, and each task at work but a
 * landing.
 */
type PauseNowRead = { pause: Pause | null; interrupts: Interrupt[] };

/** What `nemia pause` answers: the pause put; with `now`, what it did (`PausedNow`). */
type PauseAnswer = { pause: Pause } | PausedNow;

/** Why `nemia pause`'s arguments are refused before anything is read, or null: `--why` and `--by` (`saidRefusal`), then `--timeout`. */
const pauseRefusal = (args: Args): string | null =>
  PAUSE_SAID.map((s) => saidRefusal(args, s, PAUSE_TAKES)).find((r) => r !== null) ??
  pauseTimeoutRefusal(textOf(args, 'timeout'), args.now === true, PAUSE_SHAPE);

/**
 * `nemia pause`'s handler, by its input: a plain pause, which parks every session at its call's end within `timeout` or the store's
 * timeout (`timeoutAt`), refused while one stands; `now`, which pauses at once. Its input refused first, as `Invalid`, whoever calls it.
 */
const pauseBy = Effect.fnUntraced(function* (input: PauseWrite, home?: string) {
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
  return { pause: readPause(), interrupts: yield* nowRead() } satisfies PauseNowRead;
});

/** The lines `nemia pause --now` prints of what it would cut (`pauseNowPreview`). */
export const pauseNowPreviewLines = ({ pause, interrupts }: PauseNowRead): readonly string[] => nowLines(interrupts, pause !== null);

/**
 * `nemia pause`: the store paused, every session parked at its tool call's end within the timeout (`pauseParked`), on `POST /api/pause`
 * too; the pause as written, its timeout `--timeout` (`timeout` in the body) or the store's. Refused while a pause stands (`Conflict`).
 * `now` pauses at once (`pauseNow`). The verb takes no yes: `--yes` is the CLI's, whose runner says what `--now` would cut and acts on
 * `--yes` alone (`pauseNowPreview`).
 */
export const PAUSE: Command<PauseAnswer, PauseWrite> = {
  name: 'pause',
  usage: '[--why "<words>"] [--by <name>] [--timeout <d> | --now [--yes]]',
  help: [
    'pause the store: no pass starts new work — no step, try, round or',
    'check filed, no queued task admitted, no queued card started — and',
    "every session, job or attached, parks at its tool call's end: a call",
    'still in flight once the timeout has passed is cut. A check runs on, its',
    'end recorded; a landing whose check has ended commits or aborts.',
    'Pausing: N sessions finishing a tool call, cut in M min while they',
    'do, Paused once none does; nemia ls says each step paused.',
    'nemia start still writes a run, and approvals, retries and answers are',
    'kept, not acted on: the pass after nemia resume files what waits. nemia ls,',
    'nemia watch --once, nemia start and nemia up say it, and nemia ls names what finishes.',
    'Refused while a pause stands.',
    '--why: the reason, said wherever the pause is; --by: who pauses it',
    '(default: your OS user)',
    '--timeout: how long a call in flight is given to end, for this pause',
    "(90s, 10m, 2h; from 1s to 23h); default: the store's, nemia pause-timeout",
    "--now: pause at once, the board's Stop now — each step session at work,",
    "but a landing's, has its call cut at once and parks, going on as the",
    'same try on nemia resume;',
    'each check is asked to stop and run again. A pause that stands is kept.',
    '--yes: with --now, act; without it, --now only says what it would',
    'cut',
  ],
  spec: {
    positionals: [],
    flags: [
      ...saidFlags(PAUSE_SAID, 'nemia pause', 'a pause', PAUSE_TAKES, PAUSE_SHAPE),
      timeoutFlag(PAUSE_SHAPE),
      { flag: '--now', kind: 'switch', key: 'now' },
      { flag: '--yes', kind: 'switch', key: 'yes', only: { side: 'cli', why: 'the board asks its own question before it pauses at once' } },
    ],
    unknown: (arg) => `nemia pause does not take ${arg}: ${PAUSE_SHAPE}.`,
    apart: (_value, flag) => takesFor(PAUSE_TAKES, flag),
  },
  check: pauseRefusal,
  writes: true,
  class: 'act',
  input: PauseWrite,
  handler: (input, _env, home) => pauseBy(input, home),
  print: (answer) => ('kept' in answer ? pausedNowLines(answer) : [pauseWords(answer.pause)]),
};

/** What `nemia resume`'s handler takes: nothing. */
const ResumeInput = Schema.Struct({});
type ResumeInput = typeof ResumeInput.Type;

/**
 * `nemia resume`: the store's pause lifted (`resumePause`), then the sessions' drain, each session parked going on as the same try; on
 * `DELETE /api/pause` too; the pause lifted. Refused with none (`Missing`).
 */
export const RESUME: Command<{ pause: Pause }, ResumeInput> = {
  name: 'resume',
  usage: '',
  help: ['resume the store: each session parked goes on as the same try, and the', 'next pass files what waits'],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia resume takes no ${arg}: it resumes the store, whoever paused it.`,
  },
  writes: true,
  ticks: true,
  class: 'act',
  input: ResumeInput,
  handler: () => tried(() => ({ pause: resumePause() })).pipe(Effect.tap(() => sessionsDrained(null))),
  print: () => [RESUMED],
};

/** The store's pause and the checks it holds, a landing with its merge staged among them (`pausedRead`), which the api alone serves. */
export const PAUSED: Command<Paused> = {
  name: 'paused',
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
  usage: '',
  help: ['what a pause at once would stop, each task at work but a landing, and what that costs'],
  spec: { positionals: [], flags: [], unknown: (arg) => `what a pause at once would stop takes no ${arg}.` },
  writes: false,
  class: 'read',
  only: { side: 'api', why: 'the board confirms a pause at once with it; at the command line, nemia pause --now says it' },
  handler: Effect.fnUntraced(function* (_args, _env, _home, kept) {
    return { interrupts: yield* nowRead(kept?.records?.pause), cost: NOW_COST };
  }),
  print: () => [],
};
