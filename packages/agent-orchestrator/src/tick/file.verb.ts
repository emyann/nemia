/**
 * What a pass files, and what it files a step with: the tries due (`fileTries`), the rounds (`fileRounds`), the checks (`fileChecks`) and
 * the ready steps (`fileReady`), in the order `advanceRun` calls them, each under the id the run derives and asking the store first
 * whether it may file (`mayFileOf`), a nudge answering a task held open through `answerHeld` (`held.verb.ts`); the fields of a filing
 * that only a local harness reads (`localFields`), the step as it is told (`toldOf`), and what each run it waited on concluded
 * (`parentCloseouts`). A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { Cause, Effect, Exit } from 'effect';
import { asked, awaited, over, type ClaudeFlags, type CodexArgs, type Engine, type TaskView } from '../runtime-client.ts';
import {
  CHECK_DEADLINE_SECONDS,
  CHECK_NICENESS,
  checkArgv,
  LANDING_CHECK_DEADLINE_SECONDS,
  type CheckEnv,
  type CheckHanded,
  type Verdict,
} from '../check/check.ts';
import { isRemoteHarness, type Workflow } from '../workflow.ts';
import { resultSteps } from '../branches/branches.ts';
import { holdsOpen } from '../gate/gate.ts';
import {
  checkTaskId,
  isGitRun,
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
  capOf,
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
import { composeBrief, remoteBrief, type EndingStopped, type ParentCloseout, type ParentStep, type RetryBriefing } from '../brief/index.ts';
import { roundFiled } from '../round/round.ts';
import { filedConfig, readsMounts, tryModel } from '../filed/filed.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from '../closeout/closeout.ts';
import { modeWord, nextTry, sessionModel, tryWord, type Retry, type RetryAsk } from '../retry/index.ts';
import { artifactsDir, inputsDir, stepsOf } from '../record/record.store.ts';
import { inboxDir, runStore } from '../record/files.store.ts';
import { checkCloseout, writeCheckCloseout } from '../check/check.store.ts';
import { checkoutParts, gitSays, realRepoOf, workspaceFor } from '../workspace/worktree.store.ts';
import { agentFilesDir, renderedIn, skillsAgain } from '../agents/agents.store.ts';
import { checksHandedRead, closeoutOf, refusalRead, reportedEngine, saidIn, sessionIn } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { placesOf } from '../folder/lookup.store.ts';
import { skillsFor } from '../folder/folder.store.ts';
import { renderedFlags, rendersAgent, unrendered } from '../agents/agents.ts';
import { within } from '../meter/tally.store.ts';
import { answerHeld, stopAsked } from './held.verb.ts';

/**
 * What a filing says of how its session runs — the harness's arguments, a session to continue, a hold and a closing statement's schema —
 * for a step on a local harness, and nothing for one on a remote A2A agent (`harness: a2a:<name>`), which runs as its operator configured
 * it. The runtime refuses a `config` with any key in it, one whose value is undefined included (`remoteRefuses`), so the fields are left
 * out, not emptied; and a try of a remote step is a new Task, never a turn of the last one.
 */
export const localFields = <T extends object>(step: Workflow, fields: () => T): T | Record<string, never> =>
  isRemoteHarness(step.harness) ? {} : fields();

/**
 * A step as the tick tells it and files it: with its agent's instructions in Claude Code's prompt and its skills in a plugin, where
 * `nemia start` rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent —
 * is filed with no flags and told everything in its brief. Where the rendered folder is not there as its flags name it (`unrendered`,
 * `renderedIn`) — gone, or rendered under the plugin's former name — a flag naming a file that is not there would end the session at its
 * start, so its brief tells it its skills whole, read again from where a start of this run's folder finds them (`skillsAgain`). Bridged to
 * claude.ai, where anyone signed in can drive it, only when the step says `remote: true`, never by default: as Claude Code's own flag,
 * first among its others (`claude.remoteControl`). A codex step of a repository run is filed with its repository's real path as the
 * directory Codex's trust extends from (`codex.trustFrom`), so a `--repo` given through a symlink names what the operator's Codex config
 * lists; a folder run has no repository, and a step on another harness takes no Codex arguments, so either is filed with none, as is one
 * whose repository is no longer there to resolve (`realRepoOf`). Both are the harness's own arguments (`own`), which the first filing, a
 * try and a round each spread into its `config`.
 */
