/**
 * What a pass files, and what it files a step with: the tries due (`fileTries`), the rounds (`fileRounds`), the checks (`fileChecks`) and
 * the ready steps (`fileReady`), in the order `advanceRun` calls them, each under the id the run derives and asking the store first
 * whether it may file (`mayFileOf`), a nudge answering a task held open through `answerHeld` (`held.verb.ts`); the fields of a filing
 * that only a local harness reads (`localFields`), the step as it is told (`toldOf`, told.verb.ts); what its roots are handed of other runs
 * is `handedOf`'s (`handed.verb.ts`). A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { asked, over, type Engine, type TaskView } from '../runtime-client.ts';
import {
  CHECK_DEADLINE_SECONDS,
  CHECK_NICENESS,
  checkArgv,
  checkEnvOf,
  LANDING_CHECK_DEADLINE_SECONDS,
  type CheckHanded,
  type LandingSaid,
  type Verdict,
} from '../check/check.ts';
import { isRemoteHarness, type Workflow } from '../workflow.ts';
import { holdsOpen } from '../gate/gate.ts';
import {
  checkTaskId,
  isRepositoryRun,
  stepTaskId,
  tryOf,
  type CloseoutAsked,
  type Run,
  type StepRecord,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import {
  askingTry,
  budgetOf,
  budgetUsdFor,
  holdsOpenOn,
  landsOnCheck,
  MOMENTUM,
  ownStatus,
  sentBack,
  stepMomentum,
  stepSpend,
  triedFrom,
  type Round,
  type RoundAsk,
  type SpendOf,
} from '../status/status.ts';
import { composeBrief, remoteBrief, type EndingStopped, type ParentCloseout, type RetryBriefing } from '../brief/index.ts';
import { handedOf } from '../brief/handed.verb.ts';
import type { BranchReader } from '../branches/branches.store.ts';
import { roundBriefed, roundFiled, roundFiledNote } from '../round/round.ts';
import { closeoutsAfterMerge } from '../merge/merge.verb.ts';
import { filedConfig, tryModel } from '../filed/filed.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from '../closeout/index.ts';
import { modeWord, nextTry, sessionModel, tryWord, type Retry, type RetryAsk } from '../retry/index.ts';
import { artifactsDir, inputsDir } from '../record/record.store.ts';
import { checkCloseout, writeCheckCloseout } from '../check/check.store.ts';
import { checkoutParts, cutNotes, workspaceFor, type Cut } from '../workspace/worktree.store.ts';
import { checksHandedRead, landingSaidRead, refusalRead, reportedEngine, saidIn, sessionIn } from '../views/views.verb.ts';
import { noteFiledCheck, withinEffect } from '../meter/tally.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { keysOf } from '../stats/index.ts';
import type { WorkflowCosts } from '../costs/index.ts';
import { costsRead } from '../costs/costs.verb.ts';
import { answerHeld, stopAsked } from './held.verb.ts';
import { forStep } from '../telemetry/telemetry.store.ts';
import { stepLabels } from '../telemetry/telemetry.ts';
import { filedAt, foldersTold, lacksTold, placeTold, toldOf, type PlaceTold, type Told } from './told.verb.ts';

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema —
 * for a step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured
 * it. The runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left
 * out, not emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
export const localFields = <T extends object>(step: Workflow, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();

/** A task as the engine is asked to file it (`e.file`). */
type Spec = Parameters<Engine['file']>[0];

/**
 * What a pass read of a run before it filed anything (`advanceRun`): the run's steps, the engine's views of its tasks and the readers made
 * of them, and a person's asks. One for the pass: every phase of it reads the same.
 */
export type PassReads = {
  steps: Workflow[];
  views: Map<string, TaskView>;
  phaseOf: (taskId: string) => TaskPhase;
  signedOff: (step: string) => Closeout | undefined;
  asked: (taskId: string) => CloseoutAsked;
  verdictOf: (step: string) => Verdict | undefined;
  sessionBlocked: (taskId: string) => boolean;
  spendOf: SpendOf;
  asks: RetryAsk[];
  roundAsks: RoundAsk[];
};

