/**
 * The Workflow: a folder of steps a factory resolves, served as an object in the factory's namespace (`default` for the api's repository
 * and your library). Its `spec` is what its files hold, the shape a proposal carries: its README whole, its steps in their files' order,
 * each with the keys its own file writes and its own note, and its other files. Its `status` is what Nemia works out of it: where it was
 * found (`origin`), its description, its needs and its README's instruction, its typed graph (every node with its kind, decision 12),
 * each step resolved — its keys with its agent's, what its agent is told, the agent the factory hires into it,
 * its told layers and MCP servers — the schemas beside it, and why a run of it cannot start in the factory.
 *
 * Beside it, the bodies a write is sent (`WorkflowWrite`, `WorkflowCreate`). Plain Schemas of JSON, as every object of this package is.
 */
import { Schema, Struct } from 'effect';
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
  'memoryRequest',
  'budget',
  'check',
  'checks',
  'run',
  'checkMemory',
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
  'brief',
  'card',
  'relabel',
  'waitsFor',
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
 * `choice` of its words, `git` and `folder`; `slot` of one, `none`, and `denials` of one, `fail`, since a
 * step either says it or says nothing; `agent` a `choice` of the agents offered. The `count`s are the parser's counts, whose keys are
 * typed by these.
 */
export const STEP_KEY_FORM = {
  after: 'steps',
  resume: 'step',
  input: 'steps',
  place: 'choice',
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
  memoryRequest: 'text',
  budget: 'dollars',
  check: 'text',
  checks: 'text',
  run: 'text',
  checkMemory: 'text',
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
  brief: 'choice',
  card: 'choice',
  relabel: 'list',
  waitsFor: 'list',
} as const satisfies { readonly [K in StepKey]: StepKeyForm };

