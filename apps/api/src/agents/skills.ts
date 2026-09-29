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
 *
 * And one skill on a page of its own (`skillDetail`), and one of yours written on the board (`writeSkill`): made, changed at the version it was
 * read at, or its `preload:` alone switched. Every write is to your library; the api writes nothing into a checkout, so a skill of the
 * repository's is read there, and a page says the `cp -r` that moves a skill between the two.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentSkillsFound,
  copySkill,
  HOME,
  listAgents,
  loadAgents,
  SkillWriteError,
  skillsFor,
  skillVersion,
  writeSkill,
  type AgentPlace,
  type SkillChange,
  type SkillCopied,
  type SkillWritten,
} from 'agent-orchestrator';
import {
  AGENTS_FOLDER,
  SKILLS_FOLDER,
  skillDraftOf,
  skillEntryOf,
  skillNameRefusal,
  skillTurnCost,
  splitFrontmatter,
  WorkflowError,
  type AgentSkill,
  type SkillCost,
  type SkillDraft,
} from 'agent-orchestrator/workflow';
import { readBody, valueAt, type BodyIssue, type Words } from '../body.ts';
import { HOME_REPO, repoOf } from '../capabilities/capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { placesOf } from '../workflows/workflows.ts';

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

/** Where an agent of yours finds its skills on `repo`: the same call a start makes for it, and `skillsOfPlace` in agents.ts. */
const skillsOfYours = (repo: string, home: string) => skillsFor(path.join(home, 'workflows', '_'), placesOf(repo, home));

/** Which place a skill's folder is in, by the folder of skills it sits in; `null` for none of them. */
export function sourceOf(dir: string, repo: string, home: string = HOME): SkillSource | null {
  const parent = path.dirname(path.resolve(dir));
  if (parent === librarySkills(home)) return 'yours';
  if (parent === SHIPPED_SKILLS) return 'shipped';
  if (
    parent === path.join(path.resolve(repo), '.claude', SKILLS_FOLDER) ||
    parent === path.join(path.resolve(repo), 'workflows', SKILLS_FOLDER)
  )
    return 'repo';
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
  if (linked)
    return {
      ...row,
      error: `${path.relative(path.dirname(dir), linked)} is a link, and what it points at is outside the folder of skills: make it a folder of its own.`,
    };
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ...row, error: `${file} cannot be read (${err instanceof Error ? err.message : String(err)}).` };
  }
  const cost = skillTurnCost(name, text);
  try {
    return { ...row, entry: skillEntryOf(file, name, text), preload: cost.preload, cost };
  } catch (err) {
    return { ...row, error: err instanceof Error ? err.message : String(err), preload: cost.preload, cost };
  }
}

/** The agents of yours, by name, each with the skills its `skills:` gives: the ones that read. */
function yourAgentsSkills(home: string): Array<[string, string[]]> {
  return [...loadAgents(path.join(home, 'workflows', AGENTS_FOLDER))].flatMap(([name, agent]) =>
    agent instanceof Error ? [] : [[name, agent.skills ?? []] as [string, string[]]],
  );
}

/** The skill folders of `dir` by name, each a folder holding a SKILL.md, as `skillsFor` reads one. */
function skillFolders(dir: string): string[] {
  let names: string[];
  try {
    names = fs.readdirSync(dir).sort();
  } catch {
    return [];
  }
  return names.filter((name) => fs.statSync(path.join(dir, name, 'SKILL.md'), { throwIfNoEntry: false })?.isFile());
}

/**
 * Every skill the picker lists, by place: yours, then the repository's — each name where an agent of yours finds it, so a name in both is in
 * yours alone — then what HKB ships, each marked where an agent of yours already finds a skill of its name. A name both of one repository's
 * places for skills have, which happens only when the store is in that repository and nothing says which is given, is listed in yours with
 * the package's refusal as its `error`.
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
      places[0].skills.push({ ...skillRow(name, path.join(places[0].dir, name), 'yours', usedBy(name)), entry: null, error: at.message });
      where.set(name, 'yours');
      continue;
    }
    const from = sourceOf(at, repo, home) === 'yours' ? 'yours' : 'repo';
    places[from === 'yours' ? 0 : 1].skills.push(skillRow(name, at, from, usedBy(name)));
    where.set(name, from);
  }
  places.push({
    from: 'shipped',
    dir: shipped,
    skills: skillFolders(shipped).map((name) => skillRow(name, path.join(shipped, name), 'shipped', [], where.get(name) ?? null)),
  });
  return places;
}

/** A skill an agent gives, as its page lists it: where it is found, and what it costs a turn — or why none is found. */
export type GivenSkill = {
  name: string;
  from: SkillSource | null;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
};

