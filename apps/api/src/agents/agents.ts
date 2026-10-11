/**
 * The board's agents (`agents/` beside each place it lists workflows from): each listed with the steps that name it, one read, and one of
 * yours made, put back or removed through the package's `writeAgent` and `removeAgent`.
 *
 * A step is a node of a workflow, and an agent is one thing a node may have attached (`agent:`): what the node's work is told first and
 * runs with. So an agent lists the nodes that name it, and an edit of one changes each of them — in what a later `nemia start` freezes, and
 * nothing else: a run froze its folder and the agents its steps name when it started.
 *
 * The repository's agents are read-only here, as its workflows are: the api writes nothing into a checkout.
 */
import path from 'node:path';
import { Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentRead,
  agentSkillsFound,
  COMMANDS,
  factoriesFilling,
  inFactory,
  loadAgents,
  readFactories,
  stepsFilled,
  type AgentFill,
  type AgentReading,
  type AgentsRead,
  type AgentSchema,
  type AgentWritten,
  type CardRead,
  repoWriteRefusal,
  untriedOf,
  type Untried,
} from 'agent-orchestrator';
import { AGENTS_FOLDER, agentNameRefusal, type AgentCardShape, type AgentDraft } from 'agent-orchestrator/workflow';
import { readBody, valueAt, type BodyIssue, type Words } from '../body.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import type { Engine } from '../store.ts';
import { givenSkills, type GivenSkill } from './skills.ts';
import { sourcesOf, type WorkflowSource } from '../workflows/workflows.ts';
import { runPlaced } from '../store.ts';
import type { PlaceService } from 'agent-orchestrator';

export type { AgentUser } from 'agent-orchestrator';

/**
 * One agent as the board lists it: the package's reading of it (`AgentReading`, as `nemia agents` reads it) but the file of a person's
 * custom instructions, which the board does not show, and two facts of the board's own:
 *
 * - `given`: each skill its `skills:` gives, in its order — where a start finds it, your library, the repository, or none; its card entry
 *   or why it has none; and what it costs a turn (skills.ts). Empty for none, and for a file that does not read.
 * - `untried`: why it cannot be tried from the board, and the command that copies it to yours when that is the fix, in the store the api
 *   reads (`untriedOf`, which the try's route refuses on); null when nothing does. The page draws it in place of the Try it button.
 */
export type AgentListing = Omit<AgentReading, 'custom'> & { given: GivenSkill[]; untried: Untried | null };

/**
 * An agent as the Agents page lists it: its listing, the steps it fills in the factory the request names (`fills`), and the names of
 * the factories it fills a step in, sorted (`factories`): the default factory is none of them. Both are the package's (`inFactory`).
 */
export type LibraryAgent = AgentListing & { fills: AgentFill[]; factories: string[] };

/** The package's listing of the agents (`nemia agents`), its handler `agentsRead`: the api answers it on `GET /api/agents`. */
const AGENTS = COMMANDS.find((c) => c.name === 'agents')!;

/** The package's card of one agent (`nemia agents card`), its handler `agentCardRead`: on `GET /api/agents/:from/:name/card`. */
const AGENT_CARD = COMMANDS.find((c) => c.name === 'agents card')!;

/**
 * The board's agent library in the package's table, each entry served on the api alone: an agent written (`agents write`), removed
 * (`agents remove`), tried (`agents try`) and read for its page (`agents read`).
 */
const WRITE = COMMANDS.find((c) => c.name === 'agents write')!;
const REMOVE = COMMANDS.find((c) => c.name === 'agents remove')!;
const TRY = COMMANDS.find((c) => c.name === 'agents try')!;
const READ = COMMANDS.find((c) => c.name === 'agents read')!;

/** The package's listing of the agent files the store knows (`nemia agents sources`): on `GET /api/agents/sources`. */
const SOURCES = COMMANDS.find((c) => c.name === 'agents sources')!;

/** Where the agents of each place are: `<workflows>/agents`, the repository's then yours. */
const agentPlaces = (repo: string, home: string): Array<{ from: WorkflowSource; dir: string }> =>
  sourcesOf(repo, home).map(({ from, dir }) => ({ from, dir: path.join(dir, AGENTS_FOLDER) }));

/** The package's reading of an agent as the board lists it: its custom instructions' file left out, what it is given, why it is untried. */
function listingOf({ custom: _custom, ...read }: AgentReading, repo: string, home: string): AgentListing {
  const given =
    read.error === null && read.skills ? givenSkills(read.skills.split(', '), agentSkillsFound(read.dir, repo, home), repo, home) : [];
  return { ...read, given, untried: untriedOf({ ...read, schemaFile: read.schema?.file ?? null }, home) };
}

/** One agent as the listing has it, its skills found as a start on `repo` finds them, or null when `dir` has no file of that name. */
export function listedAgent(from: WorkflowSource, dir: string, name: string, repo: string, home: string): AgentListing | null {
  const read = agentRead(from, dir, name, { repo, home });
  return read && listingOf(read, repo, home);
}

