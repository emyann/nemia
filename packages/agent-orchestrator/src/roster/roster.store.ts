/**
 * The agents of the two places, read through the Agent and Skill doors (`AgentDoor`, `SkillDoor`), as `nemia agents` prints them and the
 * api answers them: the places (`agentPlaces`), where an agent's skills are found (`agentSkillsFound`), one agent by name (`findAgent`),
 * one agent read (`agentRead`), every agent of both places (`listAgents`, `agentsRead`), and one agent's card in the shape of an A2A Agent
 * Card (`agentCardRead`). Each but the places is a program, run where the store's root is given (`StoreRoot`, the api's `inRequest`) or
 * over the doors' memory; yours are read in the store `home` it is given. What a reading holds and how it is printed is `roster.ts`'s.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Result } from 'effect';
import { AGENTS_FOLDER, WorkflowError } from '../step/step.ts';
import { agentUsers } from '../folder/folder.store.ts';
import { customInstructionsFile, readCopyRecord, sourceVersion } from '../agents/read.store.ts';
import { cardSkills } from '../skills/read.store.ts';
import type { AgentSkill } from '../skills/skills.ts';
import { agentCard, type Agent, type SkillsFound } from '../agents/agents.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { fromThrow } from '../door/door.store.ts';
import type { Refusal } from '../refusal/refusal.ts';
import { AgentName } from '../agents/agents.model.ts';
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
export type Readings = { repo: string; home: string };

/** An agent read through the Agent door, or the door's refusal of it in its own words: a file that does not read, a name that is none. */
type Read = Agent | Refusal;

/** The agent `name` of the folder `dir`, as the Agent door reads it, its refusal kept as the value. */
const doorRead = (name: string, dir: string): Effect.Effect<Read> =>
  Effect.flatMap(AgentDoor, (door) =>
    Effect.map(Effect.result(door.agents.read(AgentName.read(name), { dir })), (read) =>
      Result.isSuccess(read) ? read.success : read.failure,
    ),
  );

/** The names the folder `dir` holds, as the Agent door lists them. */
const namesIn = (dir: string): Effect.Effect<readonly string[], Refusal> => Effect.flatMap(AgentDoor, (door) => door.agents.list(dir));

/** The version of the agent `name` of `dir`, its skills counted where `skills` found them; null where the folder has no such agent. */
const versionOf = (name: string, dir: string, skills: SkillsFound): Effect.Effect<string | null, Refusal> =>
  Effect.flatMap(AgentDoor, (door) =>
    Effect.map(door.agents.there(AgentName.read(name), { dir, skills }), (there) => (there.kind === 'held' ? there.version : null)),
  );

/**
 * Where the skills of the agents in `dir` (`<workflows>/agents`) are found, as a start finds them for a workflow beside it, through the
 * Skill door: that root first, then the repository's skills, then the store's. What a card (`cardSkills`) and an agent's version are read
 * with outside a start, so the card names the skills a run would be given and its version moves with them.
 */
export const agentSkillsFound = Effect.fn('agentSkillsFound')(function* (dir: string, repo: string, home: string) {
  const door = yield* SkillDoor;
  return yield* door.skills.found({ dir: path.join(path.dirname(path.resolve(dir)), '_'), places: { repo: path.resolve(repo), home } });
});

/**
 * Where an agent may be, in order: the repository's `workflows/agents`, then the store `home`'s, yours. The board's two places
 * (`sourcesOf`, apps/api).
 */
export const agentPlaces = (repo: string, home: string): Array<{ from: AgentPlace; dir: string }> => [
  { from: 'repo', dir: path.join(path.resolve(repo), 'workflows', AGENTS_FOLDER) },
  { from: 'yours', dir: path.join(home, 'workflows', AGENTS_FOLDER) },
];

/**
 * Every agent of both places, in the order the places come, each read now through the Agent door. An agent that does not read carries
 * the door's refusal.
 */
export const listAgents = Effect.fn('listAgents')(function* (repo: string, home: string) {
  const out: Array<{ from: AgentPlace; dir: string; name: string; agent: Read }> = [];
  for (const { from, dir } of agentPlaces(repo, home))
    for (const name of [...(yield* namesIn(dir))].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)))
      out.push({ from, dir, name, agent: yield* doorRead(name, dir) });
  return out;
});

/**
 * One agent by name, from `from` when it is given and otherwise the first place that has it, yours in the store `home`. Refused, naming the
 * fix, when no place has it, when both do and nothing says which, or when the file is there and does not read — that last in the door's
 * own words.
 */
