/**
 * A list as a table, as Kubernetes' server-side printing answers one (`meta.k8s.io/v1` `Table`): the columns a client prints, each with
 * its type and its priority (0 shown by default, higher only when asked wide), and a row per item, its cells in the columns' order, the
 * item itself beside them where the server gives it. A client asks for it with the `Accept` header Kubernetes' clients send
 * (`TABLE_ACCEPT`), and a list endpoint that answers one declares `Schema.Union([<Kind>List, Table])` as its success, so neither the
 * board nor the cli keeps a printer of its own.
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