/**
 * The skills an agent gives, one row each in its order, each found where a start finds it (`found`, the agent's `skillsFor`). A skill no place
 * has is a row with the refusal the card says; one found in a place the board does not list reads `from: null`.
 */
export function givenSkills(
  skills: readonly string[],
  found: ReturnType<typeof skillsFor>,
  repo: string,
  home: string = HOME,
): GivenSkill[] {
  return skills.map((name) => {
    const at = found.at.get(name);
    if (at instanceof WorkflowError) return { name, from: null, entry: null, error: at.message, preload: false, cost: null };
    if (at === undefined)
      return {
        name,
        from: null,
        entry: null,
        error: `No skills folder has \`${name}\` — looked in ${found.looked.join(', ')}.`,
        preload: false,
        cost: null,
      };
    const from = sourceOf(at, repo, home);
    const { entry, error, preload, cost } = skillRow(name, at, from ?? 'repo');
    return { name, from, entry, error, preload, cost };
  });
}

const COPY_SHAPE = '`{ "copy": "<the name of a skill HKB ships>" }`';
const DRAFT_SHAPE =
  '`{ "name": "<a-name>", "title": "<a title, or null>", "description": "<what it does, one line>", "tags": ["<a word>"] or null, "examples": ["<what a person would ask>"] or null, "preload": true or false, "body": "<its instructions>" }`';
const POST_SHAPE = `${COPY_SHAPE}, or \`{ "skill": ${DRAFT_SHAPE.slice(1, -1)} }\``;
const PUT_SHAPE = `\`{ "version": "<as GET /api/skills/yours/<name> answers it>", "skill": ${DRAFT_SHAPE.slice(1, -1)} }\`, or \`{ "version": "…", "preload": true or false }\``;

/** A skill's keys, in the order they are refused; each value is then judged by the package, which says what is wrong with it in its words. */
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

/** A new skill: one HKB ships, copied, or one you wrote (`oneOf` says which the request sent). */
const POST_BODY = Schema.Struct({ copy: Schema.optionalKey(Schema.String), skill: Schema.optionalKey(SKILL_DRAFT) });

/** A skill changed at its version: written whole, or its `preload:` alone (`oneOf` says which the request sent). */
const PUT_BODY = Schema.Struct({
  version: Schema.NonEmptyString,
  skill: Schema.optionalKey(SKILL_DRAFT),
  preload: Schema.optionalKey(Schema.Boolean),
});

/** Why a body sent both of `one` and `other`, or neither (400), in the route's words; undefined when it sent one. */
function oneOf(body: unknown, one: string, other: string, said: (sent: 'both' | 'neither') => string): string | undefined {
  const has = (key: string) => valueAt(body, [key]) !== undefined;
  return has(one) === has(other) ? said(has(one) ? 'both' : 'neither') : undefined;
}

/** Why `skill` is not a skill (400), by the first of its keys refused, `path` from the skill down. */
function draftWords([key]: ReadonlyArray<PropertyKey>, skill: unknown, route: string, shape: string): string {
  const wrong = (what: string) => `${route}: ${what}. Send ${shape}.`;
  if (key === 'name')
    return wrong(`\`name\` is the skill's name, its folder, a string, and this request's was ${JSON.stringify(valueAt(skill, ['name']))}`);
  if (key === 'title' || key === 'description') return wrong(`\`${key}\` is a line of text, or null`);
  if (key === 'tags' || key === 'examples') return wrong(`\`${key}\` is a list of lines of text, or null`);
  if (key === 'preload') return wrong('`preload` is true or false');
  if (key === 'body')
    return wrong(`\`body\` is the skill's instructions, a string, and this request's was ${JSON.stringify(valueAt(skill, ['body']))}`);
  return wrong(`\`skill\` is the skill, an object, and this request's was ${JSON.stringify(skill)}`);
}

/** A POST's `oneOf` sentence. */
const copyOrSkill = (route: string) => (sent: 'both' | 'neither') =>
  `${route} takes one of \`copy\` — a skill HKB ships, copied — and \`skill\` — one you wrote — and this request sent ${sent}. Send ${POST_SHAPE}.`;

/** A PUT's `oneOf` sentence. */
const skillOrPreload = (route: string) => (sent: 'both' | 'neither') =>
  `${route} takes one of \`skill\` — the whole skill, from its form — and \`preload\` — its switch alone — and this request sent ${sent}. Send ${PUT_SHAPE}.`;

