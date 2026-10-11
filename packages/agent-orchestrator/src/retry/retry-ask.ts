/**
 * Trying again, as a person asks it and a record keeps it: how a person asks for a try (`nemia retry`), the tries a step's record keeps
 * behind the one it is on, a try due and how its record moves on once it is filed — and the words `nemia ls` and `nemia decide` say of
 * them. Pure; what reads a step's standing to judge a try — `retryable` and `retriesDue` — is `retry.ts`'s, and `retryRefusal`
 * `retry-refusal.ts`'s.
 */
import { lackedOf, tryOf, type CloseoutAsked, type Run, type StepRecord } from '../record/record.ts';
import type { Workflow } from '../step/step.ts';

/**
 * How a person asks for another try of a step, with `nemia retry`.
 *
 *   nudge    the last try's session, continued and told what happened — what `retries:` files too
 *   fresh    a new session on the same branch; on another model, when the ask names one
 *   recheck  the step's check, run again on the work as it stands, and no session at all
 */
export type RetryMode = 'nudge' | 'fresh' | 'recheck';

/**
 * The session a try continues, off the attempts of the task before it: the harness's own id for the last attempt's session — what
 * `--resume` takes. An attempt its harness never named — one whose spawn it refused (`unstartable`), one it lost, one that died before it
 * said its id — continues nothing of its own, but the session it was started to continue is still there, and where the work last stood:
 * the try continues that one rather than starting cold. For a later turn of a task held open, that is the session that signed the turn
 * before, which asked the question the turn answered. Undefined for a task with no attempt, and for one whose last attempt started cold and
 * left no id. Pure; typed by what it reads, so this file imports no runtime.
 */
export const continuesFrom = (
  attempts: ReadonlyArray<{ nativeId: string | null; resumeFrom?: string }> | undefined,
): string | undefined => {
  const last = attempts?.at(-1);
  if (!last) return undefined;
  return last.nativeId ?? last.resumeFrom;
};

/**
 * A try that is over, kept on the step's record behind the one that replaced it.
 *
 * `then` is what replaced it: `retries`, the run re-filing the step itself after its check refused — a
 * nudge on the workflow's word — or `signoff`, the run continuing a session that ended without its closeout, once a
 * round, before it waits on a person (`retriesDue`) — or the mode a person asked for, with the model a `--model` named. A
 * recheck replaces only the check, so the try after one has the same `taskId`. Or `round`: the step's loop
 * went round again (`roundFiled`), and the try after it is the next round's. Or `merge`: the loop was filed again on the round it is on,
 * for its target to merge the base (`nemia merge`), which no round counts (`roundIn`). Or `back`: an ending that stopped on the base
 * branch, sent back with its work (`sentBack`), whose next try is filed on a new approval.
 */
export type EarlierTry = {
  taskId: string;
  check?: { taskId: string };
  then: 'retries' | 'signoff' | RetryMode | 'round' | 'merge' | 'back';
  model?: string;
  /** The pause filed the try after this one (`nemia pause --now` stopped it, and the resume tried it again): `then` stays its mode. */
  paused?: true;
  /** The cap a person raised the step's `budget:` to for the try after this one (`--budget`): in force from it on (`budgetOf`). */
  budget?: number;
};

/**
 * A person's `nemia retry`, as its ask file says it: the step, the try it asks for, how, and when — and `message`, what they said
 * with it (`--message`): the answer to the `needs` of a step that signed off blocked, or anything else they have to say to the
 * step. The try's brief carries it as `## Your answer` (`retrySection`). Absent on an ask without one. And `interrupted`, on the ask
 * `nemia pause --now` writes for each task it stops: that task's id, the step's session or its check, which the ask is due on only once
 * that very task settled `stopped` (`pauseAskVoid`).
 */
export type RetryAsk = {
  step: string;
  try: number;
  mode: RetryMode;
  model?: string;
  message?: string;
  budget?: number;
  interrupted?: string;
  at: string;
};

/**
 * How a person asks for a try with `nemia retry`: one way, the model a `--model` names, what they said with it — and `budget`, the cap
 * `--budget` raises a step over its budget, or ended at it, to.
 */
export type RetryHow = { mode: RetryMode; model?: string; message?: string; budget?: number };

/**
 * A try to file on this pass: of which step, its number, how, on whose word — `retries:`, a person's `ask`, `signoff`, the run's one
 * nudge a round to a session that ended without its closeout, or `pause`, the ask `nemia pause --now` wrote for the task it stopped — and,
 * for a person's, what they said with it.
 *
 * `stopFirst` on a person's try of a step whose task has not settled (`retriesDue`): the pass asks the engine to stop that session — once,
 * as the engine's `stopRequested` says — and files nothing. A later pass, once the task has settled, reads the try due as one of a stopped
 * step, and files it. `runsOn` beside it when the session, blocked when the try was asked for, is not blocked now: it has worked again
 * since.
 */
