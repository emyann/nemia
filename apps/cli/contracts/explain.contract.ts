/**
 * What `nemia explain <resource>[.<field>]...` answers of a kind's fields (apps/cli, src/objects/explain.ts, `explained`), as `kubectl
 * explain` does: from the kind's fields, each a row with its path from the object's root (`spec.from`), its parent's path (`spec`, the
 * root's own being ''), its type and its description, flattened by the caller from the package's own OpenAPI document
 * (`OpenApi.fromApi(Api)`), the field asked for and the fields under it; or, for a path the kind has no field at, a refusal, the caller
 * naming the fields there are. The empty path is the object itself, whose fields are the rows the root holds.
 */
import { type Implementation, spec } from '@emyann/tsverify';

/** One field of a kind: its path from the object's root, its parent's path, its type as the document says it, and its description. */
export type FieldRow = {
  readonly path: string;
  readonly parent: string;
  readonly type: string;
  readonly description: string | null;
  readonly required: boolean;
};

/** A field explained: the row asked for (none for the object itself), and the rows directly under it. */
export type Explained = { readonly field: FieldRow | null; readonly fields: readonly FieldRow[] };

/** Why no field is explained: the kind has none at the path. */
export type NoField = { readonly refused: 'no-field' };

/** Whether `out` explains a field, not a refusal. */
const isExplained = (out: Explained | NoField): out is Explained => !('refused' in out);

const explainedSpec = spec<(rows: readonly FieldRow[], path: string) => Explained | NoField>({
  ensures: {
    refusedExactlyWhereNoField: {
      description: 'A path is refused exactly where it is not the object itself and the kind has no field there',
      condition: ({ input: [rows, path], output }) => isExplained(output) === (path === '' || rows.some((r) => r.path === path)),
    },
    answersTheFieldAsked: {
      description: 'A field explained is the one the path names; the object itself is no field',
      condition: ({ input: [, path], output }) =>
        !isExplained(output) || (path === '' ? output.field === null : output.field !== null && output.field.path === path),
    },
    fieldsAreUnderIt: {
      description: 'Every field listed is directly under the one explained, and one of the kind’s',
      condition: ({ input: [rows, path], output }) =>
        !isExplained(output) || output.fields.every((f) => f.parent === path && rows.some((r) => r.path === f.path)),
    },
    noFieldUnderItLeftOut: {
      description: 'No field directly under the one explained is left out',
      condition: ({ input: [rows, path], output }) =>
        !isExplained(output) || rows.every((r) => r.parent !== path || output.fields.some((f) => f.path === r.path)),
    },
  },
});

/** `explained`'s type, which src/objects/explain.ts takes. */
export type ExplainedOf = Implementation<typeof explainedSpec>;
