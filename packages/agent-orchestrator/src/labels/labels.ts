/**
 * A person's labels, whole and pure: free `key=value` pairs in Kubernetes' spelling with no prefix, put on inbox cards and runs and
 * changed at any time. What a label may be spelled (`labelRefusal`), kubectl's edits of a map (`parseLabelEdits`, `labelEdits`), and
 * what a start copies once, at creation (`inheritedLabels`). No Effect: every caller wraps a refusal in the package's `Invalid`.
 *
 * **One map, beside the closed keys.** A run's and a card's labels sit in one map with `factory` and `workflow`, which Nemia gives
 * itself and a person may not set (`CLOSED_LABEL_KEYS`). Nor may a label take a key a feed line or a selector already gives a meaning
 * to (`RESERVED_LABEL_KEYS`): a label named `reason` would decide what `-l reason=…` selects.
 */
import type { LabelEdits } from '../../contracts/labels.contract.ts';
import { LABEL_KEYS, RESERVED_KEYS } from '../watch/selector.ts';

/** A person's labels: a key to its value, Kubernetes' `map[string]string`. */
export type Labels = Readonly<Record<string, string>>;

/** The keys Nemia sets on every run's map itself, which a person's label may not take. */
export const CLOSED_LABEL_KEYS: readonly string[] = ['factory', 'workflow'];

/** The keys a feed line or a selector reads of itself, which a person's label may not take: the line's own, the signed ones, its prose. */
export const RESERVED_LABEL_KEYS: readonly string[] = [
  ...LABEL_KEYS.filter((key) => !CLOSED_LABEL_KEYS.includes(key)),
  ...RESERVED_KEYS,
  'message',
];

/** The longest a label's key or value may be, as Kubernetes holds it. */
export const LABEL_CAP = 63;

/** Kubernetes' name segment: alphanumerics at both ends, `-`, `_` and `.` between. */
export const LABEL_NAME = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;

const LISTS = `the closed keys are ${CLOSED_LABEL_KEYS.join(', ')} and the reserved ones ${RESERVED_LABEL_KEYS.join(', ')}`;

/** Why `key` cannot be a person's label key, or undefined where it can. Pure. */
export function labelKeyRefusal(key: string): string | undefined {
  if (key.includes('/'))
    return `${JSON.stringify(key)} has a prefix, and a label takes none for now: drop what is before the /, as in ${key.slice(key.lastIndexOf('/') + 1) || 'team'}=…`;
  if (key.length > LABEL_CAP)
    return `the label key ${JSON.stringify(key)} is ${key.length} characters long: keep it to ${LABEL_CAP} at most`;
  if (!LABEL_NAME.test(key))
    return `${JSON.stringify(key)} is no label key: begin and end it with a letter or a digit, with - _ . between, as in team or my.key_2`;
  if (CLOSED_LABEL_KEYS.includes(key)) return `${key} is a key Nemia sets itself and no label of a person's: ${LISTS}`;
  if (RESERVED_LABEL_KEYS.includes(key))
    return `${key} is a key a feed line or a selector reads itself: name the label otherwise — ${LISTS}`;
  return undefined;
}

/** Why `value` cannot be the value of the label `key`, or undefined where it can: empty, or a name segment of 63 at most. Pure. */
export function labelValueRefusal(key: string, value: string): string | undefined {
  if (value === '') return undefined;
  if (value.length > LABEL_CAP) return `the value of ${key} is ${value.length} characters long: keep it to ${LABEL_CAP} at most`;
  if (!LABEL_NAME.test(value))
    return `${JSON.stringify(value)} is no value of ${key}: leave it empty, or begin and end it with a letter or a digit, with - _ . between`;
  return undefined;
}

/** Why `key=value` cannot be a person's label, or undefined. Pure. */
export const labelRefusal = (key: string, value: string): string | undefined => labelKeyRefusal(key) ?? labelValueRefusal(key, value);

/** Why `labels` cannot be a person's map, in the words of its first wrong pair, or undefined. Pure. */
export function labelsRefusal(labels: Labels): string | undefined {
  for (const [key, value] of Object.entries(labels)) {
    const refusal = labelRefusal(key, value);
    if (refusal) return refusal;
  }
  return undefined;
}

