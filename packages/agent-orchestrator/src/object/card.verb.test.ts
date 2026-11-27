/**
 * The inbox's cards as objects (`cardList`, `cardObject`, card.verb.ts), over the Card door's memory stand-in: a page of cards walked by
 * `continue` answers each once in name order, and one dropped between two pages skips none; a namespace is a card's factory, `default` for
 * a card that names none, and a card read under another is `Missing`; a label selector keeps the cards it takes before the page is cut;
 * and a bad limit, token or selector is `Invalid`. Kinds are asserted, never sentences.
 */
import type { StoreRoot } from '../config/root.store.ts';
import type { StoreConfig } from '../config/config.store.ts';
import { configGiven } from '../../test/config-given.ts';
import { STORE } from '../../test/ambient.ts';
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import { CardDoor } from '../cards/cards.store.ts';
import type { PlaceService } from '../place/place.store.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { factoryDoorMemory } from '../factory/door/memory.store.ts';
import { cardDoorAt } from '../cards/cards.store.ts';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { CardName } from '../inbox/inbox.model.ts';
import { inboxListing } from '../inbox/inbox.ts';
import { aCard } from '../../test/card-walks.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { testPlace } from '../../place/memory/index.ts';
import { engineOf } from '../runtime-client.ts';
import { howOf } from '../summary/how.verb.ts';
import { passStarted } from '../rest/informer.verb.ts';
import { inboxJudged } from '../inbox/inbox.verb.ts';
import { cardList, cardListOf, cardObject, cardObjectOf, type CardQuery, cardTable, cardTableOf } from './card.verb.ts';

const engine = eachTest(testEngine);
const stand = eachTest(testPlace);

/**
 * Runs `program` against a fresh memory door on which `cards` are filed first, by name to their text, given the test place and a memory
 * Factory door holding no factory.
 */
const over = <A, E>(cards: Readonly<Record<string, string>>, program: Effect.Effect<A, E, PlaceService | StoreRoot | StoreConfig>) =>
  Effect.runSyncExit(
    Effect.gen(function* () {
      const door = yield* CardDoor;
      for (const [name, text] of Object.entries(cards)) yield* door.cards.add(CardName.read(name), text);
      return yield* program;
    }).pipe(
      Effect.provide(cardDoorMemory()),
      Effect.provide(factoryDoorMemory()),
      Effect.provide(stand().layer),
      Effect.provide(configGiven(STORE)),
    ),
  );

/** The inbox as the listing reads it now, through the door: no run started from any card. */
const listed = Effect.gen(function* () {
  const door = yield* CardDoor;
  return inboxListing(yield* door.cards.entries(), []);
});

const list = (query: CardQuery) => Effect.flatMap(listed, (l) => cardListOf(l, query));

/** What an exit holds, or the kind of the refusal it failed with. */
const valueOf = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw new Error(`failed: ${String(exit.cause)}`);
};
const kindOf = <A, E>(exit: Exit.Exit<A, E>) => {
  if (Exit.isSuccess(exit)) return 'ok';
  const failed = exit.cause.reasons.find((r) => r._tag === 'Fail');
  return failed && 'error' in failed ? String((failed.error as { _tag?: unknown })._tag) : 'defect';
};

const five = {
  echo: aCard('Echo'),
  alpha: aCard('Alpha', { workflow: 'build' }),
  delta: aCard('Delta', { factory: 'beta' }),
  bravo: aCard('Bravo', { factory: 'alpha', labels: '{ team: core }' }),
  charlie: aCard('Charlie', { labels: '{ team: web }' }),
};

test('five cards walked two at a time answer each once in name order, 3, 1 and 0 left, and no continue on the last', () => {
  const pages = valueOf(
    over(
      five,
      Effect.gen(function* () {
        const answered = [];
        let token: string | undefined;
        do {
          const page = yield* list({ limit: 2, continue: token });
          answered.push(page);
          token = page.metadata.continue;
        } while (token !== undefined && answered.length < 10);
        return answered;
      }),
    ),
  );
  assert.deepEqual(
    pages.map((p) => p.items.map((c) => c.metadata.name)),
    [['alpha', 'bravo'], ['charlie', 'delta'], ['echo']],
  );
  assert.deepEqual(
    pages.map((p) => p.metadata.remainingItemCount),
    [3, 1, 0],
  );
  assert.equal('continue' in (pages.at(-1)?.metadata ?? {}), false);
  for (const page of pages) assert.equal(page.kind, 'CardList');
  for (const page of pages) for (const item of page.items) assert.equal('source' in item.status, false, "a list's items carry no file");
});

