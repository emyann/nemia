/**
 * An agent's list field as the render writes it into a factory's tree (the contract `shared-lines.contract.ts`): its own lines and the
 * lines of each template file a `{ path }` item names, in their places, each line once. Pure: the store reads each named file
 * (`sharedLinesOf`, template.store.ts), and the lint refuses one that is no list of strings before the render hands its lines in.
 */
import type { ListItem, OnceEach, WithSharedLines } from '../../contracts/shared-lines.contract.ts';
import { isPathItem } from './layout.ts';

/** `lines` with each line kept at its first place and left out after it. */
export const onceEach: OnceEach = (lines) => lines.filter((line, i) => !lines.slice(0, i).includes(line));

/** The list `items` with each `{ path }` item replaced by the lines `linesOf` holds for its file, a line already written left out. */
export const withSharedLines: WithSharedLines = (items, linesOf) =>
  onceEach(items.flatMap((item) => ('path' in item ? (linesOf[item.path] ?? []) : [item.line])));

/** The items of a list field as `withSharedLines` takes them: a string as its own `{ line }`, a `{ path }` as it is; anything else none. */
export const listItemsOf = (value: readonly unknown[]): ListItem[] =>
  value.flatMap((item): ListItem[] => (typeof item === 'string' ? [{ line: item }] : isPathItem(item) ? [{ path: item.path }] : []));
