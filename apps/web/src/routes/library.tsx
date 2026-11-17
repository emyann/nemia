import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LibraryPage } from '@/components/library/LibraryPage';
import { LibraryReading } from '@/components/library/LibraryReading';
import { libraryQuery } from '../lib/api/storeLibrary.ts';
import { filterOf } from '../lib/listFilter';

export const Route = createFileRoute('/library')({
  validateSearch: filterOf,
  loader: ({ context }) => context.queryClient.ensureQueryData(libraryQuery()),
  component: Page,
  pendingComponent: LibraryReading,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not read the library: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/** The Library, read off its address; its filter is written to it as a person types (`?q=`). */
function Page() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <LibraryPage
      query={q ?? ''}
      onQuery={(query) => void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), replace: true, resetScroll: false })}
    />
  );
}
