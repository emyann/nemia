/**
 * The factory's proposals, above its floor: each a row linking to its page, with its phase in the person's words and a *Widens access*
 * mark where it widens, what waits on the person first and the newer of each kind first (`proposalsInOrder`), at a bounded height that
 * scrolls. Drawn only while the factory has a proposal, so another floor keeps its height; the route's loader reads the list before the
 * floor is fitted.
 */
import { useQuery } from '@tanstack/react-query';
import { RouteLink } from '@/components/agent/AgentParts';
import { TEXT_LINK } from '@/components/look';
import { proposalsQuery } from '@/lib/api';
import { proposalsInOrder } from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { ProposalTags } from '@/components/gate/ProposalTags';

/** The proposals of the factory `factory`, listed above its floor; nothing while it has none or they do not read. */
export function FactoryProposals({ factory }: { factory: string }) {
  const { data } = useQuery(proposalsQuery(factory));
  if (!data || data.length === 0) return null;
  const waiting = data.filter((p) => p.status.phase === 'waiting').length;
  return (
    <section aria-label="Proposals" data-factory-proposals={factory} className="border-b px-3 py-2">
      <h2 className="text-title-small">
        Proposals{waiting > 0 ? <span className="text-muted-foreground"> · {waiting} wait on you</span> : null}
      </h2>
      <ul className="mt-1 flex max-h-32 flex-col gap-1 overflow-y-auto">
        {proposalsInOrder(data).map((proposal) => {
          const { name } = proposal.metadata;
          return (
            <li
              key={name}
              data-factory-proposal={name}
              data-proposal-phase={proposal.status.phase}
              className="flex flex-wrap items-center gap-2 text-body-medium"
            >
              <RouteLink
                to="/factories/$factory/proposals/$name"
                params={{ factory, name }}
                className={cn(TEXT_LINK, 'font-mono break-all')}
              >
                {name}
              </RouteLink>
              <ProposalTags phase={proposal.status.phase} widens={proposal.status.widens} size="small" />
              {proposal.spec.why && <span className="truncate text-body-small text-muted-foreground">{proposal.spec.why}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
