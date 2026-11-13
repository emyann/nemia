/**
 * The words of the inbox's writes and the labels: inbox add, queue, from and rm; label run and label inbox. Each is in `INBOX_WORDS`,
 * the client's to parse, word and run (`apps/cli/src/commands/inbox/`), and the orchestrator's entry spreads its words beside its handler,
 * which the api's Card and Run verbs call. Pure.
 */
import { CLI, type Args, type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** What one of `nemia inbox add`'s value flags names, once per card. */
const ADD_NAMES: Readonly<Record<string, string>> = { '--workflow': 'workflow', '--factory': 'factory' };

/** One of `nemia inbox add`'s value flags, keyed by its name, taking what `takes` says, once. */
const addFlag = (flag: string, takes: string): Flag => ({
  flag,
  kind: 'text',
  key: flag.slice(2),
  takes: `${flag} takes ${takes}`,
  twice: `${CLI} inbox add takes ${flag} once: a card names one ${ADD_NAMES[flag] ?? 'value'}.`,
});

/** `nemia inbox add`'s flags: `--workflow` and `--factory`, once each, and `--label`, once per label. */
const ADD_FLAGS: readonly Flag[] = [
  addFlag('--workflow', `the workflow to start the card on, by its name: ${CLI} inbox add "<idea>" --workflow <name>`),
  addFlag('--factory', `the factory that processes the card: ${CLI} inbox add "<idea>" --factory <name>`),
  {
    flag: '--label',
    kind: 'text',
    key: 'label',
    many: true,
    takes: `--label takes a label edit, key=value to set one or key- to drop one its from: runs would give: ${CLI} inbox add "<idea>" --label team=core`,
  },
];

/** Why `nemia inbox add` takes no `--repo`: a card names its factory and its workflow, and the factory's wiring places its run. */
const ADD_REPO_REFUSAL = `${CLI} inbox add does not take --repo: a card names its factory and its workflow, never a repository, and its run works on the repository the factory names for the workflow. File the idea with --factory <factory> --workflow <workflow>, and name the repository on the factory: ${CLI} factory attach <factory> <workflow> --repo <name>. Nothing was filed.`;

/** `nemia inbox add`'s spec: the idea, then its flags; `--repo` refused (`ADD_REPO_REFUSAL`). */
const ADD_SPEC: Spec = {
  positionals: [{ key: 'idea', takes: 'required', kind: 'text' }],
  flags: ADD_FLAGS,
  unknown: (arg) =>
    arg === '--repo' || arg.startsWith('--repo=')
      ? ADD_REPO_REFUSAL
      : arg.startsWith('-')
        ? `${CLI} inbox add does not take ${arg}. It takes the idea, then --workflow <name>, --factory <name> and --label <key=value> once per label.`
        : `${CLI} inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — ${CLI} inbox add "<idea>" — or give it as a file: ${CLI} inbox add ./idea.md.`,
  apart: (_value, flag) => ADD_FLAGS.find((f) => f.flag === flag)?.takes ?? '',
  missing: `${CLI} inbox add takes the idea, first: ${CLI} inbox add "<idea>" [--workflow <name>] [--factory <name>], or a file: ${CLI} inbox add ./idea.md. Nothing was filed.`,
};

/** `nemia inbox add`: an idea, words or a file's text read where it is typed, filed as a card. */
export const INBOX_ADD_WORDS = {
  name: 'inbox add',
  served: [{ endpoint: 'cards.create' }],
  usage: '"<idea>"|<file> [--workflow <name>] [--factory <name>] [--label <key=value>]...',
  help: ['park an idea as a card in the inbox, named from its first line'],
  spec: ADD_SPEC,
  check: (args) => leftOut(ADD_SPEC, args),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `create` of `objects`' Api (`/api/namespaces/:namespace/cards`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** What `--workflow` of `nemia inbox queue` takes, said where it is missing and where it stands apart from its value. */
const QUEUE_WORKFLOW_TAKES = `--workflow takes the workflow the card starts on, by its name: ${CLI} inbox queue <name> --workflow <name>`;

/** `nemia inbox queue`'s spec: the card's name, then `--workflow <name>` once, or `--off`. */
const QUEUE_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--workflow',
      kind: 'text',
      key: 'workflow',
      takes: QUEUE_WORKFLOW_TAKES,
      twice: `${CLI} inbox queue takes --workflow once: a card starts on one workflow.`,
    },
    { flag: '--off', kind: 'switch', key: 'off' },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `${CLI} inbox queue does not take ${arg}. It takes the card's name, then --workflow <name>, or --off to take the card back.`
      : `${CLI} inbox queue queues one card, and ${arg} is a second: ${CLI} inbox queue <name>, once per card.`,
  apart: () => QUEUE_WORKFLOW_TAKES,
  missing: `${CLI} inbox queue takes the name of the card to queue, as ${CLI} inbox lists it: ${CLI} inbox queue <name> [--workflow <name>] [--off].`,
};

