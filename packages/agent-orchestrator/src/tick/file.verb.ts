/**
 * What a pass files, and what it files a step with: the tries due (`fileTries`), the rounds (`fileRounds`), the checks (`fileChecks`) and
 * the ready steps (`fileReady`), in the order `advanceRun` calls them, each under the id the run derives and asking the store first
 * whether it may file (`mayFileOf`), a continue answering a task held open through `answerHeld` (`held.verb.ts`); the fields of a filing
 * that only a local harness reads (`localFields`), the step as it is told (`toldOf`, told.verb.ts); what its roots are handed of other runs
 * is `handedOf`'s (`handed.verb.ts`). A controller, reaching the runtime through the client (`runtime-client.ts`).
 */
import type { Refusal } from '../refusal/refusal.ts';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { asked, over, type Engine } from '../runtime-client.ts';
import {
  CHECK_DEADLINE_SECONDS,
  CHECK_NICENESS,
  checkArgv,
  checkEnvOf,
  type CheckHanded,
  type CheckRefusal,
  checksDue,
  currentCheckTask,
  stepChecksDue,
} from '../check/index.ts';
import { isRemoteHarness, type StepSpec } from '../workflow.ts';
import { checkLine, SHORTHAND_CHECK, stepChecks, type CheckSpec } from '../step/step.ts';
import { holdsOpen } from '../gate/gate.ts';
import { standingOfCondition, writtenFor } from '../condition/condition.ts';
import { checkTaskId, isRepositoryRun, stepTaskId, tryOf, type Run, type StepRecord, type StepStatus } from '../record/record.ts';
import {
  askingTry,
  budgetOf,
  budgetUsdFor,
  holdsOpenOn,
  ASKED_PRIORITY,
  MOMENTUM,
  stepMomentum,
  stepSpend,
  triedFrom,
  type Round,
} from '../status/status.ts';
import { composeBrief, remoteBrief, type ParentCloseout, type RetryBriefing } from '../brief/index.ts';
import type { Provisioned } from '../workspace/workspace.ts';
import { handedOf } from '../brief/handed.verb.ts';
import { roundBriefed, roundFiled, roundFiledNote } from '../round/round.ts';
import { closeoutsAfterMerge } from '../merge/merge.verb.ts';
import { filedConfig, SESSION_TOKEN, tryModel } from '../filed/filed.ts';
import { filedOn, resumeOn } from '../pinned/pinned.ts';
import { heldLine, picturesFiled, type PicturesFiled } from '../filed/pictures/pictures.store.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from '../closeout/index.ts';
import { modeWord, nextTry, sessionModel, tryWord, type Retry } from '../retry/index.ts';
import { artifactsDir, inputsDir } from '../record/record.store.ts';
import { carriedFilesDir, workflowFilesDir } from '../frozen/frozen.store.ts';
import { checkCloseout, writeCheckCloseout, writeCheckOutputs } from '../check/check.store.ts';
import {
  cutNotes,
  keepWorktreeInstalled,
  reinstalledNotes,
  workspaceFor,
  type Cut,
  type Reinstalled,
} from '../workspace/worktree.store.ts';
import { checksHandedRead, refusalWholeRead, reportedEngine, saidIn, sessionIn } from '../views/views.verb.ts';
import { noteFiledCheck, withinEffect } from '../meter/tally.store.ts';
import { PlaceService } from '../place/place.store.ts';
import { keysOf } from '../stats/index.ts';
import type { WorkflowCosts } from '../costs/index.ts';
import { costsRead } from '../costs/costs.verb.ts';
import { serversFiling, unsignedStep } from '../factory/servers/servers.verb.ts';
import { trustRunHome } from '../trust/home.verb.ts';
import { DEFAULT_NAMESPACE } from '../factory/factory.ts';
import { answerHeld, stopAsked } from './held.verb.ts';
import { forStep } from '../telemetry/telemetry.store.ts';
import { stepLabels } from '../telemetry/telemetry.ts';
import { localFields } from './assess.ts';
import { sessionTokenFor, stepToken } from '../token/token.store.ts';
import { sendCards, type Due } from '../send/send.verb.ts';
import { answerTables, fileScripts } from '../script/script.verb.ts';
import { fileCommand, fileCommands } from '../command-node/command-node.verb.ts';
import { isWaitNode, waitCheck, waitRecord } from '../wait-node/index.ts';
import { isCommandNode } from '../command-node/index.ts';
import {
  filedAt,
  sessionCwd,
  foldersTold,
  placeTold,
  toldOf,
  type RunRead,
  type PlaceTold,
  type StepTold,
  type Told,
} from './told.verb.ts';
import { found, inboxViewed, recordNamed, stepNamed, taskToStop, tryTold } from './told.verb.ts';
import { StoreRoot } from '../config/root.store.ts';

/** A task as the engine is asked to file it (`e.file`). */
type Spec = Parameters<Engine['file']>[0];

/**
 * What a step's session runs with, a container's `resources`: its `memory:` as `limits.memory` and its `memoryRequest:` as
 * `requests.memory`, either or both, or nothing, where the engine's defaults stand (`WF_MEMORY_LIMIT`, `WF_MEMORY_REQUEST`). The runtime
 * gives a request alone the engine's default limit beside it. On a session alone, inside `localFields`, since the runtime refuses
 * resources on a remote agent; a check is filed without them, asking its step's `checkMemory:` instead (`checkRequestOf`).
 */
