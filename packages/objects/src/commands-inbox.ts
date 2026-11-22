/**
 * The words of the inbox's writes and the labels: inbox add, queue, resend, from and rm; label run and label inbox. Each is in
 * `INBOX_WORDS`, the client's to parse, word and run (`apps/cli/src/commands/inbox/`), and the orchestrator's entry spreads its words
 * beside its handler, which the api's Card and Run verbs call. Pure.
 */
import { CLI, type Args, type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** What one of `nemia inbox add`'s value flags names, once per card. */
const ADD_NAMES: Readonly<Record<string, string>> = { '--workflow': 'workflow', '--factory': 'factory' };

/** One of `nemia inbox add`'s value flags, keyed by its name, taking what `takes` says, once. */
const addFlag = (flag: string, takes: string) =>
  ({
    flag,
    kind: 'text',
    key: flag.slice(2),
    takes: `${flag} takes ${takes}`,
    twice: `${CLI} inbox add takes ${flag} once: a card names one ${ADD_NAMES[flag] ?? 'value'}.`,
  }) satisfies Flag;

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
  {
    flag: '--file',
    kind: 'text',
    key: 'file',
    many: true,
    takes: `--file takes a file for the card to carry, read where the command is typed and uploaded first: ${CLI} inbox add "<idea>" --file ./shot.png`,
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
        ? `${CLI} inbox add does not take ${arg}. It takes the idea, then --workflow <name>, --factory <name>, --label <key=value> once per label and --file <path> once per file.`
        : `${CLI} inbox add takes one idea, and ${arg} is a second. Quote an idea with spaces — ${CLI} inbox add "<idea>" — or give it as a file: ${CLI} inbox add ./idea.md.`,
  apart: (_value, flag) => ADD_FLAGS.find((f) => f.flag === flag)?.takes ?? '',
  missing: `${CLI} inbox add takes the idea, first: ${CLI} inbox add "<idea>" [--workflow <name>] [--factory <name>], or a file: ${CLI} inbox add ./idea.md. Nothing was filed.`,
};

/** `nemia inbox add`: an idea, words or a file's text read where it is typed, filed as a card. */
export const INBOX_ADD_WORDS = {
  name: 'inbox add',
  served: [{ endpoint: 'cards.create' }],
  usage: '"<idea>"|<file> [--workflow <name>] [--factory <name>] [--label <key=value>]... [--file <path>]...',
  help: [
    'park an idea as a card in the inbox, named from its first line;',
    'each --file is uploaded and carried by the card, as is each file',
    'beside an idea file that its text names as an image or a link',
  ],
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

/** What `--workflow` of `nemia inbox resend` takes, said where it is missing and where it stands apart from its value. */
const RESEND_WORKFLOW_TAKES = `--workflow takes the workflow the card is sent on to, by its name: ${CLI} inbox resend <name> --workflow <name>`;

/** `nemia inbox resend`'s spec: the card's name, then `--workflow <name>` once. */
const RESEND_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [
    {
      flag: '--workflow',
      kind: 'text',
      key: 'workflow',
      takes: RESEND_WORKFLOW_TAKES,
      twice: `${CLI} inbox resend takes --workflow once: a card is sent on to one workflow.`,
    },
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `${CLI} inbox resend does not take ${arg}. It takes the card's name, then --workflow <name>, or none for its factory's card triggers.`
      : `${CLI} inbox resend sends one card on, and ${arg} is a second: ${CLI} inbox resend <name>, once per card.`,
  apart: () => RESEND_WORKFLOW_TAKES,
  missing: `${CLI} inbox resend takes the name of the started card to send on, as ${CLI} inbox lists it: ${CLI} inbox resend <name> [--workflow <name>].`,
};

/**
 * `nemia inbox resend`: a started card sent on, filed again as a card of its own (`<run>-resent`) handed the runs it was started as, to
 * the workflow named or naming none for its factory's card triggers, and the run it came from cancelled when that run waits on a person.
 */
export const INBOX_RESEND_WORDS = {
  name: 'inbox resend',
  served: [{ endpoint: 'cards.resend' }],
  usage: '<name> [--workflow <w>]',
  help: [
    'send a started card on: file it again as <run>-resent, handed its run,',
    "queued on --workflow or, with none, for its factory's card triggers;",
    'the run it came from is cancelled when it waits on you',
  ],
  spec: RESEND_SPEC,
  check: (args) => leftOut(RESEND_SPEC, args),
  writes: true,
  ticks: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `resend` of `objects`' Api, which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/**
 * The runs `args` names, as `nemia inbox from` takes them: none for `--off`.
 * @param args The command line's arguments, by key: its runs under runs.
 */
export const runsNamed = (args: Args) => (Array.isArray(args.runs) ? args.runs.map(String) : []);

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

/**
 * `nemia inbox edit`: a card's body and keys replaced by a card's text — its file as it is to be, typed or a file — read as the card's own
 * file is read; its name kept, its labels left to `nemia label inbox`.
 */
export const INBOX_EDIT_WORDS = {
  name: 'inbox edit',
  served: [{ endpoint: 'cards.edit' }],
  usage: '<name> "<card>"|<file>',
  help: [
    "replace a card's body and keys with a card's text, typed or a file;",
    'the card keeps its name, and its labels: nemia label inbox edits those',
  ],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'source', takes: 'required', kind: 'text' },
    ],
    flags: [],
    unknown: (arg) =>
      `${CLI} inbox edit takes the card's name, then its text as one argument or a file, and ${arg} is a third: quote the text, ${CLI} inbox edit <name> "<card>", or give a file: ${CLI} inbox edit <name> ./card.md.`,
    missing: `${CLI} inbox edit takes the name of the card, as ${CLI} inbox lists it, then the card's text or a file of it: ${CLI} inbox edit <name> ./card.md.`,
  },
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Card's `edit` of `objects`' Api (`/api/namespaces/:namespace/cards/:name/source`), which calls this entry's handler: no route of its own",
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

/**
 * The edits under `labels`, in the order given.
 * @param args The command line's arguments, by key: its edits under labels.
 */
export const labelEdits = (args: Args) => (Array.isArray(args.labels) ? args.labels.map(String) : []);

/** A label command's spec: the run or card, then its edits, and `--overwrite`. */
const labelSpec = (command: string, what: string, key: string, lists: string) =>
  ({
    positionals: [
      { key, takes: 'required', kind: 'name' },
      { key: 'labels', takes: 'many', kind: 'text' },
    ],
    flags: [{ flag: '--overwrite', kind: 'switch', key: 'overwrite' }],
    unknown: (arg) =>
      `${command} does not take ${arg}. It takes the ${what}, then its edits — key=value to set a key, key- to remove one — and --overwrite to change a value: ${command} <${key}> team=core.`,
    missing: `${command} takes the ${what} first, as ${lists} lists it, then its edits: ${command} <${key}> team=core [--overwrite].`,
  }) satisfies Spec;

/**
 * The refusal of a label command given no edit, or null where it was given one.
 * @param command The label command's line, as its refusal names it (nemia label run).
 * @param key What the edits come after on the command line, as its refusal says it (run, card).
 */
export const noEdits = (command: string, key: string) => (args: Args) =>
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

/**
 * The paths `nemia inbox attach` uploads, or the names `nemia inbox detach` takes off, in the order given.
 * @param args The command line's arguments, by key: its files under files.
 */
export const filesNamed = (args: Args) => (Array.isArray(args.files) ? args.files.map(String) : []);

/** `nemia inbox attach`: files uploaded, then carried by a card no run was started from. */
export const INBOX_ATTACH_WORDS = {
  name: 'inbox attach',
  served: [{ endpoint: 'cards.attach' }],
  usage: '<name> <path>...',
  help: [
    'upload files and attach them to a card no run was started from,',
    'each under its own name: every run started from it takes them',
  ],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'files', takes: 'many', kind: 'text' },
    ],
    flags: [],
    unknown: (arg) =>
      `${CLI} inbox attach does not take ${arg}. It takes the card's name, then the files to attach: ${CLI} inbox attach <name> ./shot.png.`,
    missing: `${CLI} inbox attach takes the name of the card, as ${CLI} inbox lists it, then the files to attach: ${CLI} inbox attach <name> ./shot.png.`,
  },
  check: (args) =>
    filesNamed(args).length
      ? null
      : `${CLI} inbox attach takes the files to attach after the card's name: ${CLI} inbox attach <name> ./shot.png.`,
  writes: true,
  class: 'act',
} as const satisfies CommandWords;

