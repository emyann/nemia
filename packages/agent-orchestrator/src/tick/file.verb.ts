/**
 * What a pass files, and what it files a step with: the tries due (`fileTries`), the rounds (`fileRounds`), the checks (`fileChecks`) and
 * the ready steps (`fileReady`), in the order `advanceRun` calls them, each under the id the run derives and asking the store first
 * whether it may file (`mayFileOf`), a nudge answering a task held open through `answerHeld` (`held.verb.ts`); the fields of a filing
 * that only a local harness reads (`localFields`), the step as it is told (`toldOf`), and what each run it waited on concluded
 * (`parentCloseouts`). A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ClaudeFlags, CodexArgs, Engine, TaskView } from '../runtime-client.ts';
import { CHECK_DEADLINE_SECONDS, CHECK_NICENESS, checkArgv, type CheckEnv, type CheckHanded, type Verdict } from '../check/check.ts';
import { isRemoteHarness, modeOf, sessionContext, type Workflow } from '../workflow.ts';
import { resultSteps } from '../branches/branches.ts';
import { filedDenies } from '../ending/ending.ts';
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
  ownStatus,
  sentBack,
  stepSpend,
  triedFrom,
  type Round,
  type RoundAsk,
  type SpendOf,
} from '../status/status.ts';
import { composeBrief, remoteBrief, type EndingStopped, type ParentCloseout, type ParentStep, type RetryBriefing } from '../brief/index.ts';
import { roundFiled } from '../round/round.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from '../closeout/closeout.ts';
import { modeWord, nextTry, sessionModel, type Retry, type RetryAsk } from '../retry/index.ts';
import { artifactsDir, inputsDir, stepsOf } from '../record/record.store.ts';
import { runStore } from '../record/files.store.ts';
import { checkCloseout, writeCheckCloseout } from '../check/check.store.ts';
import { checkoutParts, gitSays, realRepoOf, workspaceFor } from '../workspace/worktree.store.ts';
import { agentFilesDir, renderedIn, skillsAgain } from '../agents/agents.store.ts';
import { checksHandedOf, closeoutOf, refusalOf, reportedEngine, saidIn, sessionIn } from '../views/views.verb.ts';
import { phaseOfView } from '../views/views-words.ts';
import { placesOf } from '../start/start.verb.ts';
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
 * `wf start` rendered them (`rendersAgent`, `renderedFlags`); a step it does not render — a codex step, a record that gives no agent — is
 * filed with no flags and told everything in its brief. Where the rendered folder is not there as its flags name it (`unrendered`,
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
  const rendered = renderedFlags(told, dir);
  const repo = step.harness === 'codex' ? realRepoOf(run) : undefined;
  const codex = repo === undefined ? undefined : { trustFrom: repo };
  return { step: told, own: { claude: told.remote ? { remoteControl: true, ...rendered } : rendered, ...(codex ? { codex } : {}) } };
}

/**
 * What each run this one waited on concluded, for its roots' briefs (`## From run <id>` in `composeBrief`): the first line of its brief,
 * and the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as
 * `wf decide` reads one (`closeoutOf`). Read once, on the pass that files the roots.
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
export async function parentCloseouts(e: Engine, ids: readonly string[]): Promise<ParentCloseout[]> {
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
      let view: TaskView;
      try {
        view = await e.view(taskId);
      } catch (err) {
        said.push({ name: step.name, unreadable: `the engine could not be asked for its task ${taskId}: ${(err as Error).message}` });
        continue;
      }
      const c = closeoutOf(new Map([[taskId, view]]), record, step.name);
      if (!c)
        said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0], steps: said });
  }
  return out;
}

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
  closeWaiting: (name: string, taskId: string) => Promise<string | undefined>;
  awaitsWord: (taskId: string | null | undefined) => boolean;
};

/**
 * One pass's filing: the engine, the run, what the pass read (`PassReads`), its closer (`Closer`), whether it may file still (`mayFile`,
 * made by `mayFileOf` once a pass), and the pass's notes, which each filing adds to in the order it runs.
 */
