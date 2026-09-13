import type { Node, NodeProps } from '@xyflow/react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { RunSummary } from '@/lib/api';
import { duration } from '@/lib/canvas';
import { repoName, titleOf } from '@/lib/factory';
import { useNow } from '@/lib/useNow';
import { StatusChip } from './StatusChip';

/** `finished` is a run not in flight: on the floor only when finished runs are asked for, and dimmed. */
export type RunNodeData = { run: RunSummary; finished: boolean };
export type RunFlowNode = Node<RunNodeData, 'run'>;

/**
 * One run on the Factory floor: what was asked, where, what each step is doing, and for how long.
 *
 * `w-72` is narrower than the grid's cell, which leaves the gap between cards.
 */
export function RunNode({ data: { run, finished } }: NodeProps<RunFlowNode>) {
  // Every second while the run is in flight; a finished run's "started … ago" moves slowly.
  const now = useNow(finished ? 30_000 : 1_000);
  const cancelled = run.cancelledAt !== null;
  const title = titleOf(run);
  const since = duration(now - Date.parse(run.createdAt));

  return (
    <Card size="sm" className={`w-72 shadow-sm transition-opacity ${finished ? 'opacity-50 hover:opacity-80' : ''}`}>
      <div className="min-w-0 px-3">
        <p className="truncate text-sm font-semibold" title={title}>
          {title}
        </p>
        <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-mono" title={run.id}>
            {run.id}
          </span>
          <span className="shrink-0" title={run.repo}>
            {repoName(run.repo)}
          </span>
        </p>
      </div>

      <ul aria-label="Steps" className="flex flex-wrap gap-x-2.5 gap-y-1 px-3 text-[11px]">
        {run.steps.map((step) => (
          <li key={step.name} className="flex min-w-0 items-center gap-1">
            <span className="truncate text-muted-foreground">{step.name}</span>
            <StatusChip status={step.status} runCancelled={cancelled} />
          </li>
        ))}
      </ul>

      <div className="flex min-h-6 items-center justify-between gap-2 border-t px-3 pt-2">
        <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString()} className="font-mono text-[11px] text-muted-foreground">
          {finished ? `started ${since} ago` : `${since} since it started`}
        </time>
        <span className="flex gap-1">
          {run.waitingOnYou.length > 0 && (
            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">waiting on you</Badge>
          )}
          {cancelled && <Badge variant="outline">cancelled</Badge>}
        </span>
      </div>
    </Card>
  );
}
