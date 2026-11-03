/**
 * A person's labels (agent-orchestrator, src/labels/labels.ts): when `labelEdits`, kubectl's edits of a map, refuses — exactly where an
 * edit would change a value a key already holds and `--overwrite` is not given — and what `inheritedLabels`, the labels a start copies
 * once, holds of the typed edits, the card and the keys it leaves out. A key is read as the map's own (`Object.hasOwn`): `constructor`
 * is a label a person may name. What `labelEdits`' edited map holds is not stated here: `src/labels/labels.test.ts` holds it. Of
 * `inheritedLabels`, the laws about the keys the runs agree on — that each is copied, that one they disagree on is absent and left
 * out, that a key left out names each run and its value, and that the map holds nothing else — are not proved by tsverify 0.6, which
 * would need what its first loop writes at each key: the test holds them, a row each.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Edited, Inherited, LabelEdit, Labels, ParentLabels } from '../src/labels/labels.ts';

/** A map read at any key, which may be missing: the contracts are read without `noUncheckedIndexedAccess`. */
type Read = Readonly<Record<string, string | undefined>>;

/** The value `map` gives `key`, if any. */
const at = (map: Read, key: string): string | undefined => map[key];

/** Whether `map` carries `key` itself. */
const carries = (map: Labels, key: string): boolean => Object.hasOwn(map, key);

/** Whether an edit would change a value `current` already holds: a `key=value` whose key carries another value. */
const changesAValue = (current: Labels, edits: readonly LabelEdit[]): boolean =>
  edits.some((e) => e.op === 'set' && carries(current, e.key) && at(current, e.key) !== e.value);

const labelEditsSpec = spec<(current: Labels, edits: readonly LabelEdit[], overwrite: boolean) => Edited>({
  ensures: {
    noSilentOverwrite: {
      description: 'Without --overwrite, an edit that would change a value a key holds is refused',
      condition: ({ input: [current, edits, overwrite], output }) => overwrite || !changesAValue(current, edits) || 'refused' in output,
    },
    acceptsOtherwise: {
      description: 'The edits are refused only without --overwrite, where one would change a value a key holds',
      condition: ({ input: [current, edits, overwrite], output }) =>
        !('refused' in output) || (!overwrite && changesAValue(current, edits)),
    },
  },
});
export type LabelEdits = Implementation<typeof labelEditsSpec>;

/** What a start names: the runs it copies from, the card's labels, the typed edits. */
type Start = { readonly parents: readonly ParentLabels[]; readonly card?: Labels; readonly edits?: readonly LabelEdit[] };

const cardOf = (start: Start): Labels => start.card ?? {};
const editsOf = (start: Start): readonly LabelEdit[] => start.edits ?? [];
/** Whether the card or an edit names `key`. */
const named = (start: Start, key: string): boolean => carries(cardOf(start), key) || editsOf(start).some((e) => e.key === key);
/** Whether edit `i` is the last that names its key. */
const lastOfItsKey = (start: Start, i: number, key: string): boolean => !editsOf(start).some((f, j) => j > i && f.key === key);
/** Whether two runs give `key` different values. */
const disagree = (start: Start, key: string): boolean =>
  start.parents.some((p) =>
    start.parents.some((q) => carries(p.labels, key) && carries(q.labels, key) && at(p.labels, key) !== at(q.labels, key)),
  );
/** Whether `labels` holds `key` at `value`. */
const holds = (labels: Labels, key: string, value: string): boolean => carries(labels, key) && at(labels, key) === value;
/**
 * No run, card or edit names `__proto__`: the code's own invariant, since `labelKeyRefusal` refuses it (`LABEL_NAME` wants a letter or
 * a digit at both ends), so no map a start reads ever carries it. Written to a plain object, a string at `__proto__` sets no key.
 */
const noProto = (start: Start): boolean =>
  start.parents.every((p) => !carries(p.labels, '__proto__')) &&
  !carries(cardOf(start), '__proto__') &&
  editsOf(start).every((e) => e.key !== '__proto__');

const inheritedLabelsSpec = spec<(input: Start) => Inherited>({
  requires: ({ input: [start] }) => noProto(start),
  ensures: {
    typedWins: {
      description: 'A key typed key=value at the start has that value, over the card and the runs',
      condition: ({ input: [start], output }) =>
        editsOf(start).every((e, i) => e.op !== 'set' || !lastOfItsKey(start, i, e.key) || holds(output.labels, e.key, e.value)),
    },
    droppedAtStart: {
      description: 'A key typed key- is absent, whatever the card or the runs say',
      condition: ({ input: [start], output }) =>
        editsOf(start).every((e, i) => e.op === 'set' || !lastOfItsKey(start, i, e.key) || !carries(output.labels, e.key)),
    },
    cardOverRuns: {
      description: "The card's value is taken over the runs', where no edit names its key",
      condition: ({ input: [start], output }) =>
        Object.entries(cardOf(start)).every(
          ([key, value]) => editsOf(start).some((e) => e.key === key) || holds(output.labels, key, value),
        ),
    },
    leftOutOnlyDisagreed: {
      description: 'A key left out is one two runs disagree on, and neither the card nor an edit names',
      condition: ({ input: [start], output }) => output.leftOut.every((l) => !named(start, l.key) && disagree(start, l.key)),
    },
  },
});
export type InheritedLabels = Implementation<typeof inheritedLabelsSpec>;
