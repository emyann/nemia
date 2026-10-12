import type { WorkflowListing } from '../lib/api';
import { workflowKey } from '../lib/inbox';

/** The workflows a card can name, as a select's options: those that read, in the order listed, yours marked, each by `workflowKey`. */
export function WorkflowOptions({ workflows }: { workflows: readonly WorkflowListing[] }) {
  return workflows
    .filter((w) => w.error === null)
    .map((w) => (
      <option key={workflowKey(w)} value={workflowKey(w)}>
        {w.name}
        {w.from === 'yours' ? ' (yours)' : ''}
      </option>
    ));
}

/** A select's field, as the inbox draws its inputs. */
export const FIELD =
  'block w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-400';