/** Each key a step has as the loader reads it, every one optional: a key added to `STEP_KEYS` without one does not typecheck. */
const stepKeyFields = {
  after: Schema.optionalKey(
    Strings.annotate({
      description: 'The steps that must finish first, verified, or unverified where one has no check; none, and it starts at once.',
    }),
  ),
  resume: Schema.optionalKey(
    Text.annotate({ description: 'The step whose session this one continues instead of starting cold, which implies waiting on it.' }),
  ),
  input: Schema.optionalKey(
    Strings.annotate({ description: 'The steps whose declared output this one is handed in its brief, as data; each one it waits on.' }),
  ),
  place: Schema.optionalKey(
    Schema.NullOr(Schema.Literals(PLACE_KINDS)).annotate({
      description: 'Where the step works: folder, a folder the run makes, or git, branches of a repository.',
    }),
  ),
  writable: Schema.optionalKey(
    Strings.annotate({
      description: "The folders of the run's factory this step may write, each by its directory's name; every other step only reads them.",
    }),
  ),
  reads: Schema.optionalKey(
    Strings.annotate({
      description:
        'What of the store the step reads and never writes, each by name: inbox, the cards waiting to be started, or costs, what recent runs of its workflow cost.',
    }),
  ),
  slot: Schema.optionalKey(
    Schema.NullOr(Schema.Literal('none')).annotate({
      description: "none: the run takes no run slot, for a session that watches the other runs rather than doing a run's work.",
    }),
  ),
  agent: Schema.optionalKey(
    Text.annotate({
      description:
        "The agent attached to the node to do its work, by its name; its role keys are the step's defaults and the step's own keys win.",
    }),
  ),
  skills: Schema.optionalKey(
    Strings.annotate({ description: "The skills the step adds to its agent's, each a folder in a skills folder beside the agents." }),
  ),
  mcp: Schema.optionalKey(
    Strings.annotate({ description: "The MCP servers the step adds to its agent's, each by its name in the repository's .mcp.json." }),
  ),
  harness: Schema.optionalKey(
    Text.annotate({ description: 'What runs the session: claude, codex, or a2a:<name>, a remote A2A agent the store declares.' }),
  ),
  model: Schema.optionalKey(
    Text.annotate({ description: "The model the harness runs the session on; the harness's own default when unset." }),
  ),
  effort: Schema.optionalKey(Text.annotate({ description: 'How hard the harness thinks, in its own words.' })),
  context: Schema.optionalKey(
    Schema.NullOr(Schema.Number).annotate({ description: "The session's context window, in tokens; the model's whole window when unset." }),
  ),
  permissionMode: Schema.optionalKey(
    Text.annotate({
      description: "Claude Code's permission mode, whether it asks, denies or allows what no rule decides; on claude only.",
    }),
  ),
  sandbox: Schema.optionalKey(
    Text.annotate({ description: "Codex's sandbox: read-only, workspace-write or danger-full-access; on codex only." }),
  ),
  tools: Schema.optionalKey(
    Schema.NullOr(Strings).annotate({
      description: "The only tools the session may have, in the harness's names; the harness's own set when unset.",
    }),
  ),
  disallowedTools: Schema.optionalKey(
    Strings.annotate({
      description:
        "What the session may not have, in Claude Code's permission rules; a deny beats an allow the repository's settings give.",
    }),
  ),
  allowedTools: Schema.optionalKey(
    Strings.annotate({ description: "What the session may do without being asked, in Claude Code's permission rules." }),
  ),
  denials: Schema.optionalKey(
    Schema.NullOr(Schema.Literal('fail')).annotate({
      description: 'fail: a try the harness denied a call is not passed on; the step reads denied and waits on a person; on claude only.',
    }),
  ),
  remote: Schema.optionalKey(
    Schema.NullOr(Schema.Boolean).annotate({
      description:
        'true: every session of the step is bridged to claude.ai, where anyone signed in to the account can drive it; on claude only.',
    }),
  ),
  deadlineSeconds: Schema.optionalKey(
    Schema.NullOr(Schema.Number).annotate({ description: 'The seconds the engine lets the step run before stopping it.' }),
  ),
  memory: Schema.optionalKey(
    Text.annotate({
      description:
        "The most memory each session of the step may use, as a container's limit such as 4Gi; unset takes the daemon's default.",
    }),
  ),
  memoryRequest: Schema.optionalKey(
    Text.annotate({
      description:
        "The memory each session of the step asks of the machine, as a container's request such as 1Gi, which admission counts; at most its memory, and unset asks the daemon's default request.",
    }),
  ),
  budget: Schema.optionalKey(
    Schema.NullOr(Schema.Number).annotate({
      description:
        "The most the step's tries may cost together, in dollars; past it the run files nothing more for it until a person raises it.",
    }),
  ),
  check: Schema.optionalKey(
    Text.annotate({
      description: "A shell command the run executes in the step's workspace after it hands off; exit 0 makes the step verified.",
    }),
  ),
  checks: Schema.optionalKey(
    Text.annotate({
      description:
        "The step's named checks, each a name, a shell line (run) or a condition it waits on (condition), and the checks it waits on (after); written as a YAML list; exit 0 of every one makes the step verified.",
    }),
  ),
  run: Schema.optionalKey(
    Text.annotate({
      description:
        "A command node's shell line: the node runs it as a workload of its own, with no agent session, and signs off by its exit code.",
    }),
  ),
  checkMemory: Schema.optionalKey(
    Text.annotate({
      description:
        "The memory the step's check asks of the machine, as a container's request such as 256Mi; it keeps the daemon's default limit, and unset asks the daemon's default request.",
    }),
  ),
  retries: Schema.optionalKey(
    Schema.NullOr(Schema.Number).annotate({
      description:
        'How many times the run re-files the step after its check refuses it, or runs its check again where the machine killed it.',
    }),
  ),
  checkFailurePolicy: Schema.optionalKey(
    Text.annotate({
      description: 'Which exit codes of its check a person answers, as rules read in order, the first that holds deciding.',
    }),
  ),
  gate: Schema.optionalKey(
    Schema.NullOr(Schema.Literal(true)).annotate({
      description: "true: the step's closeout waits for a person's approval before anything after it is filed.",
    }),
  ),
  output: Schema.optionalKey(
    Text.annotate({ description: 'A JSON Schema file beside the step: what its closeout declares, for a step that reads it with input.' }),
  ),
  tally: Schema.optionalKey(
    Strings.annotate({ description: "What stats count of the step's closeouts, per day: fields its output declares." }),
  ),
  loop: Schema.optionalKey(
    Text.annotate({ description: "The step to run again when this one's closeout says again: true; one it waits on." }),
  ),
  rounds: Schema.optionalKey(Schema.NullOr(Schema.Number).annotate({ description: 'How many rounds loop may run, the first included.' })),
  routes: Schema.optionalKey(Schema.NullOr(Strings).annotate({ description: 'The routes this condition may answer, a closed list.' })),
  route: Schema.optionalKey(
    Text.annotate({
      description: "How this condition answers: a table over a producer's fact field, a script, or judge, a read-only agent.",
    }),
  ),
  when: Schema.optionalKey(
    Schema.NullOr(Strings).annotate({
      description: 'The routes of the condition this node waits on that it runs on; on any other it reads skipped.',
    }),
  ),
  ends: Schema.optionalKey(
    Schema.NullOr(Strings).annotate({ description: 'The routes of this condition on which the run ends, nothing after it running.' }),
  ),
  workflow: Schema.optionalKey(
    Text.annotate({ description: 'The workflow this node routes to: it starts a run of it, handed this run as context.' }),
  ),
  brief: Schema.optionalKey(
    Text.annotate({
      description:
        "What a workflow node briefs the run it starts with: title, its producer's title (the default); card, the run's own card as given.",
    }),
  ),
  card: Schema.optionalKey(
    Text.annotate({
      description: "What card this node files: backlog, the run's card back to the inbox, unqueued.",
    }),
  ),
  relabel: Schema.optionalKey(
    Schema.NullOr(Strings).annotate({
      description: 'The label edits a backlog node files the card back with: key=value sets a key, key- removes it.',
    }),
  ),
  waitsFor: Schema.optionalKey(
    Schema.NullOr(Strings).annotate({
      description: 'The conditions a wait node waits on: it runs no session and passes once each is written True for its try.',
    }),
  ),
} satisfies { readonly [K in StepKey]: Schema.Top };

