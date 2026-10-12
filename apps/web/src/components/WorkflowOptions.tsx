import type { WorkflowListing } from '../lib/api';
import { unreadWorkflows, workflowKey } from '../lib/inbox';

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

/**
 * The workflows `WorkflowOptions` leaves out of the list, each by name with why it does not read; nothing when every one reads. Drawn as
 * what a person weighs: the workflow is theirs to correct before it is offered.
 */
export function WorkflowsUnread({ workflows }: { workflows: readonly WorkflowListing[] }) {
  const unread = unreadWorkflows(workflows);
  if (unread.length === 0) return null;
  return (
    <div data-workflows-unread className="space-y-1 text-body-small text-yours">
      <p>Not offered until {unread.length === 1 ? 'it reads' : 'they read'}:</p>
      {unread.map((w) => (
        <p key={workflowKey(w)} data-unread={w.name} className="whitespace-pre-wrap break-words">
          <span className="font-mono">{w.name}</span>
          {w.from === 'yours' ? ' (yours)' : ''}: {w.error}
        </p>
      ))}
    </div>
  );
}

/** A select's field, as the inbox draws its inputs. */
export const FIELD =
  'block w-full rounded border border-outline bg-background px-2 py-1.5 text-body-medium placeholder:text-muted-foreground focus:border-on-surface-variant focus:outline-none';