export const findAgent = Effect.fn('findAgent')(function* (name: string, repo: string, home: string, from?: AgentPlace) {
  const all = agentPlaces(repo, home);
  const found: Array<{ from: AgentPlace; dir: string; agent: Read }> = [];
  const held: string[] = [];
  for (const place of all) {
    const names = yield* namesIn(place.dir);
    if (fs.existsSync(place.dir)) held.push(`${place.dir} (${[...names].sort().join(', ') || 'no agents'})`);
    if ((from === undefined || place.from === from) && names.includes(name))
      found.push({ ...place, agent: yield* doorRead(name, place.dir) });
  }
  const [one] = found;
  if (one === undefined)
    return yield* Effect.fail(
      new WorkflowError(
        `no agent named ${name}${from ? ` in ${from}` : ''}. Looked in ${
          held.length ? held.join(' and ') : all.map((p) => p.dir).join(' and ')
        }. nemia agents lists them.`,
      ),
    );
  if (found.length > 1)
    return yield* Effect.fail(
      new WorkflowError(
        `${name} is an agent in both places — ${found.map((p) => p.dir).join(' and ')}. Say which: ${found.map((p) => `--from ${p.from}`).join(' or ')}.`,
      ),
    );
  if (one.agent instanceof Error) return yield* Effect.fail(one.agent);
  return { from: one.from, dir: one.dir, agent: one.agent };
});

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
 * One agent of `dir`, read through the Agent door, its skills found as a start on `repo` finds them, or null when `dir` has no agent of
 * that name. A file that is a link is answered with the door's refusal only: read here it would be whatever it points at, outside the
 * folder. A file that does not read is answered with its lines as written (`unreadReading`), so what is wrong can be put right in a form.
 * An agent the door holds with no file to read (its memory) is answered from what the door read, its `source` empty.
 */
export const agentRead = Effect.fn('agentRead')(function* (from: AgentPlace, dir: string, name: string, { repo, home }: Readings) {
  const found = yield* agentSkillsFound(dir, repo, home);
  const version = yield* versionOf(name, dir, found);
  if (version === null) return null;
  const file = path.join(dir, `${name}.md`);
  const usedBy = agentUsers(path.dirname(dir), name).map((user) => {
    const [workflow, step] = user.split('/') as [string, string];
    return { from, workflow, step };
  });
  const agent = yield* doorRead(name, dir);
  const empty: AgentReading = {
    ...emptyReading(from, dir, file, name, version, usedBy),
    custom: customOf(home, name),
    copied: from === 'yours' ? copiedOf(home, name) : null,
  };
  if (linked(file)) return { ...empty, error: agent instanceof Error ? agent.message : `${AGENTS_FOLDER}/${name}.md is a link.` };
  let source: string | undefined;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (agent instanceof Error) return { ...empty, error: (err as Error).message };
  }
  const sidecarOf = (named: string | undefined): AgentReading['schema'] => {
    if (named === undefined || path.isAbsolute(named) || /[\\/]/.test(named) || linked(path.join(dir, named))) return null;
    try {
      return { file: named, text: fs.readFileSync(path.join(dir, named), 'utf8') };
    } catch {
      return null;
    }
  };
  if (agent instanceof Error) return unreadReading(empty, source ?? '', agent, sidecarOf);
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
    source: source ?? '',
  } satisfies AgentReading;
});

/** Every agent of both places, the repository's then yours, each by name and read now through the Agent door; and the places' folders. */
export const agentsRead = Effect.fn('agentsRead')(function* ({ repo, home }: Readings) {
  const places = agentPlaces(repo, home);
  const agents: AgentReading[] = [];
  for (const { from, dir } of places)
    for (const name of yield* namesIn(dir)) {
      const read = yield* agentRead(from, dir, name, { repo, home });
      if (read !== null) agents.push(read);
    }
  return { agents, places } satisfies AgentsRead;
});

/**
 * The agent `name`'s card, from `from` when it is given and otherwise the first place that has it: refused as `findAgent` refuses, and as
 * the package refuses a card it cannot make (`cardSkills`).
 */
export const agentCardRead = Effect.fn('agentCardRead')(function* (name: string, { repo, home, from }: Readings & { from?: AgentPlace }) {
  const found = yield* findAgent(name, repo, home, from);
  const skills = yield* agentSkillsFound(found.dir, repo, home);
  const version = (yield* versionOf(name, found.dir, skills)) ?? '';
  const card = yield* fromThrow(() => cardSkills(found.agent, skills));
  return { from: found.from, card: agentCard(found.agent, version, card) } satisfies CardRead;
});
