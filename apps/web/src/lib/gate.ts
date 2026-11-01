/**
 * What a gate asks of a person, in words, wherever the board shows one: the Factory's card, the gate's node and the step inspector. Pure.
 *
 * The facts are the api's, off the package: which step waits at its gate (`toDecide`, a step's `approve`), where a send-back goes
 * (`sendBackTo`, carried as `back`), the base branch (`onto`, `branch`), each step's tries, closeout and check, and the run's decision. The
 * sentences joining them are the board's, so a person reads what approving does without knowing the package: the CLI's `ls` prints the
 * command.
 */
import type { Collision, Collisions, Decidable, RunDetail, RunSummary, StepAsked } from './api';
import { askedSaid, needsOf, stepAnchor, type Need } from './asks.ts';
import { touchedSummary } from './decide.ts';
import { verdictWords } from './words.ts';

type DetailStep = RunDetail['steps'][number];

/**
 * A gate a person answers from the board: the step waiting at it; whether it ends the run in the repository's own checkout (`ends`), held
 * before it is filed so that the approval is what runs it; and the steps a send-back goes to (`back`) — the step itself for a gate that
 * holds after its step has run, the work an ending waits on for an ending, and none for an ending that waits on nothing.
 */
export type GateAsk = { step: string; ends: boolean; back: readonly string[]; onto: string | null };

/**
 * The gate the Factory's card answers, off the list alone: the ending's gate the run's to-decide says, or the first step waiting at its
 * gate on you. Null on a run called off, on a run a person holds (the CLI's `hold`, whose approval the package refuses), and where no gate
 * waits. A to-decide gate whose `back` names the step itself holds after the step ran (`sendBackTo` gives the step once it has a task); one
 * whose `back` does not is an ending, not filed until approved. A list from an api without `back` reads the step alone as where a send-back
 * goes, which the package would refuse for an ending, in its words.
 */
export function gateOfSummary(
  run: Pick<RunSummary, 'cancelledAt' | 'waitingOnYou' | 'steps' | 'toDecide'> & { holding?: RunSummary['holding'] },
): GateAsk | null {
  if (run.cancelledAt !== null || run.holding != null) return null;
  const decide = run.toDecide;
  if (decide?.kind === 'approve') {
    const back = decide.back ?? [decide.step];
    return { step: decide.step, ends: !back.includes(decide.step), back, onto: decide.onto ?? null };
  }
  const need = needsOf(run).find((one) => one.kind === 'approve');
  return need ? { step: need.step, ends: false, back: [need.step], onto: null } : null;
}

/**
 * The same gate off a run's detail, for one step: the inspector's and the node's. Null unless the step waits at its gate on you, on a run
 * nobody called off. `ends` off the workflow the run froze (`workspace: main`); `back` as the package names it, off the graph's `after`
 * edges for an ending that has no task yet.
 */
export function gateOfStep(
  run: Pick<RunDetail, 'cancelledAt' | 'waitingOnYou' | 'branch' | 'graph'>,
  step: Pick<DetailStep, 'name' | 'approve' | 'spec' | 'taskId'>,
): GateAsk | null {
  if (run.cancelledAt !== null || !step.approve || !run.waitingOnYou.includes(step.name)) return null;
  const ends = step.spec?.workspace === 'main';
  const back = step.taskId ? [step.name] : run.graph.edges.filter((e) => e.kind === 'after' && e.to === step.name).map((e) => e.from);
  return { step: step.name, ends: ends && !step.taskId, back, onto: run.branch };
}

/** Who a send-back names in a sentence: the one step, or `the work` where there are several to pick from. */
export const backName = (back: readonly string[]): string => (back.length === 1 ? back[0] : 'the work');

/**
 * The card's words for a gate, in its one row: what approving does, and where a send-back goes.
 * `approve to run ship on main, or send review back`; for a gate that holds after its step ran,
 * `approve what review handed on, or send it back`. Long names cut it short on the card, which has it whole on hover beside the step's own
 * prose; the inspector says it all, whole.
 */
export function gateCardLine(gate: GateAsk): string {
  const approving = gate.ends ? `approve to run ${gate.step}${gate.onto ? ` on ${gate.onto}` : ''}` : `approve what ${gate.step} handed on`;
  if (!gate.back.length) return `${approving}: it waits on no step to send back`;
  return `${approving}, or send ${gate.ends ? `${backName(gate.back)} back` : 'it back'}`;
}

