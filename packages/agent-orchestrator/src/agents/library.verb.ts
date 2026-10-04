/**
 * The board's agent library as entries of the command table, each served on the api alone: an agent of yours written from a form
 * (`AGENTS_WRITE`, `writeAgent`), removed (`AGENTS_REMOVE`, `removeAgent`), tried on a short brief (`AGENTS_TRY`, `start`), and one agent
 * read for its page (`AGENTS_READ`, `agentRead`). The api resolves which folder a request names, guards each write, and words the board's
 * answer around what each entry answers.
 */
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import type { AgentPlace, AgentReading } from '../roster/roster.ts';
import { agentRead } from '../roster/roster.store.ts';
import { start } from '../start/start.verb.ts';
import type { AgentDraft } from './agents.ts';
import { removeAgent, writeAgent, type AgentSidecar, type AgentWritten } from './agents.store.ts';

/** The text under `key`, or undefined where none was given. */
const textOf = (args: Args, key: string): string | undefined => {
  const value = args[key];
  return typeof value === 'string' ? value : undefined;
};

/** A text flag under `key`, as the api hands it. */
const keyed = (key: string): Flag => ({ flag: `--${key}`, kind: 'text', key });

/** The spec of an entry served on the api alone: its positionals, and its text flags by key. */
const apiSpec = (positionals: readonly Positional[], keys: readonly string[]): Spec => ({
  positionals,
  flags: keys.map(keyed),
  unknown: (arg) => `the board's agents take no ${arg}.`,
});

/** The place an agent is read from, and its name, as the api's path names them. */
const PLACE_AND_NAME: readonly Positional[] = [
  { key: 'from', takes: 'required', kind: 'name' },
  { key: 'name', takes: 'required', kind: 'name' },
];

/** Why the board's agent writes are served by the api's own routes. */
const WRITE_HAND =
  "the board guards the write, decodes the agent's form in its own words, answers the package's refusal with the steps that still name it, and reads the agent back";

/**
 * An agent of yours written from its form (`writeAgent`): `dir`, the agents folder the api resolved; `draft`, the agent as JSON text;
 * `schema`, the result schema its `output:` names as JSON text, where one is given; `version`, what the agent was read at, none for a new
 * one; and the agent's name on the path (`name`), the one it is renamed from.
 */
export const AGENTS_WRITE: Command<AgentWritten> = {
  name: 'agents write',
  usage: '<from> [<name>]',
  help: ['an agent of yours written from its form'],
  spec: apiSpec(
    [
      { key: 'from', takes: 'required', kind: 'name' },
      { key: 'name', takes: 'optional', kind: 'name' },
    ],
    ['dir', 'draft', 'schema', 'version', 'repo'],
  ),
  writes: true,
  route: [
    { method: 'POST', path: '/api/agents/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/agents/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  only: { side: 'api', why: "the board's library writes an agent from a form; at the command line a person edits the agent's file" },
  handler: async (_e, args) => {
    const schema = textOf(args, 'schema');
    return writeAgent(textOf(args, 'dir') ?? '', JSON.parse(textOf(args, 'draft') ?? '{}') as AgentDraft, {
      version: textOf(args, 'version') ?? null,
      ...(textOf(args, 'name') !== undefined && { from: textOf(args, 'name') }),
      ...(schema !== undefined && { schema: JSON.parse(schema) as AgentSidecar | null }),
      ...(textOf(args, 'repo') !== undefined && { repo: textOf(args, 'repo') }),
    });
  },
  print: () => [],
};

/** An agent of yours removed (`removeAgent`), against the `version` it was read at, from the agents folder the api resolved (`dir`). */
export const AGENTS_REMOVE: Command<{ dir: string; removed: string[] }> = {
  name: 'agents remove',
  usage: '<from> <name>',
  help: ['an agent of yours removed'],
  spec: apiSpec(PLACE_AND_NAME, ['dir', 'version', 'repo']),
  writes: true,
  route: {
    method: 'DELETE',
    path: '/api/agents/:from/:name',
    status: 200,
    hand: "the board guards the removal, and answers the package's refusal with the steps that still name the agent",
  },
  only: { side: 'api', why: "the board's library removes an agent; at the command line a person removes the agent's file" },
  handler: async (_e, args) =>
    removeAgent(textOf(args, 'dir') ?? '', textOf(args, 'name') ?? '', {
      version: textOf(args, 'version') ?? '',
      ...(textOf(args, 'repo') !== undefined && { repo: textOf(args, 'repo') }),
    }),
  print: () => [],
};

/**
 * An agent of yours tried on a short brief: a run of its try's folder (`dir`, which the api writes) started with no repository, as any
 * folder team's is (`start`); a tick files it.
 */
export const AGENTS_TRY: Command<{ id: string }> = {
  name: 'agents try',
  usage: '<from> <name>',
  help: ['an agent of yours tried on a short brief'],
  spec: apiSpec(PLACE_AND_NAME, ['dir', 'brief']),
  writes: true,
  route: {
    method: 'POST',
    path: '/api/agents/:from/:name/try',
    status: 201,
    hand: 'the board guards the try, refuses an agent a try could not run, one try of it at a time, and writes its try folder first',
  },
  only: { side: 'api', why: "the board's agent page tries an agent; at the command line a person starts a workflow that runs it" },
  handler: async (_e, args) => ({ id: start({ brief: textOf(args, 'brief') ?? '', repo: '', workflowDir: textOf(args, 'dir') ?? '' }).id }),
  print: () => [],
};

/**
 * One agent of the agents folder the api resolved (`dir`), its skills found as a start on `repo` finds them (`agent`), or null where the
 * folder has no file of its name.
 */
export const AGENTS_READ: Command<{ agent: AgentReading | null }> = {
  name: 'agents read',
  usage: '<from> <name>',
  help: ['one agent, read for its page'],
  spec: apiSpec(PLACE_AND_NAME, ['dir', 'repo']),
  writes: false,
  route: { method: 'GET', path: '/api/agents/:from/:name', status: 200 },
  only: {
    side: 'api',
    why: "the board's agent page reads one agent with its versions and users; at the command line, wf agents lists them",
  },
  handler: async (_e, args, _env, home) => ({
    agent: agentRead(textOf(args, 'from') as AgentPlace, textOf(args, 'dir') ?? '', textOf(args, 'name') ?? '', {
      repo: textOf(args, 'repo') ?? '',
      ...(home !== undefined && { home }),
    }),
  }),
  print: () => [],
};

/** The board's agent library entries, in the order the table lists them. */
export const LIBRARY_ENTRIES: readonly Command[] = [AGENTS_WRITE, AGENTS_REMOVE, AGENTS_TRY, AGENTS_READ] as readonly Command[];