/**
 * The pass's closer of the tasks held open that wait for a word: `closeWaiting` closes one, and answers with the engine's refusal as a
 * note of the step's, or undefined once closed; `awaitsWord` says whether a task still waits for one, which one closed on this pass does
 * not.
 */
export type Closer = {
  closeWaiting: (name: string, taskId: string) => Effect.Effect<string | undefined>;
  awaitsWord: (taskId: string | null | undefined) => boolean;
};

/**
 * One pass's filing: the engine, which files each brief with its parts beside it (`inParts`, given by `advancePass`), the run, what
 * the pass read (`PassReads`), its closer (`Closer`), whether it may file still (`mayFile`, made by `mayFileOf` once a pass), the
 * pass's notes, which each filing adds to in the order it runs, and `heads`, every branch of the run's repository and its commit as the
 * pass read them, undefined where it did not.
 */
export type Filing = { e: Engine; run: Run; reads: PassReads; closer: Closer; mayFile: () => boolean; notes: string[]; heads?: Heads };

/** Every branch of a run's repository and its commit, read when first asked, as a pass read them; undefined where it did not. */
export type Heads = () => Readonly<Record<string, string>> | undefined;

/** The engine as the pass read it: a check's verdict is read off the view the pass judged it by (`reportedEngine`), never a second time. */
const asRead = (f: Filing): Engine => reportedEngine(f.e, [...f.reads.views.values()]);

/** The step of this name, which the pass's assessment named. */
const stepNamed = (f: Filing, name: string): Workflow => f.reads.steps.find((s) => s.name === name)!;

/** Close the task held open a filing replaces, where it waits for a word (`Closer`): the engine's refusal as a note, or undefined. */
const closeFirst = (f: Filing, name: string, taskId: string | null | undefined): Effect.Effect<string | undefined> =>
  f.closer.awaitsWord(taskId) ? f.closer.closeWaiting(name, taskId!) : Effect.succeed(undefined);

/** The steps a pass tried again, and those of them whose try is a recheck, whose checks are filed with the others. */
type Tried = { tried: string[]; rechecked: string[] };

/**
 * File the tries due (the assessment's `retry`), in order: each a recheck, a stop of a session not settled, an answer to the task held
 * open (`answerHeld`), or a task of its own. Answers with the steps tried and those rechecked.
 */
export const fileTries = Effect.fn('fileTries')(function* (f: Filing, retry: readonly Retry[]) {
  const out: Tried = { tried: [], rechecked: [] };
  for (const r of retry) yield* fileTry(f, r, out).pipe(forStep(f.run, stepNamed(f, r.step)));
  return out;
});

/**
 * Ask the engine once to stop a try's session its harness blocked, or that runs on: the try is filed by a pass once it has settled. A stop
 * the engine refuses (`stopAsked`) is said, and the try waits for the same settling.
 */
const stopFirst = Effect.fnUntraced(function* (f: Filing, r: Retry, taskId: string) {
  if (f.reads.views.get(taskId)?.state.stopRequested) return;
  const refused = yield* stopAsked(f.e, taskId);
  const why = r.runsOn ? 'its session runs on, asked for while its harness had blocked it' : 'its harness blocked its session';
  const stopped = refused
    ? `but the engine did not take the stop (${refused}), and the try is filed once it has settled`
    : 'so the engine is asked to stop it, and the try is filed once it has';
  f.notes.push(
    `${r.step}: try ${r.try} — nemia retry ${modeWord(r)}${r.message !== undefined ? ', with your answer' : ''}; ${why}, ${stopped}`,
  );
});

