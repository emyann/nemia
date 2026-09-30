/**
 * The board's agents (`agents/` beside each place it lists workflows from): each listed with the steps that name it, one read, and one of
 * yours made, put back or removed through the package's `writeAgent` and `removeAgent`.
 *
 * A step is a node of a workflow, and an agent is one thing a node may have attached (`agent:`): what the node's work is told first and
 * runs with. So an agent lists the nodes that name it, and an edit of one changes each of them — in what a later `wf start` freezes, and
 * nothing else: a run froze its folder and the agents its steps name when it started.
 *
 * The repository's agents are read-only here, as its workflows are: the api writes nothing into a checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  AgentWriteError,
  agentUsers,
  agentVersion,
  cardSkills,
  listRuns,
  loadAgents,
  removeAgent,
  skillsFor,
  start,
  writeAgent,
  type AgentSchema,
} from 'agent-orchestrator';
import {
  AGENTS_FOLDER,
  agentCard,
  agentNameRefusal,
  type AgentCardShape,
  type AgentDraft,
  type AgentSkill,
  type RoleKey,
  type SkillsFound,
} from 'agent-orchestrator/workflow';
import { readBody, valueAt, type BodyIssue, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import { judgedNow } from '../runs/runs.ts';
import { copyCommand, givenSkills, librarySkills, type GivenSkill } from './skills.ts';
import { empty, unreadListing } from './listing.ts';
import { tryOf, untriedOf, writeTryFolder, type Untried } from './try.ts';
import { placesOf, sourcesOf, type WorkflowSource } from '../workflows/workflows.ts';

/** A node that names an agent: the step `step` of the workflow `workflow`, read from `from` — the agent's own place. */
export type AgentUser = { from: WorkflowSource; workflow: string; step: string };

/**
 * One agent as the board lists it: its file's keys as written, its instructions, the result schema its `output:` names as that file holds
 * it, the skills its `skills:` gives its sessions and its `systemPrompt:`, each as written, what its card says it can do, the file's text,
 * its version (`agentVersion`, what a write carries), and the nodes that name it. `error` is the parser's refusal of a file that does not
 * read, whose keys are then its lines as written, so the form can show what to fix.
 */
export type AgentListing = {
  name: string;
  from: WorkflowSource;
  dir: string;
  file: string;
  /** The job it holds (`role:`), as its file writes it: `Product engineer`. Null when it says none. */
  role: string | null;
  description: string | null;
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  schema: AgentSchema | null;
  /**
   * What its card says it can do, generated (`cardSkills`): an A2A skill for each skill its `skills:` gives, read off the
   * skill's SKILL.md, or one made from its description when it gives none. Nobody writes it: the board shows it, read-only. Null when there
   * is none — a file that does not read (`error` says why), or a card the package refuses (`cardError`).
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
   * Each skill its `skills:` gives, in its order: where a start finds it — your library, the repository, or none — its card entry or why it
   * has none, and what it costs a turn (skills.ts). Empty for none, and for a file that does not read.
   */
  given: GivenSkill[];
  /** What becomes of Claude Code's system prompt, as written: `default`, `no-coding` or `own`; null for none, which is `default`. */
  systemPrompt: string | null;
  source: string;
  version: string;
  usedBy: AgentUser[];
  error: string | null;
  /**
   * Why it cannot be tried from the board, and the command that copies it to yours when that is the fix, in the store the api reads
   * (`untriedOf`, which the try's route refuses on); null when nothing does. The page draws it in place of the Try it button.
   */
  untried: Untried | null;
};

/**
 * Where an agent of `dir` finds its skills, as a start on `repo` does (`lookupRoots`): the `skills/` beside its folder, then the
 * repository's `.claude/skills/`, then the store's. What its version digests and its card is read from.
 */
const skillsOfPlace = (dir: string, repo: string, home: string): SkillsFound =>
  skillsFor(path.join(path.dirname(dir), '_'), placesOf(repo, home));

