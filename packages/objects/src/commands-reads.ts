/**
 * The words of the moved reads: show, closeout, ls, inbox and watch, each parsed, helped and printed by the client from these words and
 * read through the `Api`. A check that needs the grammar of a label query is the api's to make: it refuses one in the grammar's own words.
 * The inbox's bare read is `INBOX_READ_WORDS`, apart from the inbox's writes (`INBOX_WORDS`); `nemia watch`'s words are cut into
 * `commands-reads-watch.ts`, and the inbox's manual into `commands-reads-inbox.ts`. Pure.
 */
import { CLI, type Args, type CommandWords, type Flag } from './command.ts';
import { labelFlags, SELECTOR_FLAG_FORM, selectorFlag } from './commands-flags.ts';
import { INBOX_MANUAL } from './commands-reads-inbox.ts';
import { WATCH_WORDS } from './commands-reads-watch.ts';

/** A read's refusal of a word or a flag it does not take: `nemia show takes one run's id, and --raw: not --x.` */
const takesNo = (verb: string, form: string) => (arg: string) => `${CLI} ${verb} takes ${form}: not ${arg}.`;

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/**
 * `-o <output>` and `--output <output>`, how a list's table prints: `wide`, every column, the one the client takes (`outputRefused`). Taken
 * at the command line alone: the client asks the list for its table and prints the columns it asks.
 */
const outputFlags = (command: string): Flag[] =>
  ['-o', '--output'].map((flag) => ({
    flag,
    kind: 'text',
    key: 'output',
    takes: `${flag} takes how the table prints, wide for every column: ${CLI} ${command} ${flag} wide`,
    twice: `${CLI} ${command} takes ${flag} once.`,
    only: { side: 'cli', why: 'the client asks the list for its table and prints the columns it asks; the api is sent no output' },
  }));

/** The refusal of an output the client does not print, or null: `-o wide` alone is one. */
const outputRefused = (command: string, args: Args): string | null => {
  const output = textOf(args, 'output');
  return output === undefined || output === 'wide'
    ? null
    : `${CLI} ${command} prints its table as it is, or wide (every column), not as ${output}: ${CLI} ${command} -o wide`;
};

/**
 * `nemia show`: the run as one object, `nemia/v1`'s `Run`, as JSON, with a line on stderr pointing to `--raw`; `--raw`, its record. Its
 * tool is the record's read (`runs.record`); the object is `ls_run`'s.
 */
export const SHOW_WORDS = {
  name: 'show',
  served: [{ endpoint: 'runs.record' }],
  usage: '<runId> [--raw]',
  help: ['the run as one object (nemia/v1 Run); --raw: its record, and', 'what each step was told'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [{ flag: '--raw', kind: 'switch', key: 'raw' }],
    unknown: takesNo('show', "one run's id, and --raw"),
  },
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia closeout <run> <step> [--try n]`: what a try of a step signed off with, its latest by default. */
export const CLOSEOUT_WORDS = {
  name: 'closeout',
  served: [{ endpoint: 'steps.closeout', query: { fields: '' } }],
  usage: '<runId> <step> [--try <n>]',
  help: ["what a step's try signed off with: its latest, or --try <n>"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    flags: [{ flag: '--try', kind: 'text', key: 'try', takes: "a try's number", twice: `${CLI} closeout takes --try once.` }],
    unknown: takesNo('closeout', "one run's id, one step's name, and --try <n>"),
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the `closeout` of `objects`' steps group, calling this handler" },
} as const satisfies CommandWords;

/** The key `-l` fills, as its builder names it. */
const QUERY_KEY = selectorFlag('nemia ls').key ?? '';

/** The refusal of a run named beside `-l`: one run is read whole, and the runs a label query takes are listed without one. */
const lsRefused = (args: Args): string | null => {
  const run = textOf(args, 'runId');
  const queried = args[QUERY_KEY];
  if (run !== undefined && Array.isArray(queried) && queried.length > 0)
    return `${CLI} ls ${run} reads that one run whole, and takes no -l: type \`${CLI} ls ${run}\`, or \`${CLI} ls -l ${queried.join(' -l ')}\` for the runs it takes`;
  return outputRefused('ls', args);
};

