/**
 * The I/O half: a run store, a workspace, and the engine.
 *
 * This file is the only one that knows the engine exists, and it uses `agent-engine` — the
 * Promise API — not `agent-engine/effect`. Nothing here imports Effect, which is the point: a
 * consumer of the engine should need to learn three functions, not a library.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { isDeepStrictEqual, promisify } from 'node:util';
import { claudeDetached, codex, createEngine, type Engine, type TaskView, type Usage } from 'agent-engine';
import { CHECK, CHECK_DEADLINE_SECONDS, checkBrief, lastLines, readVerdict, stdoutTail, type CheckRefusal, type Verdict } from './check.ts';
import { depsPlan, inside, isModuleKey, lockfilePackages, lockfileParting, refusalLines, worktreeInclude, type DepEntry, type DepsListing, type Installed, type Provisioned, type WorktreeInclude } from './deps.ts';

export { verdictWord } from './check.ts';
export { AGENT_FACING, CHECK_AFFECTING, LARGE_CONTEXT, LESSON, branchesToRead, budgetWord, dollars, inFullLines, lessonLine, parseGlobs, peakMark, readWords, rebuiltCache, sumUsage, touchedLines, usedLines } from './radius.ts';
import { radius, sensitivePaths, sumUsage, type Consumed, type Radius, type Touched } from './radius.ts';
export { isGitRun, placeOf } from './run.ts';
export { approvalOf, approvalRefusal, approvalWordsRefusal, approvedFirst, artifactLines, branchWord, checkoutLine, checkoutWord, endingSteps, firstLine, merges, resultSteps, sendBackTo, toDecideWords, budgetRefusal, ceilingLines, forgetLine, idRefusal, costLine, slotWord, dueNote, durationWord, fromNote, gateRefusal, gatesOf, hasGate, inputsNote, onYouWords, messageRefusal, namesInOrder, outputLines, owedFields, roundDueNote, runCostLines, runSpend, saidLines, signoffsSpent, spentWord, stepSpend, taskSpend, timeline, timelineLines, timelineTotalLines, tryNote, waitAdvice, waitWord } from './run.ts';
export type { FolderRun, GitRun, PlaceKind } from './run.ts';
export type { Approval, AskName, BranchFate, BranchStanding, ToDecide, CloseoutAsked, ForgetHow, Forgot, ParentCloseout, ParentRun, ParentStep, Raise, Retry, RetryAsk, RetryHow, RetryMode, Round, RoundAsk, RunSlot, Said, SaidTo, Shipped, SlotWait, Spend, SpendOf, TaskSpan, TaskSpend, Timeline, TimelineTotal, TimelineTry, Wait } from './run.ts';
import { agentNameRefusal, agentsDir, agentsFolderRefusal, agentUsers, agentVersion, AGENTS_FOLDER, fansOut, frontmatterKey, isFolderTeam, parseAgent, renderAgent, type Agent, type AgentDraft, isReadme, linkRefusal, loadAgents, loadWorkflows, orderSteps, parseFolder, parseWorkflow, renderStep, sessionContext, stepNameRefusal, WorkflowError, workflowFolder, workflowsIn, type StepDraft, type Workflow } from './workflow.ts';
export { cardToStart, planLines, planStopped } from './plan.ts';
export type { Card, Planned } from './plan.ts';
export { INBOX_KEY_MEANINGS, INBOX_KEYS, inboxLines, inboxNameRefusal, noCardLine, parseInboxCard, queueLine, queueOrder, workflowAt } from './inbox.ts';
export type { InboxCard, InboxListing, QueueStarted, QueueTry } from './inbox.ts';
import { ideaCard, inboxListing, inboxNameOf, inboxNameRefusal, nextQueued, noCardLine, noWorkflowRefusal, parseInboxCard, queueOrder, queuedText, queueRefusal, startedRefusal, type InboxCard, type InboxListing, type QueueStarted, type QueueTry } from './inbox.ts';
import { parsePlan, planOrder, type Card, type Planned } from './plan.ts';
import { folderPlace, workRoot } from './places.ts';
import { admissionOrder, resultSteps, slotFree, takesNoSlot, afterRefusal, endingAsked, type BranchStanding, type CheckoutHold, type MainClaim, heldCheckouts, type ToDecide, approvalRefusal, approvedFirst, gateRefusal, spentApprovals, triedFrom, type Approval, artifactPlace, branchFates, checkLogsOf, forgetRefusal, gated, heldRuns, heldWorktree, idRefusal, namesInOrder, parseWorktrees, runAdmitted, runCapOf, runWorktrees, slotNeed, slotWord, type AskName, type BranchFate, type ForgetHow, type Forgot, hasStarted, runReady, tipBranches, tipsSeen, waitsOf, type ArtifactFile, type ParentRun, type RunSlot, type Shipped, type Wait } from './run.ts';
import { answerLines, answerOf, askingTry, assess, gateLines, budgetOf, budgetUsdFor, MOMENTUM, priorityOf, costLine, overBudgetLine, ownStatus, runCostLines, stepSpend, taskSpend, type SpendOf, taskUsage, timeline, type Timeline, cancelPlan, inputRefusal, capOf, checkTaskId, closeoutSchemaOf, composeBrief, decision, handOffDue, inFlight, listing, modeWord, nextTry, owesReplies, parseCloseout, retriesDue, retryable, retryLines, retryRefusal, roundAsk, sentBack, type EndingStopped, roundFiled, roundLines, roundsDue, sayRefusal, sessionModel, spentAsks, spentRoundAsks, stepStatus, stepTaskId, tryOf, workspacePlan, type Assessment, type CancelPlan, type InputFile, type MissingArtifact, type Closeout, type Decision, type Listing, type ParentCloseout, type ParentStep, type Retry, type RetryAsk, type RetryHow, type Round, type RoundAsk, type Run, type GitRun, isGitRun, placeOf, type Said, type SaidTo, type CloseoutAsked, type TaskPhase } from './run.ts';

export const HOME = process.env.WF_ROOT ?? path.join(os.homedir(), '.agent-workflows');

const runsDir = () => path.join(HOME, 'runs');
const runFile = (id: string) => path.join(runsDir(), `${id}.json`);

/**
 * The inbox: cards before they are started, one `<name>.md` per card (`parseInboxCard` in inbox.ts), in the store beside `runs/` — not in a
 * repository, since a card's `repo:` says which one the idea is about.
 */
export const inboxDir = (): string => path.join(HOME, 'inbox');

/**
 * A cancellation gets its OWN file, and this is the whole reason it does.
 *
 * The run's json has one writer that rewrites it constantly — a tick reads the record, spends
 * seconds observing sessions and cutting worktrees, then writes back what it filed. `wf cancel` is
 * a second writer, and it exists to be used while that daemon is running: that is the point of the
 * verb. Two writers doing read-modify-write on one file is a lost update, and it was: a cancel
 * landing mid-pass was overwritten by the tick's stale copy, the mark vanished, and the run went
 * on filing steps. Re-reading before writing only narrows that window; it does not close it.
 *
 * So the two writers are given two files and never touch each other's. The tick owns the run's
 * steps, a person owns the cancellation, and `readRun` composes them. No lock, and nothing to get
 * wrong under a crash: the file exists or it does not.
 */
const cancelFile = (id: string) => path.join(runsDir(), `${id}.cancelled`);

/**
 * A run: its record, with what people own beside it composed on read — the cancellation (`cancelFile`), and each approval at a gate
 * (`readApprovals`). Neither is ever written into the record (`rewriteRun`).
 */
export const readRun = (id: string): Run => {
  // A mistyped run id is the commonest way to reach this, and `ENOENT: no such file or directory,
  // open '/home/.../runs/r-xzy.json'` answers a question nobody asked. Every verb that takes an
  // id comes through here, so saying it once covers all of them.
  if (!fs.existsSync(runFile(id))) throw new Error(`no such run: ${id}  (try 'wf ls')`);
  const { approvals: _, ...run } = JSON.parse(fs.readFileSync(runFile(id), 'utf8')) as Run;
  const at = fs.existsSync(cancelFile(id)) ? fs.readFileSync(cancelFile(id), 'utf8').trim() : '';
  const { approvals } = readApprovals(id);
  return { ...run, ...(at ? { cancelledAt: at } : {}), ...(approvals.length ? { approvals } : {}) };
};

/**
 * The run's steps: the workflow it froze at `wf start`, in the order they run (`orderSteps`).
 *
 * The folder is read only for a record from before the run froze its workflow — and a run started
 * today never reaches that branch, so nothing written into the folder after `wf start` reaches it.
 * Ordered on the way out too, so a record frozen before steps were ordered — in the folder's order,
 * alphabetical — reads in the order its steps run, as one written since does.
 */
export const stepsOf = (run: Run): Workflow[] => orderSteps(run.workflow ?? loadWorkflows(run.workflowDir));

/**
 * Write down that this run is cancelled, and answer with the time that now stands.
 *
 * `wx` so the FIRST cancellation is the one kept: two people calling the same run off should not
 * leave the record saying it happened at whichever moment the second one typed it.
 */
export const markCancelled = (id: string): string => {
  fs.mkdirSync(runsDir(), { recursive: true });
  const at = new Date().toISOString();
  try {
    fs.writeFileSync(cancelFile(id), at, { flag: 'wx' });
    return at;
  } catch {
    return fs.readFileSync(cancelFile(id), 'utf8').trim() || at;
  }
};

/**
 * A person's `wf retry`, in files of its own: `runs/<id>.asks/retry-<step>-<n>`, one per try asked for.
 *
 * For the reason a cancellation has its own file: the run's json has one writer, the tick, and a verb typed
 * while `wf up` runs must not be a second. The verb creates the ask, whole and exclusively, and never touches
 * it again. Every pass reads the directory, and once the run's record holds the try an ask names, the tick
 * moves the file into `done/` — consumed, never edited. Naming the try is what makes an ask honoured once: a
 * pass that dies after filing the try and before consuming the ask files nothing more, because the next pass
 * finds the try on the board (`adoptTries`) or on the record (`spentAsks`).
 *
 * `wf round` is the same, in `round-<step>-<n>`: the looping step, and the round it asks for (`adoptRounds`, `spentRoundAsks`).
 *
 * `wf approve` too, in `approve-<step>-<n>`: the gated step, and the try it approves. It is never consumed while it opens the gate — the
 * record holds no approval, and every pass reads the file (`readRun`) — only once a later try of the step spent it (`spentApprovals`).
 */
const asksDir = (id: string) => path.join(runsDir(), `${id}.asks`);
export const askFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `retry-${step}-${n}`);
export const roundAskFile = (id: string, step: string, round: number): string => path.join(asksDir(id), `round-${step}-${round}`);
export const approvalFile = (id: string, step: string, n: number): string => path.join(asksDir(id), `approve-${step}-${n}`);

/** The approvals at a run's gates, waiting in its asks directory — each opens the gate of the try it names — and a line for each file named as one that cannot be read as one. */
export function readApprovals(id: string): { approvals: Approval[]; notes: string[] } {
  const approvals: Approval[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { approvals, notes }; }
  for (const name of names) {
    const approved = /^approve-(.+)-(\d+)$/.exec(name);
    if (!approved) continue;
    const file = path.join(asksDir(id), name);
    const read = approvalIn(file, approved[1]!, Number(approved[2]));
    if (typeof read === 'string') notes.push(`${file}: ${read}, so it opens no gate — remove it, and approve with wf approve`);
    else approvals.push(read);
  }
  return { approvals, notes };
}

