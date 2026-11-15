import { createFileRoute } from '@tanstack/react-router';
import { everyFactory, WorkflowsPage } from '../components/workflow/WorkflowsPage';
import { storeQuery } from '../lib/api/store.ts';
import { pagePlaceOf } from '../lib/factories';
import { loadWorkflowsIn } from '../lib/placed';

/** The workflows, read on the repository its search names (`?repo=`). */
export const Route = createFileRoute('/workflows')({
  validateSearch: pagePlaceOf,
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

/** The workflows page, read off its address. */
function Page() {
  
  return <WorkflowsPage place={{ ...Route.useSearch() }} />;
}
