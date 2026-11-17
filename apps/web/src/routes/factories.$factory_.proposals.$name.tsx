import { createFileRoute } from '@tanstack/react-router';
import { ProposalCard } from '@/components/gate/ProposalCard';
import { routeLink } from '@/components/nav/routeLink';
import { Button } from '@/components/ui/ds';
import { proposalQuery } from '@/lib/api/proposals';

/**
 * A factory's proposal, at /factories/$factory/proposals/$name: `$factory_` draws it on its own, not inside the floor, which has no outlet
 * for it. The address her message links a proposal by (`proposalLinkOf`), and the page the factory's proposals page opens. The loader
 * prefetches the proposal, which never throws: a proposal that is not there says so in its part.
 */
export const Route = createFileRoute('/factories/$factory_/proposals/$name')({
  loader: ({ context, params }) => context.queryClient.prefetchQuery(proposalQuery(params.factory, params.name)),
  component: ProposalPage,
});

/** A button to a route, as the router draws its links (`routeLink`). */
const RouterLinkButton = routeLink(Button);

/** The proposal, as its own part draws it (`ProposalCard`), with the way back to its factory's proposals. */
function ProposalPage() {
  const { factory, name } = Route.useParams();
  return (
    <article data-proposal-page={name} className="mx-auto flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div>
          <RouterLinkButton to="/factories/$factory/proposals" params={{ factory }} variant="text" size="xsmall" data-back-to-proposals>
            ← Back to the proposals
          </RouterLinkButton>
        </div>
        <div className="flex flex-col gap-1">
          <h1 className="text-title-large">A proposal of {factory}</h1>
          <p className="text-body-medium text-muted-foreground">
            A change to this factory's definitions, waiting on an approval or judged by one.
          </p>
        </div>
      </header>
      <ProposalCard factory={factory} name={name} />
    </article>
  );
}
