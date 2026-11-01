/**
 * What the library's reads share — an agent's card entry, a skill's place and cost and a skill an agent gives, a schema pasted for a step,
 * every key of a step, and a key's row on a card's or a step's page — each type with the schema `get` decodes it with.
 */
import { Schema, SchemaTransformation, Struct } from 'effect';
import { decodes } from './decodes.ts';

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
export const AgentSkillSchema = decodes<AgentSkill>()(
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    description: Schema.String,
    tags: Strings,
    examples: Schema.optionalKey(Strings),
    inputModes: Schema.optionalKey(Strings),
    outputModes: Schema.optionalKey(Strings),
  }),
);

/** Where a skill is: your library (the store's `workflows/skills/`), the repository the board serves, or what is built into Nemia. */
export type SkillSource = 'yours' | 'repo' | 'builtin';

/** Decodes a `SkillSource`. */
export const SkillSourceSchema = decodes<SkillSource>()(Schema.Literals(['yours', 'repo', 'builtin']));

/**
 * Mirrors `SkillCost` in the package: what a skill costs a turn, about, at four characters a token. Named, a turn carries its listing (its
 * name and description); preloaded, its body too.
 */
export type SkillCost = { preload: boolean; listed: number; body: number; perTurn: number };

/** Decodes a `SkillCost`. */
export const SkillCostSchema = decodes<SkillCost>()(
  Schema.Struct({
    preload: Schema.Boolean,
    listed: Schema.Number,
    body: Schema.Number,
    perTurn: Schema.Number,
  }),
);

/**
 * Mirrors `GivenSkill`: a skill an agent gives, named as its line writes it, where a start finds it and what it costs — or why none is
 * found. `from` is the place whose page it has; where it is null, `foundIn` is where this repository has it, as a skill named with its
 * folder, and null too for one found nowhere.
 */
export type GivenSkill = {
  name: string;
  from: SkillSource | null;
  foundIn: string | null;
  entry: AgentSkill | null;
  error: string | null;
  preload: boolean;
  cost: SkillCost | null;
};

/** Decodes a `GivenSkill`. */
export const GivenSkillSchema = decodes<GivenSkill>()(
  Schema.Struct({
    name: Schema.String,
    from: Schema.NullOr(SkillSourceSchema),
    foundIn: Schema.NullOr(Schema.String),
    entry: Schema.NullOr(AgentSkillSchema),
    error: Schema.NullOr(Schema.String),
    preload: Schema.Boolean,
    cost: Schema.NullOr(SkillCostSchema),
  }),
);

/** A schema pasted for a step's `output:`, written beside the steps by the save that carries it; an agent's, beside the agent. */
export type SchemaFile = { file: string; text: string };

/** Decodes a `SchemaFile`. */
export const SchemaFileSchema = decodes<SchemaFile>()(Schema.Struct({ file: Schema.String, text: Schema.String }));

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
  /** `workspace: base`: the step runs in the repository's own checkout, on the base branch. Null for a step without the line. */
  workspace: 'base' | null;
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
 * Decodes a `StepKey`, in `STEP_KEYS`' order: a key the package adds is refused here until the board learns it. `decodes` holds
 * this list to the keys of `WorkflowStepSpec`, and `test/wire.test.ts` those to the api's.
 */
export const StepKeySchema = decodes<StepKey>()(
  Schema.Literals([
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
  ]),
);

/**
 * `workspace: base`, and its former spelling `main` read as it, from an api built before the rename: the board never holds `main`, and a
 * save sends `base`.
 */
const BaseWorkspace = Schema.Literals(['base', 'main']).pipe(
  Schema.decodeTo(
    Schema.Literal('base'),
    SchemaTransformation.transform({ decode: (): 'base' => 'base', encode: (word): 'base' | 'main' => word }),
  ),
);

/** Decodes a `WorkflowStepSpec`: every key a step sets, of its type and words. */
export const WorkflowStepSpecSchema = decodes<WorkflowStepSpec>()(
  Schema.Struct({
    harness: Schema.NullOr(Schema.String),
    model: Schema.NullOr(Schema.String),
    effort: Schema.NullOr(Schema.String),
    context: Schema.NullOr(Schema.Number),
    after: Strings,
    resume: Schema.NullOr(Schema.String),
    input: Strings,
    place: Schema.NullOr(Schema.Literals(['git', 'folder'])),
    workspace: Schema.NullOr(BaseWorkspace),
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
  }),
);

/** Decodes the keys a step takes from an agent, each only where the agent sets it (`KeyForm.agents`). */
export const StepSpecPartSchema = decodes<Partial<WorkflowStepSpec>>()(WorkflowStepSpecSchema.mapFields(Struct.map(Schema.optionalKey)));

/**
 * Mirrors `KeyRow` in apps/api/src/workflows/workflows.ts: one key of a card or a step, as its page lays them out — the key, its value as
 * the package read it, null where the file does not set it, and the package's one line of what it means.
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/** Decodes a `KeyRow`. */
export const KeyRowSchema = decodes<KeyRow>()(
  Schema.Struct({
    key: Schema.String,
    value: Schema.NullOr(Schema.String),
    meaning: Schema.String,
  }),
);
