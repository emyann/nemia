/**
 * The board's agents (`agents/` beside each place it lists workflows from): each listed with the steps that name it, one read, and one of
 * yours made, put back or removed through the package's `writeAgent` and `removeAgent`.
 *
 * A step is a node of a workflow, and an agent is one thing a node may have attached (`agent:`): what the node's work is told first and runs
 * with. So an agent lists the nodes that name it, and an edit of one changes each of them — in what a later `wf start` freezes, and nothing
 * else: a run froze its folder and the agents its steps name when it started.
 *
 * The repository's agents are read-only here, as its workflows are: the api writes nothing into a checkout.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { AgentWriteError, agentUsers, agentVersion, HOME, loadAgents, removeAgent, writeAgent, type AgentSchema } from 'agent-orchestrator';
import { AGENT_KEYS, AGENTS_FOLDER, agentCard, agentNameRefusal, frontmatterKey, splitFrontmatter, type AgentCardShape, type AgentDraft, type AgentSkill, type RoleKey } from 'agent-orchestrator/workflow';
import { repoOf } from './capabilities.ts';
import { refusedBeforeReading, type Guarded, type Refusal } from './guard.ts';
import { sourcesOf, type WorkflowSource } from './workflows.ts';

/** A node that names an agent: the step `step` of the workflow `workflow`, read from `from` — the agent's own place. */
export type AgentUser = { from: WorkflowSource; workflow: string; step: string };

/**
 * What an agent says it can do, as the board has it: the file its `skills:` names, that file's text for the form, and the skills read out of
 * it for anything that shows them. `list` is null when the file does not read — the listing's `error` then says why, in the parser's words.
 */
export type ListedSkills = { file: string; text: string; list: AgentSkill[] | null };

/**
 * One agent as the board lists it: its file's keys as written, its instructions, the result schema its `output:` names and the skills its
 * `skills:` names as those files hold them, the file's text, its version (`agentVersion`, what a write carries), and the nodes that name it.
 * `error` is the parser's refusal of a file that does not read, whose keys are then its lines as written, so the form can show what to fix.
 */
export type AgentListing = {
  name: string;
  from: WorkflowSource;
  dir: string;
  file: string;
  description: string | null;
  keys: Partial<Record<RoleKey, string>>;
  body: string;
  schema: AgentSchema | null;
  skills: ListedSkills | null;
  source: string;
  version: string;
  usedBy: AgentUser[];
  error: string | null;
};

// The keys a step has too. `description` and `skills` describe the agent and are no step's, so the form shows them apart (`RoleKey`).
const ROLE_KEYS = AGENT_KEYS.filter((key): key is RoleKey => key !== 'description' && key !== 'skills');

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Where the agents of each place are: `<workflows>/agents`, the repository's then yours. */
const agentPlaces = (repo: string, home: string = HOME): Array<{ from: WorkflowSource; dir: string }> =>
  sourcesOf(repo, home).map(({ from, dir }) => ({ from, dir: path.join(dir, AGENTS_FOLDER) }));

/** Every agent of each place, by name, each read now from disk. */
export function listAgents(repo: string, home: string = HOME): AgentListing[] {
  return agentPlaces(repo, home).flatMap(({ from, dir }) => [...loadAgents(dir).keys()].sort().map((name) => listedAgent(from, dir, name)!));
}

