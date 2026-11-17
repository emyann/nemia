import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { TextLink } from '@/components/look';
import { HarnessImport } from '@/components/library/HarnessImport';
import { LibraryReading } from '@/components/library/LibraryReading';
import { LIBRARY_KINDS, libraryQuery, type LibraryItem, type LibraryKind } from '../lib/api/storeLibrary.ts';

export const Route = createFileRoute('/library')({
  loader: ({ context }) => context.queryClient.ensureQueryData(libraryQuery()),
  component: LibraryPage,
  pendingComponent: LibraryReading,
  errorComponent: ({ error }) => (
    <p className="text-body-medium text-failure">
      Could not read the library: {error instanceof Error ? error.message : String(error)}. Is the api running (<code>npm run dev</code>)?
    </p>
  ),
});

/** Each kind's heading on the Library page. */
const HEADINGS: Record<LibraryKind, string> = { Skill: 'Skills', Agent: 'Agents', McpServer: 'MCP servers', Workflow: 'Workflows' };

/**
 * The store's library, in no factory: each kind's items, the user library's and Nemia's builtins, each with the factories that use it,
 * a link to each, and a copy of a builtin that has changed since it was made said so; and the agents a harness keeps for its user, to
 * import. A factory adds an item on its settings page.
 */
function LibraryPage() {
  const { data } = useSuspenseQuery(libraryQuery());
  return (
    <article className="flex flex-col gap-8" data-library-page>
      <p className="text-body-medium text-muted-foreground">
        What the store keeps for every factory: the user library and Nemia's builtins. A factory resolves an item once it has added it, on
        its settings page; a workflow is attached.
      </p>
      {LIBRARY_KINDS.map((kind) => (
        <LibrarySection key={kind} kind={kind} items={data.filter((one) => one.kind === kind)} />
      ))}
      <HarnessImport items={data} />
    </article>
  );
}

/** One kind of the library: its items, or a line saying it holds none. */
function LibrarySection({ kind, items }: { kind: LibraryKind; items: readonly LibraryItem[] }) {
  return (
    <section aria-label={HEADINGS[kind]} data-library-kind={kind} className="flex flex-col gap-2">
      <h2 className="text-title-medium">{HEADINGS[kind]}</h2>
      {items.length === 0 ? (
        <p className="text-body-medium text-muted-foreground">None in the library.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.name} data-library-item={`${kind}.${item.name}`} className="flex flex-wrap items-center gap-2 text-body-medium">
              <span className="font-mono">{item.name}</span>
              <Badge variant="outline" data-library-origin={item.origin}>
                {item.origin === 'builtin' ? "Nemia's" : 'the user library'}
              </Badge>
              {item.builtinChanged && (
                <Badge variant="secondary" data-builtin-changed>
                  the builtin changed since this copy
                </Badge>
              )}
              <span className="text-body-small text-muted-foreground">
                {item.factories.length === 0 ? 'used by no factory' : 'used by'}
              </span>
              {item.factories.map((factory) => (
                <TextLink key={factory} to="/factories/$factory/settings" params={{ factory }} className="font-mono text-body-small">
                  {factory}
                </TextLink>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
