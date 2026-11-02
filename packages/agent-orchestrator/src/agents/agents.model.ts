/**
 * The agents model: an agent, its name, a skill and its name, and the agent a step names, as Schemas at the context's door. A
 * declaration in S1: no read path decodes through it; the Skill door checks a skill's write through `Skill`.
 */
import { Schema } from 'effect';
import { brandedId, type Id } from '../model/brand.model.ts';
import type { ErModel } from '../model/er.model.ts';
import { StepName, WorkflowName } from '../folder/folder.model.ts';
import { agentNameRefusal, HARNESS_PROMPTS, skillNameRefusal } from './agents.ts';
import { OVERRIDABLE } from '../workflow/index.ts';

/** An agent's name: its file's in `agents/`, minus `.md` (`agentNameRefusal`). */
export const AgentName = brandedId('AgentName', agentNameRefusal);
export type AgentName = Id<'AgentName'>;

/** A skill's name: the folder it is in `skills/`, lowercase words joined by dashes (`skillNameRefusal`, over `SKILL_NAME`). */
export const SkillName = brandedId('SkillName', skillNameRefusal);
export type SkillName = Id<'SkillName'>;

/**
 * An agent as `parseAgent` reads its file (`Agent`), the data alone: `read`, its reader of the files beside it, is no field of a record.
 * `skills` are as its `skills:` line writes them, a bare `SkillName` or `folder:name`, each held nominally (`OnRead`).
 */
export const Agent = Schema.Struct({
  name: AgentName.OnRead,
  role: Schema.optional(Schema.String),
  description: Schema.optional(Schema.String),
  skills: Schema.optional(Schema.Array(SkillName.OnRead)),
  harnessPrompt: Schema.optional(Schema.Literals(HARNESS_PROMPTS)),
  mcp: Schema.optional(Schema.Array(Schema.String)),
  /** What a step may override of it (`overridable:`); absent, everything. */
  overridable: Schema.optional(Schema.Array(Schema.Literals(OVERRIDABLE))),
  keys: Schema.Record(Schema.String, Schema.String),
  body: Schema.String,
  customInstructions: Schema.optional(Schema.String),
}).annotate({ identifier: 'Agent' });
export type Agent = typeof Agent.Type;

/** Why a skill's `description:` is refused, or nothing: one line, and there, as the card reader requires (`skillEntryOf`). */
const descriptionRefusal = (description: string): string | undefined =>
  description.trim() === ''
    ? 'is required, as the A2A protocol marks it: write one line saying what the skill does.'
    : /[\r\n]/.test(description)
      ? "holds a line break, and a card's value is one line: write it on one line."
      : undefined;

/**
 * A skill as its folder holds it, `<skills>/<name>/SKILL.md` (`skillDraftOf`): its name, the folder's; the card entry its frontmatter
 * gives (`skillEntryOf`) — a one-line description, required, and its title, tags and examples; whether it is loaded every turn
 * (`preload:`); and its instructions. What the Skill door writes, checked whole before a byte is written.
 */
export const Skill = Schema.Struct({
  name: SkillName.OnRead,
  title: Schema.optional(Schema.NullOr(Schema.String)),
  description: Schema.String.check(Schema.makeFilter((description) => descriptionRefusal(description) ?? true)),
  tags: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  examples: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  preload: Schema.Boolean,
  body: Schema.String,
}).annotate({ identifier: 'Skill' });
export type Skill = typeof Skill.Type;

/**
 * The agent on a step (AgentOnStep): the agent a workflow's step is given, by name — its file's `agent:` line or a factory's hire — and
 * what the step overrides of it (`overridesOf`), each within what the agent offers (`Agent.overridable`, `offerRefusal`).
 */
export const StepAgent = Schema.Struct({
  workflow: WorkflowName.OnRead,
  step: StepName.OnRead,
  agent: AgentName.OnRead,
  overrides: Schema.optional(Schema.Array(Schema.Literals(OVERRIDABLE))),
}).annotate({ identifier: 'StepAgent' });
export type StepAgent = typeof StepAgent.Type;

/** The agents context's part of the orchestrator's diagram. */
export const agentsModel = { entities: [Agent, Skill, StepAgent], ids: { AgentName: 'Agent', SkillName: 'Skill' } } satisfies ErModel;