export function toldOf(run: Run, step: Workflow): { step: Workflow; own: { claude?: ClaudeFlags; codex?: CodexArgs } } {
  const dir = agentFilesDir(run, step.name);
  const told =
    rendersAgent(step) && !renderedIn(dir, step)
      ? unrendered(step, step.agent?.skills?.length ? skillsAgain(step, skillsFor(run.workflowDir, placesOf(run.repo))) : [])
      : step;
  return { step: told, own: ownOf(told, renderedFlags(told, dir), () => realRepoOf(run)) };
}

/**
 * The harness's own arguments a step is filed with (`toldOf`), off the flags its agent rendered to and its repository's real path, which
 * is asked only of a step whose harness takes it. Pure but for `repoOf`.
 */
export const ownOf = (step: Workflow, rendered: ClaudeFlags | undefined, repoOf: () => string | undefined) => {
  const repo = step.harness === 'codex' ? repoOf() : undefined;
  return {
    claude: step.remote ? { remoteControl: true as const, ...rendered } : rendered,
    ...(repo === undefined ? {} : { codex: { trustFrom: repo } }),
  };
};

/**
 * What each run this one waited on concluded, for its roots' briefs (`## From run <id>` in `composeBrief`): the first line of its brief,
 * and the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as
 * `nemia decide` reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: main`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * It never throws: a parent whose record or workflow does not read, a step never filed, a task the engine holds
 * no closeout for — a failed step whose work a person merged all the same — and a closeout that does not parse each say so in the section,
 * and the roots are filed all the same.
 */
