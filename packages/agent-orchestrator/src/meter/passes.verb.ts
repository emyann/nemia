/**
 * `nemia passes`, and `GET /api/passes`: what the recent passes of the tick cost (`PassesRead`), read off the store's `tick-recent.json`
 * (`recentPasses`), so the command line and the api answer the same, whichever process ticks. A controller: an entry of the command table.
 */
import { tried } from '../runtime-client.ts';
import { recentPasses } from '../daemon/daemon.store.ts';
import { Invalid } from '../refusal/refusal.ts';
import type { Args } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { passesLines, passesRead, type PassesRead } from './meter.ts';

/** A text argument's value, or undefined where it was not given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** What `--last` takes, as its refusal says it. */
const LAST_TAKES = '--last takes how many of the recent passes to read, a whole number from 1: nemia passes --last <n>';

/**
 * How many of the recent passes `args` asks for: every one kept with no `--last`. Refuses as `Invalid` a `--last` that is not a whole
 * number from 1.
 */
export const lastOf = (args: Args): number => {
  const last = textOf(args, 'last');
  if (last === undefined) return Infinity;
  const n = /^\d+$/.test(last) ? Number(last) : 0;
  if (n < 1) throw new Invalid({ message: `${LAST_TAKES}, not ${JSON.stringify(last)}.` });
  return n;
};

/** The recent passes `args` asks for, oldest first, and of them the histogram, the parts and the summary. */
export const passesOf = (args: Args): PassesRead => {
  const n = lastOf(args);
  const recent = recentPasses();
  return passesRead(Number.isFinite(n) ? recent.slice(-n) : recent);
};

/** `nemia passes`: the recent passes of the tick, a histogram of their times and where it went, phase by phase. */
export const PASSES: Command<PassesRead> = {
  name: 'passes',
  usage: '[--last <n>] [--json]',
  help: [
    'what the recent passes of the tick cost: their median and slowest',
    'time, a histogram of their times, where the time went phase by',
    'phase, and what the last saw — the runs in the store, its journal',
    'reads, the sessions queued and admitted. --last <n>: the last n',
    'passes only; --json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--last', kind: 'text', key: 'last', takes: LAST_TAKES, twice: 'nemia passes takes --last once.' },
      { flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole answer, as JSON' } },
    ],
    unknown: (arg) => `nemia passes does not take ${arg}. It takes --last <n> and --json.`,
    apart: () => LAST_TAKES,
  },
  writes: false,
  class: 'read',
  route: { method: 'GET', path: '/api/passes', status: 200 },
  handler: (args) => tried(() => passesOf(args)),
  print: (read, args) => (args.json === true ? [JSON.stringify(read, null, 2)] : passesLines(read)),
};
