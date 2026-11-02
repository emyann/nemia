/**
 * The run as one object (`RunObject.Run`, run.model.ts), and its sub-resources: a step's tries, one try, its closeout and what it was told.
 * Each is built off one read of the run (`runReading`), and its status's run-level fields from the function the runs list calls
 * (`judgedFields`), so the object and the list say a run alike. The board reads the object, and a step's tries and told layers at their
 * sub-resources, each its own read.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { PlaceService } from '../place/place.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { artifactsDir } from '../record/record.store.ts';
import {
  addSpend,
  budgetOf,
  gatesOf,
  isRepositoryRun,
  overBudget,
  placeOf,
  type Run,
  type Spend,
  type SpendOf,
  stepSpend,
} from '../run.ts';
import { loopSpan, type Workflow } from '../workflow.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import type { Retry } from '../retry/index.ts';
import { stepRaise } from '../retry/index.ts';
import { budgetWord, stepStatus } from '../status/status.ts';
import { runInputGraph } from '../summary/graph.ts';
import { bare, type Filings, tryOf } from '../summary/reads.verb.ts';
import { atHarness, needsOf, spentOf, stepSaid } from '../summary/judged.verb.ts';
import { judgedFields } from '../summary/summary.verb.ts';
import { runLabels } from '../telemetry/telemetry.ts';
import { runStartedAt, type Timeline, type TimelineTotal } from '../timeline/index.ts';
import { consumption } from '../views/views.verb.ts';
import type { Drift } from '../revisions/revisions.ts';
import { driftNow } from '../revisions/pin.verb.ts';
import { acceptedOf, driftOf, gateOf, type StepTry } from '../resource/tries.verb.ts';
import { filedOf, type StepFiled, toldOf } from '../resource/told.verb.ts';
import { folderFiles, workFolderOf } from '../resource/files.store.ts';
import { type LastSaid, lastLineOf } from '../resource/checks.verb.ts';
import { readOf, totalOf, usedOf } from '../resource/usage.ts';
import type { Run as RunObject, RunSpec, RunStatus, RunStepStatus, StepTold, TryCloseout, TryShort } from './run.model.ts';
import { currentOf, raiseReads, runReading, type RunReading, stepsReading, triesIn } from './read.verb.ts';

/**
 * What `runObject` is handed beside its services: what a caller's reads keep between requests (`filings`, the feed's
 * filing times; `said`, where each blocked session's conversation was last read), and `inRequest`, which runs the drift's program
 * (`driftNow`) over a request's own services, so it reads the doors the api was given; without it the drift runs over the program's own.
 */
export type RunReads = {
  readonly memo: { readonly filings: Filings; readonly said: LastSaid };
  readonly inRequest?: (program: ReturnType<typeof driftNow>) => Promise<readonly Drift[]>;
};

/** The object of a run, or why it is not judged, in the words the list says it with. */
export type RunObjectAnswer = RunObject | { unjudged: string };

/** The short of a try (`TryShort`): its number, round and codes, how it signed off and its check's verdict. */
export const tryShort = (t: StepTry): TryShort => ({
  try: t.try,
  round: t.round,
  phase: t.phase,
  reason: t.reason,
  outcome: t.closeout?.outcome ?? null,
  verdict: t.check?.verdict ?? null,
});

/** A step's frontmatter as the object's spec holds it, each null where the step does not set it. */
const specStepOf = (s: Workflow): RunSpec['steps'][number] => ({
  name: s.name,
  after: [...s.after],
  input: [...(s.input ?? [])],
  loop: s.loop ?? null,
  rounds: s.rounds ?? null,
  harness: s.harness ?? null,
  model: s.model ?? null,
  effort: s.effort ?? null,
  context: s.context ?? null,
  workspace: s.workspace ?? null,
  place: s.place ?? null,
  resume: s.resume ?? null,
  fence: s.permissionMode ?? null,
  sandbox: s.sandbox ?? null,
  tools: s.tools ?? null,
  deadlineSeconds: s.deadlineSeconds ?? null,
});

/**
 * The frozen record as the object's `spec`: each step as the run froze it, its brief, where it works — its place, repository, base
 * commit, branch and worktrees, a folder run's work directory, its workflow folder and the agent a try from an agent's page tried — the
 * runs it waits on and is handed, and the card it was started from.
 */
