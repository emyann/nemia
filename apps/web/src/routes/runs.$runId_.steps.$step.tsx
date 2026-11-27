import { createFileRoute, redirect } from '@tanstack/react-router';
import { RunTrail } from '../components/run/RunPage';
import { StepPage } from '../components/step/StepPage';
import { loadRun } from '../lib/runView';
import { objectHome } from '../lib/factoryAddress';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

/**
 * The page of a step's session, at /runs/$runId/steps/$step: `$runId_` draws it on its own, not inside the run's page, which has no
 * outlet for it. A run of a named factory is loaded again at the address it belongs at (`objectHome`), its search kept.
 */
export const Route = createFileRoute('/runs/$runId_/steps/$step')({
  loader: async ({ context, params, location }) => {
    const loaded = await loadRun(context.queryClient, params.runId);
    const rest = `/runs/${encodeURIComponent(params.runId)}/steps/${encodeURIComponent(params.step)}`;
    const home = loaded.gone ? undefined : objectHome(rest, loaded.namespace, undefined);
    if (home) throw redirect({ href: `${home}${location.searchStr}`, replace: true });
    return loaded;
  },
  staticData: { frame: 'bleed' },
  component: Page,
  errorComponent: Failed,
});

/** The step's page, read off its address. */
function Page() {
  const { runId, step } = Route.useParams();
  return <StepPage runId={runId} name={step} gone={Route.useLoaderData().gone} />;
}

/** That the run could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { runId, step } = Route.useParams();
  return (
    <div className="space-y-3 p-4">
      <RunTrail runId={runId} step={step} />
      <ReadTrouble what="this run" error={error} />
    </div>
  );
}
