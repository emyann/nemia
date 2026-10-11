"use client";

import {
  Cell as AriaCell,
  type CellProps as AriaCellProps,
  Collection,
  Column as AriaColumn,
  type ColumnProps as AriaColumnProps,
  Row as AriaRow,
  type RowProps as AriaRowProps,
  Table as AriaTable,
  TableBody as AriaTableBody,
  type TableBodyProps as AriaTableBodyProps,
  TableFooter as AriaTableFooter,
  type TableFooterProps as AriaTableFooterProps,
  TableHeader as AriaTableHeader,
  type TableHeaderProps as AriaTableHeaderProps,
  type TableProps as AriaTableProps,
  composeRenderProps,
  useTableOptions,
} from "react-aria-components";

import { Checkbox } from "./Checkbox";
import { ChevronDownIcon } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { cn, focusRing, tv } from "../utils";

/**
 * Data table on React Aria `Table`: keyboard-navigable grid, optional
 * sorting (`sortDescriptor` / `onSortChange`, `allowsSorting` per column)
 * and row selection (`selectionMode`, a leading checkbox column is added
 * for you), empty state via `renderEmptyState`.
 *
 *   <Table aria-label="Users" sortDescriptor={sort} onSortChange={setSort}>
 *     <TableHeader>
 *       <Column id="name" isRowHeader allowsSorting>Name</Column>
 *       <Column id="email">Email</Column>
 *       <Column id="action" align="end">Action</Column>
 *     </TableHeader>
 *     <TableBody items={users}>
 *       {(user) => (
 *         <Row>
 *           <Cell>{user.name}</Cell>
 *           <Cell>{user.email}</Cell>
 *           <Cell align="end"><Button variant="text">Remove</Button></Cell>
 *         </Row>
 *       )}
 *     </TableBody>
 *   </Table>
 *
 * Material 3 publishes no data-table page (the M2 spec is the last one), so
 * the measurements are M2's carried onto M3 roles: 56dp header row with
 * label-large headers in `on-surface-variant`, 52dp body rows in
 * body-medium `on-surface`, 16dp cell padding, 1px `outline-variant`
 * dividers, rows on `surface`; the header cell and the row take the kit's
 * focus ring, interactive rows (selectable, or with `onRowAction`) show the
 * `on-surface` state layer at 8 / 10 % and selected rows sit on
 * `secondary-container` — the same states as `ListItem`. Wrap it in a
 * `Card` for an outlined container.
 */
const styles = tv({
  slots: {
    table: "w-full border-collapse text-on-surface",
    header: "",
    column: [
      focusRing(),
      "h-14 px-4 text-start align-middle text-label-large text-on-surface-variant",
      "border-b border-outline-variant",
    ],
    columnContent: "flex items-center gap-1",
    sortIcon:
      "size-[18px] shrink-0 opacity-0 transition-transform duration-short-4 group-data-[sort-direction]/column:opacity-100 group-data-[sort-direction=ascending]/column:rotate-180",
    body: "",
    row: [
      focusRing(),
      "group/row relative h-[52px] border-b border-outline-variant bg-surface text-body-medium transition-colors duration-short-4 -outline-offset-2",
      "data-[href]:cursor-pointer data-selected:bg-secondary-container data-selected:text-on-secondary-container",
      "data-[interactive]:hover:bg-on-surface/8 data-[interactive]:data-pressed:bg-on-surface/10 data-[interactive]:data-focus-visible:bg-on-surface/10",
      "data-disabled:text-on-surface/38",
    ],
    cell: [focusRing(), "px-4 align-middle -outline-offset-2"],
    footer: "text-label-large text-on-surface",
  },
  variants: {
    align: {
      start: { column: "text-start", cell: "text-start" },
      center: { column: "text-center", cell: "text-center" },
      end: { column: "text-end", cell: "text-end" },
    },
  },
  defaultVariants: { align: "start" },
});

export type TableProps = Omit<AriaTableProps, "className"> & {
  className?: string;
};

