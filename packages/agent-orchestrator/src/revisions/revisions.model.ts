/**
 * The revisions model: what a run or one of its steps pinned of a kind and name, as a record keeps it (`Pins`).
 */
import { Schema } from 'effect';
import { REVISION_KINDS } from './revisions.ts';

/**
 * What a run or one of its steps resolved of one kind and name (`Pin`), as a record keeps it: absent where nothing was resolved, and each
 * entry kept whole, so a pin a newer tick writes more of comes back as it was written. A pin's `n` is the definition's revision in the
 * run's namespace.
 */
export const Pins = Schema.optional(
  Schema.mutable(
    Schema.Array(
      Schema.StructWithRest(
        Schema.Struct({ kind: Schema.Literals([...REVISION_KINDS]), name: Schema.String, n: Schema.Number, hash: Schema.String }),
        [Schema.Record(Schema.String, Schema.Unknown)],
      ),
    ),
  ),
);
