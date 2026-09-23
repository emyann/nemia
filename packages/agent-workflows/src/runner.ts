/**
 * The I/O half: a run store, a workspace, and the engine.
 *
 * This file is the only one that knows the engine exists, and it uses `agent-engine` — the
 * Promise API — not `agent-engine/effect`. Nothing here imports Effect, which is the point: a
 * consumer of the engine should need to learn three functions, not a library.
 *
 * What of the I/O never names the engine sits beneath this file, which re-exports what it exported of them: `store.ts` (the run store —
 * a run's id and record, a person's files beside it, a step's check stderr, artifacts and inputs), `daemon-store.ts` (`tick.json` and who
 * ticks the store), `feed-store.ts` (the feed's file), `worktree.ts` (git, a step's worktree, its `node_modules`, the hand-off commit),
 * `branches.ts` (what git says of a run's result branches), `artifacts.ts` (the files a step hands over), `authoring.ts` (a workflow
 * folder and an agent written) and `inbox-store.ts` (the inbox and the queue on disk). They import neither the engine nor this file, and
 * `store.ts` and `worktree.ts` — which imports `store.ts` alone of them — are the only ones the others import, so they load as a tree and
 * no cycle can form (`test/boundary.test.ts`). The package's root is this file still.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { claudeDetached, codex, createEngine, type Engine, nameFor, type TaskView, type Usage } from 'agent-engine';
import { CHECK, CHECK_DEADLINE_SECONDS, checkBrief, lastLines, readVerdict, stdoutTail, type CheckRefusal, type Verdict } from './check.ts';
import { refusalLines } from './deps.ts';

export { verdictWord } from './check.ts';
export { AGENT_FACING, CHECK_AFFECTING, LARGE_CONTEXT, LESSON, branchesToRead, budgetWord, dollars, inFullLines, lessonLine, parseGlobs, peakMark, readWords, rebuiltCache, sumUsage, touchedLines, usedLines } from './radius.ts';
import { sumUsage, type Consumed } from './radius.ts';
export { isGitRun, placeOf } from './run.ts';
export { answerIn, harnessWaitLine, waitingWords } from './run.ts';
/**
 * The name the engine gives a task's session, which is the name `claude agents` lists it under: what a person is told to look for when
 * their step's session waits on them (`harnessWaitLine`). Re-exported because the api cannot import agent-engine — it is not a
 * dependency of it — and this file is the only one in the workspace that knows the engine exists.
 */
export { nameFor } from 'agent-engine';
export { pruneLines, prunedBytes, prunedRefusal, prunedWords, pruneRefusal, sizeOf } from './run.ts';
export type { Pruned, PruneFacts, Pruning } from './run.ts';
export { acceptAsk, acceptanceOf, acceptedLines, approvalOf, approvalRefusal, approvalWordsRefusal, approvedFirst, artifactLines, branchWord, checkoutLine, checkoutWord, endingSteps, firstLine, merges, resultSteps, sendBackTo, toDecideWords, budgetRefusal, ceilingLines, forgetLine, idRefusal, costLine, slotWord, durationWord, fromNote, gateRefusal, gatesOf, hasGate, inputsNote, onYouWords, namesInOrder, owedFields, roundDueNote, runCostLines, runSpend, saidLines, spentWord, stepSpend, taskSpend, tryNote, waitAdvice, waitWord } from './run.ts';
export { outputLines } from './closeout.ts';
export { dueNote, messageRefusal, signoffsSpent } from './retry.ts';
export { firstFiledAt, runStartedAt, timeline, timelineLines, timelineTotalLines } from './timeline.ts';
export type { FolderRun, GitRun, PlaceKind } from './run.ts';
export type { Acceptance, Approval, AskName, BranchFate, BranchStanding, ToDecide, CloseoutAsked, ForgetHow, Forgot, ParentCloseout, ParentRun, ParentStep, Raise, Round, RoundAsk, RunSlot, Said, SaidTo, Shipped, Spend, SpendOf, TaskSpend, Wait } from './run.ts';
export type { SlotWait, TaskSpan, Timeline, TimelineTotal, TimelineTry } from './timeline.ts';
export type { Retry, RetryAsk, RetryHow, RetryMode } from './retry.ts';
import { fansOut, isFolderTeam, loadWorkflows, sessionContext, WorkflowError, workflowFolder, workflowsIn, type Workflow } from './workflow.ts';
export { cardToStart, planLines, planStopped } from './plan.ts';
export type { Card, Planned } from './plan.ts';
export { INBOX_KEY_MEANINGS, INBOX_KEYS, ignoredRepoLine, inboxLines, inboxNameRefusal, noCardLine, parseInboxCard, queueLine, queueOrder, workflowAt } from './inbox.ts';
export type { InboxCard, InboxListing, QueueStarted, QueueTry } from './inbox.ts';
import { inboxListing, inboxNameRefusal, nextQueued, noCardLine, noWorkflowRefusal, parseInboxCard, startedRefusal, type InboxCard, type QueueStarted, type QueueTry } from './inbox.ts';
import { parsePlan, planOrder, type Card, type Planned } from './plan.ts';
import { folderPlace, workRoot } from './places.ts';
import { acceptanceOf, type Acceptance, admissionOrder, resultSteps, slotFree, takesNoSlot, afterRefusal, endingAsked, type BranchStanding, type CheckoutHold, type MainClaim, heldCheckouts, type ToDecide, approvalRefusal, approvedFirst, gateRefusal, triedFrom, type Approval, branchFates, checkLogsOf, forgetRefusal, gated, heldRuns, heldWorktree, idRefusal, namesInOrder, parseWorktrees, runAdmitted, runCapOf, runWorktrees, slotNeed, slotWord, type AskName, type BranchFate, type ForgetHow, type Forgot, hasStarted, runReady, tipBranches, tipsSeen, waitsOf, type ParentRun, type RunSlot, type Wait } from './run.ts';
import { feedPhase, feedWords, type FeedWords } from './run.ts';
export { feedLineWords, REMOVED } from './feed.ts';
export type { FeedLine } from './feed.ts';
export type { FeedSaid, FeedWords } from './run.ts';
import { acceptAsk, acceptedLines, answerLines, askingTry, assess, gateLines, harnessWaitLine, budgetOf, budgetUsdFor, MOMENTUM, priorityOf, costLine, overBudgetLine, ownStatus, runCostLines, stepSpend, taskSpend, type SpendOf, cancelPlan, inputRefusal, capOf, checkTaskId, composeBrief, decision, handOffDue, inFlight, listing, owesReplies, retriesDue, retryable, retryLines, retryRefusal, roundAsk, sentBack, type EndingStopped, roundFiled, roundLines, roundsDue, sayRefusal, stepStatus, stepTaskId, type Assessment, type CancelPlan, type InputFile, type Decision, type Listing, type ParentCloseout, type ParentStep, type Round, type RoundAsk, type Run, type Pruning, pruneRefusal, isGitRun, placeOf, type Said, type SaidTo, type CloseoutAsked, type TaskPhase } from './run.ts';
import { closeoutSchemaOf, parseCloseout, type Closeout } from './closeout.ts';
import { answerOf, modeWord, nextTry, sessionModel, tryOf, type Retry, type RetryAsk, type RetryHow } from './retry.ts';
import { taskUsage, timeline, type Timeline } from './timeline.ts';
export { DAEMON_FILE, DEFAULT_EVERY_MS, MAX_EVERY_MS, STALE_FLOOR_MS, STALE_PASSES, daemonLine, everyOf, parseDaemonFile, staleAfterMs, takenFromLine, takeoverLine } from './daemon.ts';
export type { DaemonFile, DaemonStanding, Identity } from './daemon.ts';
import { HOME, acceptFile, acceptanceIn, approvalFile, approvalIn, artifactsDir, askFile, askIn, asksDir, cancelFile, checkStderr, consumeAsks, inboxDir, inputsDir, isDirectory, listRuns, lstatOf, markCancelled, pruneFile, readAnswers, readAsks, readRun, rewriteRun, roundAskFile, roundAskIn, runFile, runId, runsDir, stepsOf, writeAsk, writeRun } from './store.ts';
export { HOME, acceptFile, approvalFile, artifactsDir, askFile, checkStderr, inboxDir, inputsDir, listRuns, markCancelled, readAcceptances, readAnswers, readApprovals, readAsks, readRun, roundAskFile, runId, stepsOf } from './store.ts';
import { ceilings, lastCeilings, recordCeilings } from './daemon-store.ts';
export { alive, beat, ceilings, daemonFile, daemonStanding, identify, lastCeilings, passed, procStartOf, releaseStore, stillHeld, storeRefusal, takeStore } from './daemon-store.ts';
export type { TakenStore } from './daemon-store.ts';
import { feedFile, recordFeed } from './feed-store.ts';
export { feedCursorRefusal, feedFile, freshFeedMemo, readFeed, recordFeed, watchFeed } from './feed-store.ts';
import { gitSays, handOff, makeWorkspace, readInclude, workspaceFor } from './worktree.ts';
export { lockfileParts, provisionDeps } from './worktree.ts';
import { collectArtifacts } from './artifacts.ts';
export { artifactFiles, missingArtifacts } from './artifacts.ts';
import { parentRecord, refsOf, shippedOf, standingsOf } from './branches.ts';
export { artifacts, branchStandings, diffStat, isShipped, parentRecord, readArtifact, resultBranches, sensitiveDiff, touchedBy } from './branches.ts';
export { AgentWriteError, agentPlaces, findAgent, listAgents, removeAgent, writeAgent, writeWorkflow } from './authoring.ts';
export type { AgentPlace, AgentSchema, AgentSidecar, AgentWritten, WorkflowWritten } from './authoring.ts';
import { inboxCards, inboxFiles, queueDir, queueTries } from './inbox-store.ts';
export { addToInbox, dropFromInbox, inboxNameAt, queueInInbox, readInbox } from './inbox-store.ts';
export type { InboxDropped, InboxQueued } from './inbox-store.ts';

/**
 * The engine, with one harness of the run's own beside the three it ships.
 *
 * `check` runs a step's `check:` command (`src/check.ts`). Passing `harnesses` REPLACES the engine's
 * default map rather than adding to it, so the defaults are named again here — leaving them out would
 * quietly send every `claude` step to whichever harness came first.
 */
export const HARNESSES = {
  claude: 'claude-bg',
  codex,
  'claude-detached': claudeDetached,
  check: CHECK,
} as const;

/**
 * Why the engine refuses `remoteControl: true` on a harness that runs a prompt and exits, in its words (agent-engine's `file()`), which
 * `test/store.test.ts` holds this copy to by asking the engine. A copy, because `start` is synchronous and the engine's door is not; and
 * asked only at filing, the refusal would come after the run was written, on its first pass.
 */
const NOT_BRIDGED = 'has no such flag: it runs a prompt and exits, and only a Claude Code background session (`claude --bg --remote-control`) is bridged';

/**
 * The first step that says `remote: true` on a harness the engine refuses `remoteControl` for — every one of `HARNESSES` but Claude Code's
 * background sessions, as the engine's own door judges — refused by name in the engine's words (`NOT_BRIDGED`), or undefined. A step without
 * a `harness:` runs on `claude`, the engine's first.
 */
function remoteRefusal(steps: readonly Workflow[]): string | undefined {
  const bridged = Object.entries(HARNESSES).filter(([, h]) => h === 'claude-bg').map(([name]) => name);
  const step = steps.find((s) => s.remote && !bridged.includes(s.harness ?? 'claude'));
  if (!step) return undefined;
  return `${step.name}: \`remote: true\` asks for a session bridged to claude.ai, and the \`${step.harness}\` harness ${NOT_BRIDGED}. Run the step on ${bridged.join(' or ')} — delete \`harness: ${step.harness}\` — or delete \`remote: true\`.`;
}

export const engine = (): Engine => createEngine({
  root: path.join(HOME, 'engine'),
  maxConcurrent: Number(process.env.WF_MAX_CONCURRENT) || 2,
  harnesses: HARNESSES,
});

/**
 * The engine's task phases, narrowed to what a run cares about.
 *
 * A task the engine has never heard of is `unknown`, NOT `pending`. It folds to the same empty
 * state as one that is filed and waiting for a slot — `settled: null`, zero attempts — and the one
 * thing that tells them apart is that a filed task has the brief it was filed with.
 *
 * Worth the line, because `pending` counts as in flight. A run whose engine board has since been
 * cleared read as running for ever: `wf cancel` claimed to stop steps nobody can find, and
 * `wf decide` said "still running". `unknown` was in the type for this and was simply unreachable.
 * Found by the `wf rm` run (34774e0), whose verb was not kept; this was.
 *
 * Exported, log-free, so a consumer narrows a view as the tick does. No view at all is `unknown` too.
 */
export const phaseOfView = (v: TaskView | undefined): TaskPhase => {
  if (!v) return 'unknown';
  if (v.state.settled) return v.state.settled;
  if (v.state.attempts.length) return 'running';
  return v.state.brief ? 'pending' : 'unknown';
};

/**
 * The engine's word on every task this run has filed, read once.
 *
 * One read per task per pass, shared by everything that then wants an answer: `advance` needs the
 * views themselves (for the session id a `resume:` step continues), and the pure functions need
 * only the phase.
 *
 * `earlierTries` reads each try a step has left behind as well. They are read for one thing — what the step's tries have cost together,
 * which the cap in force on it is held to (`stepSpend`, `overBudget`, `budgetUsdFor`) — and every reader of that is gated on there being a
 * cap (`budgetOf`), so with none in force they are read and never asked. A screen reads them all the same (`decide` prints what a run cost
 * and its timeline over every try), and so does anything that must answer for a try that is over. The tick does not: `advance` asks for
 * them only while a cap is in force, because a step answered without limit — the supervisor, which is answered for as long as a person
 * keeps answering — would otherwise add one journal read per answer to every pass of every four seconds, for ever, buying nothing.
 */
async function taskPhases(e: Engine, run: Run, { earlierTries = true }: { earlierTries?: boolean } = {}): Promise<{
  views: Map<string, TaskView>;
  phaseOf: (taskId: string) => TaskPhase;
}> {
  const views = new Map<string, TaskView>();
  for (const { taskId, check, tries } of Object.values(run.steps)) {
    if (taskId) views.set(taskId, await e.view(taskId));
    if (check) views.set(check.taskId, await e.view(check.taskId));
    // A settled task is read off its journal, and asks no harness — but it is still a read, once per try per pass.
    if (earlierTries) for (const t of tries ?? []) if (!views.has(t.taskId)) views.set(t.taskId, await e.view(t.taskId));
  }
  return {
    views,
    phaseOf: (taskId) => phaseOfView(views.get(taskId)),
  };
}

/**
 * Whether any step of this run has a cap in force on it (`budgetOf`: its `budget:`, or the last a person raised it to) — read off the
 * record, with nothing asked of the engine. What the tick's pass reads the earlier tries for (`taskPhases`): with no cap anywhere, what
 * they cost is a number nothing in the pass looks at.
 */
const underBudget = (steps: readonly Workflow[], run: Run): boolean => steps.some((s) => budgetOf(s, run.steps[s.name]) !== undefined);

/**
 * Checks a pass filed and never wrote down, put back on the record. In memory: `advance` is the one
 * writer of the run's json, and writes it; `cancel` only needs them in view.
 *
 * A pass that dies between `e.file` and `writeRun` leaves a check on the engine's board that the
 * record does not name. It is looked for under the id the run derives, for every step whose check is
 * due and unrecorded, and BEFORE anything asks what is in flight. Waiting for filing time to adopt it
 * was not enough: a run cancelled in that window files no more checks, so it was never adopted, never
 * stopped, and its suite ran on to the deadline.
 */
