/**
 * What a step's card says, read from the run's own answer (`RunDetail`), the run's row on the list and the agents: the card's kind and
 * the hue of its frame, its tag, its agent, its tries and rounds, its time, its session's five facts, its spend, a note and its one
 * action, `Read and approve` at an approval's gate. Its words are the step part's head (`headOf`, stepPart.ts), their one writer, said
 * here as the card reads them, null in place of `none`. `StepPart` draws that head at M, in the waiting card's modal; the e2e's
 * preview page
 * (`059-runs-preview.ts`) reads what the diamond's glance (`StepGlance`) is expected to say here.
 */
import {
  headOf,
  type CardNote,
  type CardSpend,
  type CardTime,
  type HeadInput,
  type None,
  type PartHead,
  type StepKind,
} from './stepPart.ts';

export { kindOf } from './stepPart.ts';
export type { StepKind } from './stepPart.ts';

/** Everything the card draws; `facts`, `time` and `spend` are null while the run's own answer is read. */
export type StepCardFacts = {
  kind: StepKind;
  hue: PartHead['hue'];
  tag: PartHead['tag'];
  agent: { name: string; initial: string; role: string } | null;
  model: string | null;
  step: string;
  place: string | null;
  time: CardTime | null;
  facts: Array<{ key: string; value: string }> | null;
  spend: CardSpend | null;
  note: CardNote | null;
  action: { words: string; runId: string; step: string };
};

/** What the card reads: the run's row, the step's name, the run's own answer once read, the agents once read, and the instant now. */
type StepCardInput = HeadInput;

/** A head's fact as the card reads it: null in place of `none`. */
const orNull = <T>(fact: T | None) => (fact === 'none' ? null : (fact as Exclude<T, None>));

/**
 * The card of the step `step` of `run`: what the run's row knows at once (its state, its agent), and once the run's own answer is read,
 * its tries, time, facts, spend and note.
 * @param input The run's row, the step's name, the run's own answer once read, the agents once read, and the instant now.
 */
export function stepCardOf(input: StepCardInput) {
  const head = headOf(input);
  return {
    kind: head.kind,
    hue: head.hue,
    tag: head.tag,
    agent: orNull(head.who),
    model: orNull(head.model),
    step: head.step,
    place: orNull(head.round),
    time: orNull(head.time),
    facts: orNull(head.facts),
    spend: orNull(head.spend),
    note: orNull(head.note),
    action: head.action,
  } satisfies StepCardFacts;
}
