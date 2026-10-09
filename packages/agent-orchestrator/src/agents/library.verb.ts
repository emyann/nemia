/**
 * The agent library as entries of the command table: an agent of yours written (`AGENTS_WRITE`, `writeAgent`), copied in from a file
 * (`AGENTS_COPY`, `copyAgent`), removed (`AGENTS_REMOVE`,
 * `removeAgent`) and tried on a short brief (`AGENTS_TRY`, `tryAgent`), served on both sides — the command line reads the agent's file
 * (`cli/writers.ts`), the board sends its form — and one agent read for its page (`AGENTS_READ`, `agentRead`), on the api alone. The api
 * guards each write and words the board's answer around what each entry answers.
 */
import { tried } from '../runtime-client.ts';
import type { Args, Flag, Positional, Spec } from '../command/command.ts';
import { apiKey, cliPath, factoryFlag, FROM, versionFlag, writerSpec, writerText, yoursOrRefused } from '../yours/yours.ts';
import { templatedTree } from '../factory/factory.store.ts';
import type { Command } from '../command/entry.verb.ts';
import { HOME } from '../record/record.store.ts';
import type { AgentPlace, AgentReading } from '../roster/roster.ts';
import { agentRead } from '../roster/roster.store.ts';
import { TRY_BUDGET } from '../try/try.ts';
import { tryAgent } from '../try/try.verb.ts';
import type { AgentDraft } from './agents.ts';
import { removeAgent, writeAgent, type AgentSidecar, type AgentWritten } from './agents.store.ts';
import { AGENTS_COPY } from '../sources/copy.verb.ts';

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
const WRITE_HAND = "the board guards the write, decodes the agent's form in its own words, and reads the agent back";

/** `--repo`, which the board hands for the repository whose skills an agent's version counts; the command line counts yours alone. */
const REPO = apiKey('repo', "the board names the repository it lists an agent's skills from; the command line names none, and reads yours");

/** The words a written agent is said in: each file written and removed, and the version it is at now, which a change of it gives. */
const writtenLines = ({ dir, agent, version, written, removed }: AgentWritten): string[] => [
  `${agent.name} written in ${dir}, at version ${version}: ${written.join(', ')}`,
  ...(removed.length ? [`removed: ${removed.join(', ')}`] : []),
];

/**
 * An agent of yours written (`writeAgent`): `draft`, the agent as JSON text, which the command line reads off `--file`; `schema`, the
 * result schema its `output:` names as JSON text, read beside that file; `version`, what the agent was read at, none for a new one; and the
 * agent's name on the path (`name`), the one it is renamed from — none given for the agent of the draft's own name with no version, a new
 * one. Written to the tree of the factory `--factory` names for the place `factory`. Refused, as `Invalid`, for a place but those two
 * (`yoursOrRefused`).
 */
export const AGENTS_WRITE: Command<AgentWritten> = {
  name: 'agents write',
  usage: '(yours | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]',
  help: [
    'an agent of yours, or of a templated --factory, written from its file:',
    '<name> is the agent it changes or renames, at the --version it was',
    'read at; none, a new one',
  ],
  spec: writerSpec(
    'agents write',
    '(yours | factory) [<name>] --file <name>.md [--factory <name>] [--version <v>]',
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
      apiKey('draft', 'the command line reads the agent off --file, into the form the board sends'),
      apiKey('schema', 'the command line reads the result schema beside --file, as the board sends the one pasted'),
      REPO,
    ],
  ),
  writes: true,
  nemia: 'prompts',
  route: [
    { method: 'POST', path: '/api/agents/:from', status: 201, hand: WRITE_HAND },
    { method: 'PUT', path: '/api/agents/:from/:name', status: 200, hand: WRITE_HAND },
  ],
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const name = writerText(args, 'name');
      const from = writerText(args, 'from') ?? '';
      const factory = writerText(args, 'factory');
      const tree = (named: string) => templatedTree(named, 'nemia agents write');
      const repo = from === 'factory' && factory !== undefined ? tree(factory) : writerText(args, 'repo');
      const dir = yoursOrRefused('nemia agents write', 'agents', from, name ?? null, repo ?? '', home, { factory, treeOf: tree });
      const draft = JSON.parse(writerText(args, 'draft') ?? '{}') as AgentDraft;
      const version = writerText(args, 'version') ?? null;
      const schema = writerText(args, 'schema');
      return writeAgent(dir, draft, {
        version,
        ...(name !== undefined && (version !== null || name !== draft?.name) && { from: name }),
        ...(schema !== undefined && { schema: JSON.parse(schema) as AgentSidecar | null }),
        ...(repo !== undefined && { repo }),
      });
    }),
  print: writtenLines,
};

