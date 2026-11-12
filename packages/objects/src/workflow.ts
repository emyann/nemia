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
import { CardSkill, WriteMeta, definitionStatus } from './definition.ts';
import { FIX_KINDS, NEED_SCOPES, PLACE_KINDS } from './words.ts';

const Strings = Schema.Array(Schema.String);
const Text = Schema.NullOr(Schema.String);

/**
 * Every key a step has, in the order a step's file writes them and a refusal names them: the one list of them. The orchestrator's parser
 * holds its copy typed by this one (`STEP_KEYS` in its `src/step/step.ts`, which the entries a pure reader loads read without loading
 * effect), so the two cannot drift; every other list of the keys reads this, held by `tools/guards/test/step-keys.test.ts`.
 */
export const STEP_KEYS = [
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
  'memory',
  'budget',
  'check',
  'retries',
  'checkFailurePolicy',
  'gate',
  'output',
  'tally',
  'loop',
  'rounds',
  'routes',
  'route',
  'when',
  'ends',
  'workflow',
] as const;

/** One of `STEP_KEYS`. */
export type StepKey = (typeof STEP_KEYS)[number];

/**
 * How a key is set on a step's form, which is what its value is in JSON: `steps`, a list of the workflow's steps (`after`, `input`);
 * `step`, one of them (`resume`, `loop`); `choice`, one of the words offered (`harness`); `harness-word`, one of the words the step's
 * harness takes (`effort`, `permissionMode`, `sandbox`); `text`, one line (`model`, `check`); `list`, names (`tools`, `disallowedTools`);
 * `count`, a whole number, the parser's counts; `dollars`, an amount; `tokens`, a number of tokens, which the form writes as a person
 * does (`context`, `200k`); `flag`, `true` or `false` (`remote`, `gate`); `schema`, a file beside the step (`output`).
 */
export const STEP_KEY_FORMS = [
  'steps',
  'step',
  'choice',
  'harness-word',
  'text',
  'list',
  'count',
  'dollars',
  'tokens',
  'flag',
  'schema',
] as const;

/** One of `STEP_KEY_FORMS`. */
export type StepKeyForm = (typeof STEP_KEY_FORMS)[number];

/**
 * Each key's form (`STEP_KEY_FORMS`), in `STEP_KEYS`' order: a key added to `STEP_KEYS` without one does not typecheck. `place` is a
 * `choice` of its words, `git` and `folder`; `workspace` of one, `base`, `slot` of one, `none`, and `denials` of one, `fail`, since a
 * step either says it or says nothing; `agent` a `choice` of the agents offered. The `count`s are the parser's counts, whose keys are
 * typed by these.
 */
export const STEP_KEY_FORM = {
  after: 'steps',
  resume: 'step',
  input: 'steps',
  place: 'choice',
  workspace: 'choice',
  writable: 'list',
  reads: 'list',
  slot: 'choice',
  agent: 'choice',
  skills: 'list',
  mcp: 'list',
  harness: 'choice',
  model: 'text',
  effort: 'harness-word',
  context: 'tokens',
  permissionMode: 'harness-word',
  sandbox: 'harness-word',
  tools: 'list',
  disallowedTools: 'list',
  allowedTools: 'list',
  denials: 'choice',
  remote: 'flag',
  deadlineSeconds: 'count',
  memory: 'text',
  budget: 'dollars',
  check: 'text',
  retries: 'count',
  checkFailurePolicy: 'text',
  gate: 'flag',
  output: 'schema',
  tally: 'list',
  loop: 'step',
  rounds: 'count',
  routes: 'list',
  route: 'text',
  when: 'list',
  ends: 'list',
  workflow: 'text',
} as const satisfies { readonly [K in StepKey]: StepKeyForm };