/** One approval file, read: the step and the try from its name, when and what was said from what it holds — or why it cannot be read. */
function approvalIn(file: string, step: string, n: number): Approval | string {
  let held: unknown;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an approval wf approve wrote';
  const { at, message } = held as Record<string, unknown>;
  if (typeof at !== 'string' || Number.isNaN(Date.parse(at))) return 'it says no time it was given';
  if (message !== undefined && typeof message !== 'string') return 'its message is not text';
  if (typeof message === 'string' && !message.trim()) return 'its message is empty';
  return { step, try: n, at, ...(typeof message === 'string' ? { message } : {}) };
}

/** The asks waiting in a run's directory — tries and rounds — and a line for each file there that names one and cannot be read as one. */
export function readAsks(id: string): { asks: RetryAsk[]; rounds: RoundAsk[]; notes: string[] } {
  const asks: RetryAsk[] = [];
  const rounds: RoundAsk[] = [];
  const notes: string[] = [];
  let names: string[];
  try {
    names = fs.readdirSync(asksDir(id), { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
  } catch { return { asks, rounds, notes }; }
  // An approval opens a gate, read with the run (`readRun`); one that cannot be read is said on the pass, as an ask is.
  notes.push(...readApprovals(id).notes);
  for (const name of names) {
    // Anything else is not an ask: the file the verb writes before linking it into place starts with a dot.
    const tried = /^retry-(.+)-(\d+)$/.exec(name);
    const again = /^round-(.+)-(\d+)$/.exec(name);
    const file = path.join(asksDir(id), name);
    if (tried) {
      const ask = askIn(file, tried[1]!, Number(tried[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf retry`);
      else asks.push(ask);
    } else if (again) {
      const ask = roundAskIn(file, again[1]!, Number(again[2]));
      if (typeof ask === 'string') notes.push(`${file}: ${ask}, so it is not honoured — remove it, and ask with wf round`);
      else rounds.push(ask);
    }
  }
  return { asks, rounds, notes };
}

/** One round ask file, read: the looping step and the round from its name, when from what it holds — or why it cannot be read. */
function roundAskIn(file: string, step: string, round: number): RoundAsk | string {
  let held: unknown;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return `unreadable (${(err as Error).message})`; }
  if (!held || typeof held !== 'object' || Array.isArray(held)) return 'it is not an ask wf round wrote';
  const { at, budget } = held as Record<string, unknown>;
  if (budget !== undefined && !isDollars(budget)) return 'its budget is not an amount of dollars above zero';
  return { step, round, ...(isDollars(budget) ? { budget } : {}), at: typeof at === 'string' ? at : '' };
}

/** An amount an ask file may carry as its budget: dollars above zero, as `wf retry --budget` and `wf round --budget` write one. */
const isDollars = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/**
 * One ask file, read: the step and the try from its name, how, when and what was said from what it holds — or why it cannot be read.
 * A file from before asks carried a message has none, and reads as it did. What `wf retry` refuses to write is refused here too, so a
 * file written by hand is held to the verb's word: a message that is not text or is empty, and a message on a recheck.
 */
function askIn(file: string, step: string, n: number): RetryAsk | string {
  let held: unknown;
  try { held = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (err) { return `unreadable (${(err as Error).message})`; }
  const { mode, model, message, budget, at } = (held && typeof held === 'object' ? held : {}) as Record<string, unknown>;
  if (mode !== 'nudge' && mode !== 'fresh' && mode !== 'recheck') return `it asks for no mode wf retry knows (${JSON.stringify(mode)})`;
  if (model !== undefined && (typeof model !== 'string' || !model)) return 'its model is not a name';
  if (message !== undefined && typeof message !== 'string') return 'its message is not text';
  if (typeof message === 'string' && !message.trim()) return 'its message is empty';
  if (message !== undefined && mode === 'recheck') return 'it carries a message and asks for a recheck, which files no session to read it';
  if (budget !== undefined && !isDollars(budget)) return 'its budget is not an amount of dollars above zero';
  if (budget !== undefined && mode === 'recheck') return 'it carries a budget and asks for a recheck, which files no session to spend it';
  return {
    step, try: n, mode, ...(model ? { model: model as string } : {}), ...(typeof message === 'string' ? { message } : {}),
    ...(isDollars(budget) ? { budget } : {}), at: typeof at === 'string' ? at : '',
  };
}

/**
 * Every ask that carried a message — still waiting, or consumed into `done/` — for what `wf ls` and `wf decide` say of a try that was
 * answered (`answerOf`). Composed on read, as the ask itself is: the run's record keeps no message. A file that cannot be read as an ask
 * is left out; the tick's own read (`readAsks`) says why.
 */
export function readAnswers(id: string): RetryAsk[] {
  const answers: RetryAsk[] = [];
  for (const dir of [asksDir(id), path.join(asksDir(id), 'done')]) {
    let names: string[];
    try {
      names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name).sort();
    } catch { continue; }
    for (const name of names) {
      const tried = /^retry-(.+)-(\d+)$/.exec(name);
      const ask = tried ? askIn(path.join(dir, name), tried[1]!, Number(tried[2])) : undefined;
      if (ask && typeof ask !== 'string' && ask.message !== undefined) answers.push(ask);
    }
  }
  return answers;
}

/**
 * Write a person's ask, whole and exclusively: into a file of its own, then linked to its name. `link` refuses a
 * name that exists, as `wx` does, and unlike `wx` leaves no moment in which the tick can read an ask that has
 * been created and not yet written. False when an ask for that try was already there.
 */
function writeAsk(file: string, ask: RetryAsk | RoundAsk | Approval): boolean {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const whole = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}`);
  fs.writeFileSync(whole, `${JSON.stringify(ask, null, 2)}\n`, { flag: 'wx' });
  try {
    fs.linkSync(whole, file);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(whole, { force: true });
  }
}

/**
 * Move each ask the run's record already answers into `done/` — and each approval a later try of its step spent (`spentApprovals`). The
 * tick's one touch on a person's file, and never an edit.
 */
function consumeAsks(run: Run, asks: readonly RetryAsk[], rounds: readonly RoundAsk[]): void {
  const spent = [
    ...spentAsks(run, asks).map((a) => askFile(run.id, a.step, a.try)),
    ...spentRoundAsks(run, rounds).map((a) => roundAskFile(run.id, a.step, a.round)),
    ...spentApprovals(run).map((a) => approvalFile(run.id, a.step, a.try)),
  ];
  for (const file of spent) {
    const done = path.join(asksDir(run.id), 'done', path.basename(file));
    // Not `recursive`: `done/` is made inside the run's asks directory, never the directory itself, which `wf rm` may have removed mid-pass.
    try { fs.mkdirSync(path.dirname(done)); } catch { /* there already — or gone, with its run */ }
    try { fs.renameSync(file, done); } catch { /* already moved, by a pass beside this one — or removed, with its run */ }
  }
}

/** Every run in the store. A record `wf rm` removed after the directory was read is no run, and no reason to fail every other run's pass. */
export const listRuns = (): Run[] =>
  fs.existsSync(runsDir())
    ? fs.readdirSync(runsDir()).filter((f) => f.endsWith('.json')).flatMap((f) => {
      const id = path.basename(f, '.json');
      try {
        return [readRun(id)];
      } catch (err) {
        if (fs.existsSync(runFile(id))) throw err;
        return [];
      }
    }).sort((a, b) => a.id.localeCompare(b.id))
    : [];

/** A new run's record: `start`'s, and the one writer that makes one. */
const writeRun = (run: Run) => {
  fs.mkdirSync(runsDir(), { recursive: true });
  fs.writeFileSync(runFile(run.id), JSON.stringify(run, null, 2));
};

/**
 * Write back the record a pass read — only while it is still there, and false when it is not.
 *
 * A pass reads a run, spends seconds on the engine and git, and writes the run back. `wf rm` may remove the record in those seconds, and a
 * pass that wrote a whole new file would put it back: a run nobody can forget, pointing at worktrees that are gone. So the record is opened
 * `r+`, which never makes a file. Its existence is read at the moment of writing, and nothing is carried to decide it; a record removed
 * after it is opened takes the write with it.
 *
 * Without the approvals `readRun` composed onto it: they are a person's files, and a copy in the record would outlive the file it was read from.
 */
const rewriteRun = ({ approvals: _, ...run }: Run): boolean => {
  let fd: number;
  try {
    fd = fs.openSync(runFile(run.id), 'r+');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw err;
  }
  try {
    fs.ftruncateSync(fd);
    fs.writeFileSync(fd, JSON.stringify(run, null, 2));
  } finally {
    fs.closeSync(fd);
  }
  return true;
};

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

/**
 * The daemon's two ceilings, read from the environment when asked. `sessions` (`WF_MAX_CONCURRENT`, 2 unless set) is the engine's: sessions
 * per harness at once, counted apart for each — a check on the `check` harness is in a pool of its own, and a `dev` run's review competes with
 * another run's implement, both on `claude`. `runs` (`WF_MAX_RUNS`, `runCapOf`) is the tick's: runs in flight at once, 0 — or unset — for no cap.
 */
export const ceilings = (): { sessions: number; runs: number } => ({
  sessions: Number(process.env.WF_MAX_CONCURRENT) || 2,
  runs: runCapOf(process.env.WF_MAX_RUNS),
});

/**
 * What the last pass ran with: `$WF_ROOT/tick.json`, the tick's to write — the ceilings of the process that ran it, `wf up`'s or `wf tick`'s.
 * `wf ls` and `wf decide` run in a shell of their own, whose environment is not the daemon's: `WF_MAX_CONCURRENT=4 WF_MAX_RUNS=2 wf up` sets
 * the cap on the daemon alone, and read from the shell, a run the daemon holds read as plain `waiting`.
 */
const tickFile = (): string => path.join(HOME, 'tick.json');

/** The ceilings the last pass ran with (`tickFile`), or undefined before any pass has written them, or when the file does not read as them. */
export function lastCeilings(): { sessions: number; runs: number } | undefined {
  try {
    const c = JSON.parse(fs.readFileSync(tickFile(), 'utf8')) as { sessions?: unknown; runs?: unknown };
    const count = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
    return typeof c.sessions === 'number' && count(c.runs) ? { sessions: c.sessions, runs: c.runs } : undefined;
  } catch { return undefined; }
}

/**
 * The ceilings a pass runs with, written down for `wf ls` and `wf decide` — only when they differ from what is there, and through a hidden file
 * renamed over it, so a reader never reads half of it. A store that cannot be written loses only this: a reader falls back to its own
 * environment, and the pass goes on.
 */
function recordCeilings(c: { sessions: number; runs: number }): void {
  const last = lastCeilings();
  if (last && last.sessions === c.sessions && last.runs === c.runs) return;
  const hidden = path.join(HOME, `.tick.json.${process.pid}`);
  try {
    fs.mkdirSync(HOME, { recursive: true });
    fs.writeFileSync(hidden, JSON.stringify({ sessions: c.sessions, runs: c.runs }, null, 2));
    fs.renameSync(hidden, tickFile());
  } catch { /* read from the reader's own environment instead */ }
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
 * Where a check's stderr goes: beside the run records, outside every workspace — a file inside one
 * would be committed by the next hand-off and ride the branch.
 */
export const checkStderr = (taskId: string): string => path.join(HOME, 'checks', `${taskId}.stderr`);

/**
 * The directory the run makes for a step's files: screenshots, logs, reports — for the steps after it
 * and the person who decides.
 *
 * Beside the run's record, outside every workspace, for the reason a check's stderr is: a file written
 * into a worktree is committed by the next hand-off and rides the branch, and a gitignored one never
 * reaches the next step's worktree at all. `advance` makes it before it files the step, tells the step in
 * its brief (`artifactsContract`), and hands it to the step's check as `WF_ARTIFACTS`.
 */
export const artifactsDir = (run: Pick<Run, 'id'>, step: string): string => path.join(runsDir(), run.id, 'artifacts', step);

/**
 * The directory `wf start --input` copies a run's files into: the run's own, beside its artifacts and outside every workspace, so a file a
 * person gave the run reaches each step without riding a branch. Named on each brief (`inputsLine`) with the names on the record.
 */
export const inputsDir = (run: Pick<Run, 'id'>): string => path.join(runsDir(), run.id, 'inputs');

/** How long `npm ci` may take in a worktree before the run stops waiting and tells the step. */
const NPM_CI_TIMEOUT_MS = 10 * 60_000;

const execFileAsync = promisify(execFile);
const lstatOf = (p: string) => fs.lstatSync(p, { throwIfNoEntry: false });

/**
 * Where the worktree's `package-lock.json` asks for a tree the main checkout does not have on disk, or
 * null when links will do: `lockfileParting`, over a look at each package path the lockfile names.
 *
 * A main checkout with no `node_modules` has no tree to part from and none to link, so its lockfile is
 * compared byte for byte instead, as before: a different one is installed in the worktree, and the same
 * one leaves nothing to provision. A worktree without a lockfile parts only from a main checkout that
 * has one — a repository without one is not npm's, and links are all there is.
 */
export function lockfileParts(mainRoot: string, worktree: string): string | null {
  const read = (file: string): string | null => { try { return fs.readFileSync(file, 'utf8'); } catch { return null; } };
  const wanted = read(path.join(worktree, 'package-lock.json'));
  const mains = read(path.join(mainRoot, 'package-lock.json'));
  if (wanted === null) return mains === null ? null : 'package-lock.json';
  if (!fs.statSync(path.join(mainRoot, 'node_modules'), { throwIfNoEntry: false })?.isDirectory()) {
    return wanted === mains ? null : 'package-lock.json';
  }

  let lock: unknown = null;
  try { lock = JSON.parse(wanted); } catch { /* parts at package-lock.json */ }
  const installed: Record<string, Installed | null> = {};
  for (const key of Object.keys(lockfilePackages(lock) ?? {}).filter(isModuleKey)) {
    const at = path.join(mainRoot, key);
    const st = lstatOf(at);
    if (!st) installed[key] = null;
    else if (st.isSymbolicLink()) {
      installed[key] = { link: true, resolved: path.relative(mainRoot, path.resolve(path.dirname(at), fs.readlinkSync(at))).split(path.sep).join('/') };
    } else {
      let version: string | undefined;
      try { version = JSON.parse(fs.readFileSync(path.join(at, 'package.json'), 'utf8')).version; } catch { /* a package without a manifest has no version */ }
      installed[key] = { link: false, version };
    }
  }
  return lockfileParting(lock, installed);
}

/** Whether git ignores a path in a checkout. `git check-ignore` says no for a tracked path, and for one git has not been told to ignore. */
function ignored(repo: string, rel: string): boolean {
  try {
    execFileSync('git', ['check-ignore', '-q', '--', rel], { cwd: repo, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Main's `node_modules`, listed for `depsPlan`: names and link targets, nothing below a package. */
function listDeps(modules: string): DepsListing | null {
  if (!fs.statSync(modules, { throwIfNoEntry: false })?.isDirectory()) return null;
  const entriesOf = (dir: string): DepEntry[] => {
    try {
      return fs.readdirSync(dir, { withFileTypes: true }).map((d) =>
        d.isSymbolicLink() ? { name: d.name, link: fs.readlinkSync(path.join(dir, d.name)) } : { name: d.name });
    } catch { return []; }
  };
  const entries = entriesOf(modules);
  const scopes = Object.fromEntries(entries
    .filter((e) => e.name.startsWith('@') && e.link === undefined)
    .map((e) => [e.name, entriesOf(path.join(modules, e.name))]));
  return { entries, scopes, bins: entriesOf(path.join(modules, '.bin')) };
}

/**
 * Give a worktree a `node_modules` of its own: `depsPlan`'s links, or `npm ci` when its lockfile differs.
 *
 * A worktree holds tracked files only, so without this a step that runs the tests fails on its first
 * command through no fault of its own. It used to be one link to the main checkout's whole tree, which
 * tested a branch against main's workspace packages and hid a dependency the branch added. Links cost no
 * install; when the worktree's `package-lock.json` asks for packages main has not installed they would be
 * the wrong tree, so `npm ci` installs one here — about a minute, which the step is told (`depsLines`).
 *
 * Idempotent, so a pass that died halfway can run it again and a second call changes nothing: a tree npm
 * installed (it has `.package-lock.json`, which the plan never makes) is left alone, and so is a
 * `node_modules` that is one link, cut before this; a tree the plan made gains only what it lacks, and
 * nothing already there is replaced. It writes nothing under the main checkout. It does not throw: a
 * tick that threw here would throw on every pass after, and a step can run `npm ci` itself.
 */
export async function provisionDeps(mainRoot: string, worktree: string): Promise<Provisioned> {
  const modules = path.join(worktree, 'node_modules');
  if (lstatOf(modules)?.isSymbolicLink()) return { tree: 'shared' };
  if (lstatOf(path.join(modules, '.package-lock.json'))) return { tree: 'own', installed: false };

  if (lockfileParts(mainRoot, worktree)) {
    try {
      await execFileAsync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: worktree, timeout: NPM_CI_TIMEOUT_MS, maxBuffer: 64 * 1024 * 1024 });
      return { tree: 'own', installed: true };
    } catch (err) {
      const { stderr, message } = err as { stderr?: string; message?: string };
      return { tree: 'failed', error: lastLines(stderr?.trim() ? stderr : message ?? String(err), 10) };
    }
  }

  const listing = listDeps(path.join(mainRoot, 'node_modules'));
  if (!listing) return { tree: 'absent' };
  let made = 0;
  try {
    for (const action of depsPlan(mainRoot, worktree, listing)) {
      if (lstatOf(action.path)) continue;
      if (action.kind === 'dir') fs.mkdirSync(action.path);
      else fs.symlinkSync(action.target, action.path);
      made++;
    }
  } catch (err) {
    return { tree: 'failed', error: (err as Error).message };
  }
  return { tree: 'linked', made };
}

/** `.worktreeinclude` at the root of the main checkout, parsed — or null, when the repository has none. */
function readInclude(repo: string): WorktreeInclude | null {
  const file = path.join(repo, '.worktreeinclude');
  return fs.existsSync(file) ? worktreeInclude(fs.readFileSync(file, 'utf8')) : null;
}

/**
 * Copy what `.worktreeinclude` lists from the main checkout into a worktree the run just cut — the
 * gitignored files a repository says a worktree needs, as Claude Code's `--worktree` does. Never
 * `node_modules`: `provisionDeps` makes that, and a copy would cost minutes per step.
 *
 * Read from the main checkout, never from the worktree a step can edit. Only a path git ignores there is
 * copied, as Claude Code's file copies only ignored files: anything else lands in the worktree as an
 * untracked file, and the hand-off's `git add -A` commits it onto the run's branch — a token in a notes
 * file included. Nothing already in the worktree is overwritten, so a second pass copies nothing. What a
 * person should hear comes back as lines for the run's log, never as an error: a path the main checkout
 * does not have is skipped, and one that leads outside the repository — as written, or through a link —
 * or that git does not ignore is refused.
 */
function includeFiles(repo: string, worktree: string): string[] {
  const include = readInclude(repo);
  if (!include) return [];
  const notes = refusalLines(include.refused).map((line) => `.worktreeinclude: refused ${line}`);
  const root = fs.realpathSync(repo);
  const absent: string[] = [];
  for (const rel of include.copy) {
    const from = path.join(repo, rel);
    let real: string;
    try { real = fs.realpathSync(from); } catch { absent.push(rel); continue; }
    if (!inside(root, real)) { notes.push(`.worktreeinclude: refused "${rel}" leads outside the repository`); continue; }
    if (!ignored(repo, rel)) { notes.push(`.worktreeinclude: refused "${rel}" is not gitignored — the hand-off would commit it`); continue; }
    const to = path.join(worktree, rel);
    try {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true, force: false, errorOnExist: false, verbatimSymlinks: true });
    } catch (err) {
      notes.push(`.worktreeinclude: could not copy ${rel} — ${(err as Error).message}`);
    }
  }
  if (absent.length) notes.unshift(`.worktreeinclude: skipped ${absent.join(', ')} — not in the main checkout`);
  return notes;
}

/**
 * A git command in `repo`, its stdout trimmed — or it throws, and git's words are on the error: its message carries the command and the
 * stderr git wrote, which is what a failure is said in (`failedWords`, `startQueued`).
 *
 * `stdio` is given so that stderr is read and no more. Handed none, `execFileSync` captures git's stderr *and* writes it to this process's
 * own: a queued card whose `repo:` is no git repository made the tick run `rev-parse` there on every pass, and each one printed git's `fatal:
 * not a git repository` on the daemon's terminal, beside the one line `wf up` says about the card.
 */
const git = (repo: string, ...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/**
 * Cut the run's starting workspace.
 *
 * The WORKFLOW owns this, not the engine and not the harness. Both harnesses can make a worktree
 * of their own, but each makes its *own* — and which worktree a step works in is a fact about the
 * workflow's shape, not about the harness. Owning it here also means neither harness needs a flag
 * the other one spells differently.
 */
function makeWorkspace(repo: string, isolate: boolean): { workspace: string; baseRef: string; branch: string } {
  // No worktree is cut here. Every step gets its own from `workspaceFor`, including the first —
  // one code path, so the pure plan cannot be quietly overridden by a special case.
  return {
    workspace: repo,
    baseRef: git(repo, 'rev-parse', 'HEAD'),
    branch: git(repo, 'rev-parse', '--abbrev-ref', 'HEAD'),
  };
}

/**
 * The workspace a step runs in, made real.
 *
 * `inherit` costs nothing — the step continues where the last one left off. `fork` and `merge`
 * cut a worktree, which is what stops two concurrent steps from editing the same directory. A
 * merge that conflicts is left conflicted on purpose: the step is told, and resolving it is the
 * job. Failing here instead would throw away work that a person would simply sort out.
 */
async function workspaceFor(
  run: Run,
  steps: readonly Workflow[],
  step: Workflow,
): Promise<{ workspace: string; branch?: string; conflicted: boolean; deps?: Provisioned; notes: string[] }> {
  const plan = workspacePlan(steps, step);
  // A folder run's steps work in folders the run makes, and nothing here is git's (`places.ts`).
  if (!isGitRun(run)) return { ...folderPlace(runsDir()).make(run, plan, step.name), conflicted: false };
  const of = (name: string) => {
    const s = run.steps[name];
    if (!s?.workspace || !s.branch) throw new Error(`${step.name}: ${name} has no workspace yet`);
    return s as { workspace: string; branch: string };
  };

  // Without isolation every step works in the repository itself, which is only safe because
  // `validate` refuses a workflow that could run two steps at once in that mode.
  if (!run.isolate) return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  // And the last step of a workflow may ask for that checkout by name (`workspace: main`): merging a branch onto the base branch is
  // what a worktree cannot do, since the base branch is checked out here. Nothing is cut, nothing is merged in, and no dependency is
  // provisioned — it is the repository as a person left it, and `validate` keeps any other step from running beside it.
  if (plan.kind === 'main') return { workspace: run.repo, branch: run.branch, conflicted: false, notes: [] };

  if (plan.kind === 'inherit') {
    const parent = of(plan.from);
    return { workspace: parent.workspace, branch: parent.branch, conflicted: false, notes: [] };
  }

  // A worktree of its own, so nothing it does can collide with a sibling's.
  const branch = `wf/${run.id}/${step.name}`;
  const workspace = path.join(HOME, 'worktrees', run.id, step.name);
  const from = plan.kind === 'merge' ? of(plan.from).branch : plan.from ? of(plan.from).branch : run.baseRef;
  fs.mkdirSync(path.dirname(workspace), { recursive: true });
  // Taken up where it stands when a pass cut it and died before filing the step — in the minute `npm ci`
  // can take, say. `worktree add -b` would refuse the branch that pass made, on every pass after.
  if (!fs.existsSync(path.join(workspace, '.git'))) git(run.repo, 'worktree', 'add', '-b', branch, workspace, from);

  let conflicted = false;
  if (plan.kind === 'merge') {
    for (const other of plan.also) {
      try {
        git(workspace, '-c', 'user.email=wf@local', '-c', 'user.name=wf',
            'merge', '--no-edit', of(other).branch);
      } catch {
        // Left in place, markers and all. The step waiting on several others is the one whose
        // job this is, and it is told so in its brief.
        conflicted = true;
      }
    }
  }

  // After the merges, because the step works on the merged tree — its lockfile included.
  const notes = includeFiles(run.repo, workspace);
  const deps = await provisionDeps(run.repo, workspace);
  if (deps.tree === 'own' && deps.installed) notes.push('node_modules: installed with npm ci — package-lock.json asks for packages the main checkout has not installed');
  if (deps.tree === 'failed') notes.push(`node_modules: not provisioned — ${deps.error.split('\n').at(-1)}`);
  return { workspace, branch, conflicted, deps, notes };
}

/**
 * A run id a person can read.
 *
 * The engine lets the caller choose task ids, and a session's name is built from one — so the id
 * IS what a human sees in `claude agents`. `t-mtxvs3nw-f4763a59` tells them nothing;
 * `add-split-workflow-8imz` tells them which piece of work they are looking at, and the step
 * suffix tells them which part of it. The random tail keeps two runs of the same request apart.
 */
export const runId = (brief: string): string => {
  const slug = brief.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28).replace(/-$/, '');
  return `${slug || 'run'}-${Math.random().toString(36).slice(2, 6)}`;
};

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

/** What `writeWorkflow` did: the folder, its steps as they now read, and its files by name — written, left as they were because they already read so, and removed. */
export type WorkflowWritten = { dir: string; steps: Workflow[]; written: string[]; kept: string[]; removed: string[] };

/**
 * A workflow folder written from its steps: what the board's builder saves, and the inverse of `loadWorkflows`.
 *
 * Judged whole before a byte is written, so a folder refused is the folder it was: where it is (`workflowPlaceRefusal`), each step's name as
 * a file's (`stepNameRefusal`), no name twice, each step rendered (`renderStep`), and then the folder as it would be, parsed in memory as
 * `loadWorkflows` parses one on disk (`parseFolder`), with the schemas its `output:` lines name read from the folder as they are. So every
 * refusal the parser has surfaces here, in its words and naming the step: a key a step does not have, `after:` naming no step, a cycle, a
 * `loop:` that is not a back edge, an `output:` naming a schema that is not in the folder. What `wf start` refuses beyond the parser — a
 * step named for another's check, `remote: true` off `claude` — is still `wf start`'s to refuse, as for a folder written by hand.
 *
 * Then the `.md` of each step no longer in the set is removed, before a byte is written: on a filesystem that does not tell case apart —
 * macOS's, Windows's — `Plan.md` and `plan.md` are one file, and a step renamed by case would otherwise be written and then removed under
 * its old name, which is the same file. After that each step's `<name>.md` is written, but for one whose file already reads as the step,
 * which is left as it is, comments and all, since a render has none. A `*.schema.json` is left as it is: a step names one, and the builder
 * writes none. The README is written only when `readme` is given, to the name the folder's README already has.
 *
 * A `.md` in the folder that is a link is refused by name, before any of it: a write follows a link, so a step would be rendered into
 * whatever it points at, outside the folder, and a link is not a file the write removes, so it would be left behind where its step went. A
 * linked README is refused only when a `readme` is given, since that is when it would be written.
 *
 * Where: a workflow in the store's `workflows/` or in a repository's, the two places the board lists workflows from. Anywhere else only
 * with `{ anywhere: true }`, since a write removes files, and a path mistyped would remove them from a folder that is not a workflow. A run
 * is not changed by any of it: it froze its folder at `wf start`.
 */
export function writeWorkflow(dir: string, steps: readonly StepDraft[], readme?: string, { anywhere = false }: { anywhere?: boolean } = {}): WorkflowWritten {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined) => { if (why) throw new WorkflowError(why); };
  refuse(agentsFolderRefusal(at));
  if (!anywhere) refuse(workflowPlaceRefusal(at));
  if (fs.existsSync(at) && !isDirectory(at)) refuse(`${at} is a file, and a workflow is a folder of steps. Name a folder — one that is not there yet is made.`);
  // The folder as it is, read before a byte is written — and a workflow's files are its own, so a `.md` among them that is a link is refused.
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(at, { withFileTypes: true }); } catch { /* not there: a new workflow's folder is made below */ }
  const linked = entries.find((e) => e.isSymbolicLink() && e.name.endsWith('.md') && (readme !== undefined || !isReadme(e.name)));
  if (linked) {
    refuse(linkRefusal(path.join(at, linked.name), "a workflow's files are its own. Writing this workflow would follow it and write into whatever it points at, outside the folder, and would not remove it when its step goes."));
  }
  if (!steps.length) refuse(`no steps to write to ${at}, and a workflow has at least one. To remove the workflow, remove its folder.`);
  for (const step of steps) refuse(stepNameRefusal(step?.name));
  const twice = steps.find((step, i) => steps.findIndex((other) => other.name === step.name) !== i);
  if (twice) refuse(`two steps are named ${twice.name}, and a step is its file, ${twice.name}.md. Rename one of them.`);
  const texts = steps.map((step) => [step.name, renderStep(step)] as const);
  const read = (file: string): string | undefined => {
    try { return fs.readFileSync(path.resolve(at, file), 'utf8'); } catch { return undefined; }
  };
  const agents = loadAgents(agentsDir(at));
  const parsed = parseFolder(texts, read, agents);

  fs.mkdirSync(at, { recursive: true });
  const written: string[] = [];
  const kept: string[] = [];
  /** Write `text` to `file`, unless what is there already reads as `same` does. */
  const put = (file: string, text: string, same: (there: string) => boolean) => {
    const there = read(file);
    if (there !== undefined && same(there)) return kept.push(file);
    fs.writeFileSync(path.join(at, file), text);
    return written.push(file);
  };
  // The steps the folder no longer has lose their files first: where the filesystem does not tell case apart, a step renamed by case is
  // written to the file its old name names, and removing that name afterwards would remove what was just written.
  const names = new Set(texts.map(([name]) => `${name}.md`));
  const removed = entries.filter((e) => e.isFile() && e.name.endsWith('.md') && !isReadme(e.name) && !names.has(e.name)).map((e) => e.name);
  for (const file of removed) fs.rmSync(path.join(at, file));
  for (const [name, text] of texts) {
    const step = parsed.find((s) => s.name === name);
    put(`${name}.md`, text, (there) => {
      try { return isDeepStrictEqual(parseWorkflow(name, there, read, agents), step); } catch { return false; }
    });
  }
  if (readme !== undefined) put(entries.find((e) => e.isFile() && isReadme(e.name))?.name ?? 'README.md', readme, (there) => there === readme);
  return { dir: at, steps: parsed, written: written.sort(), kept: kept.sort(), removed: removed.sort() };
}

/**
 * Why `writeWorkflow` does not write `at` unless told it may write anywhere, or `undefined` for a folder it writes: a workflow in the store's
 * `workflows/`, or in a repository's — `<repo>/workflows/<name>`, beside the repository's `.git`. The folder itself, not one below it, nor
 * the `workflows/` that holds it: those are the folders the board lists as workflows.
 */
function workflowPlaceRefusal(at: string): string | undefined {
  const holder = path.dirname(at);
  const store = path.resolve(HOME, 'workflows');
  if (isWorkflowsHolder(holder)) return undefined;
  return `${at} is not a workflow in the store's workflows/ (${path.join(store, '<name>')}) nor in a repository's (<repo>/workflows/<name>, beside its .git), and writing a workflow removes the files of the steps it no longer has. Write it to a folder in one of the two, or pass { anywhere: true } to write ${at} all the same.`;
}

/** Whether `dir` holds the workflows the board lists: the store's `workflows/`, or a repository's, beside its `.git`. */
function isWorkflowsHolder(dir: string): boolean {
  if (dir === path.resolve(HOME, 'workflows')) return true;
  return path.basename(dir) === 'workflows' && fs.existsSync(path.join(path.dirname(dir), '.git'));
}

/**
 * A refusal of an agent's write, in the package's words, and what kind it is: `missing` for an agent that is not there, `stale` for one
 * that changed since it was read, `exists` for a name another agent has, `in-use` for one steps still name — `users` says which, as
 * `<workflow>/<step>` — and `refused` for the rest: a place, a name, a key or a value the parser refuses.
 */
export class AgentWriteError extends WorkflowError {
  readonly why: 'missing' | 'stale' | 'exists' | 'in-use' | 'refused';
  readonly users: string[];
  constructor(message: string, why: AgentWriteError['why'] = 'refused', users: string[] = []) {
    super(message);
    this.why = why;
    this.users = users;
  }
}

/** What `writeAgent` did: the agent as it now reads, its version, and its files by name — written, and removed. */
export type AgentWritten = { dir: string; agent: Agent; version: string; written: string[]; removed: string[] };

/**
 * A file written beside an agent, named by one of the agent's own keys: the result schema its `output:` names, or the skills its `skills:`
 * names. Its file is a plain `.json` name in the folder — no folder of its own, and not another agent's file.
 */
export type AgentSidecar = { file: string; text: string };

/** A result schema written with an agent: its file, beside the agent, and what it holds. */
export type AgentSchema = AgentSidecar;

/** The agent keys that name a file beside the agent, and what a refusal calls each. */
const SIDECARS = [
  { key: 'skills' as const, what: 'skills file', a: 'the skills file', suggest: (name: string) => `${name}.skills.json` },
  { key: 'output' as const, what: 'result schema', a: 'the result schema', suggest: (name: string) => `${name}.schema.json` },
];

/**
 * Why no agent may be written to or removed from `dir`, or `undefined`: an agent is a file in `agents/` beside the workflows the board lists
 * — the store's (`<store>/workflows/agents`) or a repository's (`<repo>/workflows/agents`). Anywhere else only with `{ anywhere: true }`.
 */
function agentPlaceRefusal(dir: string, anywhere: boolean): string | undefined {
  if (path.basename(dir) !== AGENTS_FOLDER) {
    return `${dir} is not a folder of agents: the agents the workflows name are in the ${AGENTS_FOLDER}/ beside them. Name <workflows>/${AGENTS_FOLDER}.`;
  }
  if (anywhere || isWorkflowsHolder(path.dirname(dir))) return undefined;
  return `${dir} is not the store's ${AGENTS_FOLDER}/ (${path.join(path.resolve(HOME, 'workflows'), AGENTS_FOLDER)}) nor a repository's (<repo>/workflows/${AGENTS_FOLDER}, beside its .git), the two places the board lists agents from. Write it to one of the two, or pass { anywhere: true } to write ${dir} all the same.`;
}

/** Whether two paths are one file on disk: a rename by case, where the filesystem does not tell case apart. */
function sameFile(a: string, b: string): boolean {
  const [x, y] = [fs.statSync(a, { throwIfNoEntry: false }), fs.statSync(b, { throwIfNoEntry: false })];
  return Boolean(x && y && x.ino === y.ino && x.dev === y.dev);
}

const inUse = (name: string, users: readonly string[], does: string): string =>
  `${AGENTS_FOLDER}/${name}.md is named by ${users.length === 1 ? 'a step' : `${users.length} steps`} beside it — ${users.join(', ')} — and ${does} would leave ${users.length === 1 ? 'it' : 'each'} naming an agent that is not there, which the workflow refuses to load. Give ${users.length === 1 ? 'that step' : 'those steps'} another agent, or remove the \`agent:\` line, first.`;

/**
 * An agent written from a draft (`renderAgent`): what the board's Agents page saves, and the inverse of `loadAgents` for one agent. `dir` is
 * a folder of agents, `<workflows>/agents`, and a run is not changed by any of it: a run froze its folder, and the agents its steps name, at
 * `wf start`, so a write changes what a later `wf start` freezes and nothing else.
 *
 * `version` is the agent's as it was read (`agentVersion`), or `null` for a new agent; `from` names the agent the draft was read from, when
 * it is renamed. Judged whole before a byte is written, each refusal by name: the place (`agentPlaceRefusal`), each name as a file's
 * (`agentNameRefusal`), a link where a file would be written or removed, a new agent whose name is taken, an agent no longer there or changed
 * since `version` was read, a rename onto another agent or of one steps still name — saying which — and then the file as it would be,
 * rendered and parsed as `loadAgents` parses one, so every key and value the parser refuses is refused here, in its words.
 *
 * `schema` is the result schema the agent's `output:` names and `skills` the skills its `skills:` names, each written beside it with it: a
 * `.json` file's name with no folder, the one that key names, and not a file another agent names — that one is its agent's to change.
 * Without one, the file that key names is read from the folder as it is.
 */
export function writeAgent(dir: string, draft: AgentDraft, { version, from, schema, skills, anywhere = false }: { version: string | null; from?: string; schema?: AgentSidecar | null; skills?: AgentSidecar | null; anywhere?: boolean }): AgentWritten {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined, kind?: AgentWriteError['why'], users?: string[]) => { if (why) throw new AgentWriteError(why, kind, users); };
  refuse(agentPlaceRefusal(at, anywhere));
  const name = draft?.name;
  refuse(agentNameRefusal(name));
  const old = from ?? name;
  if (from !== undefined) refuse(agentNameRefusal(from));
  if (from !== undefined && version === null) refuse(`a new agent is not renamed from another: to rename ${AGENTS_FOLDER}/${from}.md, give the version it was read at.`);
  const file = (n: string) => path.join(at, `${n}.md`);
  const linked = (target: string) => Boolean(fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink());
  const linkWhy = "an agent's file is its own: a write follows a link, and would write into whatever it points at, outside the folder.";
  for (const target of new Set([file(name), file(old)])) if (linked(target)) refuse(linkRefusal(target, linkWhy));
  const renamed = old !== name;
  if (version === null) {
    if (fs.existsSync(file(name))) refuse(`${AGENTS_FOLDER}/${name}.md is there already. Open it to change it, or give the new agent another name.`, 'exists');
  } else {
    const now = agentVersion(at, old);
    if (now === null) refuse(`${AGENTS_FOLDER}/${old}.md is not there: it was removed since it was read. Write it as a new agent to have it back.`, 'missing');
    if (now !== version) refuse(`${AGENTS_FOLDER}/${old}.md changed since it was read (version ${version}, now ${now}), and writing it would lose what changed. Read it again, and make the change on what it holds now.`, 'stale');
  }
  if (renamed) {
    if (fs.existsSync(file(name)) && !sameFile(file(name), file(old))) refuse(`${AGENTS_FOLDER}/${name}.md is there already, and renaming ${old} to it would write over it. Give ${old} another name.`, 'exists');
    const users = agentUsers(path.dirname(at), old);
    if (users.length) refuse(inUse(old, users, `renaming it to ${name}`), 'in-use', users);
  }
  const text = renderAgent(draft);
  // Each file the agent names beside it, judged whole before a byte is written: its name, that the agent's own key names it, that it is not
  // a link, and that it is not another agent's to change.
  const given = SIDECARS.map((kind) => ({ ...kind, sidecar: (kind.key === 'skills' ? skills : schema) ?? null, named: frontmatterKey(text, kind.key) }));
  for (const { key, what, a, suggest, sidecar, named: mine } of given) {
    if (!sidecar) continue;
    const bad = typeof sidecar.file !== 'string' || !/^[^\\/]+\.json$/.test(sidecar.file) || sidecar.file.startsWith('.');
    if (bad) refuse(`\`${sidecar?.file}\` is not a ${what}'s name: it is a .json file beside the agent, named with no folder — ${suggest(name)}, say.`);
    if (sidecar.file !== mine) refuse(`${a} is ${sidecar.file}, and ${AGENTS_FOLDER}/${name}.md ${mine === undefined ? 'names none' : `names ${mine}`}: a ${what} travels with the agent whose \`${key}:\` names it. Set \`${key}: ${sidecar.file}\`, or send none.`);
    if (linked(path.join(at, sidecar.file))) refuse(linkRefusal(path.join(at, sidecar.file), `a ${what} is its agent's own: a write follows a link, and would write into whatever it points at, outside the folder.`));
    const others = (fs.existsSync(at) ? fs.readdirSync(at, { withFileTypes: true }) : []).filter((e) => e.name.endsWith('.md') && e.name !== `${old}.md` && e.name !== `${name}.md`)
      .filter((e) => { try { return frontmatterKey(fs.readFileSync(path.join(at, e.name), 'utf8'), key) === sidecar.file; } catch { return false; } })
      .map((e) => path.basename(e.name, '.md'));
    if (others.length) refuse(`${sidecar.file} is the ${what} of ${others.join(', ')} too, and changing it here would change what ${others.length === 1 ? 'that agent' : 'those agents'} ${key === 'skills' ? 'say they can do' : 'declare'}. Name one of this agent's own: ${suggest(name)}, say.`);
  }
  const sending = given.flatMap(({ sidecar }) => sidecar ?? []);
  const read = (f: string): string | undefined => {
    const sent = sending.find((s) => s.file === f);
    if (sent) return sent.text;
    try { return fs.readFileSync(path.resolve(at, f), 'utf8'); } catch { return undefined; }
  };
  const agent = parseAgent(name, text, read);

  fs.mkdirSync(at, { recursive: true });
  const written: string[] = [];
  const removed: string[] = [];
  const held = (f: string): string | undefined => { try { return fs.readFileSync(path.join(at, f), 'utf8'); } catch { return undefined; } };
  const before = sending.map((sidecar) => ({ sidecar, was: held(sidecar.file) }));
  for (const { sidecar, was } of before) {
    if (was === sidecar.text) continue;
    fs.writeFileSync(path.join(at, sidecar.file), sidecar.text);
    written.push(sidecar.file);
  }
  try {
    // Renamed by case where the filesystem does not tell case apart, the old name is the new file: it goes first, as in `writeWorkflow`.
    if (renamed && sameFile(file(name), file(old))) { fs.rmSync(file(old)); removed.push(`${old}.md`); }
    fs.writeFileSync(file(name), text);
    written.push(`${name}.md`);
  } catch (err) {
    // Each file beside it goes back to what it was, so an agent that was not written leaves nothing of itself behind.
    for (const { sidecar, was } of before) {
      if (!written.includes(sidecar.file)) continue;
      was === undefined ? fs.rmSync(path.join(at, sidecar.file), { force: true }) : fs.writeFileSync(path.join(at, sidecar.file), was);
    }
    throw err;
  }
  if (renamed && !removed.length) { fs.rmSync(file(old)); removed.push(`${old}.md`); }
  return { dir: at, agent, version: agentVersion(at, name)!, written, removed };
}

/**
 * An agent removed: its file, and each file it names beside it — the skills its `skills:` names, the result schema its `output:` names —
 * unless another agent names that one too. Refused, by name, as a write
 * is — the place, the name, a link, an agent not there or changed since `version` was read — and while any step of any workflow beside
 * it still names it, saying which: removed, each of those workflows would stop loading.
 */
export function removeAgent(dir: string, name: string, { version, anywhere = false }: { version: string; anywhere?: boolean }): { dir: string; removed: string[] } {
  const at = path.resolve(dir);
  const refuse = (why: string | undefined, kind?: AgentWriteError['why'], users?: string[]) => { if (why) throw new AgentWriteError(why, kind, users); };
  refuse(agentPlaceRefusal(at, anywhere));
  refuse(agentNameRefusal(name));
  const file = path.join(at, `${name}.md`);
  if (fs.lstatSync(file, { throwIfNoEntry: false })?.isSymbolicLink()) refuse(linkRefusal(file, "an agent's file is its own, and this one is not a file in the folder. Remove the link by hand."));
  const now = agentVersion(at, name);
  if (now === null) refuse(`${AGENTS_FOLDER}/${name}.md is not there: it was removed already.`, 'missing');
  if (now !== version) refuse(`${AGENTS_FOLDER}/${name}.md changed since it was read (version ${version}, now ${now}). Read it again before removing it.`, 'stale');
  const users = agentUsers(path.dirname(at), name);
  if (users.length) refuse(inUse(name, users, 'removing it'), 'in-use', users);
  const read = (f: string) => { try { return fs.readFileSync(path.join(at, f), 'utf8'); } catch { return undefined; } };
  const mine = SIDECARS.map(({ key }) => ({ key, named: frontmatterKey(read(`${name}.md`) ?? '', key) }));
  fs.rmSync(file);
  const removed = [`${name}.md`];
  for (const { key, named } of mine) {
    if (named === undefined || !/^[^\\/]+\.json$/.test(named)) continue;
    const shared = fs.readdirSync(at).some((f) => f.endsWith('.md') && frontmatterKey(read(f) ?? '', key) === named);
    const sidecarAt = path.join(at, named);
    if (!shared && fs.lstatSync(sidecarAt, { throwIfNoEntry: false })?.isFile()) { fs.rmSync(sidecarAt); removed.push(named); }
  }
  return { dir: at, removed };
}

/** Where an agent may be, in order: the repository's `workflows/agents`, then your store's. The board's two places (`sourcesOf`, apps/api). */
export const agentPlaces = (repo: string): Array<{ from: AgentPlace; dir: string }> => [
  { from: 'repo', dir: path.join(path.resolve(repo), 'workflows', AGENTS_FOLDER) },
  { from: 'yours', dir: path.join(HOME, 'workflows', AGENTS_FOLDER) },
];

export type AgentPlace = 'repo' | 'yours';

/** Every agent of both places, in the order the places come, each read now. An agent that does not read carries its refusal. */
export function listAgents(repo: string): Array<{ from: AgentPlace; dir: string; name: string; agent: Agent | WorkflowError }> {
  return agentPlaces(repo).flatMap(({ from, dir }) =>
    [...loadAgents(dir).entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([name, agent]) => ({ from, dir, name, agent })));
}

/**
 * One agent by name, from `from` when it is given and otherwise the first place that has it. Refused, naming the fix, when no place has it,
 * when both do and nothing says which, or when the file is there and does not read — that last in the parser's own words.
 */
export function findAgent(name: string, repo: string, from?: AgentPlace): { from: AgentPlace; dir: string; agent: Agent } {
  const places = agentPlaces(repo).filter((place) => from === undefined || place.from === from);
  const found = places.flatMap((place) => {
    const agent = loadAgents(place.dir).get(name);
    return agent === undefined ? [] : [{ ...place, agent }];
  });
  const where = (list: ReadonlyArray<{ from: AgentPlace }>) => list.map((p) => `--from ${p.from}`).join(' or ');
  if (!found.length) {
    const has = agentPlaces(repo).filter((place) => fs.existsSync(place.dir)).map((place) => `${place.dir} (${[...loadAgents(place.dir).keys()].sort().join(', ') || 'no agents'})`);
    throw new WorkflowError(`no agent named ${name}${from ? ` in ${from}` : ''}. Looked in ${has.length ? has.join(' and ') : agentPlaces(repo).map((p) => p.dir).join(' and ')}. wf agents lists them.`);
  }
  if (found.length > 1) throw new WorkflowError(`${name} is an agent in both places — ${found.map((p) => p.dir).join(' and ')}. Say which: ${where(found)}.`);
  const one = found[0]!;
  if (one.agent instanceof Error) throw one.agent;
  return { from: one.from, dir: one.dir, agent: one.agent };
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

const isDirectory = (at: string): boolean => Boolean(fs.statSync(at, { throwIfNoEntry: false })?.isDirectory());

/** The inbox's entries as the pure half takes a folder's: a folder by its name and a trailing `/`, a markdown file with its text. None when there is no inbox yet. */
function inboxFiles(): Array<{ file: string; text: string }> {
  let names: string[];
  try { names = fs.readdirSync(inboxDir()); } catch { return []; }
  return names.map((name) => {
    const at = path.join(inboxDir(), name);
    if (isDirectory(at)) return { file: `${name}/`, text: '' };
    try { return { file: name, text: name.endsWith('.md') ? fs.readFileSync(at, 'utf8') : '' }; } catch { return { file: name, text: '' }; }
  });
}

/** The names of the inbox's cards, as `wf inbox` lists them. */
const inboxCards = (): string[] => inboxListing(inboxFiles(), [], () => true).filter((l) => l.file.endsWith('.md')).map((l) => l.name);

/**
 * Where the tick writes down a queued card's start it tried and did not make (`QueueTry`): `$WF_ROOT/queue/<name>.json`, outside the inbox, which
 * is a person's. The tick is its one writer: it writes one when a start does not happen, and removes it once the card is no longer queued as it
 * was — started, taken back, dropped or edited.
 */
const queueDir = (): string => path.join(HOME, 'queue');

/** The tries the tick has written down, by card name. A file that does not read as one is none: the card is tried, and written again. */
function queueTries(): Map<string, QueueTry> {
  const tries = new Map<string, QueueTry>();
  let names: string[];
  try { names = fs.readdirSync(queueDir()).filter((n) => n.endsWith('.json')); } catch { return tries; }
  for (const file of names) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(queueDir(), file), 'utf8')) as Partial<QueueTry>;
      if (typeof r.at === 'string' && typeof r.text === 'string' && typeof r.repo === 'string' && typeof r.why === 'string' && typeof r.refused === 'boolean') {
        tries.set(file.slice(0, -'.json'.length), { at: r.at, text: r.text, repo: r.repo, why: r.why, refused: r.refused });
      }
    } catch { /* torn, or removed since the listing */ }
  }
  return tries;
}

/**
 * `wf inbox`: every card in the inbox, by name, with the runs a record says it was started as (`inboxListing`) — and every entry that does not
 * read as a card, with why. The run records are read for their `from`, so a card whose removal failed after its start is listed as started; and
 * the tick's tries, so a queued card whose start was refused, or failed, says why.
 */
export const readInbox = (): InboxListing[] => inboxListing(inboxFiles(), listRuns(), isDirectory, queueTries());

/**
 * `wf inbox add`: an idea filed as a card (`ideaCard`), under the slug `runId` makes of its body's first line, suffix and all, so two ideas
 * alike are two cards. `text` is a note, or a file's text; `from` is what a refusal calls it; `dir` is the folder a path in the text's own
 * `workflow:` is read from — the file's — and it is written absolute (`ideaCard`). `workflow` and `repo` are written as the card's keys, over
 * the text's own: `repo` an absolute path to a directory, `workflow` a name or an absolute path (`workflowAt`), as a start would be given it.
 */
export function addToInbox(opts: { text: string; from?: string; dir?: string; workflow?: string; repo?: string }): { card: InboxCard; file: string } {
  const { text, body } = ideaCard(opts.from ?? 'the idea', opts.text, { workflow: opts.workflow, repo: opts.repo }, isDirectory, opts.dir);
  fs.mkdirSync(inboxDir(), { recursive: true });
  for (;;) {
    const name = runId(body.split('\n')[0]!);
    const file = path.join(inboxDir(), `${name}.md`);
    try {
      // `wx`: a name already taken is drawn again, never written over.
      fs.writeFileSync(file, text, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') continue;
      throw err;
    }
    return { card: parseInboxCard(`${name}.md`, text, isDirectory), file };
  }
}

/** What `wf inbox queue` did: the card as it now reads, its file, and — once queued — its place in the queue's order and how many are in it. */
export type InboxQueued = { card: InboxCard; file: string; place?: number; of?: number; was: 'queued' | 'taken back' | 'not queued' };

/**
 * `wf inbox queue <name>`: the card marked to start on its own, `queued:` the time now, and `workflow:` written over its own when given; `off`
 * takes the mark back. The card's file is written whole, through a hidden file renamed over it, so a pass never reads half a card — and the
 * file keeps the time it was last written, since the rename would give it the time of the queue, and a card has no filing time of its own but
 * its mtime: a board orders its cards by it, and a card queued or taken back would jump to the top of the list. A queue is no edit of the idea.
 *
 * Refused by name, exit 2, before anything is written: a name that is not a card's (`inboxNameRefusal`), a name with no card — naming the cards
 * there are — a card that does not read, and what `queueRefusal` refuses: a card a run's record names, one already queued, and one with no
 * workflow and none given. `off` on a card not queued writes nothing, and says so.
 */
export function queueInInbox(name: string, how: { off?: boolean; workflow?: string } = {}): InboxQueued {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${name}.md`);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new WorkflowError(`${noCardLine(name, inboxCards())} Queue one of those — wf inbox queue <name> — or park the idea first: wf inbox add "<idea>".`);
  }
  // Taken back whatever its `repo:` names: a card whose repository is gone leaves the queue as any card does, and is listed with why.
  const exists = how.off ? () => true : isDirectory;
  const card = parseInboxCard(`${name}.md`, text, exists);
  if (how.off && card.queued === undefined) return { card, file, was: 'not queued' };
  if (!how.off) {
    const listing = readInbox();
    const why = queueRefusal(card, file, listing.find((l) => l.name === name)?.startedAs ?? [], listing.find((l) => l.name === name)?.queued?.place ?? null, how.workflow);
    if (why) throw new WorkflowError(why);
  }
  const written = queuedText(card, how.off ? null : new Date().toISOString(), exists, how.workflow);
  // When the card was last written, to set back over the rename below: the card's filing time, as a board reads it.
  const filed = fs.statSync(file, { throwIfNoEntry: false })?.mtime;
  const hidden = path.join(inboxDir(), `.${name}.md.${process.pid}`);
  fs.writeFileSync(hidden, written);
  fs.renameSync(hidden, file);
  if (filed) {
    try {
      fs.utimesSync(file, filed, filed);
    } catch {
      // The queue is written all the same: the card lists at the time of the queue, until it is written again.
    }
  }
  const now = parseInboxCard(`${name}.md`, written, exists);
  if (how.off) return { card: now, file, was: 'taken back' };
  const order = queueOrder(readInbox());
  const place = order.findIndex((l) => l.name === name) + 1;
  return { card: now, file, ...(place ? { place } : {}), of: order.length, was: 'queued' };
}

/** What `wf inbox rm` did: the card's file removed, or no card of that name, and the cards the inbox has. */
export type InboxDropped = { removed: true; file: string } | { removed: false; cards: string[] };

/**
 * `wf inbox rm`: a card dropped without being started. Refused, exit 2, for a name that is not a card's (`inboxNameRefusal`). A name with no
 * card is normal — dropped already, or never filed — and says which cards there are.
 */
export function dropFromInbox(name: string): InboxDropped {
  const refused = inboxNameRefusal(name);
  if (refused) throw new WorkflowError(refused);
  const file = path.join(inboxDir(), `${name}.md`);
  try {
    fs.rmSync(file);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { removed: false, cards: inboxCards() };
    throw Object.assign(new Error(`wf inbox rm: ${file} could not be removed — ${(err as Error).message}. Nothing was dropped: remove the file by hand, or fix what stops it and drop it again.`), { exitCode: 1 });
  }
  return { removed: true, file };
}

/**
 * The name of the inbox card `given` is a path to — any path under the inbox, `<inbox>/<name>.md` or `<inbox>/<name>`, links resolved on the
 * way to both (`inboxNameOf`) — or null for a path outside it, and for text: what makes `wf start <path>` go through `startFromInbox`. A card
 * not there is still a card's path, refused by name at start.
 */
export function inboxNameAt(given: string): string | null {
  const real = (at: string): string => { try { return fs.realpathSync(at); } catch { return at; } };
  const at = path.resolve(given);
  return inboxNameOf(path.join(real(path.dirname(at)), path.basename(at)), real(inboxDir()));
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

/** What `startFromInbox` did: the run, the card it started, and whether the card left the inbox — and, when not, why. */
export type InboxStarted = { run: Run; card: InboxCard; removed: true } | { run: Run; card: InboxCard; removed: false; why: string };

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
  try {
    fs.rmSync(file, { force: true });
  } catch (err) {
    return { run, card, removed: false, why: `${file} could not be removed — ${(err as Error).message}` };
  }
  return { run, card, removed: true };
}

/**
 * The queue's next card started (`nextQueued`), one try: through `startFromInbox`, with the card's `workflow:` and its `repo:` or else `repo`,
 * the daemon's — so its base is its base branch as it is now, and its brief is frozen now. Undefined with no card to start.
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
    return started.removed ? { card: next.name, run: started.run.id, removed: true } : { card: next.name, run: started.run.id, removed: false, why: started.why };
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
 * Commit whatever a step left behind, so the workspace it hands on is the workspace it made.
 *
 * Idempotent: a clean tree commits nothing, so this runs on every pass without accumulating
 * commits. Deliberately not a failure if it cannot — a step's real work is already committed by
 * the step itself in the normal case, and losing a run over a git edge case would be worse.
 * Answers with the commit it made, or with git's words when it could not make one — a hook that refused it, a signature that failed — and
 * undefined with nothing to commit: the tick reads neither, and `wf rm` says both. `when` goes on the commit's message, saying why.
 * The repository's hooks and signing are honoured: a hook may be what keeps a secret off a branch.
 */
function handOff(workspace: string, step: string, when = ''): { commit: string } | { error: string } | undefined {
  const quiet = { cwd: workspace, encoding: 'utf8' as const, stdio: ['ignore', 'pipe', 'pipe'] as Array<'ignore' | 'pipe'> };
  try {
    if (!execFileSync('git', ['status', '--porcelain'], quiet).trim()) return undefined;
    execFileSync('git', ['add', '-A'], quiet);
    execFileSync('git', [
      '-c', 'user.email=wf@local', '-c', 'user.name=wf',
      'commit', '-m', `${step}: hand off what was left uncommitted${when}`,
    ], quiet);
    return { commit: git(workspace, 'rev-parse', 'HEAD') };
  } catch (err) { return { error: failedWords(err) }; }
}

/** What a failed git command said, for a person: the last lines of its stderr — where git hands on a hook's output, stdout's too — or its exit status. */
function failedWords(err: unknown, lines = 4): string {
  const { stderr, status } = err as { stderr?: unknown; status?: number | null };
  const said = String(stderr ?? '').split('\n').map((l) => l.trim()).filter(Boolean);
  return said.length ? said.slice(-lines).join(' / ') : `it exited ${status ?? 'on a signal'}`;
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
  const collected = handOffDue(steps, run, phaseOf).flatMap((name) => {
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

  // Another try: a refused check `retries:` still covers, or a person's `wf retry`. The step goes on in the
  // workspace and on the branch it had, under its next try's derived id, and the try it replaces moves behind
  // it on the record. Nothing about the engine changes: to it, this is one more task.
  const tried: string[] = [];
  const rechecked: string[] = [];
  const notes: string[] = [...askNotes, ...collected];
  // Read again at the moment of filing, and not only when this pass read the run: a person may have called it off, and `wf rm` forgotten it,
  // while this pass was at work — cutting a worktree, whose `npm ci` takes a minute. Filed then, a session would work in a worktree that is
  // gone, for a record no pass reads, and no stop would reach it. The world as it stands decides, and once called off, nothing more is
  // filed on this pass.
  let calledOff = false;
  const mayFile = (): boolean => !(calledOff ||= !fs.existsSync(runFile(run.id)) || fs.existsSync(cancelFile(run.id)));
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
 * cancellation, its asks, its own directory (inputs, artifacts), its check logs (`checkLogsOf`, by the steps `names`, or without them any
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
  for (const at of [runFile(id), cancelFile(id), asksDir(id), path.join(runsDir(), id)]) remove(at);
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
export type Pass = { runs: Advanced[]; queue?: QueueStarted };

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
  return { runs: runs.map((run) => done.get(run.id)!), ...(queue ? { queue } : {}) };
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
  // The engine's own word, but `unknown` for a task it has no record of, as `phaseOfView` has it: the engine folds
  // that task to the state of one filed and waiting for a slot, and calls it `pending`, which is in flight.
  const wordOf = (taskId: string): string => {
    const v = views.get(taskId);
    return v?.state.brief ? v.phase : 'unknown';
  };
  // And where the run's result stands against the base branch, read off git on this pass: what says a finished run is one nobody has decided.
  const standings = standingsOf(run);
  // And which run's ending step has the repository's own checkout, when this run's waits for it: read of the store, as the pass that would file it reads it.
  const checkout = await checkoutHold(e, run, steps);
  return listing(steps, run, wordOf, (name) => closeoutOf(views, run, name), closeoutAsked(views), (name) => refused.get(name)?.verdict, asks, rounds, readAnswers(run.id), waitsOf(run, await parentsOf(e, run)), saidCount(views, run), spendReader(views), slot, standings, checkout);
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
 * Artifacts a step DECLARED that the run does not have, and why (`MissingArtifact`).
 *
 * The whole point of declaring them. The first real run lost the reviewer's entire output because
 * REVIEW.md was written and never committed, and nothing anywhere noticed — the merge was clean
 * and empty. A declared file the run does not have is now a mismatch somebody can see.
 *
 * A path from the workspace root is read where the tick collected it (`collectArtifacts`), and the workspace says why when it is not
 * there (`workspaceArtifact`). An absolute path names a file in the step's files directory (`artifactsDir`), and is looked for there,
 * on disk: present when it is a file inside the directory once every link on the way is followed, so a link that leads out is as missing
 * as where it leads. Any other absolute path, and a path that climbs out of the workspace as written, are reported without being looked
 * at (`artifactPlace`).
 */
export function missingArtifacts(run: Run, stepName: string, closeout: Closeout | { error: string } | undefined): MissingArtifact[] {
  if (!closeout || 'error' in closeout) return [];
  const dir = artifactsDir(run, stepName);
  const missing: MissingArtifact[] = [];
  for (const file of closeout.artifacts) {
    const place = artifactPlace(file, dir);
    const why = place === 'outside' || place === 'escapes' ? place
      : place === 'files' ? (isFileIn(file, dir) ? undefined : 'missing')
      : workspaceArtifact(run, stepName, file, dir);
    if (why) missing.push({ path: file, why });
  }
  return missing;
}

/**
 * Why a file named from the workspace root is not one the run has — or undefined when it is: collected into `dir`, which answers first,
 * whatever the workspace holds since. Otherwise the workspace says why, where the record names one: a link that leads out of it, or a
 * directory. A file in the workspace whose copy something a step made in `dir` refuses (`copyBlocked`) is `not collected`, even when it is
 * on the branch too: the run does not pass over a copy it refused. Any other file is the branch's to answer, as it was before collection —
 * so a run from before it, whose worktree is still there and whose steps are past hand-off, reads as it did — and one on no branch either,
 * a file git ignores that its step has not handed off yet, is `not collected`. With nothing in the workspace, the branch answers too.
 */
function workspaceArtifact(run: Run, stepName: string, file: string, dir: string): MissingArtifact['why'] | undefined {
  const rel = path.normalize(file);
  if (isFileIn(path.join(dir, rel), dir)) return undefined;
  const { workspace, branch } = run.steps[stepName] ?? {};
  const at = workspace ? inWorkspace(workspace, rel) : { kind: 'absent' as const };
  if (at.kind === 'outside') return 'escapes';
  if (at.kind === 'directory') return 'directory';
  if (at.kind === 'file' && copyBlocked(dir, rel)) return 'not collected';
  const onBranch = branch && isGitRun(run) ? gitSays(run.repo, 'cat-file', '-t', `${branch}:${rel}`)?.trim() : undefined;
  if (at.kind === 'file') return onBranch === 'blob' ? undefined : 'not collected';
  return onBranch === 'blob' ? undefined : onBranch === 'tree' ? 'directory' : 'not there';
}

/**
 * What is at a path from a workspace's root, every link on the way followed: a file, and where it really is; a directory; something else;
 * nothing — or `outside`, when a link leads out of the workspace, which is not looked at further.
 */
function inWorkspace(workspace: string, rel: string): { kind: 'file'; real: string } | { kind: 'directory' | 'other' | 'absent' | 'outside' } {
  let root: string;
  let real: string;
  try {
    root = fs.realpathSync(workspace);
    real = fs.realpathSync(path.join(workspace, rel));
  } catch { return { kind: 'absent' }; }
  if (real !== root && !inside(root, real)) return { kind: 'outside' };
  const at = fs.statSync(real, { throwIfNoEntry: false });
  return at?.isFile() ? { kind: 'file', real } : at?.isDirectory() ? { kind: 'directory' } : { kind: at ? 'other' : 'absent' };
}

/**
 * Copy each file a step's closeout names from its workspace root into the step's files directory, at the same path — so a step that cannot
 * write outside its worktree (Codex in `workspace-write`, which the engine gives no other directory) still hands its files over, and the
 * steps after it and `wf decide` read them from one place (`missingArtifacts`, `artifactFiles`).
 *
 * `advance` runs it on each pass that hands a step off (`handOffDue`): until its check is filed, and until a step after it works in its
 * workspace. Level-triggered and idempotent, so a pass that dies halfway loses nothing: a copy with its source's size and time is left as
 * it is. Nothing is copied, and `wf decide` says why, for a path that climbs out of the workspace (never read), a link that leads out of it
 * (not followed), a directory, and a file that is not there. Nothing is written through a link in the files directory, which a step may
 * have made. It never throws, as a hand-off does not. The pass's note names what was copied.
 */
function collectArtifacts(run: Run, stepName: string, closeout: Closeout | undefined): string[] {
  const workspace = run.steps[stepName]?.workspace;
  if (!closeout || !workspace) return [];
  const dir = artifactsDir(run, stepName);
  const copied: string[] = [];
  for (const file of closeout.artifacts) {
    if (artifactPlace(file, dir) !== 'workspace') continue;
    const rel = path.normalize(file);
    const at = inWorkspace(workspace, rel);
    if (at.kind !== 'file') continue;
    try {
      if (copyBlocked(dir, rel)) continue;
      const to = path.join(dir, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      const from = fs.statSync(at.real);
      const there = lstatOf(to);
      // Within a millisecond: the time a copy is given goes through a `Date` and a float of seconds, and reads back a hair off the source's.
      if (there && there.size === from.size && Math.abs(there.mtimeMs - from.mtimeMs) < 1) continue;
      fs.copyFileSync(at.real, to);
      fs.utimesSync(to, from.atime, from.mtime);
      copied.push(rel);
    } catch { /* not collected, and `wf decide` says so */ }
  }
  return copied.length ? [`${stepName}: collected ${copied.join(', ')} into ${dir}`] : [];
}

/**
 * Whether a copy of `rel` into `dir` would go through something a step may have made there: `dir`, or a directory on the way to the copy,
 * that is there and is not a plain directory — a link, a file — or something in the copy's place that is not a regular file. Looks, and
 * makes nothing: what `collectArtifacts` refuses to write through, and what `missingArtifacts` names as the copy refused.
 */
function copyBlocked(dir: string, rel: string): boolean {
  let at = dir;
  for (const part of ['.', ...path.dirname(rel).split(path.sep).filter((p) => p && p !== '.')]) {
    at = path.join(at, part);
    const st = lstatOf(at);
    // Nothing there yet: made as a plain directory, and nothing below it can be in the way.
    if (!st) return false;
    if (!st.isDirectory()) return true;
  }
  const there = lstatOf(path.join(dir, rel));
  return Boolean(there && !there.isFile());
}

/** Whether `file` is a regular file inside `dir`, with every link on the way to either followed. */
function isFileIn(file: string, dir: string): boolean {
  try {
    const real = fs.realpathSync(file);
    return artifactPlace(real, fs.realpathSync(dir)) === 'files' && fs.statSync(real).isFile();
  } catch { return false; }
}

/**
 * Every file in a step's files directory, every level down, with its size: what `wf decide` lists after
 * the step's closeout. Regular files only, and no link is followed, so nothing outside the directory is
 * listed because something inside it points there.
 */
export function artifactFiles(run: Pick<Run, 'id'>, stepName: string): ArtifactFile[] {
  const found: ArtifactFile[] = [];
  const walk = (dir: string): void => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const at = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(at);
      else if (entry.isFile()) found.push({ path: at, bytes: fs.lstatSync(at).size });
    }
  };
  walk(artifactsDir(run, stepName));
  return found.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Has this branch landed on the base branch? Git's answer, not ours — and which yes it is (`Shipped`).
 *
 * `--is-ancestor` rather than a merge-commit search, so a fast-forward, a squash-merge that was
 * then merged, and a rebase all read the same: the commits are in, therefore it shipped.
 *
 * A yes is `'unchanged'` when nothing is committed on the branch past the run's base: it was cut there, so it
 * has been on the base branch since it was cut, and `decision` calls that shipped only for a run whose steps
 * all succeeded. Asked the same way the other way round — is the branch within the base — and `'unchanged'`
 * too when git cannot say, so a run on a base git cannot read is decided by a person, never waved through.
 *
 * A branch git no longer has — deleted after the merge — is asked by the tip the run's tick recorded
 * once the run had finished (`tipsSeen`): still git's answer, about the commit the branch named. Git
 * keeps no trace of it otherwise: a merge carries any message, and `git branch -d` needs the worktree
 * removed first. With no tip recorded, a branch that is gone has not landed as far as anyone can tell.
 */
export function isShipped(run: GitRun, branch: string): Shipped {
  const within = (commit: string, base: string) => execFileSync('git', ['merge-base', '--is-ancestor', commit, base], { cwd: run.repo, stdio: 'ignore' });
  // On the base branch already: with commits past the run's base, or none. Exit 1 is git's no — the commit is not within the run's base.
  const landed = (commit: string): Shipped => {
    try {
      within(commit, run.baseRef);
      return 'unchanged';
    } catch (err) {
      return (err as { status?: number }).status === 1 ? true : 'unchanged';
    }
  };
  try {
    within(branch, run.branch);
  } catch (err) {
    // Exit 1 is git's no. Anything else is a name git cannot read, and the tip is asked instead — only then, since a branch that is
    // still there and not on the base has not landed, whatever an older tip of it says.
    const tip = run.tips?.[branch];
    if ((err as { status?: number }).status === 1 || !tip) return false;
    try {
      within(tip, run.branch);
    } catch { return false; }
    return landed(tip);
  }
  return landed(branch);
}

/**
 * Where each of a run's result branches stands against the base branch it was cut from, as git says it now (`BranchStanding`): on it
 * (`isShipped`, either yes), gone — git no longer has it, and no recorded tip puts it on the base — or ahead of it, by the commits the
 * base branch does not have.
 *
 * Read on the pass that asks and never stored, for the reason `shipped` is asked rather than stored: a person merging by hand changes the
 * answer, and nothing tells the run. A branch git cannot count reads as ahead by none rather than as shipped.
 */
/** Where a run's result branches stand, as `branchStandings` says: none for a folder run, which has no branch. */
const standingsOf = (run: Run): BranchStanding[] => (isGitRun(run) ? branchStandings(run, resultBranches(run)) : []);

/** Whether a branch of the run is on its base (`isShipped`): never, for a folder run, which has no branch to ask about. */
const shippedOf = (run: Run) => (branch: string): Shipped => (isGitRun(run) ? isShipped(run, branch) : false);

export function branchStandings(run: GitRun, branches: readonly string[]): BranchStanding[] {
  return [...new Set(branches)].map((branch): BranchStanding => {
    if (isShipped(run, branch) !== false) return { branch, where: 'on' };
    if (gitSays(run.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`) === undefined) return { branch, where: 'gone' };
    const count = Number(gitSays(run.repo, 'rev-list', '--count', `${run.branch}..${branch}`)?.trim());
    return { branch, where: 'ahead', commits: Number.isSafeInteger(count) ? count : 0 };
  });
}

