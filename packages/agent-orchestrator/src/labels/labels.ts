/**
 * A person's labels, whole and pure: free `key=value` pairs in Kubernetes' spelling, a key an optional prefix and a name
 * (`team.example/stage`), put on inbox cards and runs and changed at any time. What a label may be spelled (`labelRefusal`), kubectl's
 * edits of a map (`parseLabelEdits`, `labelEdits`), and what a start copies once, at creation (`inheritedLabels`); and a run's labels
 * as a selection reads them (`runLabelMap`, `selectedRuns`, `labelSegments`). No Effect: every caller wraps a refusal in the package's
 * `Invalid`.
 *
 * **One map, beside the closed keys.** A run's and a card's labels sit in one map with `factory` and `workflow`, which Nemia gives
 * itself and a person may not set (`CLOSED_LABEL_KEYS`). Nor may a label take a key a feed line or a selector already gives a meaning
 * to (`RESERVED_LABEL_KEYS`): a label named `reason` would decide what `-l reason=…` selects.
 */
import type { LabelEdits } from '../../contracts/labels.contract.ts';
import path from 'node:path';
import { DEFAULT_NAMESPACE } from '../factory/factory.ts';
import type { Run } from '../record/record.ts';
import { selectsLabels, type Selectors } from '../watch/selector.ts';

export {
  CLOSED_LABEL_KEYS,
  LABEL_CAP,
  LABEL_NAME,
  labelKeyRefusal,
  labelRefusal,
  labelsRefusal,
  labelValueRefusal,
  parseLabelEdits,
  RESERVED_LABEL_KEYS,
} from '../label-spelling/label-spelling.ts';
import type { Labels, LabelChange } from '../../contracts/labels.contract.ts';

export type { Labels, LabelChange, Edited } from '../../contracts/labels.contract.ts';

/**
 * `current` after `edits`, as `kubectl label` applies them: each `key=value` sets its key, each `key-` removes it (no change where it
 * is absent), and every key no edit names keeps its value. Without `overwrite`, an edit that would change a key's value is refused,
 * naming the key, its value and `--overwrite`; with it, or where the value is the same, it is taken. Pure.
 * @param current The labels the object has.
 * @param edits The edits to apply, in order.
 * @param overwrite Whether an edit may change a key's value (`--overwrite`).
 */
export const labelEdits: LabelEdits = (current, edits, overwrite) => {
  const clash = edits.find((e) => e.op === 'set' && Object.hasOwn(current, e.key) && current[e.key] !== e.value);
  if (!overwrite && clash !== undefined && clash.op === 'set')
    return { refused: `${clash.key} is already ${clash.key}=${current[clash.key] ?? ''}: add --overwrite to set it to ${clash.value}` };
  return { labels: applied(current, edits) };
};

/** `current` with each edit applied: a set writes its key, a remove deletes it. */
function applied(current: Labels, edits: readonly LabelChange[]) {
  const out: Record<string, string> = { ...current };
  for (const edit of edits) {
    if (edit.op === 'set') out[edit.key] = edit.value;
    else delete out[edit.key];
  }
  return out;
}

/** A run a start names, `--after` or `--from`, and the labels it carries. */
export type ParentLabels = { readonly run: string; readonly labels: Labels };

/** A key a start leaves out, since the runs it names give it different values: the key, and each run with its value. */
export type LeftOut = { readonly key: string; readonly values: readonly { readonly run: string; readonly value: string }[] };

/** What a start copies: the labels, and each key two of its runs disagree on, which is not inherited. */
export type Inherited = { readonly labels: Labels; readonly leftOut: readonly LeftOut[] };

/**
 * The labels a run or a card is created with, copied once: every key the runs it names (`parents`) agree on, then the card's own
 * labels over them, then the start's typed edits over those — `key=value` sets, `key-` drops an inherited one. A key two runs give
 * different values that neither the card nor the start sets is left out, and named in `leftOut`. Pure.
 * @param input The labels of the runs the card or run names (`parents`), the card's own, and the start's typed edits, the last two absent
 * where none.
 */