async function adoptChecks(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const step of steps) {
    if (run.steps[step.name]?.check || stepStatus(step, run, phaseOf, closeoutOf, asked, steps, spendOf) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    run.steps[step.name] = { ...run.steps[step.name]!, check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
}

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and
 * before anything asks what is in flight, for the same reason: a run cancelled in that window files no more
 * tries, so a try filed in it would otherwise never be adopted, nor stopped.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a
 * refused check `retries:` covers. A run waiting on a person with nothing asked costs no look.
 */
async function adoptTries(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  verdictOf: (step: string) => Verdict | undefined,
  asks: readonly RetryAsk[],
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of retriesDue(steps, run, phaseOf, closeoutOf, asked, verdictOf, asks, () => false, spendOf)) {
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    const record = run.steps[r.step]!;
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : nextTry(record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]!);
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and died
 * left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as the
 * pass would have (`roundFiled`), and nothing is filed twice.
 */
async function adoptRounds(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  asks: readonly RoundAsk[],
  spendOf: SpendOf,
): Promise<string[]> {
  const adopted: string[] = [];
  for (const r of roundsDue(steps, run, phaseOf, closeoutOf, asked, asks, spendOf)) {
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    const view = await e.view(taskId);
    if (!view.state.brief) continue;   // not filed: due, and this pass's to file
    views.set(taskId, view);
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
    adopted.push(r.step);
  }
  return adopted;
}

/**
 * Steps a pass filed and never wrote down: each step `assess` calls ready — blind to a cancellation, as a pass that read the run before it
 * was called off calls it — whose task, under the id that pass files it by, the engine holds. Looked up as `adoptChecks` looks up a check,
 * and put in `views`; it answers with them and changes nothing on the run. `forget` adopts them in memory, so a step being filed is in
 * flight, and `advance` stops them on a cancelled run, whose record would otherwise hide them from every stop.
 */
async function unrecordedSteps(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  views: Map<string, TaskView>,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined,
  asked: (taskId: string) => CloseoutAsked,
  verdictOf: (step: string) => Verdict | undefined,
  asks: readonly RetryAsk[],
  rounds: readonly RoundAsk[],
  spendOf: SpendOf,
): Promise<Array<{ name: string; taskId: string }>> {
  const { cancelledAt: _, ...live } = run;
  const { ready } = assess(steps, live, phaseOf, closeoutOf, asked, verdictOf, asks, rounds, () => false, spendOf);
  const found: Array<{ name: string; taskId: string }> = [];
  for (const name of ready) {
    const taskId = stepTaskId(run, name, tryOf(run, name));
    const view = views.get(taskId) ?? await e.view(taskId);
    if (!view.state.brief) continue;   // not filed
    views.set(taskId, view);
    found.push({ name, taskId });
  }
  return found;
}

/**
 * Whether a task was asked for a closeout: the schema the engine keeps on its record of the filing — and `unsigned` when its last
 * attempt ended without it, the reason the engine records on a session that went quiet before it settles the task `failed`. What
 * tells a step that ended without one — `unsigned` — from a task that was never asked, and from one that failed. Exported,
 * log-free, for a consumer that words a step as `wf ls` does.
 */
export const closeoutAsked = (views: ReadonlyMap<string, TaskView>) => (taskId: string): CloseoutAsked => {
  const state = views.get(taskId)?.state;
  if (!state?.closeoutSchema) return false;
  return state.attempts.at(-1)?.reason === 'unsigned' ? 'unsigned' : true;
};

/**
 * Whether the harness marked a task's session blocked while its attempt runs — the engine's `needs-human` — off views already read. What
 * tells a step waiting on a person with nothing signed, as on a login refresh the harness lost, from one still working (`retryable`).
 * Exported, log-free, for a consumer that asks `retry` for such a step as `wf retry` does.
 */
export const harnessBlocked = (views: ReadonlyMap<string, TaskView>) => (taskId: string): boolean => views.get(taskId)?.phase === 'needs-human';

/**
 * What the harness says a task's blocked session waits for, in its own words (`TaskView.waitingFor`), off views already read — `permission
 * prompt`, as `claude agents --json` prints it. `undefined` for a task nobody is waiting on, and for a harness that says nothing: the
 * detached ones never do. Costs no observation of its own: the engine read it on the same pass it read the phase.
 *
 * Exported, log-free, for a consumer that words a step as `wf ls` does. The words themselves are `waitingWords` and `harnessWaitLine` in
 * run.ts, which is the only place this repository turns the harness's word into a sentence.
 */
export const waitingOf = (views: ReadonlyMap<string, TaskView>) => (taskId: string): string | undefined => views.get(taskId)?.waitingFor;

/**
 * What each task's sessions cost, off views already read (`taskSpend`): what holds a step to its `budget:`, and what `wf ls` and `wf decide`
 * print beside it. Exported, log-free, for a consumer that words a step as `wf ls` does. A task with no view read has no spend known.
 */
export const spendReader = (views: ReadonlyMap<string, TaskView>): SpendOf => (taskId) => taskSpend(views.get(taskId));

/**
 * What each step's current check exited with, off the engine's record: the code its process gave, or
 * `unfinished` when it gave none — killed by a signal, stopped, or never started — and `undefined` for a step
 * with no check filed. What the tick tells a refusal from a check that did not finish by (`refusedCheck`),
 * without reading a log: a run waiting on a person costs no more each pass. The check prints the code it exits
 * with, so this and the log's `[wf check] exit N`, which `wf ls` reads, agree.
 *
 * Exported for a consumer that words a check as `wf ls` does, without a `logs` call per refused check.
 */
export const exitVerdicts = (views: ReadonlyMap<string, TaskView>, run: Run) => (step: string): Verdict | undefined => {
  const taskId = run.steps[step]?.check?.taskId;
  if (!taskId) return undefined;
  // A check the operator or its deadline cut short did not finish, whatever code its process died with.
  const last = views.get(taskId)?.state.attempts.at(-1);
  return typeof last?.exitCode === 'number' && last.reason !== 'deadline' && last.reason !== 'operator' ? last.exitCode : 'unfinished';
};

/** The harness's own id for a task's last session — what `--resume` takes. */
const sessionIn = (views: ReadonlyMap<string, TaskView>, taskId: string): string | undefined =>
  views.get(taskId)?.state.attempts.at(-1)?.nativeId ?? undefined;

/**
 * A workflow folder's steps, refused as `start` refuses them before a run is written, with the fix: a folder that is not a workflow
 * (`loadWorkflows`), one that can run two steps at once where they would share a directory (`isolate: false`), and a step named for another
 * step's check or try. What `startPlan` asks of every card before the first run is started.
 */
function stepsToStart(workflowDir: string, isolate: boolean): Workflow[] {
  const steps = loadWorkflows(workflowDir);   // validated before anything is spent
  // A team that says `workspace: folder` (every step or none: `validate`) works in folders the run makes, where there is no base branch to
  // work on in place: --no-worktree would name one, so it is refused rather than read as nothing.
  if (!isolate && isFolderTeam(steps)) {
    throw Object.assign(new Error(
      `--no-worktree: this workflow's steps say \`workspace: folder\`, so each works in a folder the run makes, with no git repository — there is no base branch for them to work on in place.\n`
      + `Start it without --no-worktree.`,
    ), { exitCode: 2 });
  }
  if (!isolate && fansOut(steps)) {
    throw new Error(
      'this workflow can run two steps at once, and --no-worktree would put them in the same directory.\n' +
      'Either drop --no-worktree, or make the steps a chain.',
    );
  }
  // A run with no worktrees works on the base branch itself, so it has no result branch for an ending step to merge: that step would be
  // told the work is on a branch it is already standing on, and its prose would merge a branch into itself. Refused before anything is
  // spent, rather than after a session has paid for the folder's whole check to find there is nothing to commit.
  const ending = !isolate ? steps.find((s) => s.workspace === 'main') : undefined;
  if (ending) {
    throw Object.assign(new Error(
      `${ending.name}: \`workspace: main\` ends this workflow by merging the run's result branch onto the base branch, and --no-worktree gives the run no result branch — every step works on ${'the base branch'} itself, where the work already is, so there would be nothing to merge.\n`
      + `Either drop --no-worktree, or start a workflow whose last step is not an ending.`,
    ), { exitCode: 2 });
  }
  // A check's task is its step's id plus `-check`, so a step named that would share an id with it and
  // the run would read one task as the other.
  const clash = steps.find((s) => s.check && steps.some((other) => other.name === `${s.name}-check`));
  if (clash) {
    throw Object.assign(new Error(
      `${clash.name}-check: a step may not be named for another step's check. ${clash.name} has a \`check:\`, and the run files it as ${clash.name}-check. Rename ${clash.name}-check.md.`,
    ), { exitCode: 2 });
  }
  // Nor for another step's try: any step may be tried again, as `<step>-try<n>`, its check as `<step>-try<n>-check`.
  const tryClash = steps.map((s) => ({ s, of: /^(.+)-try\d+(?:-check)?$/.exec(s.name)?.[1] })).find(({ of }) => of && steps.some((other) => other.name === of));
  if (tryClash) {
    const { s, of } = tryClash;
    throw Object.assign(new Error(
      `${s.name}: a step may not be named for another step's try. The run files ${of} tried again as ${of}-try2, its check as ${of}-try2-check, and on. Rename ${s.name}.md.`,
    ), { exitCode: 2 });
  }
  // Refused here, before anything is written, and not by the engine when the step is filed: by then the run is on the record.
  const unbridged = remoteRefusal(steps);
  if (unbridged) throw Object.assign(new Error(unbridged), { exitCode: 2 });
  return steps;
}

/** A `.worktreeinclude` with lines `start` refuses, refused where a person is looking, rather than line by line in a daemon's log. Only a run that cuts worktrees reads the file. */
function refuseInclude(repo: string, isolate: boolean): void {
  const refused = isolate ? readInclude(repo)?.refused ?? [] : [];
  if (refused.length) {
    throw Object.assign(new Error(
      `${path.join(repo, '.worktreeinclude')}: ${refusalLines(refused).join('; ')}. Each line is a gitignored path inside the repository, relative to its root — fix or remove ${refused.length === 1 ? 'that line' : 'those lines'}.`,
    ), { exitCode: 2 });
  }
}

/**
 * `after` names the runs this one waits on (`wf start --after`): refused before anything is written when one could never ship onto
 * this run's base (`afterRefusal`), and frozen on the record. Left out, the record is what it was before there was an `after`.
 *
 * `inputs` are files to hand every step (`wf start --input`), by path from where `wf start` is typed: refused before anything is written
 * when one is not a file or two would take one name (`inputRefusal`), then copied into the run's own `inputs/` (`inputsDir`), and their
 * names frozen on the record. Left out, no directory is made, and the record is what it was before there were inputs.
 *
 * `from` says where the brief came from — the inbox card `startFromInbox` starts — and is frozen on the record. Left out, the record has none.
 *
 * `gates` are the steps whose closeout waits for a person before anything after them is filed, beside those the workflow gates itself
 * (`wf start --gate`, a card's `gate:`): refused before anything is written when one is given twice or names no step of the workflow
 * (`gateRefusal`), and frozen on the record. Left out, the record has none.
 */
export function start(opts: { brief: string; repo: string; repoNamed?: boolean; workflowDir: string; isolate?: boolean; after?: readonly string[]; inputs?: readonly string[]; from?: { inbox: string }; gates?: readonly string[] }): Run {
  const isolate = opts.isolate ?? true;
  const steps = stepsToStart(opts.workflowDir, isolate);
  const folder = isFolderTeam(steps);
  if (folder && opts.repoNamed) {
    throw Object.assign(new Error(
      `--repo ${opts.repo}: this workflow's steps say \`workspace: folder\`, so the run works in folders it makes under ${workRoot(runsDir(), '<run>')}, with no git repository, and would never look at ${opts.repo}.\n`
      + `Start it without --repo, or start a workflow whose steps work on a repository.`,
    ), { exitCode: 2 });
  }
  const gates = opts.gates ?? [];
  const refusedGates = gateRefusal(gates, steps);
  if (refusedGates) throw Object.assign(new Error(refusedGates), { exitCode: 2 });
  if (!folder) refuseInclude(opts.repo, isolate);
  const inputs = (opts.inputs ?? []).map((given): InputFile => {
    const resolved = path.resolve(given);
    const at = fs.statSync(resolved, { throwIfNoEntry: false });
    return { given, resolved, kind: !at ? 'missing' : at.isFile() ? 'file' : at.isDirectory() ? 'directory' : 'other' };
  });
  const refusedInputs = inputRefusal(inputs);
  if (refusedInputs) throw Object.assign(new Error(refusedInputs), { exitCode: 2 });
  const id = runId(opts.brief);
  const after = opts.after ?? [];
  // Keyed in the order the steps run, as `loadWorkflows` gives them: what `wf ls`, `wf decide` and the board list a run's steps in.
  const stepRecords = Object.fromEntries(steps.map((s) => [s.name, { taskId: null }]));
  const told = {
    brief: opts.brief,
    workflowDir: path.resolve(opts.workflowDir),
    workflow: steps,
    ...(after.length ? { after: [...after] } : {}),
    ...(inputs.length ? { inputs: inputs.map((f) => path.basename(f.resolved)) } : {}),
    ...(opts.from ? { from: { inbox: opts.from.inbox } } : {}),
    ...(gates.length ? { gates: [...gates] } : {}),
  };
  let run: Run;
  if (folder) {
    // No git at all: the repository `wf start` was typed in is not looked at, and the run's own directory in the store is its workspace,
    // each step's folder made beneath it when the step is filed (`folderPlace`). `--after` is refused here, a folder run having no branch to wait for.
    const refusedAfter = afterRefusal(after, { place: { kind: 'folder' } }, parentRecord);
    if (refusedAfter) throw Object.assign(new Error(refusedAfter), { exitCode: 2 });
    run = { id, place: { kind: 'folder' }, workspace: workRoot(runsDir(), id), ...told, steps: stepRecords, createdAt: new Date().toISOString() };
  } else {
    const { workspace, baseRef, branch } = makeWorkspace(opts.repo, isolate);
    const refusedAfter = afterRefusal(after, { repo: opts.repo, branch }, parentRecord);
    if (refusedAfter) throw Object.assign(new Error(refusedAfter), { exitCode: 2 });
    run = {
      id,
      repo: opts.repo,
      workspace,
      baseRef,
      isolate,
      ...told,
      branch,
      steps: stepRecords,
      createdAt: new Date().toISOString(),
    };
  }
  // Copied before the record is written, so a record never names a file that is not there. A copy that fails takes the directory back with it.
  if (inputs.length) {
    const dir = inputsDir(run);
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of inputs) fs.copyFileSync(f.resolved, path.join(dir, path.basename(f.resolved)), fs.constants.COPYFILE_EXCL);
    } catch (err) {
      fs.rmSync(path.dirname(dir), { recursive: true, force: true });
      throw Object.assign(new Error(`--input: the run's files could not be copied into ${dir} — ${(err as Error).message}. Nothing was started: start it again once that directory can be written.`), { exitCode: 1 });
    }
  }
  writeRun(run);
  return run;
}

/**
 * A plan folder's cards, parents first (`parsePlan`, `planOrder`): every entry of the folder handed to the pure parser — a folder inside it
 * by its name and a trailing `/`, a markdown file with its text.
 */
export function readPlan(dir: string): Card[] {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    throw new WorkflowError(`no plan folder at ${dir}. A plan is a folder of cards, one <card>.md each: wf plan <folder> --repo <r>.`);
  }
  const files = entries.map((name) => {
    const at = path.join(dir, name);
    if (fs.statSync(at, { throwIfNoEntry: false })?.isDirectory()) return { file: `${name}/`, text: '' };
    return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' };
  });
  return planOrder(parsePlan(files, dir));
}

/** What `startPlan` did: the cards it started, in order; the workflow folder each card's `workflow:` was found at; and, when a `start()` refused part-way, which card, why, and the cards after it. */
export type PlanStarted = {
  started: Planned[];
  folderOf: (card: Card) => string;
  stopped?: { card: Card; error: Error & { exitCode?: number }; rest: Card[] };
};

