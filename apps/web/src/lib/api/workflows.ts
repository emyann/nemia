/**
 * The workflows, a step's page, and a run started from one (apps/api/src/workflows/workflows.ts); and the builder's writes of a folder of
 * yours (apps/api/src/workflows/builder.ts), which answer the folder as the list reads it.
 */
import { queryOptions } from '@tanstack/react-query';
import { Option, Schema } from 'effect';
import { get, send, type SendHow } from './read.ts';
import { RunGraphSchema, type RunGraph } from './graph.ts';
import { StepLayersSchema, type StepLayers } from './layers.ts';
import {
  AgentSkillSchema,
  KeyRowSchema,
  StepKeySchema,
  WorkflowStepSpecSchema,
  type AgentSkill,
  type KeyRow,
  type SchemaFile,
  type StepKey,
  type WorkflowStepSpec,
} from './library.ts';

/**
 * Mirrors `ListedStep` in apps/api/src/workflows/workflows.ts: a step as a workflow's listing has it. `spec` and `body` are the step
 * resolved; `own` is what a step with an agent sets itself, null for a step with none; `hired` is the agent the factory the listing is in
 * hires into it, which `spec.agent` then names too — null for a step it hires no one into, and in the default factory. `layers` is what
 * a run of a step with an agent would be told, by layer — the agent's instructions, your custom instructions, the step's policy — null for
 * a step with none.
 */
export type ListedStep = {
  name: string;
  spec: WorkflowStepSpec;
  body: string;
  own: StepOwn | null;
  hired: string | null;
  layers: StepLayers | null;
};

/** A step as the builder puts it back: a listed step without `hired` and `layers`, which no step file writes. */
export type StepWritten = Omit<ListedStep, 'hired' | 'layers'>;

/**
 * Mirrors `StepOwn` in apps/api/src/workflows/workflows.ts: the keys a step with an agent sets itself — the rest are its agent's — and its
 * own note.
 */
export type StepOwn = { keys: StepKey[]; body: string };

/** Decodes a `StepOwn`: each key a step sets itself, one a step has. */
const StepOwnSchema = Schema.Struct({
  keys: Schema.mutable(Schema.Array(StepKeySchema)),
  body: Schema.String,
}) satisfies Schema.Schema<StepOwn>;

/** Decodes a `ListedStep`. */
const ListedStepSchema = Schema.Struct({
  name: Schema.String,
  spec: WorkflowStepSpecSchema,
  body: Schema.String,
  own: Schema.NullOr(StepOwnSchema),
  hired: Schema.NullOr(Schema.String),
  layers: Schema.NullOr(StepLayersSchema),
}) satisfies Schema.Schema<ListedStep>;

/**
 * Mirrors `WorkflowListing` in apps/api/src/workflows/workflows.ts: a folder of steps, where it is read from — the repository's
 * `workflows/`, or yours — its README's description, its steps, its graph and the schemas beside its steps; or, for a folder
 * that does not read as a workflow, the loader's refusal and no steps.
 */
export type WorkflowListing = {
  name: string;
  from: 'repo' | 'yours';
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
  /** What the folder's files held when it was listed: a save carries it, and the api refuses one of a folder changed since (409). */
  version: string;
  error: string | null;
  /**
   * Why a run of it cannot start in the factory it is listed in, in the package's words: the steps its hires leave with no agent, and the
   * hire that fills each. Null where every step has one, in the default factory, and for a folder that does not load.
   */
  unfilled: string | null;
};

/** Where a workflow is read from: the repository's `workflows/`, or yours. */
const WorkflowSourceSchema = Schema.Literals(['repo', 'yours']);