/**
 * The card's way to what a gate asks a person to approve, which a card has no room to show (it must fit its cell): the words, and where on
 * the run's page it goes. A step that has signed off opens its inspector (`step`), on its Output tab, where its closeout is:
 * `Read what it handed on`, whatever the step is named. An ending has handed nothing on and has no closeout of its own: its section
 * (`hash`), where what it would act on is drawn beside its gate.
 */
export const readLink = (gate: Pick<GateAsk, 'step' | 'ends'>): { words: string; step: string } | { words: string; hash: string } =>
  gate.ends ? { words: 'Read what it acts on', hash: stepAnchor(gate.step) } : { words: 'Read what it handed on', step: gate.step };

/**
 * A gate's node, under its name, where one line fits: `approve ship to run it`, or `approve review's hand-off`. Both name the step as
 * the CLI's `ls` does (`approve review`), and the inspector says the rest.
 */
export const gateNodeLine = (gate: Pick<GateAsk, 'step' | 'ends'>): string =>
  gate.ends ? `approve ${gate.step} to run it` : `approve ${gate.step}'s hand-off`;

/**
 * The inspector's opening: which step waits, what approving does and what sending back does, each a sentence off the record.
 *
 * Approving an ending runs it — in the repository's own checkout, on the base branch — and it is handed the approval's words as its terms;
 * what it does there is the package's `toDecide.says`, the first line of the step's own note, quoted, never the board's guess. Approving
 * any other gate files the steps that wait on it (`next`), handed the words. Sending back asks a new try of the step it goes to with the
 * person's words, and the gate holds again once that try signs off.
 */
export function gateBrief(
  gate: GateAsk,
  says: string | null,
  next: readonly string[],
): { waits: string; approving: string; sendingBack: string } {
  const waits = gate.ends
    ? `${gate.step} waits at its gate: it has not run, and it runs only on your approval.`
    : `${gate.step} has signed off and waits at its gate: nothing after it is filed until you approve what it handed on.`;
  const approving = gate.ends
    ? `Approving runs ${gate.step} in the repository's own checkout${gate.onto ? `, on ${gate.onto}` : ''}, handed your words, if any, as its terms.${says ? ` Its folder says what it does: “${says}”` : ''}`
    : `Approving files ${next.length ? next.join(', ') : 'nothing: no step waits on it'}${next.length ? `, handed ${gate.step}'s closeout and your words, if any` : ''}.`;
  const sendingBack = !gate.back.length
    ? `There is nothing to send back: ${gate.step} waits on no step.`
    : gate.ends
      ? `Sending back asks ${gate.back.join(' or ')} for a new try, told your words; ${gate.step} waits at its gate again once it signs off.`
      : `Sending back asks ${gate.step} for a new try, told your words; it waits at its gate again once it signs off.`;
  return { waits, approving, sendingBack };
}

/**
 * What the card says once a person's word is taken, until the run is read again and moves: `approved — the next pass files ship`, or
 * `sent back to review — try 2 asked (--continue, with your answer) — the next tick files it`.
 */
export const takenLine = (
  taken: { approved: true } | { asked: StepAsked | { try: number; stopFirst: boolean }; to: string },
  gate: GateAsk,
): string =>
  'approved' in taken
    ? `approved — the next pass files ${gate.ends ? gate.step : `what waits on ${gate.step}`}`
    : `sent back to ${taken.to} — ${askedSaid(taken.asked)}`;

/** One fact under a gate, as the inspector lists it: a label, the words, and where to read more (a step's section on the run's page). */
export type GateFact = { label: string; said: string; state?: 'good' | 'bad'; step?: string };

/**
 * The facts under a gate, each off the record: the round the run is on of its loop's cap, and what it has cost; the last word of each
 * looping step (a review) — no further round asked, or how many findings it left; each check's verdict on its final try; and, off the run's
 * decision when it has been read, what the result touched and whether each branch still merges onto the base.
 *
 * A looping step's word is read off its closeout's output, the keys `wf`'s loop reads (`again`) and the reviewer's `findings`; a closeout
 * without them says it signed off, and how. A step not run says so. A looping step a person ended out of rounds (the CLI's `accept`) is
 * said accepted as it stands, with their words, not as asking another round, though its closeout still says `again: true`.
 */
