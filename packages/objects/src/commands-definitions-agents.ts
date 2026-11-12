/**
 * The words of the agents' verbs the client holds but `agents write` (`commands-writers.ts`): the listing and one agent's card, where agent
 * files are and one copied into yours, a person's custom instructions for one, and one of yours removed and tried. Listed by
 * `commands-definitions.ts`. Pure.
 */
import { CLI, type Args, type CommandWords, type Flag, type Positional, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';
import { versionFlag, writerSpec } from './commands-writers.ts';

/** The text `args` holds under `key`, or undefined where none was given. */
const textIn = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** The refusal of a value left out of each of `nemia agents`' two flags, saying what it takes. */
const AGENTS_TAKES = {
  '--repo': '--repo takes the repository whose workflows/agents to read: nemia agents --repo <r>',
  '--from': '--from takes which place the agent is in: nemia agents card <name> --from repo|yours',
} as const;

/** `--repo <r>` once, and `--from repo|yours` once, which the listing takes and leaves unread. */
const AGENTS_FLAGS = (['--repo', '--from'] as const).map((flag): Flag => ({
  flag,
  kind: 'text',
  key: flag.slice(2),
  takes: AGENTS_TAKES[flag],
  twice: `${CLI} agents takes ${flag} once: an agent is read from one ${flag === '--repo' ? 'repository' : 'place'}.`,
}));

/** `nemia agents`' spec, after the name of the card it is asked for: its flags, and an argument it does not take in its own words. */
const agentsSpec = (positionals: readonly Positional[]): Spec => ({
  positionals,
  flags: AGENTS_FLAGS,
  unknown: (arg) =>
    arg.startsWith('-')
      ? `${CLI} agents does not take ${arg}. It takes --repo <r>, and for a card --from repo|yours.`
      : `${CLI} agents takes no argument but card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours: nemia agents, nemia agents card ${arg}, or nemia agents custom ${arg}.`,
  apart: (_value, flag) => AGENTS_TAKES[flag as keyof typeof AGENTS_TAKES],
});

/** Refused of `nemia agents`' flags: a value empty or starting `--`, which reads as the value left out, and a place but repo or yours. */
function agentsRefusal(args: Args): string | null {
  for (const flag of ['--repo', '--from'] as const) {
    const value = textIn(args, flag.slice(2));
    if (value !== undefined && (!value || value.startsWith('--'))) return AGENTS_TAKES[flag];
  }
  const from = textIn(args, 'from');
  if (from === undefined || from === 'repo' || from === 'yours') return null;
  return `${CLI} agents --from takes repo or yours, not ${from}: repo is <repo>/workflows/agents, yours is your store's.`;
}

/** `nemia agents`: every agent of both places, the repository's then yours. */
export const AGENTS_WORDS = {
  name: 'agents',
  served: [{ endpoint: 'agents.list' }],
  usage: '[--repo .]',
  help: [
    "the agents a step may name, the repository's then yours: what each is",
    'for, what it says it can do (an entry for each skill, read off its',
    'SKILL.md), and the skills it is given (its skills:)',
  ],
  spec: agentsSpec([]),
  check: agentsRefusal,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `list` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** `nemia agents card`: one agent in the shape of an A2A Agent Card, from the place it is in. */
export const AGENTS_CARD_WORDS = {
  name: 'agents card',
  served: [{ endpoint: 'agents.card' }],
  usage: '<name> [--repo .] [--from repo|yours]',
  help: [
    'that agent in the shape of an A2A Agent Card, JSON on stdout and',
    'nothing else — every field the protocol marks REQUIRED but',
    'supportedInterfaces, which is left out because nothing here serves an',
    'agent over A2A. The card describes; it is not an address',
  ],
  spec: agentsSpec([{ key: 'name', takes: 'required', kind: 'name' }]),
  check: agentsRefusal,
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `card` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** `nemia agents sources`: every agent file the store knows of, to copy into your library, and the folder named with `--path`. */
export const AGENTS_SOURCES_WORDS = {
  name: 'agents sources',
  served: [{ endpoint: 'agents.sources' }],
  usage: '[--path <folder>]',
  help: ['the agent files the store knows of, to copy into your library:', "each repository's, yours, and those of a --path <folder>"],
  spec: {
    positionals: [],
    flags: [
      {
        flag: '--path',
        kind: 'text',
        key: 'path',
        takes: '--path takes a folder of agent files: nemia agents sources --path <folder>',
        twice: `${CLI} agents sources takes --path once.`,
      },
    ],
    unknown: (arg) => `${CLI} agents sources takes no ${arg}: ${CLI} agents sources [--path <folder>]`,
  },
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `sources` verb of `objects`' Api (`GET /api/agents/sources`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The refusal of a value flag of `nemia agents custom` given twice. */
const customTwice = (flag: string): string => `${CLI} agents custom takes ${flag} once: one agent's words are one file.`;

/** `--file <path>`, or `-` for stdin: the words to write, read by the command line's runner. */
const CUSTOM_FILE = {
  flag: '--file',
  kind: 'text',
  key: 'file',
  takes: '--file takes the file whose words to write, or - to read them from stdin: nemia agents custom <name> --file <path>',
  twice: customTwice('--file'),
  only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
} as const satisfies Flag;

/** `--repo <r>`: the repository whose agents a name is looked for in. */
const CUSTOM_REPO = {
  flag: '--repo',
  kind: 'text',
  key: 'repo',
  takes: '--repo takes the repository whose agents to look in: nemia agents custom <name> --repo <r>',
  twice: customTwice('--repo'),
  only: { side: 'cli', why: 'the api looks in the repository the request is served on (?repo=)' },
} as const satisfies Flag;

/** `nemia agents custom`'s spec: the agent's name, then `--file`, `--clear` or `--repo`. */
const CUSTOM_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [CUSTOM_FILE, CUSTOM_REPO, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) =>
    `${CLI} agents custom takes one agent's name, then --file <path> (or --file - for stdin), --clear or --repo <r>, not ${arg}.`,
  apart: (_value, flag) => (flag === '--repo' ? CUSTOM_REPO.takes : CUSTOM_FILE.takes),
};

/** `nemia agents custom`: a person's custom instructions for one agent, read bare, written from `--file`, removed with `--clear`. */
export const AGENTS_CUSTOM_WORDS = {
  name: 'agents custom',
  served: [
    { endpoint: 'agents.instructions' },
    { endpoint: 'agents.putInstructions', as: 'agents_custom_put' },
    { endpoint: 'agents.deleteInstructions', as: 'agents_custom_delete' },
    { endpoint: 'nemia.instructions', as: 'nemia_instructions' },
    { endpoint: 'nemia.writeInstructions', as: 'nemia_instructions_put' },
    { endpoint: 'nemia.clearInstructions', as: 'nemia_instructions_delete' },
  ],
  usage: '<name> [--file <path>|-] [--clear] [--repo .]',
  help: [
    'your custom instructions for that agent: words you add to it without',
    'rewriting it, kept in <store>/custom-instructions/<name>.md and told',
    'after its instructions. Bare, prints them; --file writes them (- for',
    'stdin); --clear removes them. Words only: a frontmatter block is',
    'refused. A run keeps the words it was started with; nemia, the',
    "store's own agent, is told them in her open session",
  ],
  spec: CUSTOM_SPEC,
  check: (args) =>
    args.clear === true && args.file !== undefined
      ? `${CLI} agents custom takes --file or --clear, not both: --file writes the words, --clear removes them.`
      : leftOut(CUSTOM_SPEC, args),
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--file', '--clear'], readsBy: ['--repo'] },
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `instructions`, `putInstructions` and `deleteInstructions` verbs of `objects`' Api (`/api/namespaces/:namespace/agents/:name/instructions`) and Nemia's at `/api/nemia/instructions`, each calling this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

const COPY_USAGE = '<file> [--as <name>] [--keep <part>]...';

/** `nemia agents copy`: an agent file copied into your library, with its schema and skills. */
export const AGENTS_COPY_WORDS = {
  name: 'agents copy',
  served: [{ endpoint: 'agents.copy' }],
  usage: COPY_USAGE,
  help: [
    'an agent file copied into your library, with its schema and skills;',
    'a part your library holds otherwise stops it: --as or --keep',
  ],
  spec: writerSpec(
    'agents copy',
    COPY_USAGE,
    [{ key: 'file', takes: 'required', kind: 'text' }],
    [
      {
        flag: '--as',
        kind: 'name',
        key: 'as',
        takes: '--as takes the name the agent has in your library: nemia agents copy <file> --as <name>',
      },
      {
        flag: '--keep',
        kind: 'name',
        key: 'keep',
        many: true,
        takes: "--keep takes a skill or a schema of the copy whose library's version stays: nemia agents copy <file> --keep <part>",
      },
    ],
  ),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `copy` verb of `objects`' Api (`/api/namespaces/:namespace/agents/copy`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The place an agent is named on, and its name. */
const PLACE_AND_NAME: readonly Positional[] = [
  { key: 'from', takes: 'required', kind: 'name' },
  { key: 'name', takes: 'required', kind: 'name' },
];

/** `nemia agents rm yours <name> --version <v>`: an agent of yours removed, at the version it was read at. */
export const AGENTS_RM_WORDS = {
  name: 'agents rm',
  served: [{ endpoint: 'agents.delete' }],
  usage: 'yours <name> --version <v>',
  help: ['an agent of yours removed, at the --version it was read at'],
  spec: writerSpec('agents rm', 'yours <name> --version <v>', PLACE_AND_NAME, [versionFlag('agents rm', 'the agent')]),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `delete` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** What a try of an agent is capped at, in dollars: the orchestrator's `TRY_BUDGET`, which a try's run is started with. */
const TRY_CAP = 1;

/** `nemia agents run yours <name> --brief <words>`: an agent of yours tried on a short brief, in a folder of its own. */
export const AGENTS_RUN_WORDS = {
  name: 'agents run',
  served: [{ endpoint: 'agents.try' }],
  usage: 'yours <name> --brief <words>',
  help: ['an agent of yours tried on a short brief, in a folder of its own,', `capped at $${TRY_CAP}`],
  spec: writerSpec('agents run', 'yours <name> --brief <words>', PLACE_AND_NAME, [
    {
      flag: '--brief',
      kind: 'text',
      key: 'brief',
      takes: '--brief takes what the agent is asked to do, a sentence is enough: nemia agents run yours <name> --brief "<words>"',
      twice: `${CLI} agents run takes --brief once: a try is one brief.`,
    },
  ]),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `try` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
  ticks: true,
} as const satisfies CommandWords;
