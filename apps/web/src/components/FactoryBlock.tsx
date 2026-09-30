import type { Node, NodeProps } from '@xyflow/react';
import { Factory as FactoryIcon, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { FactoryBlock } from '@/lib/factories';
import { RouteLink } from './AgentParts';

/** A block on the Factories canvas: one factory, as `factoryBlocks` counts it. */
export type FactoryFlowNode = Node<FactoryBlock, 'factory'>;

/** A block's width and height, in the canvas's pixels: every block is drawn the same size, so the grid never overlaps. */
export const BLOCK_SIZE = { width: 288, height: 176 } as const;

/** `n` of `one`, in words: `1 run`, `3 runs`. */
const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** What a block offers, in words: the default factory every workflow and no hire; another its workflows and its hires. */
const offerOf = (block: FactoryBlock): string =>
  block.workflows === null
    ? 'every workflow · no hires'
    : `${count(block.workflows, 'workflow')} · ${block.hires === 0 ? 'no hires' : count(block.hires, 'hire')}`;

/** What a block's runs are doing, in words: how many are in flight and wait on you, how many it holds, or that it holds none. */
const runsOf = (block: FactoryBlock): string =>
  block.runs === 0
    ? 'No runs yet'
    : [`${block.inFlight} in flight`, block.waitsOnYou > 0 && `${block.waitsOnYou} waiting on you`, count(block.runs, 'run')]
        .filter(Boolean)
        .join(' · ');

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