/**
 * `wf plan`: every card of a plan folder started, parents first, each with `start()` and `after` the runs of the cards its `after:` names —
 * the record `wf start --after` writes, so the tick, `wf ls`, `wf decide` and the board need nothing new. Nothing else is written: no plan
 * record, and no file of its own. The runs and their `after` are the plan.
 *
 * Refused before the first run is started, naming the card and the fix: a folder `parsePlan` refuses; a card whose `workflow:` names no
 * workflow folder (`workflowFolder`, from the plan folder), or one `start` would refuse — that refusal, behind the card; and a
 * `.worktreeinclude` `start` would refuse. A `start()` that refuses after that, part-way, stops the plan: the runs already started stand,
 * and `stopped` says which card refused and which are left. `startRun` is `start`, unless a test hands it one of its own.
 */
export function startPlan(opts: { dir: string; repo: string; startRun?: typeof start }): PlanStarted {
  const cards = readPlan(opts.dir);
  refuseInclude(opts.repo, true);
  const folders = new Map<string, string>();
  for (const card of cards) {
    try {
      const folder = workflowFolder(card.workflow, opts.dir, opts.repo);
      stepsToStart(folder, true);
      folders.set(card.name, folder);
    } catch (err) {
      throw Object.assign(new Error(`${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}`), { exitCode: 2 });
    }
  }
  const folderOf = (card: Card): string => folders.get(card.name)!;
  const startRun = opts.startRun ?? start;
  const started: Planned[] = [];
  for (const [i, card] of cards.entries()) {
    const runOf = new Map(started.map((p) => [p.card.name, p.runId]));
    try {
      // Parents first, so every card it names has a run by now.
      const run = startRun({ brief: card.body, repo: opts.repo, workflowDir: folderOf(card), after: card.after.map((a) => runOf.get(a)!) });
      started.push({ card, runId: run.id, workflowDir: run.workflowDir });
    } catch (err) {
      return { started, folderOf, stopped: { card, error: err as Error, rest: cards.slice(i + 1) } };
    }
  }
  return { started, folderOf };
}

/** How to start an inbox card (`startFromInbox`): the card, and what its start says over it or beside it. */
export type InboxStart = {
  /** The card's name, as `wf inbox` lists it. */
  name: string;
  /** What the run is asked to do, in place of the card's body: the note rewritten into work. The card's body when left out. */
  brief?: string;
  /** The workflow, over the card's `workflow:`: a folder — from `from` when relative — or a name under the repository's `workflows/`. */
  workflow?: string;
  /** Where a relative `workflow` is read from: where `wf start` was typed. The current directory when left out. */
  from?: string;
  /**
   * The repository, over the card's `repo:`: named by a person at start (`wf start <card> --repo`), and refused as `start()` refuses it for a
   * team that says `workspace: folder`. The card's own `repo:` is not: the board writes one on every card it files, so a folder team takes
   * it as it takes the directory `wf start` is typed in, and never looks at it.
   */
  repo?: string;
  /** The repository when neither `repo` nor the card names one: `wf start`'s `.`, or the board's own. */
  callerRepo: string;
  /** The runs it waits on (`wf start --after`): an inbox card has no `after:`, so it is said here, at start. */
  after?: readonly string[];
  isolate?: boolean;
  inputs?: readonly string[];
  /** The steps its run is gated at (`wf start --gate`), beside the card's own `gate:`. */
  gates?: readonly string[];
};

/**
 * What `startFromInbox` did: the run, the card it started, and whether the card left the inbox — and, when not, why.
 *
 * `ignoredRepo` is the card's own `repo:` when the run looks at no repository: a folder team's does not, and a card filed before
 * `cardRepoRefusal` — or by hand — may still carry one. The run is started all the same, and the line says the path was not looked at,
 * rather than leaving a person to wonder which repository the work went to.
 */
export type InboxStarted = ({ run: Run; card: InboxCard; removed: true } | { run: Run; card: InboxCard; removed: false; why: string }) & { ignoredRepo?: string };

/**
 * `wf start <inbox>/<name>.md`, and the board's start of a card: a card out of the inbox started with `start()`, `from: { inbox: <name> }` on
 * its record, then removed from the inbox.
 *
 * The brief is `brief`, or else the card's body. The workflow is `workflow`, else the card's `workflow:` — found from the inbox folder as
 * `wf plan` finds a card's from its plan folder: a name under the repository's `workflows/`, or a path — else refused, naming the repository's
 * workflows. The repository is `repo`, else the card's `repo:`, else `callerRepo`. The run is gated at the card's `gate:` and at `gates`, the
 * card's first; a step both name is gated once.
 *
 * The record is written first, so a removal that fails leaves a card `wf inbox` lists as started — never a run with no trace of its card. It
 * says so in `why`, and the card is not started again (`startedRefusal`) until a person drops it. Refused by name before anything is written,
 * exit 2: a name that is not a card's (`inboxNameRefusal`), a card not there — naming the cards there are — a card that does not read, a card
 * already started, no workflow, a workflow that does not load behind the card, a `gate:` naming no step of it, and a `brief` with nothing in it;
 * and whatever `start()` refuses — an `--after`, an `--input`, a `--gate` — as it refuses it.
 */
export function startFromInbox(opts: InboxStart): InboxStarted {
  const refused = inboxNameRefusal(opts.name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${opts.name}.md`);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new WorkflowError(`${noCardLine(opts.name, inboxCards())} Start one of those — wf start ${path.join(inboxDir(), '<name>.md')} — or park the idea first: wf inbox add "<idea>".`);
  }
  const card = parseInboxCard(`${opts.name}.md`, text, isDirectory);
  const started = listRuns().filter((r) => r.from?.inbox === card.name).map((r) => r.id);
  if (started.length) throw new WorkflowError(startedRefusal(card, file, started));

  const repo = opts.repo ?? card.repo ?? opts.callerRepo;
  let workflowDir: string;
  if (opts.workflow !== undefined) workflowDir = workflowFolder(opts.workflow, opts.from ?? process.cwd(), repo);
  else if (card.workflow !== undefined) {
    try {
      workflowDir = workflowFolder(card.workflow, inboxDir(), repo);
    } catch (err) {
      throw new WorkflowError(`${card.file}: \`workflow: ${card.workflow}\` — ${(err as Error).message}`);
    }
  } else throw new WorkflowError(noWorkflowRefusal(card, file, repo, workflowsIn(path.join(repo, 'workflows'))));
  if (opts.brief !== undefined && !opts.brief.trim()) {
    throw new WorkflowError(`${card.file}: the brief given in place of the card's body is empty. Give what the run is asked to do, or leave it out, and the run is asked what the card says.`);
  }
  // The card's own gate is refused in the card's words; a `--gate` beside it, by `start()` in its own.
  const flags = opts.gates ?? [];
  if (card.gate !== undefined) {
    const refusedGate = gateRefusal([card.gate], loadWorkflows(workflowDir), (step) => `${card.file}: \`gate: ${step}\``);
    if (refusedGate) throw new WorkflowError(`${refusedGate} Correct the line, or delete it.`);
  }
  const gates = [...(card.gate !== undefined && !flags.includes(card.gate) ? [card.gate] : []), ...flags];

  const run = start({
    brief: opts.brief?.trim() ?? card.body,
    repo,
    repoNamed: opts.repo !== undefined,
    workflowDir,
    isolate: opts.isolate,
    after: opts.after,
    inputs: opts.inputs,
    from: { inbox: card.name },
    ...(gates.length ? { gates } : {}),
  });
  // The card's `repo:` reached `start()` as the repository, and a folder run looks at none: said, not refused, since a card on disk cannot
  // be edited from the board. A `--repo` given here was refused by `start()` before the run was written.
  const ignoredRepo = card.repo !== undefined && !isGitRun(run) ? { ignoredRepo: card.repo } : {};
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    return { run, card, removed: false, why: `${file} could not be removed — ${(err as Error).message}`, ...ignoredRepo };
  }
  return { run, card, removed: true, ...ignoredRepo };
}

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and its `repo:` or else `repo`,
 * the daemon's — so its base is its base branch as it is now, and its brief is frozen now. Undefined with no card to start. A card whose
 * `repo:` the run looks at none of — a folder team's — carries it on `ignoredRepo`, as `wf start` says it.
 *
 * A start that does not happen is written down (`QueueTry`), and the card left as it is. A refusal — exit 2, the package's own, by name: the
 * workflow gone, the repository gone — lasts: no pass after it tries the card while it reads the same and would be tried on the same
 * repository, and the next card has its turn. Any other failure — git failing on the repository, say — is no verdict on the card: the next
 * pass tries it again, where it keeps its place, and a failure the same as the last pass's is said as `again`, and not written again. The inbox
 * and the tries are read once. A try written for a card that is no longer queued as it was is removed on the way.
 */
export function startQueued(repo: string, runs: readonly Run[] = listRuns()): QueueStarted | undefined {
  const files = inboxFiles();
  const tries = queueTries();
  const listing = inboxListing(files, runs, isDirectory, tries);
  for (const name of tries.keys()) {
    if (listing.some((l) => l.name === name && l.tried)) continue;
    try { fs.rmSync(path.join(queueDir(), `${name}.json`), { force: true }); } catch { /* removed on a pass that can */ }
  }
  const next = nextQueued(listing, repo);
  if (!next) return undefined;
  const on = next.repo ?? repo;
  // Named on the line only for a card that names no repository: whose start turns on where the daemon runs.
  const where = next.repo ? {} : { on };
  try {
    const started = startFromInbox({ name: next.name, callerRepo: repo });
    // Carried, not dropped: a card whose `repo:` the run never looked at says so wherever it was started, and a tick's line is the only
    // place a daemon's start is read (`queueLine`).
    const ignored = started.ignoredRepo !== undefined ? { ignoredRepo: started.ignoredRepo } : {};
    return started.removed
      ? { card: next.name, run: started.run.id, removed: true, ...ignored }
      : { card: next.name, run: started.run.id, removed: false, why: started.why, ...ignored };
  } catch (err) {
    const refused = (err as { exitCode?: number }).exitCode === 2;
    // On one line: git's words come with its command and its stderr, a line each.
    const why = (err instanceof Error ? err.message : String(err)).split('\n').map((line) => line.trim()).filter(Boolean).join(' / ');
    const last = next.tried;
    if (!refused && last && !last.refused && last.why === why && last.repo === on) return { card: next.name, failed: why, again: true, ...where };
    const tried: QueueTry = { at: new Date().toISOString(), text: files.find((f) => f.file === next.file)!.text, repo: on, why, refused };
    try {
      fs.mkdirSync(queueDir(), { recursive: true });
      fs.writeFileSync(path.join(queueDir(), `${next.name}.json`), JSON.stringify(tried, null, 2));
    } catch { /* said all the same; not written down, the next pass tries the card again, rather than a daemon dying on it */ }
    return refused ? { card: next.name, refused: why, ...where } : { card: next.name, failed: why, again: false, ...where };
  }
}

/**
 * One pass's work: the steps it filed, the steps whose checks it filed, the steps it tried again, and where the
 * run stands — and `notes`, each line starting with its step: what cutting a worktree had to say (a path
 * `.worktreeinclude` lists that the main checkout does not have, a line it refused, an `npm ci` that ran or
 * failed), each try and each round filed and on whose word, a blocked session the engine was asked to stop for a try, and an ask file that
 * cannot be read. `looped` names the
 * looping steps whose loop this pass took round again. `waiting` names the runs whose shipping this run's roots wait on (`waitsOf`).
 * `inFlight` says the run counts against the cap on runs in flight once this pass is done: in flight when the pass read it (`slotNeed`), or
 * filed something. `held` is the slot the cap held its roots at, on a pass that held them.
 */
export type Advanced = {
  run: Run; filed: string[]; checked: string[]; tried: string[]; looped: string[]; status: Assessment['status']; blocked: string[]; notes: string[]; waiting: Wait[];
  inFlight: boolean; held?: RunSlot;
  /** What the pass judged of the run and of each step, in the words the feed keeps (`feedWords`): what `tick` writes where they changed. */
  feed: FeedWords;
};

/**
 * Which run's `workspace: main` step holds the repository's own checkout while this run's waits for it (`heldCheckouts`) — or undefined,
 * when nothing does and this run's may be filed.
 *
 * Asked of the store on the pass that asks, never stored: only of a run whose ending step is approved and not filed, since nothing else of
 * a run works in that checkout, and then of every run of the same repository. A run is in the checkout while the engine holds its
 * `workspace: main` task in flight, as `inFlight` counts one, so a step filed earlier in this very pass is read as being in it. One waiting
 * to be filed counts only if the pass would in fact file it: a send-back of the work un-holds its gate, and an ending that will not be filed
 * must not hold another run's for ever.
 */
export async function checkoutHold(e: Engine, run: Run, steps: readonly Workflow[]): Promise<CheckoutHold | undefined> {
  const ending = steps.find((s) => s.workspace === 'main');
  // Cheap, and first: a run reads the store only where a person's word would file its own ending (`endingAsked`) — the approval of one that
  // has not run, or the ask for a try of one that has. A run with no such word is waiting for nothing, and one whose ending is in that
  // checkout is not waiting for it either; neither needs anybody else's claim read.
  if (!ending || run.cancelledAt || endingAsked(run, ending, readAsks(run.id).asks) === undefined) return undefined;
  const runs = listRuns();
  // The cap on runs in flight, read once for every claim here: a run it holds files nothing, so its ending claims nothing (`mainClaim`).
  const slots = await runSlots(e, runs);
  const mine = await mainClaim(e, run, slots.get(run.id));
  if (!mine || mine.holds) return undefined;
  const claims: MainClaim[] = [mine];
  for (const other of runs) {
    if (other.id === run.id || !isGitRun(other) || path.resolve(other.repo) !== mine.repo) continue;
    const claim = await mainClaim(e, other, slots.get(other.id));
    if (claim) claims.push(claim);
  }
  return heldCheckouts(claims).get(run.id);
}

/**
 * A run's claim on the repository's own checkout, as a pass reads it now (`MainClaim`) — or undefined for a run with no ending step, and
 * for one whose ending the pass would neither find there nor file.
 *
 * Every run is read the same way, this one and the others, so the two readings cannot drift. A step is IN that checkout while the engine
 * holds its task in flight, as `inFlight` counts one: a task the engine has lost holds nothing, since a run nobody can stop must not hold
 * every other run's ending for ever — but a run somebody called off holds it while its session is still there, between `wf cancel` asking
 * the engine to stop it and the engine settling it, because that session is still merging in that directory.
 *
 * It WAITS for the checkout on a person's word that would file it — an approval of an ending that has not run, or the ask for a try of one
 * that ended blocked (`endingAsked`) — and only where the pass would in fact file it: a send-back of the work un-holds the gate, an ask no
 * tick honours files nothing, a run waiting on runs that have not shipped files no root of its own (`runReady`), and neither does one the
 * cap on runs in flight holds (`runAdmitted`) — so an ending that will not be filed does not hold another run's. Those last two are the
 * questions `advance` asks before it files a ready step, and they bite only on a run with nothing filed: an ending is one when it is also
 * its root, which a folder whose one step merges has. Neither touches a try, since a run with a try due has started.
 */
async function mainClaim(e: Engine, run: Run, slot: RunSlot | undefined): Promise<MainClaim | undefined> {
  let steps: Workflow[];
  try { steps = stepsOf(run); } catch { return undefined; }   // a record whose workflow no longer reads files nothing
  const ending = steps.find((s) => s.workspace === 'main');
  if (!ending || !isGitRun(run)) return undefined;
  const repo = path.resolve(run.repo);
  const taskId = run.steps[ending.name]?.taskId;
  const phase = taskId ? phaseOfView(await e.view(taskId)) : 'unknown';
  if (taskId && (phase === 'pending' || phase === 'running')) return { id: run.id, repo, step: ending.name, holds: true };
  if (run.cancelledAt) return undefined;
  const { asks, rounds } = readAsks(run.id);
  const at = endingAsked(run, ending, asks);
  if (at === undefined) return undefined;
  const { views, phaseOf } = await taskPhases(e, run);
  const a = assess(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, rounds, harnessBlocked(views), spendReader(views));
  const parent = await parentsOf(e, run);
  const files = runReady(run, (id) => parent(id).shipped) && runAdmitted(run, slot);
  return (files && a.ready.includes(ending.name)) || a.retry.some((r) => r.step === ending.name)
    ? { id: run.id, repo, step: ending.name, holds: false, at }
    : undefined;
}

