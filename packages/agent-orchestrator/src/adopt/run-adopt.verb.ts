/**
 * The filings a pass made and died before writing down, adopted onto the run's record in memory (`adoptChecks`, `adoptTries`,
 * `adoptRounds`, `unrecordedSteps`), and the one read every caller adopts through (`readAndAdopt`): the tick's pass, `nemia cancel`,
 * `nemia rm` and `nemia prune` read a run as the pass does and adopt what it filed, so each judges the same run. They write the record by
 * the tick's own judgement: only `advance` writes the json, and the verbs keep what is adopted in memory. A controller.
 */
import { Effect } from 'effect';
import { asked as engineAsked, type Engine } from '../runtime-client.ts';
import { checkTaskId, isRepositoryRun, stepTaskId, tryOf } from '../record/record.ts';
import { sentBack, stepStatus } from '../status/status.ts';
import { roundFiled, roundsDue } from '../round/round.ts';
import { nextTry, retriesDue, turnsOf } from '../retry/index.ts';
import { answersIn } from '../views/views.verb.ts';
import { assess } from '../tick/assess.ts';
import { tryFiled } from '../tick/file.verb.ts';
import { readRun, recordNamed, type RunRead, type RunReadHow } from '../tick/told.verb.ts';
import type { Run } from '../record/record.ts';

/**
 * Checks a pass filed and never wrote down, put back on the record in memory — `advance` is the one writer of the run's json, and writes
 * it; `cancel` only needs them in view — and the steps they were adopted for.
 *
 * A pass that dies between `e.file` and `rewriteRun` leaves a check on the engine's board that the record does not name. It is looked for
 * under the id the run derives, for every step whose check is due and unrecorded, and before anything asks what is in flight: a run
 * cancelled in that window files no more checks, so one adopted only at filing time would never be stopped, and its suite would run on to
 * the deadline. A task the engine holds no brief for was not filed, and is left for the pass to file.
 */
const adoptChecks = Effect.fnUntraced(function* (e: Engine, read: RunRead) {
  const { run, steps, views, phaseOf, signedOff: closeoutOf, asked, spendOf } = read;
  const adopted: string[] = [];
  for (const step of steps) {
    const record = run.steps[step.name];
    if (!record || record.check || stepStatus(step, run, phaseOf, closeoutOf, asked, steps, spendOf) !== 'checking') continue;
    const taskId = checkTaskId(run, step.name);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    run.steps[step.name] = { ...record, check: { taskId } };
    adopted.push(step.name);
  }
  return adopted;
});

/**
 * Tries a pass filed and never wrote down, put back on the record — in memory, as `adoptChecks` does, and before anything asks what is in
 * flight, for the same reason: a run cancelled in that window files no more tries, so a try filed in it would otherwise never be adopted,
 * nor stopped. A task the engine holds no brief for is left for the pass to file.
 *
 * Looked for only where a try is due (`retriesDue`, cancelled or not): an ask for the step's next try, or a refused check `retries:`
 * covers. A run waiting on a person with nothing asked costs no look.
 *
 * A continue a pass gave as an answer to the step's task held open, and died before writing down, shows as a task with more answers
 * than the record has turns (`answersIn`, `turnsOf`): the answered task reads running, so the ask reads as one to stop it first. It is
 * adopted as the turn it is, and nothing is stopped and nothing filed.
 *
 * Either way the try is recorded as filing it records it (`tryFiled`): on what the run's pins and frozen steps are now, never on what the
 * try behind it was filed on.
 */
const adoptTries = Effect.fnUntraced(function* (e: Engine, read: RunRead) {
  const { run, steps, views, phaseOf, signedOff: closeoutOf, asked, verdictOf, asks, spendOf } = read;
  const adopted: string[] = [];
  const pins = { run, reads: { steps } };
  for (const r of retriesDue(steps, run, phaseOf, closeoutOf, asked, verdictOf, asks, () => false, spendOf)) {
    const held = run.steps[r.step];
    const current = held?.taskId;
    const step = steps.find((s) => s.name === r.step);
    if (held && r.by === 'ask' && r.mode === 'continue' && current && answersIn(views.get(current)) > turnsOf(held)) {
      run.steps[r.step] = tryFiled(pins, step, held, r, current);
      adopted.push(r.step);
      continue;
    }
    const taskId = r.mode === 'recheck' ? checkTaskId(run, r.step, r.try) : stepTaskId(run, r.step, r.try);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    const record = recordNamed(run, r.step);
    run.steps[r.step] = r.mode === 'recheck' ? { ...nextTry(record, r), check: { taskId } } : tryFiled(pins, step, record, r, taskId);
    for (const b of r.back ?? []) run.steps[b] = sentBack(recordNamed(run, b));
    adopted.push(r.step);
  }
  return adopted;
});