/**
 * A step's keys, each as the loader reads it, every one optional: in `spec` only those its own file writes, as it writes them (never its
 * agent's, nor the agent a factory hires into it), in `status` every key resolved,
 * `null` where it is unset. `route` is its line as written (`judge`, `{ script: … }`, `{ from: …, table: … }`). A key no step has is kept
 * as it was sent, never dropped, so a write of one is refused in the package's words rather than lost unsaid.
 */
export const StepKeys = Schema.StructWithRest(Schema.Struct(stepKeyFields), [Schema.Record(Schema.String, Schema.Unknown)]);
export type StepKeys = typeof StepKeys.Type;

/** A step as its file writes it: its name, the keys its file sets, and its note — all of its body for a step with no agent. */
export const WorkflowStep = Schema.Struct({
  name: Schema.String.annotate({ description: "The step's name." }),
  keys: StepKeys.annotate({ description: 'The keys its file sets.' }),
  body: Schema.String.annotate({ description: "The step's note: all of its body for a step with no agent." }),
});
export type WorkflowStep = typeof WorkflowStep.Type;

/** A text file directly in a workflow's folder that is no markdown — a script, a schema, a table: its name in the folder and its text. */
export const WorkflowFile = Schema.Struct({
  path: Schema.String.annotate({ description: "The file's name in the folder, with / between folders." }),
  text: Schema.String.annotate({ description: "The file's text." }),
});
export type WorkflowFile = typeof WorkflowFile.Type;

/** An answer a fix asks the person for before it runs, given to its command as `NEMIA_ANSWER_<NAME>` (its name in capitals). */
export const NeedAsk = Schema.Struct({
  name: Schema.String.annotate({
    description: 'The name of the answer, given to the fix command as NEMIA_ANSWER_<NAME>, its name in capitals.',
  }),
  message: Schema.String.annotate({ description: 'The question put to the person.' }),
});
export type NeedAsk = typeof NeedAsk.Type;

