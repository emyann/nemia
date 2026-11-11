/**
 * The skills an agent of yours can be given, as the Skill objects list them (`handlers.ts`), and a builtin skill copied into your library.
 *
 * An agent of yours finds a skill as a start finds it (`lookupRoots`): the store's `workflows/skills/` — your library — then the
 * `.claude/skills/` of the repository the board serves. The first that has a name wins, so a name in both is listed once, in your library.
 * Nemia's builtin skills, the orchestrator package's `skills/`, are found last, by name, where neither has the name: an agent of yours
 * gives one as it is, and a builtin skill is copied into your library (`copySkill`, a write of its own, before and apart from any save
 * of the agent) only to be changed there.
 *
 * Each skill is listed with its card entry or the package's refusal of it (a SKILL.md with no description can be given to no agent),
 * whether it is loaded every turn (`preload: true`), what it costs a turn (`skillTurnCost`: about, at four characters a token), and the
 * agents of yours that give it.
 *
 * And a SKILL.md as the Skill's spec (`skillSpecOf`), and one of yours written (`written`): made, changed at the version it was read at,
 * or its `preload:` alone switched. Every write is to your library; the api writes nothing into a checkout, so a skill of the
 * repository's is read there, and its object says the `cp -r` that moves a skill between the two.
 */
import path from 'node:path';
import { Effect, Schema } from 'effect';
import {
  AgentDoor,
  agentSkillsFound,
  BUILTIN_SKILLS,
  givenSkills as givenRead,
  isBuiltinPlace,
  listAgents,
  oneFolder,
  SkillDoor,
  skillDirIn,
  type AgentPlace,
  SKILLS_LIST,
  SKILLS_READ,
  SKILLS_WRITE,
  type SkillChange,
  type SkillRead,
} from 'agent-orchestrator';
import {
  SKILLS_FOLDER,
  skillDraftOf,
  splitFrontmatter,
  WorkflowError,
  type Agents,
  type AgentSkill,
  type SkillCost,
  type SkillDraft,
  type SkillsFound,
} from 'agent-orchestrator/workflow';
import type { Refusal } from '../guard.ts';
import type { Served } from '../layer.ts';
import { placesOf } from '../workflows/workflows.ts';
import type { DefinitionOrigin, SkillSpec } from 'objects';

/**
 * Where a skill is: your library (the store's), the repository the board serves (its `.claude/skills/`, or `workflows/skills/` beside its
 * agents), or what is built into Nemia.
 */
export type SkillSource = Extract<DefinitionOrigin, 'yours' | 'repo' | 'builtin'>;

/** One skill as the picker lists it. `entry` is its card entry, or null with `error` saying why no agent can be given it. */
export type SkillRow = {
  name: string;
  from: SkillSource;
  dir: string;
  entry: AgentSkill | null;
  error: string | null;
  /** Whether it is loaded every turn, whole (`preload: true`), rather than named for the session to load. */
  preload: boolean;
  /** What it costs a turn, about; null when its SKILL.md cannot be read. */
  cost: SkillCost | null;
  /** The agents of yours that give it. */
  usedBy: string[];
  /** A builtin skill's name, where an agent of yours already finds a skill of it: in your library, or in the repository. Null elsewhere. */
  found: Extract<SkillSource, 'yours' | 'repo'> | null;
};

/** One place the picker lists, in the order an agent of yours finds a name, the builtin last: its skills by name. */
export type SkillPlace = { from: SkillSource; dir: string; skills: SkillRow[] };

/** The repository's own skills folder, the one its sessions are given, which the skills page lists first of the repository's. */
export const repoSkillsDir = (repo: string): string => path.join(path.resolve(repo), '.claude', SKILLS_FOLDER);

/** Nemia's builtin skills: the orchestrator package's `skills/`, none while the package has no such folder. */
export { BUILTIN_SKILLS };

/** Your library: the store's `workflows/skills/`, where the board copies a skill. */
export const librarySkills = (home: string): string => path.join(home, 'workflows', SKILLS_FOLDER);

/** A folder of yours: where an agent of yours finds what a workflow of yours finds, its places named or none. */
const yoursFolder = (home: string): string => path.join(home, 'workflows', '_');

/** Yours' agents, each found as a workflow of yours finds it with no other place, a refusal kept: read through the Agent door. */
const yourAgentsFound = (home: string) => Effect.flatMap(AgentDoor, (door) => door.agents.found({ dir: yoursFolder(home) }));

/**
 * What the picker reads through the doors: the skills an agent of yours finds on `repo` (`found`, the same read a start makes for it, and
 * `agentSkillsFound` in the package), yours' agents (`agents`), and the skills of the builtin place `builtin.dir` (`builtin.names`).
 */
