/**
 * The workflows as the board reads them — the Workflow objects of a namespace (`objects.ts`), each seen as a `WorkflowListing` — a step's
 * page, and a run started from one (apps/api/src/step/step.ts, apps/api/src/workflows/workflows.ts); and the builder's writes of a folder
 * of yours, through the Workflow object, which answer the folder as the list reads it.
 */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import {
  DEFINITION_ORIGINS,
  RepositoryAnswer,
  type DefinitionOrigin,
  type Workflow,
  type WorkflowStep,
  type WorkflowStepStatus,
} from 'objects';
import type { GraphEdge, RunGraph } from './graph.ts';
import type { StepLayers } from './layers.ts';
import { call, namespaceOf, read, runs, workflows as served, type Refuse } from './objects.ts';
import { sourceOf, type SchemaFile, StepKeySchema, WorkflowStepSpecSchema, type StepKey, type WorkflowStepSpec } from './library.ts';

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
type StepOwn = { keys: StepKey[]; body: string };

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

/** Whether `key` is a key a step may set. */
const isStepKey = (key: string): key is StepKey => (StepKeySchema.literals as readonly string[]).includes(key);

/** A list copied, as the board's plain types hold one: mutable. */
const copied = <T>(list: readonly T[]): T[] => [...list];

/** A step's keys as the object has them, decoded as the board's every key: a key the api left out refused, one it does not know dropped. */
const specOf = (keys: WorkflowStepStatus['spec']): WorkflowStepSpec => Schema.decodeUnknownSync(WorkflowStepSpecSchema)(keys);

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
const workflowViewOf = (workflow: Workflow): WorkflowListing => ({
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

/** The keys whose unset value is null, so a list of none (`tools: []`) is a line the file writes. */
const LISTS_OF_NONE: readonly string[] = ['tools', 'routes', 'when', 'ends'];

/** Whether a step's file writes `key`'s line: a value set, an empty list only where unset is null. */
const isSet = (key: string, value: unknown): boolean =>
  value !== null && value !== undefined && !(Array.isArray(value) && !value.length && !LISTS_OF_NONE.includes(key));

/**
 * A step as its file writes it, which a save sends (`spec.steps`): a step with an agent, its `agent`, the keys it sets itself (`own.keys`,
 * which leave `agent` out) and its own note; one with none, every key it sets and all of its body.
 */
export const writtenStepOf = (step: StepWritten): WorkflowStep => {
  const entries = Object.entries(step.spec) as Array<[StepKey, unknown]>;
  const kept =
    step.own === null
      ? entries.filter(([key, value]) => isSet(key, value))
      : entries.filter(([key, value]) => (key === 'agent' && isSet(key, value)) || step.own?.keys.includes(key));
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

/**
 * Whether a workflow read from `from` is the one an address naming `named` means: the same origin, or, where the address is a route's kept
 * on Hono, which names the factory's own tree `repo` (`sourceOf`), the same word there.
 */
export const fromMatches = (from: DefinitionOrigin, named: string): boolean => from === named || sourceOf(from) === named;

export type { WorkflowStepPage } from 'objects';

/** The place a workflow's or a step's page is read in, as its address carries it: a factory, and a repository where one is named. */
export type PagePlace = { factory?: string; repo?: string };

/**
 * A step of a workflow, for its page, read in `place`: the factory picked and its repository. Read again on each visit, as the Workflows
 * page is: a person edits the folder, and a factory's hires. `from` is the origin the page's address names, sent as the api's
 * `?origin=` where it is one (a factory's own tree is `factory`, which the api serves apart from the repository's), else as `sourceOf`
 * reads it.
 */
export const stepQuery = (from: string, workflow: string, step: string, place: PagePlace = {}) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step, place.factory ?? null, place.repo ?? null],
    queryFn: () =>
      served.step(namespaceOf(place.factory), workflow, step, {
        origin: DEFINITION_ORIGINS.find((origin) => origin === from) ?? sourceOf(from),
        ...(place.repo ? { repo: place.repo } : {}),
      }),
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
  queryFn: () => call((c) => c.server.repository({ query: {} }), read(RepositoryAnswer)),
});

/** What a start answers: the new run. An inbox card started stays in the inbox, listed as `started`. */
export type Started = { id: string };

/**
 * Start a run of a workflow, as the CLI's `start` does: the api writes the run's record and files nothing. Resolves with the new run's id;
 * rejects with the api's refusal in full — the loader's, the CLI `start`'s (`afterRefusal`'s, for a run it will not wait on), or the api's
 * own about the request; and an answer the board does not read, saying the run may have started. `after` names the runs it waits on, as
 * `--after` does; left out when there are none. `context` names the runs it reads as context, as `--from` does; left out when there are
 * none.
 *
 * An inbox card is started through the Card's own verb (`startCard`, inbox.ts), never here.
 *
 * `place` starts it in a factory, on one of its repositories, as the CLI's `start --factory` does: the Run's `create` in the factory's
 * namespace, the repository sent as `?repo=` (none for the default factory, which needs none), refused in the package's words for a
 * workflow the factory has not attached, a step its hires leave unfilled, or a repository outside it.
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
  runs.create(
    namespaceOf(place?.factory),
    { ...start, from: sourceOf(start.from) },
    'The run may have started: look on the Runs page before starting it again.',
    !place || place.factory === 'default' ? undefined : place.repo,
  );

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
