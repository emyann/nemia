/**
 * What a label may be spelled, whole and pure: a key in Kubernetes' spelling, an optional prefix (a DNS subdomain) and a name
 * (`labelKeyShape`, `labelKeySpellingRefusal`), the keys a feed line gives a meaning to itself, which a selector reads and a person's
 * label may not take (`LABEL_KEYS`, `RESERVED_KEYS`, `CLOSED_LABEL_KEYS`, `RESERVED_LABEL_KEYS`), a person's label and map refused
 * (`labelRefusal`, `labelsRefusal`), and kubectl's edits of one parsed (`parseLabelEdits`).
 *
 * A leaf, importing no value: the selector (`src/watch/selector.ts`), a person's labels (`src/labels/labels.ts`, which re-exports it)
 * and a workflow's load (`src/route/route-keys.ts`, a backlog node's `relabel:`) all read it, and the first two reach the load, so a
 * file that holds these and imports either would close a value cycle.
 */
import type { LabelKeyShape } from '../../contracts/label-key.contract.ts';
import type { LabelChange, Labels } from '../../contracts/labels.contract.ts';
import type { LabelValuesRefused } from '../../contracts/label-values.contract.ts';
import type { ClosedFeedLabels } from '../feed/index.ts';

/**
 * Every label key of a feed line, each named once. A `Record` of `keyof ClosedFeedLabels`, whose keys are required however optional the
 * labels themselves are, so a label added to `ClosedFeedLabels` fails the typecheck here until it is named — and a selector reaches it the
 * day it exists, rather than being refused as no key of a line.
 */
const EVERY_LABEL: Record<keyof ClosedFeedLabels, true> = { run: true, factory: true, workflow: true, step: true, agent: true };

/** The label keys a selector may name, in the order `ClosedFeedLabels` declares them: every one of them (`EVERY_LABEL`). */
export const LABEL_KEYS: readonly (keyof ClosedFeedLabels)[] = Object.keys(EVERY_LABEL) as (keyof ClosedFeedLabels)[];

/** The keys a signed line names of itself, which a selector reads beside the labels: what it is about, and how its writer judged it. */
export const RESERVED_KEYS: readonly string[] = ['kind', 'reason', 'on', 'via', 'type', 'waits', 'source'];

/** A key's name segment, as Kubernetes spells one: alphanumerics at both ends, `-`, `_` and `.` between. */
const NAME_SEGMENT = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;

/**
 * A key's prefix, a DNS subdomain as Kubernetes spells one: lowercase labels of alphanumerics and `-`, each alphanumeric at both ends,
 * joined by dots.
 */
const DNS_SUBDOMAIN = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/;

/**
 * A label key's segments, as Kubernetes spells one: a name alone, a prefix and a name split at the one slash, or the first flaw of its
 * structure — a second slash, a prefix written empty, no name, a prefix past 253 or a name past 63. Pure, and proved by
 * `contracts/label-key.contract.ts`; what the characters of each segment may be is `labelKeySpellingRefusal`'s.
 * @param key The key as given.
 * @public
 */
export const labelKeyShape: LabelKeyShape = (key) => {
  const slashed = key.includes('/');
  const name = slashed ? key.slice(key.indexOf('/')).slice(1) : key;
  if (slashed && name.includes('/')) return { kind: 'refused', reason: 'slashes' };
  if (key.startsWith('/')) return { kind: 'refused', reason: 'empty-prefix' };
  if (name === '') return { kind: 'refused', reason: 'empty-name' };
  const prefix = key.slice(0, key.indexOf('/'));
  if (slashed && prefix.length > 253) return { kind: 'refused', reason: 'long-prefix' };
  if (name.length > 63) return { kind: 'refused', reason: 'long-name' };
  if (!slashed) return { kind: 'name', name };
  return { kind: 'prefixed', prefix, name };
};

/**
 * Why `key` is spelled as no label key, or undefined where it is one: its structure (`labelKeyShape`), then its name segment's
 * characters, then its prefix's, a DNS subdomain. Each refusal names the spelling to write. Pure: what a person's label and a
 * selector's key both read.
 * @param key The key as given.
 */