const specOf = (run: Run, at: RunReading): RunSpec => ({
  steps: (run.workflow ?? at.steps).map(specStepOf),
  brief: run.brief,
  place: placeOf(run),
  repo: run.repo ?? null,
  baseRef: run.baseRef ?? null,
  branch: run.branch ?? null,
  isolate: run.isolate ?? null,
  work: isRepositoryRun(run) ? null : run.workspace,
  workflowDir: run.workflowDir,
  try: tryOf(run, at.home),
  after: run.after ?? [],
  context: run.context ?? [],
  from: run.from ? { inbox: run.from.inbox } : null,
});

/**
 * What a step's tries have cost, against its cap, and the raise of that cap the package takes — off the views already read, which hold
 * every try's task, with no observation of its own. `steps` are the workflow the run is judged by: a step it does not have has no
 * `budget:`. No raise on a run called off, pruned or held: a raise is asked with a try or a round, which the verb refuses while a hold
 * stands (`heldRefusal`).
 */
function costOf(run: Run, name: string, at: RunReading): Pick<RunStepStatus, 'spent' | 'budget' | 'raise'> {
  const { steps, views, judged } = at;
  const step = steps.find((s) => s.name === name);
  const spent = spentOf(stepSpend(run, name, judged.spendOf));
  const cap = step ? budgetOf(step, run.steps[name]) : undefined;
  const budget =
    step && cap !== undefined
      ? {
          usd: cap,
          said: budgetWord(cap),
          of: spent && `${spent.said} of ${budgetWord(cap)}`,
          over: Boolean(overBudget(step, run, judged.spendOf)),
        }
      : null;
  return { spent, budget, raise: step ? stepRaise(step, run, steps, raiseReads(run, views), judged.spendOf) : null };
}

/**
 * What a round of a loop cost: the session of each try the package's `timeline` counts in that round — the steps the loop files again
 * (`loopSpan`), a session each once, which a try a recheck reached has none of — added up (`addSpend`).
 */
function roundSpend(clock: Timeline, steps: readonly Workflow[], total: TimelineTotal, spendOf: SpendOf): Spend {
  const looping = steps.find((s) => s.name === total.loop);
  const names = looping ? loopSpan(steps, looping) : [];
  return addSpend(
    names.flatMap((name) =>
      (clock.steps[name] ?? []).flatMap((t) => (t.round === total.round && t.session ? [spendOf(t.session.taskId)] : [])),
    ),
  );
}

/**
 * Every file a folder run's step folder holds (`folderFiles`), for a person who never opens a terminal; empty where there is no folder. A
 * folder that cannot be read answers with why instead of a list, since the board words an empty list as the step having made nothing.
 */
function filesOf(run: Run, step: string): Pick<RunStepStatus, 'files' | 'filesError'> {
  const dir = workFolderOf(run, step);
  const { files, error } = dir ? folderFiles(run, step, dir) : { files: [], error: null };
  return { files, filesError: error };
}

/** What the engine filed a try with (`filedOf`), its fence in this layer's word. */
const filedIn = (filed: StepFiled | null): RunStepStatus['filed'] =>
  filed && (({ permissionMode: fence, ...rest }) => ({ ...rest, fence }))(filed);

/** A try asked for, as the object says it. */
const askedOf = (r: Retry | undefined): RunStepStatus['asked'] =>
  r ? { try: r.try, mode: r.mode, model: r.model ?? null, message: r.message ?? null, stopFirst: r.stopFirst === true } : null;

/** What `nemia prune` took of a run: when, each worktree and what it held, and its artifacts; null for none. */
const prunedOf = (run: Run): RunStatus['pruned'] =>
  run.pruned
    ? {
        at: run.pruned.at,
        worktrees: run.pruned.worktrees.map(({ path: p, bytes }) => ({ path: p, bytes })),
        artifacts: run.pruned.artifacts ? { at: run.pruned.artifacts.at, bytes: run.pruned.artifacts.bytes } : null,
      }
    : null;

/** What of a run `nemia prune` would find on disk: two stats, and no git. */
function onDiskOf(run: Run, home: string): RunStatus['onDisk'] {
  const files = path.dirname(artifactsDir(run, '_'));
  return { worktrees: isRepositoryRun(run) && fs.existsSync(path.join(home, 'worktrees', run.id)), files: fs.existsSync(files) };
}

/** The run's timeline: each round with what it cost, by the steps the run is judged by, its own span with what it cost, and its slot. */
const runTimeline = ({ clock, steps, judged }: RunReading): RunStatus['timeline'] => ({
  rounds: clock.rounds.map((r) => ({ ...r, cost: spentOf(roundSpend(clock, steps, r, judged.spendOf)) })),
  run: { ...clock.run, cost: judged.cost },
  slot: clock.slot,
});

