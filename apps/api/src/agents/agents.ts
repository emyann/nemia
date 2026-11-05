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
import { Effect, Schema } from 'effect';
import { Hono } from 'hono';
import {
  agentRead,
  agentSkillsFound,
  type AgentFill,
  type AgentReading,
  type AgentSchema,
  type AgentWritten,
  untriedOf,
  type Untried,
} from 'agent-orchestrator';
import { agentNameRefusal, type AgentCardShape, type AgentDraft } from 'agent-orchestrator/workflow';

import { type Guarded } from '../guard.ts';
import { type ApiEnv, served } from '../layer.ts';
import type { Engine } from '../store.ts';
import { givenSkills, type GivenSkill } from './skills.ts';
import type { InRequest, WorkflowSource } from '../workflows/workflows.ts';
import { commandNamed, runPlaced } from '../store.ts';
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

/**
 * The board's agent library in the package's table, each entry served on the api alone: an agent written (`agents write`), removed
 * (`agents rm`), tried (`agents run`) and read for its page (`agents read`).
 */
const WRITE = commandNamed('agents write');
/** The package's listing of the agent files the store knows (`nemia agents sources`): on `GET /api/agents/sources`. */
const SOURCES = commandNamed('agents sources');

/**
 * The package's reading of an agent as the board lists it: its custom instructions' file left out, what it is given — its skills found
 * through the Skill door as a start on `repo` finds them — and why it is untried.
 */
export const listingOf = Effect.fnUntraced(function* ({ custom: _custom, ...read }: AgentReading, repo: string, home: string) {
  const given =
    read.error === null && read.skills
      ? givenSkills(read.skills.split(', '), yield* agentSkillsFound(read.dir, repo, home), repo, home)
      : [];
  return { ...read, given, untried: untriedOf({ ...read, schemaFile: read.schema?.file ?? null }, home) } satisfies AgentListing;
});

/**
 * One agent as the listing has it, read through the Agent door, its skills found as a start on `repo` finds them, or null when `dir` has
 * no agent of that name.
 */
export const listedAgent = Effect.fnUntraced(function* (from: WorkflowSource, dir: string, name: string, repo: string, home: string) {
  const read = yield* agentRead(from, dir, name, { repo, home });
  return read && (yield* listingOf(read, repo, home));
});

/**
 * An agent as an A2A Agent Card, and the truth about it: `servedOverA2A` is always false, and `why` says what the shape leaves out and why
 * a client could not call it. The board shows the card with that sentence beside it, so nothing reads as an address.
 */
export type AgentCardAnswer = { card: AgentCardShape; servedOverA2A: false; why: string };

/** What a write of an agent answers with: the agent as it now reads, and its files by name — written, and removed. */
export type AgentSaved = { agent: AgentListing; written: string[]; removed: string[] };

const AgentName = Schema.String.check(Schema.makeFilter((name: string) => agentNameRefusal(name) === undefined));

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
/** A draft's fields as a write sends them: the agent's lines, its keys, its instructions and its schema. */
export type AgentDraftBody = Omit<typeof POST_BODY.Type, 'name'>;

/** What a try answers with: the run it started, which the board follows on the run's page. */
export type AgentTried = { id: string };

/** A try, as the guard's refusals word it (guard.ts). */
/** What a try sends, said by its guard. */
const TRY_SHAPE = '`{ "brief": "<what the agent is asked to do>" }`';

export const tryGuard = (route: string): Guarded => ({
  route,
  does: 'tries an agent',
  forAnother: 'try one',
  why: 'a try starts a run of the agent, which spends up to its budget once a tick files it',
  reach: "try it on the board's agent page",
  instead: "Try it on the board's agent page",
  shape: TRY_SHAPE,
});

/** A write of yours, as the guard's refusals word it (guard.ts). */
export const agentGuard = (route: string, shape: string): Guarded => ({
  route,
  does: 'writes an agent',
  forAnother: 'write one',
  why: "an agent's file is what every step that names it is told and runs with, once a run of its workflow starts",
  reach: "edit it on the board's Agents page",
  instead: "Edit it on the board's Agents page, or edit its file",
  shape,
});

/** A draft off a decoded body, each line trimmed, and one with nothing in it unset. */
export function agentDraftOf(body: AgentDraftBody, name: string): { draft: AgentDraft; schema: AgentSchema | null } {
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

/**
 * The agents' one route of their own; every other read and write of an agent is the Agent object's, at
 * `/api/namespaces/<namespace>/agents[/<name>]` (`src/definitions/agents.ts`), which calls `saved` here for its writes.
 *
 * - `GET /api/agents/sources` — the agent files the store knows (`{ sources: AgentSource[] }`, as `nemia agents sources` lists them):
 *   each repository's a factory names, then your library, then the folder `?path=` names, a folder that is not there a 404. Each is a file
 *   `POST /api/agents/yours/copy` takes.
 */
export const agents = new Hono<ApiEnv>().get('/api/agents/sources', (c) =>
  served(c, async ({ e, placeService, env, home }) => {
    const at = c.req.query('path');
    return c.json(await runPlaced({ placeService, home }, e, SOURCES.handler(at === undefined ? {} : { path: at }, env, home)));
  }),
);

/** Where an agent is written: its place on the path (`from`), and the repository and store it reads. */
type AgentAt = { from: string; repo: string; home: string };

/**
 * `writeAgent`, through the table's `agents write` (`WRITE`), answered: the agent as it now reads, with its status. `version` is what the
 * agent was read at, none for a new one, and `name` the one it is renamed from. Throws what the package refuses, which `app.onError`
 * answers by its kind, and any other error.
 */
export async function saved(
  e: Engine['Service'],
  placeService: PlaceService['Service'],
  inRequest: InRequest,
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
  const done = (await runPlaced({ placeService, home }, e, WRITE.handler(args, undefined, home))) as AgentWritten;
  const agent = await inRequest(listedAgent('yours', done.dir, done.agent.name, repo, home));
  if (agent === null)
    throw new Error(
      `The agent ${done.agent.name} written to ${done.dir} does not read back: GET /api/namespaces/default/agents/${done.agent.name} says why, in the Agent's \`status.error\`.`,
    );
  return {
    body: { agent, written: done.written, removed: done.removed },
    status: ok,
  };
}
