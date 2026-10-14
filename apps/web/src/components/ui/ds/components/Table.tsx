"use client";

import {
  Cell as AriaCell,
  type CellProps as AriaCellProps,
  Collection,
  CollectionRendererContext,
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
  TableStateContext,
  composeRenderProps,
  useTableOptions,
} from "react-aria-components";

import {
  createContext,
  type ReactNode,
  type Ref,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { Checkbox } from "./Checkbox";
import { Tooltip } from "./Tooltip";
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
 *           <Cell><Button variant="text">Remove</Button></Cell>
 *         </Row>
 *       )}
 *     </TableBody>
 *   </Table>
 *
 * Material 3 does not describe this component. It publishes no data-table page (the
 * M2 spec is the last one), so
 * the measurements are M2's carried onto M3 roles: 56dp header row with
 * label-large headers in `on-surface-variant`, 52dp body rows in
 * body-medium `on-surface`, 16dp cell padding, 1px `outline-variant`
 * dividers, rows on `surface`; the header cell and the row take the kit's
 * focus ring, interactive rows (selectable, or with `onRowAction`) show the
 * `on-surface` state layer at 8 / 10 % and selected rows sit on
 * `secondary-container` — the same states as `ListItem`. Wrap it in a
 * `Card` for an outlined container.
 *
 * **Alignment.** A `Column`'s `align` is its heading's and the default of
 * every cell under it; a `Cell`'s own `align` wins. With `allowsDragging` the
 * header gains a column the rows do not, so the default lands one cell off:
 * say `align` on the cells of a draggable table.
 *
 * **Density.** `<Table density="dense">` draws 40dp rows under a 44dp header,
 * the kit's own measures; a `Row`'s `className="h-…"` still wins. A 40dp row
 * holds an `xsmall` icon button, whose target it cuts to 48 by 40.
 *
 * **Edge.** The table clips at its own edge (`overflow-clip`): a control's
 * touch target that reaches under the last row is cut there, so the table's
 * content is never taller than the table and a box that scrolls it sideways
 * does not scroll upright too. A header, a row and a cell draw their focus
 * ring inside for the same reason.
 *
 * **Last row's line.** Every row draws a line under it. A table that closes
 * with an edge of the project's own (a frame, a card's border) says
 * `<Table showLastRowDivider={false}>` and the table's closing line is not
 * drawn: the footer's row when a `TableFooter` follows, otherwise the last
 * row of the body. The line between the body and a footer stays, since it
 * separates the total from the data, and so does the header's.
 *
 * **Cut cells.** `<Cell truncate>` cuts its text to one line. When the text is
 * really cut, the whole of it shows in a rich `Tooltip` while the pointer
 * rests on the cell (300 ms) or the keyboard is on it (arrow keys). It stays
 * 1.5 seconds after the pointer leaves and while the pointer is on it, and
 * Escape puts it away, that Escape going no further. One cut cell's
 * tooltip shows at a time: the next to open puts the last away. That count
 * is the table's own, apart from `TooltipTrigger`'s, so for up to 1.5
 * seconds a cut cell's tooltip can show beside the tooltip of a control in
 * the same row. A screen reader reads the whole text from the cell. A
 * touch screen shows no tooltip. A cut cell takes the width its column is
 * given and no more: give the `Column` one (`className="w-64"`, or `w-full`
 * for the column that takes what is left). A cell that holds more than text
 * (a value and a control) is the project's composition.
 *
 * Parts, each with its `data-slot` and its key in `classNames`: on `Column`,
 * `columnContent` (`table-column-content`) and `sortIcon`
 * (`table-sort-icon`); on `Cell`, `cellText` (`table-cell-text`, drawn when
 * `truncate` is set). The roots are `table` (with `data-density`),
 * `table-header`, `table-column`, `table-body`, `table-row`, `table-cell` and
 * `table-footer`, and each takes `className`.
 */