export function labelKeySpellingRefusal(key: string) {
  const shape = labelKeyShape(key);
  const k = JSON.stringify(key);
  if (shape.kind === 'refused') {
    if (shape.reason === 'slashes')
      return `${k} holds more than one /: a key is an optional prefix, one /, and a name, as in team.example/stage`;
    if (shape.reason === 'empty-prefix') return `${k} opens on its /: write the prefix before it, as in team.example/stage, or drop the /`;
    if (shape.reason === 'empty-name') return `${k} has no name after its /: write one, as in ${key}stage`;
    if (shape.reason === 'long-prefix') return `the prefix of ${k} is ${key.indexOf('/')} characters long: shorten it to 253 at most`;
    return `the name of ${k} is ${key.length - key.indexOf('/') - 1} characters long: keep it to 63 at most`;
  }
  if (!NAME_SEGMENT.test(shape.name))
    return `${k} is no label key: begin and end its name with a letter or a digit, with - _ . between, as in team or team.example/my.key_2`;
  if (shape.kind === 'prefixed' && !DNS_SUBDOMAIN.test(shape.prefix))
    return `the prefix of ${k} is no DNS subdomain: write it in lowercase letters, digits, - and ., each part beginning and ending with a letter or a digit, as in team.example/${shape.name}`;
  return undefined;
}

/** The keys Nemia sets on every run's map itself, which a person's label may not take. */
const CLOSED_LABEL_KEYS: readonly string[] = ['factory', 'workflow'];

/** The keys a feed line or a selector reads of itself, which a person's label may not take: the line's own, the signed ones, its prose. */
const RESERVED_LABEL_KEYS: readonly string[] = [
  ...LABEL_KEYS.filter((key) => !CLOSED_LABEL_KEYS.includes(key)),
  ...RESERVED_KEYS,
  'message',
];

/** The longest a label's key or value may be, as Kubernetes holds it. */
const LABEL_CAP = 63;

/** Kubernetes' name segment: alphanumerics at both ends, `-`, `_` and `.` between. */
const LABEL_NAME = /^[A-Za-z0-9]([-A-Za-z0-9_.]*[A-Za-z0-9])?$/;

const LISTS = `the closed keys are ${CLOSED_LABEL_KEYS.join(', ')} and the reserved ones ${RESERVED_LABEL_KEYS.join(', ')}`;

/**
 * Why `key` cannot be a person's label key, or undefined where it can: its spelling (`labelKeySpellingRefusal`), then the closed and
 * reserved keys, each compared whole, so a prefixed key such as `team.example/workflow` is a person's. Pure.
 * @param key The key as given.
 */
function labelKeyRefusal(key: string) {
  const spelling = labelKeySpellingRefusal(key);
  if (spelling !== undefined) return spelling;
  if (CLOSED_LABEL_KEYS.includes(key)) return `${key} is a key Nemia sets itself and no label of a person's: ${LISTS}`;
  if (RESERVED_LABEL_KEYS.includes(key))
    return `${key} is a key a feed line or a selector reads itself: name the label otherwise — ${LISTS}`;
  return undefined;
}

/**
 * Why `value` cannot be the value of the label `key`, or undefined where it can: empty, or a name segment of 63 at most. Pure.
 * @param key The label's key, which the refusal names.
 * @param value The value as given; empty takes the key's value away.
 */
function labelValueRefusal(key: string, value: string) {
  if (value === '') return undefined;
  if (value.length > LABEL_CAP) return `the value of ${key} is ${value.length} characters long: keep it to ${LABEL_CAP} at most`;
  if (!LABEL_NAME.test(value))
    return `${JSON.stringify(value)} is no value of ${key}: leave it empty, or begin and end it with a letter or a digit, with - _ . between`;
  return undefined;
}

/**
 * Why `key=value` cannot be a person's label, or undefined. Pure.
 * @param key The label's key.
 * @param value The label's value.
 */
export const labelRefusal = (key: string, value: string) => labelKeyRefusal(key) ?? labelValueRefusal(key, value);

/**
 * Why `labels` cannot be a person's map, in the words of its first wrong pair, or undefined. Pure.
 * @param labels The map as given.
 */
export function labelsRefusal(labels: Labels) {
  for (const [key, value] of Object.entries(labels)) {
    const refusal = labelRefusal(key, value);
    if (refusal) return refusal;
  }
  return undefined;
}

