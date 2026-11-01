/**
 * The agents of the two places read off disk, as `nemia agents` prints them and the api answers them: the places (`agentPlaces`), where an
 * agent's skills are found (`agentSkillsFound`), one agent by name (`findAgent`), one agent read (`agentRead`), every agent of both places
 * (`listAgents`, `agentsRead`), and one agent's card in the shape of an A2A Agent Card (`agentCardRead`). Yours are read in the store
 * `home`, the package's own unless one is given. What a reading holds and how it is printed is `roster.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { AGENTS_FOLDER, WorkflowError } from '../step/step.ts';
import { agentUsers } from '../folder/folder.store.ts';
import { agentVersion, customInstructionsFile, loadAgents, readCopyRecord, sourceVersion } from '../agents/read.store.ts';
import { cardSkills, skillsFor } from '../skills/read.store.ts';
import { HOME } from '../record/record.store.ts';
import type { AgentSkill } from '../skills/skills.ts';
import { agentCard, type Agent, type SkillsFound } from '../agents/agents.ts';
import {
  emptyReading,
  unreadReading,
  type AgentCopiedFrom,
  type AgentPlace,
  type AgentReading,
  type AgentsRead,
  type CardRead,
} from './roster.ts';

/** Where agents are read: the repository `repo`, and the store `home` that holds yours. */
export type Readings = { repo: string; home?: string };

/**
 * Where the skills of the agents in `dir` (`<workflows>/agents`) are found, as a start finds them for a workflow beside it (`skillsFor`):
 * that root first, then the repository's skills, then the store's. What a card (`cardSkills`) and an agent's version are read with
 * outside a start, so the card names the skills a run would be given and its version moves with them.
 */
export const agentSkillsFound = (dir: string, repo: string, home = HOME): SkillsFound =>
  skillsFor(path.join(path.dirname(path.resolve(dir)), '_'), { repo: path.resolve(repo), home });

/**
 * Where an agent may be, in order: the repository's `workflows/agents`, then the store `home`'s, yours. The board's two places
 * (`sourcesOf`, apps/api).
 */
export const agentPlaces = (repo: string, home = HOME): Array<{ from: AgentPlace; dir: string }> => [
  { from: 'repo', dir: path.join(path.resolve(repo), 'workflows', AGENTS_FOLDER) },
  { from: 'yours', dir: path.join(home, 'workflows', AGENTS_FOLDER) },
];

/** Every agent of both places, in the order the places come, each read now. An agent that does not read carries its refusal. */
export function listAgents(repo: string): Array<{ from: AgentPlace; dir: string; name: string; agent: Agent | WorkflowError }> {
  return agentPlaces(repo).flatMap(({ from, dir }) =>
    [...loadAgents(dir).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, agent]) => ({ from, dir, name, agent })),
  );
}

/**
 * One agent by name, from `from` when it is given and otherwise the first place that has it, yours in the store `home`. Refused, naming the
 * fix, when no place has it, when both do and nothing says which, or when the file is there and does not read — that last in the parser's
 * own words.
 */
export function findAgent(name: string, repo: string, from?: AgentPlace, home = HOME): { from: AgentPlace; dir: string; agent: Agent } {
  const places = agentPlaces(repo, home).filter((place) => from === undefined || place.from === from);
  const found = places.flatMap((place) => {
    const agent = loadAgents(place.dir).get(name);
    return agent === undefined ? [] : [{ ...place, agent }];
  });
  const where = (list: ReadonlyArray<{ from: AgentPlace }>) => list.map((p) => `--from ${p.from}`).join(' or ');
  const [one] = found;
  if (one === undefined) {
    const has = agentPlaces(repo, home)
      .filter((place) => fs.existsSync(place.dir))
      .map((place) => `${place.dir} (${[...loadAgents(place.dir).keys()].sort().join(', ') || 'no agents'})`);
    throw new WorkflowError(
      `no agent named ${name}${from ? ` in ${from}` : ''}. Looked in ${
        has.length
          ? has.join(' and ')
          : agentPlaces(repo, home)
              .map((p) => p.dir)
              .join(' and ')
      }. nemia agents lists them.`,
    );
  }
  if (found.length > 1)
    throw new WorkflowError(`${name} is an agent in both places — ${found.map((p) => p.dir).join(' and ')}. Say which: ${where(found)}.`);
  if (one.agent instanceof Error) throw one.agent;
  return { from: one.from, dir: one.dir, agent: one.agent };
}

