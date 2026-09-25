/**
 * The skills an agent of yours can be given, as the board's skill picker lists them, and a skill HKB ships copied into your library.
 *
 * An agent of yours finds a skill as a start finds it (`lookupRoots`): the store's `workflows/skills/` — your library — then the `.claude/skills/`
 * of the repository the board serves. The first that has a name wins, so a name in both is listed once, in your library. The skills HKB ships,
 * `workflows/skills/` of the checkout the api runs from, are not among them: an agent of the store never finds one there, so a shipped skill is
 * copied into your library first (`copySkill`, a write of its own, before and apart from any save of the agent).
 *
 * Each skill is listed with its card entry or the package's refusal of it (a SKILL.md with no description can be given to no agent), whether it
 * is loaded every turn (`preload: true`), what it costs a turn (`skillTurnCost`: about, at four characters a token), and the agents of yours
 * that give it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { copySkill, HOME, loadAgents, SkillWriteError, skillsFor, type SkillCopied } from 'agent-orchestrator';
import { AGENTS_FOLDER, SKILLS_FOLDER, skillEntryOf, skillTurnCost, WorkflowError, type AgentSkill, type SkillCost } from 'agent-orchestrator/workflow';
import { HOME_REPO, repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded } from './guard.ts';
import { placesOf } from './workflows.ts';

/** Where a skill is: your library (the store's), the repository the board serves (its `.claude/skills/`, or `workflows/skills/` beside its agents), or what HKB ships. */
export type SkillSource = 'yours' | 'repo' | 'shipped';

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
  /** A shipped skill's name, where an agent of yours already finds a skill of it: in your library, or in the repository. Null elsewhere. */
  found: 'yours' | 'repo' | null;
};

/** One place the picker lists, in the order an agent of yours finds a name, the shipped last: its skills by name. */
export type SkillPlace = { from: SkillSource; dir: string; skills: SkillRow[] };

/** What a copy answers: the skill as it now reads in your library, and its files by their path in it. */
export type SkillAdded = { skill: SkillRow; written: string[] };

/** `workflows/skills/` of the checkout the api runs from: the skills HKB ships. */
export const SHIPPED_SKILLS = path.join(HOME_REPO, 'workflows', SKILLS_FOLDER);

/** Your library: the store's `workflows/skills/`, where the board copies a skill. */
export const librarySkills = (home: string = HOME): string => path.join(home, 'workflows', SKILLS_FOLDER);

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Where an agent of yours finds its skills on `repo`: the same call a start makes for it, and `skillsOfPlace` in agents.ts. */
const skillsOfYours = (repo: string, home: string) => skillsFor(path.join(home, 'workflows', '_'), placesOf(repo, home));

/** Which place a skill's folder is in, by the folder of skills it sits in; `null` for none of them. */
export function sourceOf(dir: string, repo: string, home: string = HOME): SkillSource | null {
  const parent = path.dirname(path.resolve(dir));
  if (parent === librarySkills(home)) return 'yours';
  if (parent === SHIPPED_SKILLS) return 'shipped';
  if (parent === path.join(path.resolve(repo), '.claude', SKILLS_FOLDER) || parent === path.join(path.resolve(repo), 'workflows', SKILLS_FOLDER)) return 'repo';
  return null;
}

/**
 * One skill read now: its entry or why it has none, and its cost. A folder or SKILL.md that is a link is refused unread: what it points at is
 * outside the folder, and the copy refuses one too.
 */
export function skillRow(name: string, dir: string, from: SkillSource, usedBy: string[] = [], found: SkillRow['found'] = null): SkillRow {
  const file = path.join(dir, 'SKILL.md');
  const row: SkillRow = { name, from, dir, entry: null, error: null, preload: false, cost: null, usedBy, found };
  const linked = [dir, file].find((at) => fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink());
  if (linked) return { ...row, error: `${path.relative(path.dirname(dir), linked)} is a link, and what it points at is outside the folder of skills: make it a folder of its own.` };
  let text: string;
  try { text = fs.readFileSync(file, 'utf8'); } catch (err) { return { ...row, error: `${file} cannot be read (${messageOf(err)}).` }; }
  const cost = skillTurnCost(name, text);
  try {
    return { ...row, entry: skillEntryOf(file, name, text), preload: cost.preload, cost };
  } catch (err) {
    return { ...row, error: messageOf(err), preload: cost.preload, cost };
  }
}

/** The agents of yours, by name, each with the skills its `skills:` gives: the ones that read. */
function yourAgentsSkills(home: string): Array<[string, string[]]> {
  return [...loadAgents(path.join(home, 'workflows', AGENTS_FOLDER))].flatMap(([name, agent]) => (agent instanceof Error ? [] : [[name, agent.skills ?? []] as [string, string[]]]));
}

/** The skill folders of `dir` by name, each a folder holding a SKILL.md, as `skillsFor` reads one. */
function skillFolders(dir: string): string[] {
  let names: string[];
  try { names = fs.readdirSync(dir).sort(); } catch { return []; }
  return names.filter((name) => fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile());
}

/**
 * Every skill the picker lists, by place: yours, then the repository's — each name where an agent of yours finds it, so a name in both is in
 * yours alone — then what HKB ships, each marked where an agent of yours already finds a skill of its name.
 */