/** Why a POST's body is not a new skill: not an object, not one of `copy` and `skill`, then the one it sent. */
function postWords(route: string): Words {
  return ({ path: [key, ...rest], input }: BodyIssue, body: unknown) => {
    if (key === undefined) return `${route} takes a JSON object: ${POST_SHAPE}.`;
    const one = oneOf(body, 'skill', 'copy', copyOrSkill(route));
    if (one) return one;
    if (key === 'skill') return draftWords(rest, valueAt(body, ['skill']), route, POST_SHAPE);
    return `${route}: \`copy\` is the name of the skill HKB ships to copy, a string, and this request's was ${JSON.stringify(input)}. Send ${COPY_SHAPE}.`;
  };
}

/** Why a PUT's body is not a change of the skill `name`: not an object, no version, not one of `skill` and `preload`, then the one it sent. */
function putWords(route: string, name: string): Words {
  return ({ path: [key, ...rest], input }: BodyIssue, body: unknown) => {
    if (key === undefined) return `${route} takes a JSON object: ${PUT_SHAPE}.`;
    if (key === 'version')
      return `${route} takes the \`version\` the skill was read at, as GET /api/skills/yours/${name} answers it, so a change of a skill that has changed since is refused rather than written over what changed. This request's was ${JSON.stringify(input)}.`;
    const one = oneOf(body, 'skill', 'preload', skillOrPreload(route));
    if (one) return one;
    if (key === 'skill') return draftWords(rest, valueAt(body, ['skill']), route, PUT_SHAPE);
    return `${route}: \`preload\` is true or false, and this request's was ${JSON.stringify(input)}. Send ${PUT_SHAPE}.`;
  };
}

/** A write of a skill, as the guard's refusals word it (guard.ts). */
const skillGuard = (route: string, method: 'POST' | 'PUT'): Guarded => ({
  route,
  does: method === 'POST' ? 'writes a skill into your library' : 'changes a skill in your library',
  forAnother: 'write one',
  why: 'a skill in your library is what every agent of yours that gives it is told, once a run of a workflow naming that agent starts',
  reach: 'write it on the board',
  instead: 'Write it on the board, or its folder in your library by hand',
  shape: method === 'POST' ? POST_SHAPE : PUT_SHAPE,
});

/** An agent that gives a skill: its place and its name. */
export type SkillUser = { from: AgentPlace; name: string };

/**
 * One skill on its own page. `skill` is its row as the list has it; `version` what a write of it carries back (`skillVersion`); `draft` what
 * its form is filled from (`skillDraftOf`), or null where its SKILL.md does not read — `skill.error` says why, and `body` is its instructions
 * all the same, so a skill of yours can be mended; `users` the agents, of either place, that give this very folder, as their start would find
 * it; `copyHint` the command that takes it to the other place, since the api writes no checkout — null for what HKB ships.
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
 * Where the skill `name` of `from` is: your library's folder of it, the repository's — its `.claude/skills/` first, then `workflows/skills/`,
 * as a start of the repository's finds it — or what HKB ships. Null when that place has none.
 */
export function skillDirOf(
  from: SkillSource,
  name: string,
  repo: string,
  home: string = HOME,
  shipped: string = SHIPPED_SKILLS,
): string | null {
  const places =
    from === 'yours'
      ? [librarySkills(home)]
      : from === 'shipped'
        ? [shipped]
        : [path.join(path.resolve(repo), '.claude', SKILLS_FOLDER), path.join(path.resolve(repo), 'workflows', SKILLS_FOLDER)];
  const dir = places
    .map((place) => path.join(place, name))
    .find((at) => fs.lstatSync(path.join(at, 'SKILL.md'), { throwIfNoEntry: false }));
  return dir ?? null;
}

/** The agents of both places that give the skill whose folder is `dir`, each as its own start finds the skill it names. */
export function skillUsers(dir: string, name: string, repo: string): SkillUser[] {
  const found = new Map<string, ReturnType<typeof agentSkillsFound>>();
  const at = path.resolve(dir);
  return listAgents(repo).flatMap(({ from, dir: agents, name: agent, agent: read }) => {
    if (read instanceof Error || !read.skills?.includes(name)) return [];
    if (!found.has(agents)) found.set(agents, agentSkillsFound(agents, repo));
    const given = found.get(agents)!.at.get(name);
    return typeof given === 'string' && path.resolve(given) === at ? [{ from, name: agent }] : [];
  });
}

