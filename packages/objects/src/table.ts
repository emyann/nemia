/**
 * A list as a table, as Kubernetes' server-side printing answers one (`meta.k8s.io/v1` `Table`): the columns a client prints, each with
 * its type and its priority (0 shown by default, higher only when asked wide), and a row per item, its cells in the columns' order, the
 * item itself beside them where the server gives it. A client asks for it with the `Accept` header Kubernetes' clients send
 * (`TABLE_ACCEPT`), and a list endpoint that answers one declares `Schema.Union([<Kind>List, Table])` as its success, so neither the
 * board nor the cli keeps a printer of its own: `tableLines` prints one as `kubectl get` does, for the client and the api's MCP port alike.
 */
import { Schema } from 'effect';
import { TABLE_COLUMN_TYPES } from './words.ts';

/** The `Accept` value that asks a list for a `Table`, as `kubectl get` asks it. */
export const TABLE_ACCEPT = 'application/json;as=Table;g=meta.k8s.io;v=v1';

/** One column: its name, the type of its cells (`TABLE_COLUMN_TYPES`), a format beside it, what it says, and when it is shown. */
export const TableColumnDefinition = Schema.Struct({
  name: Schema.String,
  type: Schema.Literals(TABLE_COLUMN_TYPES),
  format: Schema.String,
  description: Schema.String,
  priority: Schema.Number,
});
export type TableColumnDefinition = typeof TableColumnDefinition.Type;

/** One row: its cells, in the columns' order, and the object it prints where the server gives it. */
export const TableRow = Schema.Struct({
  cells: Schema.Array(Schema.Unknown),
  object: Schema.optionalKey(Schema.Unknown),
});
export type TableRow = typeof TableRow.Type;

/** A list as a table: where the page stands (`resourceVersion`, `continue`), its columns and its rows. */
export const Table = Schema.Struct({
  kind: Schema.Literal('Table'),
  apiVersion: Schema.Literal('meta.k8s.io/v1'),
  metadata: Schema.Struct({
    resourceVersion: Schema.optionalKey(Schema.String),
    continue: Schema.optionalKey(Schema.String),
  }),
  columnDefinitions: Schema.Array(TableColumnDefinition),
  rows: Schema.Array(TableRow),
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
const labelsOf = (object: unknown): Readonly<Record<string, string>> => {
  const read = Schema.decodeUnknownOption(RowLabels)(object);
  return read._tag === 'Some' ? (read.value.metadata.labels ?? {}) : {};
};

/** A cell as a person reads it: a string as it is, nothing as `<none>`, anything else as JSON. */
const cellText = (cell: unknown): string =>
  typeof cell === 'string' ? cell : cell === null || cell === undefined ? '<none>' : JSON.stringify(cell);

/**
 * The lines of `table` as `asked`: the columns of priority 0, every column when wide, the `Labels` column with its labels, and a column
 * per label key read off each row's object, as `kubectl get` prints them — each column's name in capitals over its cells, padded to the
 * widest, three spaces apart; its header, then a line per row; no line where it has no row. Pure.
 */
export function tableLines(table: Table, asked: TableAsked): string[] {
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
