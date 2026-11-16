"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  Button as AriaButton,
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  TreeItemContent as AriaTreeItemContent,
  type TreeItemProps as AriaTreeItemProps,
  type TreeProps as AriaTreeProps,
} from "react-aria-components";

import { ChevronRightIcon, renderIcon, type IconProp } from "../icons";
import { composeTailwindRenderProps } from "../render-props";
import { focusRing, tv } from "../utils";
import { Checkbox } from "./Checkbox";

// What a drag shows, as in `GridList`: a 2dp `primary` line where a drop
// will land between two rows, and the drop zone's outline and tint on a row
// or a tree that is dropped onto.
const dropLine =
  "[&_.react-aria-DropIndicator[data-drop-target]]:outline-1 [&_.react-aria-DropIndicator[data-drop-target]]:outline-solid [&_.react-aria-DropIndicator[data-drop-target]]:outline-primary";
const droppedOnto =
  "data-drop-target:outline-2 data-drop-target:-outline-offset-2 data-drop-target:outline-solid data-drop-target:outline-primary data-drop-target:bg-primary/8";

const styles = tv({
  slots: {
    tree: [
      "relative flex flex-col overflow-auto outline-none",
      dropLine,
      droppedOnto,
    ],
    item: [
      focusRing(),
      droppedOnto,
      "group/tree-item relative flex cursor-default items-center text-on-surface -outline-offset-2",
      "data-[href]:cursor-pointer data-selected:bg-secondary-container data-selected:text-on-secondary-container",
      "data-disabled:text-on-surface/38",
    ],
    // The row: 16dp at each side, and 24dp more at the start for each level
    // below the first.
    row: "relative flex min-h-14 w-full items-center gap-2 pe-4 ps-[calc(1rem+(var(--tree-item-level)-1)*1.5rem)]",
    stateLayer: [
      "pointer-events-none absolute inset-0 bg-on-surface opacity-0 transition-opacity duration-short-4",
      "group-data-hovered/tree-item:state-opacity-hover group-data-focus-visible/tree-item:state-opacity-focus group-data-pressed/tree-item:state-opacity-pressed",
      "group-data-disabled/tree-item:hidden",
    ],
    // The control that opens and closes a level: 24dp drawn, and the row is
    // its target for the pointer (a press on the row's arrow keys open it).
    chevron: [
      focusRing(),
      "relative flex size-6 shrink-0 items-center justify-center rounded-shape-full text-on-surface-variant",
      "group-data-disabled/tree-item:text-on-surface/38",
    ],
    chevronIcon:
      "transition-transform duration-short-4 group-data-expanded/tree-item:rotate-90 rtl:-scale-x-100 rtl:group-data-expanded/tree-item:-rotate-90",
    spacer: "size-6 shrink-0",
    icon: "relative flex shrink-0 text-on-surface-variant group-data-selected/tree-item:text-on-secondary-container group-data-disabled/tree-item:text-on-surface/38",
    title: "relative min-w-0 flex-1 truncate text-body-large font-body-large",
    trailing: "relative flex shrink-0 items-center",
  },
  variants: {
    density: {
      default: {},
      dense: { row: "min-h-10" },
    },
  },
});

type TreeDensity = "default" | "dense";
const TreeDensityContext = createContext<TreeDensity>("default");

export type TreeProps<T extends object> = Omit<AriaTreeProps<T>, "className"> & {
  /** `dense` draws 40dp rows, the kit's own measure, for a tree of many
   *  levels beside other content. Default: Material's 56dp. */
  density?: TreeDensity;
  className?: string;
};

