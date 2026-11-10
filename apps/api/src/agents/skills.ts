/**
 * The skills an agent of yours can be given, as the board's skill picker lists them, and a builtin skill copied into your library.
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
 * And one skill on a page of its own (`skillDetail`), and one of yours written on the board (`writeSkill`): made, changed at the version it
 * was read at, or its `preload:` alone switched. Every write is to your library; the api writes nothing into a checkout, so a skill of the
 * repository's is read there, and a page says the `cp -r` that moves a skill between the two.
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
  type SkillChange,
  type SkillPage,
  type SkillRead,
  type SkillWritten,
  skillCopyCommand,
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

import type { Engine, RunsOn } from '../store.ts';
import { placesOf, type InRequest } from '../workflows/workflows.ts';
import { commandNamed, runPlaced } from '../store.ts';
import type { DefinitionOrigin } from 'objects';

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

/** What a copy answers: the skill as it now reads in your library, and its files by their path in it. */
export type SkillAdded = { skill: SkillRow; written: string[] };

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

/**
 * The board's skill library in the package's table, each entry served on the api alone: the skill folders listed, each read
 * (`skills`), one skill read for its page (`skills show`), and one of yours written or copied (`skills write`).
 */
const LIST = commandNamed('skills');
const READ = commandNamed('skills show');
const WRITE = commandNamed('skills write');

/** Each skill folder of `dirs` read now, through the table's `skills` at the store's root `home`, by folder. */
export const readsOf = async (e: Engine['Service'], on: RunsOn, dirs: readonly string[], home: string) =>
  (await runPlaced({ ...on, home }, e, LIST.handler({ skills: dirs }, undefined, home))) as Record<string, SkillRead>;

/** The version of the skill in the folder `dir`, as the package reads it through its Skill door (`skills show`): null where none reads. */
export const skillVersionAt = async (e: Engine['Service'], on: RunsOn, dir: string, home: string) =>
  ((await runPlaced({ ...on, home }, e, READ.handler({ from: 'yours', name: path.basename(dir), dir }, undefined, home))) as SkillPage)
    .version;

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
 */
export async function listSkills(
  e: Engine['Service'],
  on: RunsOn,
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
  const reads = await readsOf(e, on, [...sorted.map(dirOf), ...builtinNames.map((name) => path.join(builtin, name))], home);
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
export const SKILL_DRAFT = Schema.StructWithRest(Schema.Struct(SKILL_KEYS), [Schema.Record(Schema.String, Schema.Unknown)]);

/** An agent that gives a skill: its place — the factory's own, in its tree, besides the two — and its name. */
export type SkillUser = { from: AgentPlace | 'factory'; name: string };

/**
 * One skill on its own page. `skill` is its row as the list has it; `version` what a write of it carries back (`skillVersion`); `draft`
 * what its form is filled from (`skillDraftOf`), or null where its SKILL.md does not read — `skill.error` says why, and `body` is its
 * instructions all the same, so a skill of yours can be mended; `users` the agents, of either place, that give this very folder, as their
 * start would find it; `copyHint` the command that takes it to the other place, since the api writes no checkout — null for a builtin
 * skill.
 */
export type SkillDetail = {
  skill: SkillRow;
  version: string;
  draft: SkillDraft | null;
  body: string;
  users: SkillUser[];
  copyHint: string | null;
};

/** What a write of a skill answers: the skill as it now reads, and what was written. */
export type SkillSaved = SkillDetail & { written: string[] };

/**
 * Where the skill `name` of `from` is: your library's folder of it, the repository's — its `.claude/skills/` first, then
 * `workflows/skills/`: the order its page takes, while a start of an agent of the repository's finds `workflows/skills/` first — or
 * Nemia's builtin skills. Null when that place has none.
 */
export function skillDirOf(from: SkillSource, name: string, repo: string, home: string, builtin: string = BUILTIN_SKILLS): string | null {
  const places =
    from === 'yours'
      ? [librarySkills(home)]
      : from === 'builtin'
        ? [builtin]
        : [repoSkillsDir(repo), path.join(path.resolve(repo), 'workflows', SKILLS_FOLDER)];
  return skillDirIn(places, name);
}

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

/**
 * The skill `name` of `from` read now, for its page, the agents that give it read through the doors over `inRequest`. Null when that
 * place has no such skill. A SKILL.md that cannot be read, or does not read as a draft, leaves `draft` null, the row saying why, and the
 * page is filled from the body.
 */
export async function skillDetail(
  e: Engine['Service'],
  on: RunsOn,
  inRequest: InRequest,
  from: SkillSource,
  name: string,
  repo: string,
  home: string,
  builtin: string = BUILTIN_SKILLS,
): Promise<SkillDetail | null> {
  const dir = skillDirOf(from, name, repo, home, builtin);
  if (dir === null) return null;
  const users = await inRequest(skillUsers(dir, name, repo, home));
  const { text, version, ...read } = (await runPlaced({ ...on, home }, e, READ.handler({ from, name, dir }, undefined, home))) as SkillPage;
  const skill = skillRow(
    name,
    dir,
    from,
    read,
    users.filter((user) => user.from === 'yours').map((user) => user.name),
  );
  const file = path.join(dir, 'SKILL.md');
  let draft: SkillDraft | null = null;
  try {
    draft = skillDraftOf(file, name, text);
  } catch {}
  let body: string;
  try {
    body = splitFrontmatter(file, text).body;
  } catch {
    body = text.trim();
  }
  const copyHint =
    from === 'yours' ? skillCopyCommand(dir, repoSkillsDir(repo)) : from === 'repo' ? skillCopyCommand(dir, librarySkills(home)) : null;
  return { skill, version: version ?? '', draft, body, users, copyHint };
}

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
 * A skill of yours written into the library through the table's `skills write` (`WRITE`), and answered as its page reads it now. `name`
 * is the skill's name on the path, none for a skill made. Throws what the package refuses, which `app.onError` answers by its kind.
 */
export async function written(
  e: Engine['Service'],
  on: RunsOn,
  inRequest: InRequest,
  change: SkillChange,
  { version, name }: { version: string | null; name?: string },
  repo: string,
  home: string,
): Promise<{ status: 200 | 201; body: SkillSaved } | { status: 500; error: string }> {
  const args = {
    from: 'yours',
    change: JSON.stringify(change),
    ...(version !== null && { version }),
    ...(name !== undefined && { name }),
  };
  const wrote = (await runPlaced({ ...on, home }, e, WRITE.handler(args, undefined, home))) as SkillWritten;
  const detail = await skillDetail(e, on, inRequest, 'yours', wrote.name, repo, home);
  if (detail === null) return { status: 500, error: `${wrote.dir} was written, and then could not be read back.` };
  return { status: version === null ? 201 : 200, body: { ...detail, written: wrote.written } };
}
