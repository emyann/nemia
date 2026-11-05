/**
 * The workflows as the board reads them — the Workflow objects of a namespace (`objects.ts`), each seen as a `WorkflowListing` — a step's
 * page, and a run started from one (apps/api/src/step/step.ts, apps/api/src/workflows/workflows.ts); and the builder's writes of a folder
 * of yours, through the Workflow object, which answer the folder as the list reads it.
 */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import type { DefinitionOrigin, Workflow, WorkflowStep, WorkflowStepStatus } from 'objects';
import { decodes } from './decodes.ts';
import { get, send } from './read.ts';
import type { GraphEdge, RunGraph } from './graph.ts';
import { StepLayersSchema, type StepLayers } from './layers.ts';
import { workflows as served, type Refuse } from './objects.ts';
import {
  AgentSkillSchema,
  KeyRowSchema,
  sourceOf,
  type AgentSkill,
  type KeyRow,
  type SchemaFile,
  type StepKey,
  type WorkflowStepSpec,
} from './library.ts';

/** The namespace of the api's repository and your library, where the board writes yours. */
const DEFAULT = 'default';

/**
 * A step as the board reads it, off a Workflow's `status.steps`: `spec` and `body` are the step resolved; `own` is what a step with an
 * agent sets itself, null for a step with none; `hired` is the agent the factory the workflow is read in hires into it, which `spec.agent`
 * then names too — null for a step it hires no one into, and in the default namespace. `layers` is what a run of a step with an agent would
 * be told, by layer — the agent's instructions, your custom instructions, the step's policy — null for a step with none. `mcp` is the MCP
 * servers its sessions load, its agent's then those the step's own line adds (`spec.mcp`): empty where neither names any or the step has
 * no agent.
 */
export type ListedStep = {
  name: string;
  spec: WorkflowStepSpec;
  body: string;
  own: StepOwn | null;
  hired: string | null;
  layers: StepLayers | null;
  mcp: string[];
};

/** A step as the builder puts it back: a listed step without `hired`, `layers` and `mcp`, which no step file writes. */
export type StepWritten = Omit<ListedStep, 'hired' | 'layers' | 'mcp'>;

/** The keys a step with an agent sets itself — the rest are its agent's — and its own note. */
export type StepOwn = { keys: StepKey[]; body: string };

/**
 * A workflow as the board reads it, off its Workflow object: its name, where it is read from (`from`, the object's `status.origin`: the
 * factory's own tree, the repository's `workflows/`, or yours), its folder, its README's description, its steps, its graph and the schemas
 * beside its steps; or, for a folder that does not read as a workflow, the loader's refusal and no steps.
 */
export type WorkflowListing = {
  name: string;
  from: DefinitionOrigin;
  dir: string;
  description: string | null;
  /** The folder's README in full, the workflow level's instruction; null for a folder with none. */
  readme: string | null;
  steps: ListedStep[];
  graph: RunGraph;
  /** The `.json` files beside the steps, which an `output:` may name. */
  schemas: string[];
  /**
   * Whether every step says `place: folder`: a team that works in folders the run makes and never looks at a repository. A card
   * for one is filed with no `repo:` (the api refuses one), and a run of one has no branch to read.
   */
  folderTeam: boolean;
  /**
   * What the folder's files held when it was read (its `metadata.resourceVersion`): a save carries it, and the api refuses one of a folder
   * changed since (409).
   */
  version: string;
  error: string | null;
  /**
   * Why a run of it cannot start in the factory it is read in, in the package's words: the steps its hires leave with no agent, and the
   * hire that fills each. Null where every step has one, in the default namespace, and for a folder that does not load.
   */
  unfilled: string | null;
};

/** Every key a step may set, unset: what a key the object leaves out reads as. */
const UNSET_SPEC: Readonly<WorkflowStepSpec> = {
  harness: null,
  model: null,
  effort: null,
  context: null,
  after: [],
  resume: null,
  input: [],
  place: null,
  workspace: null,
  writable: [],
  reads: [],
  slot: null,
  agent: null,
  skills: [],
  mcp: [],
  permissionMode: null,
  sandbox: null,
  tools: null,
  disallowedTools: [],
  allowedTools: [],
  denials: null,
  remote: null,
  deadlineSeconds: null,
  budget: null,
  check: null,
  retries: null,
  gate: null,
  output: null,
  tally: [],
  loop: null,
  rounds: null,
  routes: null,
  route: null,
  when: null,
  ends: null,
  workflow: null,
};