/** Whether a try is a person's nudge that answers the step's task held open, in the session that signed, rather than a task of its own. */
const answersHeld = (f: Filing, r: Retry, step: Workflow, record: StepRecord): boolean => {
  const { run, reads } = f;
  return (
    f.closer.awaitsWord(record.taskId) &&
    r.by === 'ask' &&
    r.mode === 'nudge' &&
    Boolean(sessionIn(reads.views, record.taskId!)) &&
    holdsOpen(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf, reads.verdictOf)
  );
};

/**
 * File one try due, or stop its session first, and put it on the record with its note: nothing once the pass may file no more, and
 * nothing but the note where the engine refuses the close or the answer it needs.
 */
const fileTry = Effect.fnUntraced(function* (f: Filing, r: Retry, out: Tried) {
  const { run, notes } = f;
  const step = stepNamed(f, r.step);
  const record = run.steps[r.step];
  if (r.stopFirst) return yield* stopFirst(f, r, record.taskId!);
  if (!f.mayFile()) return;
  const said = tryWord(r, step);
  if (r.mode === 'recheck') {
    out.tried.push(r.step);
    notes.push(said);
    run.steps[r.step] = nextTry(record, r);
    out.rechecked.push(r.step);
    return;
  }
  const landing = placeTold(run, step, yield* PlaceService, f.heads?.());
  const answers = answersHeld(f, r, step, record);
  const closeRefused = answers ? undefined : yield* closeFirst(f, r.step, record.taskId);
  if (closeRefused) {
    notes.push(closeRefused);
    return;
  }
  const taskId = answers ? record.taskId! : stepTaskId(run, r.step, r.try);
  const briefed = answers ? undefined : (yield* asked('view', f.e.view(taskId))).state.brief;
  const refused = answers || !briefed ? yield* sendTry(f, r, step, taskId, answers, landing) : undefined;
  if (refused) {
    notes.push(`${r.step}: ${refused}`);
    return;
  }
  out.tried.push(r.step);
  notes.push(said);
  run.steps[r.step] = nextTry(record, r, taskId);
  for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]);
});

/**
 * What recent runs of the run's workflow cost (`costsRead`), for a new session of a step on a local harness whose `reads:` names `costs`;
 * undefined for any other, and for a session continued, told them on its first brief.
 */
const costsFor = Effect.fnUntraced(function* (f: Filing, step: Workflow, resumed: boolean) {
  if (resumed || isRemoteHarness(step.harness) || !step.reads?.includes('costs')) return undefined;
  return yield* costsRead(f.e, f.run);
});

/**
 * Send a try to the engine, told what its place says to it (`PlaceTold`): filed as a task of its own, or given as the answer to the
 * task held open (`answers`). Answers with the engine's refusal of the answer, or undefined.
 */
const sendTry = Effect.fnUntraced(function* (f: Filing, r: Retry, step: Workflow, taskId: string, answers: boolean, landing: PlaceTold) {
  const { e, run, reads } = f;
  const record = run.steps[r.step];
  const files = artifactsDir(run, r.step);
  fs.mkdirSync(files, { recursive: true });
  const remote = isRemoteHarness(step.harness);
  const resumeFrom = r.mode === 'nudge' && !remote ? sessionIn(reads.views, record.taskId!) : undefined;
  const refusal = record.check && step.check ? yield* refusalRead(step.check, record.check.taskId).pipe(over(asRead(f))) : undefined;
  const closeouts = yield* askingReads(f, r, resumeFrom);
  const checked = remote ? [] : yield* checksHandedRead(run, reads.steps, step).pipe(over(asRead(f)));
  const status = triedFrom(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf);
  const told: Told = { ...toldOf(run, step), ...landing };
  const brief = remote
    ? remoteBrief(step, run, reads.steps, closeouts, {
        try: r.try,
        by: r.by,
        mode: r.mode,
        resumed: false,
        status,
        ...(r.message !== undefined ? { message: r.message } : {}),
      })
    : composeBrief(
        told.step,
        run,
        reads.steps,
        closeouts,
        files,
        undefined,
        tryTold(f, r, record, { status, resumeFrom, refusal }),
        undefined,
        undefined,
        inputsDir(run),
        checked,
        foldersTold(run, reads, told.step),
        yield* costsFor(f, step, Boolean(resumeFrom)),
        { words: told.words, say: told.say },
      );
  const budgetUsd = budgetUsdFor(r.budget ?? budgetOf(step, record), stepSpend(run, r.step, reads.spendOf));
  if (answers) return yield* answerHeld(e, taskId, brief, budgetUsd);
  yield* asked('file', e.file(trySpec(f, r, step, record, { taskId, brief, resumeFrom, budgetUsd, told })));
  return undefined;
});

