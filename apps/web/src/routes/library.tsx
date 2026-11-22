import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LibraryPage } from '@/components/library/LibraryPage';
import { LibraryReading } from '@/components/library/LibraryReading';
import { libraryQuery } from '../lib/api/storeLibrary.ts';
import { filterOf } from '../lib/listFilter';
import { ReadTrouble } from '@/components/frame/ReadTrouble';

export const Route = createFileRoute('/library')({
  validateSearch: filterOf,
  loader: ({ context }) => context.queryClient.ensureQueryData(libraryQuery()),
  component: Page,
  pendingComponent: LibraryReading,
  errorComponent: ({ error }) => <ReadTrouble what="the library" error={error} />,
});

/** The Library, read off its address; its filter is written to it as a person types (`?q=`). */
function Page() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <LibraryPage
      query={q ?? ''}
      onQuery={(query) =>
        void navigate({ search: (prev) => ({ ...prev, q: query || undefined }), hash: true, replace: true, resetScroll: false })
      }
    />
  );
}
