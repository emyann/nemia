/**
 * The frame's floating bar for a factory: what its block on the Factories canvas says, in a bar beside it — its name, its repositories,
 * what its runs are doing and what it offers, a place of it that is not trusted, or why its file does not read — read from the factories
 * and the runs, which a read again
 * keeps current. Its floor, which Open visits, has its runs.
 */
import { useQuery } from '@tanstack/react-query';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { factoriesQuery, openRunsQuery, type Factory } from '@/lib/api';
import { offerOf, openBlockOf, runsOf, type FactoryBlock } from '@/lib/factories';
import { FloatingBar } from './FloatingBar';
import { FactoryTrust } from './FactoryTrust';

/**
 * The bar for the factory `factory`, titled by its name, `default` badged for the default factory, with its repositories under the title.
 * While the factories and the runs are read it says so; a read that failed, and a name the api lists no factory by, are each said in the
 * bar, which stays open until a person closes it.
 */
export function FactoryBar({ factory: name }: { factory: string }) {
  const factories = useQuery(factoriesQuery);
  const runs = useQuery(openRunsQuery(name));
  const factory = factories.data?.find((f) => f.name === name);
  const block = factory && runs.data ? openBlockOf(factory, runs.data) : undefined;
  const repos = block?.repos.join(', ');
  return (
    <FloatingBar
      title={
        <span className="flex items-center gap-2">
          <span className="min-w-0 break-all">{name}</span>
          {block?.default && <Badge variant="secondary">default</Badge>}
        </span>
      }
      description={block && <span className="break-all">on {repos || 'no repository'}</span>}
    >
      <div data-factory-bar={name} className="space-y-5">
        {block ? (
          <FactoryBody block={block} factory={factory} />
        ) : (
          <Unread name={name} error={factories.error ?? runs.error} read={factories.data !== undefined && runs.data !== undefined} />
        )}
      </div>
    </FloatingBar>
  );
}

/**
 * What the bar holds for a factory not shown yet: why a read failed, `error`; that no factory is named `name` once `read`; else that it
 * reads.
 */
function Unread({ name, error, read }: { name: string; error: Error | null; read: boolean }) {
  if (error) return <p className="text-sm text-failure">Could not read the factories and their runs: {error.message}</p>;
  if (read) return <p className="text-sm text-yours">No factory is named {name}.</p>;
  return <p className="text-xs text-muted-foreground">Reading the factories…</p>;
}

/**
 * What the bar holds for `block`: why its file does not read, whole; else the places of `factory` that are not trusted (`FactoryTrust`),
 * then what its runs are doing and what it offers, as its block says them.
 */
function FactoryBody({ block, factory }: { block: FactoryBlock; factory: Factory | undefined }) {
  if (block.error)
    return (
      <p className="flex gap-2 text-destructive" data-error>
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <span className="break-all">Its file does not read: {block.error}</span>
      </p>
    );
  return (
    <>
      {factory && <FactoryTrust factory={factory} />}
      <section aria-label="Runs" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Runs</h3>
        <p className="font-medium" data-runs>
          {runsOf(block)}
        </p>
      </section>
      <section aria-label="Offers" className="space-y-1">
        <h3 className="text-xs font-medium text-muted-foreground">Offers</h3>
        <p data-offer>{offerOf(block)}</p>
      </section>
    </>
  );
}