/** Whether `key` is a key a step may set. */
const isStepKey = (key: string): key is StepKey => Object.hasOwn(UNSET_SPEC, key);

/** A list copied, as the board's plain types hold one: mutable. */
const copied = <T>(list: readonly T[]): T[] => [...list];

/** A list copied, or null for none. */
const copiedOrNull = <T>(list: readonly T[] | null | undefined): T[] | null => (list ? [...list] : null);

/** A step's keys as the object has them, every one: a key it leaves out unset, each list copied. */
const specOf = (keys: WorkflowStepStatus['spec']): WorkflowStepSpec => ({
  ...UNSET_SPEC,
  ...keys,
  after: copied(keys.after ?? []),
  input: copied(keys.input ?? []),
  writable: copied(keys.writable ?? []),
  reads: copied(keys.reads ?? []),
  skills: copied(keys.skills ?? []),
  mcp: copied(keys.mcp ?? []),
  tools: copiedOrNull(keys.tools),
  disallowedTools: copied(keys.disallowedTools ?? []),
  allowedTools: copied(keys.allowedTools ?? []),
  tally: copied(keys.tally ?? []),
  routes: copiedOrNull(keys.routes),
  when: copiedOrNull(keys.when),
  ends: copiedOrNull(keys.ends),
});

/** A step of a Workflow's status, as the board reads it. */
const stepOf = (step: WorkflowStepStatus): ListedStep => ({
  name: step.name,
  spec: specOf(step.spec),
  body: step.body,
  own: step.own === null ? null : { keys: step.own.keys.filter(isStepKey), body: step.own.body },
  hired: step.hired,
  layers:
    step.layers === null
      ? null
      : {
          ...step.layers,
          agentSkills: copied(step.layers.agentSkills),
          addedSkills: copied(step.layers.addedSkills),
          fence: step.layers.fence.map((f) => ({ ...f })),
        },
  mcp: copied(step.mcp),
});

/** A graph's edge the board draws: an input's is not drawn, as a run's page draws none (`runView.ts`). */
const drawnEdge = (edge: Workflow['status']['graph']['edges'][number]): edge is GraphEdge => edge.kind !== 'input';

/** A Workflow, as the board reads it (`WorkflowListing`). */
export const workflowViewOf = (workflow: Workflow): WorkflowListing => ({
  name: workflow.metadata.name,
  from: workflow.status.origin,
  dir: workflow.status.dir,
  description: workflow.spec.description ?? null,
  readme: workflow.spec.readme ?? null,
  steps: workflow.status.steps.map(stepOf),
  graph: {
    roots: copied(workflow.status.graph.roots),
    edges: workflow.status.graph.edges.filter(drawnEdge).map((e) => ({ ...e })),
    nodes: workflow.status.graph.nodes.map((n) => ({ ...n, ...(n.ends ? { ends: copied(n.ends) } : {}) })),
  },
  schemas: copied(workflow.status.schemas),
  folderTeam: workflow.status.folderTeam,
  version: workflow.metadata.resourceVersion,
  error: workflow.status.error,
  unfilled: workflow.status.unfilled,
});

/** A value a key of a step's file writes: neither null nor an empty list, which a file leaves out. */
const isSet = (value: unknown): boolean => value !== null && value !== undefined && !(Array.isArray(value) && !value.length);

/**
 * A step as its file writes it, which a save sends (`spec.steps`): a step with an agent, the keys it sets itself and its own note; one with
 * none, every key it sets and all of its body.
 */
export const writtenStepOf = (step: StepWritten): WorkflowStep => {
  const entries = Object.entries(step.spec) as Array<[StepKey, unknown]>;
  const kept = step.own === null ? entries.filter(([, value]) => isSet(value)) : entries.filter(([key]) => step.own?.keys.includes(key));
  return { name: step.name, keys: Object.fromEntries(kept), body: step.own === null ? step.body : step.own.body };
};