/**
 * How a try's brief reads the closeouts: a new session of a loop's target within a round reads the looping step's off the try that asked
 * for the round (`askingTry`), and every other as it signed.
 */
const askingReads = Effect.fnUntraced(function* (f: Filing, r: Retry, resumeFrom: string | undefined) {
  const { e, run, reads } = f;
  const asking = resumeFrom ? undefined : askingTry(reads.steps, run, r.step);
  const askedWith = asking ? (yield* asked('view', e.view(asking.taskId))).state.attempts.at(-1)?.closeout : undefined;
  const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
  return (name: string): Closeout | undefined =>
    asking && name === asking.looping.name && findings && !('error' in findings) ? findings : reads.signedOff(name);
});

/** What the ending a try is sent back from said, for the work's brief: its status, its summary and needs, and where it merges. */
const endingSaid = (f: Filing, ending: Workflow): EndingStopped => {
  const { run, reads } = f;
  const said = reads.signedOff(ending.name);
  return {
    step: ending.name,
    status: ownStatus(ending, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf),
    ...(said?.summary ? { summary: said.summary } : {}),
    ...(said?.needs ? { needs: said.needs } : {}),
    onto: isRepositoryRun(run) ? run.branch : 'the base branch',
  };
};

/**
 * What a local try's brief is told of its try (`RetryBriefing`): how it came and on whose word, the session it continues and what was said
 * to it, how the try before it ended, what its check refused, what was denied it, and the ending it was sent back from.
 */
const tryTold = (
  f: Filing,
  r: Retry,
  record: StepRecord,
  t: { status: StepStatus; resumeFrom: string | undefined; refusal: RetryBriefing['refusal'] },
): RetryBriefing => ({
  try: r.try,
  by: r.by,
  mode: r.mode,
  ...(r.model ? { model: r.model } : {}),
  ...(r.message !== undefined ? { message: r.message } : {}),
  ...(r.budget !== undefined ? { budget: r.budget } : {}),
  ...(r.pastCap ? { pastCap: true as const } : {}),
  resumed: Boolean(t.resumeFrom),
  ...(t.resumeFrom ? { said: saidIn(f.reads.views.get(record.taskId!)) } : {}),
  status: t.status,
  ...(t.refusal ? { refusal: t.refusal } : {}),
  ...(t.status === 'denied' ? { denied: f.reads.spendOf(record.taskId!)?.denied ?? [] } : {}),
  ...(t.status === 'unsigned' ? lacksTold(f.run, r.step, record) : {}),
  ...(r.back?.length ? { ending: endingSaid(f, stepNamed(f, r.back[0])) } : {}),
});

/** A try filed as a task of its own, in the workspace the step had, with its brief, its session to continue and its cap. */
const trySpec = (
  f: Filing,
  r: Retry,
  step: Workflow,
  record: StepRecord,
  t: { taskId: string; brief: string; resumeFrom: string | undefined; budgetUsd: number | undefined; told: Told },
): Spec => ({
  id: t.taskId,
  brief: t.brief,
  cwd: record.workspace ?? f.run.workspace,
  harness: step.harness,
  priority: MOMENTUM,
  labels: stepLabels(f.run, step),
  ...localFields(step, () => ({
    config: filedConfig(step, f.reads.steps, f.run, {
      model: tryModel(step, record, r),
      budgetUsd: t.budgetUsd,
      ...filedAt(f.run),
      own: t.told.own,
      landingDenied: () => t.told.words?.denied ?? [],
    }),
    resumeFrom: t.resumeFrom,
    ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
    closeoutSchema: closeoutSchemaOf(step, f.reads.steps),
  })),
  deadlineSeconds: step.deadlineSeconds,
});

