import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { loadRuns, RunsFailed, RunsLoading, RunsPage } from '../components/run/RunsPage';
import { labelSearch } from '../lib/api/labels.ts';
import { finishedSearch, trailSearch } from '../lib/finished';

/** The runs of every factory, the page's trail through the finished runs and its label selector in its search. */
export const Route = createFileRoute('/runs/')({
  validateSearch: (search: Record<string, unknown>) => ({ ...finishedSearch(search), ...labelSearch(search) }),
  loaderDeps: ({ search }) => ({ older: search.older, l: search.l }),
  loader: ({ context, deps }) =>
    loadRuns(context.queryClient, { ...deps, factory: undefined }, () => {
      throw redirect({ to: '/runs', search: (prev) => trailSearch(prev, []), replace: true });
    }),
  component: Page,
  staticData: { frame: 'bleed' },
  pendingComponent: RunsLoading,
  errorComponent: RunsFailed,
});

/** The runs page, read off its address; a label picked is written to it, the trail dropped. */
function Page() {
  const search = Route.useSearch();

  const navigate = useNavigate({ from: Route.fullPath });
  return <RunsPage at={{ ...search }} onLabel={(next) => void navigate({ search: (prev) => ({ ...prev, l: next, older: undefined }) })} />;
}
