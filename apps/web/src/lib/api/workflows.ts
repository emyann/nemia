/** The workflows, a step's page, and a run started from one (apps/api/src/workflows/workflows.ts). */
import { queryOptions } from '@tanstack/react-query';
import { Schema } from 'effect';
import { get } from './read.ts';
import { RunGraphSchema, type RunGraph } from './graph.ts';
import {
  AgentSkillSchema,
  KeyRowSchema,
  StepKeySchema,
  WorkflowStepSpecSchema,
  type AgentSkill,
  type KeyRow,
  type StepKey,
  type WorkflowStepSpec,
} from './library.ts';

/**
 * Mirrors `ListedStep` in apps/api/src/workflows/workflows.ts: a step as a workflow's listing has it — and as the builder puts it back.
 * `spec` and `body` are the step resolved; `own` is what a step with an agent sets itself, null for a step with none.
 */
export type ListedStep = { name: string; spec: WorkflowStepSpec; body: string; own: StepOwn | null };

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
  steps: ListedStep[];
  graph: RunGraph;
  /** The `.json` files beside the steps, which an `output:` may name. */
  schemas: string[];
  /**
   * Whether every step says `workspace: folder`: a team that works in folders the run makes and never looks at a repository. A card
   * for one is filed with no `repo:` (the api refuses one), and a run of one has no branch to read.
   */
  folderTeam: boolean;
  /** What the folder's files held when it was listed: a save carries it, and the api refuses one of a folder changed since (409). */
  version: string;
  error: string | null;
};

/** Where a workflow is read from: the repository's `workflows/`, or yours. */
const WorkflowSourceSchema = Schema.Literals(['repo', 'yours']);

/** Decodes a `WorkflowListing`: each key the board reads, of its type and words; a key it does not know is dropped. */
const WorkflowListingSchema = Schema.Struct({
  name: Schema.String,
  from: WorkflowSourceSchema,
  dir: Schema.String,
  description: Schema.NullOr(Schema.String),
  steps: Schema.mutable(Schema.Array(ListedStepSchema)),
  graph: RunGraphSchema,
  schemas: Schema.mutable(Schema.Array(Schema.String)),
  folderTeam: Schema.Boolean,
  version: Schema.String,
  error: Schema.NullOr(Schema.String),
}) satisfies Schema.Schema<WorkflowListing>;

/** Every workflow there is. Not polled: it changes when a person edits a folder. Read again on each visit. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: () => get('/api/workflows', Schema.mutable(Schema.Array(WorkflowListingSchema))),
});

/**
 * Mirrors `WorkflowStepPage` in apps/api/src/workflows/workflows.ts: one step of a workflow — its body, its file as written, and every key
 * a step may set, in the package's order, with its value as the loader read it.
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
}) satisfies Schema.Schema<WorkflowStepPage>;

/** A step of a workflow, for its page. Read again on each visit, as the Workflows page is: a person edits the folder. */
export const stepQuery = (from: string, workflow: string, step: string) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step],
    queryFn: () =>
      get(`/api/workflows/${encodeURIComponent(from)}/${encodeURIComponent(workflow)}/${encodeURIComponent(step)}`, WorkflowStepPageSchema),
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

/**
 * Start a run of a workflow, as `wf start` does: the api writes the run's record and files nothing. Resolves with the new
 * run's id; rejects with the api's refusal in full — the loader's, `wf start`'s (`afterRefusal`'s, for a run it will not wait
 * on), or the api's own about the request; and an answer that succeeded without an id, saying the run may have started. `after` names the
 * runs it waits on, as `--after` does; left out when there are none.
 *
 * `card` starts an inbox card, as `wf start <inbox>/<card>.md --brief <brief>` does: the record carries where it came from, and the card
 * leaves the inbox — `removed` says whether it did, and `why` why not. Refused in the package's words: a card not there, one started
 * already.
 *
 * Sent as `application/json`, which the api requires of a start: the one body a page on another site cannot send it unasked.
 */
export async function startRun(start: {
  workflow: string;
  from: WorkflowListing['from'];
  brief: string;
  after?: readonly string[];
  card?: string;
}): Promise<Started> {
  const res = await fetch('/api/runs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(start) });
  const body = (await res.json().catch(() => undefined)) as { id?: unknown; removed?: unknown; why?: unknown; error?: unknown } | undefined;
  if (res.ok && typeof body?.id === 'string') {
    return {
      id: body.id,
      ...(typeof body.removed === 'boolean' ? { removed: body.removed } : {}),
      ...(typeof body.why === 'string' ? { why: body.why } : {}),
    };
  }
  if (res.ok) {
    throw new Error(
      `POST /api/runs answered ${res.status} ${res.statusText} without the new run's id, so the api and this board disagree about what a start answers. ` +
        'The run may have started: look on the Runs page before starting it again, and restart the api (`npm run dev`).',
    );
  }
  throw new Error(typeof body?.error === 'string' ? body.error : `POST /api/runs answered ${res.status} ${res.statusText}`);
}