/** What the sessions of every try of every step read, by price (`RunRead`), off the run's timeline; null where none of it was measured. */
const runRead = ({ clock, steps, names }: RunReading): RunStatus['read'] =>
  readOf(
    totalOf(
      steps,
      names.flatMap((name) => (clock.steps[name] ?? []).flatMap((t) => (t.session ? [[name, t.used] as const] : []))),
    ),
  );

/** What `runObject` read once for the run (`RunReading`), handed to each step's status, with what only the steps read. */
type StepAt = RunReading & {
  readonly used: ReturnType<typeof consumption>;
  readonly said: LastSaid;
};

/** The step `name`'s word, as `nemia decide` says it (`stepStatus`), off the views already read. */
const stepWord = ({ run, steps, views, judged }: StepAt, name: string): RunStepStatus['status'] => {
  const reads = raiseReads(run, views);
  return stepStatus(
    steps.find((s) => s.name === name) ?? bare(name),
    run,
    reads.phaseOf,
    reads.closeoutOf,
    reads.askedCloseout,
    steps,
    judged.spendOf,
    reads.verdictOf,
  );
};

/**
 * One step's status (`RunStepStatus`), off what `runObject` read once for the run (`StepAt`), its current try's short read off its tries.
 * One more observation for a blocked session's last line (`lastLineOf`).
 */
const stepStatusOf = Effect.fnUntraced(function* (name: string, at: StepAt) {
  const { e, run, steps, views, judged, used, clock, said: memoSaid } = at;
  const taskId = run.steps[name]?.taskId ?? null;
  const judgedContext = steps.find((s) => s.name === name)?.context;
  const current = currentOf(at, name);
  const tries = triesIn(at, name, current);
  const latest = tries.find((t) => t.current);
  const lastLine = atHarness(current) ? yield* Effect.promise(() => lastLineOf(e, views, taskId, memoSaid)) : null;
  const status: RunStepStatus = {
    name,
    ...stepSaid(judged, name),
    status: stepWord(at, name),
    timeline: (clock.steps[name] ?? []).map((t) => ({ ...t, used: t.session ? usedOf(t.used, judgedContext) : null })),
    current: latest ? tryShort(latest) : null,
    filed: filedIn(filedOf(run.steps[name], views)),
    taskId,
    workspace: run.steps[name]?.workspace ?? null,
    ...filesOf(run, name),
    branch: run.steps[name]?.branch ?? null,
    note: judged.notes.get(name) ?? null,
    roundDue: judged.roundDue.has(name),
    ...needsOf(run, name, views, judged),
    lastLine,
    gate: gateOf(run, steps.find((s) => s.name === name) ?? bare(name), current.reason),
    accepted: acceptedOf(run, name),
    said: taskId ? [...(views.get(taskId)?.state.said ?? [])] : [],
    asked: askedOf(judged.asked.get(name)),
    check: current.check,
    attempts: current.attempts,
    used: taskId ? usedOf(used[name], judgedContext) : null,
    ...costOf(run, name, at),
  };
  return status;
});

/**
 * The object's run-level status beyond the list's judged fields, the graph, the timeline and the steps: the rest the board shows but the
 * lines a person types, which are the command table's (`runLines`, lines.verb.ts), not the run's.
 */
const restOf = (run: Run, at: RunReading, kinds: readonly Drift[]) => {
  const { home, folder, steps, judged, filed } = at;
  return {
    startedAt: runStartedAt(run, filed),
    cancelledAt: run.cancelledAt ?? null,
    pruned: prunedOf(run),
    onDisk: onDiskOf(run, home),
    holdUntil: judged.holding && run.hold ? run.hold.until : [],
    read: runRead(at),
    waitingOnYou: judged.waitingOnYou,
    waitingOnYouWords: judged.waitingOnYouWords,
    gates: gatesOf(steps, run),
    warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
    kinds: [...kinds],
  } satisfies Partial<RunStatus>;
};

