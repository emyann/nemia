import { useMemo } from 'react';

/**
 * A value that keeps its identity from one render to the next while its content stays the same, so a memo or an effect can list it
 * as it is and run again only when what it holds changes: the ids of the runs on the floor, rebuilt from every refetch of the list.
 *
 * For plain data only — strings, numbers, booleans, null, and arrays and objects of them: what is handed back is a copy read back from
 * JSON, so a Map, a Date, a function or an `undefined` in it is lost. Build a Map from the entries this keeps (`useMemo` on them).
 */
export function useContent<T>(value: T): T {
  const content = JSON.stringify(value);
  return useMemo(() => JSON.parse(content) as T, [content]);
}
