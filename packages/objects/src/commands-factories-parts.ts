/**
 * The words of a factory's parts in its namespace, each its own object of the `Api`: an agent hired into a step and fired from it
 * (`nemia factory hire|fire`, the Hire), a workflow's runs scheduled and taken back (`nemia factory schedule|unschedule`, the Schedule),
 * and its MCP servers listed, recorded and taken off (`nemia factory servers`, `server add|rm`, the McpServer). Pure.
 */
import { type Args, type CommandWords, type Flag, type Spec } from './command.ts';
import { leftOut } from './commands-flags.ts';

/** The text under `key`, as the spec read it, or empty. */
const textOf = (args: Args, key: string): string => {
  const value = args[key];
  return typeof value === 'string' ? value : '';
};

/** `nemia factory hire`'s and `fire`'s spec: `shape`, their positional arguments, then `--step <workflow>/<step>` once. */
function stepSpec(verb: 'hire' | 'fire', shape: string, missing: string): Spec {
  const step = {
    flag: '--step',
    kind: 'text',
    key: 'step',
    takes: `--step takes the step, as <workflow>/<step>: nemia factory ${verb} ${shape} --step build/implement`,
    twice: `nemia factory ${verb} takes --step once: one step at a time.`,
  } satisfies Flag;
  return {
    positionals: shape.split(' ').map((p) => ({ key: p.slice(1, -1), takes: 'required', kind: 'name' })),
    flags: [step],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory ${verb} does not take ${arg}. It takes ${shape}, then --step <workflow>/<step>.`
        : `nemia factory ${verb} takes ${shape}, and ${arg} is one more: nemia factory ${verb} ${shape} --step <workflow>/<step>, once per step.`,
    apart: () => step.takes,
    missing,
  };
}

/** The refusal of `nemia factory hire` or `fire` given no step, or a step's value left out. */
const stepCheck =
  (verb: 'hire' | 'fire', shape: string, spec: Spec) =>
  (args: Args): string | null =>
    args.step === undefined
      ? `nemia factory ${verb} names the step with --step: nemia factory ${verb} ${shape} --step <workflow>/<step>. Nothing was ${verb}d.`
      : leftOut(spec, args);

const HIRE_SPEC = stepSpec(
  'hire',
  '<factory> <agent>',
  'nemia factory hire takes the factory, then the agent: nemia factory hire <factory> <agent> --step <workflow>/<step>. Nothing was hired.',
);

/** `nemia factory hire`: one agent hired into one step. */
export const FACTORY_HIRE_WORDS = {
  name: 'factory hire',
  served: [{ endpoint: 'hires.put' }],
  usage: '<factory> <agent> --step <workflow>/<step>',
  help: ["hire an agent into a workflow's step: one a step, a second replaces it"],
  spec: HIRE_SPEC,
  check: stepCheck('hire', '<factory> <agent>', HIRE_SPEC),
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the Hire's `put` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

const FIRE_SPEC = stepSpec(
  'fire',
  '<factory>',
  'nemia factory fire takes the factory first: nemia factory fire <factory> --step <workflow>/<step>. Nothing was fired.',
);

/** `nemia factory fire`: one step's hire taken back. */
export const FACTORY_FIRE_WORDS = {
  name: 'factory fire',
  served: [{ endpoint: 'hires.delete' }],
  usage: '<factory> --step <workflow>/<step>',
  help: ["take a step's hire back"],
  spec: FIRE_SPEC,
  check: stepCheck('fire', '<factory>', FIRE_SPEC),
  writes: true,
  class: 'ask',
  only: { side: 'cli', why: "the api serves it as the Hire's `delete` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** A value flag of `nemia factory schedule`, named in its refusals as `takes` says. */
const scheduleFlag = (flag: string, key: string, takes: string): Flag => ({
  flag,
  kind: 'text',
  key,
  takes: `${flag} takes ${takes}: nemia factory schedule <factory> <workflow> --cron "0 9 * * 1" --brief "Read the stats"`,
  twice: `nemia factory schedule takes ${flag} once: a workflow has one schedule in a factory.`,
});

const SCHEDULE_USAGE = '<factory> <workflow> --cron <expr> --brief <text> [--repo <path>] [--tz <zone>]';

const SCHEDULE_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'workflow', takes: 'required', kind: 'name' },
  ],
  flags: [
    scheduleFlag('--cron', 'cron', 'a cron expression of five or six fields'),
    scheduleFlag('--brief', 'brief', 'what each run is asked'),
    scheduleFlag('--repo', 'repo', "one of the factory's repositories"),
    scheduleFlag('--tz', 'tz', 'an IANA time zone, such as America/Montreal'),
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory schedule does not take ${arg}: nemia factory schedule ${SCHEDULE_USAGE}.`
      : `nemia factory schedule takes one workflow, and ${arg} is a second: nemia factory schedule ${SCHEDULE_USAGE}, once per workflow.`,
  apart: (_value, flag) => `${flag} is given no value: nemia factory schedule ${SCHEDULE_USAGE}.`,
  missing: `nemia factory schedule takes the factory, then the workflow, by its folder's name: nemia factory schedule ${SCHEDULE_USAGE}. Nothing was scheduled.`,
};

/** Why `nemia factory schedule`'s arguments are refused before anything is read: a `--cron` or a `--brief` left out, or a value empty. */
function scheduleCheck(args: Args): string | null {
  for (const key of ['cron', 'brief'])
    if (!textOf(args, key))
      return `nemia factory schedule takes --${key}: nemia factory schedule ${SCHEDULE_USAGE}. Nothing was scheduled.`;
  return leftOut(SCHEDULE_SPEC, args);
}

/** `nemia factory schedule`: a workflow the factory has attached, started by the daemon at each fire of its cron. */
export const FACTORY_SCHEDULE_WORDS = {
  name: 'factory schedule',
  served: [{ endpoint: 'schedules.put' }],
  usage: SCHEDULE_USAGE,
  help: ['start a run of an attached workflow at each fire of a cron, by the', 'daemon, at every level; a second replaces the first'],
  spec: SCHEDULE_SPEC,
  check: scheduleCheck,
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Schedule's `put`, whose handler calls this one by its `input`",
  },
} as const satisfies CommandWords;

