/**
 * The board's view of one run, as its pages draw it: composed from the run object (`runObjectQuery`), every step's tries and what it was
 * told (`stepTriesQuery`, `stepToldQuery`), and the run's lines (`runLinesQuery`). Not a mirror of the api: every type here is made from
 * the objects' own types (`objects`) and the lines' (`RunLines`), under the names the run's components read.
 */
import { useMemo } from 'react';
import {
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Run, RunSpec, RunSpecStep, RunStatus, RunStepStatus, StepTold, StepTry } from 'objects';
import type { StepCloseout, StepTry as StepTryRead, StepUnreadable } from './api/tries.ts';
import type { WorkflowPageAddress } from './api/address.ts';
import { runGone, runLinesQuery, runObjectQuery, stepToldQuery, stepTriesQuery, type RunLines, type StepCommands } from './api/run.ts';
import { stepStamp } from './lifecyclePath.ts';
import type { Frozen } from './frozen.ts';

/** An edge of the run's graph as its pages draw it: what a step waits on, and a loop; never what it is handed (`input`). */
export type RunViewEdge = Exclude<RunStatus['graph']['edges'][number], { kind: 'input' }>;

/** A step as the run froze it. Null where the run froze none of it. */
export type StepSpecView = Omit<RunSpecStep, 'name' | 'input'>;

/** What the engine filed a step's current try with. */
export type StepFiledView = NonNullable<RunStepStatus['filed']>;

/**
 * One step of the view: its status in the object, its frozen spec, its lines, what it was told, and its tries whole, with its current
 * try's closeout, or why it could not be read.
 *
 * Its closeout, its tries and its current try's short (`current`, absent from the page) are typed as the decision's mirror has them
 * (`api/tries.ts`), read only, which the objects' ones are too. `current` is optional for a view built with no try read, as the
 * board's test fixtures build one.
 */
export type StepView = Omit<RunStepStatus, 'status' | 'filed' | 'current'> & {
  readonly current?: RunStepStatus['current'];
  readonly spec: StepSpecView | null;
  readonly filed: StepFiledView | null;
  readonly commands: StepCommands;
  readonly body: string | null;
  readonly told: string | null;
  readonly layers: StepTold['layers'];
  readonly taskParts: StepTold['taskParts'];
  readonly closeout: Frozen<StepCloseout> | null;
  readonly unreadable: Frozen<StepUnreadable> | null;
  readonly tries: readonly Frozen<StepTryRead>[];
};

/** One run as its pages draw it: its object's spec and status, its lines, and its steps (`StepView`). */
export type RunView = Pick<
  RunSpec,
  'brief' | 'repo' | 'place' | 'work' | 'workflowDir' | 'try' | 'baseRef' | 'branch' | 'isolate' | 'after' | 'context'
> &
  Omit<RunStatus, 'graph' | 'steps' | 'timeline'> & {
    /** The run's whole label map, as its record's `metadata.labels` says it: its own, `workflow`, and `factory` when it names one. */
    labels: Readonly<Record<string, string>>;
    readonly id: string;
    readonly createdAt: string;
    /** The line that prints what there is to decide on the run. */
    readonly decide: string;
    /** The line that takes the new revisions. */
    readonly refresh: string;
    readonly workflowPage: WorkflowPageAddress | null;
    /** The inbox card the run was started from, and the words that say so: both absent for a run started from none. */
    readonly from?: { readonly inbox: string };
    readonly fromNote?: string;
    readonly graph: {
      readonly roots: readonly string[];
      readonly edges: readonly RunViewEdge[];
      /** Its conditions and workflow nodes beside its steps: absent on a workflow with neither. */
      readonly nodes?: RunStatus['graph']['nodes'];
    };
    readonly steps: readonly StepView[];
    readonly timeline: Pick<RunStatus['timeline'], 'rounds' | 'run'>;
  };

/** The view's spec of a step, from the object's frozen step; null for a step the run froze none of. */
const specOf = (s: RunSpecStep | undefined): StepSpecView | null => {
  if (!s) return null;
  const { name: _name, input: _input, ...rest } = s;
  return rest;
};