/**
 * A fix of a need: the shell command that puts it in place, what it does in words, the answers it asks first, the pattern of a code
 * its output shows a person (a device code), which the board and the client show large, and its kind (`FIX_KINDS`: `puts` where left
 * out, `typed` for one a person types on the server, `removes` for one that takes the need away).
 */
export const NeedFix = Schema.Struct({
  command: Schema.String.annotate({ description: 'The shell command that puts the need in place.' }),
  message: Schema.String.annotate({ description: 'What the fix does, in words.' }),
  asks: Schema.optionalKey(Schema.Array(NeedAsk).annotate({ description: 'The answers it asks the person for before it runs.' })),
  code: Schema.optionalKey(
    Schema.String.annotate({
      description: 'The pattern of a code its output shows a person, such as a device code, which the board and the client show large.',
    }),
  ),
  kind: Schema.optionalKey(
    Schema.Literals(FIX_KINDS).annotate({
      description: 'Its kind: puts where left out, typed for one a person types on the server, removes for one that takes the need away.',
    }),
  ),
});
export type NeedFix = typeof NeedFix.Type;

/**
 * A machine need a workflow or a place declares: its name, what it is in words, the shell command whose exit 0 says it is in place, the
 * fixes that put it there, `fills`, the name of a place's need whose fixes this one's come before (a git identity, say), and
 * `scope` (`NEED_SCOPES`: `machine` where left out, `repository` for a need checked and fixed in each factory's repository).
 */
export const Need = Schema.Struct({
  name: Schema.String.annotate({ description: "The need's name." }),
  message: Schema.String.annotate({ description: 'What the need is, in words.' }),
  check: Schema.String.annotate({ description: 'The shell command whose exit 0 says the need is in place.' }),
  fixes: Schema.optionalKey(Schema.Array(NeedFix).annotate({ description: 'The fixes that put the need in place.' })),
  fills: Schema.optionalKey(
    Schema.String.annotate({
      description: "The name of a place's need whose fixes this one's come before, a git identity, say.",
    }),
  ),
  scope: Schema.optionalKey(
    Schema.Literals(NEED_SCOPES).annotate({
      description: "Where it is checked and fixed: machine where left out, repository in each factory's repository.",
    }),
  ),
});
export type Need = typeof Need.Type;

/**
 * A workflow as its files hold it, the shape a proposal carries: its README whole, frontmatter and all (null for none), each step's file
 * in file-name order, and the folder's other text files (`files`, sorted by name). Proposing back what is read changes nothing. A README
 * given with a frontmatter of its own is written as given; one given without is the instruction alone, written under the README's own
 * frontmatter (`readme-written`, the orchestrator's contract). Given on a write, `files` is their
 * whole set, as a Kubernetes replace is: a text file of the folder that is no markdown and is not named is removed, a file that is not
 * text is never touched; left out, the folder's other files stay.
 */
export const WorkflowSpec = Schema.Struct({
  readme: Schema.optionalKey(
    Text.annotate({
      description:
        "The workflow's README as its file holds it, frontmatter and all; null for none. Given without a frontmatter, it is written under the README's own.",
    }),
  ),
  steps: Schema.Array(WorkflowStep).annotate({
    description: "Each step's file, in file-name order, with the keys its own file writes.",
  }),
  files: Schema.optionalKey(
    Schema.Array(WorkflowFile).annotate({
      description: "The folder's other text files, sorted by name; given on a write, their whole set, so a text file left out is removed.",
    }),
  ),
}).annotate({
  description:
    "The workflow as its files hold it, the shape a proposal carries: its README whole, each step's file in file-name order, and the folder's other text files.",
});
export type WorkflowSpec = typeof WorkflowSpec.Type;