export function listSkills(repo: string, home: string = HOME, shipped: string = SHIPPED_SKILLS): SkillPlace[] {
  const found = skillsOfYours(repo, home);
  const agents = yourAgentsSkills(home);
  const usedBy = (name: string) => agents.filter(([, skills]) => skills.includes(name)).map(([agent]) => agent);
  const places: SkillPlace[] = [
    { from: 'yours', dir: librarySkills(home), skills: [] },
    { from: 'repo', dir: path.join(path.resolve(repo), '.claude', SKILLS_FOLDER), skills: [] },
  ];
  const where = new Map<string, 'yours' | 'repo'>();
  for (const [name, at] of [...found.at].sort(([a], [b]) => a.localeCompare(b))) {
    if (at instanceof WorkflowError) {
      // One repository's two places for skills both have it: only when the store is in that repository, and nothing says which is given.
      places[0]!.skills.push({ ...skillRow(name, path.join(places[0]!.dir, name), 'yours', usedBy(name)), entry: null, error: at.message });
      where.set(name, 'yours');
      continue;
    }
    const from = sourceOf(at, repo, home) === 'yours' ? 'yours' : 'repo';
    places[from === 'yours' ? 0 : 1]!.skills.push(skillRow(name, at, from, usedBy(name)));
    where.set(name, from);
  }
  places.push({ from: 'shipped', dir: shipped, skills: skillFolders(shipped).map((name) => skillRow(name, path.join(shipped, name), 'shipped', [], where.get(name) ?? null)) });
  return places;
}

/** A skill an agent gives, as its page lists it: where it is found, and what it costs a turn — or why none is found. */
export type GivenSkill = { name: string; from: SkillSource | null; entry: AgentSkill | null; error: string | null; preload: boolean; cost: SkillCost | null };

/**
 * The skills an agent gives, one row each in its order, each found where a start finds it (`found`, the agent's `skillsFor`). A skill no place
 * has is a row with the refusal the card says; one found in a place the board does not list reads `from: null`.
 */
export function givenSkills(skills: readonly string[], found: ReturnType<typeof skillsFor>, repo: string, home: string = HOME): GivenSkill[] {
  return skills.map((name) => {
    const at = found.at.get(name);
    if (at instanceof WorkflowError) return { name, from: null, entry: null, error: at.message, preload: false, cost: null };
    if (at === undefined) return { name, from: null, entry: null, error: `No skills folder has \`${name}\` — looked in ${found.looked.join(', ')}.`, preload: false, cost: null };
    const from = sourceOf(at, repo, home);
    const { entry, error, preload, cost } = skillRow(name, at, from ?? 'repo');
    return { name, from, entry, error, preload, cost };
  });
}

const COPY_SHAPE = '`{ "copy": "<the name of a skill HKB ships>" }`';

/** The copy, as the guard's refusals word it (guard.ts). */
const skillGuard = (route: string): Guarded => ({
  route,
  does: 'copies a skill into your library',
  forAnother: 'write one',
  why: "a skill in your library is what every agent of yours that gives it is told, once a run of a workflow naming that agent starts",
  reach: "add it on an agent's page on the board",
  instead: "Add it on an agent's page on the board, or copy its folder into your library by hand",
  shape: COPY_SHAPE,
});

export const skills = new Hono()
  // Read from disk on each request, so a skill a person has just written lists as it is now.
  .get('/api/skills', (c) => {
    try {
      return c.json(listSkills(repoOf()));
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // A skill HKB ships copied into your library, under its name: refused, in the package's words, where the library has the name already.
  .post('/api/skills/:from', async (c) => {
    const { from } = c.req.param();
    const route = `POST /api/skills/${from}`;
    const refused = refusedBeforeReading(skillGuard(route), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const library = librarySkills();
    if (from === 'repo') {
      return c.json({ error: `${route} refuses to write the repository's skills (${path.join(repoOf(), '.claude', SKILLS_FOLDER)}): the board writes only your library, in ${library}, and the api writes nothing into a checkout. Copy the skill into your library, then its folder into the repository by hand, where git shows it as a change to commit.` }, 403);
    }
    if (from !== 'yours') return c.json({ error: `${route}: the board copies a skill into your library, at /api/skills/yours. This request named ${JSON.stringify(from)}.` }, 400);
    let body: unknown;
    try { body = await c.req.json(); } catch { return c.json({ error: `${route} takes a JSON body: ${COPY_SHAPE}.` }, 400); }
    const name = typeof body === 'object' && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>).copy : undefined;
    if (typeof name !== 'string') return c.json({ error: `${route}: \`copy\` is the name of the skill HKB ships to copy, a string, and this request's was ${JSON.stringify(name)}. Send ${COPY_SHAPE}.` }, 400);
    let copied: SkillCopied;
    try {
      copied = copySkill(SHIPPED_SKILLS, library, name);
    } catch (err) {
      if (err instanceof SkillWriteError) return c.json({ error: err.message }, err.why === 'missing' ? 404 : err.why === 'exists' ? 409 : 422);
      return c.json({ error: messageOf(err) }, 500);
    }
    const agents = yourAgentsSkills(HOME).filter(([, given]) => given.includes(name)).map(([agent]) => agent);
    return c.json({ skill: skillRow(name, copied.dir, 'yours', agents), written: copied.written } satisfies SkillAdded, 201);
  });