/** No lines for a step the lines name none of: a step not frozen, which the api builds none for. */
const NO_LINES: StepCommands = { approve: '', retry: '', say: '' };

/** One step of the view, from its status in the object, the frozen steps, its tries whole and what it was told. */
const stepViewOf = (
  step: RunStepStatus,
  frozen: readonly RunSpecStep[],
  lines: RunLines,
  tries: readonly StepTry[],
  told: StepTold | null,
): StepView => {
  const { status: _word, filed, ...rest } = step;
  const current = tries.find((t) => t.current);
  return {
    ...rest,
    spec: specOf(frozen.find((s) => s.name === step.name)),
    filed,
    commands: lines.steps[step.name] ?? NO_LINES,
    body: told?.body ?? null,
    told: told?.told ?? null,
    layers: told?.layers ?? null,
    taskParts: told?.taskParts ?? null,
    closeout: current?.closeout ?? null,
    unreadable: current?.unreadable ?? null,
    tries,
  };
};

/**
 * The view of a run (`RunView`): the object's spec and status under the names its pages read, its lines, the graph without what a step is
 * handed, and each step with its tries and what it was told — none and nothing for a step whose sub-resources were not read.
 */
export const runViewOf = (
  object: Run,
  lines: RunLines,
  tries: Readonly<Record<string, readonly StepTry[] | undefined>>,
  told: Readonly<Record<string, StepTold | null | undefined>>,
): RunView => {
  const { metadata, spec, status } = object;
  const { graph, steps, timeline, ...judged } = status;
  return {
    ...judged,
    id: metadata.name,
    createdAt: metadata.creationTimestamp,
    labels: metadata.labels,
    brief: spec.brief,
    repo: spec.repo,
    place: spec.place,
    work: spec.work,
    workflowDir: spec.workflowDir,
    try: spec.try,
    baseRef: spec.baseRef,
    branch: spec.branch,
    isolate: spec.isolate,
    after: spec.after,
    context: spec.context,
    ...(spec.from ? { from: spec.from, fromNote: lines.fromNote ?? '' } : {}),
    decide: lines.decide,
    refresh: lines.refresh,
    workflowPage: lines.workflowPage,
    graph: {
      roots: graph.roots,
      edges: graph.edges.filter((e): e is RunViewEdge => e.kind !== 'input'),
      ...(graph.nodes ? { nodes: graph.nodes } : {}),
    },
    steps: steps.map((step) => stepViewOf(step, spec.steps, lines, tries[step.name] ?? [], told[step.name] ?? null)),
    timeline: { rounds: timeline.rounds, run: timeline.run },
  };
};

/**
 * What was last read under `key`, at whichever stamp: what a step's tries or told show while those of its new state are read, so a step
 * that moved keeps what it showed rather than draw nothing for a moment.
 */
const lastRead = <T>(client: QueryClient, key: QueryKey): T | undefined =>
  client
    .getQueryCache()
    .findAll({ queryKey: key })
    .filter((q) => q.state.data !== undefined)
    .sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt)[0]?.state.data as T | undefined;

/** The data of each of a list of reads, in order: a `combine` declared once, so the list keeps its identity while no read changes. */
const dataOf = <T>(results: UseQueryResult<T>[]): Array<T | undefined> => results.map((r) => r.data);

/** What the reads of every step answered, and the first failure among those that answered nothing, so a reader says it. */
const readsOf = <T>(results: UseQueryResult<T>[]): { data: Array<T | undefined>; error: unknown } => ({
  data: dataOf(results),
  error: results.find((r) => r.data === undefined && r.error)?.error ?? null,
});

/** No steps, for a run whose object is not read yet: one array for the module's life. */
const NO_STEPS: readonly RunStepStatus[] = [];

/**
 * Each step's tries and told, read under its stamp (`stepStamp`), so they are read again only when the step moves; while they are, what
 * was read before stays (`lastRead`). Undefined for a read not answered yet.
 */
