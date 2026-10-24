/**
 * A loop's rounds: those due now (`roundsDue`) and the steps once one is filed (`roundFiled`), what `nemia round` and `nemia accept` ask
 * and refuse (`roundAsk`, `acceptAsk`), and what `nemia ls` and `nemia decide` say of a loop (`roundDueNote`, `roundLines`). Pure.
 */
import { filedOn } from '../pinned/pinned.ts';
import { DEFAULT_ROUNDS, type Workflow } from '../step/step.ts';
import {
  andList,
  prunedWords,
  satisfiesAfter,
  stopsFollowers,
  tryOf,
  type Acceptance,
  type CloseoutAsked,
  type Hold,
  type Pruned,
  type Run,
  type StepStatus,
  type TaskPhase,
} from '../record/record.ts';
import type { Closeout } from '../closeout/index.ts';
import {
  acceptanceOf,
  askedAgain,
  capOf,
  endingStopped,
  loopOver,
  ownStatus,
  roundOf,
  roundWord,
  sendBackTo,
  sentBack,
  spentWord,
  standing,
  waitsAtGate,
  type Round,
  type RoundAsk,
  type Spend,
  type SpendOf,
  budgetWord,
  dollars,
} from '../status/status.ts';
import { loopSpan } from '../workflow/index.ts';
import type { EarlierTry, TryCause } from '../retry/index.ts';
import { heldRefusal, prunedRefusal } from '../prune/prune.ts';
import { holdWord } from '../wait/wait.ts';
import type { Decision, Offer } from '../decide/decide.ts';
import { mergeDue, mergeDueNote, mergeNote, mergeSpent, mergeWaits } from '../merge/merge.ts';
import type { LandingSaid } from '../check/check.ts';

/**
 * The rounds due now. Pure, and blind to cancellation on purpose, as `retriesDue` is: `assess` answers for a cancelled run, and `advance`
 * looks for a round a pass filed and never wrote down whatever became of the run after.
 *
 * A looping step verified — or unverified, with no check — whose closeout says `again: true`: below its cap, since at the cap `stepStatus`
 * says `exhausted`, and the run files the next round on the step's word. A loop that is `exhausted`: only a person's ask for the next
 * round, which names it, so it is honoured once. `again: false`, blocked, unsigned, a check that did not pass: nothing is due. A loop with
 * no round due goes again on a person's `nemia merge` (`mergeDue`), on the round it is on.
 *
 * A loop with a step over its budget goes round on nobody's word but a person's raising the cap: its looping step reads `over budget`, so
 * `again` files nothing, and a person's ask — at the cap, or below it — is due only with a `--budget` above what each of those steps has
 * cost.
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a loop whose step is over its budget.
 */
