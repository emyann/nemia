/**
 * The words of `nemia library`: the store's library read (`library`, each kind's list in no namespace), and what a factory adds from it
 * (`library add`, `library rm`), each add a LibraryAdd of the factory's namespace, `<kind>.<name>`.
 */
import { LIBRARY_KINDS } from './words.ts';
import type { Args, CommandWords, Flag, Spec } from './command.ts';

const CLI = 'nemia';

/** What `library add` and `library rm` take. */
const ADD_USAGE = `<${LIBRARY_KINDS.join('|')}> <name> --factory <factory>`;

/** The factory a library add or removal names, refused in the words of `verb` where it is left out. */
const factoryFlag = (verb: string) =>
  ({
    flag: '--factory',
    kind: 'name',
    key: 'factory',
    takes: `--factory takes the factory the item is added to: ${CLI} library ${verb} ${ADD_USAGE}`,
    twice: `${CLI} library ${verb} takes --factory once: one factory at a time.`,
  }) satisfies Flag;

/** The words a library add or removal parses, refused in the words of `verb`. */
const addSpec = (verb: string) =>
  ({
    positionals: [
      { key: 'kind', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'required', kind: 'name' },
    ],
    flags: [factoryFlag(verb)],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `${CLI} library ${verb} does not take ${arg}: ${CLI} library ${verb} ${ADD_USAGE}.`
        : `${CLI} library ${verb} takes one kind and one name, and ${arg} is one more: ${CLI} library ${verb} ${ADD_USAGE}, once per item.`,
    missing: `${CLI} library ${verb} takes the kind, then the name: ${CLI} library ${verb} ${ADD_USAGE}.`,
  }) satisfies Spec;

/** The refusal of an add or a removal with no factory, or a kind the library does not hold. */
const addCheck = (verb: string) => (args: Args) => {
  if (typeof args.factory !== 'string')
    return `${CLI} library ${verb} names the factory with --factory: ${CLI} library ${verb} ${ADD_USAGE}.`;
  return (LIBRARY_KINDS as readonly unknown[]).includes(args.kind)
    ? null
    : `${CLI} library ${verb} takes a kind the library holds, ${LIBRARY_KINDS.join(', ')}, not ${String(args.kind)}: ${CLI} library ${verb} ${ADD_USAGE}.`;
};

/**
 * `nemia library [skills|agents|mcpservers|workflows] [--factory <factory>]`: the store's library, the user library's beside the builtins;
 * with a factory, what that factory has added from it, each add with its state.
 */
export const LIBRARY_WORDS = {
  name: 'library',
  served: [
    { endpoint: 'skills.listLibrary' },
    { endpoint: 'agents.listLibrary', as: 'library_agents' },
    { endpoint: 'mcpservers.listLibrary', as: 'library_mcpservers' },
    { endpoint: 'workflows.listLibrary', as: 'library_workflows' },
    { endpoint: 'libraryadds.list', as: 'library_adds' },
  ],
  usage: '[skills|agents|mcpservers|workflows] [--factory <factory>]',
  help: [
    "the store's library: the user library's skills, agents, MCP servers and",
    'workflows beside the builtins, each with the factories that add it;',
    "--factory: that factory's adds, each with its state and the fix of a missing one",
  ],
  spec: {
    positionals: [{ key: 'kind', takes: 'optional', kind: 'name' }],
    flags: [
      {
        flag: '--factory',
        kind: 'name',
        key: 'factory',
        takes: `--factory takes the factory whose adds are listed: ${CLI} library --factory <factory>`,
        twice: `${CLI} library takes --factory once: one factory's adds at a time.`,
      },
    ],
    unknown: (arg) => `${CLI} library takes one kind, skills, agents, mcpservers or workflows, not ${arg}: ${CLI} library [<kind>].`,
  },
  check: (args) => {
    if (args.kind !== undefined && typeof args.factory === 'string')
      return `${CLI} library --factory lists every add of the factory, of each kind: ${CLI} library --factory <factory>, with no kind.`;
    return args.kind === undefined || ['skills', 'agents', 'mcpservers', 'workflows'].includes(String(args.kind))
      ? null
      : `${CLI} library lists skills, agents, mcpservers or workflows, not ${String(args.kind)}: ${CLI} library [<kind>].`;
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves each kind's library list of `objects`' Api, which this command prints" },
} as const satisfies CommandWords;

/** `nemia library add <kind> <name> --factory <factory>`: a library item added to a factory, which resolves it from then on. */
export const LIBRARY_ADD_WORDS = {
  name: 'library add',
  served: [{ endpoint: 'libraryadds.put' }],
  usage: ADD_USAGE,
  help: ['add an item of the library to a factory, which resolves it from then on'],
  spec: addSpec('add'),
  check: addCheck('add'),
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the LibraryAdd's `put` of `objects`' Api" },
} as const satisfies CommandWords;

/** `nemia library rm <kind> <name> --factory <factory>`: a factory's add taken off, the item left in the library. */
export const LIBRARY_RM_WORDS = {
  name: 'library rm',
  served: [{ endpoint: 'libraryadds.delete' }],
  usage: ADD_USAGE,
  help: ['take an add off a factory: the item stays in the library'],
  spec: addSpec('rm'),
  check: addCheck('rm'),
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the LibraryAdd's `delete` of `objects`' Api" },
} as const satisfies CommandWords;

/** The library's commands. */
export const LIBRARY_WORDS_ALL = [LIBRARY_WORDS, LIBRARY_ADD_WORDS, LIBRARY_RM_WORDS] as const;
