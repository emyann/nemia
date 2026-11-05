/**
 * The Agent: an agent definition a factory resolves, served as an object in the factory's namespace. Its `spec` is what its file says:
 * its role, its description, its harness keys, the skills and MCP servers it names, its `output:` schema and its instructions. Its
 * `status` is what Nemia reads of it: where it was found, the steps that name it and those it fills in the factory, the factories it
 * fills a step in, each skill it gives as a start finds it, where it was copied from, why it cannot be tried, its card's entries, why it
 * does not read, and its revision.
 *
 * Beside it, the bodies a write is sent (`AgentWrite`, `AgentTry`) and what a try and a card answer. Plain Schemas of JSON.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { CardSkill, SkillCost, WriteMeta, definitionStatus } from './definition.ts';
import { DEFINITION_ORIGINS } from './words.ts';

const Text = Schema.NullOr(Schema.String);

/** Where an agent of a step is, by the place a start reads it from. */
const AgentPlace = Schema.Literals(['repo', 'yours']);

/**
 * An agent as its file says it: `role:`, `description:`, its harness keys (`keys`, each line as written), `skills:` and `mcp:` as their
 * lines write them, `harnessPrompt:`, the schema its `output:` names (its file and text) and its instructions (`instructions`, the body).
 */
export const AgentSpec = Schema.Struct({
  role: Schema.optionalKey(Text),
  description: Schema.optionalKey(Text),
  keys: Schema.optionalKey(Schema.Record(Schema.String, Schema.NullOr(Schema.String))),
  skills: Schema.optionalKey(Text),
  harnessPrompt: Schema.optionalKey(Text),
  mcp: Schema.optionalKey(Text),
  output: Schema.optionalKey(Schema.NullOr(Schema.Struct({ file: Schema.String, text: Schema.String }))),
  instructions: Schema.optionalKey(Schema.String),
});
export type AgentSpec = typeof AgentSpec.Type;

/** A step that names the agent (`usedBy`), and one it fills in the factory, hired or by its own `agent:` line (`fills`). */
export const AgentUser = Schema.Struct({ from: AgentPlace, workflow: Schema.String, step: Schema.String });
export const AgentFill = Schema.Struct({ from: AgentPlace, workflow: Schema.String, step: Schema.String, hired: Schema.Boolean });

/**
 * A skill the agent gives, as its line names it: the origin a start finds it in (null where none, `foundIn` then the folder the repository
 * has it in, or null too), its card entry or why it has none, and what it costs a turn.
 */
export const GivenSkill = Schema.Struct({
  name: Schema.String,
  from: Schema.NullOr(Schema.Literals(DEFINITION_ORIGINS)),
  foundIn: Text,
  entry: Schema.NullOr(CardSkill),
  error: Text,
  preload: Schema.Boolean,
  cost: Schema.NullOr(SkillCost),
});
export type GivenSkill = typeof GivenSkill.Type;

/** What Nemia reads of an agent; see the file's head. */
export const AgentStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String,
  file: Schema.String,
  source: Schema.String,
  usedBy: Schema.Array(AgentUser),
  fills: Schema.Array(AgentFill),
  factories: Schema.Array(Schema.String),
  given: Schema.Array(GivenSkill),
  copied: Schema.NullOr(
    Schema.Struct({ source: Schema.String, version: Schema.String, now: Schema.Literals(['same', 'changed', 'gone']) }),
  ),
  untried: Schema.NullOr(Schema.Struct({ why: Schema.String, copy: Text })),
  card: Schema.NullOr(Schema.Array(CardSkill)),
  cardError: Text,
  error: Text,
});
export type AgentStatus = typeof AgentStatus.Type;

/** An agent, as an object. */
export const Agent = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Agent'),
  metadata: ObjectMeta,
  spec: AgentSpec,
  status: AgentStatus,
});
export type Agent = typeof Agent.Type;

/** A page of a namespace's agents. */
export const AgentList = listOf('Agent', Agent);
export type AgentList = typeof AgentList.Type;

/**
 * An agent of yours made (`POST …/agents`, `metadata.name` its name) or written (`PUT …/agents/<name>`, `metadata.resourceVersion` the
 * version it was read at; a `metadata.name` other than the path's renames it).
 */
export const AgentWrite = Schema.Struct({ metadata: WriteMeta, spec: AgentSpec });
export type AgentWrite = typeof AgentWrite.Type;

/** A try of an agent (`POST …/agents/<name>/try`): what it is asked to do. */
export const AgentTry = Schema.Struct({ brief: Schema.String });
export type AgentTry = typeof AgentTry.Type;

/** What a try answers: the run it started. */
export const AgentTried = Schema.Struct({ id: Schema.String });
export type AgentTried = typeof AgentTried.Type;

/**
 * An agent as an A2A Agent Card (`GET …/agents/<name>/card`), and the truth about it: `servedOverA2A` is always false, and `why` says what
 * the shape leaves out.
 */
export const AgentCard = Schema.Struct({
  card: Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    version: Schema.String,
    capabilities: Schema.Struct({ streaming: Schema.Boolean, pushNotifications: Schema.Boolean, extendedAgentCard: Schema.Boolean }),
    defaultInputModes: Schema.Array(Schema.String),
    defaultOutputModes: Schema.Array(Schema.String),
    skills: Schema.Array(CardSkill),
  }),
  servedOverA2A: Schema.Literal(false),
  why: Schema.String,
});
export type AgentCard = typeof AgentCard.Type;
