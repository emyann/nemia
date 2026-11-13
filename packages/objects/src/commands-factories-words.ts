/**
 * The words of what a factory says in words, each read bare and written from a file the client reads where it is typed: its rules, told
 * to every agent hired into it (`nemia factory rules`), where its instruction is kept (`nemia factory instruction`), and the text the store
 * keeps for it (`nemia factory instruct`). Pure.
 */
import { type Args, type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** `--file <path>`, or `-` for stdin, of `command`: the words to write, read by the command line's runner. */
const fileFlag = (command: 'rules' | 'instruct', twice: string): Flag => ({
  flag: '--file',
  kind: 'text',
  key: 'file',
  takes: `--file takes the file whose words to write, or - to read them from stdin: nemia factory ${command} <name> --file <path>`,
  twice: `nemia factory ${command} takes --file once: ${twice}`,
  only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
});

const RULES_FILE = fileFlag('rules', 'a factory keeps one file of rules.');

/** `nemia factory rules`'s spec: the factory's name, then `--file` or `--clear`. */
const RULES_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [RULES_FILE, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) => `nemia factory rules takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not ${arg}.`,
  apart: () => RULES_FILE.takes ?? '',
  missing: "nemia factory rules takes the factory's name: nemia factory rules <name> [--file <path>|- | --clear].",
};

/** `nemia factory rules`: a factory's rules — read bare, written from `--file`, removed with `--clear`. */
export const FACTORY_RULES_WORDS = {
  name: 'factory rules',
  served: [
    { endpoint: 'factories.rules' },
    { endpoint: 'factories.putRules', as: 'factory_rules_put' },
    { endpoint: 'factories.deleteRules', as: 'factory_rules_delete' },
  ],
  usage: '<name> [--file <path>|- | --clear]',
  help: [
    "a factory's rules and policies: words told to every agent hired into",
    "it, after its custom instructions and before the step's own note,",
    'kept by the store with the factory. Bare, prints them; --file writes',
    'them (- for stdin); --clear removes them. Words only: a frontmatter',
    'block is refused. A run keeps the rules it was started with',
  ],
  spec: RULES_SPEC,
  check: (args) =>
    args.clear === true && args.file !== undefined
      ? 'nemia factory rules takes --file or --clear, not both: --file writes the rules, --clear removes them.'
      : leftOut(RULES_SPEC, args),
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--file', '--clear'] },
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `rules`, `putRules` and `deleteRules`, whose handlers call this one by its `input`",
  },
} as const satisfies CommandWords;

/** `--path <p>`: the file in the factory's first folder its instruction is read from. */
const PATH = {
  flag: '--path',
  kind: 'text',
  key: 'path',
  takes: "--path takes a file's path from the factory's first folder: nemia factory instruction <name> --path docs/NEMIA.md",
  twice: 'nemia factory instruction takes --path once: a factory reads one instruction.',
} satisfies Flag;

/** `nemia factory instruction`'s spec: the factory's name, then `--path`, `--store` or `--clear`. */
const INSTRUCTION_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [PATH, { flag: '--store', kind: 'switch', key: 'store' }, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) =>
    `nemia factory instruction takes one factory's name, then --path <path>, --store or --clear, not ${arg}: nemia factory instruction <name> [--path <path> | --store | --clear].`,
  apart: () => PATH.takes,
  missing: "nemia factory instruction takes the factory's name: nemia factory instruction <name> [--path <path> | --store | --clear].",
};

/**
 * Why `nemia factory instruction`'s arguments are refused before anything is read, or null: two of `--path`, `--store` and `--clear` given,
 * and a put the api routes (`clear` fixed false) that names neither a path nor the store.
 */
function instructionCheck(args: Args): string | null {
  const given = [textOf(args, 'path') !== undefined, args.store === true, args.clear === true].filter(Boolean).length;
  if (given > 1)
    return 'nemia factory instruction takes one of --path, --store and --clear: a factory keeps its instruction in one place. Nothing was changed.';
  if (args.clear === false && given === 0)
    return 'a factory\'s instruction is put in one place: `{ "path": "<path in its first folder>" }`, or `{ "store": true }`. Nothing was changed.';
  return leftOut(INSTRUCTION_SPEC, args);
}

/** `nemia factory instruction`: where a factory's instruction is kept — read bare, or set with `--path`, `--store` or `--clear`. */
export const FACTORY_INSTRUCTION_WORDS = {
  name: 'factory instruction',
  served: [
    { endpoint: 'factories.instruction' },
    { endpoint: 'factories.putInstruction', as: 'factory_instruction_put' },
    { endpoint: 'factories.deleteInstruction', as: 'factory_instruction_delete' },
  ],
  usage: '<name> [--path <path> | --store | --clear]',
  help: [
    "where a factory's instruction is kept, what Nemia is to know of the",
    'factory (its agents are told its rules: nemia factory rules): bare,',
    "prints it; --path reads it from a file in the factory's first folder,",
    '--store keeps it in the store, --clear reads NEMIA.md in the first',
    'folder again',
  ],
  spec: INSTRUCTION_SPEC,
  check: instructionCheck,
  writes: true,
  class: { bare: 'read', sets: 'ask', setsBy: ['--path', '--store', '--clear'] },
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `instruction`, `putInstruction` and `deleteInstruction`, whose handlers call this one by its `input`",
  },
} as const satisfies CommandWords;

const INSTRUCT_FILE = fileFlag('instruct', 'a factory keeps one instruction.');

/** `nemia factory instruct`'s spec: the factory's name, then `--file` or `--clear`. */
const INSTRUCT_SPEC: Spec = {
  positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
  flags: [INSTRUCT_FILE, { flag: '--clear', kind: 'switch', key: 'clear' }],
  unknown: (arg) => `nemia factory instruct takes one factory's name, then --file <path> (or --file - for stdin) or --clear, not ${arg}.`,
  apart: () => INSTRUCT_FILE.takes ?? '',
  missing: "nemia factory instruct takes the factory's name: nemia factory instruct <name> --file <path>|- or --clear.",
};

/** `nemia factory instruct`: the instruction the store keeps for a factory, written from `--file` or removed with `--clear`. */
export const FACTORY_INSTRUCT_WORDS = {
  name: 'factory instruct',
  served: [{ endpoint: 'factories.putInstructionWords' }, { endpoint: 'factories.deleteInstructionWords', as: 'factory_instruct_delete' }],
  usage: '<name> --file <path>|- | --clear',
  help: [
    'write the instruction the store keeps for a factory (- for stdin), what',
    'Nemia is to know of it and no step is told, or remove it with --clear',
  ],
  spec: INSTRUCT_SPEC,
  check: (args) => {
    if (args.clear === true && args.file !== undefined)
      return 'nemia factory instruct takes --file or --clear, not both: --file writes the instruction, --clear removes it.';
    if (args.clear === undefined && args.file === undefined && args.words === undefined)
      return 'nemia factory instruct writes the instruction from --file <path> (or --file - for stdin), or removes it with --clear.';
    return leftOut(INSTRUCT_SPEC, args);
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Factory's `putInstructionWords` and `deleteInstructionWords`, whose handlers call this one by its `input`",
  },
} as const satisfies CommandWords;