/** Where the agents of each place are: `<workflows>/agents`, the repository's then yours. */
const agentPlaces = (repo: string, home: string): Array<{ from: WorkflowSource; dir: string }> =>
  sourcesOf(repo, home).map(({ from, dir }) => ({ from, dir: path.join(dir, AGENTS_FOLDER) }));

/** Every agent of each place, by name, each read now from disk. */
export function listAgents(repo: string, home: string): AgentListing[] {
  return agentPlaces(repo, home).flatMap(({ from, dir }) =>
    [...loadAgents(dir).keys()].sort().map((name) => listedAgent(from, dir, name, repo, home)!),
  );
}

/** One agent as the listing has it, its skills found as a start on `repo` finds them, or null when `dir` has no file of that name. */
export function listedAgent(from: WorkflowSource, dir: string, name: string, repo: string, home: string): AgentListing | null {
  const read = readAgent(from, dir, name, repo, home);
  return read && { ...read, untried: untriedOf({ ...read, schemaFile: read.schema?.file ?? null }, home) };
}

/**
 * One agent of `dir` as the listing has it, before whether it can be tried, or null when `dir` has no file of that name. A file that is a
 * link is answered with the package's refusal only: read here it would be whatever it points at, outside the folder. A file that does not
 * read is answered with its lines as written, so what is wrong can be put right in the form: a key under a former name too, as the parser
 * reads it, which the form's save then writes under the name it has; and a codex agent's sandbox under the former key `permissionMode:` is
 * its `sandbox`, as the parser reads it (`formerSandbox`).
 */
function readAgent(from: WorkflowSource, dir: string, name: string, repo: string, home: string): AgentListing | null {
  const found = skillsOfPlace(dir, repo, home);
  const version = agentVersion(dir, name, found);
  if (version === null) return null;
  const file = path.join(dir, `${name}.md`);
  const usedBy = agentUsers(path.dirname(dir), name).map((user) => {
    const [workflow, step] = user.split('/') as [string, string];
    return { from, workflow, step };
  });
  const agent = loadAgents(dir).get(name);
  const linked = (at: string) => Boolean(fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink());
  if (linked(file))
    return {
      ...empty(from, dir, file, name, version, usedBy),
      error: agent instanceof Error ? agent.message : `${AGENTS_FOLDER}/${name}.md is a link.`,
    };
  let source: string;
  try {
    source = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return { ...empty(from, dir, file, name, version, usedBy), error: (err as Error).message };
  }
  const sidecarOf = (named: string | undefined): AgentSchema | null => {
    if (named === undefined || path.isAbsolute(named) || /[\\/]/.test(named) || linked(path.join(dir, named))) return null;
    try {
      return { file: named, text: fs.readFileSync(path.join(dir, named), 'utf8') };
    } catch {
      return null;
    }
  };
  if (agent === undefined || agent instanceof Error)
    return unreadListing(empty(from, dir, file, name, version, usedBy), source, agent, sidecarOf);
  let card: AgentSkill[] | null = null;
  let cardError: string | null = null;
  try {
    card = cardSkills(agent, found);
  } catch (err) {
    cardError = (err as Error).message;
  }
  return {
    name,
    from,
    dir,
    file,
    role: agent.role ?? null,
    description: agent.description ?? null,
    keys: agent.keys,
    body: agent.body,
    schema: sidecarOf(agent.keys.output),
    card,
    cardError,
    skills: agent.skills?.join(', ') ?? null,
    given: givenSkills(agent.skills ?? [], found, repo, home),
    systemPrompt: agent.systemPrompt ?? null,
    source,
    version,
    usedBy,
    error: null,
    untried: null,
  };
}

/**
 * An agent as an A2A Agent Card, and the truth about it: `servedOverA2A` is always false, and `why` says what the shape leaves out and why
 * a client could not call it. The board shows the card with that sentence beside it, so nothing reads as an address.
 */
export type AgentCardAnswer = { card: AgentCardShape; servedOverA2A: false; why: string };