const resourcesOf = (step: StepSpec) =>
  step.memory === undefined && step.memoryRequest === undefined
    ? {}
    : {
        resources: {
          ...(step.memory === undefined ? {} : { limits: { memory: step.memory } }),
          ...(step.memoryRequest === undefined ? {} : { requests: { memory: step.memoryRequest } }),
        },
      };

/**
 * What a step's check asks of the machine, a container's `resources`: its `checkMemory:` as `requests.memory` alone, or nothing, where
 * the engine's default request stands (`WF_MEMORY_REQUEST`). The runtime gives a request alone the engine's default limit beside it.
 */
const checkRequestOf = (step: StepSpec) =>
  step.checkMemory === undefined ? {} : { resources: { requests: { memory: step.checkMemory } } };

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
 * the pass read (`RunRead`), its closer (`Closer`), whether it may file still (`mayFile`, made by `mayFileOf` once a pass), the
 * pass's notes, which each filing adds to in the order it runs, and `heads`, every branch of the run's repository and its commit as the
 * pass read them, undefined where it did not.
 */
export type Filing = {
  e: Engine;
  run: Run;
  reads: RunRead;
  closer: Closer;
  mayFile: Effect.Effect<boolean, Refusal>;
  notes: string[];
  heads?: Heads;
  /** The store's root, as the pass was given it (`StoreRoot`): where a filing reads the run's factory's MCP server record. */
  home: string;
};

/** Every branch of a run's repository and its commit, read when first asked, as a pass read them; undefined where it did not. */
export type Heads = () => Readonly<Record<string, string>> | undefined;

/** The engine as the pass read it: a check's verdict is read off the view the pass judged it by (`reportedEngine`), never a second time. */
const asRead = (f: Filing) => reportedEngine(f.e, [...f.reads.views.values()]) satisfies Engine;

/** Close the task held open a filing replaces, where it waits for a word (`Closer`): the engine's refusal as a note, or undefined. */
const closeFirst = (f: Filing, name: string, taskId: string | null | undefined) =>
  taskId && f.closer.awaitsWord(taskId) ? f.closer.closeWaiting(name, taskId) : Effect.succeed(undefined);

/**
 * Whether `step`'s session would start in a run's home its harness does not trust, and cannot be made to (`trustRunHome`): the step is
 * left unfiled on this pass, with a note that names the fix, and the next pass asks again.
 */
const homeUntrusted = (f: Filing, step: StepSpec) => {
  const why = trustRunHome(f.home, f.run, [step]);
  if (why !== undefined) f.notes.push(`${step.name}: not filed — ${why}; the next pass asks again`);
  return why !== undefined;
};

/**
 * A run's worktree brought to its lockfile before step `name` files a try, a round or a check in it (`keepWorktreeInstalled`), within
 * the pass's `act`, its notes the step's: what it did, or undefined where nothing was due — and for a run that cuts no worktree.
 */
const depsBefore = Effect.fnUntraced(function* (f: Filing, name: string, workspace: string) {
  const { run } = f;
  if (!isRepositoryRun(run) || !run.isolate) return undefined;
  const again: Reinstalled | undefined = yield* withinEffect(
    'act',
    Effect.promise(() => keepWorktreeInstalled(f.home, run.id, run.repo, workspace)),
  );
  if (again) f.notes.push(...reinstalledNotes(run.repo, again).map((note) => `${name}: ${note}`));
  return again;
});

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

/**
 * The step's task held open a try answers, where the try is a person's continue answering it in the session that signed, rather than a
 * task of its own; undefined where it is not.
 */
const heldAnswered = (f: Filing, r: Retry, step: StepSpec, record: StepRecord) => {
  const { run, reads } = f;
  const taskId = record.taskId;
  if (!taskId || !f.closer.awaitsWord(taskId)) return undefined;
  const answers =
    r.by === 'ask' &&
    r.mode === 'continue' &&
    Boolean(sessionIn(reads.views, taskId)) &&
    holdsOpen(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf, reads.verdictOf);
  return answers ? taskId : undefined;
};

/**
 * A step's record once a try that is a session of its own is filed on `taskId` (a new task, or the task held open it answers): the try
 * moved behind it (`nextTry`), and what this filing is pinned on (`filedOn`) in place of what the try behind it was. The one writer of a
 * filed try's record, for the pass that files it and the pass that adopts one a pass filed and died before writing down (`adoptTries`),
 * so the two cannot drift: a try adopted with the record of the try before it would be judged by that try's fields, resume by its
 * schema and read as run on its revisions. A recheck is the same try, and keeps what it was filed on: `nextTry` alone. Pure.
 * @param f What the pass read that the filing is pinned on: the run's pins of its agents and skills, and its steps.
 * @param step The step filed, or undefined where the run's steps do not hold it.
 * @param record The step's record before the filing.
 * @param retry The try filed.
 * @param taskId The task the try is filed on.
 */
export const tryFiled = (
  f: Parameters<typeof filedOn>[0],
  step: StepSpec | undefined,
  record: StepRecord,
  retry: Retry,
  taskId: string,
) => ({
  ...nextTry(record, retry, taskId),
  ...filedOn(f, step),
});

