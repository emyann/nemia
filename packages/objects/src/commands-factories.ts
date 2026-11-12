/**
 * The words of the factories' verbs: every `nemia factory …`. This file holds the factory's own — listed, filed, given workflows and
 * relieved of them, its revisions policy, its places trusted again and its removal — and lists the group in help order, its other verbs
 * cut by concept into the files beside it (`commands-factories-<concept>.ts`). Pure.
 */
import { type Args, type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';
import { FACTORY_MANUAL } from './commands-factories-manual.ts';
import {
  FACTORY_FIRE_WORDS,
  FACTORY_HIRE_WORDS,
  FACTORY_SCHEDULE_WORDS,
  FACTORY_SERVER_ADD_WORDS,
  FACTORY_SERVER_RM_WORDS,
  FACTORY_SERVERS_WORDS,
  FACTORY_UNSCHEDULE_WORDS,
} from './commands-factories-parts.ts';
import {
  FACTORY_COST_LINE_RM_WORDS,
  FACTORY_COST_LINE_SET_WORDS,
  FACTORY_SETTING_RM_WORDS,
  FACTORY_SETTING_SET_WORDS,
  FACTORY_VOLUME_ADD_WORDS,
  FACTORY_VOLUME_RM_WORDS,
} from './commands-factories-settings.ts';
import {
  APPLY_USAGE,
  FACTORY_ADOPT_WORDS,
  FACTORY_APPLY_WORDS,
  FACTORY_DIFF_WORDS,
  FACTORY_RESOLVE_WORDS,
  FACTORY_UPGRADE_WORDS,
  NO_TRUST,
} from './commands-factories-templated.ts';
import { FACTORY_INSTRUCT_WORDS, FACTORY_INSTRUCTION_WORDS, FACTORY_RULES_WORDS } from './commands-factories-words.ts';
import { REVISIONS_POLICIES } from './words.ts';

/** `nemia factory`: the default factory, then each in the store; a word it does not take is refused naming its forms. */
export const FACTORY_LIST_WORDS = {
  name: 'factory',
  served: [{ endpoint: 'factories.listAll' }],
  usage: '',
  help: [
    "the store's factories: the default first — every run and card that",
    'names no factory, read, never written — then each by name with its',
    'repositories (nemia factory --help)',
  ],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) =>
      `nemia factory does not take ${arg}. It lists the factories — nemia factory ls — files one with nemia factory add <name> --repo <path>, takes a hand-made one over by a template with nemia factory diff <name> --template <folder|archive>, then nemia factory adopt, trusts its places again with nemia factory trust <name>, attaches a workflow with nemia factory attach <factory> <workflow>, detaches it with nemia factory detach <factory> <workflow>, hires an agent into a step with nemia factory hire <factory> <agent> --step <workflow>/<step>, fires it with nemia factory fire <factory> --step <workflow>/<step>, schedules a workflow's runs with nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>, takes the schedule back with nemia factory unschedule <factory> <workflow>, writes the rules its agents are told with nemia factory rules <name> --file <path>, says where Nemia's instruction for it is kept with nemia factory instruction <name>, writes it with nemia factory instruct <name> --file <path>, mounts a folder for its runs with nemia factory volume add <factory> <path>:ro|:rw, gives its runs' sessions a harness setting with nemia factory setting set <factory> <harness>.<key> <json>, sets a workflow's cost line with nemia factory cost-line set <factory> <workflow> <usd>, and removes one with nemia factory rm <name> (nemia factory --help).`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the Factory's `listAll` of `objects`' Api, calling this handler" },
  manual: FACTORY_MANUAL,
} as const satisfies CommandWords;

/** `nemia factory ls`: the same listing, by its name. */
export const FACTORY_LS_WORDS = {
  name: 'factory ls',
  served: [{ endpoint: 'factories.listAll' }],
  usage: '',
  help: ['the same, by its name'],
  spec: {
    positionals: [],
    flags: [],
    unknown: (arg) => `nemia factory ls takes nothing, and was given ${arg}: nemia factory ls lists every factory.`,
  },
  writes: false,
  class: 'read',
  only: {
    side: 'cli',
    why: "the api serves it as the Factory's `listAll` of `objects`' Api, calling this handler: ls is the command line's second name for it",
  },
} as const satisfies CommandWords;