/** What a write of an agent answers with: the agent as it now reads, and its files by name — written, and removed. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

/** A refused write: the package's words, and the steps that still name the agent when that is why. */
export type AgentRefused = { error: string; users: string[] };

const DRAFT =
  '"role"?: "<the job it holds>", "description"?: "<use this when…>", "skills"?: "<skill>, <skill>", "systemPrompt"?: "default" | "no-coding" | "own", "keys": { "model": "opus", "effort": "high", "tools": "Read, Grep", … }, "body": "<its instructions>", "schema"?: { "file": "<name>.schema.json", "text": "<a JSON Schema>" }';
const POST_SHAPE = `\`{ "name": "<agent>", ${DRAFT} }\`, a key unset as null or left out`;
const PUT_SHAPE = `\`{ "version": "<as GET /api/agents lists it>", "name"?: "<its new name>", ${DRAFT} }\`, a key unset as null or left out`;
const DELETE_SHAPE = '`{ "version": "<as GET /api/agents lists it>" }`';
const TRY_SHAPE = '`{ "brief": "<what the agent is asked to do>" }`';

/** An agent's name, refused where it is not one in the package's words (`agentNameRefusal`, through `draftWords`). */
const AgentName = Schema.String.check(Schema.makeFilter((name: string) => agentNameRefusal(name) === undefined));

/**
 * The former keys a page may still send for the card file beside the agent it edited: `card` and `cardText`, or the older `skillsText`.
 * Taken as nothing, the edit would be lost unsaid; the card is generated from the agent's skills, so each is refused, saying so, a null
 * among them too.
 */
const RETIRED = ['card', 'cardText', 'skillsText'] as const;

/** The keys of a draft after its name, in the order they are refused: a key's value is the package's to judge, in its words. */
const DRAFT_FIELDS = {
  card: Schema.optionalKey(Schema.Never),
  cardText: Schema.optionalKey(Schema.Never),
  skillsText: Schema.optionalKey(Schema.Never),
  role: Schema.optionalKey(Schema.NullOr(Schema.String)),
  description: Schema.optionalKey(Schema.NullOr(Schema.String)),
  skills: Schema.optionalKey(Schema.NullOr(Schema.String)),
  systemPrompt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  keys: Schema.optionalKey(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  body: Schema.optionalKey(Schema.String),
  schema: Schema.optionalKey(Schema.NullOr(Schema.Struct({ file: Schema.String, text: Schema.String }))),
};
const POST_BODY = Schema.Struct({ name: AgentName, ...DRAFT_FIELDS });
/** A put's `name`, left out or null, is the agent's own, from the path. */
const PUT_BODY = Schema.Struct({ version: Schema.NonEmptyString, name: Schema.optionalKey(Schema.NullOr(AgentName)), ...DRAFT_FIELDS });
const DELETE_BODY = Schema.Struct({ version: Schema.NonEmptyString });
const TRY_BODY = Schema.Struct({ brief: Schema.String });

/** Why a draft's key is not one (400), by the first its schema refused, and what to send instead. */
function draftWords(route: string, shape: string): Words {
  return ({ path: [key, inner], kind, input }: BodyIssue, body: unknown) => {
    const wrong = (what: string) => `${route}: ${what}. Send ${shape}.`;
    if (key === 'name' && kind === 'check') return agentNameRefusal(input) ?? wrong('`name` is not a name');
    if (key === 'name') return wrong(`\`name\` is the agent's name, a string, and this request's was ${JSON.stringify(input)}`);
    if (RETIRED.some((retired) => retired === key)) {
      const sent = RETIRED.filter((retired) => valueAt(body, [retired]) !== undefined);
      return wrong(
        `${sent.map((retired) => `\`${retired}\``).join(' and ')} named the card file beside the agent, which is retired: an agent's card is generated from its \`skills\`, an entry for each skill read off its SKILL.md, and from its description when it gives none. A page that sends it is stale: reload it, and save again`,
      );
    }
    if (key === 'role') return wrong('`role` is the job the agent holds, a line of text — `"Product engineer"` — or null');
    if (key === 'description') return wrong('`description` is a line of text, or null');
    if (key === 'skills')
      return wrong(
        '`skills` is the skills the agent is given, by name, as its line writes them — `"review-a-change, write-a-note"` — or null',
      );
    if (key === 'systemPrompt') return wrong('`systemPrompt` is `"default"`, `"no-coding"` or `"own"`, or null');
    if (key === 'keys' && inner !== undefined)
      return wrong(`\`keys.${String(inner)}\` is written as a string, as its line in the file is — ${JSON.stringify(input)} is not one`);
    if (key === 'keys') return wrong('`keys` is an object of the role keys the agent sets');
    if (key === 'body') return wrong("`body` is the agent's instructions, a string");
    if (key === 'schema') return wrong('`schema` is the result schema its `output:` names, `{ "file", "text" }`, or null');
    return `${route} takes a JSON object: ${shape}.`;
  };
}

