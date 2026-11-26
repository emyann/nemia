/**
 * Which of the labels a write gives a factory does not take (agent-orchestrator, src/label-spelling/label-spelling.ts,
 * `labelValuesRefused`): a factory states, by key, the values a key takes on its cards and runs (its `labelValues`), and a label it
 * gives a key the factory names, with a value the factory does not list for that key, is refused. A key the factory names not is free,
 * whatever its value; a key the write does not give is never judged, so a card that lacks a named key is filed, and a value that stands
 * untouched is never judged by a later write. Every offending label is answered, each with the values its key takes, so one refusal
 * names them all and the line to type again. The words of the refusal, and which doors call it, are the code's: tests hold those.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** A label a write gives: its key and its value, as the write sets them. */
export type LabelGiven = { readonly key: string; readonly value: string };

/** A key a factory names, and the values it takes for it. */
export type LabelValueRule = { readonly key: string; readonly values: readonly string[] };

/** A label refused: its key and value as given, and the values the factory takes for that key. */
export type LabelValueOffence = { readonly key: string; readonly value: string; readonly takes: readonly string[] };

/** Whether the factory names `key`. */
const named = (rules: readonly LabelValueRule[], key: string) => rules.some((rule) => rule.key === key);

/** Whether the factory takes `value` for `key`: it names the key not, or lists the value for it. */
const taken = (rules: readonly LabelValueRule[], key: string, value: string) =>
  !named(rules, key) || rules.some((rule) => rule.key === key && rule.values.includes(value));

/** Whether `offence` is the label `label`. */
const isLabel = (offence: LabelValueOffence, label: LabelGiven) => offence.key === label.key && offence.value === label.value;

/** Whether `takes` lists the values a rule of the factory names for `key`, no more and no fewer. */
const takesOf = (rules: readonly LabelValueRule[], key: string, takes: readonly string[]) =>
  rules.some(
    (rule) =>
      rule.key === key && rule.values.every((value) => takes.includes(value)) && takes.every((value) => rule.values.includes(value)),
  );

const labelValuesRefusedSpec = spec<(rules: readonly LabelValueRule[], given: readonly LabelGiven[]) => readonly LabelValueOffence[]>({
  ensures: {
    everyRefusedAnswered: {
      description: 'A label given whose key the factory names, with a value it does not take for that key, is answered as refused',
      condition: ({ input: [rules, given], output }) =>
        given.every((label) => taken(rules, label.key, label.value) || output.some((offence) => isLabel(offence, label))),
    },
    onlyGivenLabelsRefused: {
      description: 'Every label refused is one the write gives: a label that stands untouched, or one not given, is never judged',
      condition: ({ input: [, given], output }) => output.every((offence) => given.some((label) => isLabel(offence, label))),
    },
    takenNeverRefused: {
      description: 'A label the factory takes is never refused: a key it names not is free, and a value it lists for its key passes',
      condition: ({ input: [rules], output }) => output.every((offence) => !taken(rules, offence.key, offence.value)),
    },
    refusalSaysWhatTheKeyTakes: {
      description: 'Each label refused says the values the factory takes for its key, as the factory lists them',
      condition: ({ input: [rules], output }) => output.every((offence) => takesOf(rules, offence.key, offence.takes)),
    },
  },
});

/** `labelValuesRefused`'s type, which src/label-spelling/label-spelling.ts takes: it then imports nothing of tsverify. */
export type LabelValuesRefused = Implementation<typeof labelValuesRefusedSpec>;
