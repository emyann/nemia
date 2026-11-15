import { createFileRoute } from '@tanstack/react-router';
import { everyFactory, WorkflowsPage } from '../components/workflow/WorkflowsPage';
import { storeQuery } from '../lib/api/store.ts';
import { pagePlaceOf } from '../lib/factories';
import { loadWorkflowsIn } from '../lib/placed';

/** The workflows of the factory its path names, read on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/factories/$factory_/workflows')({
  validateSearch: pagePlaceOf,
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

/** The workflows page, read off its address. */
function Page() {
  const { factory } = Route.useParams();
  return <WorkflowsPage place={{ ...Route.useSearch(), factory }} />;
}
