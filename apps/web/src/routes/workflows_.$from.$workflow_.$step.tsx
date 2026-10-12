import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Skills } from '../components/AgentParts';
import { StepHire } from '../components/StepHire';
import { RecentRuns, StepAgent, StepTold, StepWritten } from '../components/StepParts';
import { stepQuery } from '../lib/api';
import { fromWord, pagePlaceOf } from '../lib/factories';

/**
 * The page of a workflow's step, at /workflows/$from/$workflow/$step: `workflows_` and `$workflow_` draw it on its own, not inside the
 * Workflows page nor the workflow's, neither of which has an outlet for it. `?factory=` and `?repo=` are the place it is read in.
 */
export const Route = createFileRoute('/workflows_/$from/$workflow_/$step')({
  validateSearch: pagePlaceOf,
  loaderDeps: ({ search: { factory, repo } }) => ({ ...(factory && { factory }), ...(repo && { repo }) }),
  loader: ({ context, params, deps }) => context.queryClient.ensureQueryData(stepQuery(params.from, params.workflow, params.step, deps)),
  component: StepPage,
  errorComponent: ({ error }) => (
    <div className="space-y-3">
      <BackToWorkflow />
      <p className="text-sm text-red-600">Could not load this step: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  ),
});

/**
 * One step of a workflow, to read, in the factory picked: its agent, hired or named by its file (`StepAgent`), with what that agent says
 * it can do (`skills:`), a description of the work that fences nothing; hired and fired there (`StepHire`); what a run of it will be
 * told, read now, each layer beside where it is edited; its newest runs; then its file's own words and keys (`StepWritten`). It edits and
 * starts nothing: each layer's home and its workflow's page do; a hire and a fire are the factory's.
 */
function StepPage() {
  const { from, workflow, step } = Route.useParams();
  const place = Route.useSearch();
  const { data: page } = useSuspenseQuery(stepQuery(from, workflow, step, place));

  return (
    <article className="space-y-6">
      <BackToWorkflow />

      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="font-mono text-base font-semibold">{page.step}</h1>
          <span className="text-xs text-muted-foreground">
            a step of <span className="font-mono text-foreground">{page.workflow}</span>
          </span>
          <span
            data-from={page.from}
            className={`rounded-full px-2 py-0.5 text-[11px] leading-none font-medium ${
              page.from === 'yours'
                ? 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300'
                : 'bg-neutral-100 text-muted-foreground dark:bg-neutral-800'
            }`}
          >
            {fromWord(page.from, place.factory)}
          </span>
        </div>
        <StepAgent page={page} />
        <Skills skills={page.agentSkills} className="pl-3" />
        <StepHire from={from} workflow={workflow} step={step} place={place} where="page" />
      </header>

      <StepTold page={page} place={place} />
      <RecentRuns page={page} />

      <StepWritten page={page} />
    </article>
  );
}

/** Back to the page of the step's workflow, in the place this page is read in. */
function BackToWorkflow() {
  const { from, workflow } = Route.useParams();
  const place = Route.useSearch();
  return (
    <Link
      to="/workflows/$from/$workflow"
      params={{ from, workflow }}
      search={place}
      className="font-mono text-sm text-muted-foreground hover:text-foreground"
    >
      ← {workflow}
    </Link>
  );
}