/** `nemia inbox detach`: files a card carries taken off it, by their names in the card, before a run is started from it. */
export const INBOX_DETACH_WORDS = {
  name: 'inbox detach',
  served: [{ endpoint: 'cards.detach' }],
  usage: '<name> <file>...',
  help: ['take files off a card no run was started from, by their names', `in the card, as ${CLI} inbox files lists them`],
  spec: {
    positionals: [
      { key: 'name', takes: 'required', kind: 'name' },
      { key: 'files', takes: 'many', kind: 'text' },
    ],
    flags: [],
    unknown: (arg) => `${CLI} inbox detach does not take ${arg}. It takes the card's name, then the names of its files to take off.`,
    missing: `${CLI} inbox detach takes the name of the card, then the names of its files to take off: ${CLI} inbox detach <name> shot.png.`,
  },
  check: (args) =>
    filesNamed(args).length
      ? null
      : `${CLI} inbox detach takes the names of the files to take off after the card's name, as ${CLI} inbox files lists them.`,
  writes: true,
  class: 'act',
} as const satisfies CommandWords;

/** `nemia inbox files`: the files a card carries, as the card's read says them, and one of them written out with `--get`. */
export const INBOX_FILES_WORDS = {
  name: 'inbox files',
  served: [{ endpoint: 'cards.getAll' }],
  usage: '<name> [--get <file> [--out <path>]]',
  help: [
    'list the files a card carries; --get writes one of them out,',
    'to --out or to a file of its own name where the command is typed',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      {
        flag: '--get',
        kind: 'text',
        key: 'get',
        takes: `--get takes the name of a file of the card: ${CLI} inbox files <name> --get shot.png`,
      },
      {
        flag: '--out',
        kind: 'text',
        key: 'out',
        takes: `--out takes the path to write the file to: ${CLI} inbox files <name> --get shot.png --out ./shot.png`,
      },
    ],
    unknown: (arg) => `${CLI} inbox files does not take ${arg}. It takes the card's name, then --get <file> and --out <path>.`,
    missing: `${CLI} inbox files takes the name of the card, as ${CLI} inbox lists it: ${CLI} inbox files <name> [--get <file> [--out <path>]].`,
  },
  check: (args) =>
    args.out !== undefined && args.get === undefined ? '--out names where --get writes the file: give --get <file> with it.' : null,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the client reads the card (the Card's `getAll`) and a file's bytes (the files' `content`, a stream no tool answers), and writes them where it is typed: no route of its own",
  },
} as const satisfies CommandWords;

/** The group's words, in the order the help lists them. */
export const INBOX_WORDS = [
  INBOX_ADD_WORDS,
  INBOX_QUEUE_WORDS,
  INBOX_RESEND_WORDS,
  INBOX_FROM_WORDS,
  INBOX_EDIT_WORDS,
  INBOX_RM_WORDS,
  INBOX_ATTACH_WORDS,
  INBOX_DETACH_WORDS,
  INBOX_FILES_WORDS,
  LABEL_RUN_WORDS,
  LABEL_INBOX_WORDS,
] as const satisfies readonly CommandWords[];