export type Retry = {
  step: string;
  try: number;
  mode: RetryMode;
  model?: string;
  message?: string;
  budget?: number;
  /** The try's `budget` raises a cap the step's tries had already cost, or been ended at (`Raise`): what its brief says. */
  pastCap?: true;
  by: 'retries' | 'signoff' | 'ask' | 'pause';
  stopFirst?: true;
  runsOn?: true;
  /**
   * The endings that stopped on the base branch this try sends the work back from (`endingStopped`): filed, it moves each one's try behind
   * (`sentBack`).
   */
  back?: string[];
};

/**
 * Why a message cannot ride on this ask, in words that say what to do instead — or null. Pure, and asked before anything about the
 * run: an empty message, which would put an empty answer in the brief; and a message on `--recheck`, which files no session to read it.
 * A message on a step that did not sign off blocked is not refused: a person may have something to say to a step whose check refused.
 */
export function messageRefusal(how: RetryHow, command = 'nemia retry <runId> <step>'): string | null {
  if (how.message === undefined) return null;
  if (how.mode === 'recheck') {
    return `--message carries your answer into the try's brief, and --recheck files no session to read it — it runs the check again, and nothing else. Recheck without a message (${command} --recheck), or give the answer to a session: ${command} --message "<answer>".`;
  }
  if (!how.message.trim())
    return `--message is empty, and an empty answer tells the step nothing. Say what the step needs to hear — ${command} --message "<answer>" — or leave --message out.`;
  return null;
}

/** Whether a try moved behind starts the step's count of tries afresh: a round, a merge, an ending sent back. */
const anew = (t: EarlierTry): boolean => t.then === 'round' || t.then === 'merge' || t.then === 'back';

/**
 * The tries `retries:` has filed for a step in the round it is on. A person's do not count: `retries` is what the run may spend on its
 * own word. Nor do an earlier round's: a round is new work for the step, and its check may refuse it afresh — and so is a merge.
 */
export const retriesSpent = (record: StepRecord | undefined): number => {
  let spent = 0;
  for (const t of record?.tries ?? []) spent = anew(t) ? 0 : spent + (t.then === 'retries' ? 1 : 0);
  return spent;
};

/**
 * The sign-off nudges the run has filed for a step in the round it is on: at most one (`retriesDue`). Counted as `retriesSpent` counts,
 * from the step's record — so a restart, a person's try in between, or a second tick never files another — and new at each round.
 */
export const signoffsSpent = (record: StepRecord | undefined): number => {
  let spent = 0;
  for (const t of record?.tries ?? []) spent = anew(t) ? 0 : spent + (t.then === 'signoff' ? 1 : 0);
  return spent;
};

/**
 * Whether the run nudges an `unsigned` step itself, once a round (`signoffsSpent`): its session ended without the closeout it was asked
 * for (`asked`, the engine's word), or its closeout named a file the run did not have (`lackedOf`). Not a closeout short of a declared
 * field alone, which a reminder would not mend.
 */
export const signoffDue = (record: StepRecord, asked: CloseoutAsked): boolean =>
  (asked === 'unsigned' || lackedOf(record).length > 0) && signoffsSpent(record) < 1;

/** How a try was asked for, as a person typed it: `--nudge`, `--fresh`, `--model <m>`, `--recheck`. */
export const modeWord = (how: { mode: RetryMode; model?: string }): string => (how.model ? `--model ${how.model}` : `--${how.mode}`);

/** The note that says a try, and on whose word: `retries:`, a nudge to sign off, or `nemia retry` and what it was typed with. */
export const tryWord = (r: Retry, step: Workflow): string =>
  `${r.step}: try ${r.try} — ${r.by === 'retries' ? `retries: ${step.retries}` : r.by === 'signoff' ? 'a nudge to sign off, once a round' : askedWord(r)}`;

/**
 * A try asked for, as `tryWord` says it: by `nemia pause --now`, which stopped its session or check, or by `nemia retry` as it was typed.
 */
const askedWord = (r: Retry): string =>
  r.by === 'pause'
    ? `${r.mode === 'recheck' ? 'rechecked' : 'continued'} after nemia pause --now`
    : `nemia retry ${modeWord(r)}${r.budget !== undefined ? ` --budget ${r.budget}` : ''}${r.message !== undefined ? ', with your answer' : ''}`;

/**
 * A step's record once a try is filed: the current try moved behind, with what replaced it, and the new one in
 * its place — the re-filed step's task, or for a recheck the same task, with its check still to file and what was read of its files
 * (`StepRecord.filesRead`) kept. Pure.
 */