/** Decodes a `WorkflowListing`: each key the board reads, of its type and words; a key it does not know is dropped. */
const WorkflowListingSchema = Schema.Struct({
  name: Schema.String,
  from: WorkflowSourceSchema,
  dir: Schema.String,
  description: Schema.NullOr(Schema.String),
  readme: Schema.NullOr(Schema.String),
  steps: Schema.mutable(Schema.Array(ListedStepSchema)),
  graph: RunGraphSchema,
  schemas: Schema.mutable(Schema.Array(Schema.String)),
  folderTeam: Schema.Boolean,
  version: Schema.String,
  error: Schema.NullOr(Schema.String),
  unfilled: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<WorkflowListing>;

/** Every workflow there is. Not polled: it changes when a person edits a folder. Read again on each visit. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: () => get('/api/workflows', Schema.mutable(Schema.Array(WorkflowListingSchema))),
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
 * The workflows a factory offers on one of its repositories, read with its hires: each says what they leave `unfilled`, and each step the
 * agent `hired` into it. Keyed apart from `workflowsQuery`, which the builder drafts from: a builder never reads this one. Read by a
 * factory's start, and by the Workflows page, a workflow's page and a step's bar reached in a factory (`workflowsInQuery`).
 */
export const factoryWorkflowsQuery = (place: Place) =>
  queryOptions({
    queryKey: ['factory-workflows', place.factory, place.repo],
    queryFn: () => get(`/api/workflows${placeQuery(place)}`, Schema.mutable(Schema.Array(WorkflowListingSchema))),
  });

/**
 * The list of workflows read in `place`: `workflowsQuery` for none, `factoryWorkflowsQuery` in a factory on one of its repositories, each
 * under its own key, so a page and a factory's start share one read.
 */
export const workflowsInQuery = (place: Place | null) => (place === null ? workflowsQuery : factoryWorkflowsQuery(place));

/** Mirrors `RecentRun` in apps/api/src/step/step.ts: one of a step's newest runs, and whether the step was filed in it. */
export type RecentRun = { id: string; brief: string; createdAt: string; factory: string | null; filed: boolean };

/** Mirrors `SkillFrom` in apps/api/src/step/step.ts: a skill a step's layers give, and where its page is; null where none is. */
export type SkillFrom = { name: string; from: 'yours' | 'repo' | 'shipped' | null };

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
  from: WorkflowListing['from'];
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

/** Decodes a `WorkflowStepPage`. */
const WorkflowStepPageSchema = Schema.Struct({
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
    Schema.Array(Schema.Struct({ name: Schema.String, from: Schema.NullOr(Schema.Literals(['yours', 'repo', 'shipped'])) })),
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
}) satisfies Schema.Schema<WorkflowStepPage>;

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
 * page is: a person edits the folder, and a factory's hires.
 */
export const stepQuery = (from: string, workflow: string, step: string, place: PagePlace = {}) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step, place.factory ?? null, place.repo ?? null],
    queryFn: () =>
      get(
        `/api/workflows/${encodeURIComponent(from)}/${encodeURIComponent(workflow)}/${encodeURIComponent(step)}${pagePlaceQuery(place)}`,
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

/** What a start answers: the new run — and, for an inbox card, whether the card left the inbox, and why not when it did not. */
export type Started = { id: string; removed?: boolean; why?: string };

/** Decodes a `Started`: a `removed` or a `why` the api leaves out stays out. */
const StartedSchema = Schema.Struct({
  id: Schema.String,
  removed: Schema.optionalKey(Schema.Boolean),
  why: Schema.optionalKey(Schema.String),
}) satisfies Schema.Schema<Started>;

/**
 * Start a run of a workflow, as the CLI's `start` does: the api writes the run's record and files nothing. Resolves with the new run's id;
 * rejects with the api's refusal in full — the loader's, the CLI `start`'s (`afterRefusal`'s, for a run it will not wait on), or the api's
 * own about the request; and an answer the board does not read, saying the run may have started. `after` names the runs it waits on, as
 * `--after` does; left out when there are none. `context` names the runs it reads as context, as `--from` does; left out when there are
 * none.
 *
 * `card` starts an inbox card, as the CLI's `start <inbox>/<card>.md --brief <brief>` does: the record carries where it came from, and the
 * card leaves the inbox — `removed` says whether it did, and `why` why not. Refused in the package's words: a card not there, one started
 * already.
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
    card?: string;
  },
  place?: Place | null,
): Promise<Started> =>
  send('POST', `/api/runs${placeQuery(place)}`, StartedSchema, {
    body: start,
    may: 'The run may have started: look on the Runs page before starting it again.',
  });

/** A list of strings, as a decoded answer holds it: mutable, as the plain types say. */
const StringsSchema = Schema.mutable(Schema.Array(Schema.String));

/** Mirrors `WorkflowSaved` in apps/api/src/workflows/builder.ts: a folder written, read back from disk, and its files by name. */
export type WorkflowSaved = { workflow: WorkflowListing; written: string[]; kept: string[]; removed: string[] };

/** Decodes a `WorkflowSaved`. */
const WorkflowSavedSchema = Schema.Struct({
  workflow: WorkflowListingSchema,
  written: StringsSchema,
  kept: StringsSchema,
  removed: StringsSchema,
}) satisfies Schema.Schema<WorkflowSaved>;

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
const StepsNamed = Schema.Struct({ steps: StringsSchema });

/** How a builder's write is refused: a `BuildRefusal` in the api's words, with the steps it names and its status. */
const refused: SendHow['refused'] = (words, status, answer) =>
  new BuildRefusal(
    words,
    Option.match(Schema.decodeUnknownOption(StepsNamed)(answer), { onNone: () => [], onSome: (s) => s.steps }),
    status,
  );

/** A builder's write of a folder: resolved with the folder written, read back; rejected with a `BuildRefusal`, or an `UnreadAnswer`. */
const build = (method: 'PUT' | 'POST', route: string, body: unknown): Promise<WorkflowSaved> =>
  send(method, route, WorkflowSavedSchema, {
    body,
    may: 'The folder may be written: reload the Workflows page before writing it again.',
    refused,
  });

/**
 * Put a folder of yours back from its steps, the schemas pasted for them and its README when it changed, as the builder saves it: the
 * api judges them together, calls the package's `writeWorkflow`, and answers the folder read back from disk. `version` is the one the
 * folder was listed at. Rejects with a `BuildRefusal`: the package's sentence and the steps it names, a folder changed since it was read
 * (409), or the api's own about the request; and with an `UnreadAnswer` for an answer the board does not read, saying the folder may be
 * written.
 */
export const saveWorkflow = (
  name: string,
  save: { version: string; steps: readonly StepWritten[]; schemas: readonly SchemaFile[]; readme?: string },
): Promise<WorkflowSaved> =>
  build('PUT', `/api/workflows/yours/${encodeURIComponent(name)}`, {
    version: save.version,
    steps: save.steps,
    ...(save.schemas.length ? { schemas: save.schemas } : {}),
    ...(save.readme === undefined ? {} : { readme: save.readme }),
  });

/**
 * Make a folder of yours with its first step. Rejects with a `BuildRefusal`, as a save does: a name taken, or a step the package refuses.
 */
export const createWorkflow = (name: string, step: StepWritten): Promise<WorkflowSaved> =>
  build('POST', '/api/workflows/yours', { name, step });

/** Mirrors `WorkflowRemoved` in the package: the folder removed, and the files it held, by their path in it. */
export type WorkflowRemoved = { dir: string; removed: string[] };

/**
 * Remove a folder of yours whole, against the version it was listed at (apps/api/src/workflows/remove.ts). Rejects with a `WriteRefusal`
 * in the api's words: a folder changed since it was read (409), or one a run, a queued card or a factory still needs, each named with the
 * command that frees it (409); and with an `UnreadAnswer` for an answer the board does not read, saying the folder may be gone.
 */
export const removeWorkflow = (name: string, version: string): Promise<WorkflowRemoved> =>
  send(
    'DELETE',
    `/api/workflows/yours/${encodeURIComponent(name)}`,
    Schema.Struct({ dir: Schema.String, removed: Schema.mutable(Schema.Array(Schema.String)) }),
    { body: { version }, may: 'The folder may be removed: reload the Workflows page before removing it again.' },
  );