/**
 * A run another waits on, as its record and git say it without the engine: the record, when the store has one, and the result branches
 * it names that git no longer has and cannot find on the base by their recorded tips (`isShipped`). What `wf start --after` refuses an
 * edge by (`afterRefusal`), and where `parentOf` starts.
 */
export function parentRecord(id: string): Pick<ParentRun, 'record' | 'gone'> {
  let record: Run;
  try { record = readRun(id); } catch { return {}; }
  let branches: string[];
  try { branches = resultBranches(record); } catch { branches = []; }   // a pre-freeze record whose folder is gone names no steps
  const git = isGitRun(record) ? record : undefined;
  const gone = git ? branches.filter((b) => gitSays(git.repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${b}`) === undefined && !isShipped(git, b)) : [];
  return { record, ...(gone.length ? { gone } : {}) };
}

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

/** Each of these branches git has, and the commit it is at, in one `for-each-ref`. A branch git does not have is left out. */
function refsOf(repo: string, branches: readonly string[]): Record<string, string> {
  const listed = gitSays(repo, 'for-each-ref', '--format=%(objectname) %(refname)', ...branches.map((b) => `refs/heads/${b}`)) ?? '';
  const refs: Record<string, string> = {};
  for (const line of listed.split('\n')) {
    const space = line.indexOf(' ');
    const branch = line.slice(space + 1).replace(/^refs\/heads\//, '');
    if (space > 0 && branches.includes(branch)) refs[branch] = line.slice(0, space);
  }
  return refs;
}

/**
 * The files this run ADDED — what its steps wrote for whoever reads next.
 *
 * Read out of git rather than off disk, because the worktree a step ran in is gone by the time
 * anybody decides anything, while the branch is exactly as it was left.
 *
 * "Added" is the whole rule. A step that wants to tell a person something writes a file, the same
 * way it tells the next step — so the artifacts are the new files, and no frontmatter key has to
 * be invented to declare them.
 */
export function artifacts(run: GitRun, branch: string): string[] {
  try {
    return git(run.repo, 'diff', '--diff-filter=A', '--name-only', `${run.baseRef}...${branch}`)
      .split('\n').map((l) => l.trim()).filter(Boolean);
  } catch { return []; }
}

/** One artifact's text, out of the branch. */
export function readArtifact(run: GitRun, branch: string, file: string): string {
  try { return git(run.repo, 'show', `${branch}:${file}`); } catch { return ''; }
}

/** How much the run changed, in one line. */
export function diffStat(run: GitRun, branch: string): string {
  try { return git(run.repo, 'diff', '--shortstat', `${run.baseRef}...${branch}`); } catch { return ''; }
}

/**
 * Git's output, or undefined when it cannot answer — quietly, since a person reads the screen this
 * feeds, and untrimmed, since a name may end in a space. A lockfile's diff is large, so is the buffer.
 */
const gitSays = (repo: string, ...args: string[]): string | undefined => {
  try { return execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 }); } catch { return undefined; }
};

/**
 * What a branch touched (`radius`), off `git diff --numstat` against the run's base, renames found
 * whatever the repository's config says. An error when git cannot say, or says what `radius` cannot
 * read: a branch that is gone is not a branch that changed nothing.
 */
export function touchedBy(run: GitRun, branch: string): Radius | { error: string } {
  const numstat = gitSays(run.repo, '-c', 'core.quotePath=false', 'diff', '--numstat', '--find-renames', `${run.baseRef}...${branch}`);
  if (numstat === undefined) return { error: `git could not diff ${run.baseRef.slice(0, 12)}...${branch}` };
  try { return radius(numstat, workspacesOf(run)); } catch (err) { return { error: (err as Error).message }; }
}

/**
 * The base's npm `workspaces`, which `radius` groups a change by — read at the base, where no step could have edited them, and handed on
 * as written: `radius` reads `./packages/*` as `packages/*`, and names a glob with `**` on the screen (`workspaceGlob`, `deepWorkspaces`).
 */
function workspacesOf(run: GitRun): string[] {
  try {
    const { workspaces } = JSON.parse(gitSays(run.repo, 'show', `${run.baseRef}:package.json`) ?? '{}');
    const globs: unknown = Array.isArray(workspaces) ? workspaces : workspaces?.packages;
    return Array.isArray(globs) ? globs.filter((g): g is string => typeof g === 'string') : [];
  } catch { return []; }
}

/**
 * The whole diff, base to branch, of the changed files these globs name — by default the ones that decide
 * what a check means. Both ends of a rename are asked for, so git shows it as one. Empty when no changed
 * file is named; undefined when the branch could not be read, or git cannot say.
 */
export function sensitiveDiff(run: GitRun, t: Touched, globs: readonly string[]): string | undefined {
  if ('error' in t.radius) return undefined;
  const paths = sensitivePaths(t.radius.changes, globs);
  if (!paths.length) return '';
  return gitSays(run.repo, '-c', 'core.quotePath=false', '--literal-pathspecs', 'diff', '--no-color', '--no-ext-diff', '--find-renames', `${run.baseRef}...${t.branch}`, '--', ...paths);
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
  // Asked only of a run with nothing filed, which is all the cap holds: every run in the store is read for it.
  const held = !hasStarted(run) && !run.cancelledAt ? (await runSlots(e)).get(id) : undefined;
  return {
    run, decision: d, closeouts, checks,
    retrying: run.cancelledAt ? [] : retriesDue(steps, run, phaseOf, reader, asked, verdictOf, asks, blocked, spendOf),
    rounding: run.cancelledAt ? [] : roundsDue(steps, run, phaseOf, reader, asked, rounds, spendOf),
    offers: [...roundLines(steps, run, d, spendOf), ...retryLines(steps, run, d, phaseOf, reader, asked, spendOf, verdictOf)],
    overBudgetLine: overBudgetLine(steps, run, d, spendOf),
    used,
    costs,
    runCost: runCostLines(run, spendOf),
    answers,
    answering: answerLines(steps, run, d, phaseOf, reader, asked, spendOf),
    gates: gateLines(steps, run, phaseOf, reader, asked, verdictOf, spendOf, asks, rounds),
    waiting: waitsOf(run, await parentsOf(e, run)),
    said,
    timeline: timeline(run, everyTry, filed, steps),
    ...(held ? { held } : {}),
    standings,
    ...(checkout ? { checkout } : {}),
    ...(decide ? { toDecide: decide } : {}),
  };
}

export function resultBranches(run: Run): string[] {
  const steps = stepsOf(run);
  return resultSteps(steps)
    .map((s) => run.steps[s.name]?.branch)
    .filter((b): b is string => Boolean(b));
}