/**
 * One pass over one run: tick the engine, then file whatever became ready.
 *
 * Level-triggered, like everything under it: it reads the current state of each task and decides,
 * so it is safe to run repeatedly, safe to interrupt, and correct after a restart with no memory
 * of what it did last time.
 *
 * `slot` is the cap on runs in flight as `tick` judges this run (`runAdmitted`): a run with nothing filed files its roots only while a slot is
 * free, and the first pass that holds it writes when (`slotHeldAt`). Left out, nothing holds it.
 */
export async function advance(e: Engine, run: Run, slot?: RunSlot): Promise<Advanced> {
  const steps = stepsOf(run);

  // Every try's session, or only the current ones: what the earlier ones cost is read by nothing here unless a cap is in force
  // (`underBudget`), and a step answered without limit grows that read for ever.
  const { views, phaseOf } = await taskPhases(e, run, { earlierTries: underBudget(steps, run) });
  const signedOff = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const sessionBlocked = harnessBlocked(views);
  // What each try has cost, as the engine has measured it: a step over its budget is filed nothing more on the run's word.
  const spendOf = spendReader(views);
  // A person's word, read on every pass: an ask made while this pass was elsewhere is read by the next.
  const { asks, rounds: roundAsks, notes: askNotes } = readAsks(run.id);
  const adoptedRounds = await adoptRounds(e, run, steps, views, phaseOf, signedOff, asked, roundAsks, spendOf);
  const adoptedTries = await adoptTries(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, spendOf);
  const adopted = await adoptChecks(e, run, steps, views, phaseOf, signedOff, asked, spendOf);

  // A cancelled run is enforced by every pass, not only by the verb that cancelled it.
  //
  // `wf cancel` stops what it can SEE in flight, and this pass may have filed a step moments
  // after it looked. One tick later that step is asked to stop too, so the window costs a few
  // seconds of work rather than a session nobody is watching. Level-triggered, like the rest: the
  // mark is the desired state and every tick reconciles toward it, instead of the system trusting
  // that one command did everything.
  if (run.cancelledAt) {
    // A step a pass filed and died before writing down is stopped too: the record does not name it, and nothing else would.
    const unrecorded = await unrecordedSteps(e, run, steps, views, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, spendOf);
    const live = unrecorded.filter(({ taskId }) => ['pending', 'running'].includes(phaseOf(taskId)));
    for (const { taskId } of [...inFlight(run, phaseOf), ...live]) {
      // Skipped once the engine already has the request on its record, so a task taking a tick or
      // two to settle does not collect a stop-requested event every four seconds.
      if (!views.get(taskId)?.state.stopRequested) await e.stop(taskId);
    }
  }

  // Anything a finished step left uncommitted is committed for it, BEFORE a later step merges.
  //
  // A merge carries commits, not working trees. While steps shared one directory that did not
  // matter — a file written was a file the next step could read — but the moment steps fork, an
  // uncommitted file is invisible downstream and the next step answers a question it never saw.
  // Measured the hard way: a review wrote REVIEW.md, did not commit, and the responder merged a
  // branch that did not contain it. Asking every step's prose to remember is not a contract — so
  // this IS the contract: every step is told the run commits what it leaves (`closeoutContract`),
  // which is also exactly what a sandboxed step that cannot write git's metadata needs.
  //
  // Every finished step, failed and stopped too, until its check is filed or a later step works in its
  // workspace: the check judges the committed tree, and nothing it leaves behind — nor the next step's
  // work in progress — is committed under this step's name (`handOffDue`).
  //
  // And on the same passes, what a finished step named from its workspace root is collected into its files directory: before its check
  // is filed, and before a step after it works in its workspace (`collectArtifacts`).
  //
  // Only while the record is there, read at the moment of each: a run `wf rm` forgot after this pass read it is not handed off — a
  // `--no-worktree` run's workspace is a person's checkout — and its files directory is not made again.
  // Whether a step's hand-off was marked on this pass: a mark nobody writes is lost, and the next pass commits a person's edits as the step's.
  let markedHandedOff = false;
  // A pruned run owed no hand-off when its worktrees went (`pruneRefusal`), and has nowhere to hand one off from since.
  const collected = (run.pruned ? [] : handOffDue(steps, run, phaseOf)).flatMap((name) => {
    if (!fs.existsSync(runFile(run.id))) return [];
    const record = run.steps[name]!;
    let handed: ReturnType<typeof handOff>;
    if (isGitRun(run)) handed = handOff(record.workspace!, name);
    else folderPlace(runsDir()).handOff(run, name);
    // Once for the try, unless git refused the commit — a hook, a signature — which the next pass tries again.
    if (!(handed && 'error' in handed)) {
      run.steps[name] = { ...record, handedOff: record.taskId! };
      markedHandedOff = true;
    }
    return collectArtifacts(run, name, signedOff(name));
  });

  // Two runs' ending steps never work in one checkout at once (`checkoutHold`): while another run's `workspace: main` task is unsettled
  // there, this run's is not filed, whatever its approval says. Read from the world on this pass, including what the pass has already
  // filed, so the order a pass takes the runs in decides nothing, and a restart changes nothing.
  const checkout = await checkoutHold(e, run, steps);
  const assessed = assess(steps, run, phaseOf, signedOff, asked, verdictOf, asks, roundAsks, sessionBlocked, spendOf, [], checkout);
  const { check, retry, round, blocked, status } = assessed;
  // A run that waits on runs (`--after`) files its roots once every one of them has shipped, as its `wf decide` says, read on this pass.
  // Only a run with nothing filed is gated, and nothing else about it changes: once it has started its parents are never read again (`gated`).
  const parent = await parentsOf(e, run);
  const starting = !hasStarted(run);
  // And a run with nothing filed files its roots only while the cap on runs in flight leaves a slot (`runAdmitted`): one that wants a slot and
  // is not admitted is held, and files nothing.
  const need = slotNeed(run, phaseOf, assessed, (id) => parent(id).shipped, steps);
  const admitted = runAdmitted(run, slot, steps);
  const held = need.wants && !admitted ? slot : undefined;
  const ready = runReady(run, (id) => parent(id).shipped) && admitted ? assessed.ready : [];
  const waiting = waitsOf(run, parent);
  // What the pass judged, as `wf ls` words it, for the feed (`recordFeed`) — worded here, off what this pass read before it filed anything: a
  // step filed below has no view on this pass, and would read `unknown`. So a step's filing reaches the feed a pass late, as the engine's
  // `pending`. Off the same reads as the judgement, and nothing read again: the feed only reports what the pass decided on.
  const feed = feedWords(listing(
    steps, run, (taskId) => feedPhase(engineWord(views)(taskId)), (name) => closeoutOf(views, run, name), asked, verdictOf, asks, roundAsks,
    readAnswers(run.id), waiting, saidCount(views, run), spendOf, held, [], checkout, waitingOf(views),
  ), run, assessed, (name) => closeoutOf(views, run, name));

  // Another try: a refused check `retries:` still covers, or a person's `wf retry`. The step goes on in the
  // workspace and on the branch it had, under its next try's derived id, and the try it replaces moves behind
  // it on the record. Nothing about the engine changes: to it, this is one more task.
  const tried: string[] = [];
  const rechecked: string[] = [];
  const notes: string[] = [...askNotes, ...collected];
  // Read again at the moment of filing, and not only when this pass read the run: a person may have called it off, and `wf rm` forgotten it,
  // while this pass was at work — cutting a worktree, whose `npm ci` takes a minute. Filed then, a session would work in a worktree that is
  // gone, for a record no pass reads, and no stop would reach it. The world as it stands decides, and once called off, nothing more is
  // filed on this pass. A pruned run is called off the same way: whatever a person's ask says, what it would file works in a worktree
  // `wf prune` removed, or inherits one — and the marker is written before the first removal, so a pass that read the run a moment
  // before stops here too.
  let calledOff = false;
  const mayFile = (): boolean => !(calledOff ||= !fs.existsSync(runFile(run.id)) || fs.existsSync(cancelFile(run.id)) || fs.existsSync(pruneFile(run.id)));
  const endingSaid = (ending: Workflow): EndingStopped => {
    const said = signedOff(ending.name);
    return {
      step: ending.name, status: ownStatus(ending, run, phaseOf, signedOff, asked, steps, spendOf),
      ...(said?.summary ? { summary: said.summary } : {}), ...(said?.needs ? { needs: said.needs } : {}),
      onto: isGitRun(run) ? run.branch : 'the base branch',
    };
  };
  for (const r of retry) {
    const step = steps.find((s) => s.name === r.step)!;
    const record = run.steps[r.step]!;
    // A try of a step whose task has not settled — its session blocked by its harness, or asked for while it was and working again since: the
    // session is stopped first, and nothing is filed. Asked once — a task the engine already holds the request for is not asked again — and a
    // later pass, once the task has settled, reads the try due as one of a stopped step, and files it. Nothing is carried between the two: a
    // pass after a restart reads the same engine record, and does the same.
    if (r.stopFirst) {
      if (!views.get(record.taskId!)?.state.stopRequested) {
        await e.stop(record.taskId!);
        const why = r.runsOn ? 'its session runs on, asked for while its harness had blocked it' : 'its harness blocked its session';
        notes.push(`${r.step}: try ${r.try} — wf retry ${modeWord(r)}${r.message !== undefined ? ', with your answer' : ''}; ${why}, so the engine is asked to stop it, and the try is filed once it has`);
      }
      continue;
    }
    if (!mayFile()) continue;
    tried.push(r.step);
    notes.push(`${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : r.by === 'signoff' ? 'a nudge to sign off, once a round' : `wf retry ${modeWord(r)}${r.budget !== undefined ? ` --budget ${r.budget}` : ''}${r.message !== undefined ? ', with your answer' : ''}`}`);
    // A recheck files no session. Its check is filed below with the others, under the new try's id.
    if (r.mode === 'recheck') {
      run.steps[r.step] = nextTry(record, r);
      rechecked.push(r.step);
      continue;
    }

    const taskId = stepTaskId(run, r.step, r.try);
    // A try an earlier pass filed and never wrote down was adopted above. Looked up once more all the same,
    // as a check is: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.step);
      fs.mkdirSync(files, { recursive: true });
      // A nudge continues the last try's session. With none to continue — a session the harness never
      // reported — the try starts a new one, and its brief says so.
      const resumeFrom = r.mode === 'nudge' ? sessionIn(views, record.taskId!) : undefined;
      // What the check said, as data in the brief: the frozen command, its exit, and both tails.
      const refusal = record.check && step.check ? await refusalOf(e, step.check, record.check.taskId) : undefined;
      // A new session of a loop's target within a round owes replies to the round's findings, and is handed them as its first try was:
      // off the looping step's try that asked, since the looping step's own place is unfiled until the target is verified.
      const asking = resumeFrom ? undefined : askingTry(steps, run, r.step);
      const askedWith = asking ? (await e.view(asking.taskId)).state.attempts.at(-1)?.closeout : undefined;
      const findings = askedWith === undefined ? undefined : parseCloseout(askedWith);
      const reads = (name: string): Closeout | undefined =>
        (asking && name === asking.looping.name && findings && !('error' in findings) ? findings : signedOff(name));
      await e.file({
        id: taskId,
        brief: composeBrief(step, run, steps, reads, files, undefined, {
          try: r.try, by: r.by, mode: r.mode, ...(r.model ? { model: r.model } : {}), ...(r.message !== undefined ? { message: r.message } : {}),
          ...(r.budget !== undefined ? { budget: r.budget } : {}), resumed: Boolean(resumeFrom),
          // What was said to the session a nudge continues: it may never have read it (agent-engine open issue 16).
          ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
          // How the last try ended on its own work — unsigned, failed, its check — and not `over budget`, which is why nothing was filed: `budget` says that.
          // A gated step that signed off was sent back from its gate.
          status: triedFrom(step, run, phaseOf, signedOff, asked, steps, spendOf), ...(refusal ? { refusal } : {}),
          // Sent back from an ending that stopped on the base branch: how it stopped and what it said, for the step to weigh.
          ...(r.back?.length ? { ending: endingSaid(steps.find((s) => s.name === r.back![0])!) } : {}),
        }, undefined, undefined, inputsDir(run)),
        cwd: record.workspace ?? run.workspace,
        harness: step.harness,
        // A fresh try on the model it asked for, or the step's; any other the model its session was started on (`sessionModel`), so a nudge
        // after a `--model` try continues that session as it cached it.
        model: r.mode === 'fresh' ? r.model ?? step.model : sessionModel(step, record),
        effort: step.effort,
        // One window for the session's whole chain (`sessionContext`): a resumed copy keeps only the flags it is given.
        contextTokens: sessionContext(step, steps),
        permissionMode: step.permissionMode,
        // The fence goes with every try: a try is the step, and a nudge continues a session that had it.
        tools: step.tools,
        disallowedTools: step.disallow,
        allowedTools: step.allow,
        // And the bridge to claude.ai, as the step asked for it: a try is a session of the step.
        remoteControl: step.remote,
        deadlineSeconds: step.deadlineSeconds,
        maxAttempts: step.maxAttempts,
        // What is left of the cap a person raised with the try, or of the one in force, once the step's tries are taken off: handed to a harness
        // that keeps a cap (`budgetUsdFor`), so it holds the tries together to it.
        budgetUsd: budgetUsdFor(step, r.budget ?? budgetOf(step, record), stepSpend(run, r.step, spendOf)),
        // A try is never a run's first filing: it goes before a newer run's first step (`MOMENTUM`).
        priority: MOMENTUM,
        resumeFrom,
        // The step's one schema, whatever round the run is on: a nudge continues a session, and a changed schema would rebuild its cache.
        // What a loop's target owes on this try — its answers to the round's findings — is `owedFields`', read when it signs off.
        closeoutSchema: closeoutSchemaOf(step, steps),
      });
    }
    run.steps[r.step] = nextTry(record, r, taskId);
    // Sent back from an ending that stopped on the base branch: its try moves behind in the same write, so it waits for the work again.
    for (const b of r.back ?? []) run.steps[b] = sentBack(run.steps[b]!);
  }

  // Another round: a looping step said `again: true` with rounds left, or a person's `wf round` took a loop out of rounds once more. The
  // loop's target goes on in its workspace, its session continued under its next try's id and handed what the looping step declared, as data.
  // Every other step of the loop moves behind, unfiled, and a later pass files each once what it waits on is verified — a new session. To the
  // engine, this is one more task.
  const looped: string[] = [];
  for (const r of round) {
    if (!mayFile()) break;
    const looping = steps.find((s) => s.name === r.step)!;
    const target = steps.find((s) => s.name === r.target)!;
    const record = run.steps[r.target]!;
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    looped.push(r.step);
    notes.push(`${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `wf round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`);
    // A round an earlier pass filed and never wrote down was adopted above. Looked up once more all the same, as a try is.
    if (!(await e.view(taskId)).state.brief) {
      const files = artifactsDir(run, r.target);
      fs.mkdirSync(files, { recursive: true });
      const resumeFrom = record.taskId ? sessionIn(views, record.taskId) : undefined;
      await e.file({
        id: taskId,
        // Read off the closeout that asked for the round, before the record moves it behind.
        brief: composeBrief(target, run, steps, signedOff, files, undefined, undefined, {
          loop: r.step, round: r.round, rounds: capOf(looping), by: r.by, resumed: Boolean(resumeFrom),
          ...(resumeFrom ? { said: saidIn(views.get(record.taskId!)) } : {}),
        }, undefined, inputsDir(run)),
        cwd: record.workspace ?? run.workspace,
        harness: target.harness,
        // The model the session it continues runs on: a `wf retry --model` within the round before is kept (`sessionModel`).
        model: sessionModel(target, record),
        effort: target.effort,
        contextTokens: sessionContext(target, steps),
        permissionMode: target.permissionMode,
        tools: target.tools,
        disallowedTools: target.disallow,
        allowedTools: target.allow,
        remoteControl: target.remote,
        deadlineSeconds: target.deadlineSeconds,
        maxAttempts: target.maxAttempts,
        budgetUsd: budgetUsdFor(target, r.budget !== undefined && r.raise?.includes(r.target) ? r.budget : budgetOf(target, record), stepSpend(run, r.target, spendOf)),
        priority: MOMENTUM,
        resumeFrom,
        // The schema round 1 was filed with, `replies` and all (`closeoutSchemaOf`): the session is continued, and keeps its cache.
        closeoutSchema: closeoutSchemaOf(target, steps),
      });
    }
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
  }

  // The fact the run establishes for itself: each signed step's `check:`, executed where the work is.
  // An engine task on the `check` harness, so it outlives this pass, has a deadline, and is stopped
  // by a cancel like anything else. Nothing is ready on it in this pass — a follower waits for the
  // check to SETTLE, on a later one.
  const checked: string[] = [];
  for (const name of [...check, ...rechecked]) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const workspace = run.steps[name]!.workspace ?? run.workspace;
    const taskId = checkTaskId(run, name);
    // A check an earlier pass filed and never wrote down was adopted above, before this list was made.
    // Looked up once more all the same: filing an id the engine already holds would journal it twice.
    if (!(await e.view(taskId)).state.brief) {
      fs.mkdirSync(path.dirname(checkStderr(taskId)), { recursive: true });
      // Made here as well as at filing: a step filed before the run made these has none.
      const files = artifactsDir(run, name);
      fs.mkdirSync(files, { recursive: true });
      await e.file({
        id: taskId,
        harness: 'check',
        // The command from the workflow this run froze — never from the workspace it is about to judge.
        brief: checkBrief(step.check!, {
          WF_RUN: run.id, WF_STEP: name, ...(isGitRun(run) ? { WF_BASE_REF: run.baseRef } : {}), WF_WORKSPACE: workspace, WF_STDERR: checkStderr(taskId),
          WF_ARTIFACTS: files,
        }),
        cwd: workspace,
        deadlineSeconds: CHECK_DEADLINE_SECONDS,
        // One attempt, never resumed: a check that refused has said what it has to say, and running a
        // suite until it passes would let a flaky suite decide what ships.
        maxAttempts: 1,
        resume: 'never',
        // In its own pool, before a newer run's check: what follows the step waits on it.
        priority: MOMENTUM,
      });
    }
    run.steps[name] = { ...run.steps[name]!, check: { taskId } };
    checked.push(name);
  }

  /** The harness's own id for a step's session — what `--resume` takes. */
  const sessionOf = (stepName: string): string | undefined => {
    const taskId = run.steps[stepName]?.taskId;
    const attempts = taskId ? views.get(taskId)?.state.attempts : undefined;
    return attempts?.at(-1)?.nativeId ?? undefined;
  };

  // A run that waited on runs starts from its base branch as it stands now, with their work on it — not as it stood at `wf start`,
  // before they shipped. Read once, in the pass that files its roots, and written with them; every worktree and diff of the run is cut
  // from it. A run with no `after` keeps the base `wf start` recorded, as before.
  if (ready.length && starting && run.after?.length && isGitRun(run)) run.baseRef = gitSays(run.repo, 'rev-parse', '--verify', `${run.branch}^{commit}`)?.trim() || run.baseRef;
  // What those runs concluded, for the roots' briefs (`## From run <id>`): read on the same pass, and never again.
  const parents = ready.length && starting && run.after?.length ? await parentCloseouts(e, run.after) : undefined;

  const filed: string[] = [];
  for (const name of ready) {
    if (!mayFile()) break;
    const step = steps.find((s) => s.name === name)!;
    const place = await workspaceFor(run, steps, step);
    notes.push(...place.notes.map((note) => `${name}: ${note}`));
    // Asked again after the cut, which can take minutes: the worktree stays for `wf rm` to find, and nothing is filed into it.
    if (!mayFile()) break;
    // Made before the step is told of it, so the directory its brief names is there when it starts.
    const files = artifactsDir(run, name);
    fs.mkdirSync(files, { recursive: true });

    const taskId = await e.file({
      // The task id is chosen, not generated, so the harness session reads `ae/<run>-<step>/1`.
      // A person scanning their sessions then sees which run and which step, and two steps of one
      // run share a prefix — which is what makes a resumed step legible as a continuation rather
      // than a duplicate. A step of a loop filed for a later round is on a later try, and its id says which.
      id: stepTaskId(run, name, tryOf(run, name)),
      // What the steps it reads declared, if it names any in `input:` — read off the same closeouts the
      // assessment that made it ready just read, so it is handed what it was filed on.
      // And, when the run installed its `node_modules` or could not, why its start was slow or what to run. And, on a root of a run
      // that waited on runs, what they concluded.
      brief: composeBrief(step, run, steps, signedOff, files, place.deps, undefined, undefined, step.after.length ? undefined : parents, inputsDir(run)),
      cwd: place.workspace,
      harness: step.harness,
      model: step.model,
      effort: step.effort,
      // The session's context window, as `--autocompact`: past about it Claude Code compacts the conversation and carries on. A step that
      // continues another's session (`resume:`) is filed with the window that session was started with (`sessionContext`).
      contextTokens: sessionContext(step, steps),
      // Left to the engine's default (`auto`) unless the step says otherwise: a workflow runs
      // unattended by definition, and a mode that prompts is a mode that stalls.
      permissionMode: step.permissionMode,
      // The only tools the session has, when the step names them — from the workflow this run froze, like the rest.
      tools: step.tools,
      // What it may not have of them, as `--disallowedTools`: a deny beats the checkout's settings.
      disallowedTools: step.disallow,
      allowedTools: step.allow,
      // Bridged to claude.ai, where anyone signed in can drive it, only when the step says `remote: true`: never a default.
      remoteControl: step.remote,
      deadlineSeconds: step.deadlineSeconds,
      maxAttempts: step.maxAttempts,
      // What is left of the cap for this session, where its harness keeps one: `claude-detached`. A step on a later round has spent some of it.
      // On `claude` the run holds the cap between tries.
      budgetUsd: budgetUsdFor(step, budgetOf(step, run.steps[name]), stepSpend(run, name, spendOf)),
      // None on a run's first steps, and `MOMENTUM` on a step after another: a run in flight goes before a newer run's first step.
      priority: priorityOf(step),
      resumeFrom: step.resume ? sessionOf(step.resume) : undefined,
      // The shape of the step's closing statement, with the fields its `output:` declares — from the
      // workflow this run froze, never the folder. The engine hands it to the harness and records the
      // answer without reading it; what the fields mean is ours — see `Closeout`.
      // A loop's target is asked for `replies` from its first round, so every round continues its session under this same schema.
      closeoutSchema: closeoutSchemaOf(step, steps),
    });
    // The tries a round moved behind stay with it.
    run.steps[name] = { ...run.steps[name], taskId, workspace: place.workspace, branch: place.branch };
    filed.push(name);
  }
  // The first pass the cap holds a run writes when, and says so once: what the run's timeline counts its wait for a slot from.
  const heldFirst = Boolean(held && !run.slotHeldAt && mayFile());
  if (heldFirst) {
    run.slotHeldAt = new Date().toISOString();
    notes.push(`${assessed.ready.join(', ')}: ${slotWord(held!)} — filed once a run in flight settles`);
  }
  // A finished run's result branches, as git has them now: the commits `wf decide` offers to ship, kept so that git can still be asked
  // whether they are on the base once a person has deleted the branch after the merge (`isShipped`). Written only when a tip moved.
  const tipped = isGitRun(run) ? tipBranches(run, steps, status) : [];
  const tips = tipped.length && isGitRun(run) ? tipsSeen(run, tipped, refsOf(run.repo, tipped)) : undefined;
  if (tips) run.tips = tips;
  // Only to a record that is still there: a run `wf rm` forgot while this pass was at work stays forgotten (`rewriteRun`).
  if (filed.length || checked.length || tried.length || looped.length || adopted.length || adoptedTries.length || adoptedRounds.length || tips || heldFirst || markedHandedOff) rewriteRun(run);
  // After the record is written, never before: an ask is consumed once the record holds its try or its round — this
  // pass's, or one a pass that died before consuming it wrote down.
  consumeAsks(run, asks, roundAsks);

  return {
    run, filed, checked, tried, looped, status, blocked, notes, waiting,
    // A run outside the cap (`slot: none`) counts for nothing it filed either: what it files is its own watching, not a run's work.
    inFlight: !takesNoSlot(steps) && (need.inFlight || filed.length > 0 || checked.length > 0 || tried.length > 0 || looped.length > 0),
    ...(held ? { held } : {}),
    feed,
  };
}

export type Cancelled = { run: Run; plan: CancelPlan };

/**
 * Call a run off: stop what it has in flight, and write down that it is cancelled.
 *
 * Both halves matter and neither replaces the other. Stopping the session ends the work that is
 * burning right now; the mark on the run is what stops the NEXT step being filed, which the engine
 * could never know to do — it has tasks, not runs.
 *
 * The stop is asked for BEFORE the run is marked, on purpose. If the engine refuses, the run is
 * left uncancelled and asking again does both; the other order would leave a run that reads as
 * cancelled while its session ran on.
 *
 * Note what this does NOT do: write the run's json. A tick may be halfway through a pass over the
 * same run, and rewriting the record underneath it is how the mark got lost before. The
 * cancellation goes in a file only this verb writes, and `advance` enforces it on every pass —
 * which is also what covers a step filed in the moment after the stop list was taken.
 *
 * `e.stop` only records the operator's intent — the engine carries it out on its next tick and
 * confirms on the one after. That is the engine's contract, not a shortcut here, and it is why the
 * verb reports what it ASKED to stop.
 */
export async function cancel(e: Engine, id: string): Promise<Cancelled> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // A check, a try or a round filed by a pass that died before writing the run down is in flight too. Found here so
  // the verb stops it at once; on the record only in memory, because this verb never writes the run.
  const { asks, rounds } = readAsks(id);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  await adoptRounds(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), rounds, spendOf);
  await adoptTries(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks, spendOf);
  await adoptChecks(e, run, steps, views, phaseOf, closeoutReader(views, run), closeoutAsked(views), spendOf);

  const plan = cancelPlan(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), verdictOf, asks, rounds, spendOf);
  if (plan.kind === 'finished') return { run, plan };

  for (const { taskId } of plan.stop) await e.stop(taskId);
  if (plan.kind === 'already-cancelled') return { run, plan };

  return { run: { ...run, cancelledAt: markCancelled(id) }, plan };
}