export type Filing = { e: Engine; run: Run; reads: PassReads; closer: Closer; mayFile: () => boolean; notes: string[] };

/**
 * Whether a pass may file for this run still, read off the store before each filing: not once the run is called off, forgotten, pruned
 * or held while the pass was at work. Once it has said no it says no for the rest of the pass, whatever the store reads after.
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
const closeFirst = async (f: Filing, name: string, taskId: string | null | undefined): Promise<string | undefined> =>
  f.closer.awaitsWord(taskId) ? f.closer.closeWaiting(name, taskId!) : undefined;

/** The steps a pass tried again, and those of them whose try is a recheck, whose checks are filed with the others. */
type Tried = { tried: string[]; rechecked: string[] };

/**
 * File the tries due (the assessment's `retry`), in order: each a recheck, a stop of a session not settled, an answer to the task held
 * open (`answerHeld`), or a task of its own. Answers with the steps tried and those rechecked.
 */
export async function fileTries(f: Filing, retry: readonly Retry[]): Promise<Tried> {
  const out: Tried = { tried: [], rechecked: [] };
  for (const r of retry) await fileTry(f, r, out);
  return out;
}

/**
 * Ask the engine once to stop a try's session its harness blocked, or that runs on: the try is filed by a pass once it has settled. A stop
 * the engine refuses (`stopAsked`) is said, and the try waits for the same settling.
 */
async function stopFirst(f: Filing, r: Retry, taskId: string): Promise<void> {
  if (f.reads.views.get(taskId)?.state.stopRequested) return;
  const refused = await stopAsked(f.e, taskId);
  const why = r.runsOn ? 'its session runs on, asked for while its harness had blocked it' : 'its harness blocked its session';
  const asked = refused
    ? `but the engine did not take the stop (${refused}), and the try is filed once it has settled`
    : 'so the engine is asked to stop it, and the try is filed once it has';
  f.notes.push(`${r.step}: try ${r.try} — wf retry ${modeWord(r)}${r.message !== undefined ? ', with your answer' : ''}; ${why}, ${asked}`);
}

/** The note that says a try, and on whose word: `retries:`, a nudge to sign off, or `wf retry` and what it was typed with. */
const tryWord = (r: Retry, step: Workflow): string =>
  `${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : r.by === 'signoff' ? 'a nudge to sign off, once a round' : `wf retry ${modeWord(r)}${r.budget !== undefined ? ` --budget ${r.budget}` : ''}${r.message !== undefined ? ', with your answer' : ''}`}`;

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
async function fileTry(f: Filing, r: Retry, out: Tried): Promise<void> {
  const { run, notes } = f;
  const step = stepNamed(f, r.step);
  const record = run.steps[r.step];
  if (r.stopFirst) return stopFirst(f, r, record.taskId!);
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
  const closeRefused = answers ? undefined : await closeFirst(f, r.step, record.taskId);
  if (closeRefused) {
    notes.push(closeRefused);
    return;
  }
  const taskId = answers ? record.taskId! : stepTaskId(run, r.step, r.try);
  const refused = answers || !(await f.e.view(taskId)).state.brief ? await sendTry(f, r, step, taskId, answers) : undefined;
  if (refused) {
    notes.push(`${r.step}: ${refused}`);
    return;
  }
  out.tried.push(r.step);
  notes.push(said);
  run.steps[r.step] = nextTry(record, r, taskId);
  for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]);
}

/**
 * Send a try to the engine: filed as a task of its own, or given as the answer to the task held open (`answers`). Answers with the
 * engine's refusal of the answer, or undefined.
 */
async function sendTry(f: Filing, r: Retry, step: Workflow, taskId: string, answers: boolean): Promise<string | undefined> {
  const { e, run, reads } = f;
  const record = run.steps[r.step];
  const files = artifactsDir(run, r.step);
  fs.mkdirSync(files, { recursive: true });
  const remote = isRemoteHarness(step.harness);
  const resumeFrom = r.mode === 'nudge' && !remote ? sessionIn(reads.views, record.taskId!) : undefined;
  const refusal = record.check && step.check ? await refusalOf(asRead(f), step.check, record.check.taskId) : undefined;
  const closeouts = await askingReads(f, r, resumeFrom);
  const checked = remote ? [] : await checksHandedOf(asRead(f), run, reads.steps, step);
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
      );
  const budgetUsd = budgetUsdFor(step, r.budget ?? budgetOf(step, record), stepSpend(run, r.step, reads.spendOf));
  if (answers) return answerHeld(e, taskId, brief, budgetUsd);
  await e.file(trySpec(f, r, step, record, { taskId, brief, resumeFrom, budgetUsd, told }));
  return undefined;
}

