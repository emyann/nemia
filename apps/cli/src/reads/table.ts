/**
 * A list as the server prints it (`objects`' `Table`, Kubernetes' server-side printing, fc2e): the columns of priority 0, every column
 * with `-o wide`, the `Labels` column with `--show-labels`, and a column per `-L <key>` read off each row's object's labels, as `kubectl
 * get` prints them — each column's name in capitals over its cells, padded to the widest, three spaces apart. The client keeps no
 * printer of a list of its own: what a column says and how a cell reads are the server's. Pure.
 */
import { Schema } from 'effect';
import { TABLE_ACCEPT, type Table } from 'objects';
import { Refused } from '../refused.ts';

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

/** The lines of `table` as `asked`: its header, then a line per row; no line where it has no row. */
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

/**
 * The words of `args` that ask how a table prints: `-o wide` (or `--output wide`) and `--show-labels`, and `-L <key>`, given again for
 * another; `-l <selector>`, given again for another, the selectors to send. The words left (`rest`), or null where a flag has no word
 * after it, or `-o` names another output, which the old path refuses in its own words.
 */
export function tableAsked(args: readonly string[]): { rest: string[]; selector: string[]; asked: TableAsked } | null {
  const selector: string[] = [];
  const columns: string[] = [];
  const rest: string[] = [];
  let wide = false;
  let showLabels = false;
  for (let at = 0; at < args.length; at++) {
    const word = args[at] ?? '';
    if (word === '--show-labels') showLabels = true;
    else if (word === '-l' || word === '-L' || word === '-o' || word === '--output') {
      const value = args[++at];
      if (value === undefined) return null;
      if (word === '-l') selector.push(value);
      else if (word === '-L') columns.push(value);
      else if (value === 'wide') wide = true;
      else return null;
    } else rest.push(word);
  }
  return { rest, selector, asked: { wide, showLabels, columns } };
}

/**
 * A list asked for its `Table`, of the read `verb` names: the table, or a refusal where the api answered the list's objects instead, an
 * api older than this client.
 */
export function tableOf<L extends object>(verb: string, listed: L | Table): Table {
  if ('columnDefinitions' in listed) return listed;
  throw new Refused(
    `the daemon answered nemia ${verb} a list where this nemia asked for its table: it is older than this nemia. Restart it, \`nemia service restart\`, or read in process: \`nemia ${verb} … --local\``,
  );
}

/** The `Accept` that asks a list for its `Table`. */
export const AS_TABLE = { accept: TABLE_ACCEPT };
