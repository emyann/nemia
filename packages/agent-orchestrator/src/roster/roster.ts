/**
 * One reading of an agent, as `nemia agents` prints it and the api answers it (`AgentReading`): the one with nothing in it, which each
 * reading starts from (`emptyReading`), the one of a file that does not read as an agent, its lines as written so a form can show what to
 * fix (`unreadReading`), the lines `nemia agents` and `nemia agents card` print of what was read (`agentsLines`, `cardNote`), and the
 * agents the Agents page lists with the steps each fills (`inFactory`). Pure: the reading off disk is `roster.store.ts`, and the steps
 * filled `fills.store.ts`.
 */
import path from 'node:path';
import { AGENTS_FOLDER, splitFrontmatter } from '../step/step.ts';
import { codexSandboxNamed, FORMER_KEYS, frontmatterKey, harnessPromptNamed } from '../former/former.ts';
import type { AgentSkill } from '../skills/skills.ts';
import { AGENT_KEYS, AGENT_OWN_KEYS, isCardFile, type AgentCardShape, type RoleKey } from '../agents/agents.ts';
import type { Factory } from '../factory/factory.ts';

/** The two places an agent is read from: the repository's `workflows/agents`, then your store's. */
export type AgentPlace = 'repo' | 'yours';

/** A node that names an agent: the step `step` of the workflow `workflow`, read from `from` — the agent's own place. */
export type AgentUser = { from: AgentPlace; workflow: string; step: string };

/** A step an agent fills: the step `step` of the workflow `workflow`, read from `from`, and whether a factory hired it there. */
export type AgentFill = { from: AgentPlace; workflow: string; step: string; hired: boolean };

/** A step filled, and the agent file that fills it, as `path.resolve` spells it. */
export type FilledStep = AgentFill & { file: string };

/**
 * The agents the Agents page lists, the one writer of their `fills` and `factories`: each of `listings` with the steps of `filled` its file
 * fills, and the factories `byFile` names for its file. In a factory, only the agents that fill a step in it; in the default factory, all.
 */
export function inFactory<L extends { file: string }>(
  listings: readonly L[],
  filled: readonly FilledStep[],
  byFile: ReadonlyMap<string, readonly string[]>,
  factory?: Factory,
): Array<L & { fills: AgentFill[]; factories: string[] }> {
  const tagged = listings.map((listing) => {
    const file = path.resolve(listing.file);
    return {
      ...listing,
      fills: filled.filter((fill) => fill.file === file).map(({ from, workflow, step, hired }) => ({ from, workflow, step, hired })),
      factories: [...(byFile.get(file) ?? [])],
    };
  });
  return factory ? tagged.filter((agent) => agent.fills.length > 0) : tagged;
}

/**
 * One agent as it is read: its file's keys as written, its instructions, the result schema its `output:` names as that file holds it, the
 * skills its `skills:` gives its sessions and its `harnessPrompt:`, each as written, what its card says it can do, the file's text, its
 * version (`agentVersion`, what a write carries), the nodes that name it, and the file of a person's custom instructions for it. `error` is
 * the parser's refusal of a file that does not read, whose keys are then its lines as written, so a form can show what to fix.
 */
export type AgentReading = {
  name: string;
  from: AgentPlace;
  dir: string;
  file: string;
  /** The job it holds (`role:`), as its file writes it: `Product engineer`. Null when it says none. */
  role: string | null;
  description: string | null;
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  schema: { file: string; text: string } | null;
  /**
   * What its card says it can do, generated (`cardSkills`): an A2A skill for each skill its `skills:` gives, read off the skill's SKILL.md,
   * or one made from its description when it gives none. Nobody writes it. Null when there is none — a file that does not read (`error`
   * says why), or a card the package refuses (`cardError`).
   */
  card: AgentSkill[] | null;
  /**
   * Why the agent has no card when it reads — no description, a skill no place has, a SKILL.md with no description — in the package's
   * words.
   */
  cardError: string | null;
  /** The skills its steps are given, as its `skills:` line writes them: `review-a-change, write-a-note`. */
  skills: string | null;
  /**
   * What becomes of the harness's own prompt: `keep`, `no-coding` or `replace`, a former `systemPrompt:` line in the word it is now; null
   * for none, which is `keep`.
   */
  harnessPrompt: string | null;
  /** The MCP servers its sessions load, as its `mcp:` line writes them: `playwright, docs`. Null for an agent that names none. */
  mcp: string | null;
  source: string;
  version: string;
  usedBy: AgentUser[];
  error: string | null;
  /** The file of a person's custom instructions for it, in the store read (`customInstructionsFile`); null when they wrote none. */
  custom: string | null;
  /**
   * Where an agent of yours was copied from (`nemia agents copy`): the file, the version it was at then, and whether it is that version
   * now, has changed since or is gone. Null for an agent never copied, and for every agent of a repository.
   */
  copied: AgentCopiedFrom | null;
};

/** Where an agent of yours was copied from, the version it was at then, and how that file stands now. */
export type AgentCopiedFrom = { source: string; version: string; now: 'same' | 'changed' | 'gone' };

/** Every agent of both places, in the order the places come, and the places' folders, which `nemia agents` names when there is none. */
export type AgentsRead = { agents: AgentReading[]; places: Array<{ from: AgentPlace; dir: string }> };

/** One agent's card, in the shape of an A2A Agent Card, and the place it was found in. */
export type CardRead = { from: AgentPlace; card: AgentCardShape };

/**
 * The keys a step has too. The agent's own (`AGENT_OWN_KEYS`: its role, description, skills and harness prompt) are no step's, so a form
 * shows them apart (`RoleKey`).
 */
