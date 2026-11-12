/**
 * The words of the run's verbs that act on one run as it stands, or wait on the feed: `nemia cancel`, `nemia hold` (its lift, `--off`,
 * among them), `nemia route`, `nemia refresh` and `nemia wait`. Each check here is pure and needs nothing of the orchestrator: what does
 * (a label query's grammar, a wait's bound) is the handler's to refuse. Pure.
 */
import type { Args, CommandWords } from './command.ts';
import { saidFlags, saidRefusal, selectorFlag, takesFor, takesOf, type Said } from './commands-flags.ts';

/** The longest a `--why` a hold or a pause is given may be, in characters: the orchestrator's `WHY_CAP`. */
export const WHY_CAP = 200;

/** The longest a `--by` a hold or a pause is given may be, in characters: the orchestrator's `BY_CAP`. */
export const BY_CAP = 64;

/** `nemia cancel`: what a run has in flight asked to stop, and nothing more filed. */
export const CANCEL_WORDS = {
  name: 'cancel',
  served: [{ endpoint: 'runs.cancel' }],
  usage: '<runId>',
  help: ['stop what it has in flight; file nothing more'],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia cancel takes one run's id: not ${arg}.`,
  },
  writes: true,
  ticks: true,
  class: 'ask',
} as const satisfies CommandWords;

/** The values under `key`, in the order given, or none. */
const listOf = (args: Args, key: string): readonly string[] => {
  const value = args[key];
  return Array.isArray(value) ? value : [];
};

/** `nemia hold`'s two forms, as each of its refusals ends on them. */
const HOLD_SHAPE = 'nemia hold <runId> [--until <runId> ...] [--why "<words>"] [--by <name>], or nemia hold <runId> --off';

/** `nemia hold`'s `--why` and `--by`. */
const HOLD_SAID: readonly Said[] = [
  { flag: '--why', key: 'why', takes: 'the words for why the run is held', cap: WHY_CAP },
  { flag: '--by', key: 'by', takes: 'who puts the hold, by a name', cap: BY_CAP },
];

/** `--until`'s refusal of a value left out, saying what it takes. */
const UNTIL_TAKES = `--until takes the run to wait on, by id: ${HOLD_SHAPE}.`;

/** `--until`, `--why` and `--by`, each with its refusal of a value left out, saying what it takes. */
const HOLD_TAKES: Readonly<Record<string, string>> = { '--until': UNTIL_TAKES, ...takesOf(HOLD_SAID, HOLD_SHAPE) };

/**
 * Refused of `nemia hold`'s arguments before any run is read: a run to wait on empty or starting `-`, what `saidRefusal` refuses of `--why`
 * and `--by`; then together: `--until` and `--off` both, and `--why` or `--by` with `--off`. A run named twice is the verb's to refuse.
 */
export function holdRefusal(args: Args): string | null {
  const until = listOf(args, 'until');
  const off = args.off === true;
  if (until.some((id) => !id || id.startsWith('-'))) return UNTIL_TAKES;
  const said = HOLD_SAID.map((s) => saidRefusal(args, s, HOLD_TAKES)).find((r) => r !== null);
  if (said) return said;
  if (off && until.length) return `nemia hold takes --until or --off, not both: lift the hold first, then hold it again — ${HOLD_SHAPE}.`;
  if (off && (args.why !== undefined || args.by !== undefined))
    return `nemia hold --off lifts the hold whole, and takes no --why or --by: those go with the hold put next — ${HOLD_SHAPE}.`;
  return null;
}