/**
 * A hierarchy a person opens level by level: folders and files, sections
 * and pages, categories. On React Aria `Tree`.
 *
 *   <Tree aria-label="Files" selectionMode="single">
 *     <TreeItem id="finance" title="Finance" icon={FolderIcon}>
 *       <TreeItem id="invoices" title="Invoices" icon={FolderIcon}>
 *         <TreeItem id="nov" title="November.pdf" />
 *       </TreeItem>
 *     </TreeItem>
 *     <TreeItem id="design" title="Design" icon={FolderIcon} />
 *   </Tree>
 *
 * It needs a name (`aria-label`). The arrow keys move between rows; Right
 * opens a level and Left closes it, or goes to its parent; typing a name's
 * first letters goes to it. `selectionMode` (`"single"`, `"multiple"`) makes
 * rows selected, with `selectedKeys` and `onSelectionChange`; `onAction`
 * is the row's own action (open a file). `expandedKeys`, `defaultExpandedKeys`
 * and `onExpandedChange` hold what is open. With `items` and a function it
 * renders a tree that is data: give each `TreeItem` its children with React
 * Aria's `Collection` (`<Collection items={item.children}>`).
 * `dragAndDropHooks` is React Aria's, as on `GridList`.
 *
 * Material 3 does not describe this component. What it borrows:
 *
 * - **The row**: https://m3.material.io/components/lists/specs — a list
 *   item's: 56dp, body-large on `on-surface`, a 24dp leading icon in
 *   `on-surface-variant`, 16dp at each side, selected on
 *   `secondary-container`, disabled at 38%, the `on-surface` state layer.
 * - **The levels**: 24dp of indent a level, an icon's width, so a level's
 *   text starts under its parent's icon.
 * - **Right to left**: https://m3.material.io/foundations/layout/bidirectionality-rtl
 *   — the indent and the chevron are mirrored.
 */
export function Tree<T extends object>({
  density = "default",
  className,
  ...props
}: TreeProps<T>) {
  return (
    <TreeDensityContext.Provider value={density}>
      <AriaTree
        data-slot="tree"
        data-density={density}
        {...props}
        className={composeTailwindRenderProps(className, styles().tree())}
      />
    </TreeDensityContext.Provider>
  );
}

export type TreeItemProps = Omit<
  AriaTreeItemProps,
  "className" | "children" | "textValue"
> & {
  /** The row's name. A string is also what typing looks for; give
   *  `textValue` with any other node. */
  title: ReactNode;
  textValue?: string;
  /** A 24dp icon before the name. */
  icon?: IconProp;
  /** Anything after the name: a count, a tag, an icon button. */
  trailingElement?: ReactNode;
  /** The level under this row: more `TreeItem`s, or a `Collection`. */
  children?: ReactNode;
  className?: string;
};

/**
 * One row of a `Tree`, and the level under it. A row with children draws
 * the control that opens it; `hasChildItems` draws it for a level that is
 * loaded when it is opened. A row that is a link takes `href`; inside a
 * client-side router, navigate from the tree's `onAction` instead.
 *
 * In a tree where several rows are selected (`selectionMode="multiple"`,
 * with React Aria's default `selectionBehavior="toggle"`), each row draws the
 * kit's `Checkbox`. A single selection is shown by the row alone, on
 * `secondary-container`; so is a multiple one with
 * `selectionBehavior="replace"`, where a press selects and Shift or Ctrl
 * extends.
 *
 * Material 3 does not describe this component; `Tree` says what it is built
 * from instead.
 */
export function TreeItem({
  title,
  textValue,
  icon,
  trailingElement,
  children,
  className,
  ...props
}: TreeItemProps) {
  const density = useContext(TreeDensityContext);
  const s = styles({ density });
  return (
    <AriaTreeItem
      data-slot="tree-item"
      textValue={textValue ?? (typeof title === "string" ? title : "")}
      {...props}
      className={composeTailwindRenderProps(className, s.item())}
    >
      <AriaTreeItemContent>
        {({ hasChildItems, selectionMode, selectionBehavior }) => (
          <div data-slot="tree-item-row" className={s.row()}>
            <div data-slot="state-layer" className={s.stateLayer()} />
            {hasChildItems ? (
              <AriaButton slot="chevron" className={s.chevron()}>
                <ChevronRightIcon size={20} className={s.chevronIcon()} />
              </AriaButton>
            ) : (
              <span className={s.spacer()} />
            )}
            {selectionMode === "multiple" && selectionBehavior === "toggle" && (
              <Checkbox slot="selection" />
            )}
            {icon && (
              <span data-slot="tree-item-icon" className={s.icon()}>
                {renderIcon(icon, 24)}
              </span>
            )}
            <span data-slot="tree-item-title" className={s.title()}>
              {title}
            </span>
            {trailingElement && (
              <span data-slot="tree-item-trailing" className={s.trailing()}>
                {trailingElement}
              </span>
            )}
          </div>
        )}
      </AriaTreeItemContent>
      {children}
    </AriaTreeItem>
  );
}