/** What a try answers with: the run it started, which the board follows on the run's page. */
export type AgentTried = { id: string };

/** A try, as the guard's refusals word it (guard.ts). */
const tryGuard = (route: string): Guarded => ({
  route,
  does: 'tries an agent',
  forAnother: 'try one',
  why: 'a try starts a run of the agent, which spends up to its budget once a tick files it',
  reach: "try it on the board's agent page",
  instead: "Try it on the board's agent page",
  shape: TRY_SHAPE,
});

/** A write of yours, as the guard's refusals word it (guard.ts). */
const agentGuard = (route: string, shape: string): Guarded => ({
  route,
  does: 'writes an agent',
  forAnother: 'write one',
  why: "an agent's file is what every step that names it is told and runs with, once a run of its workflow starts",
  reach: "edit it on the board's Agents page",
  instead: "Edit it on the board's Agents page, or edit its file",
  shape,
});

/** Why a write is not to yours: 403 for the repository's, with the copy to make by hand; 400 for anywhere else. */
function yoursOnly(route: string, from: string, name: string | null, repo: string, home: string): Refusal | null {
  if (from === 'yours') return null;
  const yours = path.join(home, 'workflows', AGENTS_FOLDER);
  const theirs = path.join(repo, 'workflows', AGENTS_FOLDER);
  if (from === 'repo') {
    const copy = name ? ` — \`cp ${path.join(theirs, `${name}.md`)} ${yours}/\` starts from this one —` : '';
    return {
      status: 403,
      error: `${route} refuses to write the repository's agents (${theirs}): the board writes only yours, in ${yours}, and the api writes nothing into a checkout. Make the agent in yours${copy} then copy the file into ${theirs} by hand, where git shows it as a change to commit.`,
    };
  }
  return {
    status: 400,
    error: `${route}: an agent is read from \`repo\` or \`yours\`, as GET /api/agents lists each one's \`from\`, and the board writes yours, at /api/agents/yours/…. This request named ${JSON.stringify(from)}.`,
  };
}

/** A draft off a decoded body, each line trimmed, and one with nothing in it unset. */
function draftOf(body: Omit<typeof POST_BODY.Type, 'name'>, name: string): { draft: AgentDraft; schema: AgentSchema | null } {
  const line = (value: string | null | undefined): string | null => (value?.trim() ? value.trim() : null);
  return {
    draft: {
      name,
      role: line(body.role),
      description: line(body.description),
      skills: line(body.skills),
      systemPrompt: line(body.systemPrompt),
      keys: Object.fromEntries(Object.entries(body.keys ?? {}).map(([key, value]) => [key, line(value)])),
      body: body.body ?? '',
    },
    schema: body.schema ?? null,
  };
}

/**
 * A write of an agent the package refused, as the api answers it, with the nodes that still name the agent: one not there is 404; stale,
 * taken or still named is 409; a key or a value it refused, 422. Null for an error that is not an `AgentWriteError`, which the route throws
 * on to `app.onError` (app.ts): the parser's refusals, a `WorkflowError`, are answered by their kind there.
 */