/** An agent of yours removed (`removeAgent`), against the `version` it was read at, which a removal without it names. */
export const AGENTS_REMOVE: Command<{ dir: string; removed: string[] }> = {
  name: 'agents remove',
  usage: 'yours <name> --version <v>',
  help: ['an agent of yours removed, at the --version it was read at'],
  spec: writerSpec('agents remove', 'yours <name> --version <v>', PLACE_AND_NAME, [versionFlag('agents remove', 'the agent'), REPO]),
  writes: true,
  nemia: 'prompts',
  route: {
    method: 'DELETE',
    path: '/api/agents/:from/:name',
    status: 200,
    hand: 'the board guards the removal, and reads the version the agent was read at before it is removed',
  },
  handler: (args, _env, home = HOME) =>
    tried(() => {
      const name = writerText(args, 'name') ?? '';
      const repo = writerText(args, 'repo');
      const dir = yoursOrRefused('nemia agents remove', 'agents', writerText(args, 'from') ?? '', name, repo ?? '', home);
      return removeAgent(dir, name, { version: writerText(args, 'version') ?? null, ...(repo !== undefined && { repo }) });
    }),
  print: ({ dir, removed }) => [`removed from ${dir}: ${removed.join(', ')}`],
};

/**
 * An agent of yours tried on a short brief (`tryAgent`): its try's folder written and a run of it started with no repository, as any
 * folder team's is; a tick files it. Refused before anything is written, as `tryAgent` says.
 */
export const AGENTS_TRY: Command<{ id: string }> = {
  name: 'agents try',
  usage: 'yours <name> --brief <words>',
  help: ['an agent of yours tried on a short brief, in a folder of its own,', `capped at $${TRY_BUDGET}`],
  spec: writerSpec('agents try', 'yours <name> --brief <words>', PLACE_AND_NAME, [
    {
      flag: '--brief',
      kind: 'text',
      key: 'brief',
      takes: '--brief takes what the agent is asked to do, a sentence is enough: nemia agents try yours <name> --brief "<words>"',
      twice: 'nemia agents try takes --brief once: a try is one brief.',
    },
    apiKey(
      'repo',
      'the board names the repository whose skills a try refuses; a try from the command line names none, as it runs with none',
    ),
  ]),
  writes: true,
  nemia: 'hers',
  ticks: true,
  route: {
    method: 'POST',
    path: '/api/agents/:from/:name/try',
    status: 201,
    hand: 'the board guards the try, and decodes its brief in its own words',
  },
  handler: (args, _env, home = HOME) =>
    tryAgent({
      who: 'nemia agents try',
      from: writerText(args, 'from') ?? '',
      name: writerText(args, 'name') ?? '',
      brief: writerText(args, 'brief') ?? '',
      repo: writerText(args, 'repo') ?? '',
      home,
    }),
  print: ({ id }, args) => [`${id}  a try of ${String(args.name)} started: nemia ls shows how it goes, and its page on the board`],
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
  nemia: 'read',
  route: { method: 'GET', path: '/api/agents/:from/:name', status: 200 },
  only: {
    side: 'api',
    why: "the board's agent page reads one agent with its versions and users; at the command line, nemia agents lists them",
  },
  handler: (args, _env, home) =>
    tried(() => ({
      agent: agentRead(textOf(args, 'from') as AgentPlace, textOf(args, 'dir') ?? '', textOf(args, 'name') ?? '', {
        repo: textOf(args, 'repo') ?? '',
        ...(home !== undefined && { home }),
      }),
    })),
  print: () => [],
};

/** The board's agent library entries, in the order the table lists them. */
export const LIBRARY_ENTRIES: readonly Command[] = [
  AGENTS_WRITE,
  AGENTS_COPY,
  AGENTS_REMOVE,
  AGENTS_TRY,
  AGENTS_READ,
] as readonly Command[];
