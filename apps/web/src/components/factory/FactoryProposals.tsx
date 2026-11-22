/**
 * The factory's proposals, on their own page of the factory (`/factories/$factory/proposals`): each a row linking to its page, with its
 * phase in the person's words and a *Widens access* mark where it widens, what waits on the person first and the newer of each kind first
 * (`proposalsInOrder`), each read as its list's row (`ProposalRow`), so the page opens however many proposals there are and however large.
 * A factory with none says so in one line; one whose list does not read says why, as every page does (`ReadTrouble`); the route's loader
 * reads the list before the page is drawn.
 */
import { useQuery } from '@tanstack/react-query';
import { RouteLink } from '@/components/agent/AgentParts';
import { TEXT_LINK } from '@/components/look';
import { proposalsQuery } from '@/lib/api/proposals';
import { proposalsInOrder } from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { ProposalTags } from '@/components/gate/ProposalTags';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** The proposals of the factory `factory`, listed whole; a line that it has none, or why they do not read. */
export function FactoryProposals({ factory }: { factory: string }) {
  const { data, error } = useQuery(proposalsQuery(factory));
  if (error) return <ReadTrouble what={`the proposals of ${factory}`} error={error} />;
  if (!data) return null;
  if (data.length === 0)
    return (
      <p data-no-proposals={factory} className="text-body-medium text-muted-foreground">
        {factory} has no proposals: an agent's proposal to change its definitions is listed here.
      </p>
    );
  const waiting = data.filter((p) => p.phase === 'waiting').length;
  return (
    <section aria-label="Proposals" data-factory-proposals={factory} className="flex flex-col gap-2">
      {waiting > 0 ? <p className="text-body-medium text-muted-foreground">{waiting} wait on you</p> : null}
      <ul className="flex flex-col gap-1">
        {proposalsInOrder(data).map((proposal) => {
          const { name } = proposal;
          return (
            <li
              key={name}
              data-factory-proposal={name}
              data-proposal-phase={proposal.phase}
              className="flex flex-wrap items-center gap-2 text-body-medium"
            >
              <RouteLink
                to="/factories/$factory/proposals/$name"
                params={{ factory, name }}
                className={cn(TEXT_LINK, 'font-mono break-all')}
              >
                {name}
              </RouteLink>
              <ProposalTags phase={proposal.phase} widens={proposal.widens} size="small" />
              {proposal.why && <span className="truncate text-body-small text-muted-foreground">{proposal.why}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