const UNSCHEDULE_USAGE = '<factory> <workflow>';

/** `nemia factory unschedule`: a workflow's schedule taken back. */
export const FACTORY_UNSCHEDULE_WORDS = {
  name: 'factory unschedule',
  served: [{ endpoint: 'schedules.delete' }],
  usage: UNSCHEDULE_USAGE,
  help: ["take a workflow's schedule back: the daemon starts it no more"],
  spec: {
    positionals: SCHEDULE_SPEC.positionals,
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory unschedule does not take ${arg}: nemia factory unschedule ${UNSCHEDULE_USAGE}.`
        : `nemia factory unschedule takes one workflow, and ${arg} is a second: nemia factory unschedule ${UNSCHEDULE_USAGE}, once per workflow.`,
    missing: `nemia factory unschedule takes the factory, then the workflow: nemia factory unschedule ${UNSCHEDULE_USAGE}. Nothing was unscheduled.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the Schedule's `delete`, whose handler calls this one by its `input`",
  },
} as const satisfies CommandWords;

const SERVERS_USAGE = '<factory>';

/** `nemia factory servers`: a factory's recorded MCP servers, each with its state as its harness reports it now. */
export const FACTORY_SERVERS_WORDS = {
  name: 'factory servers',
  served: [{ endpoint: 'mcpservers.list' }],
  usage: SERVERS_USAGE,
  help: ["a factory's own MCP servers, each with the state its harness reports"],
  spec: {
    positionals: [{ key: 'factory', takes: 'required', kind: 'name' }],
    flags: [],
    unknown: (arg) =>
      `nemia factory servers lists one factory's servers, and ${arg} is a second: nemia factory servers ${SERVERS_USAGE}, once per factory.`,
    missing: `nemia factory servers takes the factory, as nemia factory ls lists it: nemia factory servers ${SERVERS_USAGE}.`,
  },
  writes: false,
  class: 'read',
  only: { side: 'cli', why: "the api serves it as the McpServer's `list` of `objects`' Api, calling this handler" },
} as const satisfies CommandWords;