export function roundsDue(
  steps: readonly Workflow[],
  run: Run,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  asks: readonly RoundAsk[] = [],
  spendOf: SpendOf = () => undefined,
): Round[] {
  const due: Round[] = [];
  for (const step of steps) {
    if (!step.loop) continue;
    const { status, own } = standing(step, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
    const round = roundOf(run, step.name) + 1;
    const again = satisfiesAfter(status) && askedAgain(step, run, closeoutOf);
    if (again) {
      due.push({ step: step.name, target: step.loop, round, by: 'again' });
      continue;
    }
    const sent =
      askedRound(steps, step, run, { status, own, round }, closeoutOf, asks, spendOf) ??
      mergeDue(steps, run, step, status, asks, (f) => endingStopped(f, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf));
    if (sent) due.push(sent);
  }
  return due;
}

/**
 * The round a person asked for, due: the next round of an `exhausted` loop, or of one held over its budget with `again` said, at an ask
 * whose `--budget` is above what each step over its budget has cost — or undefined.
 *
 * @param at The looping step's status, its own, and the round it would go.
 */
function askedRound(
  steps: readonly Workflow[],
  step: Workflow,
  run: Run,
  at: { status: StepStatus; own: StepStatus; round: number },
  closeoutOf: (step: string) => Closeout | undefined,
  asks: readonly RoundAsk[],
  spendOf: SpendOf,
): Round | undefined {
  const over = loopOver(steps, step, run, spendOf);
  const above = Math.max(0, ...over.map((o) => o.spent.usd));
  const held = at.status === 'over budget' && satisfiesAfter(at.own) && askedAgain(step, run, closeoutOf);
  const ask =
    at.status === 'exhausted' || held
      ? asks.find((a) => a.step === step.name && a.round === at.round && (!over.length || (a.budget !== undefined && a.budget > above)))
      : undefined;
  if (!ask) return undefined;
  return {
    step: step.name,
    target: step.loop!,
    round: at.round,
    by: 'ask',
    ...(over.length ? { budget: ask.budget, raise: over.map((o) => o.name) } : {}),
  };
}

/**
 * The run's steps once a round is filed. Pure.
 *
 * Every step of the loop moves its try behind it, `cause: 'round'` — `cause: 'merge'` on a merge, which spends no round — and keeps its
 * workspace and branch, and each ending a merge sends the work back from moves its own behind (`sentBack`). The target's place is taken
 * by the task just filed, which continues its session. Every other step's is left unfiled, for `assess` to file once what it waits on is
 * verified — a new session, under its next try's id (`stepTaskId`). So the looping step's closeout that asked for the round is behind it,
 * and a pass that reads the record after this files no second round. A cap a person raised with the round is kept on each step it was
 * raised for, in force from its next try (`budgetOf`).
 *
 * The target's record keeps what its new try is filed on (`filedOn`): the revisions of its agent and its skills, and the digest of the
 * closeout schema it is given, as every other filing keeps them.
 */
export function roundFiled(steps: readonly Workflow[], run: Run, r: Round, taskId: string): Run['steps'] {
  const looping = steps.find((s) => s.name === r.step);
  const filed = filedOn(
    { run, reads: { steps } },
    steps.find((s) => s.name === r.target),
  );
  const next = { ...run.steps };
  const cause: TryCause = r.by === 'merge' ? 'merge' : 'round';
  for (const name of looping ? loopSpan(steps, looping) : []) {
    const { check, tries = [], handedOff: _, landed: __, filesRead: ___, ...rest } = run.steps[name] ?? { taskId: null };
    const raised = r.budget !== undefined && r.raise?.includes(name) ? { budget: r.budget } : {};
    const over: EarlierTry[] = rest.taskId ? [{ taskId: rest.taskId, ...(check ? { check } : {}), cause, ...raised }] : [];
    next[name] = { ...rest, taskId: name === r.target ? taskId : null, tries: [...tries, ...over] };
  }
  const refiled = { ...next, ...Object.fromEntries((r.back ?? []).filter((b) => next[b]).map((b) => [b, sentBack(next[b])])) };
  return { ...refiled, [r.target]: { ...refiled[r.target], ...filed } };
}

/** The pass's line for a round it filed: its round and on whose word, or the merge it files (`mergeNote`). */
export const roundFiledNote = (r: Round, looping: Workflow): string =>
  r.merge
    ? mergeNote(r)
    : `${r.step}: round ${r.round} — ${r.by === 'again' ? `again, rounds: ${capOf(looping)}` : `nemia round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}`}; ${r.target} goes again`;

/**
 * What a round filed tells its target of itself (`RoundBriefing`): its loop, its number, the loop's `rounds:`, on whose word, and what it
 * merges — with what the ending's check said of the merged tree, where a merge is asked on its refusal (`landing`).
 */
export const roundBriefed = (r: Round, looping: Workflow, landing?: LandingSaid) => ({
  loop: r.step,
  round: r.round,
  rounds: capOf(looping),
  by: r.by,
  ...(r.merge ? { merge: { onto: r.merge.onto, sha: r.merge.sha, ...(landing ? { landing } : {}) } } : {}),
});

/** The round asks a record already answers — each names a round its loop has reached. The tick consumes these. */
export const spentRoundAsks = (run: Run, asks: readonly RoundAsk[]): RoundAsk[] =>
  asks.filter((a) => (a.merge ? mergeSpent(run, a) : a.round <= roundOf(run, a.step)));

/**
 * Why a `--budget` cannot ride on `nemia round <id>`, in words that say what to do instead — or null. Pure, and asked before anything about
 * the run, by `roundAsk` and by a caller that answers it apart: an amount that is not dollars above zero.
 */
