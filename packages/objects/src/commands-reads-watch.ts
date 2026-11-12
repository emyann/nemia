/**
 * The words of `nemia watch`, one of the moved reads (`commands-reads.ts` lists them): its spec, its refusals and its help. A label query
 * the grammar refuses is the api's stream's to refuse, in the grammar's own words. Pure.
 */
import { CLI, type Args, type CommandWords } from './command.ts';
import { SELECTOR_FLAG_FORM, selectorFlag } from './commands-flags.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** What `nemia watch` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WATCH_USAGE = '[cursor] [--once] [-l <key>=<value>]... [--cursor-file <path>] [--json]';

/** The command line `nemia watch`'s refusals end on. */
const WATCH_FORM = `${CLI} watch ${WATCH_USAGE}`;

/** The refusal of a cursor `nemia watch` does not take: a second, or anything but a whole number of bytes. */
const CURSOR_TAKES = `${CLI} watch takes one cursor at most, a whole number of bytes — 0, or the number a \`cursor:\` line printed: ${WATCH_FORM}`;

/** The keys every line of the feed can carry, in the order the feed's label query names them; a person's labels besides. */
const LINE_KEYS: readonly string[] = [
  'run',
  'factory',
  'workflow',
  'step',
  'agent',
  'kind',
  'reason',
  'on',
  'via',
  'type',
  'waits',
  'source',
];

/** The refusal of a `-l` given nothing to match, or one of the command's own flags for it: the forms, then the keys a line carries. */
const LINES_TAKE =
  `${CLI} watch -l takes what the feed's lines are to match: ${SELECTOR_FLAG_FORM}. The keys: ${LINE_KEYS.join(', ')}, ` +
  'and any label a person put';

/** The refusal of a `--cursor-file` given no path. */
const CURSOR_FILE_TAKES =
  `${CLI} watch --cursor-file takes the path this watch keeps the cursor it has read to in — written after every line and read again ` +
  `when a watch starts there: ${CLI} watch --cursor-file <path>`;

/** What each value flag of `nemia watch` takes, by its name: the refusal of a value given apart that is one of its own flags. */
const WATCH_TAKES: Readonly<Record<string, string>> = { '-l': LINES_TAKE, '--cursor-file': CURSOR_FILE_TAKES };

/** The flags retired with the wake words, each refused by name wherever it was typed. */
const RETIRED_WAKE: readonly string[] = ['--wake', '--wake-word'];

/**
 * Why `arg`, typed to `nemia watch`, is a flag that no longer exists, or undefined where it is none of them: a line's prose is no longer
 * matched, and the refusal names what to type for the lines that wait on a person.
 */
const retiredWake = (arg: string): string | undefined => {
  const flag = arg.split('=')[0] ?? arg;
  if (!RETIRED_WAKE.includes(flag)) return undefined;
  return (
    `${CLI} watch no longer takes ${flag}: the feed's lines are no longer matched on their prose but selected by the keys they name — ` +
    `type -l waits=person for the lines that wait on a person, or -l reason=<code> for one reason. ${SELECTOR_FLAG_FORM}`
  );
};

/**
 * The refusal of a cursor typed beside `--cursor-file`: the file is where the watch keeps its place, so one of the two would be lost
 * without a word. It names which to drop.
 */
const bothCursors = (cursor: string): string =>
  `${CLI} watch takes a cursor or --cursor-file, not both, and it was given ${cursor} and a file: the file is where the watch keeps its ` +
  `place, so drop the ${cursor} — or drop --cursor-file and read from ${cursor} this once (delete the file to start the watch over).`;

/**
 * `nemia watch`: the feed matched and followed from a cursor until it is stopped, with the daemon's liveness — or read once to the feed's
 * end with `--once`, which prints where it got to and exits. A stream, it links no endpoint: the port has no tool of it.
 */
export const WATCH_WORDS = {
  name: 'watch',
  usage: WATCH_USAGE,
  help: [
    "the feed's lines, followed as the tick writes them, until ^C, and a",
    'daemon down line when nothing ticks the store, daemon up when it does',
    "again: a run's status, a step's word as nemia ls says it, and what a",
    "person's word changed. --once: read from the cursor to the feed's end,",
    'print cursor: <n> and stop; from the start with no cursor. -l: the',
    'lines whose keys match, given again for another (key=v, key!=v, "key in',
    '(a,b)", "key notin (a,b)", key), over run, factory, workflow, step,',
    'agent, kind, reason, on, via, type, waits and source. --cursor-file:',
    'keep the cursor read to in a file, and start from it where it is there.',
    '--json: one JSON object a line, a feed line with its cursor, and a',
    'cursor of its own every 30 seconds while the feed is still. With no -l,',
    'every line; -l waits=person takes the lines that wait on a person. A',
    'step with no agent carries agent: none, which -l agent!=none leaves out.',
    "A line's reason is a step's code as the api gives the step (reason);",
    'its word and message are for people: match on the reason, never on',
    'the words.',
  ],
  spec: {
    positionals: [{ key: 'cursor', takes: 'optional', kind: 'text' }],
    flags: [
      { flag: '--once', kind: 'switch', key: 'once' },
      { ...selectorFlag('nemia watch'), takes: LINES_TAKE },
      { flag: '--cursor-file', kind: 'text', key: 'cursorFile', takes: CURSOR_FILE_TAKES, twice: `${CLI} watch takes --cursor-file once.` },
      { flag: '--json', kind: 'switch', key: 'json' },
    ],
    unknown: (arg) => retiredWake(arg) ?? `${CLI} watch does not take ${arg}: ${WATCH_FORM}`,
    apart: (_value, flag) => WATCH_TAKES[flag] ?? CURSOR_TAKES,
  },
  check: (args) => {
    const cursor = textOf(args, 'cursor');
    if (cursor !== undefined && cursor.startsWith('-')) return `${CLI} watch does not take ${cursor}: ${WATCH_FORM}`;
    if (cursor !== undefined && !/^\d+$/.test(cursor)) return CURSOR_TAKES;
    if (cursor !== undefined && textOf(args, 'cursorFile') !== undefined) return bothCursors(cursor);
    return null;
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: 'it follows the feed on a terminal until ^C; the board reads what changed from the api' },
} as const satisfies CommandWords;