/**
 * Rounds a pass filed and never wrote down, put back on the record — in memory, and before anything asks what is in flight, as `adoptTries`
 * does and for its reason.
 *
 * Looked for only where a round is due (`roundsDue`, cancelled or not), under the target's next try's id. A pass that filed the round and
 * died left the looping step's `again: true` on the record, so the round reads due again; finding its task filed, this moves the loop on as
 * the pass would have (`roundFiled`), and nothing is filed twice. A task the engine holds no brief for is left for the pass to file.
 */
const adoptRounds = Effect.fnUntraced(function* (e: Engine, read: RunRead) {
  const { run, steps, views, phaseOf, signedOff: closeoutOf, asked, roundAsks: asks, spendOf } = read;
  const adopted: string[] = [];
  for (const r of roundsDue(steps, run, phaseOf, closeoutOf, asked, asks, spendOf)) {
    const taskId = stepTaskId(run, r.target, tryOf(run, r.target) + 1);
    const view = yield* engineAsked('view', e.view(taskId));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    Object.assign(run.steps, roundFiled(steps, run, r, taskId));
    if (r.merge && isRepositoryRun(run)) run.baseRef = r.merge.sha;
    adopted.push(r.step);
  }
  return adopted;
});

/**
 * Steps a pass filed and never wrote down: each step `assess` calls ready — blind to a cancellation, as a pass that read the run before it
 * was called off calls it — whose task, under the id that pass files it by, the engine holds. Looked up as `adoptChecks` looks up a check,
 * and put in `views`; it answers with them and changes nothing on the run. `forget` adopts them in memory, so a step being filed is in
 * flight, and `advance` stops them on a cancelled run, whose record would otherwise hide them from every stop.
 */
export const unrecordedSteps = Effect.fnUntraced(function* (e: Engine, read: RunRead) {
  const { run, views } = read;
  const { cancelledAt: _, ...live } = run;
  const { ready } = assess({ ...read, run: live, sessionBlocked: () => false, standings: [], checkout: undefined });
  const found: Array<{ name: string; taskId: string }> = [];
  for (const name of ready) {
    const taskId = stepTaskId(run, name, tryOf(run, name));
    const view = views.get(taskId) ?? (yield* engineAsked('view', e.view(taskId)));
    if (!view.state.brief) continue;
    views.set(taskId, view);
    found.push({ name, taskId });
  }
  return found;
});

/** How `readAndAdopt` reads (`RunReadHow`), and whether it looks for the steps a pass filed and never recorded besides (`unrecorded`). */
export type AdoptHow = RunReadHow & { readonly unrecorded?: boolean };

/**
 * Read `run` as the pass reads it (`readRun`), then adopt what a pass before this one filed and never wrote down — its rounds, then its
 * tries, then its checks — each put on the record in memory under the task the engine holds. The one copy the pass, `nemia cancel`, `nemia
 * rm` and `nemia prune` read and adopt through. Answers with the read, the notes its asks' read said, and every step adopted.
 *
 * @param how With `unrecorded`, the steps a pass filed and never recorded (`unrecordedSteps`) are adopted too, each a look at the engine
 *   for every ready step: asked where they must be stopped or kept — `nemia rm`, `nemia prune`, and the pass of a cancelled run — and by
 *   no pass that will file them, which costs a ready step no look.
 */
export const readAndAdopt = Effect.fnUntraced(function* (e: Engine, run: Run, how: AdoptHow = {}) {
  const { read, askNotes } = yield* readRun(e, run, how);
  const rounds = yield* adoptRounds(e, read);
  const tries = yield* adoptTries(e, read);
  const checks = yield* adoptChecks(e, read);
  const unrecorded = how.unrecorded ? yield* unrecordedSteps(e, read) : [];
  for (const { name, taskId } of unrecorded) run.steps[name] = { ...run.steps[name], taskId };
  return { read, askNotes, adopted: [...rounds, ...tries, ...checks, ...unrecorded.map((u) => u.name)] };
});