/**
 * File a recheck due: the step's check run again, as the same task's next try. A wait node's try has no task, so its checks are laid
 * anew for the try it is now on, as the loader lays them (`waitCheck`). A person's recheck of one check (`--check`) files that check
 * itself.
 * @param f The pass's filing.
 * @param r The try to file.
 * @param out The steps tried and rechecked on this pass.
 * @param said The note that says the try.
 */
const fileRecheck = Effect.fnUntraced(function* (f: Filing, r: Retry, out: Tried, said: string) {
  const { run } = f;
  const step = stepNamed(f, r.step);
  const record = recordNamed(run, r.step);
  out.tried.push(r.step);
  f.notes.push(said);
  const next = keptChecks(f, step, nextTry(record, r), record.check, r.check);
  run.steps[r.step] = isWaitNode(step) && !next.check ? { ...next, check: waitCheck(run, step, (next.tries?.length ?? 0) + 1) } : next;
  out.rechecked.push(r.step);
  const only = r.check === undefined ? undefined : stepChecks(step).find((c) => c.name === r.check);
  if (only) yield* fileOneCheck(f, r.step, only);
});

/**
 * File one try due, or stop its session first, and put it on the record with its note: nothing once the pass may file no more, and
 * nothing but the note where the engine refuses the close or the answer it needs. A person's recheck of one check (`--check`) files that
 * check itself: the others' tasks are kept, a refused one among them, and the pass files no check of a step one of whose checks stands
 * refused (`checksDue`).
 */
const fileTry = Effect.fnUntraced(function* (f: Filing, r: Retry, out: Tried) {
  const { run, notes } = f;
  const step = stepNamed(f, r.step);
  if (r.stopFirst) return yield* stopFirst(f, r, taskToStop(run, r.step));
  if (!(yield* f.mayFile)) return;
  const record = recordNamed(run, r.step);
  const said = tryWord(r, step);
  if (r.mode === 'recheck') return yield* fileRecheck(f, r, out, said);
  const landing = placeTold(run, f.reads.steps, step, yield* PlaceService);
  const held = heldAnswered(f, r, step, record);
  const answers = held !== undefined;
  if (!answers && homeUntrusted(f, step)) return;
  const closeRefused = answers ? undefined : yield* closeFirst(f, r.step, record.taskId);
  if (closeRefused) {
    notes.push(closeRefused);
    return;
  }
  const taskId = held ?? stepTaskId(run, r.step, r.try);
  const briefed = answers ? undefined : (yield* asked('view', f.e.view(taskId))).state.brief;
  const refused = answers || !briefed ? yield* sendTry(f, r, step, taskId, answers, landing) : undefined;
  if (refused) {
    notes.push(`${r.step}: ${refused}`);
    return;
  }
  out.tried.push(r.step);
  notes.push(said);
  run.steps[r.step] = tryFiled(f, step, record, r, taskId);
});

/**
 * What recent runs of the run's workflow cost (`costsRead`), for a new session of a step on a local harness whose `reads:` names `costs`;
 * undefined for any other, and for a session continued, told them on its first brief.
 */
const costsFor = Effect.fnUntraced(function* (f: Filing, step: StepSpec, resumed: boolean) {
  if (resumed || isRemoteHarness(step.harness) || !step.reads?.includes('costs')) return undefined;
  return yield* costsRead(f.e, f.run);
});

/** What a try of a step on a remote agent is told of itself (`remoteBrief`): a new task, never a session continued. */
const remoteTry = (r: Retry, status: StepStatus) =>
  ({
    try: r.try,
    by: r.by,
    mode: r.mode,
    resumed: false,
    status,
    ...(r.message !== undefined ? { message: r.message } : {}),
  }) satisfies RetryBriefing as RetryBriefing;

/**
 * What a try is handed of its step's checks that refused it: the one check's refusal (`refusalHanded`) where the step has one, and each
 * check's where it has several (`refusalsHanded`); nothing before its checks ran.
 * @param f The pass's filing.
 * @param files The try's files folder, where the outputs are written.
 * @param step The step.
 * @param record The step's record, whose check names the tasks.
 */
const checkRefusalsHanded = Effect.fnUntraced(function* (f: Filing, files: string, step: StepSpec, record: StepRecord) {
  const plan = stepChecks(step);
  const only = plan.length === 1 ? plan[0] : undefined;
  if (!record.check) return {};
  if (only) return { refusal: yield* refusalHanded(f, files, checkLine(only), record.check.taskId) };
  return { refusals: yield* refusalsHanded(f, files, plan, (name) => currentCheckTask(f.run, step.name, name)) };
});

/**
 * Send a try to the engine, told what its place says to it (`PlaceTold`): filed as a task of its own, or given as the answer to the
 * task held open (`answers`). Answers with the engine's refusal of the answer, or undefined. A try filed as a task of its own on a local
 * harness is filed on a tree brought to its lockfile (`depsBefore`), and told where that failed; a held session keeps the tree it has.
 */
