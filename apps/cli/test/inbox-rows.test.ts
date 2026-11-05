/**
 * `nemia inbox`'s lines off the CardList say what the orchestrator's `inboxLines` says of the same cards: each `Card` made the printer's
 * row (`rowOf`), a queued card's place its place in the order the package's queue starts them (`placesOf`, `queueOrder`), and the
 * repository its factory picks for it said where the tick's try was on it — on cards the parity seed of `reads.test.ts` holds none of.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { inboxLines, type InboxListing, queueOrder } from 'agent-orchestrator';
import { API_VERSION, type Card } from 'objects';
import { inboxPrinted, placesOf, rowOf } from '../src/reads/inbox.ts';

/** A listing as the package lists a card, every key it does not set at its default. */
const listing = (name: string, keys: Partial<InboxListing> = {}): InboxListing => ({
  name,
  file: `${name}.md`,
  title: `Do ${name}`,
  workflow: null,
  repo: null,
  factory: null,
  from: [],
  startedAs: [],
  labels: {},
  state: 'filed',
  error: null,
  factoryRepo: null,
  ...keys,
});

/** The Card the api serves of the listing `l`, as the orchestrator's `cardOf` makes it. */
const cardOf = (l: InboxListing): Card => ({
  apiVersion: API_VERSION,
  kind: 'Card',
  metadata: {
    name: l.name,
    namespace: l.factory ?? 'default',
    ...(Object.keys(l.labels).length ? { labels: { ...l.labels } } : {}),
    creationTimestamp: '2026-11-04T09:00:00.000Z',
    resourceVersion: 'v1',
  },
  spec: {
    ...(l.workflow !== null ? { workflow: l.workflow } : {}),
    ...(l.repo !== null ? { repo: l.repo } : {}),
    ...(l.gate !== undefined ? { gate: l.gate } : {}),
    ...(l.queued !== undefined ? { queued: l.queued.at } : {}),
  },
  status: {
    state: l.state,
    runs: [...l.startedAs],
    ...(l.tried !== undefined ? { lastStart: { ...l.tried } } : {}),
    ...(l.title !== null ? { title: l.title } : {}),
    ...(l.error !== null ? { error: l.error } : {}),
  },
});

const at = (minute: number) => `2026-11-04T10:${String(minute).padStart(2, '0')}:00.000Z`;
const tried = (refused: boolean, repo = '/code/mill') => ({ at: at(30), repo, why: 'no workflow dev there.', refused });

/** The package's listing, each queued card's place set as the package sets it (`queueOrder`), and its factory's repository. */
const listed = (() => {
  const raw = [
    listing('a-first', { workflow: 'dev', queued: { at: at(1), place: null }, state: 'queued', labels: { team: 'core' } }),
    listing('b-milled', {
      workflow: 'dev',
      factory: 'mill',
      factoryRepo: '/code/mill',
      queued: { at: at(2), place: null },
      tried: tried(true),
      state: 'refused',
    }),
    listing('c-failed', { workflow: 'dev', factory: 'pair', queued: { at: at(0), place: null }, tried: tried(false, '/code/app') }),
    listing('d-started', { workflow: 'dev', queued: { at: at(3), place: null }, startedAs: ['r-1'], state: 'waiting' }),
    listing('e-gated', { workflow: 'dev', repo: '/code/app', gate: 'review', state: 'queued', queued: { at: at(4), place: null } }),
    listing('f-broken', { title: null, error: 'f-broken.md: `after` is not a key an inbox card has.' }),
  ];
  const places = new Map(queueOrder(raw).map((l, k) => [l.name, k + 1]));
  return raw.map((l) => (l.queued ? { ...l, queued: { at: l.queued.at, place: places.get(l.name) ?? null } } : l));
})();

/** The repository each factory picks: mill has one, pair several. */
const repos = new Map([['mill', '/code/mill']]);

test("each Card is the row the package's printer reads: the same lines, places and factory repositories as `inboxLines`", () => {
  const cards = listed.map(cardOf);
  const places = placesOf(cards);
  const rows = cards.map((c) => rowOf(c, places, repos));
  for (const unfactored of [false, true]) {
    const env = unfactored ? { WF_DEFAULT_FACTORY_STARTS: '1', WF_ROOT: '/store' } : { WF_ROOT: '/store' };
    const asked = { selector: [], showLabels: true, columns: ['team', 'factory'] };
    assert.deepEqual(
      inboxPrinted(rows, env, asked).slice(0, -1),
      inboxLines(listed, unfactored, { showLabels: true, columns: ['team', 'factory'] }),
      `WF_DEFAULT_FACTORY_STARTS ${unfactored ? 'on' : 'off'}`,
    );
  }
});

test("a list a selector cut keeps each queued card's place among every card queued", () => {
  const cards = listed.map(cardOf);
  const places = placesOf(cards);
  const kept = cards.filter((c) => c.metadata.name === 'b-milled');
  const [line] = inboxPrinted(
    kept.map((c) => rowOf(c, places, repos)),
    { WF_ROOT: '/store' },
  );
  assert.match(line ?? '', /queued 3 of 1/, 'its place among all the queued cards, of the queued cards listed, as the package says it');
});
