/**
 * `nemia label run` and `nemia label inbox`, entries of the command table: a person's labels on a run or a card edited, as `kubectl label`
 * spells it, their words the client's (`objects`' `LABEL_RUN_WORDS`, `LABEL_INBOX_WORDS`). The api serves each, a run's as the Run's
 * `labels` action and a card's as the Card's `labels` verb (`objects`' Api), its body a `LabelEdit` — `labels`, the edits, and
 * `overwrite` — under the keys the command line gives them, so one handler reads both.
 */
import { Effect, Schema } from 'effect';
import { checked, tableEntry, type Served } from '../command/entry.verb.ts';
import { LABEL_INBOX_WORDS, LABEL_RUN_WORDS, LabelEdit, noEdits, type Labelled } from 'objects';
import { labelCard, labelRun } from './labels.verb.ts';

/** What `nemia label run` takes: the run, and the edit as the api is sent it (`objects`' `LabelEdit`: `labels`, `overwrite`). */
export const LabelRunInput = Schema.Struct({ runId: Schema.String, ...LabelEdit.fields });
export type LabelRunInput = typeof LabelRunInput.Type;

/**
 * `nemia label run`: a run's person labels edited — in flight, waiting or finished — and written beside its record. The feed's lines
 * written after it carry the new labels; those before keep theirs.
 */
export const LABEL_RUN: Served<Labelled, LabelRunInput> = {
  ...LABEL_RUN_WORDS,
  input: LabelRunInput,
  handler: (input) =>
    Effect.andThen(checked(noEdits('nemia label run', 'run')(input)), () =>
      labelRun(input.runId, [...input.labels], input.overwrite === true),
    ),
};

/** What `nemia label inbox`'s handler takes: the card's name, and `objects`' `LabelEdit` — the edits, and `overwrite`. */
export const LabelCardInput = Schema.Struct({ name: Schema.String, ...LabelEdit.fields });
export type LabelCardInput = typeof LabelCardInput.Type;

/** `nemia label inbox`: an inbox card's `labels:` edited, every other key and its body kept; the run it starts is created with them. */
export const LABEL_CARD: Served<Labelled, LabelCardInput> = {
  ...LABEL_INBOX_WORDS,
  input: LabelCardInput,
  handler: ({ name, labels, overwrite }) => Effect.suspend(() => labelCard(name, [...labels], overwrite === true)),
};

/** `nemia label`'s entries, in the order `nemia`'s help lists them. */
export const LABELS: readonly Served[] = [tableEntry(LABEL_RUN), tableEntry(LABEL_CARD)];