export function nextTry(record: StepRecord, retry: Retry, taskId?: string): StepRecord {
  const { check, tries = [], handedOff: _, landed: __, filesRead, ...rest } = record;
  const over: EarlierTry = {
    taskId: record.taskId!,
    ...(check ? { check } : {}),
    then: retry.by === 'ask' || retry.by === 'pause' ? retry.mode : retry.by,
    ...(retry.by === 'pause' ? { paused: true as const } : {}),
    ...(retry.model ? { model: retry.model } : {}),
    ...(retry.budget !== undefined ? { budget: retry.budget } : {}),
  };
  const same = retry.mode === 'recheck';
  return { ...rest, ...(same && filesRead ? { filesRead } : {}), taskId: same ? record.taskId : taskId!, tries: [...tries, over] };
}

/**
 * The model a step's current try runs on: the one a `nemia retry --model` named for the new session it started, carried by every try that
 * continued that session since — a nudge, a `retries:` nudge, a sign-off nudge, a round — and the step's own where none did. A recheck is
 * the same try. What a continuation is filed with, since a model is part of the prompt the session cached: a nudge after `--model sonnet`
 * on the step's `opus` would rebuild it. Only a fresh try — `--fresh`, or `--model` — starts a session on another.
 */
export function sessionModel(step: Workflow, record: StepRecord | undefined): string | undefined {
  for (const t of [...(record?.tries ?? [])].reverse()) {
    if (t.then === 'recheck') continue;
    if (t.then === 'fresh') return t.model ?? step.model;
  }
  return step.model;
}

/**
 * How many of a step's tries answered the task it is on (`e.answer`), each a turn of that one task rather than a task of its own: the tries
 * behind it on the same task that were not a recheck, which replaces only the check. Zero for a step on a task of its own. Pure: counted
 * off the record, as the turns the runtime has journalled are counted off its view (`answersIn`), so a turn a pass gave and died before
 * writing down is found (`adoptTries`).
 */
export const turnsOf = (record: StepRecord | undefined): number =>
  (record?.tries ?? []).filter((t) => t.taskId === record?.taskId && t.then !== 'recheck').length;

/** The asks a record already answers — each names a try its step has reached. The tick consumes these. */
export const spentAsks = (run: Run, asks: readonly RetryAsk[]): RetryAsk[] => asks.filter((a) => a.try <= tryOf(run, a.step));

/**
 * A try due now, as `nemia ls` and `nemia decide` say it — and, for a step whose session the tick stops first, that it does:
 * `its blocked session` while its harness says so, and `its session` once it works again (`runsOn`).
 */
export const dueNote = (step: Workflow, run: Run, r: Retry): string => {
  if (r.by === 'ask') return askedNote(r);
  if (r.by === 'signoff')
    return `try ${r.try} due — a nudge to sign off, once a round: ${lackedOf(run.steps[step.name]).length ? 'its closeout named a file the run does not have' : 'its session ended without its closeout'}`;
  if (r.by === 'pause') return pausedNote(r);
  return `try ${r.try} due — retries: ${step.retries ?? 0}, ${retriesSpent(run.steps[step.name])} spent`;
};

/** A try a person asked for, as `dueNote` says it: its mode, budget and answer, and whether its session is stopped first. */
const askedNote = (r: Retry): string => {
  const budget = r.budget !== undefined ? `, --budget ${r.budget}` : '';
  const answer = r.message !== undefined ? ', with your answer' : '';
  const next = r.stopFirst ? `stopping its ${r.runsOn ? '' : 'blocked '}session, then the tick files it` : 'the next tick files it';
  return `try ${r.try} asked (${modeWord(r)}${budget}${answer}) — ${next}`;
};

/** A try `nemia pause --now` asked for, as `dueNote` says it once its task is stopped: the session continued, or the check run again. */
const pausedNote = (r: Retry): string =>
  r.mode === 'recheck'
    ? `try ${r.try} due — its check was stopped by nemia pause --now, and the next tick runs it again`
    : `try ${r.try} due — its session was stopped by nemia pause --now, and the next tick continues it`;

/**
 * The ask a step's current try answers: a person's ask for exactly that try, with a message, honoured the way it asked — the try
 * before it replaced by that mode, on that model. Pure. Read off the ask files, waiting and consumed (`readAnswers` in record.store.ts),
 * because the record keeps no message: the run's json stays the tick's, and what a person said stays in their own file.
 */
export function answerOf(run: Run, step: string, answers: readonly RetryAsk[]): RetryAsk | undefined {
  const last = run.steps[step]?.tries?.at(-1);
  if (!last) return undefined;
  const n = tryOf(run, step);
  return answers.find((a) => a.step === step && a.try === n && a.message !== undefined && a.mode === last.then && a.model === last.model);
}
