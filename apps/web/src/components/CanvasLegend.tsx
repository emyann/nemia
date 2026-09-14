import type { ReactNode } from 'react';
import { Panel } from '@xyflow/react';
import { edgeLine, edgeStroke, type EdgeState } from '../lib/canvas';
import { Travelling } from './StateEdge';

/**
 * Beside a canvas's zoom controls, under its nodes: what the drawing means. An edge in each state it is drawn in, drawn as
 * `StateEdge` draws it — dashed and still, moving into a running step, solid, looping back — and the human gate. The moving
 * sample moves as a running edge does, and is as still as one where the person asked for reduced motion.
 */
export function CanvasLegend({ className = '' }: { className?: string }) {
  return (
    <Panel
      position="bottom-left"
      aria-label="Legend"
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 dark:text-neutral-400 ${className}`}
    >
      <Item sample={<Sample state="to-come" />}>to come</Item>
      <Item
        sample={
          <>
            <Sample state="running" />
            <span className="size-2.5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </>
        }
      >
        running
      </Item>
      <Item sample={<Sample state="done" />}>done</Item>
      <Item sample={<Sample state="to-come" loop />}>loops back</Item>
      <Item sample={<span className="size-2.5 rounded-sm border-2 border-amber-500" />}>human gate</Item>
    </Panel>
  );
}

const Item = ({ sample, children }: { sample: ReactNode; children: ReactNode }) => (
  <span className="flex items-center gap-1">
    {sample}
    {children}
  </span>
);

/** Left to right into an arrow, as an `after` edge goes; or down, under and back up into one, as a loop's edge back goes. */
const LINE = { path: 'M 1,5 H 21', arrow: 'M 21,1.5 L 27,5 L 21,8.5 Z', width: 28, height: 10 };
const LOOP = { path: 'M 18,1 C 18,13 4,13 4,5', arrow: 'M 0.5,6 L 4,0 L 7.5,6 Z', width: 20, height: 12 };

function Sample({ state, loop = false }: { state: EdgeState; loop?: boolean }) {
  const { path, arrow, width, height } = loop ? LOOP : LINE;
  const stroke = edgeStroke(state, loop);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <path d={path} fill="none" style={{ stroke, ...edgeLine(state, loop) }} />
      <path d={arrow} fill={stroke} />
      {state === 'running' && <Travelling path={path} colour={stroke} />}
    </svg>
  );
}