/**
 * `nemia ls`: the runs, as the server prints their table, with the pause, the schedules and the daemon around it; or one run named,
 * read as its object (`runs.show`) and printed a step a line.
 */
export const LS_WORDS = {
  name: 'ls',
  served: [{ endpoint: 'runs.listAll' }, { endpoint: 'runs.show', as: 'ls_run' }],
  usage: '[<runId>] [-l <key>=<value>] [--show-labels] [-L <key>] [-o wide]',
  help: [
    'runs and their steps — a run waiting on another says waiting on <run>,',
    'one the cap on runs in flight holds waiting for a run slot (2 of 2 in',
    "flight); what each step's tries and the run have cost, where measured;",
    'last, whether a nemia up ticks the store and when its last pass was;',
    'first, while the store is paused, Pausing: N finishing and each',
    'session, check or landing at work, or Paused once none is, then each',
    "check it holds, a landing with its merge staged in the repository's",
    'own working tree (MERGE_HEAD) among them; a step whose check it holds',
    'says waiting on the pause. -l: the runs whose labels match (team=core,',
    'given again for another); --show-labels: each run with its labels;',
    '-L <key>: that label beside each run, given again for another; -o',
    'wide: every column, each step among them',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'optional', kind: 'name' }],
    flags: [...labelFlags('nemia ls'), ...outputFlags('ls')],
    unknown: (arg) => `${CLI} ls takes one run's id, or none, -l <key>=<value>, --show-labels, -L <key> and -o wide: not ${arg}.`,
  },
  check: lsRefused,
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** The refusal of a `-L` given no key. */
const LABEL_COLUMN_TAKES = `${CLI} inbox -L takes the label key whose value each line shows: ${CLI} inbox -L team`;

/** The refusal of a `-l` given nothing to match. */
const INBOX_QUERY_TAKES = `${CLI} inbox -l takes what the cards' labels, workflow and factory are to match: ${SELECTOR_FLAG_FORM}`;

/**
 * `nemia inbox`, the inbox's bare read: the cards in play, or every one with `--all`, as the server prints their table, and how to start,
 * queue or drop one. `nemia inbox --help` prints its manual, which says every form of the inbox.
 */
export const INBOX_READ_WORDS = {
  name: 'inbox',
  usage: '',
  help: [
    'the cards still in play: name, first line, workflow when set,',
    'and started as <runId>, <phase> (nemia inbox --help); --all: those whose',
    'run ended too; -l: the cards whose labels match; --show-labels, -L <key>:',
    'their labels on each line; -o wide: every column',
  ],
  spec: {
    positionals: [],
    flags: [
      { ...selectorFlag('nemia inbox'), takes: INBOX_QUERY_TAKES },
      { flag: '--all', kind: 'switch', key: 'all' },
      { flag: '--show-labels', kind: 'switch', key: 'showLabels' },
      { flag: '-L', kind: 'text', key: 'labelColumns', many: true, takes: LABEL_COLUMN_TAKES },
      ...outputFlags('inbox'),
    ],
    apart: (_value, flag) => (flag === '-L' ? LABEL_COLUMN_TAKES : INBOX_QUERY_TAKES),
    unknown: (arg) =>
      `${CLI} inbox does not take ${arg}. It lists the inbox — ${CLI} inbox — files a card with ${CLI} inbox add "<idea>", queues one with ${CLI} inbox queue <name>, and drops one with ${CLI} inbox rm <name> (${CLI} inbox --help).`,
  },
  check: (args) => outputRefused('inbox', args),
  writes: false,
  class: 'read',
  served: [
    { endpoint: 'cards.listAll', query: { fieldSelector: 'status.inPlay=true' } },
    { endpoint: 'cards.getAll', as: 'inbox_card' },
  ],
  only: {
    side: 'cli',
    why: "the command line's listing: the api's list of the Card (`GET /api/cards`, `objects`' Api) is the package's `cardList`, never this handler, and prints its rows as a Table (`cardTable`)",
  },
  manual: INBOX_MANUAL,
} as const satisfies CommandWords;

export { WATCH_WORDS };

/** The group's words, in the order the help lists them. */
export const READ_WORDS = [INBOX_READ_WORDS, LS_WORDS, SHOW_WORDS, CLOSEOUT_WORDS, WATCH_WORDS] as const satisfies readonly CommandWords[];