/**
 * File the rounds due (the assessment's `round`), in order, until the pass may file no more: answers with the looping steps it took round.
 */
export const fileRounds = Effect.fn('fileRounds')(function* (f: Filing, round: readonly Round[]) {
  const looped: string[] = [];
  for (const r of round) {
    if (!f.mayFile()) break;
    yield* fileRound(f, r, looped).pipe(forStep(f.run, stepNamed(f, r.target)));
  }
  return looped;
});

/**
 * File one round: close the target's task held open first, say it, file the target's next try where the engine does not hold it, and move
 * the loop on (`roundFiled`). Nothing but the note where the engine refuses the close.
 */
const fileRound = Effect.fnUntraced(function* (f: Filing, r: Round, looped: string[]) {
  const { e, run, notes } = f;
  const looping = stepNamed(f, r.step);
  const target = stepNamed(f, r.target);
  const landing = placeTold(run, target, yield* PlaceService, f.heads?.());
  const record = run.steps[r.target];
  const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
  const refused = yield* closeFirst(f, r.target, record.taskId);
  if (refused) {
    notes.push(refused);
    return;
  }
  looped.push(r.step);
  notes.push(roundFiledNote(r, looping));
  if (!(yield* asked('view', e.view(taskId))).state.brief) {
    const said = {
      words: landing.words,
      say: landing.say,
      landing: yield* landingOf(f, r),
      costs: yield* costsFor(f, target, Boolean(record.taskId && sessionIn(f.reads.views, record.taskId))),
    };
    yield* asked('file', e.file(roundSpec(f, r, looping, target, taskId, said)));
  }
  Object.assign(run.steps, roundFiled(f.reads.steps, run, r, taskId));
  if (r.merge && isRepositoryRun(run)) run.baseRef = r.merge.sha;
});

/**
 * What the ending's check said of the merged tree it refused, for a merge asked on that refusal (`MergeOf.landing`), read off the check's
 * task with the command the run froze (`landingSaidRead`) — or undefined for any other round.
 */
const landingOf = Effect.fnUntraced(function* (f: Filing, r: Round) {
  const landing = r.merge?.landing;
  const command = landing && f.reads.steps.find((s) => s.name === landing.step)?.check;
  if (!landing || !command) return undefined;
  return yield* landingSaidRead(landing.step, command, landing.check).pipe(over(asRead(f)));
});

/**
 * A round's target filed under its next try's id: its session continued, told the round — and what the ending's check said of a merged
 * tree it refused (`said.landing`), and for a new session, what recent runs cost (`said.costs`) — with its cap for the round.
 */
function roundSpec(
  f: Filing,
  r: Round,
  looping: Workflow,
  target: Workflow,
  taskId: string,
  said: PlaceTold & { landing?: LandingSaid; costs?: WorkflowCosts },
): Spec {
  const { run, reads } = f;
  const record = run.steps[r.target];
  const files = artifactsDir(run, r.target);
  fs.mkdirSync(files, { recursive: true });
  const resumeFrom = record.taskId ? sessionIn(reads.views, record.taskId) : undefined;
  const told = toldOf(run, target);
  return {
    id: taskId,
    /** Read off the closeout that asked for the round, before the record moves it behind (`roundFiled`). */
    brief: composeBrief(
      told.step,
      run,
      reads.steps,
      reads.signedOff,
      files,
      undefined,
      undefined,
      {
        ...roundBriefed(r, looping, said.landing),
        resumed: Boolean(resumeFrom),
        ...(resumeFrom ? { said: saidIn(reads.views.get(record.taskId!)) } : {}),
      },
      undefined,
      inputsDir(run),
      undefined,
      foldersTold(run, reads, told.step),
      said.costs,
      { words: said.words, say: said.say },
    ),
    cwd: record.workspace ?? run.workspace,
    harness: target.harness,
    priority: MOMENTUM,
    labels: stepLabels(run, target),
    ...localFields(target, () => ({
      config: filedConfig(target, reads.steps, run, {
        model: sessionModel(target, record),
        ...filedAt(run),
        budgetUsd: budgetUsdFor(
          r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record),
          stepSpend(run, r.target, reads.spendOf),
        ),
        own: told.own,
        landingDenied: () => said.words?.denied ?? [],
      }),
      resumeFrom,
      ...(holdsOpenOn(target) ? { holdOpen: true as const } : {}),
      closeoutSchema: closeoutSchemaOf(target, reads.steps),
    })),
    deadlineSeconds: target.deadlineSeconds,
  };
}

