import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router';
import { loadRuns, RunsFailed, RunsLoading, RunsPage } from '../components/run/RunsPage';
import { labelSearch } from '../lib/api/labels.ts';
import { finishedSearch, trailSearch } from '../lib/finished';

/** The runs of the factory its path names, the page's trail through the finished runs and its label selector in its search. */
export const Route = createFileRoute('/factories/$factory_/runs/')({
  validateSearch: (search: Record<string, unknown>) => ({ ...finishedSearch(search), ...labelSearch(search) }),
  loaderDeps: ({ search }) => ({ older: search.older, l: search.l }),
  loader: ({ context, deps, params }) =>
    loadRuns(context.queryClient, { ...deps, factory: params.factory }, () => {
      throw redirect({ to: '/factories/$factory/runs', params, search: (prev) => trailSearch(prev, []), replace: true });
    }),
  component: Page,
  staticData: { frame: 'bleed' },
  pendingComponent: RunsLoading,
  errorComponent: RunsFailed,
});

/** The runs page, read off its address; a label picked is written to it, the trail dropped. */
function Page() {
  const search = Route.useSearch();
  const { factory } = Route.useParams();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <RunsPage
      at={{ ...search, factory }}
      onLabel={(next) => void navigate({ search: (prev) => ({ ...prev, l: next, older: undefined }) })}
    />
  );
}
