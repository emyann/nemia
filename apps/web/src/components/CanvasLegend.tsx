import type { ReactNode } from 'react';
import { Panel } from '@xyflow/react';
import { edgeLine, edgeStroke, type EdgeState } from '../lib/canvas';
import { Travelling } from './StateEdge';

/**
 * Beside a canvas's zoom controls, under its nodes: what the drawing means. An edge in each state it is drawn in, drawn as
 * `StateEdge` draws it — dashed and still, moving into a running step, solid, looping back — and the human gate. The moving
 * sample moves as a running edge does, and is as still as one where the person asked for reduced motion.
 *
 * `cards`, on the Factory: the edge between two cards too, from a run to one that waits on it (`afterEdges`) — started `--after` it, or
 * held until it ships (`wf hold`), which are both a wait on that run and drawn alike; the card itself says which. And the ring round a card
 * whose result nobody has decided, which stays on the floor, finished, until a person decides it.
 */
export function CanvasLegend({ className = '', cards = false }: { className?: string; cards?: boolean }) {
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
      {cards && <Item sample={<CardsSample />}>waits on a run</Item>}
      <Item sample={<span className="size-2.5 rounded-sm border-2 border-amber-500" />}>human gate</Item>
      {cards && <Item sample={<span className="size-2.5 rounded-sm ring-1 ring-emerald-500" />}>to decide</Item>}
    </Panel>
  );
}

/**
 * Two cards and the edge from the one into the other, dashed as it is while the second waits: solid once it has started, as any edge is.
 */
function CardsSample() {
  const stroke = edgeStroke('to-come', false);
  const card = (x: number) => <rect x={x} y={1.75} width={8} height={8.5} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.5} />;
  return (
    <svg width={44} height={12} viewBox="0 0 44 12" aria-hidden data-sample="cards" className="overflow-visible">
      {card(0.75)}
      <path d="M 10,6 H 28" fill="none" style={{ stroke, ...edgeLine('to-come', false) }} />
      <path d="M 28,2.5 L 34,6 L 28,9.5 Z" fill={stroke} />
      {card(35.25)}
    </svg>
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
