import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  agentSourcesQuery,
  importablesOf,
  importAgent,
  type Importable,
  type LibraryItem,
  libraryQuery,
} from '../../lib/api/storeLibrary.ts';

/**
 * The agents a harness keeps for its user on the api's machine, each with an Import that copies it into the user library through the
 * api's copy: one the library has an agent of its name already is said so and offers none, one that does not read says why; a line
 * saying none where no harness keeps any there.
 */
export function HarnessImport({ items }: { items: readonly LibraryItem[] }) {
  const queryClient = useQueryClient();
  const sources = useQuery(agentSourcesQuery());
  const copy = useMutation({
    mutationFn: importAgent,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: libraryQuery().queryKey }),
  });
  const offered = sources.data ? importablesOf(sources.data, items) : [];
  return (
    <section aria-label="Import your own agents" data-harness-import className="flex flex-col gap-2">
      <h2 className="text-title-medium">Import your own agents</h2>
      <p className="text-body-medium text-on-surface-variant">
        The agents your harness keeps for you on the api's machine, outside any repository. An import copies one into the user library, with
        the skills it gives.
      </p>
      {sources.error && (
        <p data-harness-import-unread className="text-body-medium text-failure">
          {sources.error.message}
        </p>
      )}
      {sources.data && offered.length === 0 && (
        <p className="text-body-medium text-on-surface-variant">No agent of your own outside the library.</p>
      )}
      {offered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {offered.map((one) => (
            <ImportRow key={one.file} one={one} pending={copy.isPending} onImport={() => copy.mutate(one.file)} />
          ))}
        </ul>
      )}
      {copy.error && (
        <Alert variant="destructive" data-harness-import-refused>
          <AlertTitle>Not imported</AlertTitle>
          <AlertDescription>{copy.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** One agent a harness keeps: its name, what it is for or why it does not read, and its Import, or that the library holds its name. */
function ImportRow({ one, pending, onImport }: { one: Importable; pending: boolean; onImport: () => void }) {
  return (
    <li data-harness-agent={one.name} className="flex flex-wrap items-center gap-2 text-body-medium">
      <span className="font-mono">{one.name}</span>
      {one.error === null ? (
        one.description !== null && <span className="text-body-small text-on-surface-variant">{one.description}</span>
      ) : (
        <span className="text-body-small text-failure">{one.error}</span>
      )}
      {one.held ? (
        <Badge variant="outline" className="ml-auto" data-harness-held>
          in the library
        </Badge>
      ) : (
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          data-harness-import-press={one.name}
          isDisabled={pending || one.error !== null}
          onPress={onImport}
        >
          Import
        </Button>
      )}
    </li>
  );
}