const linked = (at: string): boolean => Boolean(fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink());

/** The file of the person's custom instructions for `name` in the store `home`, or null when they wrote none. */
function customOf(home: string, name: string): string | null {
  const file = customInstructionsFile(home, name);
  return fs.lstatSync(file, { throwIfNoEntry: false }) ? file : null;
}

/** Where the agent `name` of yours in the store `home` was copied from, and how that file stands now; null for one never copied. */
function copiedOf(home: string, name: string): AgentCopiedFrom | null {
  const record = readCopyRecord(home, name);
  if (record === null) return null;
  const now = sourceVersion(record.source, home);
  return { source: record.source, version: record.version, now: now === null ? 'gone' : now === record.version ? 'same' : 'changed' };
}

/**
 * One agent of `dir`, its skills found as a start on `repo` finds them, or null when `dir` has no file of that name. A file that is a link
 * is answered with the package's refusal only: read here it would be whatever it points at, outside the folder. A file that does not read
 * is answered with its lines as written (`unreadReading`), so what is wrong can be put right in a form.
 */
export function agentRead(from: AgentPlace, dir: string, name: string, { repo, home = HOME }: Readings): AgentReading | null {
  const found = agentSkillsFound(dir, repo, home);
  const version = agentVersion(dir, name, found);
  if (version === null) return null;
  const file = path.join(dir, `${name}.md`);
  const usedBy = agentUsers(path.dirname(dir), name).map((user) => {
    const [workflow, step] = user.split('/') as [string, string];
    return { from, workflow, step };
  });
  const agent = loadAgents(dir).get(name);
  const empty = {
    ...emptyReading(from, dir, file, name, version, usedBy),
    custom: customOf(home, name),
    copied: from === 'yours' ? copiedOf(home, name) : null,
  };
  if (linked(file)) return { ...empty, error: agent instanceof Error ? agent.message : `${AGENTS_FOLDER}/${name}.md is a link.` };
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ...empty, error: (err as Error).message };
  }
  const sidecarOf = (named: string | undefined): AgentReading['schema'] => {
    if (named === undefined || path.isAbsolute(named) || /[\\/]/.test(named) || linked(path.join(dir, named))) return null;
    try {
      return { file: named, text: fs.readFileSync(path.join(dir, named), 'utf8') };
    } catch {
      return null;
    }
  };
  if (agent === undefined || agent instanceof Error) return unreadReading(empty, source, agent, sidecarOf);
  let card: AgentSkill[] | null = null;
  let cardError: string | null = null;
  try {
    card = cardSkills(agent, found);
  } catch (err) {
    cardError = (err as Error).message;
  }
  return {
    ...empty,
    role: agent.role ?? null,
    description: agent.description ?? null,
    keys: agent.keys,
    body: agent.body,
    schema: sidecarOf(agent.keys.output),
    card,
    cardError,
    skills: agent.skills?.join(', ') ?? null,
    harnessPrompt: agent.harnessPrompt ?? null,
    mcp: agent.mcp?.join(', ') ?? null,
    source,
  };
}

/** Every agent of both places, the repository's then yours, each by name and read now from disk; and the places' folders. */
export function agentsRead({ repo, home = HOME }: Readings): AgentsRead {
  const places = agentPlaces(repo, home);
  const agents = places.flatMap(({ from, dir }) =>
    [...loadAgents(dir).keys()].sort().flatMap((name) => agentRead(from, dir, name, { repo, home }) ?? []),
  );
  return { agents, places };
}

/**
 * The agent `name`'s card, from `from` when it is given and otherwise the first place that has it: refused as `findAgent` refuses, and as
 * the package refuses a card it cannot make (`cardSkills`).
 */
export function agentCardRead(name: string, { repo, home = HOME, from }: Readings & { from?: AgentPlace }): CardRead {
  const found = findAgent(name, repo, from, home);
  const skills = agentSkillsFound(found.dir, repo, home);
  const version = agentVersion(found.dir, name, skills) ?? '';
  return { from: found.from, card: agentCard(found.agent, version, cardSkills(found.agent, skills)) };
}
