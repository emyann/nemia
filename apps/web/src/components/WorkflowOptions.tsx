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
  'block w-full rounded border border-outline bg-background px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';
