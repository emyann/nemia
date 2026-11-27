import { useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Body } from '@/components/ui/ds';
import { Pager, SectionHead } from '@/components/look';
import { chainsQuery, inboxPageQuery } from '@/lib/api/inbox';
import { trailOf } from '@/lib/finished';
import { chainsOf, chainsPulled, inboxAskedOf, INBOX_PAGE, type InboxView } from '@/lib/inbox';
import { readStored, store } from '@/lib/stored';
import { CardChain } from './CardChain';
import { InboxCard, InboxCardRow } from './InboxCard';
import { InboxSides, InboxToolbar, type Layout } from './InboxToolbar';

/** The key the browser keeps the layout under: Grid until a person picks List. */
const LAYOUT_KEY = 'nemia.inbox.layout';

/** The layout kept in this browser: Grid the first time. */
const keptLayout = () => readStored<Layout>(LAYOUT_KEY, (raw) => (raw === 'list' ? 'list' : raw === 'grid' ? 'grid' : undefined), 'grid');

/** What the page says where no card is shown: that none is there, or that none matches what was asked, with the way back. */
function NoneShown({ filtered, factory }: { filtered: boolean; factory: string | undefined }) {
  if (filtered) {
    return (
      <Body size="medium" data-filtered-out>
        No card matches.{' '}
        <Link to="." search={(prev) => ({ cards: prev.cards })} className="underline underline-offset-2">
          Clear the search
        </Link>
        .
      </Body>
    );
  }
  if (factory !== undefined) {
    return (
      <Body size="medium" data-filtered-out>
        No card of the factory <span className="font-mono">{factory}</span>.{' '}
        <Link to="/inbox" search={{}} replace className="underline underline-offset-2">
          Show every factory&apos;s
        </Link>
        .
      </Body>
    );
  }
  return (
    <Body size="medium" data-empty>
      The inbox is empty. File an idea with New card, or from the command line.
    </Body>
  );
}

/**
 * The Inbox: its search bar, its sort and its layout, Open or Closed with how many cards each holds and the state chips of the side
 * shown, the chains of the cards in play pulled out above the cards where nothing filters them, each whole, then one page of the
 * cards, in a grid or a list, and the pager. The address holds the words, the labels, the order, the side, the state and the page; the
 * layout is this browser's. Under a factory's path the page reads that factory's cards alone.
 */
export function InboxPage({ at, onSearch }: { at: InboxView; onSearch: (patch: Partial<InboxView>) => void }) {
  const [layout, setLayout] = useState(keptLayout);
  const pulled = chainsPulled(at);
  const { data: page } = useSuspenseQuery(inboxPageQuery(inboxAskedOf(at), at.factory));
  const chains = useQuery({ ...chainsQuery(at.factory), enabled: pulled }).data;
  const trail = trailOf(at);
  const grouped = pulled && chains !== undefined ? chainsOf(chains) : [];
  const filtered = at.q !== undefined || at.l !== undefined || at.state !== undefined;
  const none = page.entries.length === 0 && grouped.length === 0;
  return (
    <article className="space-y-6">
      <InboxToolbar
        view={at}
        labels={page.labels}
        layout={layout}
        onLayout={(next) => {
          setLayout(next);
          store(LAYOUT_KEY, next);
        }}
        onSearch={onSearch}
      />
      <InboxSides view={at} counts={page.counts} onSearch={onSearch} />
      {grouped.length > 0 && (
        <section aria-label="Chains" className="space-y-3">
          <SectionHead count={grouped.length} word={grouped.length === 1 ? 'Chain' : 'Chains'} tone="rest" />
          {grouped.map((columns) => (
            <CardChain key={columns[0]?.[0]?.name} members={columns} />
          ))}
        </section>
      )}
      <section aria-label="Cards" className="space-y-3">
        {page.entries.length > 0 && <SectionHead count={page.entries.length + trail.length * INBOX_PAGE + page.remaining} word="Cards" tone="rest" />}
        {none && <NoneShown filtered={filtered} factory={at.factory} />}
        {layout === 'grid' ? (
          <ul className="grid grid-cols-1 gap-4 @2xl/page:grid-cols-2 @5xl/page:grid-cols-3">
            {page.entries.map((entry) => (
              <li key={entry.file}>
                <InboxCard entry={entry} />
              </li>
            ))}
          </ul>
        ) : (
          <ul>
            {page.entries.map((entry) => (
              <InboxCardRow key={entry.file} entry={entry} />
            ))}
          </ul>
        )}
        {(trail.length > 0 || page.next !== null) && (
          <Pager
            noun="Cards"
            trail={trail}
            next={page.next}
            count={page.entries.length}
            total={trail.length * INBOX_PAGE + page.entries.length + page.remaining}
            size={INBOX_PAGE}
            ends={at.sort === 'oldest' ? ['Older', 'Newer'] : ['Newer', 'Older']}
          />
        )}
      </section>
    </article>
  );
}