export const roundBudgetRefusal = (id: string, budget?: number): string | null =>
  budget !== undefined && !(Number.isFinite(budget) && budget > 0)
    ? `--budget ${String(budget)} is not an amount. It is the most a step of the loop may cost together, in dollars, above what it has cost: nemia round ${id} [<step>] --budget <amount>, like 5 or 2.50.`
    : null;

/**
 * Why a round of `looping`'s loop waits on an ask already there: a round asked without the budget its loop over budget needs, a round
 * the next tick files anyway, or a merge it would drop (`mergeWaits`). `over` is what each step of the loop over its budget has cost
 * (`loopOver`). Undefined when none is.
 */
function roundWaits(run: Run, looping: Workflow, asks: readonly RoundAsk[], over: ReturnType<typeof loopOver>): string | undefined {
  const now = roundOf(run, looping.name);
  const above = Math.max(0, ...over.map((o) => o.spent.usd));
  const pending = asks.find((a) => a.step === looping.name && a.round === now + 1);
  if (pending && over.length && !(pending.budget !== undefined && pending.budget > above))
    return `round ${now + 1} of ${looping.name}'s loop is asked for (at ${pending.at}) without a --budget above ${dollars(above)}, and ${overWords(over)}, so no tick honours it. Delete that ask — round-${looping.name}-${now + 1}, in the run's .asks directory — and ask again: nemia round ${run.id} ${looping.name} --budget <amount>.`;
  if (pending)
    return `round ${now + 1} of ${looping.name}'s loop is already asked for (at ${pending.at}), and the next tick honours it once. Wait for it: nemia ls ${run.id}.`;
  return mergeWaits(
    run,
    looping,
    asks,
    'a round asked now would be filed over it, and the merge dropped',
    `nemia round ${run.id} ${looping.name}`,
  );
}

/**
 * What `nemia round` asks for — the looping step and the round — or why it will not, in words that say what to do instead. Pure.
 *
 * `name` may be left out when the workflow has one loop. Only a loop whose rounds are spent with `again` still true — `exhausted` — may go
 * round once more on a person's word. Refused: a cancelled run, which files nothing; a step that is not here or has no `loop:`, a workflow
 * with no loop, or several and none named; a round already asked for; a step of the loop that stopped in this round, which `nemia retry` is
 * for; a round the run files itself; a loop that ended without asking again; and a round still running.
 *
 * A round of a loop whose step is over its budget is a person's to ask for, at the cap or below it, and only with `budget` — `--budget`
 * above what each such step has cost — which is refused by name when it is not, and refused on a loop with no step over its budget.
 *
 * A loop a person ended themselves (`nemia accept`) reads `verified` again: while nothing waiting on it is filed, the way back into the
 * loop is to take the acceptance back; once something is, a round is refused, since it would file the loop's work again under a step that
 * ran on it and take none of that back. A step of the loop that stopped in the round, on its own status whatever its budget, is a try's to
 * take on; one over budget only because a round would file it again has not stopped. A step of the loop at its gate is moved by a
 * person's word, not a round. A loop that is over, with an ending held at its gate before it is filed (`waitsAtGate`) waiting on it, is
 * offered that approval and the send-back of the work (`sendBackTo`); with an ending that stopped on the base branch (`endingStopped`),
 * the send-back of the looping step, whose `again: true` is the round, or the ending's ship again.
 *
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a loop whose step is over its budget.
 * @param budget The cap `nemia round --budget` raises the loop's steps over their budget to.
 */