export const parentCloseouts = Effect.fn('parentCloseouts')(function* (e: Engine, ids: readonly string[]) {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = runStore.runs.read(id);
      steps = stepsOf(record);
    } catch (err) {
      out.push({ run: id, unreadable: `its record cannot be read: ${(err as Error).message}` });
      continue;
    }
    const said: ParentStep[] = [];
    for (const step of resultSteps(steps)) {
      const taskId = record.steps[step.name]?.taskId;
      if (!taskId) {
        said.push({ name: step.name, unreadable: 'it was never filed' });
        continue;
      }
      const viewed = yield* Effect.exit(asked('view', e.view(taskId)));
      if (Exit.isFailure(viewed)) {
        const err = Cause.squash(viewed.cause);
        said.push({ name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${(err as Error).message}` });
        continue;
      }
      const view: TaskView = viewed.value;
      const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
      if (!c)
        said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0], steps: said });
  }
  return out;
});

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
 * One pass's filing: the engine, the run, what the pass read (`PassReads`), its closer (`Closer`), whether it may file still (`mayFile`,
 * made by `mayFileOf` once a pass), and the pass's notes, which each filing adds to in the order it runs.
 */
export type Filing = { e: Engine; run: Run; reads: PassReads; closer: Closer; mayFile: () => boolean; notes: string[] };

/**
 * Whether a pass may file for this run still, read off the store before each filing: not once the run is called off, forgotten, pruned
 * or held, or the store paused, while the pass was at work. Once it has said no it says no for the rest of the pass, whatever the store
 * reads after.
 */
export const mayFileOf = (run: Run): (() => boolean) => {
  let calledOff = false;
  return () => !(calledOff ||= !runStore.runs.exists(run.id) || runStore.runs.calledOff(run.id));
};

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
  for (const r of retry) yield* fileTry(f, r, out);
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
  const answers = answersHeld(f, r, step, record);
  const closeRefused = answers ? undefined : yield* closeFirst(f, r.step, record.taskId);
  if (closeRefused) {
    notes.push(closeRefused);
    return;
  }
  const taskId = answers ? record.taskId! : stepTaskId(run, r.step, r.try);
  const briefed = answers ? undefined : (yield* asked('view', f.e.view(taskId))).state.brief;
  const refused = answers || !briefed ? yield* sendTry(f, r, step, taskId, answers) : undefined;
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
 * Send a try to the engine: filed as a task of its own, or given as the answer to the task held open (`answers`). Answers with the
 * engine's refusal of the answer, or undefined.
 */
const sendTry = Effect.fnUntraced(function* (f: Filing, r: Retry, step: Workflow, taskId: string, answers: boolean) {
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
  const told = toldOf(run, step);
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
        readsMounts(told.step, inboxDir()),
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
    onto: isGitRun(run) ? run.branch : 'the base branch',
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
  resumed: Boolean(t.resumeFrom),
  ...(t.resumeFrom ? { said: saidIn(f.reads.views.get(record.taskId!)) } : {}),
  status: t.status,
  ...(t.refusal ? { refusal: t.refusal } : {}),
  ...(t.status === 'denied' ? { denied: f.reads.spendOf(record.taskId!)?.denied ?? [] } : {}),
  ...(r.back?.length ? { ending: endingSaid(f, stepNamed(f, r.back[0])) } : {}),
});

/** A try filed as a task of its own, in the workspace the step had, with its brief, its session to continue and its cap. */
const trySpec = (
  f: Filing,
  r: Retry,
  step: Workflow,
  record: StepRecord,
  t: { taskId: string; brief: string; resumeFrom: string | undefined; budgetUsd: number | undefined; told: ReturnType<typeof toldOf> },
): Spec => ({
  id: t.taskId,
  brief: t.brief,
  cwd: record.workspace ?? f.run.workspace,
  harness: step.harness,
  priority: MOMENTUM,
  ...localFields(step, () => ({
    config: filedConfig(step, f.reads.steps, f.run, {
      model: tryModel(step, record, r),
      budgetUsd: t.budgetUsd,
      runArtifacts: path.dirname(artifactsDir(f.run, step.name)),
      inbox: inboxDir(),
      own: t.told.own,
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
    yield* fileRound(f, r, looped);
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
  const record = run.steps[r.target];
  const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
  const refused = yield* closeFirst(f, r.target, record.taskId);
  if (refused) {
    notes.push(refused);
    return;
  }
  looped.push(r.step);
  notes.push(
    `${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `nemia round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`,
  );
  if (!(yield* asked('view', e.view(taskId))).state.brief)
    yield* asked('file', e.file(roundSpec(f, r, looping, stepNamed(f, r.target), taskId)));
  Object.assign(run.steps, roundFiled(f.reads.steps, run, r, taskId));
});

/** A round's target filed under its next try's id: its session continued, told the round, with its cap for the round. */
function roundSpec(f: Filing, r: Round, looping: Workflow, target: Workflow, taskId: string): Spec {
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
        loop: r.step,
        round: r.round,
        rounds: capOf(looping),
        by: r.by,
        resumed: Boolean(resumeFrom),
        ...(resumeFrom ? { said: saidIn(reads.views.get(record.taskId!)) } : {}),
      },
      undefined,
      inputsDir(run),
      undefined,
      readsMounts(told.step, inboxDir()),
    ),
    cwd: record.workspace ?? run.workspace,
    harness: target.harness,
    priority: MOMENTUM,
    ...localFields(target, () => ({
      config: filedConfig(target, reads.steps, run, {
        model: sessionModel(target, record),
        runArtifacts: path.dirname(artifactsDir(run, target.name)),
        inbox: inboxDir(),
        budgetUsd: budgetUsdFor(
          r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record),
          stepSpend(run, r.target, reads.spendOf),
        ),
        own: told.own,
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
    yield* fileCheck(f, name);
    checked.push(name);
  }
  return checked;
});

/**
 * File a step's check where the engine does not hold it, on the `check` harness, with the command the run froze and a deadline, a landing's
 * its own, and put it on the record: an ending's installs first what the staged merge's lockfile asks for (`checkoutParts`), and says so.
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
    const lands = isGitRun(run) && landsOnCheck(step, run);
    const install = lands ? (checkoutParts(workspace) ?? undefined) : undefined;
    const closeout = f.reads.signedOff(name);
    if (install)
      f.notes.push(
        `${name}: the merge's package-lock.json asks for ${install}, which the checkout's node_modules does not have: its check runs npm install there first`,
      );
    const env: CheckEnv = {
      WF_RUN: run.id,
      WF_STEP: name,
      ...(isGitRun(run) && step.workspace !== 'main' ? { WF_BASE_REF: run.baseRef } : {}),
      WF_WORKSPACE: workspace,
      WF_ARTIFACTS: files,
      ...(closeout ? { WF_CLOSEOUT: writeCheckCloseout(taskId, closeout) } : {}),
    };
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
  }
  run.steps[name] = { ...run.steps[name], check: { taskId } };
});

/** Where a step is filed and what it depends on, as its workspace was cut (`workspaceFor`). */
type Place = Awaited<ReturnType<typeof workspaceFor>>;

/**
 * File the ready steps, in order, until the pass may file no more, each in the workspace cut for it: answers with the steps filed. A run
 * that waited on runs, on the pass that files its roots, moves its base to its branch as it stands and reads what they concluded
 * (`parentCloseouts`).
 */
export const fileReady = Effect.fn('fileReady')(function* (f: Filing, ready: readonly string[], starting: boolean) {
  const { e, run } = f;
  if (ready.length && starting && run.after?.length && isGitRun(run))
    run.baseRef = gitSays(run.repo, 'rev-parse', '--verify', `${run.branch}^{commit}`)?.trim() || run.baseRef;
  const parents = ready.length && starting && run.after?.length ? yield* parentCloseouts(e, run.after) : undefined;
  const filed: string[] = [];
  for (const name of ready) {
    if (!f.mayFile()) break;
    const step = stepNamed(f, name);
    const place = yield* awaited(() => within('act', () => workspaceFor(run, f.reads.steps, step)));
    f.notes.push(...place.notes.map((note) => `${name}: ${note}`));
    if (!f.mayFile()) break;
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const checked = isRemoteHarness(step.harness) ? [] : yield* checksHandedRead(run, f.reads.steps, step).pipe(over(asRead(f)));
    const taskId = yield* asked('file', e.file(readySpec(f, step, place, files, { parents, checked })));
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
 * A ready step as it is filed, in the workspace cut for it, told what the steps before it, their checks and the runs it waited on said.
 */
function readySpec(
  f: Filing,
  step: Workflow,
  place: Place,
  files: string,
  said: { parents: ParentCloseout[] | undefined; checked: readonly CheckHanded[] },
): Spec {
  const { parents } = said;
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
      ? remoteBrief(step, run, reads.steps, reads.signedOff, undefined, step.after.length ? undefined : parents)
      : composeBrief(
          told.step,
          run,
          reads.steps,
          reads.signedOff,
          files,
          place.deps,
          undefined,
          undefined,
          step.after.length ? undefined : parents,
          inputsDir(run),
          said.checked,
          readsMounts(told.step, inboxDir()),
        ),
    cwd: place.workspace,
    harness: step.harness,
    priority: stepMomentum(step),
    deadlineSeconds: step.deadlineSeconds,
    ...localFields(step, () => ({
      config: filedConfig(step, reads.steps, run, {
        model: step.model,
        runArtifacts: path.dirname(artifactsDir(run, step.name)),
        inbox: inboxDir(),
        budgetUsd: budgetUsdFor(budgetOf(step, run.steps[step.name]), stepSpend(run, step.name, reads.spendOf)),
        own: told.own,
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