/** What a run of a step would be told, by layer (`ToldLayers`): its agent's, the person's and the factory's, and the step's policy. */
export const StepLayers = Schema.Struct({
  agent: Text.annotate({ description: "The agent's layer: what its file tells the session; null for none." }),
  instructions: Text.annotate({ description: "The instructions layer: the agent's own instructions; null for none." }),
  custom: Text.annotate({ description: 'Your layer: what you added for the agent; null for none.' }),
  factory: Text.annotate({ description: "The factory's layer: what the factory tells every session; null for none." }),
  agentSkills: Strings.annotate({ description: 'What the agent says it can do, as the names of its skills.' }),
  policy: Schema.String.annotate({ description: "The step's policy: what its file sets over its agent." }),
  addedSkills: Strings.annotate({ description: "The skills the step adds to its agent's." }),
  fence: Schema.Array(
    Schema.Struct({
      key: Schema.String.annotate({ description: 'The fence key, a tools or permission setting.' }),
      value: Schema.String.annotate({ description: "The key's value." }),
    }),
  ).annotate({ description: 'The fence the session runs under: each setting and its value.' }),
  folderFiles: Schema.Boolean.annotate({ description: 'Whether the session is told the files of its folder.' }),
  task: Text.annotate({ description: 'The task the session is given; null for none.' }),
  via: Schema.Literals(['prompt', 'brief']).annotate({
    description: 'How the task reaches the session: in its prompt, or as a brief file.',
  }),
});
export type StepLayers = typeof StepLayers.Type;

/**
 * A step resolved: its keys with its agent's (`spec`), what its agent is told (`body`), what its own file sets for a step with an agent
 * (`own`, null for one without, whose file is all of it), the agent the factory hires into it (`hired`, null for none), its told layers
 * (null for a step with no agent) and the MCP servers its sessions load.
 */
export const WorkflowStepStatus = Schema.Struct({
  name: Schema.String.annotate({ description: "The step's name." }),
  spec: StepKeys.annotate({ description: "The step's keys with its agent's, every key resolved, null where unset." }),
  body: Schema.String.annotate({ description: "What its agent is told: the step's body with the agent's." }),
  own: Schema.NullOr(
    Schema.Struct({
      keys: Strings.annotate({ description: 'The keys its own file sets.' }),
      body: Schema.String.annotate({ description: "The step's own note." }),
    }),
  ).annotate({ description: 'What its own file sets, for a step with an agent; null for one without, whose file is all of it.' }),
  hired: Text.annotate({ description: 'The agent the factory hires into the step; null for none.' }),
  layers: Schema.NullOr(StepLayers).annotate({ description: 'What a run of the step is told, by layer; null for a step with no agent.' }),
  mcp: Strings.annotate({ description: 'The MCP servers its sessions load.' }),
});
export type WorkflowStepStatus = typeof WorkflowStepStatus.Type;

/**
 * What Nemia reads of a workflow: its origin and what shadows it, its folder (`dir`), its description, the machine needs its README's
 * frontmatter declares (`needs`), its README without its frontmatter (`readmeBody`), its typed graph, each step resolved in graph order,
 * the schema files beside its steps, whether every step works in a folder (`folderTeam`), why it does not load (`error`, null where it
 * does) and why a run of it cannot start in the factory (`unfilled`, null where it can), and its revision.
 */
export const WorkflowStatus = Schema.Struct({
  ...definitionStatus,
  dir: Schema.String.annotate({ description: "The workflow's folder." }),
  description: Text.annotate({ description: "The workflow's description, its README's first paragraph; null where it has none." }),
  needs: Schema.Array(Need).annotate({ description: "The machine needs its README's frontmatter declares; none where it declares none." }),
  readmeBody: Text.annotate({ description: "The workflow's README without its frontmatter, its instruction; null for none." }),
  graph: TypedGraph.annotate({ description: "The workflow's typed graph: every node with its kind." }),
  steps: Schema.Array(WorkflowStepStatus).annotate({ description: "Each step resolved, in the workflow's order." }),
  schemas: Strings.annotate({ description: 'The schema files beside its steps.' }),
  folderTeam: Schema.Boolean.annotate({ description: 'Whether every step works in a folder.' }),
  error: Text.annotate({ description: 'Why the workflow does not load; null where it does.' }),
  unfilled: Text.annotate({ description: 'Why a run of it cannot start in the factory; null where it can.' }),
  removed: Schema.optionalKey(
    Strings.annotate({ description: 'The files a removal took, by their path in the folder, on that answer alone.' }),
  ),
}).annotate({
  description:
    'What Nemia reads of the workflow: where it was found, its folder, its graph, each step resolved, why it does not load or cannot start in the factory, and its revision.',
});
export type WorkflowStatus = typeof WorkflowStatus.Type;

