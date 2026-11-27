import { ArrowUpDown, LayoutGrid, List } from 'lucide-react';
import { Chip, ChipGroup, Segment, SegmentedButton } from '@/components/ui/ds';
import { CLOSED_PHASES, OPEN_PHASES, PHASE_WORDS, type InboxView } from '@/lib/inbox';
import type { InboxPage } from '@/lib/api/inbox';
import { InboxSearch } from './InboxSearch';

/** How the page lays its cards out: as a grid of frames or a list of rows. */
export type Layout = 'grid' | 'list';

/**
 * The segments' look in this toolbar: the kit swaps a chosen segment's icon for a check, which is hidden here, and the icon sits beside
 * its word.
 */
const SEGMENT = { icon: 'hidden', label: 'flex items-center gap-2 whitespace-nowrap' } as const;

/** A segment at the width of its word, so the segmented choices keep their content's width and the search bar takes the rest of the row. */
const FIT = 'flex-none basis-auto';

/**
 * The Inbox's toolbar: the search bar, the sort (Newest or Oldest) and the layout (Grid or List), each a segmented choice with an icon
 * beside its word. The sort lives in the address; the layout is the browser's (`onLayout`).
 */
export function InboxToolbar({
  view,
  labels,
  counts,
  layout,
  onLayout,
  onSearch,
}: {
  view: InboxView;
  labels: InboxPage['labels'];
  counts: InboxPage['counts'];
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onSearch: (patch: Partial<InboxView>) => void;
}) {
  return (
    <div data-inbox-toolbar className="flex flex-wrap items-start gap-3 @3xl/page:flex-nowrap">
      <InboxSearch view={view} labels={labels} counts={counts} onSearch={onSearch} />
      <SegmentedButton
        aria-label="Sort"
        className="w-auto shrink-0"
        disallowEmptySelection
        selectedKeys={[view.sort ?? 'newest']}
        onSelectionChange={(keys) => onSearch({ sort: keys.has('oldest') ? 'oldest' : undefined, older: undefined })}
      >
        <Segment id="newest" classNames={SEGMENT} className={FIT}>
          <ArrowUpDown aria-hidden="true" size={16} />
          Newest
        </Segment>
        <Segment id="oldest" classNames={SEGMENT} className={FIT}>
          <ArrowUpDown aria-hidden="true" size={16} />
          Oldest
        </Segment>
      </SegmentedButton>
      <SegmentedButton
        aria-label="Layout"
        className="w-auto shrink-0"
        disallowEmptySelection
        selectedKeys={[layout]}
        onSelectionChange={(keys) => onLayout(keys.has('list') ? 'list' : 'grid')}
      >
        <Segment id="grid" classNames={SEGMENT} className={FIT}>
          <LayoutGrid aria-hidden="true" size={16} />
          Grid
        </Segment>
        <Segment id="list" classNames={SEGMENT} className={FIT}>
          <List aria-hidden="true" size={16} />
          List
        </Segment>
      </SegmentedButton>
    </div>
  );
}

/**
 * Open or Closed, each with how many cards it holds as the labels and words keep them, and under it the state chips of the side shown,
 * each with its count: All, then the phases. The counts are the list's own, never counted from the cards on the page.
 */
export function InboxSides({
  view,
  counts,
  onSearch,
}: {
  view: InboxView;
  counts: InboxPage['counts'];
  onSearch: (patch: Partial<InboxView>) => void;
}) {
  const closed = view.cards === 'closed';
  const phases = closed ? CLOSED_PHASES : OPEN_PHASES;
  const open = OPEN_PHASES.reduce((sum, phase) => sum + counts[phase], 0);
  const over = CLOSED_PHASES.reduce((sum, phase) => sum + counts[phase], 0);
  const side = closed ? over : open;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedButton
        aria-label="Which cards"
        disallowEmptySelection
        selectedKeys={[closed ? 'closed' : 'open']}
        onSelectionChange={(keys) => onSearch({ cards: keys.has('closed') ? 'closed' : undefined, phase: undefined, older: undefined })}
      >
        <Segment id="open">
          Open{' '}
          <span data-cards-count="open" className="font-mono">
            {open}
          </span>
        </Segment>
        <Segment id="closed">
          Closed{' '}
          <span data-cards-count="closed" className="font-mono">
            {over}
          </span>
        </Segment>
      </SegmentedButton>
      <ChipGroup
        aria-label="State"
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[view.phase ?? 'all']}
        onSelectionChange={(keys) => {
          const [key] = [...keys];
          onSearch({ phase: phases.find((phase) => phase === key), older: undefined });
        }}
      >
        <Chip id="all" variant="filter">
          All <span className="font-mono">{side}</span>
        </Chip>
        {phases.map((phase) => (
          <Chip key={phase} id={phase} variant="filter">
            {PHASE_WORDS[phase]} <span className="font-mono">{counts[phase]}</span>
          </Chip>
        ))}
      </ChipGroup>
    </div>
  );
}