export function roundAsk(
  steps: readonly Workflow[],
  run: Run,
  name: string | undefined,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  asks: readonly RoundAsk[] = [],
  spendOf: SpendOf = () => undefined,
  budget?: number,
): { step: string; round: number; budget?: number } | { refusal: string } {
  const no = (refusal: string) => ({ refusal });
  const notAmount = roundBudgetRefusal(run.id, budget);
  if (notAmount) return no(notAmount);
  if (run.cancelledAt) {
    return no(
      `${run.id} was cancelled at ${run.cancelledAt}, and a cancelled run files nothing, so a round would never be honoured. Start a new run for the work with nemia start.`,
    );
  }
  const pruned = prunedRefusal(run, 'a round');
  if (pruned) return no(pruned);
  const holding = heldRefusal(run, 'a round');
  if (holding) return no(holding);
  const loops = steps.filter((s) => s.loop);
  const named = name === undefined ? undefined : steps.find((s) => s.name === name);
  if (name !== undefined && (!named || !run.steps[name]))
    return no(`${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`);
  if (named && !named.loop) {
    return no(
      `${name} has no \`loop:\`, so there is no round of it to run${loops.length ? ` — this run's loops close at ${loops.map((s) => s.name).join(', ')}` : ''}. To try ${name} again: nemia retry ${run.id} ${name}.`,
    );
  }
  if (!named && loops.length !== 1) {
    return no(
      loops.length
        ? `${run.id} has ${loops.length} loops, closing at ${loops.map((s) => s.name).join(', ')}: name the one to go round again — nemia round ${run.id} <step>.`
        : `no step of ${run.id} has \`loop:\`, so there is no round to run. To try a step again: nemia retry ${run.id} <step>.`,
    );
  }
  const looping = named ?? loops[0];
  const now = roundOf(run, looping.name);
  const accepted = acceptanceOf(run, looping.name);
  const filed = steps.filter((s) => s.after.includes(looping.name)).find((s) => run.steps[s.name]?.taskId);
  if (accepted && !filed) {
    return no(
      `${looping.name} asked for round ${now + 1}, and a person accepted its work as it stands at ${accepted.at}, with its findings open (nemia accept): its loop is over on their word. ` +
        `Nothing waiting on it has been filed yet, so to go round once more after all, take that acceptance back first — accept-${looping.name}-${tryOf(run, looping.name)}, in the run's .asks directory — then ask again: nemia round ${run.id} ${looping.name}.`,
    );
  }
  const over = loopOver(steps, looping, run, spendOf);
  const above = Math.max(0, ...over.map((o) => o.spent.usd));
  const waits = roundWaits(run, looping, asks, over);
  if (waits) return no(waits);

  const step = (n: string) => steps.find((s) => s.name === n)!;
  const at = (n: string) => standing(step(n), run, phaseOf, closeoutOf, askedCloseout, steps, spendOf);
  const stuck = loopSpan(steps, looping).find((n) => at(n).own !== 'exhausted' && stopsFollowers(at(n).own));
  if (stuck) {
    return no(
      `${stuck} is ${at(stuck).status} in round ${now} of ${looping.name}'s loop, so the round cannot end, and there is no round to go again. Try ${stuck} again: nemia retry ${run.id} ${stuck} — or see why: nemia decide ${run.id}.`,
    );
  }
  const gate = loopSpan(steps, looping).find((n) => at(n).status === 'awaiting approval');
  if (gate) {
    const handedOn =
      gate === looping.name
        ? `${gate} signed off without asking for another round (\`again: false\`), and waits at its gate`
        : `${gate} waits at its gate in round ${now} of ${looping.name}'s loop`;
    return no(
      `${handedOn}: a person's word moves it, not a round. Approve it — nemia approve ${run.id} ${gate} — or send it back: nemia retry ${run.id} ${gate} --message "<objection>".`,
    );
  }
  const { status, own } = at(looping.name);
  if (status === 'exhausted' || (status === 'over budget' && satisfiesAfter(own))) {
    if (filed) {
      return no(
        `${filed.name} waits on ${looping.name} and has already been filed (${ownStatus(filed, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)}), so a round would file ${looping.loop} again under a step that ran on its work, and take none of that back. ` +
          `What ended this loop was a person accepting the work as it stands (nemia accept); deleting that acceptance does not delete ${filed.name}. See where the run stands, and what there is to do: nemia decide ${run.id}.`,
      );
    }
    if (over.length && budget === undefined) {
      return no(
        `${looping.name} asked for round ${now + 1}, and ${overWords(over)}: the run files nothing more for ${over.length > 1 ? 'them' : 'it'} until a person raises the cap. Raise it with the round, above ${dollars(above)}: nemia round ${run.id} ${looping.name} --budget <amount>.`,
      );
    }
    if (over.length && budget! <= above) {
      return no(
        `--budget ${budget} is not above ${dollars(above)}, what ${over.map((o) => o.name).join(' and ')} ${over.length > 1 ? 'have' : 'has'} cost: the round would be held again as soon as it was asked for. Give more than ${dollars(above)}: nemia round ${run.id} ${looping.name} --budget <amount>.`,
      );
    }
    if (!over.length && budget !== undefined) {
      return no(
        `--budget raises the cap of a step of the loop over its budget, and no step of ${looping.name}'s loop is. Once more without it: nemia round ${run.id} ${looping.name}.`,
      );
    }
    return { step: looping.name, round: now + 1, ...(over.length ? { budget } : {}) };
  }
  if (budget !== undefined) {
    return no(
      `--budget raises the cap of a loop whose round waits on its budget, and ${looping.name}'s does not: ${roundsDue(steps, run, phaseOf, closeoutOf, askedCloseout, [], spendOf).some((r) => r.step === looping.name) ? 'the run goes round again itself' : satisfiesAfter(status) ? 'it signed off without asking for another round' : `round ${now} is still running`}. See it: nemia ls ${run.id}.`,
    );
  }
  if (roundsDue(steps, run, phaseOf, closeoutOf, askedCloseout, [], spendOf).some((r) => r.step === looping.name)) {
    return no(
      `the run goes round again itself: ${looping.name} asked for another round, and \`rounds: ${capOf(looping)}\` has ${capOf(looping) - now} left, so the next tick files round ${now + 1}. Wait for it: nemia ls ${run.id}.`,
    );
  }
  if (satisfiesAfter(status)) {
    const ended = accepted
      ? `${looping.name} asked for round ${now + 1}, and a person accepted its work as it stands at ${accepted.at}, with its findings open (nemia accept)`
      : `${looping.name} signed off without asking for another round (\`again: false\`)`;
    const overNow = `${ended}, so its loop is over${accepted ? ' on their word' : ''}`;
    const ending = steps.find(
      (s) => s.after.includes(looping.name) && waitsAtGate(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf, () => undefined),
    );
    if (ending) {
      const back = sendBackTo(ending, run)
        .map((n) => `nemia retry ${run.id} ${n} --message "<objection>"`)
        .join(' or ');
      return no(
        `${overNow}${filed ? '' : ' — and nothing waiting on it has been filed'}: the run is at ${ending.name}'s gate, ` +
          `where nothing of ${ending.name} has run and your approval is what files it. Approve it: nemia approve ${run.id} ${ending.name}${back ? ` — or send the work back: ${back}` : ''}.`,
      );
    }
    const stopped = steps.find(
      (s) => s.after.includes(looping.name) && endingStopped(s, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf),
    );
    if (stopped) {
      return no(
        `${ended}, and ${stopped.name} stopped on the base branch (${ownStatus(stopped, run, phaseOf, closeoutOf, askedCloseout, steps, spendOf)}) without doing what it was approved for: ` +
          `a round would file the work again with nothing said of why. Send it back, with what to change — ${looping.name} is filed again with your objection and what ${stopped.name} said, and its \`again: true\` is the round: ` +
          `nemia retry ${run.id} ${looping.name} --message "<objection>". Or ship again, for what was not the work — a dirty checkout, a flaky test: nemia retry ${run.id} ${stopped.name}.`,
      );
    }
    return no(`${overNow} and there is nothing to go round again. What waits on it has been filed: nemia ls ${run.id}.`);
  }
  return no(
    `round ${now} of ${looping.name}'s loop is still running, so there is nothing to go round again until it ends. Wait for it: nemia ls ${run.id} (or stop the run: nemia cancel ${run.id}).`,
  );
}

