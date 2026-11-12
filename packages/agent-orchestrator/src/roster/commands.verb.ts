/** `nemia agents` and `nemia agents card`, entries of the command table: the agents of both places, and one agent's card. */
import { refusing, renamed } from '../command/requests.verb.ts';
import { Effect } from 'effect';
import { StoreRoot } from '../config/root.store.ts';
import { agentCardRead, agentsRead } from './roster.store.ts';
import { agentsLines, cardNote, type AgentsRead, type CardRead } from './roster.ts';
import type { Args, CommandSpec, Flag } from '../command/command.ts';
import type { Command } from '../command/entry.verb.ts';
import { AgentCardInput, AgentsInput } from '../agents/library.verb.ts';
import { writerText as textOf } from '../yours/yours.ts';

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
  twice: `nemia agents takes ${flag} once: an agent is read from one ${flag === '--repo' ? 'repository' : 'place'}.`,
}));

/** `nemia agents`' spec, after the name of the card it is asked for: its flags, and an argument it does not take in its own words. */
const agentsSpec = (positionals: CommandSpec['spec']['positionals']): CommandSpec['spec'] => ({
  positionals,
  flags: AGENTS_FLAGS,
  unknown: (arg) =>
    arg.startsWith('-')
      ? `nemia agents does not take ${arg}. It takes --repo <r>, and for a card --from repo|yours.`
      : `nemia agents takes no argument but card <name>, custom <name>, sources, copy <file>, or write, remove and try on yours: nemia agents, nemia agents card ${arg}, or nemia agents custom ${arg}.`,
  apart: (_value, flag) => AGENTS_TAKES[flag as keyof typeof AGENTS_TAKES],
});

/** Refused of `nemia agents`' flags: a value empty or starting `--`, which reads as the value left out, and a place but repo or yours. */
function agentsRefusal(args: Args): string | null {
  for (const flag of ['--repo', '--from'] as const) {
    const value = textOf(args, flag.slice(2));
    if (value !== undefined && (!value || value.startsWith('--'))) return AGENTS_TAKES[flag];
  }
  const from = textOf(args, 'from');
  if (from === undefined || from === 'repo' || from === 'yours') return null;
  return `nemia agents --from takes repo or yours, not ${from}: repo is <repo>/workflows/agents, yours is your store's.`;
}

/** `nemia agents`: every agent of both places, the repository's then yours, each read now through the Agent door. */
export const AGENTS: Command<AgentsRead, AgentsInput> = {
  name: 'agents',
  served: [{ endpoint: 'agents.list', request: refusing('agents', ['repo'], renamed({}, ['repo'])) }],
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
  input: AgentsInput,
  /** None given, no repository's read: the command line's runner gives the folder it is typed in (`agentsRun`). */
  handler: ({ repo }) => Effect.flatMap(StoreRoot, (root) => agentsRead({ repo, home: root })),
  print: agentsLines,
};

/** `nemia agents card`: one agent in the shape of an A2A Agent Card, from the place it is in. */
export const AGENT_CARD: Command<CardRead, AgentCardInput> = {
  name: 'agents card',
  served: [{ endpoint: 'agents.card', request: refusing('agents card', ['repo'], renamed({ from: 'origin' }, ['repo'])) }],
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
  input: AgentCardInput,
  handler: ({ name, repo = '.', from }) =>
    Effect.flatMap(StoreRoot, (root) => agentCardRead(name, { repo, home: root, ...(from !== undefined && { from }) })),
  print: ({ card }) => [JSON.stringify(card, null, 2)],
  note: (data, { name }) => cardNote(data, name),
};
