import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { everyFactory, WorkflowsPage } from '../components/workflow/WorkflowsPage';
import { storeQuery } from '../lib/api/store.ts';
import { pagePlaceOf } from '../lib/factories';
import { filterOf } from '../lib/listFilter';
import { loadWorkflowsIn } from '../lib/placed';

/** The workflows of the factory its path names, read on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/factories/$factory_/workflows')({
  validateSearch: (search: Record<string, unknown>) => ({ ...pagePlaceOf(search), ...filterOf(search) }),
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) =>
    Promise.all([
      loadWorkflowsIn(context.queryClient, { ...deps, factory: params.factory }),
      context.queryClient.ensureQueryData(storeQuery),
    ]),
  component: Page,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not load the workflows: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?{' '}
      {everyFactory}.
    </p>
  ),
});

/** The workflows page, read off its address; its filter is written to it as a person types (`?q=`). */
function Page() {
  const { factory } = Route.useParams();
  const { q, ...place } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <WorkflowsPage
      place={{ ...place, factory }}
      query={q ?? ''}
      onQuery={(query) => void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), replace: true, resetScroll: false })}
    />
  );
}
