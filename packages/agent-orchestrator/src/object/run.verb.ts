/**
 * The run as one object (`RunObject.Run`, run.model.ts), and its sub-resources: a step's tries, one try, its closeout and what it was told.
 * Each is built off one read of the run (`runReading`), the read its page makes, and its status's run-level fields from the function the
 * runs list calls (`judgedFields`), so the object, the page and the list say a run alike.
 */
import { Effect } from 'effect';
import { PlaceService } from '../place/place.store.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { RunId } from '../record/record.model.ts';
import { placeOf, type Run } from '../record/record.ts';
import { Conflict, Missing } from '../refusal/refusal.ts';
import { stepRaise } from '../retry/index.ts';
import { stepStatus } from '../status/status.ts';
import { runInputGraph } from '../summary/graph.ts';
import { bare, type Filings } from '../summary/reads.verb.ts';
import { stepSaid } from '../summary/judged.verb.ts';
import { judgedFields } from '../summary/summary.verb.ts';
import { runLabels } from '../telemetry/telemetry.ts';
import type { StepCloseout, StepTry, StepUnreadable } from '../resource/tries.verb.ts';
import { toldOf } from '../resource/told.verb.ts';
import type { Run as RunObject, RunSpec, RunStepStatus, TryShort } from './run.model.ts';
import { raiseReads, runReading, type RunReading, stepsReading, triesIn } from './read.verb.ts';

/** What `runObject` is handed beside its services: the feed's filing times it reads on from (`filedTimes`), the caller's to keep. */
export type RunObjectReads = { readonly filings: Filings };

/** The object of a run, or why it is not judged, in the words the list says it with — as its page answers (`RunPageAnswer`). */
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

/** The frozen record as the object's `spec`: each step as it waits, is handed and loops, its brief, its place, repository and branch. */
const specOf = (run: Run, at: RunReading): RunSpec => ({
  steps: (run.workflow ?? at.steps).map((s) => ({
    name: s.name,
    after: [...s.after],
    input: [...(s.input ?? [])],
    loop: s.loop ?? null,
    rounds: s.rounds ?? null,
  })),
  brief: run.brief,
  place: placeOf(run),
  repo: run.repo ?? null,
  branch: run.branch ?? null,
});

/** A step now (`RunStepStatus`), off the run's one read: its codes and word, its raise, its tries on the clock, its current try's short. */
const stepStatusOf = (at: RunReading, name: string): RunStepStatus => {
  const { run, steps, views, judged, clock } = at;
  const step = steps.find((s) => s.name === name);
  const reads = raiseReads(run, views);
  const { phase, reason } = stepSaid(judged, name);
  const current = triesIn(at, name).find((t) => t.current);
  return {
    name,
    phase,
    reason,
    status: stepStatus(
      step ?? bare(name),
      run,
      reads.phaseOf,
      reads.closeoutOf,
      reads.askedCloseout,
      steps,
      judged.spendOf,
      reads.verdictOf,
    ),
    raise: step ? stepRaise(step, run, steps, reads, judged.spendOf) : null,
    timeline: (clock.steps[name] ?? []).map((t) => ({ ...t })),
    current: current ? tryShort(current) : null,
  };
};

/**
 * The run as one object, `nemia/v1`'s `Run`: its name, when it was made and its labels (`runLabels`, the feed's); the record it was started
 * with (`spec`); and what the package judges of it now (`status`) — the runs list's judged fields (`judgedFields`), the graph with its
 * `input` edges (`runInputGraph`), its time as a whole and each step. Or, for a run that does not judge, why, as its page answers. A
 * program over the engine and the store's root (`EngineService`, `StoreRoot`), reading the run once (`runReading`).
 */
export const runObject = Effect.fn('runObject')(function* (run: Run, { filings }: RunObjectReads) {
  const at = yield* runReading(run, filings);
  if ('unjudged' in at) return { unjudged: at.unjudged } satisfies RunObjectAnswer;
  const { factory, workflow } = runLabels(run);
  const object: RunObject = {
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { name: run.id, creationTimestamp: run.createdAt, labels: { factory, workflow } },
    spec: specOf(run, at),
    status: {
      ...judgedFields(run, at.judged, at.views),
      graph: runInputGraph(at.steps, at.names),
      timeline: { rounds: at.clock.rounds, run: at.clock.run, slot: at.clock.slot },
      steps: at.names.map((name) => stepStatusOf(at, name)),
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

/** A step's tries, earliest first, the current one last (`StepTry`). */
export const stepTries = Effect.fn('stepTries')(function* (runId: string, step: string) {
  const at = yield* stepRead(runId, step);
  return { tries: triesIn(at, step) };
});

/** One try of a step (`StepTry`): `asked`, or its latest. */
export const stepTry = Effect.fn('stepTry')(function* (runId: string, step: string, asked?: string) {
  const at = yield* stepRead(runId, step);
  return yield* tryIn(runId, step, triesIn(at, step), asked);
});

/** What a try of a step signed off with: its closeout, or why it does not read (each null where there is none). */
export type TryCloseout = { try: number; closeout: StepCloseout | null; unreadable: StepUnreadable | null };

/** The closeout of a step's try `asked`, or of its latest (`TryCloseout`). */
export const stepCloseout = Effect.fn('stepCloseout')(function* (runId: string, step: string, asked?: string) {
  const one = yield* stepTry(runId, step, asked);
  return { try: one.try, closeout: one.closeout, unreadable: one.unreadable } satisfies TryCloseout;
});

/** What a step was told (`toldOf`): its brief, by layer, and its task by part. */
export const stepTold = Effect.fn('stepTold')(function* (runId: string, step: string) {
  const at = yield* stepRead(runId, step);
  const place = yield* PlaceService;
  return toldOf(at.run, step, at.source, at.views, place);
});