/**
 * An agent as an A2A Agent Card, and the truth about it: `servedOverA2A` is always false, and `why` says what the shape leaves out and why
 * a client could not call it. The board shows the card with that sentence beside it, so nothing reads as an address.
 */
export type AgentCardAnswer = { card: AgentCardShape; servedOverA2A: false; why: string };

/** What a write of an agent answers with: the agent as it now reads, and its files by name — written, and removed. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

const DRAFT =
  '"role"?: "<the job it holds>", "description"?: "<use this when…>", "skills"?: "<skill>, <skill>", "harnessPrompt"?: "keep" | "no-coding" | "replace", "mcp"?: "<server>, <server>", "keys": { "model": "opus", "effort": "high", "tools": "Read, Grep", … }, "body": "<its instructions>", "schema"?: { "file": "<name>.schema.json", "text": "<a JSON Schema>" }';
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
  systemPrompt: Schema.optionalKey(Schema.Never),
  harnessPrompt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  mcp: Schema.optionalKey(Schema.NullOr(Schema.String)),
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
    if (key === 'systemPrompt')
      return wrong(
        '`systemPrompt` is now `harnessPrompt`, what becomes of Claude Code\'s own prompt: `"keep"`, `"no-coding"` or `"replace"`, where it said `"default"`, `"no-coding"` or `"own"`. A page that sends it is stale: reload it, and save again',
      );
    if (key === 'harnessPrompt') return wrong('`harnessPrompt` is `"keep"`, `"no-coding"` or `"replace"`, or null');
    if (key === 'mcp')
      return wrong(
        '`mcp` is the MCP servers the agent\'s sessions load, by the names the checkout\'s `.mcp.json` gives them, as its line writes them — `"playwright, docs"` — or null',
      );
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
  if (from === 'repo') return { status: 403, error: repoWriteRefusal(route, 'agents', name, repo, home) };
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
      harnessPrompt: line(body.harnessPrompt),
      mcp: line(body.mcp),
      keys: Object.fromEntries(Object.entries(body.keys ?? {}).map(([key, value]) => [key, line(value)])),
      body: body.body ?? '',
    },
    schema: body.schema ?? null,
  };
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
 * 403 for the repository's); a write or a removal the package refuses is answered by its kind (`app.onError`), and a `Conflict` over an
 * agent steps still name with those steps, as `users`.
 *
 * - `GET /api/agents` — the agents of the factory the request names (`LibraryAgent`, the package's `inFactory`), read from disk on each
 *   request, so an agent a person has just edited lists as it is now. Each with the steps it fills in that factory (`fills`) and the
 *   factories it fills a step in (`factories`), a step credited to the agent file a start would run it with. In a factory, only the agents
 *   it hires into a step or its attached workflows' steps name; in the default factory, every agent (`AGENTS`, the package's `nemia
 *   agents`).
 * - `GET /api/agents/sources` — the agent files the store knows (`{ sources: AgentSource[] }`, as `nemia agents sources` lists them):
 *   each repository's a factory names, then your library, then the folder `?path=` names, a folder that is not there a 404. Each is a file
 *   `POST /api/agents/yours/copy` takes.
 * - `GET /api/agents/:from/:name` — one agent, for its page; 404 for a name the place has no file of.
 * - `GET /api/agents/:from/:name/card` — one agent in the shape of an A2A Agent Card (`AgentCardAnswer`), as `nemia agents card` prints it
 *   (`AGENT_CARD`). Not a valid card and it says so: A2A marks `supportedInterfaces` REQUIRED, an interface is a transport and a URL, and
 *   nothing here serves an agent over A2A — so `servedOverA2A` is false beside it, in the answer, rather than left for a reader to work
 *   out. Its skills are generated (`cardSkills`); an agent with no `description:`, or a skill that cannot be read, has no card, and the
 *   package's refusal says which (422).
 * - `POST /api/agents/:from` — a new agent of yours: `writeAgent` with no version, so a name already taken is refused. 201.
 * - `PUT /api/agents/:from/:name` — an agent of yours put back, and renamed when the body names it otherwise, against the `version` it was
 *   read at, so a save of an agent changed since is refused rather than written over what changed.
 * - `POST /api/agents/:from/:name/try` — an agent of yours tried on a short brief: its try's folder written, or written again when the
 *   agent's version has moved (`tryFolder`), and a run of it started with no repository, as any folder team's is — a tick files it.
 *   The try is the one start made in the default factory: an agent is tried before any factory hires it, and on no factory's repository.
 *   201 with the run (`AgentTried`). Refuses the repository's agents, which a start with no repository does not find, with 403 and the
 *   command that copies one, its schema beside it, into the store this api reads (read off its file when it has one); an empty brief (422);
 *   an agent that does not read, or whose name, harness or `remote:` the loader would refuse on the try's own step (422, before anything is
 *   written); an agent that gives a skill only the repository's .claude/skills has, which a start that looks at no repository does not find
 *   (422); and, while a try of it still moves, another (409): one at a time, so a second press does not spend a second budget.
 * - `DELETE /api/agents/:from/:name` — an agent of yours removed, against the `version` it was read at — refused while a step still names
 *   it, saying which. The steps looked at are yours and the repository the board serves; another repository is not known here.
 */