/** File the checks of these steps, in order, until the pass may file no more: answers with the steps whose checks are on the record. */
export const fileChecks = Effect.fn('fileChecks')(function* (f: Filing, names: readonly string[]) {
  const checked: string[] = [];
  for (const name of names) {
    if (!f.mayFile()) break;
    yield* fileCheck(f, name).pipe(forStep(f.run, stepNamed(f, name)));
    checked.push(name);
  }
  return checked;
});

/**
 * File a step's check where the engine does not hold it, on the `check` harness, with the command the run froze and a deadline, a landing's
 * its own, and put it on the record: an ending's installs first what the staged merge's lockfile asks for (`checkoutParts`), and says so.
 * A check filed is noted to the pass's meter by what it belongs to (`noteFiledCheck`), never its run.
 */
const fileCheck = Effect.fnUntraced(function* (f: Filing, name: string) {
  const { e, run } = f;
  const step = stepNamed(f, name);
  const workspace = run.steps[name].workspace ?? run.workspace;
  const taskId = checkTaskId(run, name);
  if (!(yield* asked('view', e.view(taskId))).state.brief) {
    fs.mkdirSync(path.dirname(checkCloseout(taskId)), { recursive: true });
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const lands = isRepositoryRun(run) && landsOnCheck(step, run);
    const install = lands ? (checkoutParts(workspace) ?? undefined) : undefined;
    const closeout = f.reads.signedOff(name);
    if (install)
      f.notes.push(
        `${name}: the merge's package-lock.json asks for ${install}, which the checkout's node_modules does not have: its check runs npm install there first`,
      );
    const env = checkEnvOf(run, step, { workspace, files, closeout: closeout && writeCheckCloseout(taskId, closeout) });
    yield* asked(
      'file',
      e.file({
        id: taskId,
        harness: 'check',
        priority: MOMENTUM,
        brief: step.check!,
        cwd: workspace,
        deadlineSeconds: lands ? LANDING_CHECK_DEADLINE_SECONDS : CHECK_DEADLINE_SECONDS,
        config: { command: checkArgv(step.check!, install !== undefined), env, niceness: CHECK_NICENESS },
      }),
    );
    const { factory, workflow } = keysOf(run);
    noteFiledCheck({ factory, workflow, step: name, agent: step.agent?.name ?? '' });
  }
  run.steps[name] = { ...run.steps[name], check: { taskId } };
});

/**
 * File the ready steps, in order, until the pass may file no more, each in the workspace cut for it: answers with the steps filed. A run
 * that waited on runs, on the pass that files its roots, moves its base to its branch as the pass read it (`Filing.heads`), and keeps it
 * where the pass did not; and a run that waited on runs or was handed runs as context reads what they concluded, where their branches
 * stand read through `git` (`handedOf`).
 */