/**
 * Why the words given with an acceptance cannot ride on it — or null. Pure, and asked before anything about the run: words that are missing
 * or empty.
 */
export const acceptWordsRefusal = (message: string | undefined, command: string): string | null =>
  message === undefined
    ? `--message says why the work is good enough with its findings open, and is what the steps after the loop are handed — the shipper, and whoever reads the merge, have nothing else. Say it: ${command} --message "<why>".`
    : !message.trim()
      ? `--message is empty, and an acceptance's words are the whole reason the loop ended with findings open: empty, they tell the steps after it nothing. Say why the work is good enough as it stands — ${command} --message "<why>".`
      : null;

/**
 * Why an acceptance of `looping`'s work waits on an ask already there: a round about to be filed, or a merge that sends the work back
 * (`mergeWaits`). Undefined when neither is.
 */
function acceptWaits(run: Run, looping: Workflow, asks: readonly RoundAsk[]): string | undefined {
  const now = roundOf(run, looping.name);
  const pending = asks.find((a) => a.step === looping.name && a.round === now + 1);
  if (pending) {
    return (
      `round ${now + 1} of ${looping.name}'s loop is already asked for (at ${pending.at}), and the next tick files it: accepting now would end a loop that is about to go round again. ` +
      `To take the work as it stands instead, take that ask back first — round-${looping.name}-${now + 1}, in the run's .asks directory — then accept it: nemia accept ${run.id} ${looping.name} --message "<why>".`
    );
  }
  return mergeWaits(
    run,
    looping,
    asks,
    'accepting now would end a loop whose work the merge sends back, and the merge would move the accepted try behind',
    `nemia accept ${run.id} ${looping.name} --message "<why>"`,
  );
}