export type YourSkills = {
  readonly found: SkillsFound;
  readonly agents: Agents;
  readonly builtin: { readonly dir: string; readonly names: readonly string[] };
};

/** What `listSkills` lists, read through the Agent and Skill doors on the program's services: `YourSkills`. */
export const yourSkillsRead = (repo: string, home: string, builtin: string = BUILTIN_SKILLS) =>
  Effect.gen(function* () {
    const door = yield* SkillDoor;
    return {
      found: yield* door.skills.found({ dir: yoursFolder(home), places: placesOf(repo, home) }),
      agents: yield* yourAgentsFound(home),
      builtin: { dir: builtin, names: yield* door.skills.list(builtin) },
    } satisfies YourSkills;
  });

/** A factory's tree's folder of workflows (`<tree>/workflows`), whose `agents/` and `skills/` are the factory's own. */
export const treeWorkflows = (tree: string): string => path.join(path.resolve(tree), 'workflows');

/** Whether the skill folder `dir` is one of the factory's own, in the `skills/` of its tree `tree`; never where there is no tree. */
const inTree = (dir: string, tree: string | undefined): boolean =>
  tree !== undefined && path.dirname(path.resolve(dir)) === path.join(treeWorkflows(tree), SKILLS_FOLDER);

/** Which place a skill's folder is in, by the folder of skills it sits in; `null` for none of them. */
export function sourceOf(dir: string, repo: string, home: string): SkillSource | null {
  const parent = path.dirname(path.resolve(dir));
  if (parent === librarySkills(home)) return 'yours';
  if (parent === BUILTIN_SKILLS) return 'builtin';
  if (parent === repoSkillsDir(repo) || parent === path.join(path.resolve(repo), 'workflows', SKILLS_FOLDER)) return 'repo';
  return null;
}

/**
 * Where a skill with no page of the board's was found, as its folder's path from the repository's root, `/` between its parts: a skill
 * named with its folder, read from that folder's own skills, or any other found beneath `repo` in a place the board lists nothing for.
 * Null for a skill of a place the board pages (`sourceOf`), for the repository's own folder, and for a folder outside it.
 */
export function foundInOf(dir: string, repo: string, home: string): string | null {
  if (sourceOf(dir, repo, home) !== null) return null;
  const parts = path.relative(path.resolve(repo), path.resolve(dir)).split(path.sep);
  return parts[0] === '' || parts[0] === '..' || path.isAbsolute(parts.join(path.sep)) ? null : parts.join('/');
}

/** Each skill folder of `dirs` read now, through the table's `skills` (`SKILLS_LIST`) at the request's store, by folder. */
export const readsOf = (s: Served, dirs: readonly string[]): Promise<Record<string, SkillRead>> =>
  s.inRequest(SKILLS_LIST.handler({ skills: dirs }));

/**
 * The version of the skill in the folder `dir`, null where none reads, and the other text files of its folder, by path, as the package
 * reads them through its Skill door (`SKILLS_READ`).
 */
export const skillShownAt = async (
  s: Served,
  dir: string,
): Promise<{ version: string | null; files: readonly { path: string; text: string }[] }> => {
  const { version, files } = await s.inRequest(SKILLS_READ.handler({ name: path.basename(dir), dir }));
  return { version, files };
};

/**
 * The reading of the folder `dir` among `reads`, which the table's `skills` gives for each folder it was asked: thrown, naming the
 * folder, where it gave none.
 */
export function readAt(reads: Record<string, SkillRead>, dir: string): SkillRead {
  const read = reads[dir];
  if (read === undefined) throw new Error(`The table's \`skills\` gave no reading of '${dir}', which it was asked to read.`);
  return read;
}

/** One skill as the picker lists it: the package's reading of its folder (`read`), where it is, and who gives it. */
export function skillRow(
  name: string,
  dir: string,
  from: SkillSource,
  { entry, error, preload, cost }: SkillRead,
  usedBy: string[] = [],
  found: SkillRow['found'] = null,
): SkillRow {
  return { name, from, dir, entry, error, preload, cost, usedBy, found };
}

/** The agents of yours (`agents`, `yourAgentsFound`), by name, each with the skills its `skills:` gives: the ones that read. */
export function yourAgentsSkills(agents: Agents): Array<[string, string[]]> {
  return [...agents].flatMap(([name, agent]) => (agent instanceof Error ? [] : [[name, agent.skills ?? []] as [string, string[]]]));
}

