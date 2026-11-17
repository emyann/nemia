import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { everyFactory, WorkflowsPage } from '../components/workflow/WorkflowsPage';
import { storeQuery } from '../lib/api/store.ts';
import { pagePlaceOf } from '../lib/factories';
import { filterOf } from '../lib/listFilter';
import { loadWorkflowsIn } from '../lib/placed';

/** The workflows, read on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/workflows')({
  validateSearch: (search: Record<string, unknown>) => ({ ...pagePlaceOf(search), ...filterOf(search) }),
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps }) =>
    Promise.all([loadWorkflowsIn(context.queryClient, { ...deps }), context.queryClient.ensureQueryData(storeQuery)]),
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
  const { q, ...place } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <WorkflowsPage
      place={place}
      query={q ?? ''}
      onQuery={(query) =>
        void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), hash: true, replace: true, resetScroll: false })
      }
    />
  );
}