/**
 * What `nemia accept` accepts — the looping step and the try — or why it will not, in words that say what to do instead. Pure.
 *
 * `name` may be left out when the workflow has one loop. Only a loop out of rounds with `again` still true — `exhausted`, where the one
 * thing `nemia decide` could offer was another paid round — may be ended on a person's word: what waits on the looping step is then filed
 * as if it had said `again: false`, and its findings stay on the record and travel on the next step's brief (`acceptedSection`).
 *
 * Refused: words that are missing or empty; a cancelled run, which files nothing; a step that is not here or has no `loop:`, a workflow
 * with no loop, or several and none named; a try already accepted; a round already asked for, which the next tick files; a round the run
 * files itself, below the cap, and one held on a step's budget below the cap — each named with the `nemia round` that is the way on; a loop
 * that ended `again: false`, which handed on by itself; and a round still running.
 *
 * @param asks What people asked for with `nemia round`, and the run has not consumed yet: a round already asked for.
 * @param spendOf What each task's sessions cost (`taskSpend`): what holds a loop whose step is over its budget.
 */
export function acceptAsk(
  steps: readonly Workflow[],
  run: Run,
  name: string | undefined,
  message: string | undefined,
  phaseOf: (taskId: string) => TaskPhase,
  closeoutOf: (step: string) => Closeout | undefined = () => undefined,
  askedCloseout: (taskId: string) => CloseoutAsked = () => false,
  asks: readonly RoundAsk[] = [],
  spendOf: SpendOf = () => undefined,
): { step: string; try: number } | { refusal: string } {
  const no = (refusal: string) => ({ refusal });
  const words = acceptWordsRefusal(message, `nemia accept ${run.id}${name === undefined ? ' [<step>]' : ` ${name}`}`);
  if (words) return no(words);
  if (run.cancelledAt) {
    return no(
      `${run.id} was cancelled at ${run.cancelledAt}, and a cancelled run files nothing, so an acceptance would never be honoured: nothing after the loop can be filed for it to reach. Start a new run for the work with nemia start.`,
    );
  }
  const pruned = prunedRefusal(run, 'an acceptance');
  if (pruned) return no(pruned);
  const holding = heldRefusal(run, 'an acceptance');
  if (holding) return no(holding);
  const loops = steps.filter((s) => s.loop);
  const named = name === undefined ? undefined : steps.find((s) => s.name === name);
  if (name !== undefined && (!named || !run.steps[name]))
    return no(`${run.id} has no step "${name}" — its steps are ${steps.map((s) => s.name).join(', ')}.`);
  if (named && !named.loop) {
    return no(
      `${name} has no \`loop:\`, so it closes no loop and there are no findings to accept${loops.length ? ` — this run's loops close at ${loops.map((s) => s.name).join(', ')}` : ''}. To approve a step at its gate: nemia approve ${run.id} ${name}.`,
    );
  }
  if (!named && loops.length !== 1) {
    return no(
      loops.length
        ? `${run.id} has ${loops.length} loops, closing at ${loops.map((s) => s.name).join(', ')}: name the one to accept as it stands — nemia accept ${run.id} <step> --message "<why>".`
        : `no step of ${run.id} has \`loop:\`, so there is no loop to end. To approve a step at its gate: nemia approve ${run.id} <step>.`,
    );
  }
  const looping = named ?? loops[0];
  const now = roundOf(run, looping.name);
  const n = tryOf(run, looping.name);
  const given = acceptanceOf(run, looping.name);
  if (given) {
    return no(
      `try ${n} of ${looping.name} is already accepted, at ${given.at}: its loop is over on your word, and what waits on it is filed on the next tick, once. See where the run stands: nemia ls ${run.id}.`,
    );
  }
  const waits = acceptWaits(run, looping, asks);
  if (waits) return no(waits);
  const at = (n: string) =>
    standing(
      steps.find((s) => s.name === n)!,
      run,
      phaseOf,
      closeoutOf,
      askedCloseout,
      steps,
      spendOf,
    );
  const { status, own } = at(looping.name);
  if (status === 'exhausted') return { step: looping.name, try: n };

  const left = capOf(looping) - now;
  if (status === 'over budget' && satisfiesAfter(own)) {
    return no(
      `${looping.name} asked for round ${now + 1}, and its loop waits on a budget, not on you: \`rounds: ${capOf(looping)}\` ${left === 1 ? 'has one round' : `has ${left} rounds`} left. ` +
        `Raise the cap and go round — nemia round ${run.id} ${looping.name} --budget <amount> — and accept the work as it stands once its rounds are spent.`,
    );
  }
  if (roundsDue(steps, run, phaseOf, closeoutOf, askedCloseout, [], spendOf).some((r) => r.step === looping.name)) {
    return no(
      `${looping.name} asked for another round, and \`rounds: ${capOf(looping)}\` ${left === 1 ? 'has one' : `has ${left}`} left, so the next tick files round ${now + 1} itself: there is nothing for you to end yet. ` +
        `Accept the work as it stands once its rounds are spent and it asks again — nemia decide ${run.id} offers it there.`,
    );
  }
  if (satisfiesAfter(status)) {
    return no(
      `${looping.name} signed off without asking for another round (\`again: false\`), so its loop is over on its own word and there is nothing left open to accept. What waits on it has been filed: nemia ls ${run.id}.`,
    );
  }
  return no(
    `round ${now} of ${looping.name}'s loop is still running (${looping.name} is ${status}), so it has not asked for anything yet and there is nothing to accept. Wait for it: nemia ls ${run.id} (or stop the run: nemia cancel ${run.id}).`,
  );
}