/** Each key a step has as the loader reads it, every one optional: a key added to `STEP_KEYS` without one does not typecheck. */
const stepKeyFields = {
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
  harness: Schema.optionalKey(Text),
  model: Schema.optionalKey(Text),
  effort: Schema.optionalKey(Text),
  context: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  permissionMode: Schema.optionalKey(Text),
  sandbox: Schema.optionalKey(Text),
  tools: Schema.optionalKey(Schema.NullOr(Strings)),
  disallowedTools: Schema.optionalKey(Strings),
  allowedTools: Schema.optionalKey(Strings),
  denials: Schema.optionalKey(Schema.NullOr(Schema.Literal('fail'))),
  remote: Schema.optionalKey(Schema.NullOr(Schema.Boolean)),
  deadlineSeconds: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  memory: Schema.optionalKey(Text),
  budget: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  check: Schema.optionalKey(Text),
  retries: Schema.optionalKey(Schema.NullOr(Schema.Number)),
  checkFailurePolicy: Schema.optionalKey(Text),
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
} satisfies { readonly [K in StepKey]: Schema.Top };

/**
 * A step's keys, each as the loader reads it, every one optional: in `spec` only those its file writes, in `status` every key resolved,
 * `null` where it is unset. `route` is its line as written (`judge`, `{ script: … }`, `{ from: …, table: … }`). A key no step has is kept
 * as it was sent, never dropped, so a write of one is refused in the package's words rather than lost unsaid.
 */
export const StepKeys = Schema.StructWithRest(Schema.Struct(stepKeyFields), [Schema.Record(Schema.String, Schema.Unknown)]);
export type StepKeys = typeof StepKeys.Type;

/** A step as its file writes it: its name, the keys its file sets, and its note — all of its body for a step with no agent. */
export const WorkflowStep = Schema.Struct({ name: Schema.String, keys: StepKeys, body: Schema.String });
export type WorkflowStep = typeof WorkflowStep.Type;

/** A text file directly in a workflow's folder that is no markdown — a script, a schema, a table: its name in the folder and its text. */
export const WorkflowFile = Schema.Struct({ path: Schema.String, text: Schema.String });
export type WorkflowFile = typeof WorkflowFile.Type;

/** An answer a fix asks the person for before it runs, given to its command as `NEMIA_ANSWER_<NAME>` (its name in capitals). */
export const NeedAsk = Schema.Struct({ name: Schema.String, message: Schema.String });
export type NeedAsk = typeof NeedAsk.Type;

/**
 * A fix of a need: the shell command that puts it in place, what it does in words, the answers it asks first, the pattern of a code
 * its output shows a person (a device code), which the board and the client show large, and its kind (`FIX_KINDS`: `puts` where left
 * out, `typed` for one a person types on the server, `removes` for one that takes the need away).
 */
export const NeedFix = Schema.Struct({
  command: Schema.String,
  message: Schema.String,
  asks: Schema.optionalKey(Schema.Array(NeedAsk)),
  code: Schema.optionalKey(Schema.String),
  kind: Schema.optionalKey(Schema.Literals(FIX_KINDS)),
});
export type NeedFix = typeof NeedFix.Type;

/**
 * A machine need a workflow or a place declares: its name, what it is in words, the shell command whose exit 0 says it is in place, the
 * fixes that put it there, `fills`, the name of a place's need whose fixes this one's come before (sdlc fills the git identity), and
 * `scope` (`NEED_SCOPES`: `machine` where left out, `repository` for a need checked and fixed in each factory's repository).
 */
export const Need = Schema.Struct({
  name: Schema.String,
  message: Schema.String,
  check: Schema.String,
  fixes: Schema.optionalKey(Schema.Array(NeedFix)),
  fills: Schema.optionalKey(Schema.String),
  scope: Schema.optionalKey(Schema.Literals(NEED_SCOPES)),
});
export type Need = typeof Need.Type;

/**
 * A workflow as its files say it: its description, the machine needs its README's frontmatter declares (`needs`), its README (null
 * for none), its steps, in its order, and the folder's other text files (`files`, sorted by name). Given on a write, `files` is their
 * whole set, as a Kubernetes replace is: a text file of the folder that is no markdown and is not named is removed, a file that is not
 * text is never touched; left out, the folder's other files stay.
 */
