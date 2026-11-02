/**
 * A workflow folder's version: what a write or a removal of the folder is checked against, so one made on a folder changed since it was
 * read is refused rather than made over what changed. The board lists it, and `nemia workflows write` and `remove` take it back.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { frontmatterKey } from '../former/former.ts';
import { AGENTS_FOLDER } from '../step/step.ts';
import { AgentName, SkillName } from '../agents/agents.model.ts';
import { brokenBy } from '../door/door.store.ts';
import { AgentDoor, type AgentDoorShape } from '../agents/agent-door.store.ts';
import { SkillDoor, type SkillDoorShape } from '../skills/skill-door.store.ts';
import { lookupRoots, type Places } from '../skills/read.store.ts';
import type { Refusal } from '../refusal/refusal.ts';

/**
 * The value a file's frontmatter gives `key`, as the parser reads it (`frontmatterKey`), so `  agent: coder` and `agent : coder` name the
 * agent they load with. None for a file with no such line, or whose frontmatter never closes; nor for an `agent` with a slash, which
 * names no file of agents/. A `skills` line is given whole: a skill named with its folder holds one (`apps/web:ds-build`).
 */
function frontmatterNamed(text: string, key: 'agent' | 'skills'): string[] {
  const value = frontmatterKey(text, key);
  return value && (key === 'skills' || !/[\\/]/.test(value)) ? [value] : [];
}

/** The skills a step file's own `skills:` line adds to its agent's, by name. None for a file with no such line. */
const addedSkillsIn = (text: string): string[] =>
  frontmatterNamed(text, 'skills').flatMap((line) =>
    line
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean),
  );

/** Each `.md` and `.json` directly in `dir`, sorted by name, with what it holds or why it does not read. None for a folder not there. */
function filesOf(dir: string): Array<readonly [string, string | { unreadable: string }]> {
  let names: string[];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => !e.isDirectory() && /\.(md|json)$/.test(e.name))
      .map((e) => e.name)
      .sort();
  } catch {
    names = [];
  }
  const read = (file: string): string | { unreadable: string } => {
    try {
      return fs.readFileSync(file, 'utf8');
    } catch (err) {
      return { unreadable: err instanceof Error ? err.message : String(err) };
    }
  };
  return names.map((name) => [name, read(path.join(dir, name))] as const);
}

/** A file of a folder as its version counts it: its name, and what it holds or why it does not read. */
export type VersionFile = readonly [string, string | { unreadable: string }];

/** What a folder's own files are and name, read with no door: the files, the agents its steps name and the skills they add, sorted. */
export type VersionNamed = { readonly files: readonly VersionFile[]; readonly agents: readonly string[]; readonly added: readonly string[] };

/** An agent a folder names, as its version counts it: where the load finds it and its version there, or missing. */
export type VersionAgent = readonly [string, { at: string; version: string } | { missing: string }];

/** A skill a step adds, as its version counts it: its folder's version where found (null where no skill is there), or missing. */
export type VersionSkill = readonly [string, string | null | { missing: string }];

/** What the doors answer of the agents and skills a folder names: each agent and each added skill, as the version counts them. */
export type VersionGathered = { readonly agents: readonly VersionAgent[]; readonly added: readonly VersionSkill[] };

/** The Agent and Skill doors a version reads through, where given; else those the program is given. */
export type VersionDefs = { readonly agents: AgentDoorShape; readonly skills: SkillDoorShape };

/** The folder's own files and what they name (`VersionNamed`): no agent or skill is read here. */
export function versionNamed(dir: string): VersionNamed {
  const files = filesOf(dir);
  const texts = files.flatMap(([, text]) => (typeof text === 'string' ? [text] : []));
  return {
    files,
    agents: [...new Set(texts.flatMap((text) => frontmatterNamed(text, 'agent')))].sort(),
    added: [...new Set(texts.flatMap(addedSkillsIn))].sort(),
  };
}

/** The version of a folder's files and what the doors gathered of what they name, as one word: unchanged from the reader before the doors. */
export const versionDigest = (files: readonly VersionFile[], gathered: VersionGathered): string =>
  createHash('sha256')
    .update(JSON.stringify([...files, ...gathered.agents, ...gathered.added]))
    .digest('hex')
    .slice(0, 16);

/**
 * The agents and skills a folder names, read through the Agent and Skill doors (`defs`, else the program's): the skills found where a
 * run of it looks, only when something is named; each agent at the first root of `lookupRoots` whose door holds it, its version counting
 * the skills found beside the workflow (`AgentAt.skills`), else missing, as is a name the Agent door refuses; and each added skill's
 * folder, its version where a skill is held there, else null, or missing where none is found.
 */
export const versionGathered = (
  dir: string,
  places: Places,
  named: Pick<VersionNamed, 'agents' | 'added'>,
  defs?: VersionDefs,
): Effect.Effect<VersionGathered, Refusal> =>
  Effect.gen(function* () {
    if (!named.agents.length && !named.added.length) return { agents: [], added: [] };
    const agentDoor = defs?.agents ?? (yield* AgentDoor);
    const skillDoor = defs?.skills ?? (yield* SkillDoor);
    const found = yield* skillDoor.skills.found({ dir, places });
    const agents: VersionAgent[] = [];
    for (const agent of named.agents) {
      let held: VersionAgent[1] = { missing: agent };
      if (brokenBy(AgentName.OnCreate, agent) === null)
        for (const root of lookupRoots(dir, places)) {
          const there = yield* agentDoor.agents.there(AgentName.read(agent), { dir: path.join(root, AGENTS_FOLDER), skills: found });
          if (there.kind === 'held') {
            held = { at: root, version: there.version };
            break;
          }
        }
      agents.push([agent, held]);
    }
    const added: VersionSkill[] = [];
    for (const skill of named.added) {
      const at = found.at.get(skill);
      if (typeof at !== 'string') {
        added.push([`skills/${skill}`, { missing: skill }]);
        continue;
      }
      const there = yield* skillDoor.skills.there(SkillName.read(path.basename(at)), path.dirname(at));
      added.push([`skills/${skill}`, there.kind === 'held' ? there.version : null]);
    }
    return { agents, added };
  });

/**
 * What a folder's files hold, as one word: a digest of each `.md` and `.json` directly in it — its steps, its README and its schemas, what
 * a save writes, removes or reads — by name, with what it holds. Hidden ones too: the package reads a `.draft.md` as a step and
 * `writeWorkflow` removes it when the steps saved do not have it, and an `output:` may name a hidden schema. Any of them edited, added or
 * removed changes it, and nothing else does: a note beside the steps, or a folder inside, is no step. A file that cannot be read counts as
 * what it says, so it changes the word too. So does each agent a step names (`agent:`), as the Agent door versions it (`there`): its
 * file, where the load finds it (`lookupRoots`), each file it names beside it and each skill folder its `skills:` gives, found beside the
 * workflow. So does each skill a step's own `skills:` adds to its agent's, its folder where the load finds it, as the Skill door versions
 * it. Both are read through the doors (`versionGathered`): `defs` where given, else the program's, so a program given `agentDoorMemory()`
 * counts the memory's agents. Two cases digest otherwise than the reader before the doors did: an agent's name the Agent door refuses
 * (`AgentName`), read as missing, and an added skill whose `SKILL.md` is no regular file, read as null.
 */
export const workflowVersion = Effect.fn('workflowVersion')(function* (dir: string, places: Places, defs?: VersionDefs) {
  const named = versionNamed(dir);
  return versionDigest(named.files, yield* versionGathered(dir, places, named, defs));
});
