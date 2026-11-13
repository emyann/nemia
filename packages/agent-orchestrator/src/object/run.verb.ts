/**
 * The run as one object (`RunObject.Run`, run.model.ts), and its sub-resources: a step's tries, one try, its closeout and what it was told.
 * Each is built off one read of the run (`runReading`), and its status's run-level fields from the function the runs list calls
 * (`judgedFields`), so the object and the list say a run alike. The board reads the object, and a step's tries and told layers at their
 * sub-resources, each its own read.
 */
import { StoreRoot } from '../config/root.store.ts';
import type { InputsWatchedBy } from '../rest/index.ts';
import { valueVersion } from '../digest/digest.ts';
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
import { LOOP_REPLIES, loopSpan, outputFields, type StepSpec } from '../workflow.ts';
import type { FieldShape } from 'objects';
import { Conflict, Missing } from '../refusal/refusal.ts';
import type { Retry } from '../retry/index.ts';
import { stepRaise } from '../retry/index.ts';
import { stepStatus } from '../status/status.ts';
import { budgetWord } from '../money/money.ts';
import { runInputGraph } from '../summary/graph.ts';
import { bare, tryOf } from '../summary/reads.verb.ts';
import { atHarness, needsOf, spentOf, stepSaid } from '../summary/judged.verb.ts';
import { judgedFields } from '../summary/summary.verb.ts';
import type { UnjudgedStep } from '../summary/judgement.verb.ts';
import { resultBranches } from '../branches/branches.store.ts';
import { runLabels } from '../telemetry/telemetry.ts';
import { metadataLabels } from '../labels/labels.ts';
import { runStartedAt, type Timeline, type TimelineTotal } from '../timeline/index.ts';
import { consumption } from '../views/views.verb.ts';
import type { Drift } from '../revisions/revisions.ts';
import { driftNow } from '../revisions/pin.verb.ts';
import { driftOf, gateOf, type StepTry } from '../resource/tries.verb.ts';
import { filedOf, type StepFiled, toldOf } from '../resource/told.verb.ts';
import { folderFiles, workFolderOf } from '../resource/files.store.ts';
import { type LastSaid, lastLineOf } from '../resource/checks.verb.ts';
import { readOf, totalOf, usedOf } from '../resource/index.ts';
import type { Run as RunObject, RunSpec, RunStatus, RunStepStatus, StepTold, TryCloseout, TryShort } from './run.model.ts';
import { runNamespace } from '../run-list/index.ts';
import { prunedWords } from '../record/record.ts';
import { prunedKept } from '../forget/prune/prune.ts';
import { currentOf, raiseReads, runReading, type RunReading, stepsReading, triesIn } from './read.verb.ts';
import { saidOf } from '../say/say.ts';

/**
 * What `runObject` is handed beside its services: what a caller's reads keep between requests (`said`, where each blocked session's
 * conversation was last read), and `inRequest`, which runs the drift's program
 * (`driftNow`) over a request's own services, so it reads the doors the api was given; without it the drift runs over the program's own.
 * `listed` judges the run as a list says it, which a board polls: no harness asked for a blocked session's last line, and no drift
 * read through the doors, so each step's `lastLine` is null and `kinds` empty there, and the run read alone says them.
 */
export type RunReads = {
  readonly memo: { readonly said: LastSaid };
  readonly inRequest?: (program: ReturnType<typeof driftNow>) => Promise<readonly Drift[]>;
  readonly listed?: boolean;
};

/** The object of a run, or why it is not judged, in the words the list says it with, and each step's word off its record. */
export type RunObjectAnswer = RunObject | { unjudged: string; steps: readonly UnjudgedStep[] };

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
const specStepOf = (s: StepSpec): RunSpec['steps'][number] => ({
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
  ...(s.agent?.name !== undefined ? { agent: s.agent.name } : {}),
  ...(s.output ? { fields: declaredFields(s) } : {}),
});

/**
 * The fields a step's declared output gives, in its schema's order, each with the shape its `x-shape` marked or null, as its closeout
 * serves them (`closeoutIn`): the loop's `replies` aside.
 */
