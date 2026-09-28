/** The builder's form and its writes of a folder of yours (apps/api/src/workflows/builder.ts). */
import { queryOptions } from '@tanstack/react-query';
import { get } from './read.ts';
import type { ListedStep, WorkflowListing, WorkflowStepSpec } from './workflows.ts';

/** Mirrors `KeyKind` in apps/api/src/workflows/builder.ts: how a key is set on a step's form. */
export type KeyKind = 'steps' | 'step' | 'choice' | 'harness-word' | 'text' | 'list' | 'count' | 'dollars' | 'tokens' | 'flag' | 'schema';

/**
 * Mirrors `KeyField` in apps/api/src/workflows/builder.ts: one key of a step's form, its line of meaning, how it is set, and the words it
 * may take.
 */
export type KeyField = {
  key: keyof WorkflowStepSpec;
  meaning: string;
  kind: KeyKind;
  choices: string[] | null;
  byHarness: Record<string, string[]> | null;
};

/**
 * Mirrors `KeyForm` in apps/api/src/workflows/builder.ts: every key a step may set, in the package's order, the harness a step runs on when
 * it names none, the keys a step with an agent takes from it (`roleKeys`), what each agent of yours gives a step (`agents`), and how a step
 * names a remote A2A agent — `harness: <prefix><name>` — with the keys such a step may not set (`remote`), which the form leaves off it
 * (`takes`).
 */
export type KeyForm = {
  keys: KeyField[];
  defaultHarness: string;
  roleKeys: Array<keyof WorkflowStepSpec>;
  agents: Record<string, Partial<WorkflowStepSpec>>;
  remote: { prefix: string; refuses: Array<keyof WorkflowStepSpec> };
};

/** What a step's form is drawn from. It changes with the package, so once a visit. */
export const keyFormQuery = queryOptions({
  queryKey: ['step-keys'],
  queryFn: () => get<KeyForm>('/api/workflows/keys'),
  staleTime: Infinity,
});

/** Mirrors `WorkflowSaved` in apps/api/src/workflows/builder.ts: a folder written, read back from disk, and its files by name. */
export type WorkflowSaved = { workflow: WorkflowListing; written: string[]; kept: string[]; removed: string[] };

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

/** A builder's write, sent as `application/json`, which the api requires of every write: resolved with what it answered, or its refusal. */
async function build<T>(
  method: 'PUT' | 'POST',
  route: string,
  body: unknown,
  ok: (answer: Record<string, unknown>) => boolean,
): Promise<T> {
  const res = await fetch(route, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const answer = (await res.json().catch(() => undefined)) as Record<string, unknown> | undefined;
  if (res.ok && answer && ok(answer)) return answer as T;
  if (res.ok) {
    throw new BuildRefusal(
      `${method} ${route} answered ${res.status} ${res.statusText} without what it wrote, so the api and this board disagree about what a write answers. ` +
        'The folder may be written: reload the Workflows page before writing it again, and restart the api (`npm run dev`).',
      [],
    );
  }
  const steps = Array.isArray(answer?.steps) ? answer.steps.filter((s): s is string => typeof s === 'string') : [];
  throw new BuildRefusal(
    typeof answer?.error === 'string' ? answer.error : `${method} ${route} answered ${res.status} ${res.statusText}`,
    steps,
    res.status,
  );
}

const isSaved = (answer: Record<string, unknown>): boolean =>
  typeof answer.workflow === 'object' && answer.workflow !== null && Array.isArray(answer.written);

/** A schema pasted for a step's `output:`, written beside the steps by the save that carries it. */
export type SchemaFile = { file: string; text: string };

/**
 * Put a folder of yours back from its steps and the schemas pasted for them, as the builder saves it: the api judges the two together, calls the
 * package's `writeWorkflow`, and answers the folder read back from disk. `version` is the one the folder was listed at. Rejects with a
 * `BuildRefusal`: the package's sentence and the steps it names, a folder changed since it was read (409), or the api's own about the request.
 */
export const saveWorkflow = (
  name: string,
  save: { version: string; steps: readonly ListedStep[]; schemas: readonly SchemaFile[] },
): Promise<WorkflowSaved> =>
  build(
    'PUT',
    `/api/workflows/yours/${encodeURIComponent(name)}`,
    { version: save.version, steps: save.steps, ...(save.schemas.length ? { schemas: save.schemas } : {}) },
    isSaved,
  );

/** Make a folder of yours with its first step. Rejects with a `BuildRefusal`, as a save does: a name taken, or a step the package refuses. */
export const createWorkflow = (name: string, step: ListedStep): Promise<WorkflowSaved> =>
  build('POST', '/api/workflows/yours', { name, step }, isSaved);