function refusalOf(err: unknown): { body: AgentRefused; status: 404 | 409 | 422 } | null {
  if (!(err instanceof AgentWriteError)) return null;
  const status = err.why === 'missing' ? 404 : err.why === 'refused' ? 422 : 409;
  return { body: { error: err.message, users: err.users }, status };
}

/** The name in a path, refused in the package's words before anything is read, or the agents folder of `from`. */
function placeOf(from: string, name: string | null, route: string, repo: string, home: string): { dir: string } | Refusal {
  if (from !== 'repo' && from !== 'yours')
    return {
      status: 400,
      error: `${route}: an agent is read from \`repo\` or \`yours\`, as GET /api/agents lists each one's \`from\` — /api/agents/yours/${name ?? '<name>'}, say. This request's was '${from}'.`,
    };
  if (name !== null) {
    const refused = agentNameRefusal(name);
    if (refused) return { status: 400, error: refused };
  }
  return { dir: agentPlaces(repo, home).find((p) => p.from === from)!.dir };
}

/** Why there is no agent to answer (404): `from`'s folder, `dir`, has none named `name`. */
const noAgentWords = (from: string, name: string, dir: string): string =>
  `${from === 'yours' ? 'Yours has' : 'The repository has'} no agent named '${name}' (${path.join(dir, `${name}.md`)}). GET /api/agents lists the agents there are.`;

/**
 * The agents' routes. A name in a path is refused in the package's words (400) before a file is read, so none reaches outside the folder,
 * and a place that is neither `repo` nor `yours` is 400 (`placeOf`). Each write is guarded (guard.ts) and writes only yours (`yoursOnly`:
 * 403 for the repository's); a write the package refuses has `refusalOf`'s statuses, and any other refusal is answered by its kind
 * (`app.onError`).
 *
 * - `GET /api/agents` — every agent (`listAgents`), read from disk on each request, so an agent a person has just edited lists as it is
 *   now.
 * - `GET /api/agents/:from/:name` — one agent, for its page; 404 for a name the place has no file of.
 * - `GET /api/agents/:from/:name/card` — one agent in the shape of an A2A Agent Card (`AgentCardAnswer`). Not a valid card and it says so:
 *   A2A marks `supportedInterfaces` REQUIRED, an interface is a transport and a URL, and nothing here serves an agent over A2A — so
 *   `servedOverA2A` is false beside it, in the answer, rather than left for a reader to work out. Its skills are generated (`cardSkills`);
 *   an agent with no `description:`, or a skill that cannot be read, has no card, and the package's refusal says which (422).
 * - `POST /api/agents/:from` — a new agent of yours: `writeAgent` with no version, so a name already taken is refused. 201.
 * - `PUT /api/agents/:from/:name` — an agent of yours put back, and renamed when the body names it otherwise, against the `version` it was
 *   read at, so a save of an agent changed since is refused rather than written over what changed.
 * - `POST /api/agents/:from/:name/try` — an agent of yours tried on a short brief: its try's folder written, or written again when the
 *   agent's version has moved (`writeTryFolder`), and a run of it started with no repository, as any folder team's is — a tick files it.
 *   201 with the run (`AgentTried`). Refuses the repository's agents, which a start with no repository does not find, with 403 and the
 *   command that copies one, its schema beside it, into the store this api reads (read off its file when it has one); an empty brief (422);
 *   an agent that does not read, or whose name, harness or `remote:` the loader would refuse on the try's own step (422, before anything is
 *   written); an agent that gives a skill only the repository's .claude/skills has, which a start that looks at no repository does not find
 *   (422); and, while a try of it still moves, another (409): one at a time, so a second press does not spend a second budget.
 * - `DELETE /api/agents/:from/:name` — an agent of yours removed, against the `version` it was read at — refused while a step still names
 *   it, saying which. The steps looked at are yours and the repository the board serves; another repository is not known here.
 */