const declaredFields = (s: StepSpec): Array<{ name: string; shape: FieldShape | null }> =>
  outputFields(s)
    .filter((name) => name !== LOOP_REPLIES)
    .map((name) => ({ name, shape: s.output?.shapes?.[name] ?? null }));

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
  after: [...(run.after ?? [])],
  context: [...(run.context ?? [])],
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
  const cap = step ? budgetOf(step, run) : undefined;
  const budget =
    step && cap !== undefined
      ? {
          usd: cap,
          said: budgetWord(cap),
          of: spent && `${spent.said} of ${budgetWord(cap)}`,
          over: Boolean(overBudget(step, run, judged.spendOf)),
        }
      : null;
  return { spent, budget, raise: step ? stepRaise(step, run, steps, raiseReads(run, views, steps), judged.spendOf) : null };
}

/**
 * What a round of a loop cost: the session of each try the package's `timeline` counts in that round — the steps the loop files again
 * (`loopSpan`), a session each once, which a try a recheck reached has none of — added up (`addSpend`).
 */
function roundSpend(clock: Timeline, steps: readonly StepSpec[], total: TimelineTotal, spendOf: SpendOf): Spend {
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
 * And every file of the step's artifacts folder (`artifactsDir`), on every place, named by its closeout or not, linked under the
 * artifacts route: absent where the step has no such folder, as one not filed yet has none.
 */
function filesOf(run: Run, home: string, step: string): Pick<RunStepStatus, 'files' | 'filesError' | 'artifactsFolder'> {
  const dir = workFolderOf(run, step);
  const { files, error } = dir ? folderFiles(run, step, dir, 'files') : { files: [], error: null };
  const artifacts = artifactsDir(home, run, step);
  return {
    files,
    filesError: error,
    ...(fs.existsSync(artifacts) ? { artifactsFolder: folderFiles(run, step, artifacts, 'artifacts') } : {}),
  };
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
        said: `${prunedWords(run.pruned)}; ${prunedKept(run.pruned)}`,
      }
    : null;

/** What of a run `nemia prune` would find on disk: two stats, and no git. */
function onDiskOf(run: Run, home: string): RunStatus['onDisk'] {
  const files = path.dirname(artifactsDir(home, run, '_'));
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
  readonly listed: boolean;
};

/**
 * The step `name`'s word, as `nemia decide` says it: `assess`'s on the judgement's read (`stepWords`), so the object and the decision say a
 * step alike; a step the run is not judged by (a `bare` one its record names) is worded off the views already read (`stepStatus`).
 */
const stepWord = ({ run, steps, views, judged }: StepAt, name: string): RunStepStatus['status'] => {
  const judgedWord = judged.assessed.stepWords.get(name)?.status;
  if (judgedWord !== undefined) return judgedWord;
  const reads = raiseReads(run, views, steps);
  return stepStatus(bare(name), run, reads.phaseOf, reads.closeoutOf, reads.askedCloseout, steps, judged.spendOf, reads.verdictOf);
};

/** How many questions the step's closeout asks of a person it waits on (`Judged`'s `beside`), where it asks any. */
const asksOf = (judged: RunReading['judged'], name: string): Pick<RunStepStatus, 'asks'> => {
  const asks = judged.beside.get(name)?.asks;
  return asks ? { asks } : {};
};

/**
 * One step's status (`RunStepStatus`), off what `runObject` read once for the run (`StepAt`), its current try's short read off its tries.
 * One more observation for a blocked session's last line (`lastLineOf`).
 */
const stepStatusOf = Effect.fnUntraced(function* (name: string, at: StepAt) {
  const home = yield* StoreRoot;
  const { e, run, steps, views, judged, used, clock, said: memoSaid, listed } = at;
  const taskId = run.steps[name]?.taskId ?? null;
  const judgedContext = steps.find((s) => s.name === name)?.context;
  const current = currentOf(home, at, name);
  const tries = triesIn(home, at, name, current);
  const latest = tries.find((t) => t.current);
  const lastLine = !listed && atHarness(current) ? yield* Effect.promise(() => lastLineOf(e, views, taskId, memoSaid)) : null;
  const status: RunStepStatus = {
    name,
    ...stepSaid(judged, name),
    status: stepWord(at, name),
    timeline: (clock.steps[name] ?? []).map((t) => ({ ...t, used: t.session ? usedOf(t.used, judgedContext) : null })),
    current: latest ? tryShort(latest) : null,
    filed: filedIn(filedOf(run.steps[name], views, yield* StoreRoot)),
    taskId,
    workspace: run.steps[name]?.workspace ?? null,
    files: [],
    filesError: null,
    branch: run.steps[name]?.branch ?? null,
    note: judged.notes.get(name) ?? null,
    roundDue: judged.roundDue.has(name),
    ...needsOf(run, name, views, judged),
    lastLine,
    gate: gateOf(
      run,
      steps.find((s) => s.name === name) ?? bare(name),
      current.reason,
      steps,
      raiseReads(run, views, steps).closeoutOf,
      judged.spendOf,
    ),
    said: taskId ? (views.get(taskId)?.state.said ?? []).map(saidOf) : [],
    asked: askedOf(judged.asked.get(name)),
    check: current.check,
    attempts: current.attempts,
    used: taskId ? usedOf(used[name], judgedContext) : null,
    ...costOf(run, name, at),
    ...asksOf(judged, name),
  };
  return status;
});

/** Where the run's work ended up (`resultBranches`), where a result step has a branch. */
const resultOf = (run: Run, steps: readonly StepSpec[]): Pick<RunStatus, 'result'> => {
  const result = resultBranches(run, steps);
  return result.length ? { result } : {};
};

/**
 * The object's run-level status beyond the list's judged fields, the graph, the timeline and the steps: the rest the board shows but the
 * lines a person types, which are the command table's (`runLines`, lines.verb.ts), not the run's.
 */
const restOf = (run: Run, at: RunReading, kinds: readonly Drift[]) => {
  const { steps, judged, views } = at;
  return {
    startedAt: runStartedAt(run, views),
    cancelledAt: run.cancelledAt ?? null,
    pruned: prunedOf(run),
    onDisk: { worktrees: false, files: false },
    holdUntil: judged.holding && run.hold ? [...run.hold.until] : [],
    read: runRead(at),
    waitingOnYou: judged.waitingOnYou,
    waitingOnYouWords: judged.waitingOnYouWords,
    gates: gatesOf(steps, run),
    warning: null,
    kinds: [...kinds],
    ...resultOf(run, steps),
  } satisfies Partial<RunStatus>;
};

/**
 * The run as one object, `nemia/v1`'s `Run`: its name, when it was made and its whole map of labels (`metadataLabels`: its `workflow`,
 * its `factory` but the default, and a person's labels); the record it was started
 * with (`spec`); and what the package judges of it now (`status`) — the runs list's judged fields (`judgedFields`), the graph with its
 * `input` edges (`runInputGraph`), its time as a whole and each step, and the rest the board shows (`restOf`). Off one read of the run
 * (`runReading`) — never a sub-resource's verb per step, each of which reads the run again — or, when its unfrozen folder does not load
 * or a task it reads does not, why it is not judged, in the words the list says it with (`{ unjudged }`). Unless `listed`, one more
 * observation for each blocked session's last line (`lastLineOf`), and the kinds it is behind the files on (`driftNow`) through the
 * doors, over `inRequest`'s services where given. A program over the engine, the place and the store's root.
 */
export const runObject = Effect.fn('runObject')(function* (run: Run, { memo, inRequest, listed = false }: RunReads) {
  const at = yield* runReading(run);
  if ('unjudged' in at) return { unjudged: at.unjudged, steps: at.steps } satisfies RunObjectAnswer;
  return yield* runObjectOf(run, at, { said: memo.said, listed, ...(inRequest ? { inRequest } : {}) });
});

/**
 * The run's object (`runObject`) built off its reading in hand (`RunReading`), its parts no stamp watches read now (`diskPartsOf`): the
 * object before them (`runObjectCore`) with them laid over (`withDiskParts`).
 */
export const runObjectOf = Effect.fnUntraced(function* (
  run: Run,
  at: RunReading,
  reads: { readonly said: LastSaid } & Pick<RunReads, 'inRequest' | 'listed'>,
) {
  return withDiskParts(yield* runObjectCore(run, at, reads), diskPartsOf(run, at.home, at.folder));
});

/** A digest of `value`, as every other kind's `resourceVersion` is taken (`valueVersion`). */
const runVersion = valueVersion;

/**
 * The run's object before its disk parts (`withDiskParts`), built off its reading in hand (`RunReading`): what the RunList builds a run of
 * its page with, having judged and read the page in one batch, and keeps beside its judgement. Its `resourceVersion` is the digest of
 * what it holds (`runVersion`), which `withDiskParts` digests again with the parts it lays.
 */
export const runObjectCore = Effect.fnUntraced(function* (
  run: Run,
  at: RunReading,
  { said, inRequest, listed = false }: { readonly said: LastSaid } & Pick<RunReads, 'inRequest' | 'listed'>,
) {
  const kinds = listed ? [] : inRequest ? yield* Effect.promise(() => inRequest(driftNow(run))) : yield* driftNow(run);
  const stepAt: StepAt = { ...at, used: consumption(at.views, run), said, listed };
  const steps = yield* Effect.forEach(at.names, (name) => stepStatusOf(name, stepAt), { concurrency: 'unbounded' });
  const { factory, workflow } = runLabels(run);
  const metadata = {
    name: run.id,
    namespace: runNamespace(run.factory),
    creationTimestamp: run.createdAt,
    labels: metadataLabels({ workflow, factory, ...(run.labels !== undefined ? { labels: run.labels } : {}) }),
  };
  const spec = specOf(run, at);
  const status: RunStatus = {
    ...judgedFields(run, at.judged, at.views),
    graph: runInputGraph(at.steps, at.names),
    timeline: runTimeline(at),
    steps,
    ...restOf(run, at, kinds),
  };
  const object: RunObject = {
    apiVersion: 'nemia/v1',
    kind: 'Run',
    metadata: { ...metadata, resourceVersion: runVersion({ metadata, spec, status }) },
    spec,
    status,
  };
  return object;
});

/**
 * The parts of a run's object that rest on the disk and on no input the informer checks, read on every request: what `nemia prune` would
 * find (`onDisk`, which a prune, the free sweep or a hand removes with no stamp moved), each step's files in a folder run's step folder
 * (`files`, `filesError`) and in its artifacts folder (`artifactsFolder`), and what the workflow folder as it loads now says against
 * the run (`warning`).
 */
export type RunDiskParts = {
  readonly onDisk: RunStatus['onDisk'];
  readonly warning: RunStatus['warning'];
  readonly files: (step: string) => Pick<RunStepStatus, 'files' | 'filesError' | 'artifactsFolder'>;
};

/** Whether two types are one. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/** The parts read on every request are exactly the inputs `RUN_INPUTS` says a request watches: one added there fails the typecheck here. */
export const diskPartsHeld: Same<keyof RunDiskParts, InputsWatchedBy<'request'>> = true;

/** The disk parts of `run` (`RunDiskParts`), off the store's root `home` and its workflow `folder` as it loads now (`workflowsOf`). */
export const diskPartsOf = (run: Run, home: string, folder: RunReading['folder']): RunDiskParts => ({
  onDisk: onDiskOf(run, home),
  warning: folder.steps ? driftOf(run, folder.steps) : folder.warning,
  files: (step) => filesOf(run, home, step),
});

/**
 * The object before its disk parts (`runObjectCore`) with them laid over (`RunDiskParts`): a new object, the one handed in left as it
 * was, since a kept one is shared. Its `resourceVersion` is the core's digested with the parts laid (`runVersion`), so it moves when
 * either does; laid twice, the version is digested twice, so it is laid on the core alone.
 */
export const withDiskParts = (object: RunObject, parts: RunDiskParts): RunObject => {
  const laid = object.status.steps.map((step) => ({ step, files: parts.files(step.name) }));
  const resourceVersion = runVersion({
    core: object.metadata.resourceVersion,
    onDisk: parts.onDisk,
    warning: parts.warning,
    files: laid.map(({ files }) => files),
  });
  return {
    ...object,
    metadata: { ...object.metadata, resourceVersion },
    status: {
      ...object.status,
      onDisk: parts.onDisk,
      warning: parts.warning,
      steps: laid.map(({ step, files }) => ({ ...step, ...files })),
    },
  };
};

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
  const home = yield* StoreRoot;
  const at = yield* stepRead(runId, step);
  return { tries: triesIn(home, at, step) };
});

/** One try of a step (`StepTry`): `asked`, or its latest. */
export const stepTry = Effect.fn('stepTry')(function* (runId: string, step: string, asked?: string) {
  const home = yield* StoreRoot;
  const at = yield* stepRead(runId, step);
  return yield* tryIn(runId, step, triesIn(home, at, step), asked);
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