/** `nemia hold`: a run held until other runs land, or until a person lifts it; with `--off`, its hold lifted now. */
export const HOLD_WORDS = {
  name: 'hold',
  served: [{ endpoint: 'runs.hold' }, { endpoint: 'runs.unhold', as: 'unhold' }],
  usage: '<runId> [--until <runId> ...] [--why "<words>"] [--by <name>]',
  help: [
    'file nothing more of a run until other runs land, as --after would',
    'have: what is in flight finishes, nothing new is filed, and nothing',
    'is asked of you — nemia ls and nemia decide say held until <run> lands, and',
    'what a step asks is asked once the hold lifts. The tick lifts it when',
    'every run named has landed. With no --until, the run is held until a',
    'person lifts it (--off), and no tick lifts it: nemia ls and nemia',
    'decide say held until a person lifts it. Refused of a run cancelled,',
    'pruned, finished or already held, and of a run named that is unknown,',
    'the run itself, or one that already waits on it, through --after or a',
    'hold.',
    '--why: the reason, shown beside held until <run> lands wherever it is',
    'said; --by: who puts the hold (default: your OS user).',
    'nemia hold <runId> --off: lift the hold now, and the next tick goes on as',
    'if it had never been put',
  ],
  spec: {
    positionals: [{ key: 'runId', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--until', kind: 'text', key: 'until', takes: UNTIL_TAKES, many: true },
      ...saidFlags(HOLD_SAID, 'nemia hold', 'a hold', HOLD_TAKES, HOLD_SHAPE),
      { flag: '--off', kind: 'switch', key: 'off' },
    ],
    unknown: (arg) => `nemia hold does not take ${arg}. It takes the run, then the runs it waits on or --off: ${HOLD_SHAPE}.`,
    apart: (_value, flag) => takesFor(HOLD_TAKES, flag),
    missing: 'nemia hold takes the run first: nemia hold <runId> [--until <runId> ...], or nemia hold <runId> --off.',
  },
  check: holdRefusal,
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `hold` and `unhold` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia route`: a person's route for a condition's try, which the next tick takes over the condition's own answer. */
export const ROUTE_WORDS = {
  name: 'route',
  served: [{ endpoint: 'runs.route' }],
  usage: '<runId> <condition> <route>',
  help: [
    'route a condition by hand: the next tick takes your route over the',
    "condition's own answer, for the try it is on, and files the nodes",
    'whose when: names it. Refused once a node after it is filed or sent:',
    'nemia cancel <runId>, and start again.',
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'required', kind: 'name' },
      { key: 'route', takes: 'required', kind: 'name' },
    ],
    flags: [],
    unknown: (arg) =>
      `nemia route does not take ${arg}. It takes the run, the condition and the route: nemia route <runId> <condition> <route>.`,
  },
  writes: true,
  ticks: true,
  class: 'act',
} as const satisfies CommandWords;

/** The refusal of a step named without `--base`, which alone takes one; null where none is. */
export function refreshRefusal({ runId, step, base }: Args): string | null {
  const id = typeof runId === 'string' ? runId : '<runId>';
  return base !== true && typeof step === 'string'
    ? `nemia refresh takes a step only with --base, which merges the base into the work of the loop it closes: nemia refresh ${id} ${step} --base. The new revisions are the whole run's: nemia refresh ${id}.`
    : null;
}

/** `nemia refresh`: a run pinned to the new revisions, or with `--base` a loop's work sent back to merge its base. */
export const REFRESH_WORDS = {
  name: 'refresh',
  served: [{ endpoint: 'runs.refresh' }],
  usage: '<runId> [<step>] [--base]',
  help: [
    'take the new revisions: a run keeps the workflow, agents, skills and',
    'factory rules it resolved when it started, and this pins it to the',
    'ones they hold now, so every filing after it — a new step, a retry,',
    'a round — is filed on them. What has already been filed is not re-run,',
    'and the steps the run has are neither added to nor removed. Refused of',
    'a run that has filed nothing, which resolves afresh at its first filing',
    'anyway, of one already on the newest revision of every kind, and of one',
    'whose factory follows revisions (nemia factory revisions), whose every',
    'filing takes them with no refresh;',
    "--base: take the base instead — a loop's work that no longer merges",
    'cleanly goes back to merge it, once, on the next tick, on the round it',
    'is on, which the merge does not spend; the step is the one that closes',
    'the loop, left out where the run has one loop',
  ],
  spec: {
    positionals: [
      { key: 'runId', takes: 'required', kind: 'name' },
      { key: 'step', takes: 'optional', kind: 'name' },
    ],
    flags: [{ flag: '--base', kind: 'switch', key: 'base' }],
    unknown: (arg) =>
      `nemia refresh takes one run's id, and with --base the step that closes the loop whose work merges: not ${arg}. nemia refresh <runId>, or nemia refresh <runId> [<step>] --base.`,
    missing: 'nemia refresh takes the run to pin to the new revisions: nemia refresh <runId>.',
  },
  check: refreshRefusal,
  writes: true,
  ticks: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `refresh` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** What `nemia wait` takes after its name: its usage in the help, and what every refusal of what was typed ends on. */
const WAIT_USAGE = '[-l <key>=<value>]... [--from <cursor>] [--for <duration>]';

/** The command line `nemia wait`'s refusals end on. */
const WAIT_FORM = `nemia wait ${WAIT_USAGE}`;

/** `nemia wait`'s `-l`, given again for another. */
const WAIT_LABELS = selectorFlag('nemia wait');

/** The refusal of a `--from` given no cursor, or one that is no whole number. */
const FROM_TAKES =
  'nemia wait --from takes a cursor, a whole number of bytes — 0, or the cursor a wait or nemia watch printed — or none for the ' +
  `feed's end: ${WAIT_FORM}`;

/** The refusal of a `--for` given no bound. */
const FOR_TAKES = `nemia wait --for takes how long the wait waits, as --for 30s or --for 4m: ${WAIT_FORM}`;

/** What each value flag of `nemia wait` takes, by its name: the refusal of a value given apart that is one of its own flags. */
const WAIT_TAKES: Readonly<Record<string, string>> = { '-l': WAIT_LABELS.takes ?? '', '--from': FROM_TAKES, '--for': FOR_TAKES };

/**
 * Refused of `nemia wait`'s arguments before the feed is read: a cursor that is no whole number. A label query the grammar refuses, and a
 * `--for` out of its form or past its bound, are the handler's to refuse, which holds the grammar and the bound.
 */
export const waitRefusal = (args: Args): string | null => {
  const from = args.from;
  return typeof from === 'string' && !/^\d+$/.test(from) ? FROM_TAKES : null;
};

/** `nemia wait`: the feed's next lines `-l` takes, from a cursor, within a bound, and the cursor to wait again from. */
export const WAIT_WORDS = {
  name: 'wait',
  usage: WAIT_USAGE,
  help: [
    "wait for the feed's next line -l takes, and print it with the",
    'cursor after it: from --from (a cursor a wait or nemia watch printed),',
    "else from the feed's end now. It ends on the first lines -l takes, or",
    'after --for (4m by default, at most 270s) with none, and prints the',
    'cursor either way: wait again from it and no line is lost.',
    '-l: as nemia watch -l takes it, given again for another; none takes',
    'every line.',
  ],
  spec: {
    positionals: [],
    flags: [
      WAIT_LABELS,
      { flag: '--from', kind: 'text', key: 'from', takes: FROM_TAKES, twice: `nemia wait takes --from once: ${WAIT_FORM}` },
      { flag: '--for', kind: 'text', key: 'for', takes: FOR_TAKES, twice: `nemia wait takes --for once: ${WAIT_FORM}` },
    ],
    unknown: (arg) => `nemia wait does not take ${arg}: ${WAIT_FORM}`,
    apart: (_value, flag) => WAIT_TAKES[flag] ?? FROM_TAKES,
  },
  check: waitRefusal,
  writes: false,
  class: 'read',
  served: [{ endpoint: 'server.wait' }],
} as const satisfies CommandWords;
