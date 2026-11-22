import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AgentsPage, loadAgents } from '../components/agent/AgentsPage';
import { filterOf } from '../lib/listFilter';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/** Your agents and the skills an agent can be given. */
export const Route = createFileRoute('/agents')({
  validateSearch: filterOf,
  loader: ({ context }) => loadAgents(context.queryClient),
  component: Page,
  errorComponent: ({ error }) => <ReadTrouble what="the agents" error={error} />,
});

/** The page, read off its address; its filter is written to it as a person types (`?q=`). */
function Page() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <AgentsPage
      query={q ?? ''}
      onQuery={(query) =>
        void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), hash: true, replace: true, resetScroll: false })
      }
    />
  );
}