export const fileReady = Effect.fn('fileReady')(function* (f: Filing, ready: readonly string[], starting: boolean, git: BranchReader) {
  const { e, run } = f;
  if (ready.length && starting && run.after?.length && isRepositoryRun(run)) run.baseRef = f.heads?.()?.[run.branch] || run.baseRef;
  const parents = ready.length && starting ? yield* handedOf(e, run, git) : undefined;
  const filed: string[] = [];
  const placed = yield* PlaceService;
  for (const name of ready) {
    if (!f.mayFile()) break;
    const step = stepNamed(f, name);
    const landing = placeTold(run, step, placed, f.heads?.());
    const made = yield* withinEffect('act', workspaceFor(run, f.reads.steps, step, placed));
    f.notes.push(...cutNotes(name, made));
    if (!('cut' in made)) continue;
    const place = made.cut;
    if (!f.mayFile()) break;
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const checked = isRemoteHarness(step.harness) ? [] : yield* checksHandedRead(run, f.reads.steps, step).pipe(over(asRead(f)));
    const told = {
      parents,
      checked,
      closeoutOf: yield* closeoutsAfterMerge(e, run, step, f.reads.signedOff),
      costs: yield* costsFor(f, step, false),
      words: landing.words,
      say: landing.say,
    };
    const taskId = yield* asked('file', e.file(readySpec(f, step, place, files, told))).pipe(forStep(run, step));
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  return filed;
});

/** The session of the step a step resumes, off its current task: undefined for a step with none. */
const sessionOf = (f: Filing, stepName: string): string | undefined => {
  const taskId = f.run.steps[stepName]?.taskId;
  return taskId ? sessionIn(f.reads.views, taskId) : undefined;
};

/**
 * A ready step as it is filed, in the workspace cut for it, told what the steps before it, their checks and the runs it waited on said,
 * and what recent runs of its workflow cost where it reads them.
 */
function readySpec(
  f: Filing,
  step: Workflow,
  place: Cut,
  files: string,
  said: PlaceTold & {
    parents: ParentCloseout[] | undefined;
    checked: readonly CheckHanded[];
    closeoutOf: (step: string) => Closeout | undefined;
    costs: WorkflowCosts | undefined;
  },
): Spec {
  const { parents, closeoutOf } = said;
  const { run, reads } = f;
  const told = toldOf(run, step);
  return {
    /**
     * Chosen, not generated (`stepTaskId`): a person scanning their sessions sees which run and which step, two steps of one run share a
     * prefix, and a step filed on a later try or round says which.
     */
    id: stepTaskId(run, step.name, tryOf(run, step.name)),
    /**
     * Read off the closeouts the assessment that made the step ready read, so it is handed what it was filed on; a remote agent's names
     * nothing of this machine (`remoteBrief`).
     */
    brief: isRemoteHarness(step.harness)
      ? remoteBrief(step, run, reads.steps, closeoutOf, undefined, step.after.length ? undefined : parents)
      : composeBrief(
          told.step,
          run,
          reads.steps,
          closeoutOf,
          files,
          place.deps,
          undefined,
          undefined,
          step.after.length ? undefined : parents,
          inputsDir(run),
          said.checked,
          foldersTold(run, reads, told.step),
          said.costs,
          { words: said.words, say: said.say },
          place.merge,
        ),
    cwd: place.workspace,
    harness: step.harness,
    priority: stepMomentum(step),
    labels: stepLabels(run, step),
    deadlineSeconds: step.deadlineSeconds,
    ...localFields(step, () => ({
      config: filedConfig(step, reads.steps, run, {
        model: step.model,
        ...filedAt(run),
        budgetUsd: budgetUsdFor(budgetOf(step, run.steps[step.name]), stepSpend(run, step.name, reads.spendOf)),
        own: told.own,
        landingDenied: () => said.words?.denied ?? [],
      }),
      resumeFrom: step.resume ? sessionOf(f, step.resume) : undefined,
      ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
      /**
       * The engine hands it to the harness and records the answer without reading it: what the fields mean is this package's (`Closeout`).
       */
      closeoutSchema: closeoutSchemaOf(step, reads.steps),
    })),
  };
}