/** One agent as the listing has it, or null when `dir` has no file of that name. */
export function listedAgent(from: WorkflowSource, dir: string, name: string): AgentListing | null {
  const version = agentVersion(dir, name);
  if (version === null) return null;
  const file = path.join(dir, `${name}.md`);
  const usedBy = agentUsers(path.dirname(dir), name).map((user) => {
    const [workflow, step] = user.split('/') as [string, string];
    return { from, workflow, step };
  });
  const agent = loadAgents(dir).get(name);
  // A link is refused by the package's reader, and read here it would be whatever it points at, outside the folder: only the refusal.
  const linked = (at: string) => Boolean(fs.lstatSync(at, { throwIfNoEntry: false })?.isSymbolicLink());
  if (linked(file)) return { ...empty(from, dir, file, name, version, usedBy), error: agent instanceof Error ? agent.message : `${AGENTS_FOLDER}/${name}.md is a link.` };
  let source: string;
  try { source = fs.readFileSync(file, 'utf8'); } catch (err) { return { ...empty(from, dir, file, name, version, usedBy), error: messageOf(err) }; }
  const sidecarOf = (named: string | undefined): AgentSchema | null => {
    if (named === undefined || path.isAbsolute(named) || /[\\/]/.test(named) || linked(path.join(dir, named))) return null;
    try { return { file: named, text: fs.readFileSync(path.join(dir, named), 'utf8') }; } catch { return null; }
  };
  // The skills as the form edits them — the file's text — with what the parser read out of it, or null when it did not read. A file the
  // agent names that is not there is still named: it is kept as `keys.output` is kept below, with nothing in it, or the next save would
  // write the agent back with no `skills:` line and the only word that the file is missing — the package's refusal — would be gone.
  const skillsOf = (named: string | undefined, list: AgentSkill[] | null): ListedSkills | null => {
    if (named === undefined) return null;
    const sidecar = sidecarOf(named);
    return sidecar === null ? { file: named, text: '', list } : { ...sidecar, list };
  };
  if (agent === undefined || agent instanceof Error) {
    // Not read: its lines as written, so what is wrong can be put right in the form.
    const keys = Object.fromEntries(ROLE_KEYS.flatMap((key) => {
      const value = frontmatterKey(source, key);
      return value === undefined ? [] : [[key, value]];
    })) as Partial<Record<RoleKey, string>>;
    let body = '';
    try { body = splitFrontmatter(file, source).body; } catch { body = source; }
    return {
      ...empty(from, dir, file, name, version, usedBy),
      description: frontmatterKey(source, 'description') ?? null,
      keys,
      body,
      schema: sidecarOf(keys.output),
      skills: skillsOf(frontmatterKey(source, 'skills'), null),
      source,
      error: agent ? agent.message : `${AGENTS_FOLDER}/${name}.md does not read.`,
    };
  }
  return { name, from, dir, file, description: agent.description ?? null, keys: agent.keys, body: agent.body, schema: sidecarOf(agent.keys.output), skills: skillsOf(agent.skills?.file, agent.skills?.list ?? null), source, version, usedBy, error: null };
}

const empty = (from: WorkflowSource, dir: string, file: string, name: string, version: string, usedBy: AgentUser[]): AgentListing =>
  ({ name, from, dir, file, description: null, keys: {}, body: '', schema: null, skills: null, source: '', version, usedBy, error: null });

/**
 * An agent as an A2A Agent Card, and the truth about it: `servedOverA2A` is always false, and `why` says what the shape leaves out and why
 * a client could not call it. The board shows the card with that sentence beside it, so nothing reads as an address.
 */
export type AgentCardAnswer = { card: AgentCardShape; servedOverA2A: false; why: string };

/** What a write of an agent answers with: the agent as it now reads, and its files by name — written, and removed. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

/** A refused write: the package's words, and the steps that still name the agent when that is why. */
export type AgentRefused = { error: string; users: string[] };

const DRAFT = '"description"?: "<use this when…>", "skills"?: "<name>.skills.json", "skillsText"?: "<a list of A2A skills>", "keys": { "model": "opus", "effort": "high", "tools": "Read, Grep", … }, "body": "<its instructions>", "schema"?: { "file": "<name>.schema.json", "text": "<a JSON Schema>" }';
const POST_SHAPE = `\`{ "name": "<agent>", ${DRAFT} }\`, a key unset as null or left out`;
const PUT_SHAPE = `\`{ "version": "<as GET /api/agents lists it>", "name"?: "<its new name>", ${DRAFT} }\`, a key unset as null or left out`;
const DELETE_SHAPE = '`{ "version": "<as GET /api/agents lists it>" }`';

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
function yoursOnly(route: string, from: string, name: string | null, repo: string): Refusal | null {
  if (from === 'yours') return null;
  const yours = path.join(HOME, 'workflows', AGENTS_FOLDER);
  const theirs = path.join(repo, 'workflows', AGENTS_FOLDER);
  if (from === 'repo') {
    const copy = name ? ` — \`cp ${path.join(theirs, `${name}.md`)} ${yours}/\` starts from this one —` : '';
    return {
      status: 403,
      error: `${route} refuses to write the repository's agents (${theirs}): the board writes only yours, in ${yours}, and the api writes nothing into a checkout. Make the agent in yours${copy} then copy the file into ${theirs} by hand, where git shows it as a change to commit.`,
    };
  }
  return { status: 400, error: `${route}: an agent is read from \`repo\` or \`yours\`, as GET /api/agents lists each one's \`from\`, and the board writes yours, at /api/agents/yours/…. This request named ${JSON.stringify(from)}.` };
}