const sendTry = Effect.fnUntraced(function* (f: Filing, r: Retry, step: StepSpec, taskId: string, answers: boolean, landing: PlaceTold) {
  const home = yield* StoreRoot;
  const { e, run, reads } = f;
  if (isCommandNode(step)) return yield* fileCommand(f, step, taskId).pipe(Effect.as(undefined));
  const record = recordNamed(run, r.step);
  const files = artifactsDir(home, run, r.step);
  fs.mkdirSync(files, { recursive: true });
  const remote = isRemoteHarness(step.harness);
  const continued = r.mode === 'continue' && !remote && record.taskId !== null ? sessionIn(reads.views, record.taskId) : undefined;
  const resumeFrom = resumeOn(continued, step, f, record);
  const { refusal, refusals } = remote ? {} : yield* checkRefusalsHanded(f, files, step, record);
  const closeouts = yield* askingReads(f, r, resumeFrom);
  const checked = remote ? [] : yield* checksHandedRead(run, reads.steps, step).pipe(over(asRead(f)));
  const status = triedFrom(step, run, reads.phaseOf, reads.signedOff, reads.asked, reads.steps, reads.spendOf);
  const told: Told = { ...(yield* toldOf(run, step)), ...landing };
  const deps = remote || answers ? undefined : (yield* depsBefore(f, r.step, record.workspace ?? run.workspace))?.deps;
  const pictured = answers ? undefined : picturesAgain(home, f, step, resumeFrom);
  const composed = remote
    ? remoteBrief(step, run, reads.steps, closeouts, remoteTry(r, status), undefined, reads.answers)
    : composeBrief(
        told.step,
        run,
        reads.steps,
        closeouts,
        files,
        deps,
        tryTold(home, f, r, record, { status, resumeFrom, refusal, refusals }),
        undefined,
        undefined,
        inputsDir(home, run),
        checked,
        foldersTold(home, run, reads, told.step),
        yield* costsFor(f, step, Boolean(resumeFrom)),
        { say: told.say, targets: told.targets, workspace: record.workspace ?? run.workspace },
        undefined,
        reads.answers,
      );
  const brief = composed + heldSaid(pictured);
  const budgetUsd = budgetUsdFor(r.budget ?? budgetOf(step, run), stepSpend(run, r.step, reads.spendOf));
  if (answers) return yield* answerHeld(e, taskId, brief, budgetUsd, askedOrMomentum(r));
  yield* inboxViewed(f.home, f.run, step);
  const token = yield* stepToken(f.run, step, taskId, r.try);
  yield* asked('file', e.file(trySpec(f, r, step, record, { taskId, brief, resumeFrom, budgetUsd, told, pictured, token })));
  return undefined;
});

/**
 * What a try is handed of the check that refused it (`refusalWholeRead`): the refusal with its tails, and each stream whole, written into
 * the try's files folder (`writeCheckOutputs`) — or why they could not be, and the try is filed with the tails alone.
 */
const refusalHanded = Effect.fnUntraced(function* (f: Filing, files: string, command: string, taskId: string) {
  const { refusal, whole } = yield* refusalWholeRead(command, taskId).pipe(over(asRead(f)));
  return { ...refusal, kept: writeCheckOutputs(files, taskId, whole) } satisfies CheckRefusal;
});

/**
 * What a try is handed of a step's several checks (`refusalsHanded`): each check that refused or did not finish, as `refusalHanded` hands
 * one, under its name, and the names of those that passed; a check never filed, behind a refusal, is neither. Undefined where every check
 * passed.
 */
const refusalsHanded = Effect.fnUntraced(function* (
  f: Filing,
  files: string,
  plan: readonly CheckSpec[],
  taskOf: (name: string) => string,
) {
  const refused: CheckRefusal[] = [];
  const passed: string[] = [];
  for (const check of plan) {
    const phase = f.reads.phaseOf(taskOf(check.name));
    if (phase === 'succeeded') passed.push(check.name);
    else if (phase === 'failed' || phase === 'stopped')
      refused.push({ name: check.name, ...(yield* refusalHanded(f, files, checkLine(check), taskOf(check.name))) });
  }
  return refused.length ? { refused, passed } : undefined;
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
  return (name: string) =>
    (asking && name === asking.looping.name && findings && !('error' in findings) ? findings : reads.signedOff(name)) satisfies
      | Closeout
      | undefined;
});

/**
 * The priority a try or a round goes at: a person's (`by: 'ask'`) at `ASKED_PRIORITY`, the turn they wait on, which takes the room
 * the engine keeps for it; the run's own at `MOMENTUM`.
 * @param r The try or the round, and on whose word it is filed.
 */
const askedOrMomentum = (r: Pick<Retry | Round, 'by'>) => (r.by === 'ask' ? ASKED_PRIORITY : MOMENTUM);

/**
 * A try filed as a task of its own, in the workspace the step had, with its brief, its session to continue and its cap, at the priority
 * of the word it was filed on (`askedOrMomentum`).
 */
const trySpec = (
  f: Filing,
  r: Retry,
  step: StepSpec,
  record: StepRecord,
  t: {
    taskId: string;
    brief: string;
    resumeFrom: string | undefined;
    budgetUsd: number | undefined;
    told: Told;
    pictured: PicturesFiled | undefined;
    token: { readonly sessionToken?: string };
  },
) => ({
  id: t.taskId,
  brief: t.brief,
  cwd: sessionCwd(step, f.run, f.home, record.workspace ?? f.run.workspace),
  harness: step.harness,
  priority: askedOrMomentum(r),
  labels: stepLabels(f.run, step),
  ...localFields(step, () => ({
    config: filedConfig(step, f.reads.steps, f.run, {
      model: tryModel(step, record, r),
      budgetUsd: t.budgetUsd,
      ...filedAt(f.run, f.home, record.workspace ?? f.run.workspace, t.told.servers),
      ...t.token,
      own: t.told.own,
      ...picturesConfig(t.pictured),
    }),
    resumeFrom: t.resumeFrom,
    ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
    closeoutSchema: closeoutSchemaOf(step, f.reads.steps),
    ...resourcesOf(step),
  })),
  deadlineSeconds: step.deadlineSeconds,
});

