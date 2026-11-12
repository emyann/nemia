/**
 * The words of the commands the client holds (`COMMAND_WORDS`): each parsed, helped, refused and printed by `apps/cli` from these words,
 * and run through the `Api`, under every context. The orchestrator's table spreads each under the handler the api calls, so the verbs
 * skill, the MCP port's tools and admission read the same words. A command joins this list when its words move out of the orchestrator's
 * CLI, and its old path's words and runner are deleted with the move. Pure.
 */
import { CLI, type CommandWords, type Flag, type Positional, type Spec } from './command.ts';

/** The place a writer is named on (`<from>`), required: `yours`, the one it writes, or `factory`, a templated factory's tree. */
export const FROM: Positional = { key: 'from', takes: 'required', kind: 'name' };

/** `--factory`, the factory made from a template whose tree a writer named on `factory` writes into: taken on both sides, once. */
export const factoryFlag = (command: string): Flag => ({
  flag: '--factory',
  kind: 'text',
  key: 'factory',
  takes: `--factory takes the name of a factory made from a template, whose tree is written: ${CLI} ${command} factory … --factory <name>`,
  twice: `${CLI} ${command} takes --factory once: one tree is written.`,
});

/** `--version`, the version `what` was read at, which a refusal of a write without it names: taken on both sides, once. */
export const versionFlag = (command: string, what: string): Flag => ({
  flag: '--version',
  kind: 'text',
  key: 'version',
  takes: `--version takes the version ${what} was read at, which a write without it names: ${CLI} ${command} … --version <version>`,
  twice: `${CLI} ${command} takes --version once: one write is checked against one version.`,
});

/** A text flag the command line alone takes, under `key`, once: a path its runner reads, never sent to the api. */
export const cliPath = (command: string, key: string, takes: string, why: string): Flag => ({
  flag: `--${key}`,
  kind: 'text',
  key,
  takes: `--${key} takes ${takes}: ${CLI} ${command} … --${key} <path>`,
  twice: `${CLI} ${command} takes --${key} once.`,
  only: { side: 'cli', why },
});

/** The spec of a writer named `command`, used as `usage` says: its positionals and flags; any other argument refused in its words. */
export const writerSpec = (command: string, usage: string, positionals: readonly Positional[], flags: readonly Flag[]): Spec => ({
  positionals,
  flags,
  unknown: (arg) => `${CLI} ${command} takes no ${arg}: ${CLI} ${command} ${usage}`,
});

const WORKFLOWS_WRITE_USAGE = '(yours | factory) <name> --folder <draft> [--factory <name>] [--version <v>]';

/** `nemia workflows write`: a workflow folder of yours written from a draft folder, or proposed to a templated factory. */
export const WORKFLOWS_WRITE_WORDS = {
  name: 'workflows write',
  served: [{ endpoint: 'workflows.create' }, { endpoint: 'workflows.replace', as: 'workflows_replace' }],
  usage: WORKFLOWS_WRITE_USAGE,
  help: [
    'a workflow folder of yours, or of a templated --factory, written from',
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
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Workflow's `create` and `replace` verb of `objects`' Api (`/api/namespaces/:namespace/workflows`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

const AGENTS_WRITE_USAGE = '(yours | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]';

/** `nemia agents write`: an agent of yours written from its file, or proposed to a templated factory. */
export const AGENTS_WRITE_WORDS = {
  name: 'agents write',
  served: [{ endpoint: 'agents.create' }, { endpoint: 'agents.replace', as: 'agents_replace' }],
  usage: AGENTS_WRITE_USAGE,
  help: [
    'an agent of yours, or of a templated --factory, written from its file:',
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
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Agent's `create` and `replace` verb of `objects`' Api (`/api/namespaces/:namespace/agents`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

const SKILLS_WRITE_USAGE = '(yours | factory) [<name>] --file <SKILL.md> [--factory <name>] [--version <v>]';

/** `nemia skills write`: a skill of yours written from its SKILL.md, or proposed to a templated factory. */
export const SKILLS_WRITE_WORDS = {
  name: 'skills write',
  served: [
    { endpoint: 'skills.create' },
    { endpoint: 'skills.replace', as: 'skills_replace' },
    { endpoint: 'skills.copy', as: 'skills_copy' },
  ],
  usage: SKILLS_WRITE_USAGE,
  help: [
    'a skill of yours, or of a templated --factory, written from its',
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
  class: 'ask',
  only: {
    side: 'cli',
    why: "the api serves it as the Skill's `create`, `replace` and `copy` verb of `objects`' Api (`/api/namespaces/:namespace/skills`), which calls this entry's handler: no route of its own",
  },
} as const satisfies CommandWords;

/** The words of every command the client holds, in the order its help lists them. */
export const COMMAND_WORDS: readonly CommandWords[] = [WORKFLOWS_WRITE_WORDS, AGENTS_WRITE_WORDS, SKILLS_WRITE_WORDS];

/** The name of a command the client holds. */
export type MovedCommand = (typeof WORKFLOWS_WRITE_WORDS | typeof AGENTS_WRITE_WORDS | typeof SKILLS_WRITE_WORDS)['name'];