const ROLE_KEYS = AGENT_KEYS.filter((key): key is RoleKey => !(AGENT_OWN_KEYS as readonly string[]).includes(key));

/**
 * A `skills:` line as written, for a file that does not read — none where it names a card file, a former line the package refuses: a
 * form's save then writes the agent without it, which is the fix its refusal names.
 */
function skillsLineOf(source: string): string | null {
  const line = frontmatterKey(source, 'skills');
  return line === undefined || isCardFile(line) ? null : line;
}

/** A file's harness prompt as written, or its former `systemPrompt:` line in the word it is now; null for neither. */
function harnessPromptOf(source: string): string | null {
  const former = frontmatterKey(source, 'systemPrompt');
  return frontmatterKey(source, 'harnessPrompt') ?? (former === undefined ? null : harnessPromptNamed(former));
}

/** The reading of the agent `name` at `file`, with nothing read into it: its place, its version and the nodes that name it. */
export const emptyReading = (
  from: AgentPlace,
  dir: string,
  file: string,
  name: string,
  version: string,
  usedBy: AgentUser[],
): AgentReading => ({
  name,
  from,
  dir,
  file,
  role: null,
  description: null,
  keys: {},
  body: '',
  schema: null,
  card: null,
  cardError: null,
  skills: null,
  harnessPrompt: null,
  mcp: null,
  source: '',
  version,
  usedBy,
  error: null,
  custom: null,
  copied: null,
});

/**
 * The role keys `source` writes, a former key read as the key it became, and a sandbox under the former key `permissionMode:` read as its
 * `sandbox` (`codexSandboxNamed`) unless `sandbox:` is written beside it.
 */
function keysWritten(file: string, source: string): Partial<Record<RoleKey, string>> {
  const formerOf = (key: RoleKey) => Object.keys(FORMER_KEYS).filter((former) => FORMER_KEYS[former] === key);
  const keys = Object.fromEntries(
    ROLE_KEYS.flatMap((key) => {
      const value = [key, ...formerOf(key)].map((named) => frontmatterKey(source, named)).find((v) => v !== undefined);
      return value === undefined ? [] : [[key, value]];
    }),
  ) as Partial<Record<RoleKey, string>>;
  return keys.sandbox === undefined ? codexSandboxNamed(file, keys, keys.harness) : keys;
}

/**
 * The reading of a file that does not read as an agent (`agent`, the package's refusal, or nothing where the load found none): `base` with
 * the lines `source` writes (`keysWritten`), its harness prompt in the word it is now (`harnessPromptNamed`), its instructions as written,
 * and the schema its `output:` names (`sidecarOf`) — so a form shows what to fix, and the refusal says why.
 */
export function unreadReading(
  base: AgentReading,
  source: string,
  agent: Error | undefined,
  sidecarOf: (named: string | undefined) => AgentReading['schema'],
): AgentReading {
  const keys = keysWritten(base.file, source);
  let body = '';
  try {
    body = splitFrontmatter(base.file, source).body;
  } catch {
    body = source;
  }
  return {
    ...base,
    role: frontmatterKey(source, 'role') ?? null,
    description: frontmatterKey(source, 'description') ?? null,
    keys,
    body,
    schema: sidecarOf(keys.output),
    skills: skillsLineOf(source),
    harnessPrompt: harnessPromptOf(source),
    mcp: frontmatterKey(source, 'mcp') ?? null,
    source,
    error: agent ? agent.message : `${AGENTS_FOLDER}/${base.name}.md does not read.`,
  };
}

/** The line of an agent copied in: the file and version it came from, and whether that file has changed since or is gone. */
const copiedLine = ({ source, version, now }: AgentCopiedFrom): string =>
  `   copied from ${source} at ${version}${now === 'changed' ? '; the source has changed since' : now === 'gone' ? '; the source is gone' : ''}`;

/** One agent's lines on `nemia agents`: what it is for, what it says it can do, and the skills it is given; or why it does not read. */
function agentLines(agent: AgentReading): string[] {
  const { name, from } = agent;
  if (agent.error !== null) return [`${name}  ${from}  does not read: ${agent.error.split('\n')[0]}`];
  return [
    `${name}  ${from}  ${agent.description ?? 'no description:'}`,
    ...(agent.cardError !== null ? [`   says nothing it can do — ${agent.cardError.split('\n')[0]}`] : []),
    ...(agent.card ?? []).map((skill) => `   ${skill.id}  ${skill.name} — ${skill.description}`),
    ...(agent.skills ? [`   given the skills ${agent.skills}`] : []),
    ...(agent.harnessPrompt !== null && agent.harnessPrompt !== 'keep' ? [`   harness prompt: ${agent.harnessPrompt}`] : []),
    ...(agent.mcp ? [`   loads the MCP servers ${agent.mcp}`] : []),
    ...(agent.custom !== null ? [`   custom instructions: ${agent.custom}`] : []),
    ...(agent.copied !== null ? [copiedLine(agent.copied)] : []),
  ];
}

/** `nemia agents`' lines: each agent, the repository's then yours, and how to get one's card; or where an agent would be, for none. */
export const agentsLines = ({ agents, places }: AgentsRead): string[] =>
  agents.length
    ? [...agents.flatMap(agentLines), `\none in A2A's shape: nemia agents card <name>`]
    : [`no agents — an agent is a file in <workflows>/agents: ${places.map((p) => p.dir).join(' or ')}`];

/** What `nemia agents card` says of the card `name` has, on stderr beside it: what it is not. */
export const cardNote = ({ from }: CardRead, name: string): string[] => [
  `${name} (${from}) — a card, not an address: nothing here serves this agent over A2A, so it declares no interfaces and no security schemes.`,
];
