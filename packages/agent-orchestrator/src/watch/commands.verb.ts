/** `nemia watch`, which the CLI alone serves and runs itself: its spec, refusals and help, with no handler. */
import { SELECTOR_FORM, selectorsRefusal } from './selector.ts';
import { retiredWakeRefusal } from '../subscription/index.ts';
import type { Args } from '../command/command.ts';
import type { Ran } from '../command/entry.verb.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The values under `key`, in the order given, or none. */
const listOf = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : [];
};

/** What `nemia watch` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WATCH_USAGE = '[cursor] [--once] [-l <selector>]... [--cursor-file <path>] [--json]';

/** The command line `nemia watch`'s refusals end on. */
const WATCH_FORM = `nemia watch ${WATCH_USAGE}`;

/** The refusal of a cursor `nemia watch` does not take: a second, or anything but a whole number of bytes. */
const cursorTakes = `nemia watch takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: ${WATCH_FORM}`;

/** The refusal of a `-l` given no selector, or one of the command's own flags for it. */
const SELECTOR_TAKES = `nemia watch -l takes a selector of the feed's lines: ${SELECTOR_FORM}`;

/** The refusal of a `--cursor-file` given no path. */
const CURSOR_FILE_TAKES =
  'nemia watch --cursor-file takes the path this watch keeps the cursor it has read to in — written after every line and read again ' +
  'when a watch starts there: nemia watch --cursor-file <path>';

/** What each value flag of `nemia watch` takes, by its name: the refusal of a value given apart that is one of its own flags. */
const WATCH_TAKES: Readonly<Record<string, string>> = {
  '-l': SELECTOR_TAKES,
  '--cursor-file': CURSOR_FILE_TAKES,
};

/**
 * The refusal of a cursor typed beside `--cursor-file`: the file is where the watch keeps its place, so one of the two would be lost
 * without a word. It names which to drop.
 */
const bothCursors = (cursor: string): string =>
  `nemia watch takes a cursor or --cursor-file, not both, and it was given ${cursor} and a file: the file is where the watch keeps its ` +
  `place, so drop the ${cursor} — or drop --cursor-file and read from ${cursor} this once (delete the file to start the watch over).`;

/**
 * `nemia watch`: the feed selected and followed from a cursor until it is stopped, with the store's liveness — or read once to the feed's
 * end with `--once`, which prints where it got to and exits.
 */
export const WATCH: Ran = {
  name: 'watch',
  usage: WATCH_USAGE,
  help: [
    "the feed's lines, followed as the tick writes them, until ^C, and a",
    'daemon down line when nothing ticks the store, daemon up when it does',
    "again: a run's status, a step's word as nemia ls says it, and what a",
    "person's word changed. --once: read from the cursor to the feed's end,",
    'print cursor: <n> and stop; from the start with no cursor. -l: the',
    'lines a selector takes, given again for another (key=v, key!=v, "key in',
    '(a,b)", "key notin (a,b)", key), over run, factory, workflow, step,',
    'agent, kind, reason, on, via, type, waits and source. --cursor-file:',
    'keep the cursor read to in a file, and start from it where it is there.',
    '--json: one JSON object a line, a feed line with its cursor, and a',
    'cursor of its own every 30 seconds while the feed is still. With no -l,',
    'every line; -l waits=person takes the lines that wait on a person. A',
    'step with no agent carries agent: none, which -l agent!=none leaves out.',
    "A line's reason is a step's code as the api gives the step (reason);",
    'its word and message are for people: select on the reason, never on',
    'the words.',
  ],
  spec: {
    positionals: [{ key: 'cursor', takes: 'optional', kind: 'text' }],
    flags: [
      { flag: '--once', kind: 'switch', key: 'once' },
      { flag: '-l', kind: 'text', key: 'selector', many: true, takes: SELECTOR_TAKES },
      { flag: '--cursor-file', kind: 'text', key: 'cursorFile', takes: CURSOR_FILE_TAKES, twice: 'nemia watch takes --cursor-file once.' },
      { flag: '--json', kind: 'switch', key: 'json' },
    ],
    unknown: (arg) => retiredWakeRefusal('nemia watch', arg) ?? `nemia watch does not take ${arg}: ${WATCH_FORM}`,
    apart: (_value, flag) => WATCH_TAKES[flag] ?? cursorTakes,
  },
  check: (args) => {
    const cursor = textOf(args, 'cursor');
    if (cursor !== undefined && cursor.startsWith('-')) return `nemia watch does not take ${cursor}: ${WATCH_FORM}`;
    if (cursor !== undefined && !/^\d+$/.test(cursor)) return cursorTakes;
    if (cursor !== undefined && textOf(args, 'cursorFile') !== undefined) return bothCursors(cursor);
    return selectorsRefusal(listOf(args, 'selector')) ?? null;
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'it follows the feed on a terminal until ^C; the board reads what changed from the api' },
};