/**
 * The run as one object, `nemia/v1`'s `Run`: its name, when it was made and its labels (`runLabels`, the feed's); the record it was started
 * with (`spec`); and what the package judges of it now (`status`) — the runs list's judged fields (`judgedFields`), the graph with its
 * `input` edges (`runInputGraph`), its time as a whole and each step, and the rest the board shows (`restOf`). Off one read of the run
 * (`runReading`) — never a sub-resource's verb per step, each of which reads the run again — or, when its unfrozen folder does not load
 * or a task it reads does not, why it is not judged, in the words the list says it with (`{ unjudged }`). One more observation for each
 * blocked session's last line (`lastLineOf`); the kinds it is behind the files on (`driftNow`) through the doors, over `inRequest`'s
 * services where given. A program over the engine, the place and the store's root.
 */
export const runObject = Effect.fn('runObject')(function* (run: Run, { memo, inRequest }: RunReads) {
  const at = yield* runReading(run, memo.filings);
  if ('unjudged' in at) return { unjudged: at.unjudged } satisfies RunObjectAnswer;
  const kinds = inRequest ? yield* Effect.promise(() => inRequest(driftNow(run))) : yield* driftNow(run);
  const stepAt: StepAt = { ...at, used: consumption(at.views, run), said: memo.said };
  const steps = yield* Effect.forEach(at.names, (name) => stepStatusOf(name, stepAt), { concurrency: 'unbounded' });
  const { factory, workflow } = runLabels(run);
  const object: RunObject = {
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { name: run.id, creationTimestamp: run.createdAt, labels: { factory, workflow } },
    spec: specOf(run, at),
    status: {
      ...judgedFields(run, at.judged, at.views),
      graph: runInputGraph(at.steps, at.names),
      timeline: runTimeline(at),
      steps,
      ...restOf(run, at, kinds),
    },
  };
  return object satisfies RunObjectAnswer;
});

/** The run `runId`'s record and its one read, its step `step` named: refused where the run is not judged, or has no such step. */
const stepRead = Effect.fnUntraced(function* (runId: string, step: string) {
  const run = yield* (yield* RunDoor).runs.read(RunId.read(runId));
  const at = yield* stepsReading(run);
  if ('unjudged' in at)
    return yield* Effect.fail(
      new Conflict({ message: `Run ${runId} is not judged: ${at.unjudged}. Mend what that names, then ask again.` }),
    );
  if (!at.names.includes(step))
    return yield* Effect.fail(
      new Missing({
        message: `Run ${runId} has no step '${step}': it has ${at.names.join(', ')}. Type \`nemia closeout ${runId} <step>\` with one of them.`,
      }),
    );
  return at;
});

/** The step's try `asked` (its latest when none is asked), or the refusal naming the tries it has. */
const tryIn = (runId: string, step: string, tries: readonly StepTry[], asked: string | undefined) => {
  const n = asked === undefined ? tries.at(-1)?.try : Number(asked);
  const found = tries.find((t) => t.try === n);
  if (found) return Effect.succeed(found);
  const has = tries.length ? `it has tries ${tries.map((t) => t.try).join(', ')}` : 'it has no try yet';
  return Effect.fail(
    new Missing({
      message: `Step ${step} of run ${runId} has no try ${asked ?? ''}: ${has}. Type \`nemia closeout ${runId} ${step} --try <n>\` with one of them.`,
    }),
  );
};

/** A step's tries, earliest first, the current one last (`StepTries`). */
export const stepTries = Effect.fn('stepTries')(function* (runId: string, step: string) {
  const at = yield* stepRead(runId, step);
  return { tries: triesIn(at, step) };
});

/** One try of a step (`StepTry`): `asked`, or its latest. */
export const stepTry = Effect.fn('stepTry')(function* (runId: string, step: string, asked?: string) {
  const at = yield* stepRead(runId, step);
  return yield* tryIn(runId, step, triesIn(at, step), asked);
});

export type { TryCloseout };

/** The closeout of a step's try `asked`, or of its latest (`TryCloseout`). */
export const stepCloseout = Effect.fn('stepCloseout')(function* (runId: string, step: string, asked?: string) {
  const one = yield* stepTry(runId, step, asked);
  return { try: one.try, closeout: one.closeout, unreadable: one.unreadable } satisfies TryCloseout;
});

/** What a step was told (`StepTold`): its body, its brief, by layer, and its task by part (`toldOf`). */
export const stepTold = Effect.fn('stepTold')(function* (runId: string, step: string) {
  const at = yield* stepRead(runId, step);
  const place = yield* PlaceService;
  const told: StepTold = {
    body: at.source?.find((s) => s.name === step)?.body ?? null,
    ...toldOf(at.run, step, at.source, at.views, place),
  };
  return told;
});
