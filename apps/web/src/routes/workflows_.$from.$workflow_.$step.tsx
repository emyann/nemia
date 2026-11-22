import { createFileRoute } from '@tanstack/react-router';
import { WorkflowStepPage } from '../components/workflow/WorkflowStepPage';
import { WorkflowTrail } from '../components/workflow/WorkflowPage';
import { stepQuery } from '../lib/api/workflows.ts';
import { pagePlaceOf } from '../lib/factories';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The page of a workflow's step, at /workflows/$from/$workflow/$step: `workflows_` and `$workflow_` draw it on its own, not
 * inside the Workflows page nor the workflow's, neither of which has an outlet for it. It is read in no factory, on the
 * repository its search names (`?repo=`).
 */
export const Route = createFileRoute('/workflows_/$from/$workflow_/$step')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search: { repo } }) => ({ ...(repo && { repo }) }),
  loader: ({ context, params, deps }) =>
    context.queryClient.ensureQueryData(stepQuery(params.from, params.workflow, params.step, { ...deps })),
  component: Page,
  errorComponent: ({ error }) => <Failed error={error} />,
});

/** The step's page, read off its address. */
function Page() {
  const { from, workflow, step } = Route.useParams();
  return <WorkflowStepPage from={from} workflow={workflow} step={step} place={{ ...Route.useSearch() }} />;
}

/** That the step could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { from, workflow, step } = Route.useParams();
  return (
    <div className="space-y-3">
      <WorkflowTrail from={from} workflow={workflow} step={step} place={{ ...Route.useSearch() }} />
      <ReadTrouble what="this step" error={error} />
    </div>
  );
}