/**
 * Forget a run that is over — `wf rm` — or say why not and touch nothing (`forgetRefusal`). It never stops anything: calling a run off is
 * `cancel`, a decision of its own.
 *
 * Read as `cancel` reads a run: a check, a try or a round a pass filed and never wrote down is adopted in memory, so it is in flight too.
 * Then, in an order `wf rm` can finish when it is interrupted and run again:
 *
 * 1. **Its worktrees, through git**: each git lists inside `worktrees/<id>` (`runWorktrees`). What one holds uncommitted is committed first
 *    under its step's name, as the hand-off does — a failed or stopped step's work lives only there (engine open issue 2) — and what git
 *    ignores is not work. Then `git worktree remove`, never with `--force`, and `git worktree prune`. A worktree git will not remove —
 *    locked, or still dirty — is left as it is, and so is a directory in `worktrees/<id>` git does not know; then the run is `held`, and
 *    nothing else is removed, so its record is there for `wf rm` to find it by once a person has dealt with them.
 * 2. **Its branches**, as asked (`branchFates`): kept by default; deleted merged into the run's base branch, as git says it, or forced.
 * 3. **Its record, then every file under `WF_ROOT` keyed by its id** (`removeKeyed`): the record first, so the run is never read without
 *    the cancellation it had. A pass halfway through the run writes nothing back (`rewriteRun`). The engine's tasks, journal and sessions are
 *    the engine's, and are not touched.
 *
 * A run whose record is gone is normal: what is left under its id, its files, is removed and named — never a worktree, since nothing says
 * whose they are — and a run whose worktrees or branches are already gone says so. Refused before anything is read, with exit code 2: an id
 * that is not a name (`idRefusal`).
 */