/** `nemia inbox queue`: a card marked to start on its own, or with `--off` the mark taken back. */
export const INBOX_QUEUE_WORDS = {
  name: 'inbox queue',
  served: [{ endpoint: 'cards.queue' }, { endpoint: 'cards.unqueue', as: 'inbox_unqueue' }],
  usage: '<name> [--workflow <w>] [--off]',
  help: ['mark a card to start on its own: the tick starts the oldest queued', 'card once a run slot is free; --off takes the mark back'],
  spec: QUEUE_SPEC,
  check: (args) =>
    args.off === true && args.workflow !== undefined
      ? '--off takes the card out of the queue, and --workflow writes what starts it: give one of them.'
      : leftOut(QUEUE_SPEC, args),
  writes: true,
  ticks: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `queue` and `unqueue` of `objects`' Api, which call this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The runs `args` names, as `nemia inbox from` takes them: none for `--off`. */
export const runsNamed = (args: Args): readonly string[] => (Array.isArray(args.runs) ? args.runs.map(String) : []);

/** `nemia inbox from`'s spec: the card's name, then the runs it is handed as context, or `--off`. */
const FROM_SPEC: Spec = {
  positionals: [
    { key: 'name', takes: 'required', kind: 'name' },
    { key: 'runs', takes: 'many', kind: 'name' },
  ],
  flags: [{ flag: '--off', kind: 'switch', key: 'off' }],
  unknown: (arg) =>
    `${CLI} inbox from does not take ${arg}. It takes the card's name, then the runs it is handed as context by id, or --off to take its from: off.`,
  missing: `${CLI} inbox from takes the name of the card, as ${CLI} inbox lists it: ${CLI} inbox from <name> <run>... or --off.`,
};

/** `nemia inbox from`: the runs a card's run is handed as context (its `from:`) set, or with `--off` taken off. */
export const INBOX_FROM_WORDS = {
  name: 'inbox from',
  served: [{ endpoint: 'cards.update' }],
  usage: '<name> <run>... | --off',
  help: ['set the runs a card is handed as context (from:), read and', 'never waited on; --off takes them off'],
  spec: FROM_SPEC,
  check: (args) => {
    if (args.off === true) return runsNamed(args).length ? '--off takes the from: off, and the runs set it: give one of them.' : null;
    return runsNamed(args).length
      ? null
      : `${CLI} inbox from takes the runs the card is handed as context, by id — ${CLI} inbox from <name> <run>... — or --off to take them off.`;
  },
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api writes a card's `from:` with the rest of it, the Card's `update` of `objects`' Api, never through this entry's handler: the client reads the card and writes it whole",
  },
} as const satisfies CommandWords;

/** `nemia inbox rm`: one card dropped without starting it. */
export const INBOX_RM_WORDS = {
  name: 'inbox rm',
  served: [{ endpoint: 'cards.delete' }],
  usage: '<name>',
  help: ['drop a card without starting it'],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `${CLI} inbox rm drops one card, and ${arg} is a second: ${CLI} inbox rm <name>, once per card.`,
    missing: `${CLI} inbox rm takes the name of the card to drop, as ${CLI} inbox lists it: ${CLI} inbox rm <name>.`,
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `delete` of `objects`' Api, which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The edits under `labels`, in the order given. */
export const labelEdits = (args: Args): readonly string[] => (Array.isArray(args.labels) ? args.labels.map(String) : []);

/** A label command's spec: the run or card, then its edits, and `--overwrite`. */
const labelSpec = (command: string, what: string, key: string, lists: string): Spec => ({
  positionals: [
    { key, takes: 'required', kind: 'name' },
    { key: 'labels', takes: 'many', kind: 'text' },
  ],
  flags: [{ flag: '--overwrite', kind: 'switch', key: 'overwrite' }],
  unknown: (arg) =>
    `${command} does not take ${arg}. It takes the ${what}, then its edits — key=value to set a key, key- to remove one — and --overwrite to change a value: ${command} <${key}> team=core.`,
  missing: `${command} takes the ${what} first, as ${lists} lists it, then its edits: ${command} <${key}> team=core [--overwrite].`,
});

/** The refusal of a label command given no edit, or null where it was given one. */
export const noEdits =
  (command: string, key: string) =>
  (args: Args): string | null =>
    labelEdits(args).length ? null : `${command} takes the edits to make after the ${key}: key=value to set a key, key- to remove one.`;

/** `nemia label run`: a run's person labels edited, as `kubectl label` spells it. */
export const LABEL_RUN_WORDS = {
  name: 'label run',
  served: [{ endpoint: 'runs.labels' }],
  usage: '<runId> <key=value|key->... [--overwrite]',
  help: [
    "edit a run's labels: key=value sets a key, key- removes it; changing a",
    `value takes --overwrite. ${CLI} ls -l selects by them, and the feed's`,
    'lines written after carry them',
  ],
  spec: labelSpec(`${CLI} label run`, 'run', 'runId', `${CLI} ls`),
  check: noEdits(`${CLI} label run`, 'run'),
  writes: true,
  class: 'act',
  only: { side: 'cli', why: "the api serves it as the Run's `labels` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia label inbox`: an inbox card's `labels:` edited, every other key and its body kept. */
export const LABEL_INBOX_WORDS = {
  name: 'label inbox',
  served: [{ endpoint: 'cards.labels' }],
  usage: '<name> <key=value|key->... [--overwrite]',
  help: [
    "edit an inbox card's labels: key=value sets a key, key- removes it;",
    `changing a value takes --overwrite. ${CLI} inbox -l selects by them, and`,
    'the run the card starts is created with them',
  ],
  spec: labelSpec(`${CLI} label inbox`, 'card', 'name', `${CLI} inbox`),
  check: noEdits(`${CLI} label inbox`, 'card'),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `labels` of `objects`' Api, which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The group's words, in the order the help lists them. */
export const INBOX_WORDS = [
  INBOX_ADD_WORDS,
  INBOX_QUEUE_WORDS,
  INBOX_FROM_WORDS,
  INBOX_RM_WORDS,
  LABEL_RUN_WORDS,
  LABEL_INBOX_WORDS,
] as const satisfies readonly CommandWords[];