export function gateFacts(run: Pick<RunDetail, 'steps' | 'cost'>, decision: Decidable | null): GateFact[] {
  const facts: GateFact[] = [];
  const loops = run.steps.filter((s) => s.spec?.loop);
  const round = Math.max(1, ...run.steps.flatMap((s) => s.tries.map((t) => t.round)));
  const cap = loops.map((s) => s.spec?.rounds).find((n): n is number => typeof n === 'number');
  facts.push({ label: 'round', said: `${cap ? `round ${round} of ${cap}` : `round ${round}`} · cost ${run.cost?.said ?? 'not measured'}` });
  for (const looping of loops) {
    const closeout = looping.closeout;
    const output = closeout?.output ?? {};
    const findings = Array.isArray(output.findings) ? output.findings.length : null;
    const accepted = looping.accepted
      ? `; a person accepted the work as it stands, with ${findings === 1 ? 'it' : 'them'} open: ${looping.accepted.message}`
      : null;
    const said = !closeout
      ? `${looping.name} has yet to sign off`
      : output.again === false
        ? `${looping.name} asks no further round${findings ? `, and left ${findings} finding${findings === 1 ? '' : 's'}` : ''}`
        : findings !== null
          ? `${looping.name} left ${findings} finding${findings === 1 ? '' : 's'}${accepted ?? (output.again === true ? ' and asks another round' : '')}`
          : `${looping.name} signed off ${closeout.outcome}`;
    facts.push({ label: 'last review', said, state: output.again === false && !findings ? 'good' : undefined, step: looping.name });
  }
  for (const checked of run.steps.filter((s) => s.check)) facts.push(checkFact(checked));
  if (decision) facts.push(...decisionFacts(decision));
  return facts;
}

/**
 * The fact of a step's check under a gate: its verdict in words (`verdictWords`), `not run` before it is filed, and the try it is on
 * where there was more than one — good where it passed, bad where it settled otherwise, and neither while it runs.
 */
function checkFact(checked: RunDetail['steps'][number]): GateFact {
  const verdict = checked.check?.verdict ?? null;
  return {
    label: 'check',
    said: `${checked.name}: ${verdict ? verdictWords(verdict) : 'not run'}${checked.tries.length > 1 ? ` on try ${checked.tries.at(-1)!.try}` : ''}`,
    state: verdict?.result === 'passed' ? 'good' : verdict && verdict.result !== 'running' ? 'bad' : undefined,
    step: checked.name,
  };
}

/** The facts the run's decision adds under its gate: what it touched, whether each branch merges onto the base, and its collisions. */
function decisionFacts(decision: Decidable): GateFact[] {
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
 * The facts an ending's collisions add under its gate: the runs in flight on the base in one line — good when it collides with none, bad
 * when it conflicts with one — then each branch of theirs one of ours does not merge onto cleanly, and the semantic conflict.
 */
export function collisionFacts(collisions: Collisions): GateFact[] {
  const conflicts = (c: Collision): boolean => 'clean' in c.merge;
  const { colliding, semantic } = collisions;
  return [
    {
      label: 'others',
      said: collisions.said,
      state: colliding.some(conflicts) ? 'bad' : colliding.length ? undefined : 'good',
    },
    ...colliding.map((c): GateFact => ({ label: 'collides', said: `${c.ours} ${c.said}`, state: conflicts(c) ? 'bad' : undefined })),
    ...(semantic ? [{ label: 'semantic', said: semantic.said, state: 'bad', step: semantic.step } satisfies GateFact] : []),
  ];
}

/**
 * What a run waits on a person for other than a gate, in words, for the card and the inspector: a step's question, a session the harness
 * blocked, or a result nobody decided — each answered on the run's page, which these link to (`step` names the section, or none for the
 * Decide section). Inline answers are for gates alone.
 */
export type Waits = { said: string; step: string | null };

/**
 * The card's line for a result nobody decided, which fits whatever the branch is called: `decide its result: a branch ahead of the base
 * that nothing merges`. The CLI `ls`'s own words, with the branch and the command, are the card's title and the run page's Decide section.
 */
export const decideLine = (branches: readonly string[]): string =>
  `decide its result: ${branches.length === 1 ? 'a branch' : `${branches.length} branches`} ahead of the base that nothing merges`;

/**
 * A step's need, for the inspector, in full: what it asks, or what the harness waits for, where to answer it, and what its session said
 * last.
 */
export const needWords = (need: Need): string =>
  need.kind === 'asks'
    ? `${need.step} asks: ${need.needs}`
    : need.kind === 'harness'
      ? `${need.step} is blocked by the harness${need.waitingFor ? `; ${need.waitingFor.words} — ${need.waitingFor.advice}` : ''}${need.lastLine ? `; its session said last: ${need.lastLine}` : ''}`
      : need.said;