/** One edit of a map, as kubectl spells it: `key=value` sets the key, `key-` removes it. */
export type LabelEdit =
  | { readonly key: string; readonly op: 'set'; readonly value: string }
  | { readonly key: string; readonly op: 'remove' };

/** The command words that end a refusal of an edit's spelling. */
const EDIT_FORM = 'label edits are key=value to set a key and key- to remove one';

/**
 * The edits `texts` spell, or the refusal of the first that is wrong: a word that is neither `key=value` nor `key-`, a key or a value
 * a label cannot hold, and one key edited twice in one list, which says nothing of which edit wins. Pure.
 */
export function parseLabelEdits(texts: readonly string[]): { readonly edits: readonly LabelEdit[] } | { readonly refused: string } {
  const edits: LabelEdit[] = [];
  for (const text of texts) {
    const at = text.indexOf('=');
    const edit: LabelEdit | undefined =
      at > 0
        ? { key: text.slice(0, at), op: 'set', value: text.slice(at + 1) }
        : at < 0 && text.length > 1 && text.endsWith('-')
          ? { key: text.slice(0, -1), op: 'remove' }
          : undefined;
    if (edit === undefined) return { refused: `${JSON.stringify(text)} is no label edit: ${EDIT_FORM}` };
    const refusal = edit.op === 'set' ? labelRefusal(edit.key, edit.value) : labelKeyRefusal(edit.key);
    if (refusal) return { refused: refusal };
    if (edits.some((e) => e.key === edit.key)) return { refused: `${edit.key} is edited twice in one list: give each key one edit` };
    edits.push(edit);
  }
  return { edits };
}

/** What `labelEdits` answers: the map after the edits, or why they were refused. */
export type Edited = { readonly labels: Labels } | { readonly refused: string };

/**
 * `current` after `edits`, as `kubectl label` applies them: each `key=value` sets its key, each `key-` removes it (no change where it
 * is absent), and every key no edit names keeps its value. Without `overwrite`, an edit that would change a key's value is refused,
 * naming the key, its value and `--overwrite`; with it, or where the value is the same, it is taken. Pure.
 */
export const labelEdits: LabelEdits = (current, edits, overwrite) => {
  const clash = edits.find((e) => e.op === 'set' && Object.hasOwn(current, e.key) && current[e.key] !== e.value);
  if (!overwrite && clash !== undefined && clash.op === 'set')
    return { refused: `${clash.key} is already ${clash.key}=${current[clash.key] ?? ''}: add --overwrite to set it to ${clash.value}` };
  return { labels: applied(current, edits) };
};

/** `current` with each edit applied: a set writes its key, a remove deletes it. */
function applied(current: Labels, edits: readonly LabelEdit[]): Labels {
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
 */
export function inheritedLabels(input: {
  readonly parents: readonly ParentLabels[];
  readonly card?: Labels;
  readonly edits?: readonly LabelEdit[];
}): Inherited {
  const card = input.card ?? {};
  const edits = input.edits ?? [];
  const named = (key: string): boolean => Object.hasOwn(card, key) || edits.some((e) => e.key === key);
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

/** `labels` as a printer shows them: `a=b,c=d` in key order, or `<none>` for none, as kubectl's LABELS column. Pure. */
export const labelsText = (labels: Labels): string => {
  const keys = Object.keys(labels).sort();
  return keys.length === 0 ? '<none>' : keys.map((key) => `${key}=${labels[key] ?? ''}`).join(',');
};

/**
 * A run's whole map, as its object's `metadata.labels` says it and a selector reads it: `workflow`, `factory` where the run is in a
 * named one, and the person's keys, which never take a closed key (`labelKeyRefusal`). Pure.
 */
export const metadataLabels = (of: {
  readonly workflow: string;
  readonly factory?: string | undefined;
  readonly labels?: Labels;
}): Labels => ({
  ...of.labels,
  workflow: of.workflow,
  ...(of.factory ? { factory: of.factory } : {}),
});
