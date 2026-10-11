/**
 * What the library's reads share — an agent's card entry, a skill's place and cost and a skill an agent gives, a schema pasted for a step,
 * every key of a step, and a key's row on a card's or a step's page — each type with the schema `get` decodes it with.
 */
import { Schema, Struct } from 'effect';

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const Strings = Schema.mutable(Schema.Array(Schema.String));

/**
 * Mirrors `AgentSkill` in the package: one thing an agent says it can do, in the A2A protocol's words — `id`, `name`, `description` and
 * `tags` are REQUIRED there and here, and the rest are written only where they say something the card does not already say.
 */
export type AgentSkill = {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples?: string[];
  inputModes?: string[];
  outputModes?: string[];
};

/** Decodes an `AgentSkill`: a key it leaves out stays out. */
export const AgentSkillSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  description: Schema.String,
  tags: Strings,
  examples: Schema.optionalKey(Strings),
  inputModes: Schema.optionalKey(Strings),
  outputModes: Schema.optionalKey(Strings),
}) satisfies Schema.Schema<AgentSkill>;

/** Where a skill is: your library (the store's `workflows/skills/`), the repository the board serves, or what Nemia ships. */
export type SkillSource = 'yours' | 'repo' | 'shipped';

/** Decodes a `SkillSource`. */
export const SkillSourceSchema = Schema.Literals(['yours', 'repo', 'shipped']) satisfies Schema.Schema<SkillSource>;

/**
 * Mirrors `SkillCost` in the package: what a skill costs a turn, about, at four characters a token. Named, a turn carries its listing (its
 * name and description); preloaded, its body too.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Decodes a `SkillCost`. */
export const SkillCostSchema = Schema.Struct({
  preload: Schema.Boolean,
  listed: Schema.Number,
  body: Schema.Number,
  perTurn: Schema.Number,
}) satisfies Schema.Schema<SkillCost>;

/** Mirrors `GivenSkill`: a skill an agent gives, where a start finds it and what it costs — or why none is found (`from: null`). */
export type GivenSkill = {
  name: string;
  from: SkillSource | null;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
};

/** Decodes a `GivenSkill`. */
export const GivenSkillSchema = Schema.Struct({
  name: Schema.String,
  from: Schema.NullOr(SkillSourceSchema),
  entry: Schema.NullOr(AgentSkillSchema),
  error: Schema.NullOr(Schema.String),
  preload: Schema.Boolean,
  cost: Schema.NullOr(SkillCostSchema),
}) satisfies Schema.Schema<GivenSkill>;

/** A schema pasted for a step's `output:`, written beside the steps by the save that carries it; an agent's, beside the agent. */
export type SchemaFile = { file: string; text: string };

/** Decodes a `SchemaFile`. */
export const SchemaFileSchema = Schema.Struct({ file: Schema.String, text: Schema.String }) satisfies Schema.Schema<SchemaFile>;

/** Mirrors `WorkflowStepSpec` in apps/api/src/workflows/workflows.ts: every key a step of a workflow sets, before any run froze it. */
export type WorkflowStepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`, written `200k`): null for the model's whole window. */
  context: number | null;
  after: string[];
  resume: string | null;
  input: string[];
  /**
   * `place: folder`: the step works in a folder the run makes, with no git repository; `git`: on branches of a repository. Every step
   * file says one; null only for a step frozen on a run before the key, which worked on a repository, and for a draft yet to choose.
   */
  place: 'git' | 'folder' | null;
  /** `workspace: main`: the step runs in the repository's own checkout. Null for a step without the line. */
  workspace: 'main' | null;
  /** The factory's folders the step may write (`writable:`), by their directory names: empty where it only reads them. */
  writable: string[];
  /** What of the store the step reads and never writes (`reads:`), each by its name (`inbox`, `costs`): empty where it reads none. */
  reads: string[];
  /** `slot: none`: the run takes no run slot (`WF_MAX_RUNS`). Null for a step without the line. */
  slot: 'none' | null;
  /** The agent attached to the step (`agent:`), in agents/ beside the folder: the rest of the keys are resolved with it. Null for none. */
  agent: string | null;
  /** The skills the step adds to its agent's (`skills:`): empty where it adds none. */
  skills: string[];
  /** The MCP servers the step adds to its agent's (`mcp:`): empty where it adds none. */
  mcp: string[];
  /** Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`. */
  permissionMode: string | null;
  /**
   * Codex's sandbox (`sandbox:`, or `permissionMode:` where a codex step's file names its sandbox under that key): null on Claude Code, and
   * where a codex step names none.
   */
  sandbox: string | null;
  tools: string[] | null;
  /** What the session may not have (`disallowedTools:`): empty where the step denies nothing. */
  disallowedTools: string[];
  /** What the session may do without being asked (`allowedTools:`): empty where the step allows nothing beyond its mode. */
  allowedTools: string[];
  /** `denials: fail` as written: null where the step has no line, and what the harness denied it decides nothing. */
  denials: 'fail' | null;
  /** `background:` as written: null where the step has no line, and runs as a job. */
  background: boolean | null;
  /** `remote:` as written: null where the step has no line. */
  remote: boolean | null;
  deadlineSeconds: number | null;
  /** The most the step's tries may cost together, in dollars (`budget:`). */
  budget: number | null;
  check: string | null;
  retries: number | null;
  /** `gate: true`, or null for a step without the line. */
  gate: true | null;
  /** The schema file `output:` names. */
  output: string | null;
  /** What the CLI's `stats` counts of the step's closeouts (`tally:`): empty for none. */
  tally: string[];
  loop: string | null;
  rounds: number | null;
};