export const quoted = (text: string): string => `'${text.replace(/'/g, `'\\''`)}'`;

/**
 * The command a person runs to copy the skill folder `dir` into the skills folder `into`, as `into/<name>/`. `cp -r dir into/` makes `into`
 * itself the copy when `into` is not there yet — a repository with a `.claude/` and no `skills/` would get `skills/SKILL.md` — so it makes
 * `into` first; and each path is quoted, for a home with a space in it.
 */
export const copyCommand = (dir: string, into: string): string => `mkdir -p ${quoted(into)} && cp -r ${quoted(dir)} ${quoted(`${into}/`)}`;

/**
 * The skill `name` of `from` read now, for its page. Null when that place has no such skill. A SKILL.md that cannot be read, or does not
 * read as a draft, leaves `draft` null, the row saying why, and the page is filled from the body.
 */
export function skillDetail(
  from: SkillSource,
  name: string,
  repo: string,
  home: string = HOME,
  shipped: string = SHIPPED_SKILLS,
): SkillDetail | null {
  const dir = skillDirOf(from, name, repo, home, shipped);
  if (dir === null) return null;
  const users = skillUsers(dir, name, repo);
  const skill = skillRow(
    name,
    dir,
    from,
    users.filter((user) => user.from === 'yours').map((user) => user.name),
  );
  const file = path.join(dir, 'SKILL.md');
  let text = '';
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {}
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
    from === 'yours'
      ? copyCommand(dir, path.join(path.resolve(repo), '.claude', SKILLS_FOLDER))
      : from === 'repo'
        ? copyCommand(dir, librarySkills(home))
        : null;
  return { skill, version: skillVersion(dir) ?? '', draft, body, users, copyHint };
}

/** A draft from a skill as sent, refused (400) when it has a key no skill has: each value is then judged by the package, in its words. */
function skillDraftFrom(skill: typeof SKILL_DRAFT.Type, route: string, shape: string): SkillDraft | Refusal {
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
 * A write of a skill the package refused, as the api answers it: one not there is 404; taken or stale is 409; the rest, 422. Throws any
 * error that is not a `SkillWriteError` on to `app.onError` (app.ts), which answers a refusal by its kind and anything else a 500.
 */
function writeRefused(err: unknown): Refusal {
  if (!(err instanceof SkillWriteError)) throw err;
  return { status: err.why === 'missing' ? 404 : err.why === 'exists' || err.why === 'stale' ? 409 : 422, error: err.message };
}

/** A skill of yours written into the library, and answered as its page reads it now. */
function written(
  change: SkillChange,
  version: string | null,
  repo: string,
): { status: 200 | 201; body: SkillSaved } | Refusal | { status: 500; error: string } {
  let wrote: SkillWritten;
  try {
    wrote = writeSkill(librarySkills(), change, { version });
  } catch (err) {
    return writeRefused(err);
  }
  const detail = skillDetail('yours', wrote.name, repo);
  if (detail === null) return { status: 500, error: `${wrote.dir} was written, and then could not be read back.` };
  return { status: version === null ? 201 : 200, body: { ...detail, written: wrote.written } };
}

/** The repository's skills are the checkout's: the api writes none of them, and says how a person does. */
const repoRefusal = (route: string, name: string | null, repo: string): string => {
  const theirs = path.join(repo, '.claude', SKILLS_FOLDER);
  return `${route} refuses to write the repository's skills (${theirs}): the board writes only your library, in ${librarySkills()}, and the api writes nothing into a checkout. Write the skill in your library, then copy its folder into the repository by hand — \`${copyCommand(path.join(librarySkills(), name ?? '<name>'), theirs)}\` — where git shows it as a change to commit.`;
};

/**
 * The skills' routes. Each write is guarded (guard.ts) and writes only your library: 403 for the repository's (`repoRefusal`), 400 for
 * any other place; a write the package refuses is answered as `written` and `writeRefused` say, and any other refusal by its kind (`app.onError`).
 *
 * - `GET /api/skills` — every skill by place (`listSkills`), read from disk on each request, so a skill a person has just written lists as
 *   it is now.
 * - `GET /api/skills/:from/:name` — one skill, on its page (`skillDetail`): where it is, what it says, what it costs a turn, and the agents
 *   that give it. 400 for a place that is not `yours`, `repo` or `shipped`, or a name that is not a skill's; 404 for one the place has not.
 * - `POST /api/skills/:from` — a skill of yours made: written on the board (`skill`), or one HKB ships copied under its name (`copy`),
 *   one of the two; refused, in the package's words, where the library has the name already. 201.
 * - `PUT /api/skills/:from/:name` — a skill of yours changed at the `version` it was read at: written whole from its form (`skill`), or its
 *   `preload:` alone, from its switch (`preload`). Either is a change of every agent that gives it. 400 for a form that names the skill
 *   otherwise: its name is its folder.
 */