/**
 * File the rounds due (the assessment's `round`), in order, until the pass may file no more: answers with the looping steps it took round.
 */
export const fileRounds = Effect.fn('fileRounds')(function* (f: Filing, round: readonly Round[]) {
  const looped: string[] = [];
  for (const r of round) {
    if (!(yield* f.mayFile)) break;
    yield* fileRound(f, r, looped).pipe(forStep(f.run, stepNamed(f, r.target)));
  }
  return looped;
});

/**
 * File one round: close the target's task held open first, say it, file the target's next try where the engine does not hold it, and move
 * the loop on (`roundFiled`). Nothing but the note where the engine refuses the close.
 */
const fileRound = Effect.fnUntraced(function* (f: Filing, r: Round, looped: string[]) {
  const home = yield* StoreRoot;
  const { e, run, notes } = f;
  const looping = stepNamed(f, r.step);
  const target = stepNamed(f, r.target);
  const landing = placeTold(run, f.reads.steps, target, yield* PlaceService);
  const record = recordNamed(run, r.target);
  const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
  if (homeUntrusted(f, target)) return;
  const refused = yield* closeFirst(f, r.target, record.taskId);
  if (refused) {
    notes.push(refused);
    return;
  }
  looped.push(r.step);
  notes.push(roundFiledNote(r, looping));
  if (!(yield* asked('view', e.view(taskId))).state.brief) {
    const said = {
      say: landing.say,
      targets: landing.targets,
      costs: yield* costsFor(f, target, Boolean(record.taskId && sessionIn(f.reads.views, record.taskId))),
      deps: isRemoteHarness(target.harness) ? undefined : (yield* depsBefore(f, r.target, record.workspace ?? run.workspace))?.deps,
    };
    yield* inboxViewed(home, run, target);
    const token = yield* stepToken(run, target, taskId, tryOf(run, r.target) + 1);
    yield* asked('file', e.file(roundSpec(home, f, r, looping, target, taskId, yield* toldOf(run, target), said, token)));
  }
  Object.assign(run.steps, roundFiled(f.reads.steps, run, r, taskId));
  if (r.merge && isRepositoryRun(run)) run.baseRef = r.merge.sha;
});

/**
 * A round's target filed under its next try's id, at the priority of the word it was filed on (`askedOrMomentum`): its session continued,
 * told the round — and what the ending's check said of a merged
 * tree it refused (`said.landing`), and for a new session, what recent runs cost (`said.costs`) — with its cap for the round, as the tick
 * tells it (`told`, which its caller yields of `toldOf`).
 */
function roundSpec(
  home: string,
  f: Filing,
  r: Round,
  looping: StepSpec,
  target: StepSpec,
  taskId: string,
  told: StepTold,
  said: PlaceTold & { costs?: WorkflowCosts; deps?: Provisioned },
  token: { readonly sessionToken?: string },
) {
  const { run, reads } = f;
  const record = recordNamed(run, r.target);
  const files = artifactsDir(home, run, r.target);
  fs.mkdirSync(files, { recursive: true });
  const resumeFrom = resumeOn(record.taskId ? sessionIn(reads.views, record.taskId) : undefined, target, f, record);
  const pictured = picturesAgain(home, f, target, resumeFrom);
  return {
    id: taskId,
    /** Read off the closeout that asked for the round, before the record moves it behind (`roundFiled`). */
    brief:
      composeBrief(
        told.step,
        run,
        reads.steps,
        reads.signedOff,
        files,
        said.deps,
        undefined,
        {
          ...roundBriefed(r, looping),
          resumed: Boolean(resumeFrom),
          ...(resumeFrom ? { said: saidIn(record.taskId === null ? undefined : reads.views.get(record.taskId)) } : {}),
        },
        undefined,
        inputsDir(home, run),
        undefined,
        foldersTold(home, run, reads, told.step),
        said.costs,
        { say: said.say, workspace: record.workspace ?? run.workspace },
        undefined,
        reads.answers,
      ) + heldSaid(pictured),
    cwd: sessionCwd(target, run, f.home, record.workspace ?? run.workspace),
    harness: target.harness,
    priority: askedOrMomentum(r),
    labels: stepLabels(run, target),
    ...localFields(target, () => ({
      config: filedConfig(target, reads.steps, run, {
        model: sessionModel(target, record),
        ...filedAt(run, f.home, record.workspace ?? run.workspace, told.servers),
        ...token,
        budgetUsd: budgetUsdFor(
          r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, run),
          stepSpend(run, r.target, reads.spendOf),
        ),
        own: told.own,
        ...picturesConfig(pictured),
      }),
      resumeFrom,
      ...(holdsOpenOn(target) ? { holdOpen: true as const } : {}),
      closeoutSchema: closeoutSchemaOf(target, reads.steps),
      ...resourcesOf(target),
    })),
    deadlineSeconds: target.deadlineSeconds,
  } satisfies Spec as Spec;
}

