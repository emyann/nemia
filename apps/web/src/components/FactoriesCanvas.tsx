import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useReactFlow } from '@xyflow/react';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { Bar } from '@/lib/bar';
import type { FactoryBlock } from '@/lib/factories';
import { useBarOver } from '@/lib/useBarOver';
import { useCanvasPress } from '@/lib/useCanvasPress';
import { useContent } from '@/lib/useContent';
import { BLOCK_SIZE, FactoryBlockNode, type FactoryFlowNode } from './FactoryBlock';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { factory: FactoryBlockNode };

/** How many blocks a row of the grid holds, and the gap between two blocks. */
const COLUMNS = 3;
const GAP = 48;

/** How the canvas is fitted to its frame: every block in view, never larger than life. */
const FIT = { maxZoom: 1, padding: 0.15 } as const;

/**
 * The blocks as React Flow's nodes, laid out on a grid in their order, `COLUMNS` a row, the one named `inspected` marked so: none dragged,
 * none selected, each named for a screen reader. React Flow takes the pointer off a node that is neither, so each is given it back: a block
 * is pressed.
 */
const nodesOf = (blocks: readonly FactoryBlock[], inspected: string | null): FactoryFlowNode[] =>
  blocks.map((block, i) => ({
    id: block.name,
    type: 'factory',
    position: { x: (i % COLUMNS) * (BLOCK_SIZE.width + GAP), y: Math.floor(i / COLUMNS) * (BLOCK_SIZE.height + GAP) },
    data: { ...block, inspected: block.name === inspected },
    ariaLabel: `Factory ${block.name}`,
    className: 'outline-none',
    width: BLOCK_SIZE.width,
    height: BLOCK_SIZE.height,
    draggable: false,
    selectable: false,
    style: { pointerEvents: 'all' },
  }));

/** The bar a factory's block shows: the factory's. */
const factoryBar = (factory: string): Bar => ({ kind: 'factory', factory });

/**
 * The Factories: every factory a block on a canvas (`FactoryBlockNode`), laid out on a grid in the order `factoryBlocks` gives, and fitted
 * to the frame, never larger than life. The canvas pans and zooms, and a block does not move. A click, a tap or Enter on a block shows its
 * factory in the frame's bar, ringed; the same block again or the empty canvas closes it, and another switches it. A double click on a
 * block, or the bar's Open, goes to its floor (`useCanvasPress`). With no block, it says how to make a factory.
 */
export function FactoriesCanvas({ blocks }: { blocks: readonly FactoryBlock[] }) {
  if (!blocks.length) return <NoFactory />;
  return (
    <ReactFlowProvider>
      <Floor blocks={blocks} />
    </ReactFlowProvider>
  );
}

/**
 * The canvas of `blocks`, its frame narrowed by what the bar covers of it (`useBarOver`), so the block inspected and the canvas's controls
 * stay clear of the bar, and fitted again as that width changes (`useRefit`).
 */
function Floor({ blocks }: { blocks: readonly FactoryBlock[] }) {
  const navigate = useNavigate();
  const { shown, ...press } = useCanvasPress(factoryBar, (factory) => void navigate({ to: '/factories/$factory', params: { factory } }));
  const inspected = shown?.kind === 'factory' ? shown.factory : null;
  const content = useContent(blocks);
  const nodes = useMemo(() => nodesOf(content, inspected), [content, inspected]);
  const whole = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const over = useBarOver(whole);
  useRefit(frame);
  return (
    <div ref={whole} className="flex h-[calc(100svh-3rem)] min-h-96" aria-label="The factories">
      <div ref={frame} className="min-h-0 min-w-0 flex-1" style={{ marginRight: over }}>
        <ReactFlow
          id="factories"
          nodes={nodes}
          nodeTypes={nodeTypes}
          {...press}
          fitView
          fitViewOptions={FIT}
          minZoom={0.2}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          colorMode="system"
        >
          <Background variant={BackgroundVariant.Dots} gap={16} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}

/** Fits the canvas in `frame` again (`FIT`) whenever the frame changes width: as the bar opens, switches or closes, and as the window does. */
function useRefit(frame: RefObject<HTMLDivElement | null>) {
  const { fitView } = useReactFlow();
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      void fitView({ ...FIT, duration: 300 });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame, fitView]);
}

/** No factory, and no run in the default one: say how to make one. */
function NoFactory() {
  return (
    <div className="flex h-[calc(100svh-3rem)] min-h-96 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>No factory yet</CardTitle>
          <CardDescription>
            Make one with <code>npx wf factory add &lt;name&gt; --repo &lt;path&gt;</code>. A run started in none is the default
            factory&apos;s, which shows here while it holds one and no factory is made.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