const styles = tv({
  slots: {
    table: "w-full border-collapse overflow-clip text-on-surface",
    header: "",
    column: [
      focusRing(),
      "h-14 px-4 text-start align-middle text-label-large font-label-large text-on-surface-variant",
      "border-b border-outline-variant -outline-offset-2",
    ],
    columnContent: "flex items-center gap-1",
    sortIcon:
      "inline-flex size-[18px] shrink-0 opacity-0 transition-transform duration-short-4 group-data-[sort-direction]/column:opacity-100 group-data-[sort-direction=ascending]/column:rotate-180",
    body: "",
    row: [
      focusRing(),
      "group/row relative h-[52px] border-b border-outline-variant bg-surface text-body-medium font-body-medium transition-colors duration-short-4 -outline-offset-2",
      "data-[href]:cursor-pointer data-selected:bg-secondary-container data-selected:text-on-secondary-container",
      "data-[interactive]:hover:bg-on-surface/8 data-[interactive]:data-pressed:bg-on-surface/10 data-[interactive]:data-focus-visible:bg-on-surface/10",
      "data-disabled:text-on-surface/38",
    ],
    cell: [focusRing(), "px-4 align-middle -outline-offset-2"],
    cellText: "block truncate",
    footer: "text-label-large font-label-large text-on-surface",
  },
  variants: {
    align: {
      start: { column: "text-start", cell: "text-start" },
      center: { column: "text-center", cell: "text-center" },
      end: { column: "text-end", cell: "text-end" },
    },
    density: {
      default: {},
      dense: { column: "h-11", row: "h-10" },
    },
    showLastRowDivider: {
      true: {},
      // The last row of the table's last section: a footer's, or the body's.
      false: { row: "[:last-child>&]:last:border-b-0" },
    },
    // A cut cell takes no width of its own: its column's decides.
    truncate: {
      true: { cell: "max-w-0" },
    },
  },
});

type TableAlign = "start" | "center" | "end";
type TableDensity = "default" | "dense";

/** The table's density, for the rows and the header cells under it. */
const TableDensityContext = createContext<TableDensity>("default");

/** Whether the table's last row draws its line, for the rows under it. */
const TableLastRowDividerContext = createContext(true);

export type TableProps = Omit<AriaTableProps, "className"> & {
  className?: string;
  /** `dense` draws 40dp rows under a 44dp header. Default 52dp under 56dp. */
  density?: TableDensity;
  /**
   * `false` leaves the table's last row without its line: the footer's when
   * a `TableFooter` follows, otherwise the body's. Default `true`.
   */
  showLastRowDivider?: boolean;
};

export function Table({
  className,
  density = "default",
  showLastRowDivider = true,
  ...props
}: TableProps) {
  const s = styles();
  return (
    <TableDensityContext.Provider value={density}>
      <TableLastRowDividerContext.Provider value={showLastRowDivider}>
        <AriaTable
          data-slot="table"
          data-density={density}
          {...props}
          className={composeTailwindRenderProps(className, s.table())}
        />
      </TableLastRowDividerContext.Provider>
    </TableDensityContext.Provider>
  );
}

export type ColumnProps = Omit<AriaColumnProps, "className"> & {
  className?: string;
  /** Text alignment of the column and its cells' default. */
  align?: TableAlign;
  /** Classes for the named parts. */
  classNames?: {
    columnContent?: string;
    sortIcon?: string;
  };
};

