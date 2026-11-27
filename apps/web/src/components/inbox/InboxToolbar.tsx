import { useState } from 'react';
import { ArrowUpDown, LayoutGrid, List } from 'lucide-react';
import { Chip, ChipGroup, Segment, SegmentedButton } from '@/components/ui/ds';
import { CutSearch, type CutChip } from '@/components/look';
import { CLOSED_PHASES, OPEN_PHASES, PHASE_WORDS, type InboxView } from '@/lib/inbox';
import type { InboxPage } from '@/lib/api/inbox';

/** How the page lays its cards out: as a grid of frames or a list of rows. */
export type Layout = 'grid' | 'list';

/** The label selector of the address as the chips of the bar: one per `key=value`, each said `key: value`. */
const labelChips = (selector: string | undefined) =>
  (selector ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term !== '')
    .map((term) => ({ id: term, label: term.replace('=', ': ') }));

/**
 * The segments' look in this toolbar: the kit swaps a chosen segment's icon for a check, which is hidden here, and the icon sits beside
 * its word.
 */
const SEGMENT = { icon: 'hidden', label: 'flex items-center gap-2 whitespace-nowrap' } as const;

/**
 * The search bar of the Inbox: the chips of what was picked — the words searched and each label — and the words being typed, with the
 * labels in use suggested, each with how many cards hold it. Enter keeps the words as the page's search; picking a suggestion adds its
 * label; `/` focuses the bar. The address holds all of it.
 */
function SearchBar({
  view,
  labels,
  onSearch,
}: {
  view: InboxView;
  labels: InboxPage['labels'];
  onSearch: (patch: Partial<InboxView>) => void;
}) {
  const [text, setText] = useState('');
  const picked = labelChips(view.l);
  const chips: CutChip[] = [...(view.search === undefined ? [] : [{ id: 'q', label: `“${view.search}”` }]), ...picked];
  const word = text.trim().toLowerCase();
  const suggestions = labels
    .filter((l) => !picked.some((chip) => chip.id === `${l.key}=${l.value}`) && `${l.key}=${l.value}`.toLowerCase().includes(word))
    .slice(0, 8)
    .map((l) => ({ id: `${l.key}=${l.value}`, label: `${l.key}: ${l.value}`, hint: String(l.cards) }));
  const label = (ids: readonly string[]) => (ids.length === 0 ? undefined : ids.join(','));
  return (
    <CutSearch
      label="Search the cards"
      placeholder="Search the cards: words, labels"
      chips={chips}
      onRemove={(id) =>
        id === 'q'
          ? onSearch({ search: undefined, older: undefined })
          : onSearch({ l: label(picked.map((c) => c.id).filter((c) => c !== id)), older: undefined })
      }
      text={text}
      onText={setText}
      suggestions={suggestions}
      onPick={(id) => {
        setText('');
        onSearch({ l: label([...picked.map((c) => c.id), id]), older: undefined });
      }}
      onSubmit={(words) => {
        setText('');
        onSearch({ search: [view.search, words].filter(Boolean).join(' '), older: undefined });
      }}
      className="min-w-48 flex-1"
    />
  );
}

/**
 * The Inbox's toolbar: the search bar, the sort (Newest or Oldest) and the layout (Grid or List), each a segmented choice with an icon
 * beside its word. The sort lives in the address; the layout is the browser's (`onLayout`).
 */
export function InboxToolbar({
  view,
  labels,
  layout,
  onLayout,
  onSearch,
}: {
  view: InboxView;
  labels: InboxPage['labels'];
  layout: Layout;
  onLayout: (layout: Layout) => void;
  onSearch: (patch: Partial<InboxView>) => void;
}) {
  return (
    <div data-inbox-toolbar className="flex flex-wrap items-start gap-3 sm:flex-nowrap">
      <SearchBar view={view} labels={labels} onSearch={onSearch} />
      <SegmentedButton
        aria-label="Sort"
        disallowEmptySelection
        selectedKeys={[view.sort ?? 'newest']}
        onSelectionChange={(keys) => onSearch({ sort: keys.has('oldest') ? 'oldest' : undefined, older: undefined })}
      >
        <Segment id="newest" classNames={SEGMENT}>
          <ArrowUpDown aria-hidden="true" size={16} />
          Newest
        </Segment>
        <Segment id="oldest" classNames={SEGMENT}>
          <ArrowUpDown aria-hidden="true" size={16} />
          Oldest
        </Segment>
      </SegmentedButton>
      <SegmentedButton
        aria-label="Layout"
        disallowEmptySelection
        selectedKeys={[layout]}
        onSelectionChange={(keys) => onLayout(keys.has('list') ? 'list' : 'grid')}
      >
        <Segment id="grid" classNames={SEGMENT}>
          <LayoutGrid aria-hidden="true" size={16} />
          Grid
        </Segment>
        <Segment id="list" classNames={SEGMENT}>
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