/** Every workflow the default namespace serves: the api's repository's and yours. Not polled: it changes when a person edits a folder. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: async () => (await served.list(DEFAULT)).map(workflowViewOf),
});

/**
 * Where a start runs and a listing is read, as the api resolves `?factory=` and `?repo=` (`placeFor`): a factory, and one of its
 * repositories.
 */
export type Place = { factory: string; repo: string };

/** The query naming `place`: none for no place and for the default factory, whose answer is the same as naming none. */
export const placeQuery = (place?: Place | null): string =>
  !place || place.factory === 'default' ? '' : `?factory=${encodeURIComponent(place.factory)}&repo=${encodeURIComponent(place.repo)}`;

/**
 * The workflows a factory offers on one of its repositories, its namespace read on `?repo=`, with its hires: each says what they leave
 * `unfilled`, and each step the agent `hired` into it. Keyed apart from `workflowsQuery`, which the builder drafts from: a builder never
 * reads this one. Read by a factory's start, and by the Workflows page, a workflow's page and a step's bar reached in a factory
 * (`workflowsInQuery`).
 */
export const factoryWorkflowsQuery = (place: Place) =>
  queryOptions({
    queryKey: ['factory-workflows', place.factory, place.repo],
    queryFn: async () => (await served.list(place.factory, { repo: place.repo })).map(workflowViewOf),
  });

/**
 * The list of workflows read in `place`: `workflowsQuery` for none, `factoryWorkflowsQuery` in a factory on one of its repositories, each
 * under its own key, so a page and a factory's start share one read.
 */
export const workflowsInQuery = (place: Place | null) => (place === null ? workflowsQuery : factoryWorkflowsQuery(place));

export { sourceOf };

/**
 * Whether a workflow read from `from` is the one an address naming `named` means: the same origin, or, where the address is a route's kept
 * on Hono, which names the factory's own tree `repo` (`sourceOf`), the same word there.
 */
export const fromMatches = (from: DefinitionOrigin, named: string): boolean => from === named || sourceOf(from) === named;

/** Mirrors `RecentRun` in apps/api/src/step/step.ts: one of a step's newest runs, and whether the step was filed in it. */
export type RecentRun = { id: string; brief: string; createdAt: string; factory: string | null; filed: boolean };

/**
 * Mirrors `SkillFrom` in apps/api/src/step/step.ts: a skill a step's layers give, named as its line writes it, and where its page is
 * (`from`), null where it has none; and then where this repository has it (`foundIn`), null for one found nowhere.
 */
export type SkillFrom = { name: string; from: 'yours' | 'repo' | 'builtin' | null; foundIn: string | null };

/**
 * Mirrors `Hiring` in apps/api/src/step/step.ts: why no agent can be hired into a step in the factory it is read in, null where one can;
 * and the agents beside its workflow that can be, by name, each with its description — none where it is refused.
 */
export type Hiring = { refused: string | null; agents: Array<{ name: string; description: string | null }> };

/**
 * Mirrors `WorkflowStepPage` in apps/api/src/step/step.ts: one step of a workflow — its body, its file as written, and every key a step
 * may set, in the package's order, with its value as the loader read it; and, read now in the request's factory (`factory`, null for the
 * default), what a run of it would be told (`layers`), the agent the factory hires into it (`hired`), the factories that hire into it when
 * none is named (`hiredIn`), whether one can be hired into it and whom (`hiring`), where each skill of its layers is found (`skillsFrom`)
 * and its newest runs (`recentRuns`).
 */
export type WorkflowStepPage = {
  workflow: string;
  from: 'repo' | 'yours';
  dir: string;
  step: string;
  body: string;
  source: string;
  keys: KeyRow[];
  /**
   * What the agent this step names says it can do, read beside the workflow — null for a step with no agent, or one whose skills do not
   * read.
   */
  agentSkills: AgentSkill[] | null;
  factory: string | null;
  layers: StepLayers;
  hired: string | null;
  hiredIn: Array<{ factory: string; agent: string }>;
  hiring: Hiring;
  skillsFrom: SkillFrom[];
  recentRuns: RecentRun[];
};

