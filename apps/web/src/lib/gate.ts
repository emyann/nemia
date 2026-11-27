/**
 * What a gate asks of a person, in words, wherever the board shows one: the Factory's card, the gate's node and the step inspector. Pure.
 *
 * The facts are the api's, off the package: which step waits at its gate (`toDecide`, a step's `approve`), where a send-back goes
 * (`sendBackTo`, carried as `back`), the base branch (`onto`, `branch`), each step's tries, closeout and check, and the run's decision. The
 * sentences joining them are the board's, so a person reads what approving does without knowing the package: the CLI's `ls` prints the
 * command.
 */
import type { Collision, Collisions, Decidable } from './api/decision.ts';
import type { RunView } from './api/judged.ts';
import type { RunDetail, StepView } from './runView';
import { askedSaid, needsOf, type Need } from './asks.ts';
import { touchedSummary } from './decide.ts';
import { verdictWords } from './words.ts';

/** A try a person asked for, which the next tick files, as its step's status holds it. */
type StepAsked = NonNullable<StepView['asked']>;

type DetailStep = StepView;

/**
 * A gate a person answers from the board: the step waiting at it, which has signed off; and the steps a send-back goes to (`back`), the
 * step itself.
 */
export type GateAsk = { step: string; back: readonly string[]; onto: string | null };

/**
 * The gate the Factory's card answers, off the list alone: the gate the run's to-decide says, or the first step waiting at its gate
 * on you. Null on a run called off, on a run a person holds (the CLI's `hold`, whose approval the package refuses), and where no gate
 * waits. A list from an api without `back` reads the step alone as where a send-back goes.
 * @param run The run as the list shows it: its calling off, its hold, its steps, its gates on you and its to-decide.
 */
export function gateOfSummary(
  run: Pick<RunView, 'cancelledAt' | 'waitingOnYou' | 'steps' | 'toDecide'> & { holding?: RunView['holding'] },
) {
  if (run.cancelledAt !== null || run.holding != null) return null;
  const decide = run.toDecide;
  if (decide?.kind === 'approve') {
    return { step: decide.step, back: decide.back ?? [decide.step], onto: decide.onto ?? null };
  }
  const need = needsOf(run).find((one) => one.kind === 'approve');
  return need ? { step: need.step, back: [need.step], onto: null } : null;
}

/**
 * The same gate off a run's detail, for one step: the inspector's and the node's. Null unless the step waits at its gate on you, on a run
 * nobody called off. `back` is the step itself.
 * @param run The run's detail: its calling off, its gates on you, its base branch and its graph.
 * @param step The step asked about: its name, whether it holds at a gate, its spec and its task, if any.
 */
export function gateOfStep(
  run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'branch' | 'graph'>,
  step: Pick<DetailStep, 'name' | 'approve' | 'spec' | 'taskId'>,
) {
  if (run.cancelledAt !== null || !step.approve || !run.waitingOnYou.includes(step.name)) return null;
  return { step: step.name, back: [step.name], onto: run.branch };
}

/**
 * The card's words for a gate, in its one row: what approving does, and where a send-back goes.
 * `approve what review handed on, or send it back`. Long names cut it short on the card, which has it whole on hover beside the step's own
 * prose; the inspector says it all, whole.
 * @param gate The gate the card answers.
 */
export function gateCardLine(gate: GateAsk) {
  const approving = `approve what ${gate.step} handed on`;
  if (!gate.back.length) return `${approving}: it waits on no step to send back`;
  return `${approving}, or send it back`;
}

/**
 * The card's way to what a gate asks a person to approve, which a card has no room to show (it must fit its cell): the words, and the
 * step whose inspector opens on its Output tab, where its closeout is.
 * @param gate The gate: its step.
 */
export const readLink = (gate: Pick<GateAsk, 'step'>) => ({ words: 'Read what it handed on', step: gate.step });

/**
 * A gate's node, under its name, where one line fits: `approve review's hand-off`. It names the step as the CLI's `ls` does (`approve
 * review`), and the inspector says the rest.
 * @param gate The gate: its step.
 */