test('a card is an object: its factory its namespace, filed time, its keyspace revision, its labels, spec and status', () => {
  const card = valueOf(
    over(
      five,
      Effect.flatMap(listed, (l) => cardObjectOf(l, 'bravo')),
    ),
  );
  assert.equal(card.kind, 'Card');
  assert.equal(card.apiVersion, 'nemia/v1');
  assert.equal(card.metadata.namespace, 'alpha');
  assert.deepEqual(card.metadata.labels, { team: 'core' });
  assert.match(card.metadata.creationTimestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(card.metadata.resourceVersion, /^[0-9]+$/);
  assert.equal(card.spec.body?.trim(), 'Bravo');
  assert.equal(card.status.state, 'filed');
  assert.deepEqual(card.status.runs, []);
  assert.equal(card.status.title, 'Bravo');
  assert.equal(
    card.status.source,
    aCard('Bravo', { factory: 'alpha', labels: '{ team: core }' }),
    'a read of one card carries its file as written',
  );
  const other = valueOf(
    over(
      five,
      Effect.flatMap(listed, (l) => cardObjectOf(l, 'charlie')),
    ),
  );
  assert.notEqual(other.metadata.resourceVersion, card.metadata.resourceVersion);
  assert.equal(
    valueOf(
      over(
        five,
        Effect.flatMap(listed, (l) => cardObjectOf(l, 'echo')),
      ),
    ).metadata.namespace,
    'default',
  );
});

test('a card dropped between two pages is not skipped: the next page starts at the first name after the last answered', () => {
  const second = valueOf(
    over(
      five,
      Effect.gen(function* () {
        const first = yield* list({ limit: 2 });
        yield* (yield* CardDoor).cards.drop(CardName.read('bravo'));
        return yield* list({ limit: 2, continue: first.metadata.continue });
      }),
    ),
  );
  assert.deepEqual(
    second.items.map((c) => c.metadata.name),
    ['charlie', 'delta'],
  );
});

test('a namespace lists the cards of its factory, default those that name none, and none lists every card', () => {
  const names = (query: CardQuery) => valueOf(over(five, list(query))).items.map((c) => c.metadata.name);
  assert.deepEqual(names({}), ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
  assert.deepEqual(names({ namespace: 'default' }), ['alpha', 'charlie', 'echo']);
  assert.deepEqual(names({ namespace: 'alpha' }), ['bravo']);
  assert.deepEqual(names({ namespace: 'nobody' }), []);
});

test('a label selector keeps the cards it takes, over their labels, workflow and factory, before the page is cut', () => {
  const names = (query: CardQuery) => valueOf(over(five, list(query))).items.map((c) => c.metadata.name);
  assert.deepEqual(names({ labelSelector: ['team=core'] }), ['bravo']);
  assert.deepEqual(names({ labelSelector: ['team=core', 'team=web'] }), ['bravo', 'charlie']);
  assert.deepEqual(names({ labelSelector: ['factory=default'], limit: 1 }), ['alpha']);
  assert.deepEqual(names({ labelSelector: ['workflow=build'] }), ['alpha']);
  const page = valueOf(over(five, list({ labelSelector: ['team'], limit: 1 })));
  assert.equal(page.metadata.remainingItemCount, 1, 'counted among the selected');
});

test("cardList and cardObject read the inbox as nemia inbox reads it now, through the engine's informer", () => {
  const e = engineOf(engine().layer);
  const how = Effect.runSync(howOf().pipe(Effect.provide(configGiven(STORE))));
  const page = valueOf(over(five, cardList(e, how, { namespace: 'default', limit: 2 })));
  assert.deepEqual(
    page.items.map((c) => [c.metadata.name, c.status.state]),
    [
      ['alpha', 'filed'],
      ['charlie', 'filed'],
    ],
  );
  assert.equal(page.metadata.remainingItemCount, 1);
  assert.equal(valueOf(over(five, cardObject(e, how, 'delta', 'beta'))).metadata.namespace, 'beta');
  assert.equal(kindOf(over(five, cardObject(e, how, 'delta', 'default'))), 'Missing');
});

test("cardTable says the repository a card naming no factory was tried on only where the store's StoreConfig lets it start", () => {
  const e = engineOf(engine().layer);
  const how = Effect.runSync(howOf().pipe(Effect.provide(configGiven(STORE))));
  const text = aCard('Echo', { workflow: 'build', queued: '2026-11-01T00:00:00.000Z' });
  const tried = (env: Readonly<Record<string, string>>) =>
    valueOf(
      over(
        { echo: text },
        Effect.gen(function* () {
          const door = yield* CardDoor;
          yield* door.tries.put(CardName.read('echo'), {
            at: '2026-11-02T00:00:00.000Z',
            text,
            repo: '/the/daemon/repo',
            why: 'refused',
            refused: true,
          });
          return yield* cardTable(e, how, {}).pipe(Effect.provide(configGiven(STORE, env)));
        }),
      ),
    );
  const lastStart = (table: { columnDefinitions: readonly { name: string }[]; rows: readonly { cells: readonly unknown[] }[] }) =>
    table.rows.map((row) => String(row.cells[table.columnDefinitions.findIndex((c) => c.name === 'Last start')]));
  assert.match(lastStart(tried({ WF_DEFAULT_FACTORY_STARTS: '1' })).join(), /\/the\/daemon\/repo/);
  assert.doesNotMatch(lastStart(tried({})).join(), /\/the\/daemon\/repo/);
});

test('REFUSED: a card of another namespace and a card not there are Missing; a bad limit, token or selector is Invalid', () => {
  assert.equal(
    kindOf(
      over(
        five,
        Effect.flatMap(listed, (l) => cardObjectOf(l, 'bravo', 'beta')),
      ),
    ),
    'Missing',
  );
  assert.equal(
    kindOf(
      over(
        five,
        Effect.flatMap(listed, (l) => cardObjectOf(l, 'gone')),
      ),
    ),
    'Missing',
  );
  assert.equal(
    kindOf(
      over(
        five,
        Effect.flatMap(listed, (l) => cardObjectOf(l, 'bravo', 'alpha')),
      ),
    ),
    'ok',
  );
  for (const limit of [0, 1.5, Number.NaN]) assert.equal(kindOf(over(five, list({ limit }))), 'Invalid', `limit ${limit}`);
  assert.equal(kindOf(over(five, list({ limit: 2, continue: 'not a token' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ labelSelector: ['team in (core'] }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ labelSelector: ['team==core'] }))), 'Invalid');
});

test('a stray file listed before a card of its name is passed over; a card says whether it is in play, and its place in the queue', () => {
  const read = (program: (l: ReturnType<typeof inboxListing>) => Effect.Effect<unknown, unknown>) =>
    valueOf(over(five, Effect.flatMap(listed, program)));
  const card = read((l) => {
    const bravo = l.find((entry) => entry.name === 'bravo');
    if (bravo === undefined) throw new Error('bravo is listed');
    return cardObjectOf([{ ...bravo, file: 'bravo', error: 'not a card' }, ...l], 'bravo', 'alpha');
  }) as { metadata: { name: string }; status: { inPlay: boolean; place?: number } };
  assert.equal(card.metadata.name, 'bravo');
  assert.equal(card.status.inPlay, true, 'a card filed and not started is in play');
  assert.equal(card.status.place, undefined, 'a card not queued has no place');
  const queued = read((l) =>
    cardObjectOf(
      l.map((entry) =>
        entry.name === 'echo' ? { ...entry, state: 'queued' as const, queued: { at: '2026-11-04T09:00:00.000Z', place: 2 } } : entry,
      ),
      'echo',
    ),
  ) as { status: { place?: number } };
  assert.equal(queued.status.place, 2, 'the place the listing judged');
});

test('a card file dropped into the inbox is listed as its card, a page at a time; an entry that is no card is not listed, and left where it is', () => {
  const home = scratch('card-strays-');
  const inbox = path.join(home, 'inbox');
  fs.mkdirSync(path.join(inbox, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(inbox, 'notes.md'), aCard('Notes'));
  fs.writeFileSync(path.join(inbox, 'idea.md'), aCard('Idea'));
  fs.writeFileSync(path.join(inbox, 'notes'), 'a stray file\n');
  fs.writeFileSync(path.join(inbox, 'idea.txt'), 'an idea saved as text\n');
  const walked = valueOf(
    Effect.runSyncExit(
      Effect.gen(function* () {
        const pages = [];
        let token: string | undefined;
        do {
          const page = yield* list({ limit: 1, continue: token });
          pages.push(...page.items);
          token = page.metadata.continue;
        } while (token !== undefined && pages.length < 10);
        return pages;
      }).pipe(Effect.provide(cardDoorAt(home)), Effect.provide(stand().layer)),
    ),
  );
  assert.deepEqual(
    walked.map((c) => [c.metadata.name, c.status.file, c.status.error]),
    [
      ['idea', 'idea.md', undefined],
      ['notes', 'notes.md', undefined],
    ],
    'each card once, a page at a time, and no stray',
  );
  assert.deepEqual(fs.readdirSync(inbox).sort(), ['idea.txt', 'notes', 'sub'], 'the strays left where they are, the cards taken up');
});

test('a card the listing read and that no longer parses when its text is read is listed all the same, its status saying why', () => {
  const home = scratch('card-unparsed-');
  const inbox = path.join(home, 'inbox');
  fs.mkdirSync(inbox, { recursive: true });
  fs.writeFileSync(path.join(inbox, 'alpha.md'), '---\nnot-a-key: 1\n---\nAlpha\n');
  const read = inboxListing([{ file: 'alpha.md', text: aCard('Alpha') }], []);
  const page = valueOf(Effect.runSyncExit(cardListOf(read, {}).pipe(Effect.provide(cardDoorAt(home)), Effect.provide(stand().layer))));
  const [alpha] = page.items;
  assert.equal(alpha?.metadata.name, 'alpha');
  assert.equal('body' in (alpha?.spec ?? {}), false, 'no body of a text that does not parse');
  assert.match(alpha?.status.error ?? '', /not-a-key/, 'why it does not parse, naming the key');
});

test('a field selector on status.inPlay keeps the cards in play, or those whose run ended, before the page is cut; empty keeps every card', () => {
  const ended = new Set(['alpha', 'charlie']);
  const page = (query: CardQuery) =>
    valueOf(
      over(
        five,
        Effect.flatMap(listed, (l) =>
          cardListOf(
            l.map((entry) => (ended.has(entry.name) ? { ...entry, state: 'succeeded' as const } : entry)),
            query,
          ),
        ),
      ),
    );
  const names = (query: CardQuery) => page(query).items.map((card) => card.metadata.name);
  const first = page({ fieldSelector: 'status.inPlay=true', limit: 2 });
  assert.deepEqual(
    first.items.map((card) => card.metadata.name),
    ['bravo', 'delta'],
  );
  assert.equal(first.metadata.remainingItemCount, 1, 'the cards in play alone are counted');
  assert.deepEqual(names({ fieldSelector: 'status.inPlay=true', limit: 2, continue: first.metadata.continue }), ['echo']);
  assert.deepEqual(names({ fieldSelector: 'status.inPlay!=true' }), ['alpha', 'charlie']);
  assert.deepEqual(names({ fieldSelector: 'status.inPlay==false' }), ['alpha', 'charlie']);
  assert.deepEqual(names({ fieldSelector: '' }), ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
  assert.deepEqual(names({}), ['alpha', 'bravo', 'charlie', 'delta', 'echo']);
  const table = valueOf(
    over(
      five,
      Effect.flatMap(listed, (l) =>
        cardTableOf(
          l.map((entry) => (ended.has(entry.name) ? { ...entry, state: 'succeeded' as const } : entry)),
          { fieldSelector: 'status.inPlay=true' },
          false,
        ),
      ),
    ),
  );
  assert.equal(table.rows.length, 3, 'the table holds the rows of the same page');
});

test('REFUSED: a field selector, an order or a term that is none a card list takes is Invalid', () => {
  assert.equal(kindOf(over(five, list({ fieldSelector: 'status.inPlay=maybe' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ fieldSelector: 'status.state=x' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ fieldSelector: 'status.phase=nope' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ fieldSelector: 'status.inPlay=true,status.phase=nope' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ orderBy: 'title' }))), 'Invalid');
  assert.equal(kindOf(over(five, list({ orderBy: 'metadata.name,metadata.creationTimestamp' }))), 'Invalid');
});

test("a card's after: is served on its spec, and the cards of it not landed on its status, each with where it stands and whether it is stalled", () => {
  const cards = {
    'a-1x2y': aCard('First'),
    'b-3z4w': aCard('Second', { after: 'a-1x2y, gone-9z9z' }),
  };
  const waiting = {
    look: (name: string) => ({ known: name === 'a-1x2y', runs: [], onward: [] }),
    phaseOf: () => undefined,
  };
  const card = valueOf(
    over(
      cards,
      Effect.flatMap(CardDoor, (door) =>
        Effect.flatMap(door.cards.entries(), (entries) =>
          cardObjectOf(inboxListing(entries, [], new Map(), new Map(), undefined, waiting), 'b-3z4w', 'default'),
        ),
      ),
    ),
  );
  assert.deepEqual(card.spec.after, ['a-1x2y', 'gone-9z9z']);
  assert.deepEqual(card.status.waitingOn, [
    { card: 'a-1x2y', kind: 'waiting', state: 'filed', stalled: false },
    { card: 'gone-9z9z', kind: 'missing', stalled: true },
  ]);
});

/**
 * The five cards listed as the inbox reads them, each filed one minute after the one before it in `filed`'s order and in a phase of
 * `phased`.
 */
const dated = (phased: Readonly<Record<string, 'blocked' | 'working' | 'done' | 'notStarted'>> = {}) =>
  Effect.map(listed, (l) =>
    l.map((entry) => ({
      ...entry,
      filedAt: `2026-11-0${['echo', 'alpha', 'delta', 'bravo', 'charlie'].indexOf(entry.name) + 1}T00:00:00.000Z`,
      phase: phased[entry.name] ?? entry.phase,
      state: phased[entry.name] === 'done' ? ('succeeded' as const) : entry.state,
    })),
  );

const names = (list: { items: readonly { metadata: { name: string } }[] }) => list.items.map((card) => card.metadata.name);

test('orderBy sorts by when a card was filed, newest first with desc, and a token resumes after the last card answered though it is gone', () => {
  const first = valueOf(
    over(
      five,
      Effect.flatMap(dated(), (l) => cardListOf(l, { orderBy: 'metadata.creationTimestamp desc', limit: 2 })),
    ),
  );
  assert.deepEqual(names(first), ['charlie', 'bravo']);
  const later = valueOf(
    over(
      five,
      Effect.flatMap(dated(), (l) =>
        cardListOf(
          l.filter((entry) => entry.name !== 'bravo'),
          { orderBy: 'metadata.creationTimestamp desc', limit: 2, continue: first.metadata.continue },
        ),
      ),
    ),
  );
  assert.deepEqual(names(later), ['delta', 'alpha']);
  const oldest = valueOf(
    over(
      five,
      Effect.flatMap(dated(), (l) => cardListOf(l, { orderBy: 'metadata.creationTimestamp' })),
    ),
  );
  assert.deepEqual(names(oldest), ['echo', 'alpha', 'delta', 'bravo', 'charlie']);
  const byName = valueOf(
    over(
      five,
      Effect.flatMap(dated(), (l) => cardListOf(l, { orderBy: 'metadata.name desc' })),
    ),
  );
  assert.deepEqual(names(byName), ['echo', 'delta', 'charlie', 'bravo', 'alpha']);
});

test('the counts and the labels in use are counted after the labels and the words, and before the field selector and the page', () => {
  const phased = { alpha: 'blocked', bravo: 'working', charlie: 'done' } as const;
  const asked = valueOf(
    over(
      five,
      Effect.flatMap(dated(phased), (l) => cardListOf(l, { fieldSelector: 'status.phase=working', limit: 1 })),
    ),
  );
  assert.deepEqual(names(asked), ['bravo']);
  assert.deepEqual(asked.metadata.counts, { notStarted: 2, blocked: 1, waiting: 0, working: 1, done: 1, failed: 0, cancelled: 0 });
  assert.deepEqual(
    asked.metadata.labelsInUse.filter((l) => l.key === 'team'),
    [
      { key: 'team', value: 'core', cards: 1 },
      { key: 'team', value: 'web', cards: 1 },
    ],
  );
  const searched = valueOf(
    over(
      five,
      Effect.flatMap(dated(phased), (l) => cardListOf(l, { search: 'ECHO delta' })),
    ),
  );
  assert.deepEqual(names(searched), [], 'every word is required, whatever its case');
  assert.equal(
    valueOf(
      over(
        five,
        Effect.flatMap(dated(phased), (l) => cardListOf(l, { search: 'ALPHA' })),
      ),
    ).items.length,
    1,
  );
  const narrowed = valueOf(
    over(
      five,
      Effect.flatMap(dated(phased), (l) => cardListOf(l, { labelSelector: ['team=core'], fieldSelector: 'status.phase=done' })),
    ),
  );
  assert.deepEqual(narrowed.metadata.counts.notStarted, 0, 'the counts hold the cards the labels keep');
  assert.deepEqual(names(narrowed), []);
});

test('the terms of a field selector all hold, a != term differs, and a card says whether it is chained and what follows it', () => {
  const cards = { 'a-1x2y': aCard('First'), 'b-3z4w': aCard('Second', { after: 'a-1x2y' }), 'c-5v6u': aCard('Third') };
  const listing = valueOf(over(cards, listed));
  const chained = valueOf(over(cards, cardListOf(listing, { fieldSelector: 'status.inPlay=true,status.chained=true' })));
  assert.deepEqual(names(chained), ['a-1x2y', 'b-3z4w']);
  assert.deepEqual(chained.items[0]?.status.followedBy, ['b-3z4w']);
  const loose = valueOf(over(cards, cardListOf(listing, { fieldSelector: 'status.inPlay=true, status.chained!=true' })));
  assert.deepEqual(names(loose), ['c-5v6u']);
  assert.equal(loose.items[0]?.status.phase, 'notStarted');
});

test('only the cards of the page are built: a page of one of thirty reads one card through the door', () => {
  const thirty = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`card-${String(i).padStart(2, '0')}`, aCard(`Card ${i}`)]));
  const reads: string[] = [];
  const page = valueOf(
    over(
      thirty,
      Effect.gen(function* () {
        const door = yield* CardDoor;
        const counted = {
          ...door,
          cards: { ...door.cards, read: (name: CardName) => (reads.push(name), door.cards.read(name)) },
        };
        return yield* Effect.provideService(
          Effect.flatMap(listed, (l) => cardListOf(l, { limit: 5 })),
          CardDoor,
          counted,
        );
      }),
    ),
  );
  assert.equal(page.items.length, 5);
  assert.equal(reads.length, 5);
});

