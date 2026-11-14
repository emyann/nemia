/**
 * What a run asks of a person, a line each, as the top of its page lists them (`AsksOfYou`) and a step's node says one (`PartAsks` at
 * S): what there is to decide about its result, then each step whose part asks (`asksOf`), in the run's order, by what it asks — its
 * gate, its harness's wait, its questions, its need, the try a person asked for, the calls denied it, what it waits for, else the answer
 * its state waits for. The forms that answer each are in the step's own part; these lines only name and point. Pure.
 */
import { askedOf, needNodeText, needOf } from './asks.ts';
import { toDecideOf } from './factory.ts';
import { gateNodeLine, gateOfStep } from './gate.ts';
import type { RunDetail, StepView } from './runView.ts';
import { asksOf } from './stepPart.ts';
import { stepState } from './status.ts';
import { PERSON } from './words.ts';

/** What a line asks: the run's result to decide, else what its step asks, in the order `askOf` reads them. */
const RUN_ASK_KINDS = ['decide', 'gate', 'harness', 'questions', 'needs', 'asked', 'denied', 'waiting', 'offer'] as const;

/** What a line of the run's asks asks. */
type RunAskKind = (typeof RUN_ASK_KINDS)[number];

/** One line of what the run asks: its kind, the step it is of (none for a result with no step), and its words. */
export type RunAsk = { kind: RunAskKind; step: string | null; line: string };

/** What a step's part asks, as its model has it. */
type Asks = Exclude<ReturnType<typeof asksOf>, 'none'>;

/** A count of questions in words. */
const questionsSaid = (n: number): string => `asks ${n} question${n === 1 ? '' : 's'}`;

/**
 * What the step `step` of `run` asks (`asks`), in one line and its kind: its gate's, its harness's wait, the questions its closeout asks,
 * its need, the note of a try a person asked for, the calls denied it, what it waits for; else what its state means to a person.
 */
export function askOf(run: RunDetail, step: StepView, asks: Asks): { kind: Exclude<RunAskKind, 'decide'>; line: string } {
  const gate = gateOfStep(run, step);
  if (gate) return { kind: 'gate', line: gateNodeLine(gate) };
  const need = needOf(step, run.waitingOnYou.includes(step.name), run.cancelledAt !== null);
  if (need?.kind === 'harness') return { kind: 'harness', line: needNodeText(need) };
  const questions = asks.questions.reduce((n, a) => n + a.questions.length, 0);
  if (questions > 0) return { kind: 'questions', line: questionsSaid(questions) };
  if (need) return { kind: need.kind === 'approve' ? 'gate' : 'needs', line: needNodeText(need) };
  const asked = askedOf(run, step.name);
  if (asked) return { kind: 'asked', line: asked.note ?? `try ${asked.try} asked` };
  if (asks.denied) return { kind: 'denied', line: asks.denied.words };
  if (asks.waitingFor) return { kind: 'waiting', line: asks.waitingFor.words };
  if (asks.needs) return { kind: 'needs', line: asks.needs };
  return { kind: 'offer', line: PERSON[stepState(step, run.cancelledAt !== null, run.holding != null)].meaning };
}

/**
 * Every line the run asks, top to bottom: what there is to decide about its result (`toDecide`), linked to its step where it is a
 * step's approval; then each step whose part asks, in the run's order, but the step the first line names already, and each step whose
 * next try a person asked for, its note, until the tick files it. None on a run called off: nobody waits for an answer any more.
 */
export function runAsksOf(run: RunDetail): RunAsk[] {
  if (run.cancelledAt !== null) return [];
  const decide = toDecideOf(run);
  const decided = decide?.kind === 'approve' ? decide.step : null;
  const top: RunAsk[] = decide ? [{ kind: 'decide', step: decided, line: decide.said }] : [];
  const held = run.holding != null;
  return [
    ...top,
    ...run.steps.flatMap((step): RunAsk[] => {
      if (step.name === decided) return [];
      const asks = asksOf(step, stepState(step, false, held), run.waitingOnYou.includes(step.name));
      if (asks !== 'none') return [{ step: step.name, ...askOf(run, step, asks) }];
      const asked = askedOf(run, step.name);
      return asked ? [{ kind: 'asked', step: step.name, line: asked.note ?? `try ${asked.try} asked` }] : [];
    }),
  ];
}