/** A workflow, as an object. */
export const Workflow = Schema.Struct({
  apiVersion: Schema.Literal(API_VERSION).annotate({ description: 'The version the object is served under, nemia/v1.' }),
  kind: Schema.Literal('Workflow').annotate({ description: 'What the object is: a Workflow, a folder of markdown, one file a step.' }),
  metadata: ObjectMeta,
  spec: WorkflowSpec,
  status: WorkflowStatus,
});
export type Workflow = typeof Workflow.Type;

/** A step as a list serves it: its name and the keys its file sets, without its note. */
const ListedStep = WorkflowStep.mapFields(Struct.omit(['body']));

/** A step resolved as a list serves it: its keys, the agent hired into it and its MCP servers, without what it is told. */
const ListedStepStatus = WorkflowStepStatus.mapFields((fields) => ({
  ...Struct.omit(fields, ['body', 'own', 'layers']),
  own: Schema.NullOr(Schema.Struct({ keys: Strings.annotate({ description: 'The keys its own file sets.' }) })).annotate({
    description: 'The keys its own file sets, for a step with an agent; null for one without.',
  }),
}));

/** A workflow as a list serves it: its object without its README, its steps' notes or its files' text, which a read of it answers. */
const WorkflowListed = Schema.Struct({
  ...Workflow.fields,
  spec: WorkflowSpec.mapFields(() => ({
    steps: Schema.Array(ListedStep).annotate({
      description: "Each step's file, in file-name order, by its name and the keys it writes, without its note.",
    }),
    files: Schema.optionalKey(
      Schema.Array(
        Schema.Struct({ path: Schema.String.annotate({ description: "The file's name in the folder, with / between folders." }) }),
      ).annotate({ description: "The folder's other text files, by name alone: a read of the workflow answers their text." }),
    ),
  })).annotate({
    description:
      "The workflow as its files hold it, without its README, its steps' notes or its files' text, which a read of the workflow answers.",
  }),
  status: WorkflowStatus.mapFields((fields) => ({
    ...Struct.omit(fields, ['readmeBody', 'steps']),
    steps: Schema.Array(ListedStepStatus).annotate({
      description: "Each step resolved, in the workflow's order, without what it is told, which a read of the workflow answers.",
    }),
  })).annotate({
    description:
      'What Nemia reads of the workflow, without its README or what its steps are told: where it was found, its folder, its graph, its steps, why it does not load or cannot start in the factory, and its revision.',
  }),
}).annotate({ description: "A workflow as a list serves it, without its files' content (LISTED_WITHOUT)." });
type WorkflowListed = typeof WorkflowListed.Type;

/** A page of a namespace's workflows, each without its files' content. */
export const WorkflowList = listOf('Workflow', WorkflowListed);
export type WorkflowList = typeof WorkflowList.Type;

/** A JSON Schema file beside the steps, which an `output:` may name, by its file and its text. */
export const SchemaFile = Schema.Struct({
  file: Schema.String.annotate({ description: "The schema file's name beside the steps." }),
  text: Schema.String.annotate({ description: "The schema's text." }),
});
export type SchemaFile = typeof SchemaFile.Type;

/**
 * A workflow of the person's library written whole (`PUT …/workflows/<name>`): its spec, the schema files beside it, and the
 * `resourceVersion` it was read at, refused where its files now hold another.
 */
export const WorkflowWrite = Schema.Struct({
  metadata: Schema.optionalKey(WriteMeta),
  spec: WorkflowSpec,
  schemas: Schema.optionalKey(Schema.Array(SchemaFile).annotate({ description: 'The schema files beside the steps.' })),
});
export type WorkflowWrite = typeof WorkflowWrite.Type;