export function Table({ className, ...props }: TableProps) {
  const s = styles();
  return (
    <AriaTable
      data-slot="table"
      {...props}
      className={composeTailwindRenderProps(className, s.table())}
    />
  );
}

export type ColumnProps = Omit<AriaColumnProps, "className"> & {
  className?: string;
  /** Text alignment of the column and its cells' default. */
  align?: "start" | "center" | "end";
};

export function Column({ className, align, children, ...props }: ColumnProps) {
  const s = styles({ align });
  return (
    <AriaColumn
      data-slot="table-column"
      {...props}
      className={composeTailwindRenderProps(
        className,
        `group/column ${s.column()}`,
      )}
    >
      {composeRenderProps(children, (children, { allowsSorting }) => (
        <span
          className={s.columnContent({
            className:
              align === "end"
                ? "flex-row-reverse"
                : align === "center"
                  ? "justify-center"
                  : "",
          })}
        >
          <span className="truncate">{children}</span>
          {allowsSorting && (
            <ChevronDownIcon aria-hidden className={s.sortIcon()} />
          )}
        </span>
      ))}
    </AriaColumn>
  );
}

export type TableHeaderProps<T extends object> = Omit<
  AriaTableHeaderProps<T>,
  "className"
> & { className?: string };

export function TableHeader<T extends object>({
  className,
  columns,
  children,
  ...props
}: TableHeaderProps<T>) {
  const { selectionBehavior, selectionMode, allowsDragging } =
    useTableOptions();
  const s = styles();
  return (
    <AriaTableHeader
      data-slot="table-header"
      {...props}
      className={composeTailwindRenderProps(className, s.header())}
    >
      {allowsDragging && <AriaColumn className={s.column()} />}
      {selectionBehavior === "toggle" && (
        <AriaColumn width={56} minWidth={56} className={s.column()}>
          {selectionMode === "multiple" && (
            <Checkbox slot="selection" aria-label="Select all" />
          )}
        </AriaColumn>
      )}
      <Collection items={columns}>{children}</Collection>
    </AriaTableHeader>
  );
}

export type TableBodyProps<T extends object> = Omit<
  AriaTableBodyProps<T>,
  "className"
> & { className?: string };

export function TableBody<T extends object>({
  className,
  ...props
}: TableBodyProps<T>) {
  const s = styles();
  return (
    <AriaTableBody
      data-slot="table-body"
      {...props}
      className={composeTailwindRenderProps(className, s.body())}
    />
  );
}

export type RowProps<T extends object> = Omit<AriaRowProps<T>, "className"> & {
  className?: string;
};

export function Row<T extends object>({
  className,
  columns,
  children,
  ...props
}: RowProps<T>) {
  const { selectionBehavior, selectionMode } = useTableOptions();
  const s = styles();
  const isInteractive =
    selectionMode !== "none" || props.href !== undefined || !!props.onAction;
  return (
    <AriaRow
      data-slot="table-row"
      data-interactive={isInteractive || undefined}
      {...props}
      className={composeTailwindRenderProps(className, s.row())}
    >
      {selectionBehavior === "toggle" && (
        <AriaCell className={s.cell()}>
          <Checkbox slot="selection" aria-label="Select row" />
        </AriaCell>
      )}
      <Collection items={columns}>{children}</Collection>
    </AriaRow>
  );
}

export type CellProps = Omit<AriaCellProps, "className"> & {
  className?: string;
  align?: "start" | "center" | "end";
};

export function Cell({ className, align, ...props }: CellProps) {
  const s = styles({ align });
  return (
    <AriaCell
      data-slot="table-cell"
      {...props}
      className={composeTailwindRenderProps(className, s.cell())}
    />
  );
}

export type TableFooterProps<T extends object> = Omit<
  AriaTableFooterProps<T>,
  "className"
> & { className?: string };

/** A trailing row for totals; render `Row` / `Cell` inside. */
export function TableFooter<T extends object>({
  className,
  ...props
}: TableFooterProps<T>) {
  const s = styles();
  return (
    <AriaTableFooter
      data-slot="table-footer"
      {...props}
      className={cn(s.footer(), className)}
    />
  );
}