export const gateNodeLine = (gate: Pick<GateAsk, 'step'>) => `approve ${gate.step}'s hand-off`;

/**
 * The inspector's opening: which step waits, what approving does and what sending back does, each a sentence off the record.
 *
 * Approving a gate files the steps that wait on it (`next`), handed the words. Sending back asks a new try of the step it goes to with the
 * person's words, and the gate holds again once that try signs off.
 * @param gate The gate the inspector opens on.
 * @param next The steps that wait on the gate, filed once it is approved.
 */
export function gateBrief(gate: GateAsk, next: readonly string[]) {
  const waits = `${gate.step} has signed off and waits at its gate: nothing after it is filed until you approve what it handed on.`;
  const approving = `Approving files ${next.length ? next.join(', ') : 'nothing: no step waits on it'}${next.length ? `, handed ${gate.step}'s closeout and your words, if any` : ''}.`;
  const sendingBack = `Sending back asks ${gate.step} for a new try, told your words; it waits at its gate again once it signs off.`;
  return { waits, approving, sendingBack };
}

/**
 * What the card says once a person's word is taken, until the run is read again and moves: `approved — the next pass files ship`, or
 * `sent back to review — try 2 asked (--continue, with your answer) — the next tick files it`.
 * @param taken The word the person gave: an approval, or a send-back with the try it asked and the step it goes to.
 * @param gate The gate the word answered.
 */
export const takenLine = (
  taken: { approved: true } | { asked: StepAsked | { try: number; stopFirst: boolean }; to: string },
  gate: GateAsk,
) =>
  'approved' in taken
    ? `approved — the next pass files what waits on ${gate.step}`
    : `sent back to ${taken.to} — ${askedSaid(taken.asked)}`;

/** One fact under a gate, as the inspector lists it: a label, the words, and where to read more (a step's section on the run's page). */
export type GateFact = { label: string; said: string; state?: 'good' | 'bad'; step?: string };

/** What a person's approval of a loop out of rounds adds to its last word's fact — their words — or null. */
function acceptedWords(looping: Pick<RunDetail['steps'][number], 'gate'>) {
  const approval = looping.gate?.approval;
  if (!approval) return null;
  return `; a person accepted the work as it stands${approval.message ? `: ${approval.message}` : ''}`;
}

/**
 * The last word of a looping step: no further round asked, or the first count its step declares and what it left, or how it signed off.
 * @param looping The looping step, as the run's page reads it.
 */
function loopFact(looping: RunDetail['steps'][number]) {
  const closeout = looping.closeout;
  const output = closeout?.output ?? {};
  const counted = closeout?.tallies[0];
  const left = counted?.value ?? null;
  const accepted = acceptedWords(looping);
  const said = !closeout
    ? `${looping.name} has yet to sign off`
    : output.again === false
      ? `${looping.name} asks no further round${left ? `; ${counted?.tally}: ${left}` : ''}`
      : left !== null
        ? `${looping.name} left ${counted?.tally}: ${left}${accepted ?? (output.again === true ? ', and asks another round' : '')}`
        : `${looping.name} signed off ${closeout.outcome}`;
  return { label: 'loop', said, state: output.again === false && !left ? 'good' : undefined, step: looping.name } satisfies GateFact;
}

/**
 * The facts under a gate, each off the record: the round the run is on of its loop's cap, and what it has cost; the last word of each
 * looping step (a review) — no further round asked, or the count its step declares (`tally:`) and what it left; each check's verdict on
 * its final try; and, off the run's decision when it has been read, what the result touched and whether each branch still merges.
 *
 * A looping step's word is read off its closeout's output, the key the loop reads (`again`), and the first count its step declares
 * (`tallies`, valued by the api): a step that declares none has nothing counted, and a closeout without either says it signed off, and
 * how. A step not run says so. A looping step a person approved out of rounds (an approval of a loop, its gate's approval) is said
 * accepted as it stands, with their words, not as asking another round, though its closeout still says `again: true` (`acceptedWords`).
 * @param run The run's detail: its steps and what it has cost.
 * @param decision The run's decision, or null where it has not been read.
 */
