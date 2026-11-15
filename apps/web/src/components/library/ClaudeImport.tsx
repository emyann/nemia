import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CLAUDE_AGENTS,
  claudeAgentsQuery,
  importablesOf,
  importAgent,
  type Importable,
  type LibraryItem,
  libraryQuery,
} from '../../lib/api/storeLibrary.ts';

/**
 * Claude Code's own agents on the api's machine (`~/.claude/agents`), each with an Import that copies it into the user library through the
 * api's copy: one the library has an agent of its name already is said so and offers none, one that does not read says
 * why; where there is no such folder, the store's refusal, as it comes.
 */
export function ClaudeImport({ items }: { items: readonly LibraryItem[] }) {
  const queryClient = useQueryClient();
  const sources = useQuery(claudeAgentsQuery());
  const copy = useMutation({
    mutationFn: importAgent,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: libraryQuery().queryKey }),
  });
  const offered = sources.data ? importablesOf(sources.data, items) : [];
  return (
    <section aria-label="Import from Claude Code" data-claude-import className="flex flex-col gap-2">
      <h2 className="text-title-medium">Import from Claude Code</h2>
      <p className="text-body-medium text-muted-foreground">
        The agents in <code className="font-mono text-body-small">{CLAUDE_AGENTS}</code> on the api's machine. An import copies one into the
        user library, with the skills it gives.
      </p>
      {sources.error && (
        <p data-claude-import-unread className="text-body-medium text-muted-foreground">
          {sources.error.message}
        </p>
      )}
      {sources.data && offered.length === 0 && <p className="text-body-medium text-muted-foreground">No agent there.</p>}
      {offered.length > 0 && (
        <ul className="flex flex-col gap-2">
          {offered.map((one) => (
            <ImportRow key={one.file} one={one} pending={copy.isPending} onImport={() => copy.mutate(one.file)} />
          ))}
        </ul>
      )}
      {copy.error && (
        <Alert variant="destructive" data-claude-import-refused>
          <AlertTitle>Not imported</AlertTitle>
          <AlertDescription>{copy.error.message}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}

/** One agent of Claude Code's: its name, what it is for or why it does not read, and its Import, or that the library holds its name. */
function ImportRow({ one, pending, onImport }: { one: Importable; pending: boolean; onImport: () => void }) {
  return (
    <li data-claude-agent={one.name} className="flex flex-wrap items-center gap-2 text-body-medium">
      <span className="font-mono">{one.name}</span>
      {one.error === null ? (
        one.description !== null && <span className="text-body-small text-muted-foreground">{one.description}</span>
      ) : (
        <span className="text-body-small text-failure">{one.error}</span>
      )}
      {one.held ? (
        <Badge variant="outline" className="ml-auto" data-claude-held>
          in the library
        </Badge>
      ) : (
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          data-claude-import-press={one.name}
          isDisabled={pending || one.error !== null}
          onPress={onImport}
        >
          Import
        </Button>
      )}
    </li>
  );
}
