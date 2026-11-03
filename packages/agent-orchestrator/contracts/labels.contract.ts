/**
 * A person's labels (agent-orchestrator, src/labels/labels.ts): when `labelEdits`, kubectl's edits of a map, refuses — exactly where an
 * edit would change a value a key already holds and `--overwrite` is not given. A key is read as the map's own (`Object.hasOwn`):
 * `constructor` is a label a person may name. What the edited map holds, and what `inheritedLabels` copies, build a map at keys the
 * code computes, which tsverify does not read: `src/labels/labels.test.ts` holds those sentences, a row each.
 */
import { type Implementation, spec } from '@emyann/tsverify';
import type { Edited, LabelEdit, Labels } from '../src/labels/labels.ts';

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