test('the inbox is judged once while the keyspace head and the pass stand, again after a card is written or a pass starts, and again after a pass', () => {
  const e = engineOf(engine().layer);
  const how = Effect.runSync(howOf().pipe(Effect.provide(configGiven(STORE))));
  const reads = valueOf(
    over(
      five,
      Effect.gen(function* () {
        const door = yield* CardDoor;
        const unpassed = yield* inboxJudged(e, how);
        const again = yield* inboxJudged(e, how);
        passStarted(how.memo);
        const first = yield* inboxJudged(e, how);
        const second = yield* inboxJudged(e, how);
        yield* door.cards.add(CardName.read('foxtrot'), aCard('Foxtrot'));
        const third = yield* inboxJudged(e, how);
        passStarted(how.memo);
        const fourth = yield* inboxJudged(e, how);
        const fifth = yield* inboxJudged(e, how);
        return { unpassed, again, first, second, third, fourth, fifth };
      }),
    ),
  );
  assert.notEqual(reads.again, reads.unpassed, 'before a pass has started every read is now, and none is kept');
  assert.equal(reads.second, reads.first, 'the same listing is served while nothing it was judged on moved');
  assert.notEqual(reads.third, reads.second, 'a card written moves the head');
  assert.equal(reads.third.length, 6);
  assert.notEqual(reads.fourth, reads.third, 'a pass started judges again');
  assert.equal(reads.fifth, reads.fourth);
});

test('WF_VERIFY_REST judges the inbox afresh each read and dies where the informer held another', () => {
  const e = engineOf(engine().layer);
  const how = { ...Effect.runSync(howOf().pipe(Effect.provide(configGiven(STORE)))), verify: true };
  const exit = over(
    five,
    Effect.gen(function* () {
      passStarted(how.memo);
      const first = yield* inboxJudged(e, how);
      assert.notEqual(yield* inboxJudged(e, how), first, 'a verified read judges afresh');
      how.memo.inbox = { key: how.memo.inbox?.key ?? '', listing: first.slice(1) };
      return yield* inboxJudged(e, how);
    }),
  );
  assert.equal(kindOf(exit), 'defect');
});
