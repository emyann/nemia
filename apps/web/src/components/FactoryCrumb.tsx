import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { factoriesQuery } from '@/lib/api';
import { repoName } from '@/lib/factory';
import { RouteLink } from './AgentParts';

/**
 * The root's header inside the factory `name`: a link back to the Factories, the factory's name, and the repositories it works on by their
 * folders' names, whole on hover — or why its file does not read. It sits in the header rather than over the floor, which keeps the
 * screen's height. A name the api lists no factory by, or before the factories are read, is the Factories alone.
 */
export function FactoryCrumb({ name }: { name: string }) {
  const { data } = useQuery(factoriesQuery);
  const factory = data?.find((f) => f.name === name);
  if (!factory) return <span className="text-sm font-medium">Factories</span>;
  return (
    <nav aria-label="Factory" className="flex min-w-0 items-center gap-1.5 text-sm">
      <RouteLink to="/" className="font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:underline">
        Factories
      </RouteLink>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
      <h1 className="font-medium">{factory.name}</h1>
      <span className="ml-1 truncate text-muted-foreground" title={factory.repos.join('\n')}>
        on {factory.repos.map(repoName).join(', ') || 'no repository'}
      </span>
      {factory.error && (
        <span className="truncate text-destructive" title={factory.error}>
          Its file does not read: {factory.error}
        </span>
      )}
    </nav>
  );
}
