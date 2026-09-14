import { BaseEdge, type EdgeProps } from '@xyflow/react';
import { LOOP_STROKE, loopPath } from '../lib/canvas';

/**
 * The edge back that `loop:` makes, from under its looping step to under the step a round runs again: curved beneath the
 * row, dashed, its arrow at the target, and labelled with the round the loop is on once it is past the first.
 */
export function LoopEdge({ sourceX, sourceY, targetX, targetY, markerEnd, label, style }: EdgeProps) {
  const { path, labelX, labelY } = loopPath({ x: sourceX, y: sourceY }, { x: targetX, y: targetY });
  return (
    <BaseEdge
      path={path}
      markerEnd={markerEnd}
      style={{ stroke: LOOP_STROKE, strokeDasharray: '5 4', ...style }}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={{ fontSize: 10 }}
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={3}
    />
  );
}