/** A key of a step, as the package's `STEP_KEYS` names it. */
export type StepKey = keyof WorkflowStepSpec;

/**
 * Decodes a `StepKey`, in `STEP_KEYS`' order: a key the package adds is refused here until the board learns it. `read-library.test.ts`
 * holds this list to the keys of `WorkflowStepSpecSchema`.
 */
export const StepKeySchema = Schema.Literals([
  'after',
  'resume',
  'input',
  'place',
  'workspace',
  'writable',
  'reads',
  'slot',
  'agent',
  'skills',
  'mcp',
  'harness',
  'model',
  'effort',
  'context',
  'permissionMode',
  'sandbox',
  'tools',
  'disallowedTools',
  'allowedTools',
  'denials',
  'background',
  'remote',
  'deadlineSeconds',
  'budget',
  'check',
  'retries',
  'gate',
  'output',
  'tally',
  'loop',
  'rounds',
]) satisfies Schema.Schema<StepKey>;

/** Decodes a `WorkflowStepSpec`: every key a step sets, of its type and words. */
export const WorkflowStepSpecSchema = Schema.Struct({
  harness: Schema.NullOr(Schema.String),
  model: Schema.NullOr(Schema.String),
  effort: Schema.NullOr(Schema.String),
  context: Schema.NullOr(Schema.Number),
  after: Strings,
  resume: Schema.NullOr(Schema.String),
  input: Strings,
  place: Schema.NullOr(Schema.Literals(['git', 'folder'])),
  workspace: Schema.NullOr(Schema.Literal('main')),
  writable: Strings,
  reads: Strings,
  slot: Schema.NullOr(Schema.Literal('none')),
  agent: Schema.NullOr(Schema.String),
  skills: Strings,
  mcp: Strings,
  permissionMode: Schema.NullOr(Schema.String),
  sandbox: Schema.NullOr(Schema.String),
  tools: Schema.NullOr(Strings),
  disallowedTools: Strings,
  allowedTools: Strings,
  denials: Schema.NullOr(Schema.Literal('fail')),
  background: Schema.NullOr(Schema.Boolean),
  remote: Schema.NullOr(Schema.Boolean),
  deadlineSeconds: Schema.NullOr(Schema.Number),
  budget: Schema.NullOr(Schema.Number),
  check: Schema.NullOr(Schema.String),
  retries: Schema.NullOr(Schema.Number),
  gate: Schema.NullOr(Schema.Literal(true)),
  output: Schema.NullOr(Schema.String),
  tally: Strings,
  loop: Schema.NullOr(Schema.String),
  rounds: Schema.NullOr(Schema.Number),
}) satisfies Schema.Schema<WorkflowStepSpec>;

/** Decodes the keys a step takes from an agent, each only where the agent sets it (`KeyForm.agents`). */
export const StepSpecPartSchema = WorkflowStepSpecSchema.mapFields(Struct.map(Schema.optionalKey)) satisfies Schema.Schema<
  Partial<WorkflowStepSpec>
>;

/**
 * Mirrors `KeyRow` in apps/api/src/workflows/workflows.ts: one key of a card or a step, as its page lays them out — the key, its value as
 * the package read it, null where the file does not set it, and the package's one line of what it means.
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/** Decodes a `KeyRow`. */
export const KeyRowSchema = Schema.Struct({
  key: Schema.String,
  value: Schema.NullOr(Schema.String),
  meaning: Schema.String,
}) satisfies Schema.Schema<KeyRow>;
