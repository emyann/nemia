/**
 * What a person asks of a run: call it off (`cancel`), try a step again (`retry`), approve a gate (`approve`), say something to a running
 * session (`say`), go round a loop once more (`round`), and end a loop as it stands (`accept`). Each refuses before anything is written, and
 * writes a person's own file — never the run's record, which the tick owns — or, for `say`, asks the runtime. A controller, reaching the
 * runtime through the client (`runtime-client.ts`); `cancel` adopts what a pass filed and never wrote down as the tick does (`tick.ts`).
 */
import fs from 'node:fs';
import type { Engine } from './runtime-client.ts';
import { acceptAsk, approvalRefusal, approvedFirst, cancelPlan, retryable, retryRefusal, roundAsk, sayRefusal, type Acceptance, type Approval, type CancelPlan, type RoundAsk, type Run, type Said } from './run.ts';
import { tryOf, type RetryAsk, type RetryHow } from './retry.ts';
import { acceptFile, acceptanceIn, approvalFile, approvalIn, askFile, askIn, lstatOf, markCancelled, readAsks, readRun, roundAskFile, roundAskIn, runFile, stepsOf, writeAsk } from './store.ts';
import { standingsOf } from './branches.ts';
import { closeoutAsked, closeoutReader, exitVerdicts, harnessBlocked, phaseOfView, spendReader, taskPhases } from './views.ts';
import { adoptChecks, adoptRounds, adoptTries } from './tick.ts';

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
