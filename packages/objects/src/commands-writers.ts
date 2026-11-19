/**
 * The words of the three writers the client holds (`workflows write`, `agents write`, `skills write`), and what a writer's spec is built
 * of: the place it is named on, `--factory`, `--version`, and a path the command line alone takes. Pure.
 */
import { CLI, type CommandWords, type Flag, type Positional, type Spec } from './command.ts';

/**
 * The place a writer is named on (`<from>`), required: `user`, the person's library, the one it writes, or `factory`, a templated
 * factory's tree.
 */
export const FROM: Positional = { key: 'from', takes: 'required', kind: 'name' };

/**
 * `--factory`, the factory made from a template whose tree a writer named on `factory` writes into: taken on both sides, once.
 * @param command The writer's command name, as the flag's refusals say it.
 */
export const factoryFlag = (command: string) =>
  ({
    flag: '--factory',
    kind: 'text',
    key: 'factory',
    takes: `--factory takes the name of a factory made from a template, whose tree is written: ${CLI} ${command} factory … --factory <name>`,
    twice: `${CLI} ${command} takes --factory once: one tree is written.`,
  }) satisfies Flag;

/**
 * `--version`, the version `what` was read at, which a refusal of a write without it names: taken on both sides, once.
 * @param command The writer's command name, as the flag's refusals say it.
 * @param what What the version is of, as its refusal says it.
 */
export const versionFlag = (command: string, what: string) =>
  ({
    flag: '--version',
    kind: 'text',
    key: 'version',
    takes: `--version takes the version ${what} was read at, which a write without it names: ${CLI} ${command} … --version <version>`,
    twice: `${CLI} ${command} takes --version once: one write is checked against one version.`,
  }) satisfies Flag;

/**
 * A text flag the command line alone takes, under `key`, once: a path its runner reads, never sent to the api.
 * @param command The writer's command name, as the flag's refusals say it.
 * @param key The flag's key, and its spelling after --.
 * @param takes What the path names, as the refusal of a value left out says it.
 * @param why Why the api never takes it, said beside the flag.
 */
export const cliPath = (command: string, key: string, takes: string, why: string) =>
  ({
    flag: `--${key}`,
    kind: 'text',
    key,
    takes: `--${key} takes ${takes}: ${CLI} ${command} … --${key} <path>`,
    twice: `${CLI} ${command} takes --${key} once.`,
    only: { side: 'cli', why },
  }) satisfies Flag;

/**
 * The spec of a writer named `command`, used as `usage` says: its positionals and flags; any other argument refused in its words.
 * @param command The writer's command name, as a refusal says it.
 * @param usage The writer's usage after its name, which ends a refusal.
 * @param positionals The positionals the writer takes, in order.
 * @param flags The flags the writer takes.
 */
export const writerSpec = (command: string, usage: string, positionals: readonly Positional[], flags: readonly Flag[]) =>
  ({
    positionals,
    flags,
    unknown: (arg) => `${CLI} ${command} takes no ${arg}: ${CLI} ${command} ${usage}`,
  }) satisfies Spec;

const WORKFLOWS_WRITE_USAGE = '(user | factory) <name> --folder <draft> [--factory <name>] [--version <v>]';

/** `nemia workflows write`: a workflow folder of the person's library written from a draft folder, or proposed to a templated factory. */
export const WORKFLOWS_WRITE_WORDS = {
  name: 'workflows write',
  served: [{ endpoint: 'workflows.createLibrary' }, { endpoint: 'workflows.replaceLibrary', as: 'workflows_replace' }],
  usage: WORKFLOWS_WRITE_USAGE,
  help: [
    'a workflow folder of the user library, or of a templated --factory, written from',
    'a draft folder, its steps, README, scripts and schemas, leaving a file',
    'it does not carry; one there already, at the --version it was read at',
  ],
  spec: writerSpec(
    'workflows write',
    WORKFLOWS_WRITE_USAGE,
    [FROM, { key: 'name', takes: 'required', kind: 'name' }],
    [
      cliPath(
        'workflows write',
        'folder',
        'the draft folder whose steps and README to write',
        'the api is sent the steps themselves, never a folder to read',
      ),
      versionFlag('workflows write', 'the folder'),
      factoryFlag('workflows write'),
    ],
  ),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Workflow's `create` and `replace` verb of `objects`' Api (`/api/workflows`, the store's library; a factory's tree is written by a proposal), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

const AGENTS_WRITE_USAGE = '(user | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]';

/** `nemia agents write`: an agent of the person's library written from its file, or proposed to a templated factory. */
export const AGENTS_WRITE_WORDS = {
  name: 'agents write',
  served: [{ endpoint: 'agents.createLibrary' }, { endpoint: 'agents.replaceLibrary', as: 'agents_replace' }],
  usage: AGENTS_WRITE_USAGE,
  help: [
    'an agent of the user library, or of a templated --factory, written from its file:',
    '<name> is the agent it changes or renames, at the --version it was',
    'read at; none, a new one',
  ],
  spec: writerSpec(
    'agents write',
    AGENTS_WRITE_USAGE,
    [FROM, { key: 'name', takes: 'optional', kind: 'name' }],
    [
      cliPath(
        'agents write',
        'file',
        "the agent's file, <name>.md, with the result schema its output: names beside it",
        "the api is sent the agent's form, never a path to read",
      ),
      versionFlag('agents write', 'the agent'),
      factoryFlag('agents write'),
    ],
  ),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `create` and `replace` verb of `objects`' Api (`/api/agents`, the store's library; a factory's tree is written by a proposal), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

const SKILLS_WRITE_USAGE = '(user | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]';

/** `nemia skills write`: a skill of the person's library written from its SKILL.md, or proposed to a templated factory. */
export const SKILLS_WRITE_WORDS = {
  name: 'skills write',
  served: [
    { endpoint: 'skills.createLibrary' },
    { endpoint: 'skills.replaceLibrary', as: 'skills_replace' },
    { endpoint: 'skills.copyLibrary', as: 'skills_copy' },
  ],
  usage: SKILLS_WRITE_USAGE,
  help: [
    'a skill of the user library, or of a templated --factory, written from its',
    'SKILL.md: <name> is the skill it changes, at the --version it was',
    'read at; none, a new one',
  ],
  spec: writerSpec(
    'skills write',
    SKILLS_WRITE_USAGE,
    [FROM, { key: 'name', takes: 'optional', kind: 'name' }],
    [
      cliPath(
        'skills write',
        'file',
        "the skill's SKILL.md, whose name: is its folder",
        "the api is sent the skill's form, never a path to read",
      ),
      versionFlag('skills write', 'the skill'),
      factoryFlag('skills write'),
    ],
  ),
  writes: true,
  class: 'act',
  only: {
    side: 'cli',
    why: "the api serves it as the Skill's `create`, `replace` and `copy` verb of `objects`' Api (`/api/skills`, the store's library; a factory's tree is written by a proposal), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The writers' words, in the order the help lists them. */
export const WRITER_WORDS = [WORKFLOWS_WRITE_WORDS, AGENTS_WRITE_WORDS, SKILLS_WRITE_WORDS] as const satisfies readonly CommandWords[];