export function gateFacts(run: Pick<RunDetail, 'steps' | 'cost'>, decision: Decidable | null) {
  const facts: GateFact[] = [];
  const loops = run.steps.filter((s) => s.spec?.loop);
  const round = Math.max(1, ...run.steps.flatMap((s) => s.tries.map((t) => t.round)));
  const cap = loops.map((s) => s.spec?.rounds).find((n): n is number => typeof n === 'number');
  facts.push({ label: 'round', said: `${cap ? `round ${round} of ${cap}` : `round ${round}`} · cost ${run.cost?.said ?? 'not measured'}` });
  for (const looping of loops) {
    facts.push(loopFact(looping));
  }
  for (const checked of run.steps.filter((s) => s.check)) facts.push(checkFact(checked));
  if (decision) facts.push(...decisionFacts(decision));
  return facts;
}

/**
 * The fact of a step's check under a gate: its verdict in words (`verdictWords`), `not run` before it is filed, and the try it is on
 * where there was more than one — good where it passed, bad where it settled otherwise, and neither while it runs.
 */
function checkFact(checked: StepView) {
  const verdict = checked.check?.verdict ?? null;
  return {
    label: 'check',
    said: `${checked.name}: ${verdict ? verdictWords(verdict) : 'not run'}${checked.tries.length > 1 ? ` on try ${checked.tries.at(-1)!.try}` : ''}`,
    state: verdict?.result === 'passed' ? 'good' : verdict && verdict.result !== 'running' ? 'bad' : undefined,
    step: checked.name,
  } satisfies GateFact;
}

/** The facts the run's decision adds under its gate: what it touched, whether each branch merges onto the base, and its collisions. */
function decisionFacts(decision: Decidable) {
  const facts: GateFact[] = [];
  if (decision.touched.length) facts.push({ label: 'touched', said: touchedSummary(decision.touched) });
  for (const standing of decision.standings) {
    if (!standing.merge) continue;
    facts.push({
      label: 'merges',
      said: standing.merge.said,
      state: 'clean' in standing.merge ? (standing.merge.clean ? 'good' : 'bad') : undefined,
    });
  }
  if (decision.collisions) facts.push(...collisionFacts(decision.collisions));
  return facts;
}

/**
 * The facts a result's collisions add under its gate: the runs in flight on the base in one line — good when it collides with none, bad
 * when it conflicts with one — then each branch of theirs one of ours does not merge onto cleanly.
 * @param collisions The result's collisions with the runs in flight on the base.
 */
export function collisionFacts(collisions: Collisions) {
  const conflicts = (c: Collision) => 'clean' in c.merge;
  const { colliding } = collisions;
  return [
    {
      label: 'others',
      said: collisions.said,
      state: colliding.some(conflicts) ? 'bad' : colliding.length ? undefined : 'good',
    },
    ...colliding.map(
      (c) => ({ label: 'collides', said: `${c.ours} ${c.said}`, state: conflicts(c) ? 'bad' : undefined }) satisfies GateFact,
    ),
  ] satisfies GateFact[];
}

/**
 * The card's line for a result nobody decided, which fits whatever the branch is called: `decide its result: a branch ahead of the base
 * that nothing merges`. The CLI `ls`'s own words, with the branch and the command, are the card's title and the run page's Decide section.
 * @param branches The result's branches ahead of the base.
 */
export const decideLine = (branches: readonly string[]) =>
  `decide its result: ${branches.length === 1 ? 'a branch' : `${branches.length} branches`} ahead of the base that nothing merges`;

/**
 * A step's need, for the inspector, in full: what it asks, or what the harness waits for, where to answer it, and what its session said
 * last.
 * @param need The step's need.
 */
export const needWords = (need: Need) =>
  need.kind === 'asks'
    ? `${need.step} asks: ${need.needs}`
    : need.kind === 'harness'
      ? `${need.step} is blocked by the harness${need.waitingFor ? `; ${need.waitingFor.words} — ${need.waitingFor.advice}` : ''}${need.lastLine ? `; its session said last: ${need.lastLine}` : ''}`
      : need.said;