export function Column({
  className,
  classNames,
  align,
  children,
  ...props
}: ColumnProps) {
  const density = useContext(TableDensityContext);
  const s = styles({ align: align ?? "start", density });
  return (
    <AriaColumn
      data-slot="table-column"
      // Read back by the cells under this column, which do not know it.
      data-align={align}
      {...props}
      className={composeTailwindRenderProps(
        className,
        `group/column ${s.column()}`,
      )}
    >
      {composeRenderProps(children, (children, { allowsSorting }) => (
        <span
          data-slot="table-column-content"
          className={s.columnContent({
            className: cn(
              align === "end"
                ? "flex-row-reverse"
                : align === "center"
                  ? "justify-center"
                  : "",
              classNames?.columnContent,
            ),
          })}
        >
          <span className="truncate">{children}</span>
          {allowsSorting && (
            <span
              aria-hidden
              data-slot="table-sort-icon"
              className={s.sortIcon({ className: classNames?.sortIcon })}
            >
              <ChevronDownIcon className="size-full" />
            </span>
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
  const density = useContext(TableDensityContext);
  const s = styles({ align: "start", density });
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
  const density = useContext(TableDensityContext);
  const showLastRowDivider = useContext(TableLastRowDividerContext);
  const s = styles({ density, showLastRowDivider });
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

/**
 * React Aria's cell props without `render`: `Cell` places its own element
 * (`CellElement`, which carries the column's alignment), so a caller's
 * `render` would be dropped. The type refuses it instead.
 */
export type CellProps = Omit<AriaCellProps, "className" | "render"> & {
  className?: string;
  /** Text alignment. Left out, the cell takes its column's. */
  align?: TableAlign;
  /**
   * Cuts the text to one line. The whole text shows in a tooltip when the
   * pointer rests on the cell or the keyboard is on it.
   */
  truncate?: boolean;
  /** Classes for the named parts. */
  classNames?: {
    cellText?: string;
  };
};

export function Cell({
  className,
  classNames,
  align,
  truncate,
  children,
  ...props
}: CellProps) {
  const s = styles({ align, truncate });
  return (
    <AriaCell
      data-slot="table-cell"
      {...props}
      className={composeTailwindRenderProps(className, s.cell())}
      render={(domProps, { columnIndex }) => (
        <CellElement
          {...(domProps as CellElementProps)}
          columnIndex={columnIndex}
        />
      )}
    >
      {composeRenderProps(children, (children, { isHovered, isFocusVisible }) =>
        truncate ? (
          <CellText
            className={s.cellText({ className: classNames?.cellText })}
            isHovered={isHovered}
            isFocusVisible={isFocusVisible}
          >
            {children}
          </CellText>
        ) : (
          children
        ),
      )}
    </AriaCell>
  );
}

type CellElementProps = React.ComponentPropsWithoutRef<"td"> & {
  ref?: Ref<HTMLTableCellElement>;
  columnIndex?: number | null;
};

/**
 * The cell's element. `Cell` itself runs where React Aria builds its
 * collection, and knows no column there; this is drawn in the table, where
 * the column's `align` can be read. The cell's own classes come after it, so
 * an `align` or a `className` said on the cell wins.
 */
function CellElement({ columnIndex, className, ...props }: CellElementProps) {
  const state = useContext(TableStateContext);
  const { isVirtualized } = useContext(CollectionRendererContext);
  const column =
    columnIndex == null ? undefined : state?.collection.columns[columnIndex];
  const align = (column?.props as { "data-align"?: TableAlign } | undefined)?.[
    "data-align"
  ];
  const Element = (isVirtualized ? "div" : "td") as "td";
  return (
    <Element
      {...props}
      className={cn(align && styles({ align }).cell(), className)}
    />
  );
}

/** The delays of a hovered cut cell's tooltip: `TooltipTrigger`'s. */
const CUT_TEXT_DELAY = 300;
const CUT_TEXT_CLOSE_DELAY = 1500;

/**
 * Puts away the cut cell's tooltip that shows, if one does: one at a time, as
 * under a `TooltipTrigger`, since each now outlasts the pointer.
 */
let closeShownCellText: (() => void) | null = null;

type CellTextProps = {
  children: ReactNode;
  className: string;
  isHovered: boolean;
  isFocusVisible: boolean;
};

/**
 * A cut cell's text. The cell keeps the focus and its role, so the tooltip is
 * driven from the cell's own states rather than by a trigger inside it, and
 * it shows only when the text is really cut. It behaves as a tooltip under a
 * `TooltipTrigger` does: it stays 1.5 seconds after the pointer leaves, and
 * while the pointer is on it, so the text can be reached and selected.
 */
function CellText({
  children,
  className,
  isHovered,
  isFocusVisible,
}: CellTextProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [isOpen, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const wasHovered = useRef(false);
  const isTooltipHovered = useRef(false);

  const closeNow = useCallback(() => {
    clearTimeout(timer.current);
    setOpen(false);
  }, []);

  const schedule = useCallback(
    (open: boolean, delay: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        const text = ref.current;
        const shows = open && !!text && text.scrollWidth > text.clientWidth;
        if (shows && closeShownCellText !== closeNow) {
          closeShownCellText?.();
          closeShownCellText = closeNow;
        } else if (!shows && closeShownCellText === closeNow) {
          closeShownCellText = null;
        }
        setOpen(shows);
      }, delay);
    },
    [closeNow],
  );

  useEffect(
    () => () => {
      if (closeShownCellText === closeNow) closeShownCellText = null;
    },
    [closeNow],
  );

  useEffect(() => {
    if (isFocusVisible) schedule(true, 0);
    else if (isHovered) schedule(true, CUT_TEXT_DELAY);
    // Left by the pointer, the tooltip waits to be reached; left by the
    // keyboard, it goes at once.
    else schedule(false, wasHovered.current ? CUT_TEXT_CLOSE_DELAY : 0);
    wasHovered.current = isHovered;
    return () => clearTimeout(timer.current);
  }, [isHovered, isFocusVisible, schedule]);

  // The tooltip asks to open when the pointer comes onto it and to close when
  // it leaves; it also asks to close when the page scrolls under it.
  const onOpenChange = (open: boolean) => {
    if (open) {
      isTooltipHovered.current = true;
      clearTimeout(timer.current);
    } else {
      schedule(false, isTooltipHovered.current ? CUT_TEXT_CLOSE_DELAY : 0);
      isTooltipHovered.current = false;
    }
  };

  // Escape puts the tooltip away until the cell is left: React Aria listens
  // for it on a trigger, and this tooltip has none. As there, that Escape is
  // the tooltip's alone: it does not go on to clear the table's selection or
  // close a dialog around it.
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      closeNow();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen, closeNow]);

  return (
    <>
      <span ref={ref} data-slot="table-cell-text" className={className}>
        {children}
      </span>
      <Tooltip
        variant="rich"
        triggerRef={ref}
        isOpen={isOpen}
        onOpenChange={onOpenChange}
      >
        {children}
      </Tooltip>
    </>
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