/** File the checks of these steps, in order, until the pass may file no more: answers with the steps whose checks are on the record. */
export const fileChecks = Effect.fn('fileChecks')(function* (f: Filing, names: readonly string[]) {
  const checked: string[] = [];
  for (const name of names) {
    if (!(yield* f.mayFile)) break;
    yield* fileCheck(f, name).pipe(forStep(f.run, stepNamed(f, name)));
    checked.push(name);
  }
  return checked;
});

/**
 * File a step's check where the engine does not hold it, on the `check` harness, with the command the run froze and a deadline,
 * and put it on the record: the step's worktree is brought to its lockfile first (`depsBefore`), and where that install failed the check
 * runs no command and ends
 * with no verdict (`checkArgv`'s `unprovisioned`).
 * A check filed is noted to the pass's meter by what it belongs to (`noteFiledCheck`), never its run, and records the commit the step's
 * branch was at as the pass read it (`CheckTask.tip`), which a recheck of a blocked step compares against (`blockedRecheck`).
 */
const fileCheck = Effect.fnUntraced(function* (f: Filing, name: string) {
  const { run } = f;
  const step = stepNamed(f, name);
  const record = recordNamed(run, name);
  const plan = stepChecks(step);
  const first = found(plan[0], `a check of step ${name}`);
  const due = record.check
    ? stepChecksDue(run, step, f.reads.phaseOf).file
    : checksDue(plan.map((c) => ({ ...c, standing: 'waiting' as const }))).file;
  for (const check of plan.filter((c) => due.includes(c.name))) yield* fileOneCheck(f, name, check);
  const tasks = Object.fromEntries(plan.map((c) => [c.name, currentCheckTask(run, name, c.name)]));
  const shorthand = plan.length === 1 && first.name === SHORTHAND_CHECK;
  const tip = record.check?.tip ?? (record.branch ? f.heads?.()?.[record.branch] : undefined);
  run.steps[name] = {
    ...record,
    check: { taskId: tasks[first.name] ?? checkTaskId(run, name), ...(tip ? { tip } : {}), ...(shorthand ? {} : { tasks }) },
  };
});

/**
 * A recheck's record of a step with several checks (`checks:`): each check that passed on the try behind keeps its task, and every other
 * is named under the new try's id (`checkTaskId`), to be filed by `fileChecks` as its waits allow. A person's `--check <name>` names that
 * one alone anew and keeps every other's task, whatever it ended in: one never filed is filed under its kept id once its waits allow. A
 * step with one check keeps none: its check runs again whole, as it always has.
 * @param f The pass's filing: the run and the phases of its tasks.
 * @param step The step rechecked.
 * @param record The step's record on the new try (`nextTry`).
 * @param behind The check of the try behind it.
 * @param only The one check a person's recheck runs again (`--check`); absent, every one that did not pass.
 */
const keptChecks = (f: Filing, step: StepSpec, record: StepRecord, behind: StepRecord['check'], only?: string) => {
  const plan = stepChecks(step);
  const first = plan[0];
  if (!behind?.tasks || plan.length < 2 || !first) return record;
  const n = (record.tries?.length ?? 0) + 1;
  const tasks = Object.fromEntries(
    plan.map((c) => {
      const was = behind.tasks?.[c.name];
      const kept = only === undefined ? was && f.reads.phaseOf(was) === 'succeeded' : c.name !== only;
      return [c.name, kept && was ? was : checkTaskId(f.run, step.name, n, c.name)];
    }),
  );
  return { ...record, check: { taskId: tasks[first.name] ?? checkTaskId(f.run, step.name, n, first.name), tasks } } satisfies StepRecord;
};

/**
 * File one of a step's checks where the engine does not hold it, as its own task (`currentCheckTask`), its environment naming it
 * (`WF_CHECK`) and carrying a token minted for its task under the step's agent (`stepToken`), so a `nemia` it calls acts as the step's
 * agent while the check runs and is refused once it settles.
 */
const fileOneCheck = Effect.fnUntraced(function* (f: Filing, name: string, check: CheckSpec) {
  const home = yield* StoreRoot;
  const { e, run } = f;
  const step = stepNamed(f, name);
  const record = recordNamed(run, name);
  const workspace = record.workspace ?? run.workspace;
  const taskId = currentCheckTask(run, name, check.name);
  if ((yield* asked('view', e.view(taskId))).state.brief) return;
  if (check.condition !== undefined) return yield* fileConditionCheck(f, name, check.condition, taskId);
  const command = check.run;
  fs.mkdirSync(path.dirname(checkCloseout(home, taskId)), { recursive: true });
  const files = artifactsDir(home, run, name);
  fs.mkdirSync(files, { recursive: true });
  const firstThing = yield* checkFirst(f, name, workspace);
  const closeout = f.reads.signedOff(name);
  const env = {
    ...checkEnvOf(run, step, {
      workspace,
      files,
      closeout: closeout && writeCheckCloseout(home, taskId, closeout),
      ...(run.workflowFiles === undefined ? {} : { workflowFiles: workflowFilesDir(home, run, run.workflowFiles) }),
      ...(run.carriedFiles === undefined ? {} : { carriedFiles: carriedFilesDir(home, run, run.carriedFiles) }),
    }),
    WF_CHECK: check.name,
    [SESSION_TOKEN]: yield* sessionTokenFor(run, step, taskId, tryOf(run, name)),
  };
  yield* asked(
    'file',
    e.file({
      id: taskId,
      harness: 'check',
      priority: MOMENTUM,
      brief: command,
      cwd: workspace,
      deadlineSeconds: CHECK_DEADLINE_SECONDS,
      ...checkRequestOf(step),
      config: { command: checkArgv(command, firstThing), env, niceness: CHECK_NICENESS },
    }),
  );
  const { factory, workflow } = keysOf(run);
  noteFiledCheck({ factory, workflow, step: name, agent: step.agent?.name ?? '' });
});

