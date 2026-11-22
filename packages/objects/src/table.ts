/**
 * A list as a table, as Kubernetes' server-side printing answers one (`meta.k8s.io/v1` `Table`): the columns a client prints, each with
 * its type and its priority (0 shown by default, higher only when asked wide), and a row per item, its cells in the columns' order, the
 * item itself beside them where the server gives it. A client asks for it with the `Accept` header Kubernetes' clients send
 * (`TABLE_ACCEPT`), and a list endpoint that answers one declares `Schema.Union([<Kind>List, Table])` as its success, so neither the
 * board nor the cli keeps a printer of its own: `tableLines` prints one as `kubectl get` does, for the client and the api's MCP port alike.
 */
import { Schema } from 'effect';
import { describedNumber, describedOne } from './meta.ts';
import { READS, type ReadBound } from './reads.ts';
import { TABLE_COLUMN_TYPES } from './words.ts';

/** The `Accept` value that asks a list for a `Table`, as `kubectl get` asks it. */
export const TABLE_ACCEPT = 'application/json;as=Table;g=meta.k8s.io;v=v1';

/** One column: its name, the type of its cells (`TABLE_COLUMN_TYPES`), a format beside it, what it says, and when it is shown. */
export const TableColumnDefinition = Schema.Struct({
  name: Schema.String.annotate({ description: "The column's name." }),
  type: Schema.Literals(TABLE_COLUMN_TYPES).annotate({ description: 'The type of its cells.' }),
  format: Schema.String.annotate({ description: 'A format beside the type.' }),
  description: Schema.String.annotate({ description: 'What the column says.' }),
  priority: describedNumber('When it is shown: 0 by default, higher only when asked wide.'),
});
export type TableColumnDefinition = typeof TableColumnDefinition.Type;

/** One row: its cells, in the columns' order, and the object it prints where the server gives it. */
export const TableRow = Schema.Struct({
  cells: Schema.Array(Schema.Unknown).annotate({ description: "The row's cells, in the columns' order." }),
  object: Schema.optionalKey(describedOne(Schema.Unknown, 'The object the row prints, where the server gives it.')),
});
export type TableRow = typeof TableRow.Type;

/** A list as a table: where the page stands (`resourceVersion`, `continue`), its columns and its rows. */
export const Table = Schema.Struct({
  kind: Schema.Literal('Table').annotate({ description: 'What the object is: a Table.' }),
  apiVersion: Schema.Literal('meta.k8s.io/v1').annotate({ description: 'The version the table is served under, meta.k8s.io/v1.' }),
  metadata: Schema.Struct({
    resourceVersion: Schema.optionalKey(Schema.String.annotate({ description: "The list's position as it was read." })),
    continue: Schema.optionalKey(
      Schema.String.annotate({ description: 'The opaque word that asks for the next page; absent on the last.' }),
    ),
  }).annotate({ description: 'Where the page stands.' }),
  columnDefinitions: Schema.Array(TableColumnDefinition).annotate({ description: 'The columns a client prints.' }),
  rows: Schema.Array(TableRow).annotate({ description: "A row per item, its cells in the columns' order." }),
});
export type Table = typeof Table.Type;

/** How a table is asked to print: wide, with its labels, and the label keys to show a column of. */
export type TableAsked = { readonly wide: boolean; readonly showLabels: boolean; readonly columns: readonly string[] };

/** The column a `--show-labels` asks for, by the name the server gives it. */
const LABELS = 'Labels';

/** The labels of a row's object (its `metadata.labels`), where it carries them. */
const RowLabels = Schema.Struct({
  metadata: Schema.Struct({ labels: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)) }),
});

/** The labels `object` carries, none where it carries none. */
const labelsOf = (object: unknown) => {
  const read = Schema.decodeUnknownOption(RowLabels)(object);
  return read._tag === 'Some' ? (read.value.metadata.labels ?? {}) : {};
};