function useStepReads(
  id: string,
  steps: readonly RunStepStatus[],
): { tries: Array<readonly StepTry[] | undefined>; told: Array<StepTold | null | undefined>; error: unknown } {
  const client = useQueryClient();
  const tries = useQueries({
    queries: steps.map((step) => ({
      ...stepTriesQuery(id, step.name, stepStamp(step)),
      placeholderData: () => lastRead<readonly StepTry[]>(client, ['runs', id, 'steps', step.name, 'tries']),
    })),
    combine: readsOf<readonly StepTry[]>,
  });
  const told = useQueries({
    queries: steps.map((step) => ({
      ...stepToldQuery(id, step.name, stepStamp(step)),
      placeholderData: () => lastRead<StepTold | null>(client, ['runs', id, 'steps', step.name, 'told']),
    })),
    combine: readsOf<StepTold | null>,
  });
  return { tries: tries.data, told: told.data, error: tries.error ?? told.error };
}

/** The view of `object` with its lines and its steps' reads, each step's by its name. */
const viewOf = (
  object: Run,
  lines: RunLines,
  tries: ReadonlyArray<readonly StepTry[] | undefined>,
  told: ReadonlyArray<StepTold | null | undefined>,
): RunView => {
  const steps = object.status.steps;
  return runViewOf(
    object,
    lines,
    Object.fromEntries(steps.map((step, i) => [step.name, tries[i]])),
    Object.fromEntries(steps.map((step, i) => [step.name, told[i]])),
  );
};

/**
 * The view of the run `id`, and the error of its object's last read — a run gone (`runGone`) is said by the page, which keeps what it
 * last read. Its object and lines are suspense reads, which the route's loader has read (`loadRun`); each step's tries and told are read
 * under its stamp (`useStepReads`).
 */
export function useRunView(id: string): { view: RunView; error: unknown } {
  const { data: object, error } = useSuspenseQuery(runObjectQuery(id));
  const { data: lines } = useSuspenseQuery(runLinesQuery(id));
  const { tries, told } = useStepReads(id, object.status.steps);
  const view = useMemo(() => viewOf(object, lines, tries, told), [object, lines, tries, told]);
  return { view, error };
}

/**
 * The view of the run `id` where no loader has read it — a bar, a preview, a try — and the error of its object's or its lines' last
 * read. Undefined until the object, the lines and every step's tries and told are read, so it is drawn whole or not at all; once drawn it
 * stays, through a failed read (a run gone keeps what it last read) and while a step that moved is read again.
 */
export function useRunRead(id: string): { view: RunView | undefined; error: unknown } {
  const object = useQuery(runObjectQuery(id));
  const lines = useQuery(runLinesQuery(id));
  const { tries, told, error: stepError } = useStepReads(id, object.data?.status.steps ?? NO_STEPS);
  const run = object.data;
  const said = lines.data;
  const view = useMemo(
    () =>
      run && said && tries.every((t) => t !== undefined) && told.every((t) => t !== undefined) ? viewOf(run, said, tries, told) : undefined,
    [run, said, tries, told],
  );
  return { view, error: object.error ?? lines.error ?? stepError };
}

/**
 * What a run's page loads before it draws: the run object into `client`'s cache (`runObjectQuery`), then its lines and every step's tries
 * and told at once, so the page draws whole on its first paint; and `gone` when the store has no such run (`runGone`), so the page says so
 * in place of a failure. Any other failure is thrown, for the route's error to say.
 */
export const loadRun = (client: QueryClient, id: string): Promise<{ gone: boolean }> =>
  client.ensureQueryData(runObjectQuery(id)).then(
    (run) =>
      Promise.all([
        client.ensureQueryData(runLinesQuery(id)),
        ...run.status.steps.flatMap((step) => {
          const stamp = stepStamp(step);
          return [
            client.ensureQueryData(stepTriesQuery(id, step.name, stamp)),
            client.ensureQueryData(stepToldQuery(id, step.name, stamp)),
          ];
        }),
      ]).then(() => ({ gone: false })),
    (error: unknown) => {
      if (runGone(error)) return { gone: true };
      throw error;
    },
  );