export const WorkflowSpec = Schema.Struct({
  description: Schema.optionalKey(Text),
  needs: Schema.optionalKey(Schema.Array(Need)),
  readme: Schema.optionalKey(Text),
  steps: Schema.Array(WorkflowStep),
  files: Schema.optionalKey(Schema.Array(WorkflowFile)),
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

/**
 * A definition's files as a person keeps them, sent to be read into its spec (`POST /api/{workflows|agents|skills}/read`), which writes
 * nothing: a workflow's folder, its files directly in it; an agent's file first, then the files beside it its `output:` may name; a
 * skill's SKILL.md first, then its folder's other text files. Each by its path in the folder, with `/`, and its text. `name`, the name it
 * is read under where its files say none: a workflow's folder, an agent's file without `.md`, a skill whose SKILL.md names none.
 */
export const DefinitionFiles = Schema.Struct({ name: Schema.optionalKey(Schema.String), files: Schema.Array(WorkflowFile) });
export type DefinitionFiles = typeof DefinitionFiles.Type;

/**
 * One key of a step's form (`GET /api/workflows/keys`): the key, the package's line of what it means, how it is set, the words it may be
 * set to where there are some, and, for a key whose words are the harness's, those of each harness.
 */
export const KeyField = Schema.Struct({
  key: Schema.Literals(STEP_KEYS),
  meaning: Schema.String,
  kind: Schema.Literals(STEP_KEY_FORMS),
  choices: Schema.NullOr(Strings),
  byHarness: Schema.NullOr(Schema.Record(Schema.String, Strings)),
});
export type KeyField = typeof KeyField.Type;

/**
 * What the builder's form is drawn from (`GET /api/workflows/keys`): every key a step may set, in the package's order, the default
 * harness, the keys an agent may set (`roleKeys`) and those a step's file sets as its policy over its agent (`policyKeys`), the role values
 * each agent of yours gives a step it is attached to (`agents`), and how a step names a remote A2A agent with the keys it may not set.
 */
export const KeyForm = Schema.Struct({
  keys: Schema.Array(KeyField),
  defaultHarness: Schema.String,
  roleKeys: Schema.Array(Schema.Literals(STEP_KEYS)),
  policyKeys: Schema.Array(Schema.Literals(STEP_KEYS)),
  agents: Schema.Record(Schema.String, StepKeys),
  remote: Schema.Struct({ prefix: Schema.String, refuses: Schema.Array(Schema.Literals(STEP_KEYS)) }),
}).annotate({ identifier: 'KeyForm' });
export type KeyForm = typeof KeyForm.Type;

/** One key of a file as a step's page lays them out: the key, its value as the package read it (null where unset), and what it means. */
export const KeyRow = Schema.Struct({ key: Schema.String, value: Text, meaning: Schema.String });
export type KeyRow = typeof KeyRow.Type;

/**
 * A workflow step's page (`GET /api/namespaces/<namespace>/workflows/<name>/steps/<step>`): which workflow (`from`, the place it is read
 * from, `dir` its folder) and step, its body, its file as written, every key a step may set with its value as the loader read it, what its
 * agent says it can do (`agentSkills`, null for none), and, read now in the namespace's factory (`factory`, null for `default`): what a run
 * of it would be told by layer, the agent the factory hires into it, the factories that hire into it (with none named), whether an agent
 * can be hired into it and which, where each skill of its layers is found, and its newest runs.
 */
export const WorkflowStepPage = Schema.Struct({
  workflow: Schema.String,
  from: Schema.Literals(['repo', 'yours']),
  dir: Schema.String,
  step: Schema.String,
  body: Schema.String,
  source: Schema.String,
  keys: Schema.Array(KeyRow),
  agentSkills: Schema.NullOr(Schema.Array(CardSkill)),
  factory: Text,
  layers: StepLayers,
  hired: Text,
  hiredIn: Schema.Array(Schema.Struct({ factory: Schema.String, agent: Schema.String })),
  hiring: Schema.Struct({
    refused: Text,
    agents: Schema.Array(Schema.Struct({ name: Schema.String, description: Text })),
  }),
  skillsFrom: Schema.Array(
    Schema.Struct({ name: Schema.String, from: Schema.NullOr(Schema.Literals(['yours', 'repo', 'builtin'])), foundIn: Text }),
  ),
  recentRuns: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      brief: Schema.String,
      createdAt: Schema.String,
      factory: Text,
      filed: Schema.Boolean,
    }),
  ),
}).annotate({ identifier: 'WorkflowStepPage' });
export type WorkflowStepPage = typeof WorkflowStepPage.Type;