/**
 * A loop a person ended as it stands, beside its looping step's line: the round it was on, that it asked again, and when they said enough.
 */
export const acceptedNote = (step: Workflow, run: Run, a: Acceptance): string =>
  `${roundWord(roundOf(run, step.name), capOf(step))}, and it asked again — accepted as it stands at ${a.at}, its findings open`;

/** A round due now, as `nemia ls` and `nemia decide` say it. */
export function roundDueNote(steps: readonly Workflow[], r: Round): string {
  const looping = steps.find((s) => s.name === r.step);
  if (r.by === 'merge') return mergeDueNote(r);
  return r.by === 'ask'
    ? `round ${r.round} asked (nemia round${r.budget !== undefined ? ` --budget ${r.budget}` : ''}) — the next tick files ${r.target}`
    : `round ${r.round} of ${looping ? capOf(looping) : DEFAULT_ROUNDS} due — ${r.step} asked again, and the next tick files ${r.target}`;
}

/**
 * A loop out of rounds, beside its looping step's line: where it stands, and the command that takes it once more — with `--budget`, past a
 * step's. On a pruned run, where it stands and why there is no more: `nemia round` is refused there (`prunedRefusal`), and a note never
 * offers a refused verb.
 */
export const exhaustedNote = (step: Workflow, run: Run, raise = false): string =>
  `${roundWord(roundOf(run, step.name), capOf(step))}, and it asked again — ${run.pruned ? noMoreRounds(run.pruned) : run.hold ? heldLater(run.hold, 'once more') : `once more: nemia round ${run.id} ${step.name}${raise ? ' --budget <amount>' : ''}`}`;

