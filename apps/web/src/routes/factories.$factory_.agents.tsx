import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { FactoryAgentsPage, loadFactoryAgents } from '../components/agent/AgentsPage';
import { filterOf } from '../lib/listFilter';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** A factory's agents: its own, listed first under its name, then yours and the skills, as the Agents page lists them. */
export const Route = createFileRoute('/factories/$factory_/agents')({
  validateSearch: filterOf,
  loader: ({ context, params }) => loadFactoryAgents(context.queryClient, params.factory),
  component: Page,
  errorComponent: ({ error }) => <ReadTrouble what="the agents" error={error} />,
});

/** The page, read off its address; its filter is written to it as a person types (`?q=`). */
function Page() {
  const { factory } = Route.useParams();
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <FactoryAgentsPage
      factory={factory}
      query={q ?? ''}
      onQuery={(query) =>
        void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), hash: true, replace: true, resetScroll: false })
      }
    />
  );
}
