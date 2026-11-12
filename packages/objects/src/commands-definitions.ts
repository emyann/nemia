/**
 * The words of the policies and the rest of the agents', skills' and workflows' verbs: `nemia policy …` here, `nemia workflows rm`, and the
 * agents' verbs in `commands-definitions-agents.ts`, which this file lists. Each check here is what can be judged of the words alone: a
 * name that is no agent's is the api's to refuse, which knows what an agent's name is. Pure.
 */
import { CLI, type Args, type CommandWords, type Spec } from './command.ts';
import {
  AGENTS_CARD_WORDS,
  AGENTS_COPY_WORDS,
  AGENTS_CUSTOM_WORDS,
  AGENTS_RM_WORDS,
  AGENTS_RUN_WORDS,
  AGENTS_SOURCES_WORDS,
  AGENTS_WORDS,
} from './commands-definitions-agents.ts';
import { FROM, versionFlag, writerSpec } from './commands-writers.ts';

/** The text `args` holds under `key`, or the empty text. */
const textIn = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/** The spec of a command taking an agent's name and nothing else. */
const agentSpec = (name: string): Spec => ({
  positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
  flags: [],
  unknown: (arg) => `${CLI} ${name} takes an agent's name, not ${arg}: ${CLI} ${name} <agent>.`,
});

/** The spec of a command taking an agent's name and a rule's id. */
const ruleSpec = (name: string): Spec => ({
  positionals: [
    { key: 'name', takes: 'required', kind: 'name' },
    { key: 'id', takes: 'required', kind: 'name' },
  ],
  flags: [],
  unknown: (arg) => `${CLI} ${name} takes an agent's name and a rule's id, not ${arg}: ${CLI} ${name} <agent> <id>.`,
});

/** `nemia policy <agent>`: an agent's rules for `auto`, the list in force beside its proposal and its custom instruction. */
export const POLICY_WORDS = {
  name: 'policy',
  served: [{ endpoint: 'nemia.policy' }],
  usage: '<agent>',
  help: [
    "the agent's rules at auto: the answers it may give unasked, in force once",
    'you confirm them, and what it proposed from your custom instruction,',
    'with the words the machinery cannot hold, kept as guidance',
  ],
  spec: agentSpec('policy'),
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the nemia group's `policy` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia policy propose <agent> --file <path>|-`: what the agent proposes from the custom instruction, its file read where it is typed. */
export const POLICY_PROPOSE_WORDS = {
  name: 'policy propose',
  served: [{ endpoint: 'nemia.propose' }],
  usage: '<agent> --file <path>|-',
  help: [
    "the agent's proposal: rules from your custom instruction, as JSON,",
    'with the words the machinery cannot hold kept as guidance; none is in',
    'force until you confirm it (nemia policy confirm)',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      {
        flag: '--file',
        kind: 'text',
        key: 'file',
        takes: '--file takes the file of the proposal, or - to read it from stdin: nemia policy propose <agent> --file <path>',
        only: { side: 'cli', why: 'the api is sent the words themselves, never a path to read' },
      },
    ],
    unknown: (arg) => `${CLI} policy propose takes an agent's name and --file <path> (or - for stdin), not ${arg}.`,
  },
  check: (args) =>
    typeof args.file === 'string' ? null : `${CLI} policy propose takes the proposal in --file <path>, or --file - for stdin.`,
  writes: true,
  class: 'act',
} as const satisfies CommandWords;

/** The refusal of a confirm with no words. */
const confirmWordless = (agent: string): string =>
  `${CLI} policy confirm takes the rule's words as you read them, so what is confirmed is what you read: --words '<words>', printed by ${CLI} policy ${agent}.`;

