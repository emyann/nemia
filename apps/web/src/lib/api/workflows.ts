/** The workflows, a step's page, and a run started from one (apps/api/src/workflows.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { AgentSkill } from './agents.ts';
import type { RunGraph } from './graph.ts';

/** Mirrors `WorkflowStepSpec` in apps/api/src/workflows.ts: every key a step of a workflow sets, before any run froze it. */
export type WorkflowStepSpec = {
  harness: string | null;
  model: string | null;
  effort: string | null;
  /** The session's context window, in tokens (`context:`, written `200k`): null for the model's whole window. */
  context: number | null;
  after: string[];
  resume: string | null;
  input: string[];
  /** The agent attached to the step (`agent:`), in agents/ beside the folder: the rest of the keys are resolved with it. Null for none. */
  agent: string | null;
  /** Claude Code's permission mode (`permissionMode:`): null on codex, whose fence is `sandbox`. */
  permissionMode: string | null;
  /** Codex's sandbox (`sandbox:`, or `permissionMode:` where a codex step's file names its sandbox under that key): null on Claude Code, and where a codex step names none. */
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
  loop: string | null;
  rounds: number | null;
};

/**
 * Mirrors `ListedStep` in apps/api/src/workflows.ts: a step as a workflow's listing has it — and as the builder puts it back. `spec` and `body`
 * are the step resolved; `own` is what a step with an agent sets itself, null for a step with none.
 */
export type ListedStep = { name: string; spec: WorkflowStepSpec; body: string; own: StepOwn | null };

/** Mirrors `StepOwn` in apps/api/src/workflows.ts: the keys a step with an agent sets itself — the rest are its agent's — and its own note. */
export type StepOwn = { keys: Array<keyof WorkflowStepSpec>; body: string };

/**
 * Mirrors `WorkflowListing` in apps/api/src/workflows.ts: a folder of steps, where it is read from — the repository's
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

/** Every workflow there is. Not polled: it changes when a person edits a folder. Read again on each visit. */
export const workflowsQuery = queryOptions({
  queryKey: ['workflows'],
  queryFn: () => get<WorkflowListing[]>('/api/workflows'),
});

/**
 * Mirrors `KeyRow` in apps/api/src/workflows.ts: one key of a card or a step, as its page lays them out — the key, its value as the package
 * read it, null where the file does not set it, and the package's one line of what it means.
 */
export type KeyRow = { key: string; value: string | null; meaning: string };

/**
 * Mirrors `WorkflowStepPage` in apps/api/src/workflows.ts: one step of a workflow — its body, its file as written, and every key a step may set,
 * in the package's order, with its value as the loader read it.
 */
export type WorkflowStepPage = {
  workflow: string;
  from: WorkflowListing['from'];
  dir: string;
  step: string;
  body: string;
  source: string;
  keys: KeyRow[];
  /** What the agent this step names says it can do, read beside the workflow — null for a step with no agent, or one whose skills do not read. */
  agentSkills: AgentSkill[] | null;
};

/** A step of a workflow, for its page. Read again on each visit, as the Workflows page is: a person edits the folder. */
export const stepQuery = (from: string, workflow: string, step: string) =>
  queryOptions({
    queryKey: ['workflows', from, workflow, step],
    queryFn: () =>
      get<WorkflowStepPage>(`/api/workflows/${encodeURIComponent(from)}/${encodeURIComponent(workflow)}/${encodeURIComponent(step)}`),
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
  queryFn: () => get<{ repo: string }>('/api/repository'),
});

/** What a start answers: the new run — and, for an inbox card, whether the card left the inbox, and why not when it did not. */
export type Started = { id: string; removed?: boolean; why?: string };

/**
 * Start a run of a workflow, as `wf start` does: the api writes the run's record and files nothing. Resolves with the new
 * run's id; rejects with the api's refusal in full — the loader's, `wf start`'s (`afterRefusal`'s, for a run it will not wait
 * on), or the api's own about the request; and an answer that succeeded without an id, saying the run may have started. `after` names the runs it waits on, as `--after` does; left out when there are none.
 *
 * `card` starts an inbox card, as `wf start <inbox>/<card>.md --brief <brief>` does: the record carries where it came from, and the card
 * leaves the inbox — `removed` says whether it did, and `why` why not. Refused in the package's words: a card not there, one started already.
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
