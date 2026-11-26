/**
 * What every kind's table is built of (`kind-table.ts`, `wiring-table.ts`, `definition-table.ts`): a column, a text cut at its first
 * line, a row's object as Kubernetes gives one (`PartialObjectMetadata`, the item's metadata alone), and a page as a `Table`. Pure.
 */
import type { ObjectMeta, Table, TableColumnDefinition, TableColumnType } from 'objects';

/**
 * A column: its name, what it says, its priority (0 shown by default, 1 when asked wide) and the type of its cells, text by default.
 * @param name The column's name, `Name` the one a client takes as the object's.
 * @param description What the column says.
 * @param priority 0 for a column shown by default, 1 for one shown when asked wide.
 * @param type The type of its cells.
 */
export const column = (name: string, description: string, priority: 0 | 1, type: TableColumnType = 'string') =>
  ({
    name,
    type,
    format: name === 'Name' ? 'name' : '',
    description,
    priority,
  }) satisfies TableColumnDefinition;

/**
 * `text` up to its first line's end; `''` for none.
 * @param text The text, null or undefined for none.
 */
export const firstLine = (text: string | null | undefined) => {
  if (!text) return '';
  const at = text.indexOf('\n');
  return at === -1 ? text : text.slice(0, at);
};

/**
 * A row's object, as Kubernetes gives one beside a table's row: the item's metadata alone.
 * @param metadata The item's metadata.
 */
const partialOf = (metadata: ObjectMeta) => ({ kind: 'PartialObjectMetadata', apiVersion: 'meta.k8s.io/v1', metadata });

/**
 * A page as a table: its place (`continue`, and the `resourceVersion` it was read at, where it has one), its columns, and a row per
 * item, its cells by `cells`, its metadata beside them.
 * @param page The page, its items and where it stands.
 * @param columns The table's columns, in the order the cells are.
 * @param cells An item's cells, in the columns' order.
 */
export const tableOf = <Item extends { readonly metadata: ObjectMeta }>(
  page: { readonly metadata: { readonly continue?: string; readonly resourceVersion?: string }; readonly items: readonly Item[] },
  columns: readonly TableColumnDefinition[],
  cells: (item: Item) => readonly unknown[],
) =>
  ({
    kind: 'Table',
    apiVersion: 'meta.k8s.io/v1',
    metadata: {
      ...(page.metadata.continue === undefined ? {} : { continue: page.metadata.continue }),
      ...(page.metadata.resourceVersion === undefined ? {} : { resourceVersion: page.metadata.resourceVersion }),
    },
    columnDefinitions: columns,
    rows: page.items.map((item) => ({ cells: cells(item), object: partialOf(item.metadata) })),
  }) satisfies Table as Table;