export const agents = new Hono<ApiEnv>()
  .get('/api/agents', (c) =>
    served(c, async ({ e, placeService, env, repo, home, factory }) => {
      const { agents: read } = (await runPlaced(placeService, e, AGENTS.handler({ repo }, env, home))) as AgentsRead;
      const listings = read.map((one) => listingOf(one, repo, home));
      const answer: LibraryAgent[] = inFactory(
        listings,
        stepsFilled(repo, home, factory),
        factoriesFilling(readFactories(), home),
        factory,
      );
      return c.json(answer);
    }),
  )
  .get('/api/agents/sources', (c) =>
    served(c, async ({ e, placeService, env, home }) => {
      const at = c.req.query('path');
      return c.json(await runPlaced(placeService, e, SOURCES.handler(at === undefined ? {} : { path: at }, env, home)));
    }),
  )
  .get('/api/agents/:from/:name', (c) =>
    served(c, async ({ e, placeService, env, repo, home }) => {
      const { from, name } = c.req.param();
      const place = placeOf(from, name, `GET /api/agents/${from}/${name}`, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const { agent } = (await runPlaced(placeService, e, READ.handler({ from, name, dir: place.dir, repo }, env, home))) as { agent: AgentReading | null };
      if (!agent) return c.json({ error: noAgentWords(from, name, place.dir) }, 404);
      return c.json(listingOf(agent, repo, home));
    }),
  )
  .get('/api/agents/:from/:name/card', (c) =>
    served(c, async ({ e, placeService, env, repo, home }) => {
      const { from, name } = c.req.param();
      const route = `GET /api/agents/${from}/${name}/card`;
      const place = placeOf(from, name, route, repo, home);
      if ('status' in place) return c.json({ error: place.error }, place.status);
      const agent = loadAgents(place.dir).get(name);
      if (agent === undefined) return c.json({ error: noAgentWords(from, name, place.dir) }, 404);
      if (agent instanceof Error) return c.json({ error: agent.message }, 422);
      const { card } = (await runPlaced(placeService, e, AGENT_CARD.handler({ name, repo, from }, env, home))) as CardRead;
      return c.json({
        card,
        servedOverA2A: false,
        why: `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.`,
      } satisfies AgentCardAnswer);
    }),
  )
  .post('/api/agents/:from', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
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
      const answer = await saved(e, placeService, { from, repo, home }, given, 201);
      return c.json(answer.body, answer.status);
    }),
  )
  .put('/api/agents/:from/:name', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
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
      const answer = await saved(e, placeService, { from, repo, home }, { ...given, version, name }, 200);
      return c.json(answer.body, answer.status);
    }),
  )
  .post('/api/agents/:from/:name/try', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
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
      const run = (await runPlaced(placeService, e, TRY.handler({ from, name, brief: read.body.brief, repo }, undefined, home))) as AgentTried;
      return c.json({ id: run.id } satisfies AgentTried, 201);
    }),
  )
  .delete('/api/agents/:from/:name', (c) =>
    served(c, async ({ e, placeService, repo, home }) => {
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
      return c.json(await runPlaced(placeService, e, REMOVE.handler({ from, name, version, repo }, undefined, home)));
    }),
  );

/** Where an agent is written: its place on the path (`from`), and the repository and store it reads. */
type AgentAt = { from: string; repo: string; home: string };

/**
 * `writeAgent`, through the table's `agents write` (`WRITE`), answered: the agent as it now reads, with its status. `version` is what the
 * agent was read at, none for a new one, and `name` the one it is renamed from. Throws what the package refuses, which `app.onError`
 * answers by its kind, and any other error.
 */
async function saved(
  e: Engine['Service'], placeService: PlaceService['Service'],
  { from, repo, home }: AgentAt,
  { draft, schema, version, name }: { draft: AgentDraft; schema: AgentSchema | null; version?: string; name?: string },
  ok: 200 | 201,
): Promise<{ body: AgentSaved; status: 200 | 201 }> {
  const args = {
    from,
    repo,
    draft: JSON.stringify(draft),
    schema: JSON.stringify(schema),
    ...(version !== undefined && { version }),
    ...(name !== undefined && { name }),
  };
  const done = (await runPlaced(placeService, e, WRITE.handler(args, undefined, home))) as AgentWritten;
  return {
    body: { agent: listedAgent('yours', done.dir, done.agent.name, repo, home)!, written: done.written, removed: done.removed },
    status: ok,
  };
}