/** A workflow of the person's library made (`POST …/workflows`): its name, and its spec, of one step. */
export const WorkflowCreate = Schema.Struct({
  metadata: Schema.Struct({ name: Schema.String.annotate({ description: 'The name of the workflow to make.' }) }).annotate({
    description: 'The workflow to make, by its name.',
  }),
  spec: WorkflowSpec,
});
export type WorkflowCreate = typeof WorkflowCreate.Type;

/**
 * A definition's files as a person keeps them, sent to be read into its spec (`POST /api/{workflows|agents|skills}/read`), which writes
 * nothing: a workflow's folder, its files directly in it; an agent's file first, then the files beside it its `output:` may name; a
 * skill's SKILL.md first, then its folder's other text files. Each by its path in the folder, with `/`, and its text. `name`, the name it
 * is read under where its files say none: a workflow's folder, an agent's file without `.md`, a skill whose SKILL.md names none.
 */
export const DefinitionFiles = Schema.Struct({
  name: Schema.optionalKey(
    Schema.String.annotate({ description: 'The name the files are read under where they say none: the folder, or the file without .md.' }),
  ),
  files: Schema.Array(WorkflowFile).annotate({ description: "The definition's files, each by its path in the folder and its text." }),
});
export type DefinitionFiles = typeof DefinitionFiles.Type;

/**
 * One key of a step's form (`GET /api/workflow-keys`): the key, the package's line of what it means, how it is set, the words it may be
 * set to where there are some, and, for a key whose words are the harness's, those of each harness.
 */
export const KeyField = Schema.Struct({
  key: Schema.Literals(STEP_KEYS).annotate({ description: 'The key.' }),
  meaning: Schema.String.annotate({ description: "The package's line of what the key means." }),
  kind: Schema.Literals(STEP_KEY_FORMS).annotate({ description: 'How the key is set on a form.' }),
  choices: Schema.NullOr(Strings).annotate({ description: 'The words it may be set to; null where it takes any.' }),
  byHarness: Schema.NullOr(Schema.Record(Schema.String, Strings)).annotate({
    description: "For a key whose words are the harness's, the words of each harness by its name; null otherwise.",
  }),
});
export type KeyField = typeof KeyField.Type;

/**
 * What the builder's form is drawn from (`GET /api/workflow-keys`): every key a step may set, in the package's order, the default
 * harness, the keys an agent may set (`roleKeys`) and those a step's file sets as its policy over its agent (`policyKeys`), the role values
 * each agent of the person's library gives a step it is attached to (`agents`), and how a step names a remote A2A agent with the keys it
 * may not set.
 */
export const KeyForm = Schema.Struct({
  keys: Schema.Array(KeyField).annotate({
    description: "Every key a step may set, in the package's order: what it means, how it is set and the words it may take.",
  }),
  defaultHarness: Schema.String.annotate({ description: 'The harness a step runs on where it names none.' }),
  roleKeys: Schema.Array(Schema.Literals(STEP_KEYS)).annotate({ description: 'The keys an agent may set.' }),
  policyKeys: Schema.Array(Schema.Literals(STEP_KEYS)).annotate({
    description: "The keys a step's file sets as its policy over its agent.",
  }),
  agents: Schema.Record(Schema.String, StepKeys).annotate({
    description: 'The role values each agent of the user library gives a step it is attached to, by its name.',
  }),
  remote: Schema.Struct({
    prefix: Schema.String.annotate({ description: 'The prefix the harness: line gives a remote A2A agent, a2a:.' }),
    refuses: Schema.Array(Schema.Literals(STEP_KEYS)).annotate({ description: 'The keys a step naming a remote agent may not set.' }),
  }).annotate({
    description: 'How a step names a remote A2A agent: the prefix its harness: line gives (a2a:), and the keys such a step may not set.',
  }),
}).annotate({ identifier: 'KeyForm' });
export type KeyForm = typeof KeyForm.Type;

/** One key of a file as a step's page lays them out: the key, its value as the package read it (null where unset), and what it means. */
export const KeyRow = Schema.Struct({
  key: Schema.String.annotate({ description: 'The key.' }),
  value: Text.annotate({ description: 'Its value as the package read it; null where unset.' }),
  meaning: Schema.String.annotate({ description: 'What the key means.' }),
});
export type KeyRow = typeof KeyRow.Type;

