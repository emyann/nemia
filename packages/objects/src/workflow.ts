/**
 * The Workflow: a folder of steps a factory resolves, served as an object in the factory's namespace (`default` for the api's repository
 * and your library). Its `spec` is what its files say as written: its description, its README and its steps, each with the keys its own
 * file writes and its own note. Its `status` is what Nemia reads of it: where it was found (`origin`), its typed graph (every node with
 * its kind, decision 12), each step resolved — its keys with its agent's, what its agent is told, the agent the factory hires into it,
 * its told layers and MCP servers — the schemas beside it, why a run of it cannot start in the factory, and the ledger's revision.
 *
 * Beside it, the bodies a write is sent (`WorkflowWrite`, `WorkflowCreate`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema } from 'effect';
import { API_VERSION, ObjectMeta, listOf } from './meta.ts';
import { TypedGraph } from './graph.ts';
import { WriteMeta, definitionStatus } from './definition.ts';
import { PLACE_KINDS } from './words.ts';

const Strings = Schema.Array(Schema.String);
const Text = Schema.NullOr(Schema.String);

/**
 * A step's keys, each as the loader reads it, every one optional: in `spec` only those its file writes, in `status` every key resolved,
 * `null` where it is unset. `route` is its line as written (`judge`, `{ script: … }`, `{ from: …, table: … }`).
 */
export const StepKeys = Schema.Struct({
  harness: Schema.optionalKey(Text),
  model: Schema.optionalKey(Text),
  effort: Schema.optionalKey(Text),
  context: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  after: Schema.optionalKey(Strings),
  resume: Schema.optionalKey(Text),
  input: Schema.optionalKey(Strings),
  place: Schema.optionalKey(Schema.NullOr(Schema.Literals(PLACE_KINDS))),
  workspace: Schema.optionalKey(Schema.NullOr(Schema.Literal('base'))),
  writable: Schema.optionalKey(Strings),
  reads: Schema.optionalKey(Strings),
  slot: Schema.optionalKey(Schema.NullOr(Schema.Literal('none'))),
  agent: Schema.optionalKey(Text),
  skills: Schema.optionalKey(Strings),
  mcp: Schema.optionalKey(Strings),
  permissionMode: Schema.optionalKey(Text),
  sandbox: Schema.optionalKey(Text),
  tools: Schema.optionalKey(Schema.NullOr(Strings)),
  disallowedTools: Schema.optionalKey(Strings),
  allowedTools: Schema.optionalKey(Strings),
  denials: Schema.optionalKey(Schema.NullOr(Schema.Literal('fail'))),
  remote: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  deadlineSeconds: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  budget: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  check: Schema.optionalKey(Text),
  retries: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  gate: Schema.optionalKey(Schema.NullOr(Schema.Literal(true))),
  output: Schema.optionalKey(Text),
  tally: Schema.optionalKey(Strings),
  loop: Schema.optionalKey(Text),
  rounds: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  routes: Schema.optionalKey(Schema.NullOr(Strings)),
  route: Schema.optionalKey(Text),
  when: Schema.optionalKey(Schema.NullOr(Strings)),
  ends: Schema.optionalKey(Schema.NullOr(Strings)),
  workflow: Schema.optionalKey(Text),
});
export type StepKeys = typeof StepKeys.Type;

/** A step as its file writes it: its name, the keys its file sets, and its note — all of its body for a step with no agent. */
export const WorkflowStep = Schema.Struct({ name: Schema.String, keys: StepKeys, body: Schema.String });
export type WorkflowStep = typeof WorkflowStep.Type;

/** A workflow as its files say it: its description, its README (null for none) and its steps, in its order. */
export const WorkflowSpec = Schema.Struct({
  description: Schema.optionalKey(Text),
  readme: Schema.optionalKey(Text),
  steps: Schema.Array(WorkflowStep),
});
export type WorkflowSpec = typeof WorkflowSpec.Type;

/** What a run of a step would be told, by layer (`ToldLayers`): its agent's, yours and the factory's, and the step's policy. */
export const StepLayers = Schema.Struct({
  agent: Text,
  instructions: Text,
  custom: Text,
  factory: Text,
  agentSkills: Strings,
  policy: Schema.String,
  addedSkills: Strings,
  fence: Schema.Array(Schema.Struct({ key: Schema.String, value: Schema.String })),
  folderFiles: Schema.Boolean,
  task: Text,
  via: Schema.Literals(['prompt', 'brief']),
});
export type StepLayers = typeof StepLayers.Type;

/**
 * A step resolved: its keys with its agent's (`spec`), what its agent is told (`body`), what its own file sets for a step with an agent
 * (`own`, null for one without, whose file is all of it), the agent the factory hires into it (`hired`, null for none), its told layers
 * (null for a step with no agent) and the MCP servers its sessions load.
 */
export const WorkflowStepStatus = Schema.Struct({
  name: Schema.String,
  spec: StepKeys,
  body: Schema.String,
  own: Schema.NullOr(Schema.Struct({ keys: Strings, body: Schema.String })),
  hired: Text,
  layers: Schema.NullOr(StepLayers),
  mcp: Strings,
});
export type WorkflowStepStatus = typeof WorkflowStepStatus.Type;

/**
 * What Nemia reads of a workflow: its origin and what shadows it, its folder (`dir`), its typed graph, each step resolved, the schema
 * files beside its steps, whether every step works in a folder (`folderTeam`), why it does not load (`error`, null where it does) and why a
 * run of it cannot start in the factory (`unfilled`, null where it can), and its revision.
 */
export const WorkflowStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String,
  graph: TypedGraph,
  steps: Schema.Array(WorkflowStepStatus),
  schemas: Strings,
  folderTeam: Schema.Boolean,
  error: Text,
  unfilled: Text,
});
export type WorkflowStatus = typeof WorkflowStatus.Type;

/** A workflow, as an object. */
export const Workflow = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION),
  kind: Schema.Literal('Workflow'),
  metadata: ObjectMeta,
  spec: WorkflowSpec,
  status: WorkflowStatus,
});
export type Workflow = typeof Workflow.Type;

/** A page of a namespace's workflows. */
export const WorkflowList = listOf('Workflow', Workflow);
export type WorkflowList = typeof WorkflowList.Type;

/** A JSON Schema file beside the steps, which an `output:` may name, by its file and its text. */
export const SchemaFile = Schema.Struct({ file: Schema.String, text: Schema.String });
export type SchemaFile = typeof SchemaFile.Type;

/**
 * A workflow of yours written whole (`PUT …/workflows/<name>`): its spec, the schema files beside it, and the `resourceVersion` it was
 * read at, refused where its files now hold another.
 */
export const WorkflowWrite = Schema.Struct({
  metadata: Schema.optionalKey(WriteMeta),
  spec: WorkflowSpec,
  schemas: Schema.optionalKey(Schema.Array(SchemaFile)),
});
export type WorkflowWrite = typeof WorkflowWrite.Type;

/** A workflow of yours made (`POST …/workflows`): its name, and its spec, of one step. */
export const WorkflowCreate = Schema.Struct({ metadata: Schema.Struct({ name: Schema.String }), spec: WorkflowSpec });
export type WorkflowCreate = typeof WorkflowCreate.Type;
