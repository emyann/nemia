import { BaseEdge, EdgeText, getBezierPath, type Edge, type EdgeProps } from '@xyflow/react';
import { edgeLine, edgeStroke, loopPath, TRAVEL_SECONDS, type EdgeState } from '../lib/canvas';
import { useReducedMotion } from '../lib/useReducedMotion';

/** What an edge on a canvas is drawn from: what it says (`CanvasEdge.state`), and whether it is a loop's edge back. */
export type StateEdgeData = { state: EdgeState; loop: boolean };
export type StateFlowEdge = Edge<StateEdgeData, 'state'>;

/**
 * Every edge on the canvases, drawn from what it says: to come, dashed and still; done, solid; running, in the running
 * colour, with a dot travelling its path (`Travelling`). An `after` edge is React Flow's bezier between the nodes' sides. A
 * loop's edge back curves beneath the row from under its looping step (`loopPath`), dashed, with the round it is on beside
 * it, and moves as a running edge does while its round is due. Its arrow is the `markerEnd` `stepEdges` gives it, in its colour.
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
  const { state, loop } = data ?? { state: 'to-come', loop: false };
  const { path, labelX, labelY } = loop
    ? loopPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY })
    : bezier(getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition }));
  const stroke = edgeStroke(state, loop);
  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} data-state={state} style={{ stroke, ...edgeLine(state, loop) }} />
      {state === 'running' && <Travelling path={path} colour={stroke} />}
      {/* After the dot, so the dot passes under the round and not over its words. */}
      <EdgeText x={labelX} y={labelY} label={label} labelStyle={{ fontSize: 10 }} labelBgPadding={[4, 2]} labelBgBorderRadius={3} />
    </>
  );
}

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