/** A value flag of `server add`. */
const serverFlag = (flag: string, key: string, takes: string, many?: true): Flag => ({
  flag,
  kind: 'text',
  key,
  takes,
  ...(many ? { many: true } : { twice: `${flag} is given twice, and takes one value: give it once.` }),
});

const SERVER_ADD_USAGE =
  '<factory> <server> --url <address> [--transport http|sse] [--header <name>=<value> ...] [--client-id <id>] [--callback-port <port>]';

const SERVER_ADD_SPEC: Spec = {
  positionals: [
    { key: 'factory', takes: 'required', kind: 'name' },
    { key: 'server', takes: 'required', kind: 'name' },
  ],
  flags: [
    serverFlag('--url', 'url', 'the address the server is reached at'),
    serverFlag('--transport', 'transport', 'http or sse'),
    serverFlag('--header', 'header', 'one <name>=<value>, given once per header', true),
    serverFlag('--client-id', 'clientId', "the OAuth app's client id, for a server that signs in"),
    serverFlag('--callback-port', 'callbackPort', "the port the OAuth app's callback is registered on"),
  ],
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia factory server add does not take ${arg}: nemia factory server add ${SERVER_ADD_USAGE}.`
      : `nemia factory server add takes one server, and ${arg} is a second: nemia factory server add ${SERVER_ADD_USAGE}, once per server.`,
  apart: (_value, flag) => `${flag} is given no value: nemia factory server add ${SERVER_ADD_USAGE}.`,
  missing: `nemia factory server add takes the factory, then the server's name: nemia factory server add ${SERVER_ADD_USAGE}. Nothing was recorded.`,
};

/** `nemia factory server add`: one remote MCP server recorded for a factory, a second of one name replacing the first. */
export const FACTORY_SERVER_ADD_WORDS = {
  name: 'factory server add',
  served: [{ endpoint: 'mcpservers.put' }],
  usage: SERVER_ADD_USAGE,
  help: ["record a remote MCP server for a factory: its steps' sessions are", 'handed it, and an agent `mcp:` line names it'],
  spec: SERVER_ADD_SPEC,
  check: (args) =>
    textOf(args, 'url')
      ? leftOut(SERVER_ADD_SPEC, args)
      : `nemia factory server add takes --url: nemia factory server add ${SERVER_ADD_USAGE}. Nothing was recorded.`,
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the McpServer's `put`, whose handler calls this one by its `input`; the command line's runner maps its flags to it",
  },
} as const satisfies CommandWords;

const SERVER_RM_USAGE = '<factory> <server>';

/** `nemia factory server rm`: one server taken off a factory's record. */
export const FACTORY_SERVER_RM_WORDS = {
  name: 'factory server rm',
  served: [{ endpoint: 'mcpservers.delete' }],
  usage: SERVER_RM_USAGE,
  help: ["take a server off a factory's record"],
  spec: {
    positionals: SERVER_ADD_SPEC.positionals,
    flags: [],
    unknown: (arg) =>
      arg.startsWith('-')
        ? `nemia factory server rm does not take ${arg}: nemia factory server rm ${SERVER_RM_USAGE}.`
        : `nemia factory server rm takes one server, and ${arg} is a second: nemia factory server rm ${SERVER_RM_USAGE}, once per server.`,
    missing: `nemia factory server rm takes the factory, then the server: nemia factory server rm ${SERVER_RM_USAGE}. Nothing was removed.`,
    flagFirst: true,
  },
  writes: true,
  class: 'ask',
  only: {
    side: 'cli',
    why: "the command line's alone in the table, which routes none of it: `objects`' Api declares the McpServer's `delete`, whose handler calls this one by its `input`",
  },
} as const satisfies CommandWords;
