import { Link as AriaLink } from 'react-aria-components';
import type { AgentListing, AgentUser } from '../lib/api';
import { cn } from '../lib/utils';
import { routeLink } from './routeLink';

/** A link to a route, as React Aria draws one (`routeLink`): what the Agents pages link a node and an agent with. */
export const RouteLink = routeLink(AriaLink);

const LINK = 'rounded-sm underline decoration-neutral-300 underline-offset-2 outline-none hover:decoration-neutral-600 focus-visible:ring-2 focus-visible:ring-ring/50 dark:decoration-neutral-600 dark:hover:decoration-neutral-300';

/** Where an agent is read from, as the Workflows page badges a workflow: yours, or this repository's. */
export function FromBadge({ from }: { from: AgentListing['from'] }) {
  return (
    <span
      data-from={from}
      className={cn(
        'rounded-full px-2 py-0.5 text-[11px] leading-none font-medium',
        from === 'yours'
          ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
          : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300',
      )}
    >
      {from === 'yours' ? 'yours' : 'this repository'}
    </span>
  );
}

/** A node that names an agent, linked to its step's page: `workflow › step`. */
export function NodeLink({ user }: { user: AgentUser }) {
  return (
    <RouteLink
      to="/workflows/$from/$workflow/$step"
      params={{ from: user.from, workflow: user.workflow, step: user.step }}
      data-node={`${user.workflow}/${user.step}`}
      className={cn('font-mono text-xs text-neutral-700 dark:text-neutral-300', LINK)}
    >
      {user.workflow} <span className="text-neutral-400">›</span> {user.step}
    </RouteLink>
  );
}

/** The nodes that name an agent, each linked — or that none does. */
export function UsedBy({ listing, className }: { listing: Pick<AgentListing, 'usedBy'>; className?: string }) {
  return (
    <p data-used-by className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-neutral-500', className)}>
      {listing.usedBy.length ? (
        <>
          <span>Attached to</span>
          {listing.usedBy.map((user, i) => (
            <span key={`${user.workflow}/${user.step}`}>
              <NodeLink user={user} />
              {i < listing.usedBy.length - 1 && ','}
            </span>
          ))}
        </>
      ) : (
        <span>No node names it yet.</span>
      )}
    </p>
  );
}

/** A link to an agent's page, by name: what a node's form and a step's page link its agent with. */
export function AgentLink({ from, name, className }: { from: AgentListing['from']; name: string; className?: string }) {
  return (
    <RouteLink to="/agents/$from/$agent" params={{ from, agent: name }} data-agent-link={name} className={cn('font-mono', LINK, className)}>
      {name}
    </RouteLink>
  );
}

/** A write of an agent refused: the package's words, and the nodes that still name it when that is why, each linked. */
export function AgentRefused({ message, users, from }: { message: string; users: readonly string[]; from: AgentListing['from'] }) {
  return (
    <div role="alert" data-agent-refused className="space-y-1.5 rounded border border-red-300 bg-red-50 px-3 py-2 dark:border-red-900 dark:bg-red-950/40">
      <p className="text-sm font-medium text-red-800 dark:text-red-300">Not written:</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words text-red-800 dark:text-red-300">{message}</p>
      {users.length > 0 && (
        <p className="flex flex-wrap gap-x-2 text-xs text-red-800 dark:text-red-300">
          <span>Open</span>
          {users.map((user) => {
            const [workflow = '', step = ''] = user.split('/');
            return <NodeLink key={user} user={{ from, workflow, step }} />;
          })}
        </p>
      )}
    </div>
  );
}
