/**
 * The parts the Workflows page's cards and a workflow's own page share: where a workflow is read from, your workflows' folder, and why
 * one has no builder.
 */
import { useSuspenseQuery } from '@tanstack/react-query';
import { storeQuery, type WorkflowListing } from '../lib/api';

/** Where a workflow is read from: yours, or this repository's. */
export function FromBadge({ from }: { from: WorkflowListing['from'] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
        from === 'yours'
          ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300'
      }`}
    >
      {from === 'yours' ? 'yours' : 'this repository'}
    </span>
  );
}

/** Your workflows' folder, as the api answers it (`storeQuery`). */
export function YoursFolder() {
  const { data: store } = useSuspenseQuery(storeQuery);
  return <code className="font-mono text-xs">{store.workflows}/</code>;
}

/**
 * Why `workflow` has no builder, or nothing for one of yours that reads: the board writes only yours, and nothing into a checkout; and the
 * builder puts back the steps a folder reads as, so one of yours that does not read is fixed by hand first.
 */
export function NoBuilder({ workflow: { from, error } }: { workflow: WorkflowListing }) {
  if (from === 'repo')
    return (
      <p data-no-builder className="text-xs text-neutral-500">
        No builder: the board writes only yours, and nothing into this checkout. To build it, copy the folder into <YoursFolder />, build it
        there, and copy it back into the repository by hand.
      </p>
    );
  if (!error) return null;
  return (
    <p data-no-builder className="text-xs text-neutral-500">
      No builder until the folder reads: the builder puts back the steps a folder reads as. Fix its files by hand first.
    </p>
  );
}
