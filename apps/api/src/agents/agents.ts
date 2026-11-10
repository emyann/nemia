/**
 * What the Agent objects (`handlers.ts`) are made from: an agent as listed, with what it is given and why it is untried, and one of yours
 * written through the package's `writeAgent` (`saved`).
 *
 * A step is a node of a workflow, and an agent is one thing a node may have attached (`agent:`): what the node's work is told first and
 * runs with. So an agent lists the nodes that name it, and an edit of one changes each of them — in what a later `nemia start` freezes, and
 * nothing else: a run froze its folder and the agents its steps name when it started.
 *
 * The repository's agents are read-only here, as its workflows are: the api writes nothing into a checkout.
 */
import { Effect, Schema } from 'effect';
import {
  AGENTS_WRITE,
  agentSkillsFound,
  type AgentFill,
  type AgentReading,
  type AgentSchema,
  untriedOf,
  type Untried,
} from 'agent-orchestrator';
import { agentNameRefusal, type AgentDraft } from 'agent-orchestrator/workflow';
import type { Served } from '../layer.ts';
import { givenSkills, type GivenSkill } from '../skills/skills.ts';

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
 * The package's reading of an agent as the board lists it: its custom instructions' file left out, what it is given — its skills found
 * through the Skill door as a start on `repo` finds them — and why it is untried. An agent of a factory's tree `tree` finds the tree's
 * skills first, as a start in that factory does, and gives each as the factory's.
 */
export const listingOf = Effect.fnUntraced(function* (
  { custom: _custom, ...read }: AgentReading,
  repo: string,
  home: string,
  tree?: string,
) {
  const given =
    read.error === null && read.skills
      ? givenSkills(read.skills.split(', '), yield* agentSkillsFound(read.dir, repo, home), repo, home, tree)
      : [];
  return { ...read, given, untried: untriedOf({ ...read, schemaFile: read.schema?.file ?? null }, home) } satisfies AgentListing;
});

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
 * An agent of yours written through the table's `agents write` (`AGENTS_WRITE`): its draft and schema, at the `version` it was read at,
 * none for a new one, and the `name` it is renamed from. Throws what the package refuses, which the one map answers by its kind, and any
 * other error.
 */
export async function saved(
  s: Served,
  { draft, schema, version, name }: { draft: AgentDraft; schema: AgentSchema | null; version?: string; name?: string },
): Promise<void> {
  const input = {
    from: 'yours',
    repo: s.repo,
    draft,
    schema,
    ...(version !== undefined && { version }),
    ...(name !== undefined && { name }),
  };
  await s.inRequest(AGENTS_WRITE.handler(input, undefined, s.home));
}
