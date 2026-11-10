/** `nemia tick` and `nemia up`, which the CLI alone serves and runs itself: their specs, refusals and help, with no handler. */
import { everyOf } from '../daemon/daemon.ts';
import type { Args } from '../command/command.ts';
import type { Ran } from '../command/entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The `--stats` switch of `nemia tick` and `nemia up`. */
const STATS = { flag: '--stats', kind: 'switch', key: 'stats' } as const;

/** `nemia tick`: one pass of the tick, run by the CLI's runner. */
export const TICK: Ran = {
  name: 'tick',
  usage: '[--stats]',
  help: [
    'one pass: tick the engine, file what became ready — refused while a',
    'daemon (the api, or a nemia up) ticks the store, since it runs the same',
    'pass (daemon.json);',
    '--stats says after it what the pass cost, phase by phase',
  ],
  spec: {
    positionals: [],
    flags: [STATS],
    unknown: (arg) => `nemia tick takes no ${arg}: nemia tick runs one pass, and nemia tick --stats says after it what the pass cost.`,
  },
  writes: true,
  class: 'none',
  only: { side: 'cli', why: 'a pass is run where the store is, by a person or by a daemon; the api serves none on a route' },
};

/** Refused of `nemia up`'s arguments: an interval beside `--stats`, which ticks nothing, or one `everyOf` refuses. */
function upRefusal(args: Args): string | null {
  const every = textOf(args, 'every');
  if (every === undefined) return null;
  if (args.stats === true)
    return `nemia up --stats reads what the last pass cost and ticks nothing, so it takes no ${every}: nemia up --stats alone, or nemia up ${every} to tick.`;
  const asked = everyOf(every);
  return 'refusal' in asked ? asked.refusal : null;
}

/** `nemia up`: a pass every interval, holding the store, until it is stopped; or, with `--stats`, what the last pass cost. */
export const UP: Ran = {
  name: 'up',
  usage: '[ms]',
  help: [
    'the headless daemon, where no board is served: the same pass on a',
    'timer (4000 unless given; whole ms, 1 to 2147483647), holding the',
    "store. The api's process (npm start in apps/api) is the daemon where",
    'one is: one store takes one, and each is refused while the other',
    "ticks. It takes the store over once its holder's process is gone or",
    'it has been silent for 10 intervals, at least 15 minutes; it writes',
    'WF_ROOT/daemon.json — who holds it, pid, start, last pass, and a beat',
    'each interval;',
    'once a minute, a line of what its passes cost (tick-stats.json); the',
    "store's pause once it is put, again each time it says another thing",
    '(Pausing: N finishing, then Paused), and once it is resumed.',
    'nemia up --stats: what the last pass cost, phase by phase — read, not',
    'run, so it fits while a daemon holds the store; where none does,',
    'nemia tick --stats',
  ],
  spec: {
    positionals: [{ key: 'every', takes: 'optional', kind: 'text' }],
    flags: [STATS],
    unknown: (arg) => {
      const asked = everyOf(arg);
      return 'refusal' in asked ? asked.refusal : `nemia up takes one pass interval at most, and was given ${arg} too: nemia up [ms].`;
    },
  },
  check: upRefusal,
  writes: true,
  class: 'none',
  only: { side: 'cli', why: 'nemia up holds the store as long as its process lives; the api holds none' },
};