/** The request's JSON body, or why it has none. */
async function jsonOf(req: { json: () => Promise<unknown> }, route: string, shape: string): Promise<{ body: unknown } | Refusal> {
  try {
    return { body: await req.json() };
  } catch {
    return { status: 400, error: `${route} takes a JSON body: ${shape}.` };
  }
}

/** A draft from a body, its shape checked: a key's value is judged by the package, which says what is wrong with it in its words. */
function draftOf(body: Record<string, unknown>, name: unknown, route: string, shape: string): { draft: AgentDraft; schema: AgentSchema | null; skills: AgentSchema | null } | Refusal {
  const wrong = (what: string) => ({ status: 400 as const, error: `${route}: ${what}. Send ${shape}.` });
  if (typeof name !== 'string') return wrong(`\`name\` is the agent's name, a string, and this request's was ${JSON.stringify(name)}`);
  if (body.description != null && typeof body.description !== 'string') return wrong('`description` is a line of text, or null');
  if (body.skills != null && typeof body.skills !== 'string') return wrong('`skills` is the file beside the agent that says what it can do, `"<name>.skills.json"`, or null');
  if (body.skillsText != null && typeof body.skillsText !== 'string') return wrong('`skillsText` is that file\'s text, or null to leave the file as it is');
  if (body.keys !== undefined && !isObject(body.keys)) return wrong('`keys` is an object of the role keys the agent sets');
  const keys = (body.keys ?? {}) as Record<string, unknown>;
  const bad = Object.entries(keys).find(([, value]) => value !== null && typeof value !== 'string');
  if (bad) return wrong(`\`keys.${bad[0]}\` is written as a string, as its line in the file is — ${JSON.stringify(bad[1])} is not one`);
  if (body.body !== undefined && typeof body.body !== 'string') return wrong('`body` is the agent\'s instructions, a string');
  const schema = body.schema ?? null;
  if (schema !== null && (!isObject(schema) || typeof schema.file !== 'string' || typeof schema.text !== 'string')) return wrong('`schema` is the result schema its `output:` names, `{ "file", "text" }`, or null');
  const description = typeof body.description === 'string' && body.description.trim() ? body.description.trim() : null;
  const skills = typeof body.skills === 'string' && body.skills.trim() ? body.skills.trim() : null;
  // The skills file's text travels only when it changed; without the line there is no file to write it to, and the package says so.
  if (typeof body.skillsText === 'string' && skills === null) return wrong('`skillsText` is the text of the file `skills` names, and this request named no `skills` file');
  const trimmed = Object.fromEntries(Object.entries(keys).map(([key, value]) => [key, typeof value === 'string' && value.trim() ? value.trim() : null]));
  return {
    draft: { name, description, skills, keys: trimmed as AgentDraft['keys'], body: (body.body as string | undefined) ?? '' },
    schema: schema as AgentSchema | null,
    skills: typeof body.skillsText === 'string' && skills !== null ? { file: skills, text: body.skillsText } : null,
  };
}

/** A package refusal as the api answers it: an agent not there is 404; stale, taken or still named is 409; anything else it judged, 422. */
function refusalOf(err: unknown): { body: AgentRefused; status: 404 | 409 | 422 } | null {
  if (!(err instanceof AgentWriteError)) {
    // renderAgent's and the parser's refusals are WorkflowErrors: a key, a value, a line break.
    if (err instanceof Error && (err as { exitCode?: number }).exitCode === 2) return { body: { error: err.message, users: [] }, status: 422 };
    return null;
  }
  const status = err.why === 'missing' ? 404 : err.why === 'refused' ? 422 : 409;
  return { body: { error: err.message, users: err.users }, status };
}

