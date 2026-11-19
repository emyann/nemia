import { createFileRoute, redirect } from '@tanstack/react-router';
import { RunTrail, RunPage } from '../components/run/RunPage';
import { loadRun } from '../lib/runView';
import { barValue } from '../lib/bar';
import { objectHome } from '../lib/factoryAddress';

/**
 * `step`, the old address of one step of the run and the one a message names a step by (`broughtOf`, `lib/stepLink.ts`), opens that
 * step in the frame's bar: the page is loaded again in place of that address, at `?bar=step:<run>/<step>`, so Back does not return to it.
 * A run of a named factory belongs under its factory's path (`objectHome`), where the page is loaded again, its search kept.
 */
export const Route = createFileRoute('/runs/$runId')({
  validateSearch: (search: Record<string, unknown>) =>
    (typeof search.step === 'string' && search.step ? { step: search.step } : {}) satisfies { step?: string } as { step?: string },
  beforeLoad: ({ search, params }) => {
    if (!search.step) return;
    const bar = barValue({ kind: 'step', run: params.runId, step: search.step });
    throw redirect({ to: '/runs/$runId', params, search: { bar }, replace: true });
  },
  loader: async ({ context, params, location }) => {
    const loaded = await loadRun(context.queryClient, params.runId);
    const home = loaded.gone ? undefined : objectHome(`/runs/${encodeURIComponent(params.runId)}`, loaded.namespace, undefined);
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