/**
 * How a try's brief reads the closeouts: a new session of a loop's target within a round reads the looping step's off the try that asked
 * for the round (`askingTry`), and every other as it signed.
 */
async function askingReads(f: Filing, r: Retry, resumeFrom: string | undefined): Promise<(name: string) => Closeout | undefined> {
  const { e, run, reads } = f;
  const asking = resumeFrom ? undefined : askingTry(reads.steps, run, r.step);
  const askedWith = asking ? (await e.view(asking.taskId)).state.attempts.at(-1)?.closeout : undefined;
  const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
  return (name: string): Closeout | undefined =>
    asking && name === asking.looping.name && findings && !('error' in findings) ? findings : reads.signedOff(name);
}

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
  ...localFields(step, () => ({
    config: {
      /** A fresh try runs on the model it asked for, or the step's; any other try on the model its session was started on. */
      model: r.mode === 'fresh' ? (r.model ?? step.model) : sessionModel(step, record),
      effort: step.effort,
      contextTokens: sessionContext(step, f.reads.steps),
      permissionMode: modeOf(step),
      tools: step.tools,
      disallowedTools: filedDenies(step, f.run),
      allowedTools: step.allowedTools,
      background: step.background,
      budgetUsd: t.budgetUsd,
      ...t.told.own,
    },
    resumeFrom: t.resumeFrom,
    ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
    closeoutSchema: closeoutSchemaOf(step, f.reads.steps),
  })),
  deadlineSeconds: step.deadlineSeconds,
});

/**
 * File the rounds due (the assessment's `round`), in order, until the pass may file no more: answers with the looping steps it took round.
 */
export async function fileRounds(f: Filing, round: readonly Round[]): Promise<string[]> {
  const looped: string[] = [];
  for (const r of round) {
    if (!f.mayFile()) break;
    await fileRound(f, r, looped);
  }
  return looped;
}

/**
 * File one round: close the target's task held open first, say it, file the target's next try where the engine does not hold it, and move
 * the loop on (`roundFiled`). Nothing but the note where the engine refuses the close.
 */