/** The name in a path, refused in the package's words before anything is read, or the agents folder of `from`. */
function placeOf(from: string, name: string | null, route: string): { dir: string } | Refusal {
  if (from !== 'repo' && from !== 'yours') return { status: 400, error: `${route}: an agent is read from \`repo\` or \`yours\`, as GET /api/agents lists each one's \`from\` — /api/agents/yours/${name ?? '<name>'}, say. This request's was '${from}'.` };
  if (name !== null) {
    const refused = agentNameRefusal(name);
    if (refused) return { status: 400, error: refused };
  }
  return { dir: agentPlaces(repoOf()).find((p) => p.from === from)!.dir };
}

export const agents = new Hono()
  // Read from disk on each request, so an agent a person has just edited lists as it is now.
  .get('/api/agents', (c) => {
    try {
      return c.json(listAgents(repoOf()));
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // One agent, for its page: the name refused in the package's words before a file is read, so none reaches outside the folder.
  .get('/api/agents/:from/:name', (c) => {
    const { from, name } = c.req.param();
    const place = placeOf(from, name, `GET /api/agents/${from}/${name}`);
    if ('status' in place) return c.json({ error: place.error }, place.status);
    try {
      const agent = listedAgent(from as WorkflowSource, place.dir, name);
      if (!agent) return c.json({ error: `${from === 'yours' ? 'Yours has' : 'The repository has'} no agent named '${name}' (${path.join(place.dir, `${name}.md`)}). GET /api/agents lists the agents there are.` }, 404);
      return c.json(agent);
    } catch (err) {
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  /**
   * One agent in the shape of an A2A Agent Card. Not a valid card and it says so: A2A marks `supportedInterfaces` REQUIRED, an interface is
   * a transport and a URL, and nothing here serves an agent over A2A — so `servedOverA2A` is false beside it, in the answer, rather than
   * left for a reader to work out. An agent with no `description:` or no `skills:` has no card, and the package's refusal says which.
   */
  .get('/api/agents/:from/:name/card', (c) => {
    const { from, name } = c.req.param();
    const route = `GET /api/agents/${from}/${name}/card`;
    const place = placeOf(from, name, route);
    if ('status' in place) return c.json({ error: place.error }, place.status);
    try {
      const agent = loadAgents(place.dir).get(name);
      if (agent === undefined) return c.json({ error: `${from === 'yours' ? 'Yours has' : 'The repository has'} no agent named '${name}' (${path.join(place.dir, `${name}.md`)}). GET /api/agents lists the agents there are.` }, 404);
      if (agent instanceof Error) return c.json({ error: agent.message }, 422);
      const card = agentCard(agent, agentVersion(place.dir, name)!);
      return c.json({ card, servedOverA2A: false, why: `Nothing here serves ${name} over A2A: this card describes the agent, and declares no interfaces and no security schemes. A2A marks \`supportedInterfaces\` REQUIRED, so it is not a card a client could call.` } satisfies AgentCardAnswer);
    } catch (err) {
      if (err instanceof Error && (err as { exitCode?: number }).exitCode === 2) return c.json({ error: err.message }, 422);
      return c.json({ error: messageOf(err) }, 500);
    }
  })
  // A new agent of yours: `writeAgent` with no version, so a name already taken is refused.
  .post('/api/agents/:from', async (c) => {
    const { from } = c.req.param();
    const route = `POST /api/agents/${from}`;
    const refused = refusedBeforeReading(agentGuard(route, POST_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const where = yoursOnly(route, from, null, repoOf());
    if (where) return c.json({ error: where.error }, where.status);
    const read = await jsonOf(c.req, route, POST_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    if (!isObject(read.body)) return c.json({ error: `${route} takes a JSON object: ${POST_SHAPE}.` }, 400);
    const place = placeOf(from, typeof read.body.name === 'string' ? read.body.name : null, route);
    if ('status' in place) return c.json({ error: place.error }, place.status);
    const given = draftOf(read.body, read.body.name, route, POST_SHAPE);
    if ('status' in given) return c.json({ error: given.error }, given.status);
    const answer = saved(place.dir, given.draft, { version: null, schema: given.schema, skills: given.skills }, 201);
    return c.json(answer.body, answer.status);
  })
  // An agent of yours put back — and renamed, when the body names it otherwise — against the version it was read at.
  .put('/api/agents/:from/:name', async (c) => {
    const { from, name } = c.req.param();
    const route = `PUT /api/agents/${from}/${name}`;
    const refused = refusedBeforeReading(agentGuard(route, PUT_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const where = yoursOnly(route, from, name, repoOf());
    if (where) return c.json({ error: where.error }, where.status);
    const place = placeOf(from, name, route);
    if ('status' in place) return c.json({ error: place.error }, place.status);
    const read = await jsonOf(c.req, route, PUT_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    if (!isObject(read.body)) return c.json({ error: `${route} takes a JSON object: ${PUT_SHAPE}.` }, 400);
    const { version } = read.body;
    if (typeof version !== 'string' || !version) {
      return c.json({ error: `${route} takes the \`version\` the agent was read at, as GET /api/agents lists it, so a save of an agent that has changed since is refused rather than written over what changed. This request's was ${JSON.stringify(version)}.` }, 400);
    }
    const to = read.body.name ?? name;
    if (typeof to === 'string' && to !== name) {
      const wrong = agentNameRefusal(to);
      if (wrong) return c.json({ error: wrong }, 400);
    }
    const given = draftOf(read.body, to, route, PUT_SHAPE);
    if ('status' in given) return c.json({ error: given.error }, given.status);
    const answer = saved(place.dir, given.draft, { version, from: name, schema: given.schema, skills: given.skills }, 200);
    return c.json(answer.body, answer.status);
  })
  // An agent of yours removed, against the version it was read at — refused while a step still names it, saying which.
  .delete('/api/agents/:from/:name', async (c) => {
    const { from, name } = c.req.param();
    const route = `DELETE /api/agents/${from}/${name}`;
    const refused = refusedBeforeReading(agentGuard(route, DELETE_SHAPE), c.req.header('host'), c.req.header('sec-fetch-site'), c.req.header('content-type'));
    if (refused) return c.json({ error: refused.error }, refused.status);
    const where = yoursOnly(route, from, name, repoOf());
    if (where) return c.json({ error: where.error }, where.status);
    const place = placeOf(from, name, route);
    if ('status' in place) return c.json({ error: place.error }, place.status);
    const read = await jsonOf(c.req, route, DELETE_SHAPE);
    if ('status' in read) return c.json({ error: read.error }, read.status);
    const version = isObject(read.body) ? read.body.version : undefined;
    if (typeof version !== 'string' || !version) {
      return c.json({ error: `${route} takes the \`version\` the agent was read at, as GET /api/agents lists it, so an agent changed since is not removed unseen: ${DELETE_SHAPE}. This request's was ${JSON.stringify(version)}.` }, 400);
    }
    try {
      return c.json(removeAgent(place.dir, name, { version }));
    } catch (err) {
      const answer = refusalOf(err);
      if (answer) return c.json(answer.body, answer.status);
      return c.json({ error: messageOf(err) }, 500);
    }
  });

/** `writeAgent`, answered: the agent as it now reads, or the package's refusal with its status. */
function saved(dir: string, draft: AgentDraft, how: Parameters<typeof writeAgent>[2], ok: 200 | 201): { body: AgentSaved | AgentRefused | { error: string }; status: 200 | 201 | 404 | 409 | 422 | 500 } {
  try {
    const done = writeAgent(dir, draft, how);
    return { body: { agent: listedAgent('yours', done.dir, done.agent.name)!, written: done.written, removed: done.removed }, status: ok };
  } catch (err) {
    return refusalOf(err) ?? { body: { error: messageOf(err) }, status: 500 };
  }
}
