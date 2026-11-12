/**
 * The words of the rest of the store's reads: `concluded`, `logs`, `passes`, `series` and `memory`, each a read of one endpoint the client
 * prints. Pure.
 */
import type { CommandWords } from './command.ts';
import { SERIES_RANGES } from './words.ts';

/** `nemia concluded <runId>`: what a run started with `--from <runId>` would be handed of it, now. */
export const CONCLUDED_WORDS = {
  name: 'concluded',
  served: [{ endpoint: 'runs.concluded' }],
  usage: '<runId>',
  help: ['what a run started with --from <runId> would be handed of it, now'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia concluded reads one run, and ${arg} is not it: nemia concluded <runId>.`,
    missing: 'nemia concluded takes the run to read, by its id: nemia concluded <runId> — nemia ls lists them.',
  },
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia logs <runId> <step>`: the session output of a step's current task. */
export const LOGS_WORDS = {
  name: 'logs',
  served: [{ endpoint: 'steps.log' }],
  usage: '<runId> <step>',
  help: ["that step's session output"],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) => `nemia logs takes one run's id and one step's name: not ${arg}.`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves its end as the `log` of `objects`' steps group, calling this handler" },
} as const satisfies CommandWords;

/** What `--last` takes, as its refusal says it. */
export const LAST_TAKES = '--last takes how many of the recent passes to read, a whole number from 1: nemia passes --last <n>';

/** `nemia passes`: the recent passes of the tick, a histogram of their times and where it went, phase by phase. */
export const PASSES_WORDS = {
  name: 'passes',
  served: [{ endpoint: 'server.passes' }],
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
} as const satisfies CommandWords;

/** What `--range` takes, as its refusal says it. */
export const RANGE_TAKES = `--range takes ${SERIES_RANGES.join(', ')}: nemia series --range 7d`;

/** `nemia series`: the system's series over a range, a point a minute, an hour or a day. */
export const SERIES_WORDS = {
  name: 'series',
  served: [{ endpoint: 'server.series' }],
  usage: '[--range 24h|7d|30d|all] [--json]',
  help: [
    "the system's series over a range: a pass's time and its phases, its",
    'journal reads, the runs in the store, the sessions queued and admitted',
    'and the longest wait, the load, and the quota used. --range: 24h (a',
    'point a minute, the default), 7d or 30d (an hour), all (a day);',
    '--json: the whole answer',
  ],
  spec: {
    positionals: [],
    flags: [
      { flag: '--range', kind: 'text', key: 'range', takes: RANGE_TAKES, twice: 'nemia series takes --range once.' },
      { flag: '--json', kind: 'switch', key: 'json', only: { side: 'cli', why: 'the api answers the whole answer, as JSON' } },
    ],
    unknown: (arg) => `nemia series does not take ${arg}. It takes --range <range> and --json.`,
    apart: () => RANGE_TAKES,
  },
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia memory [<fact>]`: the facts Nemia keeps, or one fact's words. */
export const MEMORY_WORDS = {
  name: 'memory',
  served: [{ endpoint: 'nemia.memory' }, { endpoint: 'nemia.fact', as: 'memory_fact' }],
  usage: '[<fact>]',
  help: ["what Nemia keeps of the store: bare, her facts' names; given one, its", 'words. Read only: her session alone writes them'],
  spec: {
    positionals: [{ key: 'fact', takes: 'optional', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia memory takes one fact's name, not ${arg}: nemia memory [<fact>].`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the nemia group's `memory` and `fact` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** The reads' words, in the order the help lists them. */
export const REST_READ_WORDS = [
  CONCLUDED_WORDS,
  LOGS_WORDS,
  PASSES_WORDS,
  SERIES_WORDS,
  MEMORY_WORDS,
] as const satisfies readonly CommandWords[];
