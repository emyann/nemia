/**
 * The inbox's search bar, without React: the keys it offers (`searchKeys`, proved by `contracts/search-keys.contract.ts`), what it offers
 * for the words typed, the chips of an address, Recent (`keptRecent`, proved by `contracts/recent-filters.contract.ts`), the side a picked
 * state belongs to, and the line that says where else a search matches. Pure.
 */
import type { CardPhase } from 'objects';
import type { KeptRecentOf } from '../../contracts/recent-filters.contract.ts';
import type { LabelInUse, SearchKey, SearchKeysOf } from '../../contracts/search-keys.contract.ts';
import { CLOSED_PHASES, OPEN_PHASES, PHASE_WORDS, type InboxView } from './inbox.ts';

/** The keys every factory offers, after the labels its cards hold. */
const FIXED: readonly string[] = ['factory', 'workflow', 'state'];

/** How many sets Recent keeps. */
const RECENT = 5;

/** How many offers words bring. */
const OFFERED = 8;

/** How many values a typed key brings. */
const OFFERED_UNDER_KEY = 24;

/** The values `labels` hold under `key`, each with how many cards hold it. */
const valuesOf = (labels: readonly LabelInUse[], key: string) =>
  labels.filter((label) => label.key === key).map(({ value, cards }) => ({ value, cards }));

/**
 * The keys the bar offers: each label key the cards in view hold, in the order the api gives them, then `factory`, `workflow` and `state`.
 * @param labels The labels in use among the cards in view, each with how many cards hold it.
 * @param counts How many cards in view each phase holds.
 */
export const searchKeys: SearchKeysOf = (labels, counts) => [
  ...labels
    .filter((label, at) => !FIXED.includes(label.key) && !labels.slice(0, at).some((before) => before.key === label.key))
    .map((first) => ({ key: first.key, values: valuesOf(labels, first.key) })),
  { key: 'factory', values: valuesOf(labels, 'factory') },
  { key: 'workflow', values: valuesOf(labels, 'workflow') },
  {
    key: 'state',
    values: [
      { value: 'waiting', cards: counts.waiting },
      { value: 'working', cards: counts.working },
      { value: 'blocked', cards: counts.blocked },
      { value: 'notStarted', cards: counts.notStarted },
      { value: 'done', cards: counts.done },
      { value: 'failed', cards: counts.failed },
      { value: 'cancelled', cards: counts.cancelled },
    ],
  },
];

/**
 * What Recent keeps once `used` is used: it first, then the sets kept before, five at most, none twice.
 * @param recent The sets kept so far, newest first.
 * @param used The filter set just used, never empty: a use with no filter is not kept.
 */
export const keptRecent: KeptRecentOf = (recent, used) =>
  [used, ...recent.filter((one) => one !== used)].slice(0, RECENT);

/**
 * A view's filters as one text: its words, labels, side and state, in that order, as an address writes them.
 * @param view What the page reads of its address.
 */
export function recentOf(view: Pick<InboxView, 'search' | 'l' | 'cards' | 'phase'>) {
  const params = new URLSearchParams();
  if (view.search !== undefined) params.set('search', view.search);
  if (view.l !== undefined) params.set('l', view.l);
  if (view.cards !== undefined) params.set('cards', view.cards);
  if (view.phase !== undefined) params.set('phase', view.phase);
  return params.toString();
}

/**
 * The filters a text of Recent holds, as the view's keys: what `recentOf` wrote.
 * @param text A filter set, as `recentOf` says it.
 */
export function viewOfRecent(text: string) {
  const params = new URLSearchParams(text);
  const search = params.get('search');
  const l = params.get('l');
  const phase = [...OPEN_PHASES, ...CLOSED_PHASES].find((one) => one === params.get('phase'));
  return {
    ...(search === null ? {} : { search }),
    ...(l === null ? {} : { l }),
    ...(params.get('cards') === 'closed' ? { cards: 'closed' as const } : {}),
    ...(phase === undefined ? {} : { phase }),
  } satisfies Pick<InboxView, 'search' | 'l' | 'cards' | 'phase'>;
}

/** One filter the bar offers: a key and one of its values, with how many cards hold it. */
export type Offer = { key: string; value: string; cards: number };

/**
 * What the bar offers for `text`: where it opens with a key and a colon (`area:`), that key's values the rest of the text matches; else
 * every `key=value` the words are contained in. What is picked is not offered again, and one state at a time.
 * @param keys The keys the bar offers (`searchKeys`).
 * @param text The words typed.
 * @param picked The filters picked, each as `key=value`.
 */
export function barOffers(keys: readonly SearchKey[], text: string, picked: readonly string[]) {
  const word = text.trim().toLowerCase();
  const colon = word.indexOf(':');
  const named = colon > 0 ? keys.find((one) => one.key.toLowerCase() === word.slice(0, colon)) : undefined;
  if (colon > 0 && named === undefined) return [];
  const rest = named === undefined ? word : word.slice(colon + 1).trim();
  const stated = picked.some((id) => id.startsWith('state='));
  const offers: Offer[] = (named === undefined ? keys : [named])
    .filter((one) => !(one.key === 'state' && stated))
    .flatMap((one) => one.values.map((value) => ({ key: one.key, value: value.value, cards: value.cards })))
    .filter((offer) => !picked.includes(`${offer.key}=${offer.value}`))
    .filter((offer) => (named === undefined ? `${offer.key}=${offer.value}` : offer.value).toLowerCase().includes(rest));
  return offers.slice(0, named === undefined ? OFFERED : OFFERED_UNDER_KEY);
}

/** One chip of the bar: what takes it off is its id (`q`, `key=value`). */
export type BarChip = { id: string; label: string };

/**
 * The chips of a view: its words, each label as `key: value`, and its state.
 * @param view What the page reads of its address.
 */
export function barChips(view: Pick<InboxView, 'search' | 'l' | 'phase'>) {
  const labels = (view.l ?? '')
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term !== '')
    .map((term) => ({ id: term, label: term.replace('=', ': ') }));
  return [
    ...(view.search === undefined ? [] : [{ id: 'q', label: `“${view.search}”` }]),
    ...labels,
    ...(view.phase === undefined ? [] : [{ id: `state=${view.phase}`, label: `state: ${PHASE_WORDS[view.phase]}` }]),
  ] satisfies BarChip[];
}

/**
 * The address's keys a picked state sets: the phase, and the Closed side where the phase is one of a closed card.
 * @param phase The phase picked.
 */
export const pickedPhase = (phase: CardPhase) => ({
  phase,
  cards: (CLOSED_PHASES as readonly CardPhase[]).includes(phase) ? ('closed' as const) : undefined,
});

/**
 * Where else the words match, as a sentence: how many cards, and of which factories.
 * @param found How many cards match elsewhere, and the factory of each the read named.
 * @param side Which side those cards are on.
 */
export function elsewhereLine(found: { total: number; factories: readonly string[] }, side: 'open' | 'closed') {
  const names = [...new Set(found.factories)];
  if (found.total <= 0) return null;
  const cards = `${side} card${found.total === 1 ? '' : 's'}`;
  if (found.total > found.factories.length || names.length === 0) return `${found.total} ${cards} of other factories do.`;
  if (names.length === 1 && found.total === 1) return `One ${cards} of ${names[0]} does.`;
  const of = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return `${found.total} ${cards} of ${of} ${found.total === 1 ? 'does' : 'do'}.`;
}