/** `--repo <path>`, once per repository a factory is filed with. */
const REPOS = {
  flag: '--repo',
  kind: 'text',
  key: 'repos',
  many: true,
  takes: "--repo takes a repository's directory or its git URL: nemia factory add <name> --repo <path|url> [--repo <path|url> ...]",
} satisfies Flag;

/** `nemia factory add`'s spec: the factory's name, then `--repo` once per repository, and `--no-trust`. */
const ADD_SPEC: Spec = {
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [REPOS, NO_TRUST],
  unknown: (arg) =>
    arg === '--template' || arg.startsWith('--template=')
      ? `nemia factory add files a factory by hand and does not take --template: a factory made from a template is filed by nemia factory apply ${APPLY_USAGE}.`
      : arg.startsWith('-')
        ? `nemia factory add does not take ${arg}. It takes the factory's name, then --repo <path|url>, once per repository, and --no-trust.`
        : `nemia factory add files one factory, and ${arg} is a second: nemia factory add <name> --repo <path|url>, once per factory.`,
  apart: () => REPOS.takes,
  missing:
    "nemia factory add takes the factory's name, first: nemia factory add <name> --repo <path|url> [--repo <path|url> ...]. Nothing was filed.",
};

/** `nemia factory add`: one factory filed; then, unless `--no-trust`, each of its places trusted for the harnesses that keep a trust. */
export const FACTORY_ADD_WORDS = {
  name: 'factory add',
  served: [{ endpoint: 'factories.create' }],
  usage: '<name> --repo <path|url> [--repo <path|url> ...] [--no-trust]',
  help: [
    'file a factory: a lowercase slug naming one or more directories or git URLs,',
    'each URL cloned, each trusted for its steps unless --no-trust',
  ],
  spec: ADD_SPEC,
  check: (args) => leftOut(ADD_SPEC, args),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Factory's `create` of `objects`' Api, calling this handler: its places are directories of the machine the store runs on, which it names and checks, or git URLs that machine clones",
  },
} as const satisfies CommandWords;

/** `nemia factory attach`'s `--repo <name>`: the folder name of the factory's repository the workflow's runs work on. */
const WORKS_ON = {
  flag: '--repo',
  kind: 'text',
  key: 'repo',
  takes:
    "--repo takes the folder name of one of the factory's repositories, the one the workflow's runs work on: nemia factory attach <factory> <workflow> --repo <name>",
  twice: 'nemia factory attach takes --repo once: a workflow works on one repository.',
} satisfies Flag;

/**
 * `nemia factory attach`'s and `detach`'s spec: the factory, then the workflow; an attach takes `--repo <name>` besides, a detach no
 * flag, an unknown one refused wherever it stands.
 */
const workflowSpec = (verb: 'attach' | 'detach'): Spec => ({
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
  ],
  flags: verb === 'attach' ? [WORKS_ON] : [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory ${verb} does not take ${arg}. It takes the factory, then the workflow: nemia factory ${verb} <factory> <workflow>${verb === 'attach' ? ' [--repo <name>]' : ''}.`
      : `nemia factory ${verb} takes one workflow, and ${arg} is a second: nemia factory ${verb} <factory> <workflow>, once per workflow.`,
  missing: `nemia factory ${verb} takes the factory, then the workflow, by its folder's name: nemia factory ${verb} <factory> <workflow>. Nothing was ${verb}ed.`,
  flagFirst: true,
});