export function inheritedLabels(input: {
  readonly parents: readonly ParentLabels[];
  readonly card?: Labels;
  readonly edits?: readonly LabelChange[];
}) {
  const card = input.card ?? {};
  const edits = input.edits ?? [];
  const named = (key: string) => Object.hasOwn(card, key) || edits.some((e) => e.key === key);
  const out: Record<string, string> = {};
  const leftOut: LeftOut[] = [];
  const keys = [...new Set(input.parents.flatMap((p) => Object.keys(p.labels)))].sort();
  for (const key of keys) {
    if (named(key)) continue;
    const values = input.parents.flatMap((p) => {
      const value = Object.hasOwn(p.labels, key) ? p.labels[key] : undefined;
      return value === undefined ? [] : [{ run: p.run, value }];
    });
    const first = values[0];
    if (first === undefined) continue;
    if (values.every((v) => v.value === first.value)) out[key] = first.value;
    else leftOut.push({ key, values });
  }
  for (const [key, value] of Object.entries(card)) out[key] = value;
  for (const edit of edits) {
    if (edit.op === 'set') out[edit.key] = edit.value;
    else delete out[edit.key];
  }
  return { labels: out, leftOut };
}

/**
 * `labels` as a printer shows them: `a=b,c=d` in key order, or `<none>` for none, as kubectl's LABELS column. Pure.
 * @param labels The map to show.
 */
export const labelsText = (labels: Labels) => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/**
 * A run's whole map, as its object's `metadata.labels` says it, a selector reads it and the feed's lines carry it: `workflow`, `factory`
 * — `default` for a run in the default factory, as the feed and the telemetry say it, so `-l factory=default` selects the same runs on
 * every surface — and the person's keys, which never take a closed key (`labelKeyRefusal`). The caller names the factory: there is no
 * default here to forget. Pure.
 * @param of The run's workflow and factory, `default` for the default one, and the person's labels, if any.
 */
export const metadataLabels = (of: { readonly workflow: string; readonly factory: string; readonly labels?: Labels }) => ({
  ...of.labels,
  workflow: of.workflow,
  factory: of.factory,
});

/**
 * The run's whole map, as a selector reads it and a list's row carries it: the person's keys, `workflow`, and `factory` (`default` for the
 * default one).
 * @param run The run's record: its workflow's folder, its factory, undefined for the default one, and its person labels.
 */
export const runLabelMap = (run: Pick<Run, 'workflowDir' | 'factory' | 'labels'>) =>
  metadataLabels({ workflow: path.basename(run.workflowDir), factory: run.factory ?? DEFAULT_NAMESPACE, labels: run.labels });

/**
 * The runs of `runs` whose whole map `selectors` takes (`selectsLabels`), in their order: every one where none is given. The lists select
 * off the composed record before they judge a run (`runsSummarized`, `runsListed`), and the stats before they sum a run's facts.
 * @param runs The runs to select from.
 * @param selectors The selectors given; none selects every run.
 */
export const selectedRuns = <R extends Pick<Run, 'workflowDir' | 'factory' | 'labels'>>(runs: readonly R[], selectors: Selectors = []) =>
  selectors.length ? runs.filter((run) => selectsLabels(selectors, runLabelMap(run))) : runs;

/**
 * What a printer appends to a line of `map`'s, as `nemia ls` its runs' head lines and `nemia inbox` its cards': with `--show-labels`,
 * `  labels: <the map>` (`labelsText`); then, for each `-L <key>` in the order given, `  <key>: <its value>`, `<none>` where the map has
 * none. Nothing with neither, so the line is as it was. Pure.
 * @param map The labels of the line's run or card.
 * @param shown Whether `--show-labels` was given (`all`), and the keys of each `-L`, in the order given.
 */
export const labelSegments = (map: Labels, shown: { readonly all: boolean; readonly columns: readonly string[] }) =>
  `${shown.all ? `  labels: ${labelsText(map)}` : ''}${shown.columns.map((key) => `  ${key}: ${map[key] ?? '<none>'}`).join('')}`;
