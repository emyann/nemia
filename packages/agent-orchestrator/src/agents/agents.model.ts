/**
 * The agents model: an agent, its name, a skill's name, and the agent a step names, as Schemas at the context's door. A declaration in
 * S1: no read path decodes through it.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { StepName, WorkflowName } from '../record/record.model.ts';
import { agentNameRefusal, HARNESS_PROMPTS, skillNameRefusal } from './agents.ts';

/** An agent's name: its file's in `agents/`, minus `.md` (`agentNameRefusal`). */
export const AgentName = brandedId('AgentName', agentNameRefusal);
export type AgentName = Id<'AgentName'>;

/** A skill's name: the folder it is in `skills/`, lowercase words joined by dashes (`skillNameRefusal`, over `SKILL_NAME`). */
export const SkillName = brandedId('SkillName', skillNameRefusal);
export type SkillName = Id<'SkillName'>;

/**
 * An agent as `parseAgent` reads its file (`Agent`), the data alone: `read`, its reader of the files beside it, is no field of a record.
 * `skills` are as its `skills:` line writes them, a bare `SkillName` or `folder:name`.
 */
export const Agent = Schema.Struct({
  name: AgentName.OnRead,
  role: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  skills: Schema.optional(Schema.Array(Schema.String)),
  harnessPrompt: Schema.optional(Schema.Literals(HARNESS_PROMPTS)),
  mcp: Schema.optional(Schema.Array(Schema.String)),
  keys: Schema.Record(Schema.String, Schema.String),
  body: Schema.String,
  customInstructions: Schema.optional(Schema.String),
}).annotate({ identifier: 'Agent' });
export type Agent = typeof Agent.Type;

/** The agent a workflow's step names, by name: its file's `agent:` line, the seam the AgentOnStep card fills. */
export const StepAgent = Schema.Struct({
  workflow: WorkflowName.OnRead,
  step: StepName.OnRead,
  agent: AgentName.OnRead,
}).annotate({ identifier: 'StepAgent' });
export type StepAgent = typeof StepAgent.Type;

/** The agents context's part of the orchestrator's diagram. */
export const agentsModel = { entities: [Agent, StepAgent], ids: { AgentName: 'Agent' } } satisfies ErModel;