/**
 * A check that waits on a condition, once its condition is decided for the try the step is on (`conditionStanding`): filed as a task of
 * its own that prints the writer's message and exits 0 where it was written True, 1 where False, so every reader of a check's task (its
 * verdict, its output handed to the next try, `retries:`) reads it as it reads any check. Filed nothing while it is not written, written
 * Unknown, or written for another try: the step stays checking, and its row says what it waits on (`conditionWaitWords`,
 * `src/condition/condition.ts`).
 */
const fileConditionCheck = Effect.fnUntraced(function* (f: Filing, name: string, condition: string, taskId: string) {
  const { e, run } = f;
  const standing = standingOfCondition(run, name, condition);
  if (standing === 'running') return;
  const written = writtenFor(run, name, condition);
  const step = stepNamed(f, name);
  yield* asked(
    'file',
    e.file({
      id: taskId,
      harness: 'check',
      priority: MOMENTUM,
      brief: `condition: ${condition}`,
      cwd: recordNamed(run, name).workspace ?? run.workspace,
      deadlineSeconds: CHECK_DEADLINE_SECONDS,
      ...checkRequestOf(step),
      config: {
        command: ['sh', '-c', `printf '%s\\n' "$WF_CONDITION_MESSAGE"; exit ${standing === 'passed' ? 0 : 1}`],
        env: { WF_CONDITION: condition, WF_CONDITION_MESSAGE: written?.message ?? '' },
        niceness: CHECK_NICENESS,
      },
    }),
  );
});

/**
 * What a check's script runs before its command, said in the pass's notes: the step's worktree is brought to its lockfile (`depsBefore`),
 * and where that failed the check runs no command (`unprovisioned`).
 */
const checkFirst = Effect.fnUntraced(function* (f: Filing, name: string, workspace: string) {
  if ((yield* depsBefore(f, name, workspace))?.deps.tree !== 'failed') return undefined;
  f.notes.push(`${name}: its worktree's node_modules could not be installed: its check runs no command, and ends with no verdict`);
  return 'unprovisioned' as const;
});

/**
 * Lay the record of each ready wait node, until the pass may file no more: no task is filed, its checks are laid (`waitRecord`) and the
 * pass that files any step's checks files its conditions. Answers with the nodes laid; the caller files the rest.
 */
const fileWaits = Effect.fn('fileWaits')(function* (f: Filing, ready: readonly string[]) {
  const laid: string[] = [];
  for (const name of ready) {
    const step = stepNamed(f, name);
    if (!isWaitNode(step)) continue;
    if (!(yield* f.mayFile)) break;
    f.run.steps[name] = waitRecord(f.run, step);
    laid.push(name);
  }
  return laid;
});

/**
 * File the ready steps (`due.ready`), in order, until the pass may file no more, each in the workspace cut for it: answers with the
 * steps filed. A run that waited on runs, on the pass that files its roots, moves its base to its branch as the pass read it
 * (`Filing.heads`), and keeps it where the pass did not; and a run that waited on runs or was handed runs as context reads what they
 * concluded, (`handedOf`). First, each table condition's route is copied onto its record
 * (`answerTables`), each workflow node in `due.send` files its card (`sendCards`), and the ready script conditions are filed as command
 * tasks (`fileScripts`), answered among the steps filed.
 */
export const fileReady = Effect.fn('fileReady')(function* (f: Filing, due: Due, starting: boolean) {
  const home = yield* StoreRoot;
  const { e, run } = f;
  answerTables(f);
  const ready = due.ready;
  if (ready.length && starting && run.after?.length && isRepositoryRun(run)) run.baseRef = f.heads?.()?.[run.branch] || run.baseRef;
  const parents = ready.length && starting ? yield* handedOf(e, run) : undefined;
  const scripts: string[] = [...(yield* fileScripts(f, ready)), ...(yield* fileCommands(f, ready)), ...(yield* fileWaits(f, ready))];
  const filed: string[] = [...(yield* sendCards(f, due.send)), ...scripts];
  const placed = yield* PlaceService;
  const servers = yield* serversFiling(run.factory ?? DEFAULT_NAMESPACE, f.home, ready, f.notes);
  for (const name of ready.filter((n) => !scripts.includes(n))) {
    if (!(yield* f.mayFile)) break;
    const step = stepNamed(f, name);
    if (unsignedStep(servers, step, f.notes) || homeUntrusted(f, step)) continue;
    const landing = placeTold(run, f.reads.steps, step, placed);
    const made = yield* withinEffect('act', workspaceFor(home, run, f.reads.steps, step, placed));
    f.notes.push(...cutNotes(name, made));
    if (!('cut' in made)) continue;
    const place = made.cut;
    if (!(yield* f.mayFile)) break;
    const files = artifactsDir(home, run, name);
    fs.mkdirSync(files, { recursive: true });
    const checked = isRemoteHarness(step.harness) ? [] : yield* checksHandedRead(run, f.reads.steps, step).pipe(over(asRead(f)));
    const said = {
      parents,
      checked,
      closeoutOf: yield* closeoutsAfterMerge(e, run, step, f.reads.signedOff),
      costs: yield* costsFor(f, step, false),
      say: landing.say,
      targets: landing.targets,
    };
    const pictured = picturesFor(home, f, step);
    yield* inboxViewed(home, run, step);
    const token = yield* stepToken(run, step, stepTaskId(run, step.name, tryOf(run, step.name)), tryOf(run, step.name));
    const taskId = yield* asked(
      'file',
      e.file(readySpec(home, f, step, place, files, yield* toldOf(run, step), said, token, pictured)),
    ).pipe(forStep(run, step));
    run.steps[name] = {
      ...run.steps[name],
      taskId,
      workspace: place.workspace,
      branch: place.branch,
      ...filedOn(f, step),
      ...picturesRecorded(pictured),
    };
    filed.push(name);
  }
  return filed;
});