/**
 * Every skill the picker lists, by place: yours, then the repository's — each name where an agent of yours finds it, so a name in both is
 * in yours alone — then Nemia's builtin skills, each marked where an agent of yours already finds a skill of its name, and listing the
 * agents of yours that give it where none does. The package's builtin place skill (`isBuiltinPlace`) and its builtin skills, which an
 * agent finds where no place has the name, are in neither of the first two. A name both
 * of one repository's places for skills have, which happens only when the store is in that repository and nothing says which is given, is
 * listed in yours with the package's refusal as its `error`. Any other skill the package refuses — a link in it that is not followed, rules
 * that do not read — is listed in the place its folder is in (`skillDirIn`, `sourceOf`), unread where a link is refused, with that refusal.
 * Each folder is read by `readSkills` (`readsOf`, on a request).
 */
export async function listSkills(
  readSkills: (dirs: readonly string[]) => Promise<Record<string, SkillRead>>,
  repo: string,
  home: string,
  yoursRead: YourSkills,
): Promise<SkillPlace[]> {
  const { found } = yoursRead;
  const { dir: builtin, names: builtinNames } = yoursRead.builtin;
  const agents = yourAgentsSkills(yoursRead.agents);
  const usedBy = (name: string) => agents.filter(([, skills]) => skills.includes(name)).map(([agent]) => agent);
  const yours: SkillPlace = { from: 'yours', dir: librarySkills(home), skills: [] };
  const inRepo: SkillPlace = { from: 'repo', dir: repoSkillsDir(repo), skills: [] };
  const places: SkillPlace[] = [yours, inRepo];
  const sorted = [...found.all]
    .filter(([, at]) => typeof at !== 'string' || !(isBuiltinPlace(at) || sourceOf(at, repo, home) === 'builtin'))
    .sort(([a], [b]) => a.localeCompare(b));
  const dirOf = ([name, at]: (typeof sorted)[number]) =>
    at instanceof WorkflowError ? (skillDirIn([yours.dir, inRepo.dir], name) ?? path.join(yours.dir, name)) : at;
  const reads = await readSkills([...sorted.map(dirOf), ...builtinNames.map((name) => path.join(builtin, name))]);
  const where = new Map<string, Extract<SkillSource, 'yours' | 'repo'>>();
  for (const [name, at] of sorted) {
    const dir = dirOf([name, at]);
    if (at instanceof WorkflowError) {
      const from = sourceOf(dir, repo, home) === 'repo' ? 'repo' : 'yours';
      (from === 'yours' ? yours : inRepo).skills.push({
        ...skillRow(name, dir, from, readAt(reads, dir), usedBy(name)),
        entry: null,
        error: at.message,
      });
      where.set(name, from);
      continue;
    }
    const from = sourceOf(at, repo, home) === 'yours' ? 'yours' : 'repo';
    (from === 'yours' ? yours : inRepo).skills.push(skillRow(name, at, from, readAt(reads, dir), usedBy(name)));
    where.set(name, from);
  }
  places.push({
    from: 'builtin',
    dir: builtin,
    skills: builtinNames.map((name) => {
      const dir = path.join(builtin, name);
      const shadowed = where.get(name) ?? null;
      return skillRow(name, dir, 'builtin', readAt(reads, dir), shadowed === null ? usedBy(name) : [], shadowed);
    }),
  });
  return places;
}

/**
 * A skill an agent gives, as its page lists it, named as its line writes it: where it is found, and what it costs a turn — or why none
 * is found. `from` is the place whose page it has; where it is null, `foundIn` is where the repository has it (`foundInOf`), or null too
 * for a skill found nowhere or outside the repository.
 */
export type GivenSkill = {
  name: string;
  from: SkillSource | 'factory' | null;
  foundIn: string | null;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
};

/**
 * The skills an agent gives, one row each in its order, each found where a start finds it (`found`, as the package's `agentSkillsFound`
 * finds them). A skill no place has is a row with the refusal the card says; one found in the repository where the board pages nothing,
 * as a skill named with its folder is, reads `from: null` and its folder in `foundIn`. One found in the `skills/` of the factory's tree
 * `tree`, where an agent of that tree finds it first, is the factory's.
 */
export function givenSkills(skills: readonly string[], found: SkillsFound, repo: string, home: string, tree?: string): GivenSkill[] {
  return givenRead(skills, found).map(({ name, dir, entry, error, preload, cost }) => ({
    name,
    from: dir === null ? null : inTree(dir, tree) ? 'factory' : sourceOf(dir, repo, home),
    foundIn: dir === null || inTree(dir, tree) ? null : foundInOf(dir, repo, home),
    entry,
    error,
    preload,
    cost,
  }));
}

/**
 * A skill's keys, in the order they are refused; each value is then judged by the package, which says what is wrong with it in its words.
 */
const SKILL_KEYS = {
  name: Schema.String,
  title: Schema.optionalKey(Schema.NullOr(Schema.String)),
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  tags: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
  examples: Schema.optionalKey(Schema.NullOr(Schema.Array(Schema.String))),
  preload: Schema.optionalKey(Schema.Boolean),
  body: Schema.String,
};