/** `nemia factory attach`: one workflow attached to one factory, or said to be attached already. */
export const FACTORY_ATTACH_WORDS = {
  name: 'factory attach',
  served: [{ endpoint: 'factories.attach' }],
  usage: '<factory> <workflow> [--repo <name>]',
  help: [
    "offer a workflow in a factory, by its folder's name: a factory offers",
    'only the workflows attached to it; --repo names the repository its runs',
    'work on, by folder name, required where the factory has several',
  ],
  spec: workflowSpec('attach'),
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory detach`: one workflow taken from one factory. */
export const FACTORY_DETACH_WORDS = {
  name: 'factory detach',
  served: [{ endpoint: 'factories.detach' }],
  usage: '<factory> <workflow>',
  help: ['take a workflow back, once no hire fills its steps'],
  spec: workflowSpec('detach'),
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory revisions`'s spec: the factory, then the policy, and no flag. */
const REVISIONS_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'revisions', takes: 'required', kind: 'name' },
  ],
  flags: [],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory revisions does not take ${arg}. It takes the factory, then follow or pinned: nemia factory revisions <name> follow|pinned.`
      : `nemia factory revisions takes one policy, and ${arg} is one more: nemia factory revisions <name> follow|pinned.`,
  missing:
    'nemia factory revisions takes the factory, then follow or pinned: nemia factory revisions <name> follow|pinned. Nothing was changed.',
  flagFirst: true,
};

/** Whether `nemia factory revisions` was given one of the two policies. */
const isPolicy = (args: Args): boolean => REVISIONS_POLICIES.some((p) => p === args.revisions);

/** `nemia factory revisions`: whether a factory's runs follow merged revisions, written. */
export const FACTORY_REVISIONS_WORDS = {
  name: 'factory revisions',
  served: [{ endpoint: 'factories.setRevisions' }],
  usage: '<name> follow|pinned',
  help: [
    "whether a factory's runs follow merged revisions at each filing (follow)",
    'or keep them until nemia refresh (pinned, the default)',
  ],
  spec: REVISIONS_SPEC,
  check: (args) =>
    args.revisions === undefined || isPolicy(args)
      ? leftOut(REVISIONS_SPEC, args)
      : `nemia factory revisions takes follow or pinned, and was given ${String(args.revisions)}: nemia factory revisions <name> follow|pinned. Nothing was changed.`,
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory trust`: the trust of one factory's places asked again, where the store runs. */
export const FACTORY_TRUST_WORDS = {
  name: 'factory trust',
  served: [{ endpoint: 'factories.trust' }],
  usage: '<name>',
  help: ["trust a factory's places for the harnesses its steps run on, so each", "place's own settings apply to them"],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) =>
      `nemia factory trust trusts one factory's places, and ${arg} is a second: nemia factory trust <name>, once per factory.`,
    missing: 'nemia factory trust takes the name of the factory, as nemia factory ls lists it: nemia factory trust <name>.',
  },
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** `nemia factory rm`: one factory's file removed, then the instruction and the rules the store keeps for it. */
export const FACTORY_RM_WORDS = {
  name: 'factory rm',
  served: [{ endpoint: 'factories.delete' }],
  usage: '<name>',
  help: ["remove a factory's file, and the instruction and the rules the store", 'keeps for it'],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) => `nemia factory rm removes one factory, and ${arg} is a second: nemia factory rm <name>, once per factory.`,
    missing: 'nemia factory rm takes the name of the factory to remove, as nemia factory ls lists it: nemia factory rm <name>.',
  },
  writes: true,
  class: 'ask',
} as const satisfies CommandWords;

/** The group's words, in the order the help lists them. */
export const FACTORY_WORDS = [
  FACTORY_LIST_WORDS,
  FACTORY_LS_WORDS,
  FACTORY_ADD_WORDS,
  FACTORY_APPLY_WORDS,
  FACTORY_ADOPT_WORDS,
  FACTORY_DIFF_WORDS,
  FACTORY_UPGRADE_WORDS,
  FACTORY_RESOLVE_WORDS,
  FACTORY_ATTACH_WORDS,
  FACTORY_DETACH_WORDS,
  FACTORY_HIRE_WORDS,
  FACTORY_FIRE_WORDS,
  FACTORY_SCHEDULE_WORDS,
  FACTORY_UNSCHEDULE_WORDS,
  FACTORY_SERVERS_WORDS,
  FACTORY_SERVER_ADD_WORDS,
  FACTORY_SERVER_RM_WORDS,
  FACTORY_VOLUME_ADD_WORDS,
  FACTORY_VOLUME_RM_WORDS,
  FACTORY_SETTING_SET_WORDS,
  FACTORY_SETTING_RM_WORDS,
  FACTORY_COST_LINE_SET_WORDS,
  FACTORY_COST_LINE_RM_WORDS,
  FACTORY_RULES_WORDS,
  FACTORY_INSTRUCTION_WORDS,
  FACTORY_INSTRUCT_WORDS,
  FACTORY_REVISIONS_WORDS,
  FACTORY_TRUST_WORDS,
  FACTORY_RM_WORDS,
] as const satisfies readonly CommandWords[];
