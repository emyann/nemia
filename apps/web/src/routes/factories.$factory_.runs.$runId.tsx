import { createFileRoute, redirect } from '@tanstack/react-router';
import { RunTrail, RunPage } from '../components/run/RunPage';
import { loadRun } from '../lib/runView';
import { barValue } from '../lib/bar';
import { objectHome } from '../lib/factoryAddress';

/**
 * A run under its factory's path, the factory's pane beside it: the run's page as at `/runs/<id>`. A run of another factory, or of the
 * default one, is loaded again at the address it belongs at (`objectHome`), its search kept; `step` opens that step in the bar.
 */
export const Route = createFileRoute('/factories/$factory_/runs/$runId')({
  validateSearch: (search: Record<string, unknown>) =>
    (typeof search.step === 'string' && search.step ? { step: search.step } : {}) satisfies { step?: string } as { step?: string },
  beforeLoad: ({ search, params }) => {
    if (!search.step) return;
    const bar = barValue({ kind: 'step', run: params.runId, step: search.step });
    throw redirect({ to: '/factories/$factory/runs/$runId', params, search: { bar }, replace: true });
  },
  loader: async ({ context, params, location }) => {
    const loaded = await loadRun(context.queryClient, params.runId);
    const home = loaded.gone ? undefined : objectHome(`/runs/${encodeURIComponent(params.runId)}`, loaded.namespace, params.factory);
    if (home) throw redirect({ href: `${home}${location.searchStr}`, replace: true });
    return loaded;
  },
  component: Page,
  errorComponent: Failed,
});

/** The run's page, read off its address. */
function Page() {
  return <RunPage runId={Route.useParams().runId} gone={Route.useLoaderData().gone} />;
}

/** That the run could not be loaded, and why, under where its page is. */
function Failed({ error }: { error: unknown }) {
  const { runId } = Route.useParams();
  return (
    <div className="space-y-3">
      <RunTrail runId={runId} />
      <p className="text-body-medium text-failure">Could not load this run: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
