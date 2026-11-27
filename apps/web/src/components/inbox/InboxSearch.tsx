import { useDeferredValue, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { CutSearch, type CutSearchItem, type CutSearchSection } from '@/components/look';
import { searchQuery, type InboxEntry, type InboxPage, type InboxSearched } from '@/lib/api/inbox';
import { cardTag, PHASE_WORDS, type InboxView } from '@/lib/inbox';
import { filled } from '@/lib/meaning';
import { readStored, store } from '@/lib/stored';
import {
  barChips,
  barOffers,
  keptRecent,
  pickedPhase,
  recentOf,
  searchKeys,
  suggestedAsk,
  viewOfRecent,
  type Offer,
} from '@/lib/searchBar';
import { cn } from '@/lib/utils';

/** The key the browser keeps Recent under: the last filter sets used, newest first. */
const RECENT_KEY = 'nemia.inbox.recent';

/** The sets Recent held in this browser, one a line: none where nothing is kept, none empty and none twice. */
const keptSets = () => readStored<string[]>(RECENT_KEY, (raw) => [...new Set(raw.split('\n').filter((one) => one !== ''))], []);

/** How a filter is said in the panel: the key and its value, a state by its word. */
const wordOf = (key: string, value: string) =>
  key === 'state' ? (PHASE_WORDS[value as keyof typeof PHASE_WORDS] ?? value).toLowerCase() : value;

/** The rows of "Filter by": one a key, with a few of its values, most held first, and how many values it has. */
function keyRows(keys: ReturnType<typeof searchKeys>) {
  return keys.map((one) => {
    const top = [...one.values].sort((a, b) => b.cards - a.cards).slice(0, 3);
    const shown = top.map((value) => wordOf(one.key, value.value)).join(', ');
    return {
      id: `${one.key}:`,
      label: `${one.key}: ${shown}`,
      hint:
        one.key === 'state'
          ? undefined
          : one.values.length === 0
            ? undefined
            : `${one.values.length} ${one.values.length === 1 ? 'value' : 'values'}`,
      keeps: true,
    } satisfies CutSearchItem;
  });
}

/** The filter sets of Recent as rows: each its chips, said as the bar says them. */
function recentRows(sets: readonly string[]) {
  return sets.map(
    (set) =>
      ({
        id: `recent:${set}`,
        label: barChips(viewOfRecent(set))
          .map((chip) => chip.label)
          .join(' · '),
      }) satisfies CutSearchItem,
  );
}

/** The offers a typed word brings, as rows: the key and the value, the typed letters in bold, and how many cards hold it. */
const offerRows = (offers: readonly Offer[], text: string) =>
  offers.map(
    (offer) =>
      ({
        id: `${offer.key}=${offer.value}`,
        label: `${offer.key}: ${wordOf(offer.key, offer.value)}`,
        words: text.trim().includes(':') ? text.trim().split(':').slice(1).join(':').trim() : text.trim(),
        hint: `${offer.cards} ${offer.cards === 1 ? 'card' : 'cards'}`,
      }) satisfies CutSearchItem,
  );

/** A card's mark in the panel: a dot in its state's meaning, hollow where its state has none. */
function Dot({ entry }: { entry: InboxEntry }) {
  const tag = cardTag(entry);
  return (
    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-full', tag === null ? 'border border-outline' : filled[tag.hue])} />
  );
}

/** The cards the words match, as rows: its dot, its title with the typed letters in bold, and the short tail of its name. */
const cardRows = (entries: readonly InboxEntry[], text: string) =>
  entries.map(
    (entry) =>
      ({
        id: `card:${entry.name}`,
        label: entry.title ?? entry.name,
        words: text.trim(),
        tail: entry.name.split('-').at(-1),
        lead: <Dot entry={entry} />,
      }) satisfies CutSearchItem,
  );

/** Whether `text` is a key and its colon, and perhaps the start of a value (`area:`, `state:wa`): it filters, it does not search. */
const keyed = (text: string, keys: ReturnType<typeof searchKeys>) => {
  const [key] = text.trim().split(':');
  return text.includes(':') && keys.some((one) => one.key === key?.toLowerCase());
};

/** What the panel holds: with nothing typed the keys and Recent; with words, the filters they match and the cards they find. */
function panelOf({
  typed,
  keys,
  picked,
  recent,
  found,
}: {
  typed: string;
  keys: ReturnType<typeof searchKeys>;
  picked: readonly string[];
  recent: readonly string[];
  found: InboxSearched | undefined;
}) {
  if (typed === '') {
    return [
      { id: 'keys', title: 'Filter by', items: keyRows(keys) },
      ...(recent.length === 0 ? [] : [{ id: 'recent', title: 'Recent', items: recentRows(recent) }]),
    ] satisfies CutSearchSection[];
  }
  const shown =
    found === undefined || found.entries.length === 0
      ? []
      : [
          {
            id: 'cards',
            title: 'Cards',
            items: [
              ...cardRows(found.entries, typed),
              { id: 'all', label: `Show all ${found.total} ${found.total === 1 ? 'card' : 'cards'} matching “${typed}”` },
            ],
          },
        ];
  return [
    { id: 'filter', title: 'Filter', items: offerRows(barOffers(keys, typed, picked), typed) },
    ...shown,
  ] satisfies CutSearchSection[];
}

/**
 * The search bar of the Inbox: the chips of what was picked, the words being typed, and a panel that offers by what is typed. With
 * nothing typed it offers each key the cards in view hold, then `factory:`, `workflow:` and `state:`, and the filters last used. A key and
 * its colon (`area:`) offers that key's values; words offer the filters they match and a few cards, with a line that keeps them as the
 * search. Picking a state sets the state chips' own address key (`?phase=`); picking a card opens it. Enter keeps the words; the clear key
 * takes every filter off. Recent is this browser's.
 * @param view What the page reads of its address.
 * @param labels The labels in use among the cards in view, each with how many cards hold it.
 * @param counts How many cards in view each phase holds.
 * @param onSearch Changes the page's address.
 */
export function InboxSearch({
  view,
  labels,
  counts,
  onSearch,
}: {
  view: InboxView;
  labels: InboxPage['labels'];
  counts: InboxPage['counts'];
  onSearch: (patch: Partial<InboxView>) => void;
}) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [recent, setRecent] = useState<readonly string[]>(keptSets);
  const typed = useDeferredValue(text.trim());
  const keys = searchKeys(labels, counts);
  const chips = barChips(view);
  const picked = chips.map((chip) => chip.id).filter((id) => id !== 'q');
  const asking = typed !== '' && !keyed(typed, keys);
  const found = useQuery({ ...searchQuery(suggestedAsk(view, typed), view.factory), enabled: asking }).data;
  const filters = (patch: Partial<InboxView>) => {
    const next = { ...view, ...patch };
    const used = recentOf(next);
    setText('');
    onSearch({ ...patch, older: undefined });
    if (used === '') return;
    const kept = keptRecent(recent, used);
    setRecent(kept);
    store(RECENT_KEY, kept.join('\n'));
  };
  const submit = (words: string) => filters({ search: [view.search, words].filter(Boolean).join(' ') });
  const sections = panelOf({ typed, keys, picked, recent, found: asking ? found : undefined });
  const pick = (id: string) => {
    if (id.endsWith(':')) return setText(id);
    if (id === 'all') return submit(typed);
    if (id.startsWith('card:')) return void navigate({ to: '/inbox/$name', params: { name: id.slice('card:'.length) } });
    if (id.startsWith('recent:')) {
      const set = viewOfRecent(id.slice('recent:'.length));
      return filters({ search: set.search, l: set.l, cards: set.cards, phase: set.phase });
    }
    if (id.startsWith('state=')) return filters(pickedPhase(id.slice('state='.length) as NonNullable<InboxView['phase']>));
    return filters({ l: [...(view.l?.split(',') ?? []), id].filter(Boolean).join(',') });
  };
  const remove = (id: string) => {
    if (id === 'q') return onSearch({ search: undefined, older: undefined });
    if (id.startsWith('state=')) return onSearch({ phase: undefined, older: undefined });
    const left = (view.l ?? '').split(',').filter((term) => term !== id);
    onSearch({ l: left.length === 0 ? undefined : left.join(','), older: undefined });
  };
  return (
    <CutSearch
      label="Search the cards"
      placeholder="Search cards, or filter by label, factory, workflow or state"
      chips={chips}
      onRemove={remove}
      text={text}
      onText={setText}
      sections={sections}
      onPick={pick}
      onSubmit={submit}
      onClear={() => {
        setText('');
        onSearch({ search: undefined, l: undefined, phase: undefined, older: undefined });
      }}
      className="min-w-48 flex-1"
    />
  );
}