/** The command words that end a refusal of an edit's spelling. */
const EDIT_FORM = 'label edits are key=value to set a key and key- to remove one';

/**
 * The edits `texts` spell, or the refusal of the first that is wrong: a word that is neither `key=value` nor `key-`, a key or a value
 * a label cannot hold, and one key edited twice in one list, which says nothing of which edit wins. Pure.
 * @param texts The edits as typed, each `key=value` or `key-`.
 */
export function parseLabelEdits(texts: readonly string[]) {
  const edits: LabelChange[] = [];
  for (const text of texts) {
    const at = text.indexOf('=');
    const edit: LabelChange | undefined =
      at > 0
        ? { key: text.slice(0, at), op: 'set', value: text.slice(at + 1) }
        : at < 0 && text.length > 1 && text.endsWith('-')
          ? { key: text.slice(0, -1), op: 'remove' }
          : undefined;
    if (edit === undefined)
      return { refused: `${JSON.stringify(text)} is no label edit: ${EDIT_FORM}` } satisfies
        | { readonly edits: readonly LabelChange[] }
        | { readonly refused: string } as { readonly edits: readonly LabelChange[] } | { readonly refused: string };
    const refusal = edit.op === 'set' ? labelRefusal(edit.key, edit.value) : labelKeyRefusal(edit.key);
    if (refusal)
      return { refused: refusal } satisfies { readonly edits: readonly LabelChange[] } | { readonly refused: string } as
        | { readonly edits: readonly LabelChange[] }
        | { readonly refused: string };
    if (edits.some((e) => e.key === edit.key))
      return { refused: `${edit.key} is edited twice in one list: give each key one edit` } satisfies
        | { readonly edits: readonly LabelChange[] }
        | { readonly refused: string } as { readonly edits: readonly LabelChange[] } | { readonly refused: string };
    edits.push(edit);
  }
  return { edits } satisfies { readonly edits: readonly LabelChange[] } | { readonly refused: string } as
    | { readonly edits: readonly LabelChange[] }
    | { readonly refused: string };
}

/**
 * Which of the labels `given` a factory whose rules are `rules` does not take: each whose key a rule names with a value it does not
 * list, with the values that key takes. Pure, and proved by `contracts/label-values.contract.ts`.
 * @param rules The keys the factory names, each with the values it takes.
 * @param given The labels a write gives, as it sets them.
 */
export const labelValuesRefused: LabelValuesRefused = (rules, given) =>
  given.flatMap((label) => {
    const first = rules.find((rule) => rule.key === label.key);
    if (first === undefined || rules.some((rule) => rule.key === label.key && rule.values.includes(label.value))) return [];
    return [{ key: label.key, value: label.value, takes: first.values }];
  });

/**
 * The values each key takes that `text` states, as `key=value` words apart by whitespace, each key its values in the order first written
 * and each once; none for no word. Or the refusal of the first word that is no label a person may set with a value (`labelRefusal`), or
 * no `key=value` at all. Pure: what a factory's template writes as its `labelValues`.
 * @param text The words as written.
 */
export function labelValuesOf(text: string) {
  const held = new Map<string, string[]>();
  for (const word of text.split(/\s+/).filter((w) => w !== '')) {
    const at = word.indexOf('=');
    const key = word.slice(0, at);
    const value = word.slice(at + 1);
    const refused =
      at <= 0 || value === '' ? `${JSON.stringify(word)} is no label value: write key=value, as in team=core` : labelRefusal(key, value);
    if (refused !== undefined)
      return { refused } satisfies { readonly values: Readonly<Record<string, readonly string[]>> } | { readonly refused: string } as
        | { readonly values: Readonly<Record<string, readonly string[]>> }
        | { readonly refused: string };
    const was = held.get(key) ?? [];
    if (!was.includes(value)) held.set(key, [...was, value]);
  }
  const values: Readonly<Record<string, readonly string[]>> = Object.fromEntries(held);
  return { values } satisfies { readonly values: Readonly<Record<string, readonly string[]>> } | { readonly refused: string } as
    | { readonly values: Readonly<Record<string, readonly string[]>> }
    | { readonly refused: string };
}