/**
 * A workflow step's page (`GET /api/namespaces/<namespace>/workflows/<name>/steps/<step>`): which workflow (`from`, the place it is read
 * from, `dir` its folder) and step, its body, its file as written, every key a step may set with its value as the loader read it, what its
 * agent says it can do (`agentSkills`, null for none), and, read now in the namespace's factory (`factory`, null for `default`): what a run
 * of it would be told by layer, the agent the factory hires into it, the factories that hire into it (with none named), whether an agent
 * can be hired into it and which, where each skill of its layers is found, and its newest runs.
 */
export const WorkflowStepPage = Schema.Struct({
  workflow: Schema.String.annotate({ description: 'The workflow the step is of.' }),
  from: Schema.Literals(['repo', 'user']).annotate({
    description: "Where the workflow is read from: the factory's repository, or the person's library (`user`).",
  }),
  dir: Schema.String.annotate({ description: "The workflow's folder." }),
  step: Schema.String.annotate({ description: "The step's name." }),
  body: Schema.String.annotate({ description: "The step's body: what its agent is told to do." }),
  source: Schema.String.annotate({ description: "The step's file as written." }),
  keys: Schema.Array(KeyRow).annotate({
    description: 'Every key a step may set, with its value as the loader read it (null where unset) and what it means.',
  }),
  agentSkills: Schema.NullOr(Schema.Array(CardSkill)).annotate({
    description: "What the step's agent says it can do, as card entries; null where it has none.",
  }),
  factory: Text.annotate({ description: "The factory the page was read in, the namespace's; null for default." }),
  layers: StepLayers.annotate({
    description: "What a run of the step would be told now, by layer: its agent's, the person's, the factory's, and the step's policy.",
  }),
  hired: Text.annotate({ description: 'The agent the factory hires into the step; null where it hires none.' }),
  hiredIn: Schema.Array(
    Schema.Struct({
      factory: Schema.String.annotate({ description: 'The factory that hires an agent into the step.' }),
      agent: Schema.String.annotate({ description: 'The agent it hires.' }),
    }),
  ).annotate({
    description: 'The factories that hire an agent into the step, each with the agent; empty where none does.',
  }),
  hiring: Schema.Struct({
    refused: Text.annotate({ description: 'Why no agent can be hired into the step; null where one can.' }),
    agents: Schema.Array(
      Schema.Struct({
        name: Schema.String.annotate({ description: "The agent's name." }),
        description: Text.annotate({ description: "The agent's description; null for none." }),
      }),
    ).annotate({ description: 'The agents that can be hired into the step.' }),
  }).annotate({
    description:
      'Whether an agent can be hired into the step: why not (null where it can), and the agents that can, each with its description.',
  }),
  skillsFrom: Schema.Array(
    Schema.Struct({
      name: Schema.String.annotate({ description: "The skill's name." }),
      from: Schema.NullOr(Schema.Literals(['user', 'repo', 'builtin'])).annotate({
        description: 'Where the skill is found: the user library, the repository or a builtin; null where none is found.',
      }),
      foundIn: Text.annotate({ description: 'The folder it is found in; null where none is found.' }),
    }),
  ).annotate({
    description:
      "Where each skill of the step's layers is found: the person's library, the repository's or a builtin, and the folder; null where none is found.",
  }),
  recentRuns: Schema.Array(
    Schema.Struct({
      id: Schema.String.annotate({ description: "The run's id." }),
      brief: Schema.String.annotate({ description: "The run's brief." }),
      createdAt: Schema.String.annotate({ description: 'When the run was made, as an ISO 8601 time.' }),
      factory: Text.annotate({ description: "The run's factory; null for none." }),
      filed: Schema.Boolean.annotate({ description: "Whether the run's task was filed." }),
    }),
  ).annotate({
    description: "The step's newest runs: each run's id, brief, when it was made, its factory and whether its task was filed.",
  }),
}).annotate({ identifier: 'WorkflowStepPage' });
export type WorkflowStepPage = typeof WorkflowStepPage.Type;
