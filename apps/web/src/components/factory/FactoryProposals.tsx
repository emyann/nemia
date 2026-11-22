/**
 * The factory's proposals, on their own page of the factory (`/factories/$factory/proposals`): each a row linking to its page, with its
 * phase in the person's words and a *Widens access* mark where it widens, what waits on the person first and the newer of each kind first
 * (`proposalsInOrder`), each read as its list's row (`ProposalRow`), so the page opens however many proposals there are and however large.
 * A factory with none says so in one line; one whose list does not read says why and what to do (`ProposalsTrouble`); the route's loader
 * reads the list before the page is drawn.
 */
import { useQuery } from '@tanstack/react-query';
import { RouteLink } from '@/components/agent/AgentParts';
import { TEXT_LINK } from '@/components/look';
import { proposalsQuery } from '@/lib/api/proposals';
import { ReadRefusal, UnreadAnswer } from '@/lib/api/read';
import { proposalsInOrder } from '@/lib/proposals';
import { cn } from '@/lib/utils';
import { ProposalTags } from '@/components/gate/ProposalTags';

/**
 * Why the proposals of `factory` do not read, by what `error` is: the api's refusal in its words; an answer this board does not read, the
 * read named and the restart that brings the board and the api to one build; else nothing answered, and what to do about that.
 */
function ProposalsTrouble({ factory, error }: { factory: string; error: Error }) {
  const said =
    error instanceof ReadRefusal ? (
      <>{error.message}</>
    ) : error instanceof UnreadAnswer ? (
      <>
        {error.route} answered what this board does not read: the board and Nemia's api are of different builds. Restart the service (
        <code>nemia service restart</code>), then reload the page.
      </>
    ) : (
      <>
        Nemia's api did not answer ({error.message}). Reload the page once it does; <code>nemia doctor</code> says why it does not.
      </>
    );
  return (
    <p data-proposals-trouble className="text-body-medium text-failure">
      Could not read the proposals of {factory}: {said}
    </p>
  );
}

/** The proposals of the factory `factory`, listed whole; a line that it has none, or why they do not read. */
export function FactoryProposals({ factory }: { factory: string }) {
  const { data, error } = useQuery(proposalsQuery(factory));
  if (error) return <ProposalsTrouble factory={factory} error={error} />;
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
