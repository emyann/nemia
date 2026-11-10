/**
 * A run's detail (`RunDetail`), as its page, its bar and its previews draw it: the board's one view of the run (`RunView`, api/judged.ts)
 * with what its page reads beside the object — every step's tries and what it was told (`stepTriesQuery`, `stepToldQuery`), and the
 * run's lines (`runLinesQuery`). Not a mirror of the api: every type here is made from the objects' own types (`objects`) and the lines'
 * (`RunLines`), under the names the board's components read.
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
import type { Run, RunStepStatus, StepTold, StepTry } from 'objects';
import { runViewOf, type RunStep, type RunView } from './api/judged.ts';
import type { StepCloseout, StepTry as StepTryRead, StepUnreadable } from './api/tries.ts';
import type { WorkflowPageAddress } from './api/address.ts';
import { readGone, runLinesQuery, runObjectQuery, stepToldQuery, stepTriesQuery, type RunLines, type StepCommands } from './api/run.ts';
import { stepStamp } from './lifecyclePath.ts';
import type { Frozen } from './frozen.ts';

/**
 * One step of a run's detail: the step (`RunStep`), its lines, what it was told, and its tries whole, with its current try's closeout, or
 * why it could not be read. Its closeout and its tries are typed as the tries' reads have them (`api/tries.ts`), read only.
 */
export type StepView = RunStep & {
  readonly commands: StepCommands;
  readonly body: string | null;
  readonly told: string | null;
  readonly layers: StepTold['layers'];
  readonly taskParts: StepTold['taskParts'];
  readonly closeout: Frozen<StepCloseout> | null;
  readonly unreadable: Frozen<StepUnreadable> | null;
  readonly tries: readonly Frozen<StepTryRead>[];
};

/**
 * A run's detail, as its page, its bar and its previews draw it (`runDetailOf`): the run's view (`RunView`) with its lines, and each step
 * with what was read of it (`StepView`).
 */
export type RunDetail = Omit<RunView, 'steps'> & {
  /** The line that prints what there is to decide on the run. */
  readonly decide: string;
  /** The line that takes the new revisions. */
  readonly refresh: string;
  readonly workflowPage: WorkflowPageAddress | null;
  /** The words that say which inbox card the run was started from: absent for a run started from none. */
  readonly fromNote?: string;
  readonly steps: readonly StepView[];
};

/** No lines for a step the lines name none of: a step not frozen, which the api builds none for. */
const NO_LINES: StepCommands = { approve: '', retry: '', say: '' };

/** One step of the detail, from the step, the lines, its tries whole and what it was told. */
const stepViewOf = (step: RunStep, lines: RunLines, tries: readonly StepTry[], told: StepTold | null): StepView => {
  const current = tries.find((t) => t.current);
  return {
    ...step,
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
 * The detail of a run (`RunDetail`): its view (`runViewOf`), its lines, and each step with its tries and what it was told — none and
 * nothing for a step whose sub-resources were not read.
 */
export const runDetailOf = (
  object: Run,
  lines: RunLines,
  tries: Readonly<Record<string, readonly StepTry[] | undefined>>,
  told: Readonly<Record<string, StepTold | null | undefined>>,
): RunDetail => {
  const view = runViewOf(object);
  return {
    ...view,
    ...(view.from ? { fromNote: lines.fromNote ?? '' } : {}),
    decide: lines.decide,
    refresh: lines.refresh,
    workflowPage: lines.workflowPage,
    steps: view.steps.map((step) => stepViewOf(step, lines, tries[step.name] ?? [], told[step.name] ?? null)),
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

/** The detail of `object` with its lines and its steps' reads, each step's by its name. */
const detailOf = (
  object: Run,
  lines: RunLines,
  tries: ReadonlyArray<readonly StepTry[] | undefined>,
  told: ReadonlyArray<StepTold | null | undefined>,
): RunDetail => {
  const steps = object.status.steps;
  return runDetailOf(
    object,
    lines,
    Object.fromEntries(steps.map((step, i) => [step.name, tries[i]])),
    Object.fromEntries(steps.map((step, i) => [step.name, told[i]])),
  );
};

/**
 * The detail of the run `id`, and the error of its object's last read — a run gone (`readGone`) is said by the page, which keeps what it
 * last read. Its object and lines are suspense reads, which the route's loader has read (`loadRun`); each step's tries and told are read
 * under its stamp (`useStepReads`).
 */
export function useRunView(id: string): { view: RunDetail; error: unknown } {
  const { data: object, error } = useSuspenseQuery(runObjectQuery(id));
  const { data: lines } = useSuspenseQuery(runLinesQuery(id));
  const { tries, told } = useStepReads(id, object.status.steps);
  const view = useMemo(() => detailOf(object, lines, tries, told), [object, lines, tries, told]);
  return { view, error };
}

/**
 * The detail of the run `id` where no loader has read it — a bar, a preview, a try — and the error of its object's or its lines' last
 * read. Undefined until the object, the lines and every step's tries and told are read, so it is drawn whole or not at all; once drawn it
 * stays, through a failed read (a run gone keeps what it last read) and while a step that moved is read again.
 */
export function useRunRead(id: string): { view: RunDetail | undefined; error: unknown } {
  const object = useQuery(runObjectQuery(id));
  const lines = useQuery(runLinesQuery(id));
  const { tries, told, error: stepError } = useStepReads(id, object.data?.status.steps ?? NO_STEPS);
  const run = object.data;
  const said = lines.data;
  const view = useMemo(
    () =>
      run && said && tries.every((t) => t !== undefined) && told.every((t) => t !== undefined)
        ? detailOf(run, said, tries, told)
        : undefined,
    [run, said, tries, told],
  );
  return { view, error: object.error ?? lines.error ?? stepError };
}

/**
 * What a run's page loads before it draws: the run object into `client`'s cache (`runObjectQuery`), then its lines and every step's tries
 * and told at once, so the page draws whole on its first paint; and `gone` when the store has no such run (`readGone`), so the page says so
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
      if (readGone(error)) return { gone: true };
      throw error;
    },
  );
