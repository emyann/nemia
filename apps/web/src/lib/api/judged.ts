/**
 * The board's one view of a run (`RunView`, `runViewOf`), made of its object alone, as every list and page reads it, and a run a list
 * could not judge (`UnjudgedRun`), which a reader of a list tells apart (`judged`); and the parts of a run's status the board names, as
 * `objects` says them (`RunStatus`, `RunStepStatus`), by the names the board's pages read them by. Pure.
 */
import type { Run, RunSpec, RunSpecStep, RunStatus as RunStatusAnswer, RunStatusWord, RunStepStatus } from 'objects';
import { factoryIn } from './namespace.ts';

export type { PlaceKind, RunHolding, RunWaiting, Spent } from 'objects';

/** A run's status word, as the package judges it. */
export type RunStatus = RunStatusWord;

/** What a run waits on a person to decide: a step's approval at its gate, or its result. */
export type RunToDecide = NonNullable<RunStatusAnswer['toDecide']>;

/** How long a run's sessions were at work, since when, and when the last ended. */
export type AtWork = NonNullable<RunStatusAnswer['atWork']>;

/** What a run's sessions read and wrote, in tokens, and the sentence that says it. */
export type RunTokens = NonNullable<RunStatusAnswer['tokens']>;

/** An edge of the run's graph as its pages draw it: what a step waits on, and a loop; never what it is handed (`input`). */
type RunViewEdge = Exclude<RunStatusAnswer['graph']['edges'][number], { kind: 'input' }>;

/** A step as the run froze it. Null where the run froze none of it. */
export type StepSpecView = Omit<RunSpecStep, 'name' | 'input'>;

/** What the engine filed a step's current try with. */
export type StepFiledView = NonNullable<RunStepStatus['filed']>;

/**
 * One step of a run as the board reads it: its status in the object but its word, and the step as the run froze it (`spec`). `current`
 * is optional for a step built with no try read, as the board's test fixtures build one.
 */
export type RunStep = Omit<RunStepStatus, 'status' | 'filed' | 'current'> & {
  readonly current?: RunStepStatus['current'];
  readonly spec: StepSpecView | null;
  readonly filed: StepFiledView | null;
};

/**
 * The one view of a run (`runViewOf`), every page's and every list's: its object's spec and status under the names the board reads,
 * its factory (its namespace, null for the default factory's), and the graph without what a step is handed, which the board draws no
 * edge of.
 */
export type RunView = Pick<
  RunSpec,
  'brief' | 'repo' | 'place' | 'work' | 'workflowDir' | 'try' | 'baseRef' | 'branch' | 'isolate' | 'after' | 'context'
> &
  Omit<RunStatusAnswer, 'graph' | 'steps' | 'timeline'> & {
    /** The run's whole label map, as its record's `metadata.labels` says it: its own, `workflow`, and `factory` when it names one. */
    readonly labels: Readonly<Record<string, string>>;
    readonly id: string;
    /** The factory the run was started in, its namespace; null for a run of the default factory (`default`). */
    readonly factory: string | null;
    readonly createdAt: string;
    /** The inbox card the run was started from: absent for a run started from none. */
    readonly from?: { readonly inbox: string };
    readonly graph: {
      readonly roots: readonly string[];
      readonly edges: readonly RunViewEdge[];
      /** Its conditions and workflow nodes beside its steps: absent on a workflow with neither. */
      readonly nodes?: RunStatusAnswer['graph']['nodes'];
    };
    readonly steps: readonly RunStep[];
    readonly timeline: Pick<RunStatusAnswer['timeline'], 'rounds' | 'run'>;
  };

/** The view's spec of a step, from the object's frozen step; null for a step the run froze none of. */
const specOf = (s: RunSpecStep | undefined): StepSpecView | null => {
  if (!s) return null;
  const { name: _name, input: _input, ...rest } = s;
  return rest;
};

/**
 * The view of a run (`RunView`): its object's spec and status under the names the board reads, its factory, the graph without what a
 * step is handed, and each step with the step the run froze of its name.
 */
export const runViewOf = (object: Run): RunView => {
  const { metadata, spec, status } = object;
  const { graph, steps, timeline, ...judged } = status;
  return {
    ...judged,
    id: metadata.name,
    factory: factoryIn(metadata.namespace),
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
    ...(spec.from ? { from: spec.from } : {}),
    graph: {
      roots: graph.roots,
      edges: graph.edges.filter((e): e is RunViewEdge => e.kind !== 'input'),
      ...(graph.nodes ? { nodes: graph.nodes } : {}),
    },
    steps: steps.map(({ status: _word, ...step }) => ({ ...step, spec: specOf(spec.steps.find((s) => s.name === step.name)) })),
    timeline: { rounds: timeline.rounds, run: timeline.run },
  };
};

/**
 * When the step's task still at work started: the earliest `spawnedAt` of a session or check of its tries that has not ended, as the
 * orchestrator's `atWork` of the step alone says it; null while none runs.
 */
export function sinceOf(step: Pick<RunStep, 'timeline'>): string | null {
  const open = step.timeline
    .flatMap((t) => [t.session, t.check])
    .flatMap((span) => (span && span.spawnedAt !== null && span.endedAt === null ? [span.spawnedAt] : []));
  return open.length === 0 ? null : open.reduce((a, b) => (Date.parse(b) < Date.parse(a) ? b : a));
}

/** The agent a step is given, as the run froze it; null for none. */
export const agentOf = (step: Pick<RunStep, 'spec'>): string | null => step.spec?.agent ?? null;

/**
 * A run a list could not judge (`RunUnjudged`), a task it reads having a journal that does not read: its name, its factory (its
 * namespace, null for the default factory's) and why, in the list's words (`unjudged`), and nothing judged of it.
 */
export type UnjudgedRun = { readonly id: string; readonly factory: string | null; readonly unjudged: string };

/** A run of a list: judged into its view (`RunView`), or one the list could not judge (`UnjudgedRun`). */
export type RunRow = RunView | UnjudgedRun;

/** Whether a run of a list was judged: an `UnjudgedRun` has nothing else to read. */
export const judged = <R extends object>(row: R | UnjudgedRun): row is R => !('unjudged' in row);