/** `nemia policy confirm <agent> <id> --words <words>`: a rule the agent proposed put in force as the person read it. */
export const POLICY_CONFIRM_WORDS = {
  name: 'policy confirm',
  served: [{ endpoint: 'nemia.confirmRule' }],
  usage: "<agent> <id> --words '<words>'",
  help: [
    'put in force a rule the agent proposed, or the default again, as its',
    'words read: from then on, at auto, the answer it names is given unasked',
    'where it holds. Refused once the rule reads otherwise. Your first confirm',
    'keeps the default beside it. Asked of you every time',
  ],
  spec: {
    ...ruleSpec('policy confirm'),
    flags: [
      {
        flag: '--words',
        kind: 'text',
        key: 'words',
        takes:
          "--words takes the rule's words as you read them in nemia policy <agent>: nemia policy confirm <agent> <id> --words '<words>'",
      },
    ],
    unknown: (arg) =>
      `${CLI} policy confirm takes an agent's name, a rule's id and --words '<words>', not ${arg}: ${CLI} policy confirm <agent> <id> --words '<words>'.`,
  },
  check: (args) => (textIn(args, 'words').trim() ? null : confirmWordless(textIn(args, 'name') || '<agent>')),
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: { side: 'cli', why: "the api serves it as the nemia group's `confirmRule` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** `nemia policy rm <agent> <id>`: a rule taken out of force, the default among them, the person's; asked of them every time. */
export const POLICY_RM_WORDS = {
  name: 'policy rm',
  served: [{ endpoint: 'nemia.dropRule' }],
  usage: '<agent> <id>',
  help: ['take a rule out of force, the default among them: what it allowed is', 'asked of you again. Asked of you every time'],
  spec: ruleSpec('policy rm'),
  writes: true,
  class: 'ask',
  asksAlways: true,
  only: { side: 'cli', why: "the api serves it as the nemia group's `dropRule` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** The usage the refusals of `nemia policy reach` end on. */
const REACH_FORM = `${CLI} policy reach <agent> (--factory <name> | --run <runId>)`;

/** `nemia policy reach <agent> (--factory <name> | --run <runId>)`: what an agent's rules can approve at a step's gate, and why not. */
export const POLICY_REACH_WORDS = {
  name: 'policy reach',
  served: [{ endpoint: 'nemia.reach' }],
  usage: '<agent> (--factory <name> | --run <runId>)',
  help: [
    "which steps at their gate the agent's rules in force could ever approve",
    'unasked, in a factory or a run: why each other rule cannot (a step approved',
    'before it runs has done nothing to recommend or check; one with no check',
    'never passed one), what keeps a rule from a run now, and the rules that would',
  ],
  spec: {
    positionals: [{ key: 'name', takes: 'required', kind: 'name' }],
    flags: [
      { flag: '--factory', kind: 'name', key: 'factory', takes: `--factory takes the factory whose steps are read: ${REACH_FORM}.` },
      { flag: '--run', kind: 'name', key: 'runId', takes: `--run takes the run whose steps are read: ${REACH_FORM}.` },
    ],
    unknown: (arg) => `${CLI} policy reach takes an agent's name and --factory or --run, not ${arg}: ${REACH_FORM}.`,
  },
  check: (args) =>
    (typeof args.factory === 'string') === (typeof args.runId === 'string')
      ? `${CLI} policy reach reads one factory or one run: give --factory <name> or --run <runId>, one of them: ${REACH_FORM}.`
      : null,
  writes: false,
  class: 'read',
} as const satisfies CommandWords;

/** `nemia workflows rm yours <name> --version <v>`: a workflow folder of yours removed, at the version it was read at. */
export const WORKFLOWS_RM_WORDS = {
  name: 'workflows rm',
  served: [{ endpoint: 'workflows.delete' }],
  usage: 'yours <name> --version <v>',
  help: ['a workflow folder of yours removed, at the --version it was read at'],
  spec: writerSpec(
    'workflows rm',
    'yours <name> --version <v>',
    [FROM, { key: 'name', takes: 'required', kind: 'name' }],
    [versionFlag('workflows rm', 'the folder')],
  ),
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Workflow's `delete` verb of `objects`' Api (`/api/namespaces/:namespace/workflows`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The group's words, in the order the help lists them. */
export const DEFINITION_WORDS = [
  AGENTS_WORDS,
  AGENTS_CARD_WORDS,
  AGENTS_SOURCES_WORDS,
  AGENTS_CUSTOM_WORDS,
  AGENTS_COPY_WORDS,
  AGENTS_RM_WORDS,
  AGENTS_RUN_WORDS,
  POLICY_WORDS,
  POLICY_PROPOSE_WORDS,
  POLICY_CONFIRM_WORDS,
  POLICY_RM_WORDS,
  POLICY_REACH_WORDS,
  WORKFLOWS_RM_WORDS,
] as const satisfies readonly CommandWords[];
