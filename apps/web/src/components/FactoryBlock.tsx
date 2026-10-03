import type { Node, NodeProps } from '@xyflow/react';
import { Factory as FactoryIcon, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { offerOf, runsOf, type FactoryBlock } from '@/lib/factories';
import { RouteLink } from './AgentParts';

/** A block on the Factories canvas: one factory, as `factoryBlocks` counts it. */
export type FactoryFlowNode = Node<FactoryBlock, 'factory'>;

/** A block's width and height, in the canvas's pixels: every block is drawn the same size, so the grid never overlaps. */
export const BLOCK_SIZE = { width: 288, height: 176 } as const;

/**
 * One factory on the Factories canvas, like an outpost on a map: its name — `default` badged for the default factory — the repositories
 * it works on by their folders' names, what its runs are doing, and the workflows it offers and the steps it hires into. A factory whose
 * file does not read says why instead, in the package's words, in three lines and whole in its `title`. The whole block is a link to the
 * factory's floor.
 */
export function FactoryBlockNode({ data: block }: NodeProps<FactoryFlowNode>) {
  const repos = block.repos.join(', ');
  return (
    <RouteLink
      to="/factories/$factory"
      params={{ factory: block.name }}
      data-factory={block.name}
      aria-label={`Factory ${block.name}`}
      style={BLOCK_SIZE}
      className="flex flex-col gap-2 rounded-xl bg-card p-4 text-sm text-card-foreground shadow-sm ring-1 ring-foreground/10 outline-none hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex items-center gap-2">
        <FactoryIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate text-base font-semibold" title={block.name}>
          {block.name}
        </span>
        {block.default && <Badge variant="secondary">default</Badge>}
      </span>
      {block.error ? (
        <span className="flex gap-2 text-destructive" title={block.error} data-error>
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="line-clamp-4 break-all">Its file does not read: {block.error}</span>
        </span>
      ) : (
        <>
          <span className="truncate text-muted-foreground" title={repos}>
            on {repos || 'no repository'}
          </span>
          <span className="mt-auto font-medium" data-runs>
            {runsOf(block)}
          </span>
          <span className="text-muted-foreground" data-offer>
            {offerOf(block)}
          </span>
        </>
      )}
    </RouteLink>
  );
}