/** Where the step page says a workflow is read from: the repository's `workflows/`, the factory's own tree among them, or yours. */
const WorkflowSourceSchema = Schema.Literals(['repo', 'yours']);

/** Decodes a `WorkflowStepPage`. */
const WorkflowStepPageSchema = decodes<WorkflowStepPage>()(
  Schema.Struct({
    workflow: Schema.String,
    from: WorkflowSourceSchema,
    dir: Schema.String,
    step: Schema.String,
    body: Schema.String,
    source: Schema.String,
    keys: Schema.mutable(Schema.Array(KeyRowSchema)),
    agentSkills: Schema.NullOr(Schema.mutable(Schema.Array(AgentSkillSchema))),
    factory: Schema.NullOr(Schema.String),
    layers: StepLayersSchema,
    hired: Schema.NullOr(Schema.String),
    hiredIn: Schema.mutable(Schema.Array(Schema.Struct({ factory: Schema.String, agent: Schema.String }))),
    hiring: Schema.Struct({
      refused: Schema.NullOr(Schema.String),
      agents: Schema.mutable(Schema.Array(Schema.Struct({ name: Schema.String, description: Schema.NullOr(Schema.String) }))),
    }),
    skillsFrom: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          name: Schema.String,
          from: Schema.NullOr(Schema.Literals(['yours', 'repo', 'builtin'])),
          foundIn: Schema.NullOr(Schema.String),
        }),
      ),
    ),
    recentRuns: Schema.mutable(
      Schema.Array(
        Schema.Struct({
          id: Schema.String,
          brief: Schema.String,
          createdAt: Schema.String,
          factory: Schema.NullOr(Schema.String),
          filed: Schema.Boolean,
        }),
      ),
    ),
  }),
);

/** The place a workflow's or a step's page is read in, as its address carries it: a factory, and a repository where one is named. */
export type PagePlace = { factory?: string; repo?: string };

/** The query naming `place` on a page's read: each of its keys that is set, the factory first. */
export const pagePlaceQuery = (place: PagePlace = {}): string => {
  const keys = [
    ...(place.factory ? [`factory=${encodeURIComponent(place.factory)}`] : []),
    ...(place.repo ? [`repo=${encodeURIComponent(place.repo)}`] : []),
  ];
  return keys.length ? `?${keys.join('&')}` : '';
};

/**
 * A step of a workflow, for its page, read in `place`: the factory picked and its repository. Read again on each visit, as the Workflows
 * page is: a person edits the folder, and a factory's hires. `from` is the origin the page's address names; the route, kept on Hono, reads
 * it as `sourceOf` says.
 */
export const stepQuery = (from: string, workflow: string, step: string, place: PagePlace = {}) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step, place.factory ?? null, place.repo ?? null],
    queryFn: () =>
      get(
        `/api/workflows/${sourceOf(from)}/${encodeURIComponent(workflow)}/${encodeURIComponent(step)}${pagePlaceQuery(place)}`,
        WorkflowStepPageSchema,
      ),
  });

/** A workflow by name, as the Workflows page lists it: the last segment of its folder. */
export const workflowNameOf = (workflowDir: string): string =>
  workflowDir
    .replace(/[\\/]+$/, '')
    .split(/[\\/]/)
    .at(-1) || workflowDir;

/** The repository a start runs in, as the api resolved it: what the start form lists the runs of. Read once a visit. */
export const repositoryQuery = queryOptions({
  queryKey: ['repository'],
  queryFn: () => get('/api/repository', Schema.Struct({ repo: Schema.String })),
});

/** What a start answers: the new run. An inbox card started stays in the inbox, listed as `started`. */
export type Started = { id: string };

/** Decodes a `Started`. */
const StartedSchema = decodes<Started>()(Schema.Struct({ id: Schema.String }));