async function fileRound(f: Filing, r: Round, looped: string[]): Promise<void> {
  const { e, run, notes } = f;
  const looping = stepNamed(f, r.step);
  const record = run.steps[r.target];
  const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
  const refused = await closeFirst(f, r.target, record.taskId);
  if (refused) {
    notes.push(refused);
    return;
  }
  looped.push(r.step);
  notes.push(
    `${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `wf round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`,
  );
  if (!(await e.view(taskId)).state.brief) await e.file(roundSpec(f, r, looping, stepNamed(f, r.target), taskId));
  Object.assign(run.steps, roundFiled(f.reads.steps, run, r, taskId));
}

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
    ),
    cwd: record.workspace ?? run.workspace,
    harness: target.harness,
    ...localFields(target, () => ({
      config: {
        model: sessionModel(target, record),
        effort: target.effort,
        contextTokens: sessionContext(target, reads.steps),
        permissionMode: modeOf(target),
        tools: target.tools,
        disallowedTools: filedDenies(target, run),
        allowedTools: target.allowedTools,
        background: target.background,
        budgetUsd: budgetUsdFor(
          target,
          r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record),
          stepSpend(run, r.target, reads.spendOf),
        ),
        ...told.own,
      },
      resumeFrom,
      ...(holdsOpenOn(target) ? { holdOpen: true as const } : {}),
      closeoutSchema: closeoutSchemaOf(target, reads.steps),
    })),
    deadlineSeconds: target.deadlineSeconds,
  };
}

/** File the checks of these steps, in order, until the pass may file no more: answers with the steps whose checks are on the record. */
export async function fileChecks(f: Filing, names: readonly string[]): Promise<string[]> {
  const checked: string[] = [];
  for (const name of names) {
    if (!f.mayFile()) break;
    await fileCheck(f, name);
    checked.push(name);
  }
  return checked;
}

/**
 * File a step's check where the engine does not hold it, on the `check` harness, with the command the run froze and a deadline, and put it
 * on the record: an ending's installs first what the staged merge's lockfile asks for (`checkoutParts`), and says so.
 */
async function fileCheck(f: Filing, name: string): Promise<void> {
  const { e, run } = f;
  const step = stepNamed(f, name);
  const workspace = run.steps[name].workspace ?? run.workspace;
  const taskId = checkTaskId(run, name);
  if (!(await e.view(taskId)).state.brief) {
    fs.mkdirSync(path.dirname(checkCloseout(taskId)), { recursive: true });
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const install = isGitRun(run) && landsOnCheck(step, run) ? (checkoutParts(workspace) ?? undefined) : undefined;
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
    await e.file({
      id: taskId,
      harness: 'check',
      brief: step.check!,
      cwd: workspace,
      deadlineSeconds: CHECK_DEADLINE_SECONDS,
      config: { command: checkArgv(step.check!, install !== undefined), env, niceness: CHECK_NICENESS },
    });
  }
  run.steps[name] = { ...run.steps[name], check: { taskId } };
}

/** Where a step is filed and what it depends on, as its workspace was cut (`workspaceFor`). */
type Place = Awaited<ReturnType<typeof workspaceFor>>;

/**
 * File the ready steps, in order, until the pass may file no more, each in the workspace cut for it: answers with the steps filed. A run
 * that waited on runs, on the pass that files its roots, moves its base to its branch as it stands and reads what they concluded
 * (`parentCloseouts`).
 */
export async function fileReady(f: Filing, ready: readonly string[], starting: boolean): Promise<string[]> {
  const { e, run } = f;
  if (ready.length && starting && run.after?.length && isGitRun(run))
    run.baseRef = gitSays(run.repo, 'rev-parse', '--verify', `${run.branch}^{commit}`)?.trim() || run.baseRef;
  const parents = ready.length && starting && run.after?.length ? await parentCloseouts(e, run.after) : undefined;
  const filed: string[] = [];
  for (const name of ready) {
    if (!f.mayFile()) break;
    const step = stepNamed(f, name);
    const place = await within('act', () => workspaceFor(run, f.reads.steps, step));
    f.notes.push(...place.notes.map((note) => `${name}: ${note}`));
    if (!f.mayFile()) break;
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });
    const checked = isRemoteHarness(step.harness) ? [] : await checksHandedOf(asRead(f), run, f.reads.steps, step);
    const taskId = await e.file(readySpec(f, step, place, files, { parents, checked }));
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  return filed;
}

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
        ),
    cwd: place.workspace,
    harness: step.harness,
    deadlineSeconds: step.deadlineSeconds,
    ...localFields(step, () => ({
      /**
       * The harness's arguments, which the engine carries to the runner unread (`HarnessArgs`), all from the workflow this run froze. The
       * runtime judges no budget: `budgetUsd` is the harness's own cap, and whether the step went over is this package's (`ownStatus`).
       */
      config: {
        model: step.model,
        effort: step.effort,
        contextTokens: sessionContext(step, reads.steps),
        permissionMode: modeOf(step),
        tools: step.tools,
        disallowedTools: filedDenies(step, run),
        allowedTools: step.allowedTools,
        background: step.background,
        budgetUsd: budgetUsdFor(step, budgetOf(step, run.steps[step.name]), stepSpend(run, step.name, reads.spendOf)),
        ...told.own,
      },
      resumeFrom: step.resume ? sessionOf(f, step.resume) : undefined,
      ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
      /**
       * The engine hands it to the harness and records the answer without reading it: what the fields mean is this package's (`Closeout`).
       */
      closeoutSchema: closeoutSchemaOf(step, reads.steps),
    })),
  };
}