export async function forget(e: Engine, id: string, how: ForgetHow = {}): Promise<Forgot> {
  const refusedId = idRefusal(id);
  if (refusedId) throw Object.assign(new Error(refusedId), { exitCode: 2 });
  const nothing = { removed: [], handedOff: [], gone: [], left: [], branches: [], files: [] };
  const dir = path.join(HOME, 'worktrees', id);
  if (!fs.existsSync(runFile(id))) {
    const files = removeKeyed(id, undefined);
    return { id, kind: 'missing', ...nothing, files, left: lstatOf(dir) ? [{ path: dir, orphaned: true }] : [] };
  }

  const run = readRun(id);
  // A record from before runs froze their workflow reads its folder, which may be gone: judged without its steps (`forgetRefusal`).
  let steps: Workflow[] | undefined;
  let unfrozen: string | undefined;
  try { steps = stepsOf(run); } catch (err) { unfrozen = (err as Error).message; }
  const { views, phaseOf } = await taskPhases(e, run);
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  if (steps) {
    await adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
    await adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
    await adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
    // And a step a pass filed and never wrote down — on a cancelled run too, where a pass that read it before the cancel may be filing it now.
    for (const { name, taskId } of await unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf)) {
      run.steps[name] = { ...run.steps[name]!, taskId };
    }
  }
  const askAt = (a: AskName) => (a.kind === 'retry' ? askFile(id, a.step, a.n) : roundAskFile(id, a.step, a.n));
  const others = listRuns().filter((o) => o.id !== id);
  const said = { id, repo: run.repo, base: run.branch, isolate: run.isolate, ...(unfrozen ? { unfrozen } : {}) };
  // Where the result stands against the base branch, for an ending that has not run: one whose result git already has holds nothing.
  const standings = steps?.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run) : [];
  const refusal = forgetRefusal(steps, run, phaseOf, others, reader, asked, verdictOf, asks, rounds, spendOf, askAt, standings);
  if (refusal) return { ...said, kind: 'refused', refusal, ...nothing };
  // A folder run's folders are under its own directory, which goes with its record: no worktree, no branch, and no git asked.
  if (!isGitRun(run)) return { ...said, folder: true, kind: 'forgotten', ...nothing, files: removeKeyed(id, Object.keys(run.steps)) };

  // 1. The worktrees, through git — which lists each by its real path, so the run's directory and the record's are read the same way.
  const within = resolved(dir);
  const recorded = { ...run, steps: Object.fromEntries(Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st])) };
  const { worktrees, unlisted } = runWorktrees(recorded, namesInOrder(run, steps ?? []), within, parseWorktrees(gitSays(run.repo, 'worktree', 'list', '--porcelain') ?? ''));
  const removed: string[] = [];
  const handedOff: Forgot['handedOff'] = [];
  const gone = unlisted.filter((p) => !lstatOf(p));
  const left: Forgot['left'] = [];
  for (const w of worktrees) {
    // Its directory is gone, or no longer a worktree git can read: pruned below, and a directory still there is found with the strays.
    if (w.prunable && w.locked === undefined) { if (!lstatOf(w.path)) gone.push(w.path); continue; }
    // Locked, or on no branch with something a removal would leave on none (`heldWorktree`): left as it is. Git is asked of a detached one only.
    const status = w.detached && w.locked === undefined ? gitSays(w.path, 'status', '--porcelain') : undefined;
    const onBranch = w.detached && w.head && w.locked === undefined ? Boolean(gitSays(run.repo, 'for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/')?.trim()) : false;
    const hold = heldWorktree(w, { clean: status !== undefined && !status.trim(), onBranch });
    if (hold) { left.push({ path: w.path, ...hold }); continue; }
    // What it holds uncommitted, on its branch first. A hand-off git refuses leaves the work where it is, and says why.
    const handed = handOff(w.path, w.step, ', before its run was forgotten');
    if (handed && 'error' in handed) { left.push({ path: w.path, step: w.step, uncommitted: handed.error }); continue; }
    if (handed) handedOff.push({ step: w.step, ...(w.branch ? { branch: w.branch } : {}), commit: handed.commit });
    try {
      execFileSync('git', ['worktree', 'remove', w.path], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      removed.push(w.path);
    } catch (err) {
      left.push({ path: w.path, git: gitWords(err) });
    }
  }
  if (worktrees.length) gitSays(run.repo, 'worktree', 'prune');
  let strays: string[] = [];
  try { strays = fs.readdirSync(within).map((name) => path.join(within, name)); } catch { /* none cut, or already removed */ }
  for (const at of strays) if (!left.some((l) => l.path === at)) left.push({ path: at, unknown: true });
  if (left.length) return { ...said, kind: 'held', removed, handedOff, gone, left, branches: [], files: [] };

  // 2. The branches, as asked. Git says what is merged into the run's base branch, and whether it will delete a branch.
  const listed = (gitSays(run.repo, 'for-each-ref', '--format=%(refname)', `refs/heads/wf/${id}/`) ?? '')
    .split('\n').filter(Boolean).map((ref) => ref.replace(/^refs\/heads\//, ''));
  const merged = (branch: string): boolean => {
    try {
      execFileSync('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, run.branch], { cwd: run.repo, stdio: 'ignore' });
      return true;
    } catch { return false; }
  };
  const branches = branchFates(run, listed, merged, how).map((b): BranchFate => {
    if (!b.deleted) return b;
    try {
      execFileSync('git', ['branch', '-D', b.branch], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      return b;
    } catch (err) {
      return { branch: b.branch, deleted: false, why: { git: gitWords(err) } };
    }
  });

  // 3. The record, then what is keyed by its id.
  return { ...said, kind: 'forgotten', removed, handedOff, gone, left, branches, files: removeKeyed(id, Object.keys(run.steps)) };
}

/**
 * Remove the worktrees of a run that is over, and nothing else — `wf prune`. Its record, asks, closeouts and costs, its branches, its files
 * directory, its check logs and inputs, and the engine's record of its sessions are kept, so `wf decide`, `wf ls` and the board still read
 * it, and a run waiting on it still reads whether it shipped.
 *
 * Read as `wf rm` reads a run (`forget`), and refused, before anything is touched, for every reason `pruneRefusal` names: a folder run, a
 * run not over, anything that holds `wf rm`, a finished run not merged unless `unmerged`, a hand-off owed, and a worktree that is locked, on
 * no branch, or holds a change no commit has. A run with no worktree left answers `nothing`, and says why.
 *
 * Without `yes`, nothing is touched: each worktree and what it holds on disk (`du`, which counts a link and not what it points at — a
 * worktree's `node_modules` of links to the main checkout's costs nothing to keep). With it, the run is marked pruned first (`pruneFile`),
 * so that a pass reading it while its worktrees go files nothing (`advance`); then git removes each worktree — never `--force`, so a file
 * that turned up since it was read is git's refusal and not a loss — and the marker is written again with what was removed. A run left with
 * nothing removed and never pruned before is not marked. The tick never calls this.
 */
export async function prune(e: Engine, id: string, { unmerged = false, yes = false }: { unmerged?: boolean; yes?: boolean } = {}): Promise<Pruning> {
  const refusedId = idRefusal(id, 'prune');
  if (refusedId) throw Object.assign(new Error(refusedId), { exitCode: 2 });
  const run = readRun(id);
  const none = { worktrees: [], left: [] };
  const folder = pruneRefusal(run, { decided: undefined, held: null, owed: [], worktrees: [] });
  if (!isGitRun(run)) return { id, kind: 'refused', refusal: folder!, ...none };

  // The run's worktrees, as git lists them — a directory already gone is git's to forget (`git worktree prune`), not a removal.
  const within = resolved(path.join(HOME, 'worktrees', id));
  let steps: Workflow[] | undefined;
  try { steps = stepsOf(run); } catch { /* a record from before runs froze their workflow, whose folder is gone: `pruneRefusal` says so */ }
  const recorded = { ...run, steps: Object.fromEntries(Object.entries(run.steps).map(([name, st]) => [name, st.workspace ? { ...st, workspace: resolved(st.workspace) } : st])) };
  const listed = runWorktrees(recorded, namesInOrder(run, steps ?? []), within, parseWorktrees(gitSays(run.repo, 'worktree', 'list', '--porcelain') ?? '')).worktrees
    .filter((w) => !(w.prunable && w.locked === undefined));
  if (!listed.length) {
    const nothing = run.pruned ? `its worktrees were removed at ${run.pruned.at || 'a time its marker no longer says'} (wf prune)`
      : !run.isolate ? `it cut no worktree — it worked in ${run.repo} itself`
      : 'no worktree of it is left';
    if (yes && run.pruned) gitSays(run.repo, 'worktree', 'prune');
    return { id, kind: 'nothing', nothing, ...none };
  }

  // Read as `wf rm` reads it: what the engine holds, and a person has asked, adopted first, so a filing no pass has written down still holds.
  const { views, phaseOf } = await taskPhases(e, run);
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  const verdictOf = exitVerdicts(views, run);
  const spendOf = spendReader(views);
  let decided: Decision['kind'] | undefined;
  let held: string | null = null;
  let owed: string[] = [];
  if (steps) {
    await adoptRounds(e, run, steps, views, phaseOf, reader, asked, rounds, spendOf);
    await adoptTries(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, spendOf);
    await adoptChecks(e, run, steps, views, phaseOf, reader, asked, spendOf);
    for (const { name, taskId } of await unrecordedSteps(e, run, steps, views, phaseOf, reader, asked, verdictOf, asks, rounds, spendOf)) {
      run.steps[name] = { ...run.steps[name]!, taskId };
    }
    decided = decision(steps, run, phaseOf, shippedOf(run), reader, asked, verdictOf, asks, rounds, harnessBlocked(views), spendOf).kind;
    const askAt = (a: AskName) => (a.kind === 'retry' ? askFile(id, a.step, a.n) : roundAskFile(id, a.step, a.n));
    const standings = steps.some((s) => approvedFirst(s, run) && !run.steps[s.name]?.taskId) ? standingsOf(run) : [];
    // No other run is asked: one waiting on this run reads its record, which stays.
    held = forgetRefusal(steps, run, phaseOf, [], reader, asked, verdictOf, asks, rounds, spendOf, askAt, standings, 'prune');
    owed = handOffDue(steps, run, phaseOf);
  }
  // Each worktree as git has it: locked, on no branch with something a removal would leave on none (`heldWorktree`), or holding a change.
  const facts = listed.map((w) => {
    const status = w.locked === undefined ? gitSays(w.path, 'status', '--porcelain') : undefined;
    const changes = (status ?? '').split('\n').filter(Boolean).map((line) => line.slice(3));
    const onBranch = w.detached && w.head && w.locked === undefined ? Boolean(gitSays(run.repo, 'for-each-ref', '--contains', w.head, '--format=%(refname)', 'refs/heads/')?.trim()) : false;
    const hold = heldWorktree(w, { clean: status !== undefined && !changes.length, onBranch });
    // git could not read its status: taken as holding what nobody can see, and refused.
    const unread = w.locked === undefined && status === undefined ? ['(git status could not read it)'] : [];
    return { path: w.path, ...(hold ?? {}), ...(changes.length || unread.length ? { changes: [...changes, ...unread] } : {}) };
  });
  // A run once pruned was agreed to be pruned unmerged, or was merged: its merge is not asked again.
  const refusal = pruneRefusal(run, { decided, held, owed, worktrees: facts }, { unmerged: unmerged || Boolean(run.pruned) });
  if (refusal) return { id, kind: 'refused', refusal, ...none };

  const worktrees = listed.map((w) => ({ path: w.path, bytes: diskBytes(w.path) }));
  if (!yes) return { id, kind: 'prunable', worktrees, left: [] };

  const at = new Date().toISOString();
  const before = run.pruned?.worktrees ?? [];
  fs.writeFileSync(pruneFile(id), JSON.stringify({ at, worktrees: before }, null, 2));
  const removed: Array<{ path: string; bytes: number }> = [];
  const left: Pruning['left'] = [];
  for (const w of worktrees) {
    try {
      execFileSync('git', ['worktree', 'remove', w.path], { cwd: run.repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      removed.push(w);
    } catch (err) {
      left.push({ path: w.path, git: gitWords(err) });
    }
  }
  gitSays(run.repo, 'worktree', 'prune');
  try { fs.rmdirSync(within); } catch { /* not empty: what git would not remove is still there */ }
  if (!removed.length && !run.pruned) fs.rmSync(pruneFile(id), { force: true });
  else fs.writeFileSync(pruneFile(id), JSON.stringify({ at, worktrees: [...before, ...removed] }, null, 2));
  return { id, kind: 'pruned', worktrees: removed, left, at };
}

/** What a directory holds on disk, in bytes, as `du` counts it: a link as a link. Zero when `du` cannot say. */
function diskBytes(dir: string): number {
  try {
    const out = execFileSync('du', ['-sk', dir], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return (Number.parseInt(out, 10) || 0) * 1024;
  } catch (err) {
    // `du` says what it could not read on stderr, and still totals the rest.
    const out = (err as { stdout?: string }).stdout ?? '';
    return (Number.parseInt(out, 10) || 0) * 1024;
  }
}

/**
 * A path as git names a worktree: every link on the way followed, as far as the path exists, and the rest as written. A store under a
 * link — a home directory on another disk, or macOS's `/var` in `/private/var` — would otherwise hold no worktree git lists.
 */
function resolved(p: string): string {
  try {
    return fs.realpathSync(p);
  } catch {
    const parent = path.dirname(p);
    return parent === p ? p : path.join(resolved(parent), path.basename(p));
  }
}

/** What git said when it refused, in one line: the first of its stderr, or of the error. */
const gitWords = (err: unknown): string => {
  const { stderr, message } = err as { stderr?: string; message?: string };
  return (stderr?.trim() || message || String(err)).split('\n')[0]!;
};

/**
 * Remove what is under `WF_ROOT` keyed by a run's id, and answer with each path removed, from `WF_ROOT`: its record first, then its
 * cancellation, its pruning, its asks, its own directory (inputs, artifacts), its check logs (`checkLogsOf`, by the steps `names`, or without them any
 * under its id that is no other stored run's), and `worktrees/<id>` once it is empty. Nothing else, and never the engine's.
 */
function removeKeyed(id: string, names: readonly string[] | undefined): string[] {
  const removed: string[] = [];
  const remove = (at: string) => {
    const st = lstatOf(at);
    if (!st) return;
    fs.rmSync(at, { recursive: true, force: true });
    removed.push(`${path.relative(HOME, at)}${st.isDirectory() ? '/' : ''}`);
  };
  for (const at of [runFile(id), cancelFile(id), pruneFile(id), asksDir(id), path.join(runsDir(), id)]) remove(at);
  const checks = path.join(HOME, 'checks');
  let logs: string[] = [];
  try { logs = fs.readdirSync(checks); } catch { /* no check ever ran */ }
  let otherIds: string[] = [];
  try { if (!names) otherIds = fs.readdirSync(runsDir()).filter((f) => f.endsWith('.json')).map((f) => path.basename(f, '.json')); } catch { /* no runs at all */ }
  for (const file of checkLogsOf(id, names, logs, otherIds)) remove(path.join(checks, file));
  try {
    fs.rmdirSync(path.join(HOME, 'worktrees', id));
    removed.push(`worktrees/${id}/`);
  } catch { /* none, or not empty */ }
  return removed;
}

/** One pass: every run advanced, in the store's order, and what the pass did with the queue of inbox cards, when it did anything (`startQueued`). */
export type Pass = {
  runs: Advanced[]; queue?: QueueStarted;
  /** Why the feed could not be written on this pass (`recordFeed`), when it could not: the pass itself went on, since nothing reads the feed to decide. */
  feedError?: string;
};

/**
 * Every run, advanced once, after one engine tick — then, with a run slot free, the queue's next card started. This is the whole daemon.
 *
 * Every run that has started first, which the cap on runs in flight (`WF_MAX_RUNS`) never holds: what each has in flight once its pass is done
 * is what the cap counts. Then each run with nothing filed, oldest first (`admissionOrder`), judged against the runs in flight so far — and
 * counted, once it filed, for the next (`runAdmitted`). Then, while a slot is still free (`slotFree`) — always, with no cap — one queued card
 * is started, on `repo` when its card names none: one per pass, so the next pass counts its run before another is started. Nothing is carried
 * between passes: the next one counts again.
 */
export async function tick(e: Engine, { repo = process.cwd() }: { repo?: string } = {}): Promise<Pass> {
  await e.tick();
  const ran = ceilings();
  // What `wf ls` and `wf decide` judge the cap by, from a shell of their own.
  recordCeilings(ran);
  const cap = ran.runs;
  const runs = listRuns();
  const done = new Map<string, Advanced>();
  // A finished run still gets assessed — it costs one read and it is how `ls` stays honest.
  for (const run of runs.filter(hasStarted)) done.set(run.id, await advance(e, run));
  let counted = [...done.values()].filter((a) => a.inFlight).length;
  for (const run of admissionOrder(runs.filter((r) => !hasStarted(r)))) {
    const advanced = await advance(e, run, { inFlight: counted, cap });
    done.set(run.id, advanced);
    if (advanced.inFlight) counted++;
  }
  const queue = slotFree({ inFlight: counted, cap }) ? startQueued(repo, runs) : undefined;
  // Last, and apart: what the pass judged, written where it changed. A feed that cannot be written costs the report, never the pass.
  let feedError: string | undefined;
  try {
    recordFeed(new Map(runs.map((run) => [run.id, done.get(run.id)!.feed])));
  } catch (err) {
    feedError = `the feed (${feedFile()}) was not written on this pass: ${(err as Error).message}`;
  }
  return { runs: runs.map((run) => done.get(run.id)!), ...(queue ? { queue } : {}), ...(feedError ? { feedError } : {}) };
}

/**
 * The runs the cap on runs in flight holds now, each with the count it is held at (`heldRuns`): every run read as a pass reads it, between
 * passes — what `wf ls` and `wf decide` say. None, and nothing read, with no cap or no run that has nothing filed. A record whose workflow
 * no longer reads is left out, as nothing of it could be filed.
 *
 * The cap is the one the last pass ran with (`lastCeilings`), not the caller's environment, which is a shell's and not the daemon's; before
 * any pass has written it, the caller's own (`WF_MAX_RUNS`, refused by name when it is not a count).
 */
export async function runSlots(e: Engine, runs: readonly Run[] = listRuns()): Promise<Map<string, RunSlot>> {
  const cap = lastCeilings()?.runs ?? runCapOf(process.env.WF_MAX_RUNS);
  if (cap <= 0 || !runs.some((r) => !hasStarted(r) && !r.cancelledAt)) return new Map();
  const needs: Array<Pick<Run, 'id' | 'createdAt'> & { inFlight: boolean; wants: boolean }> = [];
  for (const run of runs) {
    let steps: Workflow[];
    try { steps = stepsOf(run); } catch { continue; }
    const { views, phaseOf } = await taskPhases(e, run);
    const { asks, rounds } = readAsks(run.id);
    const a = assess(steps, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, rounds, harnessBlocked(views), spendReader(views));
    const parent = await parentsOf(e, run);
    needs.push({ id: run.id, createdAt: run.createdAt, ...slotNeed(run, phaseOf, a, (id) => parent(id).shipped, steps) });
  }
  return heldRuns(needs, cap);
}

/**
 * The engine's own word for a task's phase, off views already read — but `unknown` for a task it has no record of, as `phaseOfView` has it:
 * the engine folds that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight. What `wf ls`
 * prints beside a step, and what the feed words it from (`feedPhase`).
 */
const engineWord = (views: ReadonlyMap<string, TaskView>) => (taskId: string): string => {
  const v = views.get(taskId);
  return v?.state.brief ? v.phase : 'unknown';
};

/**
 * What `wf ls` shows for one run — the pure call, over one read of each task.
 *
 * The phase beside a step is the engine's own word (`running (working)`, `needs-human`), not the
 * narrowed `TaskPhase` the DAG decides on: a person reading the list wants the detail.
 */
export async function list(e: Engine, run: Run, slot?: RunSlot): Promise<Listing> {
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // Only a refused check's log is read here: its exit code is the one number on its line.
  const refused = await checkReports(e, run, steps, phaseOf, (p) => p === 'failed' || p === 'stopped');
  const { asks, rounds } = readAsks(run.id);
  // And where the run's result stands against the base branch, read off git on this pass: what says a finished run is one nobody has decided.
  const standings = standingsOf(run);
  // And which run's ending step has the repository's own checkout, when this run's waits for it: read of the store, as the pass that would file it reads it.
  const checkout = await checkoutHold(e, run, steps);
  return listing(steps, run, engineWord(views), (name) => closeoutOf(views, run, name), closeoutAsked(views), (name) => refused.get(name)?.verdict, asks, rounds, readAnswers(run.id), waitsOf(run, await parentsOf(e, run)), saidCount(views, run), spendReader(views), slot, standings, checkout, waitingOf(views));
}

/**
 * How many times a person said something to each step's current try while it ran (`wf say`): the engine's `said` on the try's task, off
 * views already read. Exported, log-free, for a consumer that words a step as `wf ls` does.
 */
export const saidCount = (views: ReadonlyMap<string, TaskView>, run: Run) => (stepName: string): number => {
  const taskId = run.steps[stepName]?.taskId;
  return (taskId ? views.get(taskId)?.state.said?.length : undefined) ?? 0;
};

/** What was said to a task's sessions while they ran (`wf say`), off its view: none for a task with no view, or one from before `said`. */
const saidIn = (view: TaskView | undefined): readonly Said[] => view?.state.said ?? [];

/** A person's ask, written: the run, the ask and its file — and `stopFirst`, when the tick stops the step's blocked session before it files the try. */
export type Asked = { run: Run; ask: RetryAsk; file: string; stopFirst: boolean };

/**
 * Ask for another try of a step — `wf retry` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`retryRefusal`): a message that is empty or rides on
 * `--recheck`, a step that is not waiting on a person, a cancelled run, an ask for that try already there. Like a
 * cancellation, the ask is the person's own file, and the verb never writes the run's json, which the tick owns. What
 * the person said goes in the ask, `message`, and nowhere else: the tick carries it into the try's brief.
 *
 * `stopBlocked` takes a step whose session its harness blocked, with nothing signed (`retryable`): the ask is written as any other, and
 * the tick stops that session before it files the try. `wf retry` passes it, and so does the board's `POST …/retry`. Left out, such a
 * step is running and refused as one: a caller takes the harness's word on purpose, never by default.
 */
export async function retry(e: Engine, id: string, stepName: string, how: RetryHow, { stopBlocked = false }: { stopBlocked?: boolean } = {}): Promise<Asked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const blocked = stopBlocked ? harnessBlocked(views) : () => false;
  const spendOf = spendReader(views);
  const refusal = (asks: readonly RetryAsk[]) =>
    retryRefusal(steps, run, stepName, how, phaseOf, closeoutReader(views, run), closeoutAsked(views), exitVerdicts(views, run), asks, blocked, spendOf);
  const refuse = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

  const refused = refusal(readAsks(id).asks);
  if (refused) refuse(refused);
  const ask: RetryAsk = {
    step: stepName, try: tryOf(run, stepName) + 1, mode: how.mode, ...(how.model ? { model: how.model } : {}),
    ...(how.message !== undefined ? { message: how.message } : {}), ...(how.budget !== undefined ? { budget: how.budget } : {}), at: new Date().toISOString(),
  };
  const file = askFile(id, stepName, ask.try);
  // Someone asked in the moment since the look above: said as the look would have said it. Or a file is at the ask's name that no pass reads as one.
  if (!writeAsk(file, ask)) {
    refuse(refusal(readAsks(id).asks) ?? strayAsk(file, askIn(file, stepName, ask.try), `try ${ask.try} of ${stepName}`, `wf retry ${id} ${stepName}`)
      ?? `try ${ask.try} of ${stepName} is already asked for. Wait for it: wf ls ${id}.`);
  }
  const step = steps.find((s) => s.name === stepName)!;
  return { run, ask, file, stopFirst: retryable(step, run, phaseOf, closeoutReader(views, run), closeoutAsked(views), steps, blocked, spendOf).blockedByHarness };
}

/** What `wf approve` did: the run, the approval as written, and its file. */
export type Approved = { run: Run; approval: Approval; file: string };

/**
 * Approve a step waiting at its gate — `wf approve` — by writing the approval, and nothing else: `runs/<id>.asks/approve-<step>-<try>`, whole and
 * exclusively, beside the retry asks, with the time and the words given (`message`). The next tick reads it with the run (`readRun`) and files
 * what waits on the step, handing each step after the gate the words under `## Approved`. Like a retry ask it is the person's own file, and the
 * verb never writes the run's json.
 *
 * Refused before anything is written, exit 2, with what to do instead: a run not there; and what `approvalRefusal` refuses — empty words, a
 * step the run does not have, a cancelled run, a step not gated, not signed off yet, or already approved, and a send-back already asked for.
 * A file at the approval's name that is not one is named, with how to clear it.
 *
 * Sending back is not this verb's: `wf retry <run> <step> --message "<objection>"` — the try it files is one this approval does not name.
 */
export async function approve(e: Engine, id: string, stepName: string, message?: string): Promise<Approved> {
  const refuse = (words: string): never => { throw Object.assign(new Error(words), { exitCode: 2 }); };
  if (!fs.existsSync(runFile(id))) refuse(`no such run: ${id}. wf approve takes a run by its id, as wf ls lists it: wf approve <runId> <step>.`);
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  // Where the result stands against the base branch, read off git, for an ending that merges: one whose result is already on the base has
  // nothing to merge. Asked of git only for such a step — no other gate's approval turns on it.
  const standings = steps.some((s) => s.name === stepName && approvedFirst(s, run)) ? standingsOf(run) : [];
  const refusal = (now: Run) => approvalRefusal(steps, now, stepName, message, phaseOf, closeoutReader(views, now), closeoutAsked(views), exitVerdicts(views, now), readAsks(id).asks, spendReader(views), standings);
  const refused = refusal(run);
  if (refused) refuse(refused);
  const approval: Approval = { step: stepName, try: tryOf(run, stepName), at: new Date().toISOString(), ...(message !== undefined ? { message } : {}) };
  const file = approvalFile(id, stepName, approval.try);
  // Someone approved in the moment since the look above: said as the look would have said it. Or a file is at the name that opens no gate.
  if (!writeAsk(file, approval)) {
    const read = approvalIn(file, stepName, approval.try);
    refuse(refusal(readRun(id)) ?? (typeof read === 'string' && lstatOf(file)
      ? `try ${approval.try} of ${stepName} cannot be approved: ${file} is already there, and it is not an approval — ${read}. It opens no gate, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then approve again: wf approve ${id} ${stepName}.`
      : `try ${approval.try} of ${stepName} is already approved. What waits on it is filed on the next tick: wf ls ${id}.`));
  }
  return { run, approval, file };
}

/** What `wf say` did: the step's task the words were said to, the try that task is, and the engine's `said` entry, as it journalled it. */
export type Told = { run: Run; taskId: string; try: number; said: Said };

/**
 * Tell a step's running session something — `wf say` — through the engine's `say`, on the step's current try's task: the one `retry` would
 * replace, as `run.steps[step].taskId` names it. The engine hands the words to the session through its harness, then journals them as a
 * `said` entry on the task, which is the record: this verb writes nothing of its own, and `wf ls` and `wf decide` read the words back off
 * the engine's view of the task.
 *
 * Refused before the engine is asked, with what to do instead (`sayRefusal`): a step the run does not have, a cancelled run, a step with no
 * task filed, and one whose task has settled. Then the engine's refusals pass through as it words them, exit code 2 and all — empty words,
 * an attempt not started, a harness with no way in, a session its harness does not list running — and so does a failure to deliver, which
 * journals nothing and has no exit code: ask again.
 */
export async function say(e: Engine, id: string, stepName: string, text: string): Promise<Told> {
  const run = readRun(id);
  const steps = stepsOf(run);
  // Only the step's own task is read: the engine's `say` observes its harness again, and a run's other tasks have no say in it.
  const taskId = run.steps[stepName]?.taskId;
  const phase = taskId ? phaseOfView(await e.view(taskId)) : 'unknown';
  const refused = sayRefusal(steps, run, stepName, () => phase);
  if (refused) throw Object.assign(new Error(refused), { exitCode: 2 });
  return { run, taskId: taskId!, try: tryOf(run, stepName), said: await e.say(taskId!, text) };
}

/**
 * Why an ask cannot be written where a file that is not one already stands, in words that name it — or null, when there is none: the file reads
 * as an ask, or it is gone, consumed by a pass since the verb looked. `read` is the file read as the tick reads it (`askIn`, `roundAskIn`).
 *
 * An ask is written under its try's name, exclusively, and never over a file there. One that does not read as an ask — `{}`, a hand edit, a torn
 * copy — is honoured by no pass, and `wf ls` shows nothing asked, so "already asked for, wait for it" would be a wait for ever. The way out is a
 * person's: delete the file, and ask again.
 */
function strayAsk(file: string, read: RetryAsk | RoundAsk | string, what: string, again: string): string | null {
  if (typeof read !== 'string' || !lstatOf(file)) return null;
  return `${what} cannot be asked for: ${file} is already there, and it is not an ask — ${read}. No tick honours it, and wf ls shows nothing asked, so waiting would be for ever. Delete it (rm ${file}), then ask again: ${again}.`;
}

export type RoundAsked = { run: Run; ask: RoundAsk; file: string };

/**
 * Ask for one more round of a loop whose rounds are spent — `wf round` — by writing the ask, and nothing else. The next tick honours it once.
 *
 * Refused before anything is written, with what to do instead (`roundAsk`): a round still running, one the run files itself, a loop that
 * ended without asking again, a step of the loop that stopped, a cancelled run, a round already asked for. Like `wf retry`'s, the ask is the
 * person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be left out when the run has one loop.
 * `budget` raises the cap of each step of the loop over its budget, for a round held on it: the ask carries it, and the tick keeps it.
 */
export async function round(e: Engine, id: string, stepName?: string, budget?: number): Promise<RoundAsked> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const answer = (asks: readonly RoundAsk[]) => roundAsk(steps, run, stepName, phaseOf, closeoutReader(views, run), closeoutAsked(views), asks, spendReader(views), budget);
  const refuse = (message: string): never => { throw Object.assign(new Error(message), { exitCode: 2 }); };

  const first = answer(readAsks(id).rounds);
  if ('refusal' in first) return refuse(first.refusal);
  const ask: RoundAsk = { step: first.step, round: first.round, ...(first.budget !== undefined ? { budget: first.budget } : {}), at: new Date().toISOString() };
  const file = roundAskFile(id, ask.step, ask.round);
  // Someone asked in the moment since the look above: said as the look would have said it.
  if (!writeAsk(file, ask)) {
    const now = answer(readAsks(id).rounds);
    refuse('refusal' in now ? now.refusal
      : strayAsk(file, roundAskIn(file, ask.step, ask.round), `round ${ask.round} of ${ask.step}'s loop`, `wf round ${id} ${ask.step}`)
        ?? `round ${ask.round} of ${ask.step}'s loop is already asked for. Wait for it: wf ls ${id}.`);
  }
  return { run, ask, file };
}

export type Accepted = { run: Run; acceptance: Acceptance; file: string };

/**
 * End a loop out of rounds on a person's word, with what they said — `wf accept` — by writing the acceptance, and nothing else. From the
 * next tick the looping step reads as having handed on, and what waits on it is filed: a gated ending goes to its gate, `awaiting
 * approval`, and is approved or not as ever.
 *
 * Refused before anything is written, with what to do instead (`acceptAsk`): no words, a round the run files itself or that waits on a
 * budget, a round already asked for, a loop that ended `again: false`, a round still running, a try already accepted, a cancelled run. Like
 * `wf round`'s, the acceptance is the person's own file, and the verb never writes the run's json, which the tick owns. `stepName` may be
 * left out when the run has one loop.
 *
 * Going round once more is not this verb's: `wf round <run> [<step>]` — and the two are offered side by side (`roundLines`).
 */
export async function accept(e: Engine, id: string, stepName?: string, message?: string): Promise<Accepted> {
  const refuse = (words: string): never => { throw Object.assign(new Error(words), { exitCode: 2 }); };
  if (!fs.existsSync(runFile(id))) refuse(`no such run: ${id}. wf accept takes a run by its id, as wf ls lists it: wf accept <runId> [<step>] --message "<why>".`);
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const answer = (now: Run, rounds: readonly RoundAsk[]) => acceptAsk(steps, now, stepName, message, phaseOf, closeoutReader(views, now), closeoutAsked(views), rounds, spendReader(views));

  const first = answer(run, readAsks(id).rounds);
  if ('refusal' in first) return refuse(first.refusal);
  const acceptance: Acceptance = { step: first.step, try: first.try, at: new Date().toISOString(), message: message! };
  const file = acceptFile(id, acceptance.step, acceptance.try);
  // Someone accepted in the moment since the look above: said as the look would have said it. Or a file is at the name that ends no loop.
  if (!writeAsk(file, acceptance)) {
    const now = answer(readRun(id), readAsks(id).rounds);
    const read = acceptanceIn(file, acceptance.step, acceptance.try);
    refuse('refusal' in now ? now.refusal
      : typeof read === 'string' && lstatOf(file)
        ? `try ${acceptance.try} of ${acceptance.step} cannot be accepted: ${file} is already there, and it is not an acceptance — ${read}. It ends no loop, and no tick moves it, so waiting would be for ever. Delete it (rm ${file}), then accept again: wf accept ${id} ${acceptance.step} --message "<why>".`
        : `try ${acceptance.try} of ${acceptance.step} is already accepted. What waits on it is filed on the next tick: wf ls ${id}.`);
  }
  return { run, acceptance, file };
}

/**
 * What a settled check said, for a person to read.
 *
 * `passed` is the engine's settled phase — the worker's reading of the exit code, and the only thing
 * the run gates on. The rest is evidence: the number from the log's last line, and the last lines of
 * each stream, kept apart because a loud stderr must not push a test runner's stdout verdict off the
 * screen.
 */
export type CheckReport = { command: string; passed: boolean; verdict: Verdict; stdout: string; stderr: string };

async function checkReports(
  e: Engine,
  run: Run,
  steps: readonly Workflow[],
  phaseOf: (taskId: string) => TaskPhase,
  want: (phase: TaskPhase) => boolean,
): Promise<Map<string, CheckReport>> {
  const reports = new Map<string, CheckReport>();
  for (const step of steps) {
    const taskId = run.steps[step.name]?.check?.taskId;
    if (!taskId || !step.check || !want(phaseOf(taskId))) continue;
    reports.set(step.name, { passed: phaseOf(taskId) === 'succeeded', ...(await refusalOf(e, step.check, taskId)) });
  }
  return reports;
}

/** What a check said, off its log and its stderr file: the verdict, and the last lines of each stream. */
async function refusalOf(e: Engine, command: string, taskId: string): Promise<CheckRefusal> {
  const log = await e.logs(taskId);
  return { command, verdict: readVerdict(log), stdout: stdoutTail(log), stderr: lastLines(tailOf(checkStderr(taskId))) };
}

/** The end of a file that may be large, or absent — a check stopped before it started wrote none. */
function tailOf(file: string, bytes = 64_000): string {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const buf = Buffer.alloc(Math.min(size, bytes));
      fs.readSync(fd, buf, 0, buf.length, size - buf.length);
      return buf.toString('utf8');
    } finally { fs.closeSync(fd); }
  } catch { return ''; }
}

/**
 * Where the run's work ended up, for a person who now has to go and look at it.
 *
 * A branch, not a directory: the worktree is scaffolding and gets removed, the branch is the
 * result and stays in the repository. Reported as soon as a terminal step has a branch, so it is
 * useful while the run is still going, not only afterwards.
 */
/**
 * How a step signed off: its closing statement, as the engine recorded it on the attempt.
 *
 * The engine carries the payload and never reads it; this reads it. No git and no path — the step
 * made the statement to its harness, and it lives on the engine's record of the attempt that made
 * it, which is also what keeps a resumed step from being credited with its parent's.
 */
export function closeoutOf(views: ReadonlyMap<string, TaskView>, run: Run, stepName: string): Closeout | { error: string } | undefined {
  const taskId = run.steps[stepName]?.taskId;
  const said = taskId ? views.get(taskId)?.state.attempts.at(-1)?.closeout : undefined;
  return said === undefined ? undefined : parseCloseout(said);
}

/** Only the well-formed ones, for the pure functions that just want the outcome. */
export const closeoutReader = (views: ReadonlyMap<string, TaskView>, run: Run) => (stepName: string): Closeout | undefined => {
  const c = closeoutOf(views, run, stepName);
  return c && !('error' in c) ? c : undefined;
};

/**
 * A run another waits on (`--after`), read by the pass that asks and carried nowhere — what `runReady` and `waitsOf` are handed.
 *
 * Shipped is the run's own `wf decide`'s word, and nothing stricter or looser: `decision` says `shipped` — the run is not running, it was
 * not cancelled, and every result branch is on its base branch (`isShipped`), with work past its base or with every step succeeded. A child
 * starts when its parent's `wf decide` says shipped, and a child waits exactly while it does not. A result branch is cut at its run's base,
 * which is on the base branch, so a branch nobody has committed to is on it from the moment it is cut: a parent still running has not shipped
 * for that, nor one that ended failed, blocked or unsigned with nothing committed; one whose steps all signed off with nothing to commit has,
 * as its `wf decide` says. A run that worked on its base branch itself (`--no-worktree`) never has.
 *
 * Git first, which costs no harness observe: a result branch not on the base branch has not shipped, whatever the run's steps say. The
 * engine's view of the parent's tasks is read only once every one is.
 *
 * A result branch git no longer has is read by the tip the parent's own tick recorded once it had finished (`tipsSeen`, `isShipped`), so
 * the diamond's first parent merged and cleaned up while the second is still in review still counts. One whose tip git cannot find on
 * the base — dropped unmerged, or deleted before any tick saw its run finish — is `gone`, and not shipped. A run that started before the
 * branch was deleted never asks (`gated`).
 */
export async function parentOf(e: Engine, id: string): Promise<ParentRun> {
  const known = parentRecord(id);
  const { record } = known;
  if (!record || record.cancelledAt || known.gone) return { ...known, shipped: false };
  let steps: Workflow[];
  try { steps = stepsOf(record); } catch { return { ...known, shipped: false }; }
  const branches = resultSteps(steps).map((s) => record.steps[s.name]?.branch).filter((b): b is string => Boolean(b));
  if (!branches.length || !branches.every(shippedOf(record))) return { ...known, shipped: false };
  const { views, phaseOf } = await taskPhases(e, record);
  const { asks, rounds } = readAsks(id);
  const said = decision(steps, record, phaseOf, shippedOf(record), closeoutReader(views, record), closeoutAsked(views), exitVerdicts(views, record), asks, rounds, () => false, spendReader(views));
  return { ...known, shipped: said.kind === 'shipped' };
}

/** The runs this run waits on, each read once (`parentOf`) — and none, without a look, for a run the gate no longer applies to (`gated`). */
async function parentsOf(e: Engine, run: Run): Promise<(id: string) => ParentRun> {
  const read = new Map<string, ParentRun>();
  if (gated(run)) for (const id of new Set(run.after)) read.set(id, await parentOf(e, id));
  return (id) => read.get(id) ?? { shipped: false };
}

/**
 * What each run this one waited on concluded, for its roots' briefs (`## From run <id>` in `composeBrief`): the first line of its brief, and
 * the closeout of each step whose work is that run's result (`resultSteps`), on the engine's record of its current try, read as `wf decide`
 * reads one (`closeoutOf`). Read once, on the pass that files the roots.
 *
 * The result's steps, not the terminal ones: where a folder's last step is an ending that merges (`workspace: main`), that step's account
 * is of the merge — "merged wf/…/implement onto main, the check passed" — and it declares nothing, so a child handed it would be handed
 * nothing about the work. What the child wants is what the work said, which is the step the ending acts on. A folder with no ending step
 * is unchanged: its terminal steps are its result.
 *
 * It never throws: a parent whose record or workflow no longer reads, a step never filed, a task the engine holds
 * no closeout for — a failed step whose work a person merged all the same — and a closeout that does not parse each say so in the section,
 * and the roots are filed all the same.
 */
async function parentCloseouts(e: Engine, ids: readonly string[]): Promise<ParentCloseout[]> {
  const out: ParentCloseout[] = [];
  for (const id of new Set(ids)) {
    let record: Run;
    let steps: Workflow[];
    try {
      record = readRun(id);
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
      if (!c) said.push({ name: step.name, unreadable: `the engine holds no closeout for its task ${taskId}, which is ${phaseOfView(view)}` });
      else if ('error' in c) said.push({ name: step.name, unreadable: `its closeout cannot be read: ${c.error}` });
      else said.push({ step, said: c });
    }
    out.push({ run: id, asked: record.brief.split('\n')[0]!, steps: said });
  }
  return out;
}

/**
 * What each step's current task consumed, summed over its attempts (`sumUsage`): the try whose closeout
 * and check `wf decide` prints beside it. A settled attempt's usage is on the engine's record, the one in
 * flight on the view; an attempt that never started consumed nothing, and is left out.
 *
 * Off views already read, not a view of its own: each `e.view` is a harness observe (~300 ms, plan §4b),
 * so `decide` reads each task once and hands its views here.
 */
export function consumption(views: ReadonlyMap<string, TaskView>, run: Run): Record<string, Consumed | undefined> {
  const used: Record<string, Consumed | undefined> = {};
  for (const [name, { taskId }] of Object.entries(run.steps)) {
    const v = taskId ? views.get(taskId) : undefined;
    if (!v) continue;
    used[name] = taskUsage(v);
  }
  return used;
}

/**
 * When each task was filed, off the engine's feed from `after`, added to `into`: the one record of a filing time, since a task's view
 * carries none — and the time between filing and a first attempt is the wait for a slot (`timeline`). A filing is written once and never
 * changes, so a reader that keeps `into` and the cursor reads on from where it stopped. A feed that cannot be read rejects, as the engine's does.
 */
export async function readFilings(e: Engine, after = 0, into = new Map<string, string>()): Promise<{ filed: Map<string, string>; cursor: number }> {
  const { entries, cursor } = await e.feed(after);
  for (const { taskId, event } of entries) if (event.kind === 'filed') into.set(taskId, event.at);
  return { filed: into, cursor };
}

/** A step's current try that a person answered: the try, what they said, and what the try before it needed, when it said. */
export type Answered = { try: number; message: string; needs?: string };

/** What is left for a person to do — the pure call, with git asked the one question it owns. */
export async function decide(e: Engine, id: string): Promise<{
  run: Run;
  decision: Decision;
  closeouts: Record<string, Closeout | { error: string } | undefined>;
  /** Every settled check, by step: what the run's own fact about the step says. */
  checks: Record<string, CheckReport>;
  /** The tries the next tick files: asked for, or covered by `retries:`. */
  retrying: Retry[];
  /** The rounds the next tick files: asked for with `again: true`, or with `wf round`. */
  rounding: Round[];
  /** For each loop out of rounds, the `wf round` that goes once more (`roundLines`); for each step a person may try again, the `wf retry` (`retryLines`). */
  offers: string[];
  /** The OVER BUDGET line, saying why each step over its budget is held (`overBudgetLine`); undefined with none. */
  overBudgetLine?: string;
  /** What each filed step's current try consumed (`consumption`), off the views read for the rest. */
  used: Record<string, Usage | undefined>;
  /** For each step with a try, its `cost` line (`costLine`): its current try's, its tries' together where there were more, and the cap in force. */
  costs: Record<string, string>;
  /** The run's `cost` line, after its steps (`runCostLines`): every step's tries together. None before any attempt has ended. */
  runCost: string[];
  /** For each step whose current try a person answered, the answer beside the `needs` it answers (`Answered`). */
  answers: Record<string, Answered>;
  /** For each step that signed off blocked and may be tried again, the `wf retry --message` that answers it (`answerLines`). */
  answering: Record<string, string>;
  /** For each gated step with something to say, what its gate says (`gateLines`): approved, when and with what words, or awaiting approval and the commands. */
  gates: Record<string, string>;
  /** For each looping step whose loop a person ended as it stands (`acceptedLines`): when, and the words they gave — why its findings are open. */
  accepted: Record<string, string>;
  /**
   * For each step whose session the harness blocked and that says what it waits for, the sentence a person acts on (`harnessWaitLine`):
   * `waiting for a permission prompt — answer it in Claude Code: claude agents, session ae/<task>/1`. Off the views already read, so it
   * costs no observation; empty for a harness that says nothing, which is every harness but Claude Code's.
   */
  waitingOn: Record<string, string>;
  /** The runs this run's roots wait on (`waitsOf`): while there are any, that is the whole of what there is to say. */
  waiting: Wait[];
  /** For each step, what a person said to its sessions while they ran (`wf say`), try by try, off the engine's view of each try's task (`saidLines`). */
  said: Record<string, SaidTo[]>;
  /**
   * Where the run's time went, per try and per check (`timeline`): off the engine's view of every try's task and check, and the filing times
   * on its feed. A feed that cannot be read leaves every queue time `not known`, and the screen printed all the same.
   */
  timeline: Timeline;
  /** The cap on runs in flight holding this run, with nothing of it filed, and the count it is held at (`runSlots`); absent when it holds none. */
  held?: RunSlot;
  /** Where each result branch stands against the base branch, as git says it now (`branchStandings`): the fact under the run's result. */
  standings: BranchStanding[];
  /** The run whose ending step has the repository's own checkout while this run's waits for it (`checkoutHold`); absent when nothing holds it. */
  checkout?: CheckoutHold;
  /** What is left for a person to decide about the result (`toDecide`): the ending step's gate, or a branch nobody has merged. */
  toDecide?: ToDecide;
}> {
  const run = readRun(id);
  const steps = stepsOf(run);
  const { views, phaseOf } = await taskPhases(e, run);
  const closeouts = Object.fromEntries(Object.keys(run.steps).map((name) => [name, closeoutOf(views, run, name)]));
  const checks = Object.fromEntries(await checkReports(e, run, steps, phaseOf, (p) => p === 'succeeded' || p === 'failed' || p === 'stopped'));
  const { asks, rounds } = readAsks(id);
  const reader = closeoutReader(views, run);
  const asked = closeoutAsked(views);
  // The verdict the screen prints, off the log: a refusal and a check that did not finish, told apart by it.
  const verdictOf = (name: string) => checks[name]?.verdict;
  const blocked = harnessBlocked(views);
  const spendOf = spendReader(views);
  // Which run's ending step has the repository's own checkout, when this run's waits for it: a run still running for that, and nothing else.
  const checkout = await checkoutHold(e, run, steps);
  const d = decision(steps, run, phaseOf, shippedOf(run), reader, asked, verdictOf, asks, rounds, blocked, spendOf, checkout);
  // Where the result stands against the base branch, read off git now — and what that leaves a person to decide (`assess`, on the same facts).
  const standings = standingsOf(run);
  const { toDecide: decide } = assess(steps, run, phaseOf, reader, asked, verdictOf, asks, rounds, blocked, spendOf, standings);
  // What a person said to a step's current try, off their ask file, and what the try before it needed, off the engine's record of that
  // try: the run's record keeps neither.
  const given = readAnswers(id);
  const answers: Record<string, Answered> = {};
  for (const name of Object.keys(run.steps)) {
    const answer = answerOf(run, name, given);
    if (!answer) continue;
    const before = run.steps[name]!.tries!.at(-1)!.taskId;
    const closeout = (views.get(before) ?? await e.view(before)).state.attempts.at(-1)?.closeout;
    const c = closeout === undefined ? undefined : parseCloseout(closeout);
    answers[name] = { try: answer.try, message: answer.message!, ...(c && !('error' in c) && c.needs ? { needs: c.needs } : {}) };
  }
  // Every try's task and check, the tries behind the current one too, each viewed once: what a person said to each try, and the timeline.
  const everyTry = new Map(views);
  for (const record of Object.values(run.steps)) {
    for (const t of record.tries ?? []) {
      for (const taskId of [t.taskId, t.check?.taskId]) if (taskId && !everyTry.has(taskId)) everyTry.set(taskId, await e.view(taskId));
    }
  }
  // What a person said to each try's sessions while they ran, off the engine's journal of the try's task: every try, since words said to a try
  // that was replaced still bear on the work the step hands on.
  const said: Record<string, SaidTo[]> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const tasks = [...(record.tries ?? []).map((t) => t.taskId), ...(record.taskId ? [record.taskId] : [])];
    const told: SaidTo[] = [];
    for (const [i, taskId] of tasks.entries()) {
      // A recheck replaced only a check: the try after it has the same task, whose words are the try's that ran its session, said once.
      if (tasks.indexOf(taskId) !== i) continue;
      for (const s of saidIn(everyTry.get(taskId)!)) told.push({ ...s, try: i + 1 });
    }
    if (told.length) said[name] = told;
  }
  // A screen that cannot read the feed this time is still the screen: the queue times say they are not known.
  const filed = await readFilings(e).then(({ filed }) => filed, () => new Map<string, string>());
  const used = consumption(views, run);
  const costs = Object.fromEntries(Object.entries(run.steps).filter(([, record]) => record.taskId || record.tries?.length)
    .map(([name]) => [name, costLine(steps.find((s) => s.name === name), run, name, used[name], spendOf)]));
  // What each blocked session's harness says it waits for, and the session a person answers it in: the engine's name for the task's
  // current attempt, which is the name `claude agents` lists it under. Level-triggered like the phase beside it — read this pass, kept
  // nowhere — so a step that stops waiting says nothing here on the next.
  const waitingOn: Record<string, string> = {};
  for (const [name, record] of Object.entries(run.steps)) {
    const word = record.taskId ? waitingOf(views)(record.taskId) : undefined;
    if (!record.taskId || !word) continue;
    const attempt = views.get(record.taskId)?.state.attempts.at(-1)?.n;
    waitingOn[name] = harnessWaitLine(word, attempt === undefined ? null : nameFor(record.taskId, attempt));
  }
  // Asked only of a run with nothing filed, which is all the cap holds: every run in the store is read for it.
  const held = !hasStarted(run) && !run.cancelledAt ? (await runSlots(e)).get(id) : undefined;
  // A pruned run files nothing more (`advance`), and every verb that would is refused (`prunedRefusal`): nothing is due, and nothing is
  // offered — each line below that would offer a verb says so itself (`retryLines`, `roundLines`, `answerLines`, `overBudgetLine`, `gateLines`),
  // so the api's decision, which calls the same functions, says the same.
  const over = Boolean(run.cancelledAt || run.pruned);
  return {
    run, decision: d, closeouts, checks,
    retrying: over ? [] : retriesDue(steps, run, phaseOf, reader, asked, verdictOf, asks, blocked, spendOf),
    rounding: over ? [] : roundsDue(steps, run, phaseOf, reader, asked, rounds, spendOf),
    offers: [...roundLines(steps, run, d, spendOf), ...retryLines(steps, run, d, phaseOf, reader, asked, spendOf, verdictOf)],
    overBudgetLine: overBudgetLine(steps, run, d, spendOf),
    used,
    costs,
    runCost: runCostLines(run, spendOf),
    answers,
    answering: answerLines(steps, run, d, phaseOf, reader, asked, spendOf),
    gates: gateLines(steps, run, phaseOf, reader, asked, verdictOf, spendOf, asks, rounds),
    accepted: acceptedLines(steps, run),
    waitingOn,
    waiting: waitsOf(run, await parentsOf(e, run)),
    said,
    timeline: timeline(run, everyTry, filed, steps),
    ...(held ? { held } : {}),
    standings,
    ...(checkout ? { checkout } : {}),
    ...(decide ? { toDecide: decide } : {}),
  };
}