export const skills = new Hono()
  .get('/api/skills', (c) => c.json(listSkills(repoOf())))
  .get('/api/skills/:from/:name', (c) => {
    const { from, name } = c.req.param();
    if (from !== 'yours' && from !== 'repo' && from !== 'shipped')
      return c.json(
        {
          error: `GET /api/skills/${from}/${name}: a skill is yours, the repository's or shipped, and this request named ${JSON.stringify(from)}.`,
        },
        400,
      );
    const wrong = skillNameRefusal(name);
    if (wrong) return c.json({ error: wrong }, 400);
    const detail = skillDetail(from, name, repoOf());
    if (detail === null)
      return c.json(
        {
          error: `No skill named ${name} in ${from === 'yours' ? 'your library' : from === 'repo' ? "the repository's skills" : 'the skills HKB ships'}. GET /api/skills lists them.`,
        },
        404,
      );
    return c.json(detail);
  })
  .post('/api/skills/:from', async (c) => {
    const { from } = c.req.param();
    const route = `POST /api/skills/${from}`;
    const refused = refusedBeforeReading(
      skillGuard(route, 'POST'),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    const library = librarySkills();
    if (from === 'repo') return c.json({ error: repoRefusal(route, null, repoOf()) }, 403);
    if (from !== 'yours')
      return c.json(
        {
          error: `${route}: the board writes a skill into your library, at /api/skills/yours. This request named ${JSON.stringify(from)}.`,
        },
        400,
      );
    const read = await readBody(c.req, POST_BODY, `${route} takes a JSON body: ${POST_SHAPE}.`, postWords(route));
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { copy: name, skill } = read.body;
    const one = oneOf(read.body, 'skill', 'copy', copyOrSkill(route));
    if (one) return c.json({ error: one }, 400);
    if (skill) {
      const draft = skillDraftFrom(skill, route, POST_SHAPE);
      if ('status' in draft) return c.json({ error: draft.error }, draft.status);
      const answer = written(draft, null, repoOf());
      return 'body' in answer ? c.json(answer.body, answer.status) : c.json({ error: answer.error }, answer.status);
    }
    if (name === undefined) return c.json({ error: copyOrSkill(route)('neither') }, 400);
    let copied: SkillCopied;
    try {
      copied = copySkill(SHIPPED_SKILLS, library, name);
    } catch (err) {
      const answer = writeRefused(err);
      return c.json({ error: answer.error }, answer.status);
    }
    const agents = yourAgentsSkills(HOME)
      .filter(([, given]) => given.includes(name))
      .map(([agent]) => agent);
    return c.json({ skill: skillRow(name, copied.dir, 'yours', agents), written: copied.written } satisfies SkillAdded, 201);
  })
  .put('/api/skills/:from/:name', async (c) => {
    const { from, name } = c.req.param();
    const route = `PUT /api/skills/${from}/${name}`;
    const refused = refusedBeforeReading(
      skillGuard(route, 'PUT'),
      c.req.header('host'),
      c.req.header('sec-fetch-site'),
      c.req.header('content-type'),
    );
    if (refused) return c.json({ error: refused.error }, refused.status);
    if (from === 'repo') return c.json({ error: repoRefusal(route, name, repoOf()) }, 403);
    if (from !== 'yours')
      return c.json(
        {
          error: `${route}: the board changes a skill of your library, at /api/skills/yours/<name>. This request named ${JSON.stringify(from)}.`,
        },
        400,
      );
    const read = await readBody(c.req, PUT_BODY, `${route} takes a JSON body: ${PUT_SHAPE}.`, putWords(route, name));
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const { version, skill, preload } = read.body;
    const one = oneOf(read.body, 'skill', 'preload', skillOrPreload(route));
    if (one) return c.json({ error: one }, 400);
    let change: SkillChange;
    if (skill) {
      const draft = skillDraftFrom(skill, route, PUT_SHAPE);
      if ('status' in draft) return c.json({ error: draft.error }, draft.status);
      if (draft.name !== name) {
        return c.json(
          {
            error: `${route}: the skill is named ${name}, and this request's is ${JSON.stringify(draft.name)}. A skill's name is its folder, and every agent that gives it names it: write a new skill under the new name, and give it in their place.`,
          },
          400,
        );
      }
      change = draft;
    } else if (preload !== undefined) {
      change = { name, preload };
    } else {
      return c.json({ error: skillOrPreload(route)('neither') }, 400);
    }
    const answer = written(change, version, repoOf());
    return 'body' in answer ? c.json(answer.body, answer.status) : c.json({ error: answer.error }, answer.status);
  });
