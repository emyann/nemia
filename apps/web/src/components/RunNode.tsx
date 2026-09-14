import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { ChevronRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { decisionQuery, type RunSummary } from '@/lib/api';
import { needLine, needsOf } from '@/lib/asks';
import { duration } from '@/lib/canvas';
import { decisionStamp, isDecidable, touchedSummary } from '@/lib/decide';
import { repoName, titleOf, waitsOnYou } from '@/lib/factory';
import { useNow } from '@/lib/useNow';
import { StatusChip } from './StatusChip';

/**
 * `finished` is a run not in flight: on the floor only when finished runs are asked for, and dimmed.
 * `open` is a run whose graph is unfolded beside its card: `reading` while its steps are read, and
 * `trouble` says why they could not be drawn. `onToggle` opens or closes it.
 */
export type RunNodeData = {
  run: RunSummary;
  finished: boolean;
  open: boolean;
  reading: boolean;
  trouble: string | null;
  onToggle: (runId: string) => void;
};
export type RunFlowNode = Node<RunNodeData, 'run'>;

/**
 * One run on the Factory floor: what was asked, where, what each step is doing, and for how long.
 *
 * The head of the run's graph: the chevron, or a click anywhere on the card, unfolds its steps to the
 * right, and the title opens the run's page. `w-72` is `CARD_WIDTH`, narrower than the grid's cell,
 * which leaves the gap between cards.
 */
export function RunNode({ data: { run, finished, open, reading, trouble, onToggle } }: NodeProps<RunFlowNode>) {
  // Every second while the run is in flight; a finished run's "started … ago" moves slowly.
  const now = useNow(finished ? 30_000 : 1_000);
  const cancelled = run.cancelledAt !== null;
  const title = titleOf(run);
  const needs = needsOf(run);
  const since = duration(now - Date.parse(run.createdAt));

  return (
    <Card size="sm" className={`w-72 shadow-sm transition-opacity ${finished ? 'opacity-50 hover:opacity-80' : ''}`}>
      <div className="min-w-0 px-3">
        <div className="flex items-center gap-1">
          {/* Not preloaded on hover: only an open run reads its detail. */}
          <Link
            to="/runs/$runId"
            params={{ runId: run.id }}
            preload={false}
            title={title}
            className="nodrag block min-w-0 flex-1 truncate text-sm font-semibold hover:underline"
          >
            {title}
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-label={open ? 'Hide steps' : 'Show steps'}
            title={open ? 'Hide its steps' : 'Show its steps beside it'}
            onClick={(event) => {
              // The card toggles on a click too; this one click is the chevron's.
              event.stopPropagation();
              onToggle(run.id);
            }}
            className="nodrag -mr-1.5 shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight aria-hidden className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
        <p className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span className="truncate font-mono" title={run.id}>
            {run.id}
          </span>
          <span className="shrink-0" title={run.repo}>
            {repoName(run.repo)}
          </span>
        </p>
        {/* On whom a run started `--after` waits, in `wf ls`'s word — amber when one never ships without you — and what to do, on hover. */}
        {run.waiting && (
          <p
            data-waiting={run.waiting.onYou ? 'on-you' : 'on-runs'}
            title={run.waiting.advice}
            className={`mt-1 line-clamp-2 font-mono text-[11px] break-words ${run.waiting.onYou ? 'text-amber-800 dark:text-amber-300' : 'text-muted-foreground'}`}
          >
            {run.waiting.word}
          </p>
        )}
      </div>

      <ul aria-label="Steps" className="flex flex-wrap gap-x-2.5 gap-y-1 px-3 text-[11px]">
        {run.steps.map((step) => (
          <li key={step.name} className="flex min-w-0 max-w-full items-center gap-1">
            {/* The name keeps its width: a root's `waiting on <run> (cancelled)` is what is cut short, and whole on the line above. */}
            <span className="shrink-0 text-muted-foreground">{step.name}</span>
            <StatusChip status={step.status} runCancelled={cancelled} note={step.note} />
          </li>
        ))}
      </ul>

      {/* What a person has to know to act: a step's question, or a session the harness blocked. Two lines each, whole on hover. */}
      {needs.length > 0 && (
        <ul aria-label="Needs" className="space-y-0.5 px-3 text-[11px]">
          {needs.map((need) => (
            <li
              key={need.step}
              data-need={need.kind}
              data-step={need.step}
              title={needLine(need)}
              className={`line-clamp-2 break-words ${need.kind === 'asks' ? 'text-amber-800 dark:text-amber-300' : 'text-orange-800 dark:text-orange-300'}`}
            >
              {needLine(need)}
            </li>
          ))}
        </ul>
      )}

      {/* For triage among the runs waiting on you: how far the work reaches, read once the card is opened. */}
      {open && run.waitingOnYou.length > 0 && <TouchedLine run={run} />}

      {open && (reading || trouble) && (
        <p className={`px-3 text-[11px] ${trouble ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {trouble ?? 'Reading its steps…'}
        </p>
      )}

      <div className="flex min-h-6 items-center justify-between gap-2 border-t px-3 pt-2">
        <time dateTime={run.createdAt} title={new Date(run.createdAt).toLocaleString()} className="font-mono text-[11px] text-muted-foreground">
          {finished ? `started ${since} ago` : `${since} since it started`}
        </time>
        <span className="flex gap-1">
          {waitsOnYou(run) && (
            <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300">waiting on you</Badge>
          )}
          {cancelled && <Badge variant="outline">cancelled</Badge>}
        </span>
      </div>

      {/* Where the edge from a run this one waits on comes in. */}
      <Handle type="target" position={Position.Left} isConnectable={false} className="opacity-0" />
      {/* Where the dashed edge into the run's first steps leaves the card, and the edge into each card that waits on it. */}
      <Handle type="source" position={Position.Right} isConnectable={false} className="opacity-0" />
    </Card>
  );
}

/** What a run waiting on you touched, in a line: `touched 2 packages · +979 −12`, from its decision, read once for its state. */
function TouchedLine({ run }: { run: RunSummary }) {
  const { data, error } = useQuery(decisionQuery(run.id, decisionStamp(run)));
  if (error) {
    return (
      <p className="truncate px-3 text-[11px] text-red-600 dark:text-red-400" title={error.message}>
        touched: not read — {error.message}
      </p>
    );
  }
  if (!isDecidable(data)) return null;
  const line = touchedSummary(data.touched);
  return (
    <p data-touched-line className="truncate px-3 font-mono text-[11px] text-muted-foreground" title={line}>
      {line}
    </p>
  );
}
