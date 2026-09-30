import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow } from '@xyflow/react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { FactoryBlock } from '@/lib/factories';
import { useContent } from '@/lib/useContent';
import { BLOCK_SIZE, FactoryBlockNode, type FactoryFlowNode } from './FactoryBlock';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { factory: FactoryBlockNode };

/** How many blocks a row of the grid holds, and the gap between two blocks. */
const COLUMNS = 3;
const GAP = 48;

/**
 * The blocks as React Flow's nodes, laid out on a grid in their order, `COLUMNS` a row: none dragged, none selected. React Flow takes the
 * pointer off a node that is neither, so each is given it back: a block is a link.
 */
const nodesOf = (blocks: readonly FactoryBlock[]): FactoryFlowNode[] =>
  blocks.map((block, i) => ({
    id: block.name,
    type: 'factory',
    position: { x: (i % COLUMNS) * (BLOCK_SIZE.width + GAP), y: Math.floor(i / COLUMNS) * (BLOCK_SIZE.height + GAP) },
    data: block,
    width: BLOCK_SIZE.width,
    height: BLOCK_SIZE.height,
    draggable: false,
    selectable: false,
    style: { pointerEvents: 'all' },
  }));

/**
 * The Factories: every factory a block on a canvas (`FactoryBlockNode`), laid out on a grid in the order `factoryBlocks` gives, and fitted
 * to the frame, never larger than life. The canvas pans and zooms; a block does not move, and a click on one goes into it. With no block,
 * it says how to make a factory.
 */
export function FactoriesCanvas({ blocks }: { blocks: readonly FactoryBlock[] }) {
  const content = useContent(blocks);
  const nodes = useMemo(() => nodesOf(content), [content]);
  if (!nodes.length) return <NoFactory />;
  return (
    <div className="h-[calc(100svh-3rem)] min-h-96" aria-label="The factories">
      <ReactFlow
        id="factories"
        nodes={nodes}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ maxZoom: 1, padding: 0.15 }}
        minZoom={0.2}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
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
  );
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
            factory&apos;s, which shows here once it holds one.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
