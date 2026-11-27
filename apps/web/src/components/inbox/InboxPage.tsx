import { useState } from 'react';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Body, Button } from '@/components/ui/ds';
import { Pager, SectionHead } from '@/components/look';
import { chainsQuery, inboxPageQuery, searchQuery } from '@/lib/api/inbox';
import { trailOf } from '@/lib/finished';
import { chainsOf, chainsPulled, inboxAskedOf, INBOX_PAGE, TRAIL_MARK, type InboxView } from '@/lib/inbox';
import { elsewhereLine, everyFactory, suggestedAsk, withoutFactory } from '@/lib/searchBar';
import { readStored, store } from '@/lib/stored';
import { CardChain } from './CardChain';
import { CARD_LEAST, InboxCard, InboxCardRow } from './InboxCard';
import { InboxSides, InboxToolbar, type Layout } from './InboxToolbar';

/** The key the browser keeps the layout under: Grid until a person picks List. */
const LAYOUT_KEY = 'nemia.inbox.layout';

/** The layout kept in this browser: Grid the first time. */
const keptLayout = () => readStored<Layout>(LAYOUT_KEY, (raw) => (raw === 'list' ? 'list' : raw === 'grid' ? 'grid' : undefined), 'grid');

/** The factory the filters keep the page to: the one its path names, else the one a `factory=` label picks. */
const scopeOf = (at: InboxView) =>
  at.factory ??
  (at.l ?? '')
    .split(',')
    .find((term) => term.trim().startsWith('factory='))
    ?.trim()
    .slice('factory='.length);

/**
 * What the page says where the filters keep no card: which cards were searched, where some card does match, and the ways out: the other
 * side, and every factory where a factory kept the search.
 */
function NothingFound({ at, onSearch }: { at: InboxView; onSearch: (patch: Partial<InboxView>) => void }) {
  const navigate = useNavigate();
  const scope = scopeOf(at);
  const side = at.cards === 'closed' ? 'closed' : 'open';
  const elsewhere = useQuery({ ...searchQuery(everyFactory(suggestedAsk(at, '')), undefined), enabled: scope !== undefined }).data;
  const line =
    elsewhere === undefined
      ? null
      : elsewhereLine({ total: elsewhere.total, factories: elsewhere.entries.flatMap((e) => e.factory ?? []) }, side);
  const what = at.search === undefined ? 'matches these filters' : `matches “${at.search}”`;
  return (
    <div data-filtered-out className="flex flex-col items-start gap-2 border border-dashed border-outline-variant p-7">
      <Body size="large" component="span">{`No ${side} card${scope === undefined ? '' : ` of ${scope}`} ${what}.`}</Body>
      {line !== null && (
        <Body size="small" component="span" colorRole="on-surface-variant">
          {line}
        </Body>
      )}
      <div className="mt-1 flex gap-3">
        <Button
          variant="outlined"
          size="small"
          onPress={() => onSearch({ cards: side === 'open' ? 'closed' : undefined, phase: undefined, older: undefined })}
        >
          {side === 'open' ? 'Search closed cards' : 'Search open cards'}
        </Button>
        {scope !== undefined && (
          <Button
            variant="outlined"
            size="small"
            onPress={() =>
              void navigate({ to: '/inbox', search: { search: at.search, l: withoutFactory(at.l), cards: at.cards, phase: at.phase } })
            }
          >
            Every factory
          </Button>
        )}
      </div>
    </div>
  );
}

/** What the page says where no card is shown: that none is filed, or that none is in the factory, with the way on. */
function NoneShown({ factory }: { factory: string | undefined }) {
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

/** The line under the bar while a filter is set: how many cards the filters keep, and the key that takes every filter off. */
function FilterLine({ total, onClear }: { total: number; onClear: () => void }) {
  return (
    <div data-filter-count className="flex items-center gap-3">
      <Body size="small" component="span" colorRole="on-surface-variant">
        {total} {total === 1 ? 'card' : 'cards'}
      </Body>
      <Button variant="text" size="xsmall" onPress={onClear}>
        Clear filters
      </Button>
    </div>
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
  const filtered = at.search !== undefined || at.l !== undefined || at.phase !== undefined;
  const none = page.entries.length === 0 && grouped.length === 0;
  return (
    <article className="flex flex-col gap-6">
      <InboxToolbar
        view={at}
        labels={page.labels}
        counts={page.counts}
        layout={layout}
        onLayout={(next) => {
          setLayout(next);
          store(LAYOUT_KEY, next);
        }}
        onSearch={onSearch}
      />
      {filtered && (
        <FilterLine
          total={page.entries.length + trail.length * INBOX_PAGE + page.remaining}
          onClear={() => onSearch({ search: undefined, l: undefined, phase: undefined, older: undefined })}
        />
      )}
      <InboxSides view={at} counts={page.counts} onSearch={onSearch} />
      {grouped.length > 0 && (
        <section aria-label="Chains" className="flex flex-col gap-(--frame-gutter)">
          <SectionHead count={grouped.length} word={grouped.length === 1 ? 'Chain' : 'Chains'} tone="rest" />
          {grouped.map((columns) => (
            <CardChain key={columns[0]?.[0]?.name} members={columns} />
          ))}
        </section>
      )}
      <section aria-label="Cards" className="flex flex-col gap-(--frame-gutter)">
        {page.entries.length > 0 && (
          <SectionHead
            count={page.entries.length + trail.length * INBOX_PAGE + page.remaining}
            word={page.entries.length + trail.length * INBOX_PAGE + page.remaining === 1 ? 'Card' : 'Cards'}
            tone="rest"
          />
        )}
        {none && (filtered ? <NothingFound at={at} onSearch={onSearch} /> : <NoneShown factory={at.factory} />)}
        {layout === 'grid' ? (
          <ul
            className="grid gap-(--frame-gutter)"
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${CARD_LEAST}), 1fr))` }}
          >
            {page.entries.map((entry) => (
              <li key={entry.file} className="min-w-0">
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
            next={page.next === null ? null : `${TRAIL_MARK}${page.next}`}
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
