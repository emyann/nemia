import { useEffect, useEffectEvent, useMemo, useRef, type RefObject } from 'react';
import { Background, BackgroundVariant, Controls, ReactFlow, ReactFlowProvider, useReactFlow, useStoreApi } from '@xyflow/react';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { levelQuery, putLevel, storeQuery } from '@/lib/api';
import type { Bar } from '@/lib/bar';
import type { FactoryBlock } from '@/lib/factories';
import { revealView, sizeOf } from '@/lib/frame';
import { useBarOver } from '@/lib/useBarOver';
import { useCanvasPress } from '@/lib/useCanvasPress';
import { anyAbove, sessionOf } from '@/lib/nemia';
import { useContent } from '@/lib/useContent';
import { BLOCK_SIZE, FactoryBlockNode, type FactoryFlowNode } from './FactoryBlock';
import { TrustLine } from './NemiaTrust';

/** The canvas's node types for React Flow, one object for the module's life. */
const nodeTypes = { factory: FactoryBlockNode };

/** How many blocks a row of the grid holds, and the gap between two blocks. */
const COLUMNS = 3;
const GAP = 48;

/** How the canvas is fitted to its frame: every block in view, never larger than life. */
const FIT = { maxZoom: 1, padding: 0.15 } as const;

/** How far out bringing the block inspected into view zooms, at most: past it, a block is too small to read. */
const REVEAL_MIN_ZOOM = 0.4;

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
 * stay clear of the bar, the block brought into view as the bar shows it (`useKeepClear`).
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
  useKeepClear(frame, inspected);
  return (
    <div ref={whole} className="flex h-[calc(100svh-5rem)] min-h-96" aria-label="The factories">
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

/**
 * Keeps the canvas in `frame` readable beside the bar: brings the block `inspected` into view (`revealView`), at the zoom it has or zoomed
 * out no further than `REVEAL_MIN_ZOOM`, as the bar shows it and as the frame changes width with it inspected; with none inspected, fits
 * every block again (`FIT`) as the frame changes width, as when the bar closes or the window is resized.
 */
function useKeepClear(frame: RefObject<HTMLDivElement | null>, inspected: string | null) {
  const { fitView, getNode, setViewport } = useReactFlow();
  const store = useStoreApi();
  const reveal = useEffectEvent((id: string) => {
    const at = getNode(id)?.position;
    if (!at || !frame.current) return;
    const to = revealView({ ...at, ...BLOCK_SIZE }, store.getState().transform, sizeOf(frame.current), REVEAL_MIN_ZOOM);
    if (to) void setViewport(to, { duration: 300 });
  });
  const resized = useEffectEvent(() => {
    if (inspected) reveal(inspected);
    else void fitView({ ...FIT, duration: 300 });
  });
  useEffect(() => {
    if (inspected) reveal(inspected);
  }, [inspected]);
  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      resized();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [frame]);
}

/**
 * No factory, and no run in the default one: say how to make one, with the line the api answers (`fileFactory`), and offer to turn Nemia
 * on (`TurnOn`).
 */
function NoFactory() {
  const { data: store } = useQuery(storeQuery);
  return (
    <div className="flex h-[calc(100svh-5rem)] min-h-96 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>No factory yet</CardTitle>
          <CardDescription>
            Make one from the command line
            {store ? (
              <>
                {' '}
                with <code>{store.fileFactory}</code>
              </>
            ) : null}
            . A run started in none is the default factory&apos;s, which shows here while it holds one and no factory is made.
          </CardDescription>
        </CardHeader>
        <TurnOn line={store?.turnOnNemia ?? null} />
      </Card>
    </div>
  );
}

/**
 * Nemia off, the store's own agent: a button that sets her level to Semi-auto, one approval, beside `line`, the same act from the command
 * line as the api answers it. Once she is above Manual, her session's state in the board's words and the line that trusts her folder while
 * it is not. A refusal is shown in the api's words; nothing while her level is not read.
 */
function TurnOn({ line }: { line: string | null }) {
  const queryClient = useQueryClient();
  const { data: nemia } = useQuery(levelQuery);
  const turnOn = useMutation({
    mutationFn: () => putLevel({ level: 'semi-auto' }),
    onSuccess: (now) => {
      queryClient.setQueryData(levelQuery.queryKey, now);
      void queryClient.invalidateQueries({ queryKey: levelQuery.queryKey, exact: true });
    },
  });
  if (!nemia) return null;
  if (anyAbove(nemia)) {
    const { kind, words } = sessionOf(nemia);
    return (
      <CardContent data-nemia-on data-state={kind} className="flex flex-col gap-2 border-t pt-4">
        <p className="text-body-medium">Nemia is on. {words}</p>
        <TrustLine trust={nemia.trust} />
      </CardContent>
    );
  }
  return (
    <CardContent data-nemia-off className="flex flex-col gap-2 border-t pt-4">
      <p className="text-body-medium text-muted-foreground">
        Or let Nemia, the store&apos;s own agent, keep a session that asks you what waits on you.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" data-nemia-turn-on isDisabled={turnOn.isPending} onPress={() => turnOn.mutate()}>
          Turn Nemia on
        </Button>
        {line !== null && (
          <span className="text-body-small text-muted-foreground">
            or <code className="font-mono">{line}</code>
          </span>
        )}
      </div>
      {turnOn.error && (
        <p data-nemia-refused className="font-mono text-body-small break-words whitespace-pre-wrap text-destructive">
          {turnOn.error.message}
        </p>
      )}
    </CardContent>
  );
}
