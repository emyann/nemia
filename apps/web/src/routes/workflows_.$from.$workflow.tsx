import { createFileRoute } from '@tanstack/react-router';
import { BackToWorkflows, loadWorkflow, WorkflowPage, workflowSearch } from '../components/workflow/WorkflowPage';

/**
 * The page of a workflow, at /workflows/$from/$workflow: `workflows_` draws it on its own, not inside the Workflows page, which
 * has no outlet for it. `?build=true` opens the builder of one of yours. It is read in no factory, on the repository
 * its search names (`?repo=`).
 */
export const Route = createFileRoute('/workflows_/$from/$workflow')({
  validateSearch: workflowSearch,
  loaderDeps: ({ search }) => ({ repo: search.repo }),
  loader: ({ context, deps, params }) => loadWorkflow(context.queryClient, { ...deps }, params.from),
  component: Page,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToWorkflows />
      <p className="text-body-medium text-failure">
        Could not load this workflow: {error instanceof Error ? error.message : String(error)}
      </p>
    </div>
  ),
});

/** The workflow's page, read off its address. */
function Page() {
  const { from, workflow } = Route.useParams();
  const { build, repo } = Route.useSearch();
  return <WorkflowPage from={from} name={workflow} address={{ ...(repo && { repo }) }} building={build ?? false} />;
}
