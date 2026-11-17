import { createFileRoute } from '@tanstack/react-router';
import { WorkflowStepPage } from '../components/workflow/WorkflowStepPage';
import { WorkflowTrail } from '../components/workflow/WorkflowPage';
import { stepQuery } from '../lib/api/workflows.ts';
import { pagePlaceOf } from '../lib/factories';

/**
 * The page of a workflow's step, at /factories/$factory/workflows/$from/$workflow/$step: `workflows_` and `$workflow_` draw it on its own,
 * not inside the Workflows page nor the workflow's, neither of which has an outlet for it. It is read in the factory its path names, on the
 * repository its search names (`?repo=`).
 */
export const Route = createFileRoute('/factories/$factory_/workflows_/$from/$workflow_/$step')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search: { repo } }) => ({ ...(repo && { repo }) }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(stepQuery(params.from, params.workflow, params.step, { ...deps, factory: params.factory })),
  component: Page,
  errorComponent: ({ error }) => <Failed error={error} />,
});

/** The step's page, read off its address. */
function Page() {
  const { factory, from, workflow, step } = Route.useParams();
  return <WorkflowStepPage from={from} workflow={workflow} step={step} place={{ ...Route.useSearch(), factory }} />;
}

/** That the step could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { factory, from, workflow, step } = Route.useParams();
  return (
    <div className="space-y-3">
      <WorkflowTrail from={from} workflow={workflow} step={step} place={{ ...Route.useSearch(), factory }} />
      <p className="text-body-medium text-failure">Could not load this step: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