/** A skill as a request sends it, a key no skill has kept, so it is refused once every key a skill has is read (`skillDraftFrom`). */
const SKILL_DRAFT = Schema.StructWithRest(Schema.Struct(SKILL_KEYS), [Schema.Record(Schema.String, Schema.Unknown)]);

/** An agent that gives a skill: its place — the factory's own, in its tree, besides the two — and its name. */
export type SkillUser = { from: AgentPlace | 'factory'; name: string };

/**
 * The agents of both places, yours in the store `home`, that give the skill whose folder is `dir`, read through the Agent and Skill doors,
 * each as its own start finds the skill it names: at that path, or at another that is the same folder (`oneFolder`), as where one of the
 * repository's two places for skills is a link to the other. With a factory's tree `tree`, its own agents first, as `factory`, each
 * finding the skill as a start in that factory finds it: in the tree, then the repository, then yours.
 */
export const skillUsers = Effect.fnUntraced(function* (dir: string, name: string, repo: string, home: string, tree?: string) {
  const found = new Map<string, SkillsFound>();
  const at = path.resolve(dir);
  const users: SkillUser[] = [];
  const gives = (given: string | Error | undefined) => typeof given === 'string' && (path.resolve(given) === at || oneFolder(given, at));
  if (tree !== undefined) {
    const folder = path.join(treeWorkflows(tree), '_');
    const agents = yield* Effect.flatMap(AgentDoor, (door) => door.agents.found({ dir: folder }));
    const skills = yield* Effect.flatMap(SkillDoor, (door) => door.skills.found({ dir: folder, places: placesOf(repo, home) }));
    for (const [agent, read] of [...agents].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      if (!(read instanceof Error) && read.skills?.includes(name) && gives(skills.at.get(name)))
        users.push({ from: 'factory', name: agent });
  }
  for (const { from, dir: agents, name: agent, agent: read } of yield* listAgents(repo, home)) {
    if (read instanceof Error || !read.skills?.includes(name)) continue;
    let skills = found.get(agents);
    if (skills === undefined) {
      skills = yield* agentSkillsFound(agents, repo, home);
      found.set(agents, skills);
    }
    if (gives(skills.at.get(name))) users.push({ from, name: agent });
  }
  return users;
});

/** A draft from a skill as sent, refused (400) when it has a key no skill has: each value is then judged by the package, in its words. */
export function skillDraftFrom(skill: typeof SKILL_DRAFT.Type, route: string, shape: string): SkillDraft | Refusal {
  const unknown = Object.keys(skill).filter((key) => !Object.hasOwn(SKILL_KEYS, key));
  if (unknown.length) {
    const keys = unknown.map((key) => `\`${key}\``).join(' and ');
    return { status: 400, error: `${route}: ${keys} ${unknown.length > 1 ? 'are' : 'is'} no key of a skill's. Send ${shape}.` };
  }
  const { name, title, description, tags, examples, preload, body } = skill;
  return {
    name,
    title,
    description,
    tags: tags && [...tags],
    examples: examples && [...examples],
    ...(preload !== undefined && { preload }),
    body,
  };
}

/**
 * A SKILL.md, the file `file` of the skill `name` holding `text`, as the Skill's spec: its draft (`skillDraftOf`), or, where it does not
 * read as one, its body alone — the text after its frontmatter, or all of it where that does not read either — and why (`unread`, the
 * package's words), so a skill of yours can be mended from what it says. The one reading of a SKILL.md into a spec.
 */
export function skillSpecOf(file: string, name: string, text: string): { spec: SkillSpec; unread: string | null } {
  try {
    const { name: _name, ...spec } = skillDraftOf(file, name, text);
    return { spec, unread: null };
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return { spec: { body: bodyOf(file, text) }, unread: err.message };
  }
}

/** The body of a SKILL.md that does not read as a draft: what follows its frontmatter, or all of it, trimmed, where that does not read. */
function bodyOf(file: string, text: string): string {
  try {
    return splitFrontmatter(file, text).body;
  } catch (err) {
    if (!(err instanceof WorkflowError)) throw err;
    return text.trim();
  }
}

/**
 * A skill of yours written into the library through the table's `skills write` (`SKILLS_WRITE`): `change` at the `version` it was read at,
 * none for a skill made, `name` the skill's name on the path. Throws what the package refuses, which the one map answers by its kind.
 */
export async function written(s: Served, change: SkillChange, { version, name }: { version: string | null; name?: string }): Promise<void> {
  const input = { from: 'yours', change, ...(version !== null && { version }), ...(name !== undefined && { name }) };
  await s.inRequest(SKILLS_WRITE.handler(input));
}
