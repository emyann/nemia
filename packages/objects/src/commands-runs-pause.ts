/**
 * The words of the store's pause: `nemia pause` (`--now` among it, whose `--yes` is the command line's own question), `nemia
 * pause-timeout` and `nemia resume`, and the form a timeout takes (`timeoutRefusal`), which the orchestrator's pause reads the same way.
 * The pause that stands and what a pause at once would stop are read on the api alone (`paused`, `pause now`). Pure.
 */
import type { Args, CommandWords, Flag } from './command.ts';
import { saidFlags, saidRefusal, takesFor, takesOf, type Said } from './commands-flags.ts';
import { BY_CAP, WHY_CAP } from './commands-runs-act.ts';

/** How a timeout is typed, as every refusal of one says it. */
const TIMEOUT_FORM = 'digits and s, m or h, from 1s to 23h, as 90s, 10m or 2h';

/** The milliseconds of each unit a timeout is typed in. */
const UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const;

/** The shortest timeout a pause takes, and the longest: one second, and 23 hours. */
const TIMEOUT_BOUNDS = { least: 1_000, most: 23 * 3_600_000 } as const;

/** Why `text` is no timeout, naming the form, or undefined for one that reads: digits and one unit, from 1s to 23h. */
export const timeoutRefusal = (text: string): string | undefined => {
  const m = /^(\d+)([smh])$/.exec(text.trim());
  const unit = m?.[2];
  const ms = m && (unit === 's' || unit === 'm' || unit === 'h') ? Number(m[1]) * UNIT_MS[unit] : undefined;
  if (ms === undefined) return `a timeout is ${TIMEOUT_FORM}; it was given ${JSON.stringify(text)}`;
  return ms < TIMEOUT_BOUNDS.least || ms > TIMEOUT_BOUNDS.most
    ? `a timeout is from 1s to 23h (${TIMEOUT_FORM}); it was given ${JSON.stringify(text)}`
    : undefined;
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

/** The `--timeout <d>` flag of `nemia pause`, its refusal ending on the verb's `shape`. */
const timeoutFlag = (shape: string): Flag => ({
  flag: '--timeout',
  kind: 'text',
  key: 'timeout',
  takes: `--timeout takes how long a call in flight is given, as --timeout 10m: ${shape}.`,
});

/** Why `nemia pause`'s `--timeout` is refused: a timeout out of its form, or one given with `--now`, which cuts at once; null when none. */
const pauseTimeoutRefusal = (timeout: unknown, now: boolean): string | null => {
  if (typeof timeout !== 'string') return null;
  if (now) return `--timeout gives each call in flight a while to end, and --now cuts them at once: give one, ${PAUSE_SHAPE}.`;
  const wrong = timeoutRefusal(timeout);
  return wrong === undefined ? null : `--timeout: ${wrong}: ${PAUSE_SHAPE}, as nemia pause --timeout 10m.`;
};

/** Why `nemia pause`'s arguments are refused before anything is read, or null: `--why` and `--by` (`saidRefusal`), then `--timeout`. */
export const pauseRefusal = (args: Args): string | null =>
  PAUSE_SAID.map((s) => saidRefusal(args, s, PAUSE_TAKES)).find((r) => r !== null) ?? pauseTimeoutRefusal(args.timeout, args.now === true);

/**
 * `nemia pause`: the store paused, every session parked at its tool call's end within the timeout; `--now` pauses at once, and acts on
 * `--yes` alone, saying first what it would cut.
 */
export const PAUSE_WORDS = {
  name: 'pause',
  served: [{ endpoint: 'server.pause' }],
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
} as const satisfies CommandWords;

/** `nemia pause-timeout`'s form, as each of its refusals ends on it. */
const TIMEOUT_SHAPE = 'nemia pause-timeout [<d>]';

/** Why the timeout `nemia pause-timeout` was given is refused, ending on the form it takes; null where none, or one in its form. */
export const pauseTimeoutCheck = (args: Args): string | null => {
  const text = args.timeout;
  const wrong = typeof text === 'string' ? timeoutRefusal(text) : undefined;
  return wrong === undefined ? null : `${wrong}: ${TIMEOUT_SHAPE}, as nemia pause-timeout 10m.`;
};

/** `nemia pause-timeout`: the store's pause timeout, read bare and written given a duration. */
export const PAUSE_TIMEOUT_WORDS = {
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
  check: pauseTimeoutCheck,
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia resume`: the store's pause lifted, each session parked going on as the same try. */
export const RESUME_WORDS = {
  name: 'resume',
  served: [{ endpoint: 'server.resume' }],
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
} as const satisfies CommandWords;
