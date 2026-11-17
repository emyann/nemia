import { useSuspenseQuery } from '@tanstack/react-query';
import { Tag } from '@/components/ui/ds';
import { TextLink } from '@/components/look';
import { ListFilter, NothingMatches } from '../filter/ListFilter';
import { HarnessImport } from './HarnessImport';
import { LIBRARY_KINDS, libraryQuery, type LibraryItem, type LibraryKind } from '@/lib/api/storeLibrary';
import { matches, useFilterText } from '@/lib/listFilter';

/** Each kind's heading on the Library page. */
const HEADINGS: Record<LibraryKind, string> = { Skill: 'Skills', Agent: 'Agents', McpServer: 'MCP servers', Workflow: 'Workflows' };

/**
 * The store's library, in no factory: each kind's items, the user library's and Nemia's builtins, each with what it says it is for, the
 * factories that use it, a link to each, and a copy of a builtin that has changed since it was made said so; and the agents a harness
 * keeps for its user, to import. A factory adds an item on its settings page. The items are filtered by the address's `query` (`?q=`) as
 * a person types, each keystroke handed to `onQuery`: while it holds a text, a kind it keeps nothing of is not drawn, and where it keeps
 * nothing at all the page says nothing matches.
 */
export function LibraryPage({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  const { data } = useSuspenseQuery(libraryQuery());
  const [text, setText] = useFilterText(query, onQuery);
  const filtering = text.trim() !== '';
  const kept = data.filter((one) => matches(text, one.name, one.description));
  const kinds = LIBRARY_KINDS.filter((kind) => !filtering || kept.some((one) => one.kind === kind));
  return (
    <article className="flex flex-col gap-8" data-library-page>
      <p className="text-body-medium text-muted-foreground">
        What the store keeps for every factory: the user library and Nemia's builtins. A factory resolves an item once it has added it, on
        its settings page; a workflow is attached.
      </p>
      <ListFilter label="Filter the library" text={text} onText={setText} />
      {kinds.length === 0 && <NothingMatches text={text} onClear={() => setText('')} />}
      {kinds.map((kind) => (
        <LibrarySection key={kind} kind={kind} items={kept.filter((one) => one.kind === kind)} />
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
            <li key={item.name} data-library-item={`${kind}.${item.name}`} className="flex flex-col gap-0.5">
              <div className="flex flex-wrap items-center gap-2 text-body-medium">
                <span className="font-mono">{item.name}</span>
                <Tag variant="outlined" data-library-origin={item.origin}>
                  {item.origin === 'builtin' ? "Nemia's" : 'the user library'}
                </Tag>
                {item.builtinChanged && <Tag data-builtin-changed>the builtin changed since this copy</Tag>}
                <span className="text-body-small text-muted-foreground">
                  {item.factories.length === 0 ? 'used by no factory' : 'used by'}
                </span>
                {item.factories.map((factory) => (
                  <TextLink key={factory} to="/factories/$factory/settings" params={{ factory }} className="font-mono text-body-small">
                    {factory}
                  </TextLink>
                ))}
              </div>
              {item.description && (
                <p data-library-description className="text-body-small text-muted-foreground">
                  {item.description}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
