import type { WorkflowRow } from '../../lib/api/workflows.ts';
import { unreadWorkflows, workflowKey } from '../../lib/inbox';
import { Body } from '@/components/ui/ds';

/**
 * The workflows a list leaves out, each by name with why it does not read; nothing when every one reads. Drawn as
 * what a person weighs: the workflow is theirs to correct before it is offered.
 */
export function WorkflowsUnread({ workflows }: { workflows: readonly WorkflowRow[] }) {
  const unread = unreadWorkflows(workflows);
  if (unread.length === 0) return null;
  return (
    <Body size="small" component="div" data-workflows-unread className="space-y-1 text-yours">
      <p>Not offered until {unread.length === 1 ? 'it reads' : 'they read'}:</p>
      {unread.map((w) => (
        <p key={workflowKey(w)} data-unread={w.name} className="whitespace-pre-wrap break-words">
          <span className="font-mono">{w.name}</span>
          {w.from === 'user' ? ' (yours)' : ''}: {w.error}
        </p>
      ))}
    </Body>
  );
}