/**
 * The pictures among the run's inputs `step` is shown in its first message, and those held back (`picturesFiled`): none for a step that
 * resumes a session, which saw them.
 */
const picturesFor = (home: string, f: Filing, step: StepSpec) =>
  picturesFiled(step, step.resume !== undefined && sessionOf(f, step.resume) !== undefined, inputsDir(home, f.run), f.run.inputs);

/** What a step's record keeps of the pictures it was shown and held back, where it was handed any. */
const picturesRecorded = (pictured: ReturnType<typeof picturesFor>) =>
  pictured ? { pictures: { shown: pictured.shown, held: pictured.held } } : {};

/**
 * The pictures a try or a round's new session of `step` is shown in its first message, and those held back (`picturesFiled`), as its
 * first try was: none for a session that continues or resumes one, which saw them.
 */
const picturesAgain = (home: string, f: Filing, step: StepSpec, resumeFrom: string | undefined) =>
  resumeFrom === undefined ? picturesFiled(step, false, inputsDir(home, f.run), f.run.inputs) : undefined;

/** What a brief says, after all else, of the pictures held back from its session, where there are any. */
const heldSaid = (pictured: PicturesFiled | undefined) => {
  const held = pictured ? heldLine(pictured.held) : undefined;
  return held ? `\n\n${held}\n` : '';
};

/** The `pictures` a session's config is filed with, where it is shown any. */
const picturesConfig = (pictured: PicturesFiled | undefined) => (pictured?.pictures.length ? { pictures: pictured.pictures } : {});

/** The session of the step a step resumes, off its current task: undefined for a step with none. */
const sessionOf = (f: Filing, stepName: string) => {
  const taskId = f.run.steps[stepName]?.taskId;
  return taskId ? sessionIn(f.reads.views, taskId) : undefined;
};

/**
 * A ready step as it is filed, in the workspace cut for it, told what the steps before it, their checks and the runs it waited on said,
 * and what recent runs of its workflow cost where it reads them, as the tick tells it (`told`, which its caller yields of `toldOf`).
 */
function readySpec(
  home: string,
  f: Filing,
  step: StepSpec,
  place: Cut,
  files: string,
  told: StepTold,
  said: PlaceTold & {
    parents: ParentCloseout[] | undefined;
    checked: readonly CheckHanded[];
    closeoutOf: (step: string) => Closeout | undefined;
    costs: WorkflowCosts | undefined;
  },
  token: { readonly sessionToken?: string },
  pictured?: PicturesFiled,
) {
  const { parents, closeoutOf } = said;
  const { run, reads } = f;
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
      ? remoteBrief(step, run, reads.steps, closeoutOf, undefined, step.after.length ? undefined : parents, reads.answers)
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
          inputsDir(home, run),
          said.checked,
          foldersTold(home, run, reads, told.step),
          said.costs,
          { say: said.say, targets: said.targets, workspace: place.workspace },
          place.merge,
          reads.answers,
        ) + heldSaid(pictured),
    cwd: sessionCwd(step, run, f.home, place.workspace),
    harness: step.harness,
    priority: stepMomentum(step),
    labels: stepLabels(run, step),
    deadlineSeconds: step.deadlineSeconds,
    ...localFields(step, () => ({
      config: filedConfig(step, reads.steps, run, {
        model: step.model,
        ...filedAt(run, f.home, place.workspace, told.servers),
        ...token,
        budgetUsd: budgetUsdFor(budgetOf(step, run), stepSpend(run, step.name, reads.spendOf)),
        own: told.own,
        ...picturesConfig(pictured),
      }),
      resumeFrom: step.resume ? resumeOn(sessionOf(f, step.resume), step, f, run.steps[step.name]) : undefined,
      ...(holdsOpenOn(step) ? { holdOpen: true as const } : {}),
      /**
       * The engine hands it to the harness and records the answer without reading it: what the fields mean is this package's (`Closeout`).
       */
      closeoutSchema: closeoutSchemaOf(step, reads.steps),
      ...resourcesOf(step),
    })),
  };
}