/** A cell as a person reads it: a string as it is, nothing as `<none>`, anything else as JSON. */
const cellText = (cell: unknown) =>
  typeof cell === 'string' ? cell : cell === null || cell === undefined ? '<none>' : JSON.stringify(cell);

/**
 * The lines of `table` as `asked`: the columns of priority 0, every column when wide, the `Labels` column with its labels, and a column
 * per label key read off each row's object, as `kubectl get` prints them — each column's name in capitals over its cells, padded to the
 * widest, three spaces apart; its header, then a line per row; no line where it has no row. Pure.
 * @param table The table, its columns and rows.
 * @param asked How it is asked: wide, with its labels, and the label keys to show as columns.
 */
export function tableLines(table: Table, asked: TableAsked) {
  if (table.rows.length === 0) return [];
  const shown = table.columnDefinitions.flatMap((column, at) =>
    column.priority === 0 || asked.wide || (asked.showLabels && column.name === LABELS) ? [{ name: column.name, at }] : [],
  );
  const header = [...shown.map((c) => c.name.toUpperCase()), ...asked.columns.map((key) => key.toUpperCase())];
  const rows = table.rows.map((row) => [
    ...shown.map((c) => cellText(row.cells[c.at])),
    ...asked.columns.map((key) => labelsOf(row.object)[key] ?? ''),
  ]);
  const widths = header.map((name, at) => Math.max(name.length, ...rows.map((cells) => (cells[at] ?? '').length)));
  return [header, ...rows].map((cells) =>
    cells
      .map((cell, at) => (at === cells.length - 1 ? cell : cell.padEnd(widths[at] ?? 0)))
      .join('   ')
      .trimEnd(),
  );
}

/** What an Api is read as by `pagesWithoutTable`: its groups, each its endpoints by name, with their method and successes. */
type ApiSuccesses = {
  readonly groups: Readonly<
    Record<
      string,
      {
        readonly identifier: string;
        readonly endpoints: Readonly<Record<string, { readonly method: string; readonly success: ReadonlySet<unknown> }>>;
      }
    >
  >;
};

/** Whether `value` can hold keys: an object, or a function, which a Schema is. */
const keyed = (value: unknown): value is object => (typeof value === 'object' && value !== null) || typeof value === 'function';

/** The Schema a success of an endpoint holds: HttpApi keeps each as a `{ schema, ast }`, the Schema declared under `schema`. */
const declared = (success: unknown) => (keyed(success) && 'schema' in success ? success.schema : success);

/**
 * Whether `success` declares the `Table`: the Table itself, or a union one of whose members is (`Schema.Union([RunList, Table])`).
 * @param success One success of an endpoint, as its set holds it.
 */
const answersTable = (success: unknown) => {
  const schema = declared(success);
  return schema === Table || (keyed(schema) && 'members' in schema && Array.isArray(schema.members) && schema.members.includes(Table));
};

/**
 * Each GET endpoint of `api` that `reads` calls a list's page (`page`) and whose successes hold no `Table`, in words naming the fix: a
 * list that cannot be asked for its table makes a client print it by a printer of its own. Empty for an Api every page of which answers
 * one. Pure.
 * @param api The Api whose GET endpoints are read.
 * @param reads How each read is bounded, by group and endpoint name; READS by default.
 */
export const pagesWithoutTable = (api: ApiSuccesses, reads: Readonly<Record<string, ReadBound>> = READS) =>
  Object.values(api.groups).flatMap((group) =>
    Object.entries(group.endpoints)
      .filter(([name, endpoint]) => endpoint.method === 'GET' && reads[`${group.identifier}.${name}`]?.shape === 'page')
      .filter(([, endpoint]) => ![...endpoint.success].some(answersTable))
      .map(
        ([name]) =>
          `${group.identifier}.${name} is a page that answers no Table: declare \`[<Kind>List, Table]\` as its success and answer the kind's table where \`wantsTable\``,
      ),
  );