/**
 * Start a run of a workflow, as the CLI's `start` does: the api writes the run's record and files nothing. Resolves with the new run's id;
 * rejects with the api's refusal in full — the loader's, the CLI `start`'s (`afterRefusal`'s, for a run it will not wait on), or the api's
 * own about the request; and an answer the board does not read, saying the run may have started. `after` names the runs it waits on, as
 * `--after` does; left out when there are none. `context` names the runs it reads as context, as `--from` does; left out when there are
 * none.
 *
 * An inbox card is started through the Card's own verb (`startCard`, inbox.ts), never here.
 *
 * `place` starts it in a factory, on one of its repositories, as the CLI's `start --factory` does (`placeQuery`): refused in the package's
 * words for a workflow the factory has not attached, a step its hires leave unfilled, or a repository outside it.
 *
 * Sent as `application/json`, which the api requires of a start: the one body a page on another site cannot send it unasked.
 */
export const startRun = (
  start: {
    workflow: string;
    from: WorkflowListing['from'];
    brief: string;
    after?: readonly string[];
    context?: readonly string[];
  },
  place?: Place | null,
): Promise<Started> =>
  send('POST', `/api/runs${placeQuery(place)}`, StartedSchema, {
    body: { ...start, from: sourceOf(start.from) },
    may: 'The run may have started: look on the Runs page before starting it again.',
  });

/**
 * A write of the builder's the api refused: its sentence, and the steps it names — one, several for a cycle, or none for a refusal of the
 * folder or the request — which the board shows it by. `status` is the api's: 409 for a folder changed since the board read it. Null for a
 * write refused before an answer said why.
 */
export class BuildRefusal extends Error {
  readonly steps: string[];
  readonly status: number | null;
  constructor(message: string, steps: readonly string[], status: number | null = null) {
    super(message);
    this.steps = [...steps];
    this.status = status;
  }
}

/** The steps a refusal of the builder's names: its `steps`, none where it names none. */
const StepsNamed = Schema.Struct({ steps: Schema.Array(Schema.String) });

/** How a builder's write is refused: a `BuildRefusal` in the api's words, with the steps it names and its status. */
const refused: Refuse = (words, status, answer) =>
  new BuildRefusal(
    words,
    Option.match(Schema.decodeUnknownOption(StepsNamed)(answer), { onNone: () => [], onSome: (s) => s.steps }),
    status,
  );

/**
 * Put a folder of yours back from its steps, as their files write them (`writtenStepOf`), the schemas pasted for them and its README when
 * it changed, as the builder saves it (`PUT /api/namespaces/default/workflows/<name>`), at the `version` it was read at: answers the folder
 * read back from disk. Rejects with a `BuildRefusal`: the package's sentence and the steps it names, a folder changed since it was read
 * (409), or the api's own about the request; and with an `UnreadAnswer` for an answer the board does not read, saying the folder may be
 * written.
 */
export const saveWorkflow = async (
  name: string,
  save: { version: string; steps: readonly StepWritten[]; schemas: readonly SchemaFile[]; readme?: string },
): Promise<WorkflowListing> =>
  workflowViewOf(
    await served.replace(
      DEFAULT,
      name,
      {
        metadata: { resourceVersion: save.version },
        spec: { steps: save.steps.map(writtenStepOf), ...(save.readme === undefined ? {} : { readme: save.readme }) },
        ...(save.schemas.length ? { schemas: save.schemas } : {}),
      },
      refused,
    ),
  );

/**
 * Make a folder of yours with its first step (`POST /api/namespaces/default/workflows`). Rejects with a `BuildRefusal`, as a save does: a
 * name taken, or a step the package refuses.
 */
export const createWorkflow = async (name: string, step: StepWritten): Promise<WorkflowListing> =>
  workflowViewOf(await served.create(DEFAULT, { metadata: { name }, spec: { steps: [writtenStepOf(step)] } }, refused));

/**
 * Remove a folder of yours whole, against the version it was read at (`DELETE /api/namespaces/default/workflows/<name>`): answers the
 * folder as it was. Rejects with a `WriteRefusal` in the api's words: a folder changed since it was read (409), or one a run, a queued card
 * or a factory still needs, each named with the command that frees it (409); and with an `UnreadAnswer` for an answer the board does not
 * read, saying the folder may be gone.
 */
export const removeWorkflow = async (name: string, version: string): Promise<WorkflowListing> =>
  workflowViewOf(await served.delete(DEFAULT, name, version));