export const agents = new Hono<ApiEnv>()
  .get('/api/agents', (c) => served(c, ({ repo, home }) => c.json(listAgents(repo, home))))
  .get('/api/agents/:from/:name', (c) =>
    served(c, async ({ repo, home }) => {
      const { from, name } = c.req.param();
      const place = placeOf(from, name, `GET /api/agents/${from}/${name}`, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const agent = listedAgent(from as WorkflowSource, place.dir, name, repo, home);
      if (!agent) return c.json({ error: noAgentWords(from, name, place.dir) }, 404);
      return c.json(agent);
    }),
  )
  .get('/api/agents/:from/:name/card', (c) =>
    served(c, async ({ repo, home }) => {
      const { from, name } = c.req.param();
      const route = `GET /api/agents/${from}/${name}/card`;
      const place = placeOf(from, name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const agent = loadAgents(place.dir).get(name);
      if (agent === undefined) return c.json({ error: noAgentWords(from, name, place.dir) }, 404);
      if (agent instanceof Error) return c.json({ error: agent.message }, 422);
      const found = skillsOfPlace(place.dir, repo, home);
      const card = agentCard(agent, agentVersion(place.dir, name, found)!, cardSkills(agent, found));
      return c.json({
        card,
        servedOverA2A: false,
        why: `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.`,
      } satisfies AgentCardAnswer);
    }),
  )
  .post('/api/agents/:from', (c) =>
    served(c, async ({ repo, home }) => {
      const { from } = c.req.param();
      const route = `POST /api/agents/${from}`;
      const refused = refusedBeforeReading(
        agentGuard(route, POST_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const where = yoursOnly(route, from, null, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const read = await readBody(c.req, POST_BODY, `${route} takes a JSON body: ${POST_SHAPE}.`, draftWords(route, POST_SHAPE));
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const place = placeOf(from, read.body.name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const given = draftOf(read.body, read.body.name);
      const answer = saved(place.dir, given.draft, { version: null, schema: given.schema, repo }, home, 201);
      return c.json(answer.body, answer.status);
    }),
  )
  .put('/api/agents/:from/:name', (c) =>
    served(c, async ({ repo, home }) => {
      const { from, name } = c.req.param();
      const route = `PUT /api/agents/${from}/${name}`;
      const refused = refusedBeforeReading(
        agentGuard(route, PUT_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const where = yoursOnly(route, from, name, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const place = placeOf(from, name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const drafted = draftWords(route, PUT_SHAPE);
      const read = await readBody(c.req, PUT_BODY, `${route} takes a JSON body: ${PUT_SHAPE}.`, (issue, body) =>
        issue.path[0] === 'version'
          ? `${route} takes the \`version\` the agent was read at, as GET /api/agents lists it, so a save of an agent that has changed since is refused rather than written over what changed. This request's was ${JSON.stringify(issue.input)}.`
          : drafted(issue, body),
      );
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const { version } = read.body;
      const given = draftOf(read.body, read.body.name ?? name);
      const answer = saved(place.dir, given.draft, { version, from: name, schema: given.schema, repo }, home, 200);
      return c.json(answer.body, answer.status);
    }),
  )
  .post('/api/agents/:from/:name/try', (c) =>
    served(c, async ({ e, repo, home }) => {
      const { from, name } = c.req.param();
      const route = `POST /api/agents/${from}/${name}/try`;
      const refused = refusedBeforeReading(
        tryGuard(route),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      if (from === 'repo') {
        const dir = path.join(repo, 'workflows', AGENTS_FOLDER);
        const listed = agentNameRefusal(name) === undefined ? listedAgent('repo', dir, name, repo, home) : null;
        const untried = listed?.untried ?? untriedOf({ from, name, file: path.join(dir, `${name}.md`), keys: {}, schemaFile: null }, home);
        return c.json({ error: `${route}: ${untried!.why} \`${untried!.copy}\`` }, 403);
      }
      const where = yoursOnly(route, from, name, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const place = placeOf(from, name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const read = await readBody(
        c.req,
        TRY_BODY,
        `${route} takes a JSON body: ${TRY_SHAPE}.`,
        (_, body) =>
          `${route}: \`brief\` is what the agent is asked to do, a string: ${TRY_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['brief']))}.`,
      );
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const { brief } = read.body;
      if (!brief.trim())
        return c.json(
          {
            error: `${route}: the brief is empty, and a try asks the agent to do something. Write what it should do — a sentence is enough.`,
          },
          422,
        );
      try {
        const agent = listedAgent('yours', place.dir, name, repo, home);
        if (!agent) return c.json({ error: noAgentWords('yours', name, place.dir) }, 404);
        if (agent.error) return c.json({ error: `${name} cannot be tried while its file does not read: ${agent.error}` }, 422);
        if (agent.untried) return c.json({ error: agent.untried.why }, 422);
        const theirs = agent.given.filter((skill) => skill.from === 'repo');
        if (theirs.length) {
          const copies = theirs
            .map((skill) => `\`${copyCommand(path.join(repo, '.claude', 'skills', skill.name), librarySkills(home))}\``)
            .join(', ');
          return c.json(
            {
              error: `${name} gives ${theirs.map((skill) => `\`${skill.name}\``).join(', ')}, which only the repository has, and a try runs with no repository. Copy ${theirs.length === 1 ? 'it' : 'them'} into your library to try it: ${copies}.`,
            },
            422,
          );
        }
        const tries = listRuns().filter((run) => tryOf(run, home)?.agent === name);
        const moving = (await judgedNow(e, home, tries)).find((run) => run.moving);
        if (moving)
          return c.json(
            {
              error: `A try of ${name} is still running (${moving.id}): one at a time. Wait for it to end — its page shows how it goes — then try again.`,
            },
            409,
          );
        const workflowDir = writeTryFolder(name, agent.version, home);
        const run = start({ brief: brief.trim(), repo: '', workflowDir });
        return c.json({ id: run.id } satisfies AgentTried, 201);
      } catch (err) {
        const answer = refusalOf(err);
        if (answer) return c.json(answer.body, answer.status);
        throw err;
      }
    }),
  )
  .delete('/api/agents/:from/:name', (c) =>
    served(c, async ({ repo, home }) => {
      const { from, name } = c.req.param();
      const route = `DELETE /api/agents/${from}/${name}`;
      const refused = refusedBeforeReading(
        agentGuard(route, DELETE_SHAPE),
        c.req.header('host'),
        c.req.header('sec-fetch-site'),
        c.req.header('content-type'),
      );
      if (refused) return c.json({ error: refused.error }, refused.status);
      const where = yoursOnly(route, from, name, repo, home);
      if (where) return c.json({ error: where.error }, where.status);
      const place = placeOf(from, name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const read = await readBody(
        c.req,
        DELETE_BODY,
        `${route} takes a JSON body: ${DELETE_SHAPE}.`,
        (_, body) =>
          `${route} takes the \`version\` the agent was read at, as GET /api/agents lists it, so an agent changed since is not removed unseen: ${DELETE_SHAPE}. This request's was ${JSON.stringify(valueAt(body, ['version']))}.`,
      );
      if ('status' in read) return c.json({ error: read.error }, read.status);
      const { version } = read.body;
      try {
        return c.json(removeAgent(place.dir, name, { version, repo }));
      } catch (err) {
        const answer = refusalOf(err);
        if (answer) return c.json(answer.body, answer.status);
        throw err;
      }
    }),
  );

/** `writeAgent`, answered: the agent as it now reads, or its `AgentWriteError` with its status. Throws any other error. */
function saved(
  dir: string,
  draft: AgentDraft,
  how: Parameters<typeof writeAgent>[2] & { repo: string },
  home: string,
  ok: 200 | 201,
): { body: AgentSaved | AgentRefused; status: 200 | 201 | 404 | 409 | 422 } {
  try {
    const done = writeAgent(dir, draft, how);
    return {
      body: { agent: listedAgent('yours', done.dir, done.agent.name, how.repo, home)!, written: done.written, removed: done.removed },
      status: ok,
    };
  } catch (err) {
    const answer = refusalOf(err);
    if (!answer) throw err;
    return answer;
  }
}
