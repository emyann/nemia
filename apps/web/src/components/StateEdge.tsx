import { BaseEdge, EdgeText, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { edgeLine, edgeStroke, loopPath, TRAVEL_SECONDS, type EdgeState } from '../lib/canvas';
import { useReducedMotion } from '../lib/useReducedMotion';

/**
 * What an edge on a canvas is drawn from: what it says (`CanvasEdge.state`), whether it is a loop's edge back, and whether it is a line of
 * what a run reads as context (`read`), faint and dotted, which no run waits on.
 */
export type StateEdgeData = { state: EdgeState; loop: boolean; read?: boolean };
export type StateFlowEdge = Edge<StateEdgeData, 'state'>;

/**
 * Every edge on the canvases, drawn from what it says: to come, dashed and still; done, solid; running, in the running
 * colour, with a dot travelling its path (`Travelling`). An `after` edge is React Flow's bezier between the nodes' sides. A
 * loop's edge back curves beneath the row from under its looping step (`loopPath`), dashed, with the round it is on beside
 * it, and moves as a running edge does while its round is due. Its arrow is the `markerEnd` `stepEdges` gives it, in its colour.
 * Its label is drawn after the dot, so the dot passes under the round and not over its words. A line of what a run reads is faint and
 * dotted, with no arrow (`READ_LINE`).
 */
export function StateEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  label,
  data,
}: EdgeProps<StateFlowEdge>) {
  const { state, loop, read = false } = data ?? { state: 'to-come', loop: false };
  const { path, labelX, labelY } = loop
    ? loopPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })
    : bezier(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }));
  const stroke = edgeStroke(state, loop);
  return (
    <>
      <BaseEdge
        path={path}
        markerEnd={read ? undefined : markerEnd}
        data-state={read ? 'read' : state}
        style={read ? READ_LINE : { stroke, ...edgeLine(state, loop) }}
      />
      {state === 'running' && <Travelling path={path} colour={stroke} />}
      <EdgeText x={labelX} y={labelY} label={label} labelStyle={{ fontSize: 10 }} labelBgPadding={[4, 2]} labelBgBorderRadius={3} />
    </>
  );
}

/** A line of what a run reads as context: faint and dotted, beneath every wait. */
export const READ_LINE = {
  stroke: 'var(--md-sys-color-outline)',
  strokeWidth: 1.25,
  strokeDasharray: '1 5',
  strokeLinecap: 'round',
  opacity: 0.8,
} as const;

const bezier = ([path, labelX, labelY]: ReturnType<typeof getBezierPath>) => ({ path, labelX, labelY });

/**
 * The one animation on the canvases, React Flow's animated SVG edge: a dot in `colour` travelling `path` with `animateMotion`,
 * over and over. Nothing at all where the person asked for reduced motion: there the colour and the arrow say it alone.
 */
export function Travelling({ path, colour }: { path: string; colour: string }) {
  if (useReducedMotion()) return null;
  return (
    <circle r={3.5} fill={colour} stroke="var(--xy-background-color)" strokeWidth={1.5} pointerEvents="none">
      <animateMotion dur={`${TRAVEL_SECONDS}s`} repeatCount="indefinite" path={path} />
    </circle>
  );
}