/**
 * A loop whose round waits on a step's budget, beside its looping step's line: where it stands, and the command that raises the cap for the
 * round — or, pruned, why there is none.
 */
export const heldNote = (step: Workflow, run: Run): string =>
  `${roundWord(roundOf(run, step.name), capOf(step))}, and it asked again, past a budget — ${run.pruned ? noMoreRounds(run.pruned) : run.hold ? heldLater(run.hold, 'once more') : `once more: nemia round ${run.id} ${step.name} --budget <amount>`}`;

const noMoreRounds = (pruned: Pruned): string => `no round more, since the run was ${prunedWords(pruned)}`;

/**
 * Where a verb would be offered on a held run, what is said instead, with what the person who put the hold said of it: `held until a-1x2y
 * ships (why: merge conflicts; by operator); its approval is asked once the hold lifts`. Every verb that would release work is refused
 * while the hold stands (`heldRefusal`), and a note never offers a refused verb.
 */
export const heldLater = (hold: Hold, what: string): string =>
  `${holdWord(
    hold.until.map((run) => ({ run })),
    hold,
  )}; ${what} is asked once the hold lifts`;

/** The steps of a loop over their budget, in words: `implement has cost $4.20 of its $3 budget`. */
const overWords = (over: ReadonlyArray<{ name: string; spent: Spend; cap: number }>): string =>
  over.map((o) => `${o.name} has cost ${spentWord(o.spent)} of its ${budgetWord(o.cap)} budget`).join(', and ');

/**
 * What `nemia decide` offers for each loop out of rounds, and each whose round waits on a step's budget: the `nemia round` that takes it
 * once more, with `--budget` where a step of it is over its budget, and what that files. Pure. `spendOf` as `stepStatus` takes it.
 *
 * None on a pruned run (`prunedRefusal`), nor on a held one (`heldRefusal`). A loop over budget and not held for it, its own try stopped,
 * is `retryLines`' to offer. `nemia accept` is offered only out of rounds: below the cap the run goes round itself, and on a round held for
 * a budget raising it is the way on (`acceptAsk`). Each offer is its sentence and the bare command it ends on (`Offer`), the sentence
 * written around the command.
 */
export function roundOffers(steps: readonly Workflow[], run: Run, d: Decision, spendOf: SpendOf = () => undefined): Offer[] {
  if (d.kind !== 'awaiting' || run.pruned || run.hold) return [];
  return steps
    .filter((s) => s.loop && (d.exhausted.includes(s.name) || d.overBudget.includes(s.name)))
    .flatMap((looping) => {
      const name = looping.name;
      const over = loopOver(steps, looping, run, spendOf);
      const exhausted = d.exhausted.includes(name);
      if (!exhausted && !over.length) return [];
      const raise = over.length ? `, and ${overWords(over)}` : '';
      const once = over.length ? `, its cap raised above ${dollars(Math.max(...over.map((o) => o.spent.usd)))}` : '';
      const why = exhausted ? `\`rounds: ${capOf(looping)}\` are spent${raise}` : overWords(over);
      const round = `nemia round ${run.id} ${name}${over.length ? ' --budget <amount>' : ''}`;
      const offer = (command: string, before: string): Offer => ({ step: name, command, said: `${name}: ${before}:  ${command}` });
      const again = offer(
        round,
        `it asked for round ${roundOf(run, name) + 1}, and ${why}. Its findings are below. Once more${once} — ${looping.loop} continued, then a new ${name}`,
      );
      if (!exhausted) return [again];
      const after = steps.filter((s) => s.after.includes(name)).map((s) => s.name);
      const then = after.length
        ? `${andList(after)} ${after.length > 1 ? 'are' : 'is'} filed and handed them with your words`
        : 'the run ends with them on the record';
      return [
        again,
        offer(
          `nemia accept ${run.id} ${name} --message "<why>"`,
          `enough — go on with what is there; its findings stay on the record, and ${then}`,
        ),
      ];
    });
}

/** What `nemia decide` offers for each loop out of rounds, as its lines: each offer's sentence (`roundOffers`). Pure. */
export const roundLines = (...args: Parameters<typeof roundOffers>): string[] => roundOffers(...args).map((o) => o.said);
