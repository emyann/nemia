import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { X } from 'lucide-react';
import { edgeLine, edgeStroke, loopPath } from '../lib/canvas';

/** An edge the builder drew from a key: which key it is, in words, and what taking it away does to the draft. */
export type BuilderEdgeData = { loop: boolean; said: string; remove: () => void };
export type BuilderFlowEdge = Edge<BuilderEdgeData, 'builder'>;

/** How far below its ends an `after` edge drawn backwards dips: under the blocks, whose middles its ends are level with. */
export const BACKWARD_DEPTH = 80;

/**
 * An edge on the builder's canvas: drawn as a workflow's edges are before any run — dashed, and a loop's edge back beneath the row in
 * violet — with a button at its middle that takes the key it stands for away: `after:` on the step it points at, or `loop:` and its rounds
 * on the step it leaves. An `after` edge that points backwards, which only steps waiting on each other have, dips beneath the row too:
 * drawn straight it would cross both blocks, and its button would sit on the forward edge's.
 */
export function BuilderEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  data,
}: EdgeProps<BuilderFlowEdge>) {
  const loop = data?.loop ?? false;
  const under = loop || targetX < sourceX;
  const [path, labelX, labelY] = under
    ? (({ path, labelX, labelY }) => [path, labelX, labelY] as const)(
        loopPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY }, loop ? undefined : BACKWARD_DEPTH),
      )
    : getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: edgeStroke('to-come', loop), ...edgeLine('to-come', loop) }} />
      {data && (
        <EdgeLabelRenderer>
          <button
            type="button"
            onClick={data.remove}
            aria-label={`Remove ${data.said}`}
            title={`Remove ${data.said}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            className="nodrag nopan pointer-events-auto absolute flex size-5 items-center justify-center rounded-full border border-neutral-300 bg-white text-muted-foreground shadow-sm hover:border-red-400 hover:text-red-600 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-red-500 dark:hover:text-red-400"
          >
            <X className="size-3" aria-hidden />
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
