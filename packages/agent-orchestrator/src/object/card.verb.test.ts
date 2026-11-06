/**
 * The inbox's cards as objects (`cardList`, `cardObject`, card.verb.ts), over the Card door's memory stand-in: a page of cards walked by
 * `continue` answers each once in name order, and one dropped between two pages skips none; a namespace is a card's factory, `default` for
 * a card that names none, and a card read under another is `Missing`; a label selector keeps the cards it takes before the page is cut;
 * and a bad limit, token or selector is `Invalid`. Kinds are asserted, never sentences.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit } from 'effect';
import { CardDoor } from '../cards/cards.store.ts';
import type { PlaceService } from '../place/place.store.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { cardDoorFiles } from '../cards/cards.store.ts';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { inboxListing } from '../inbox/inbox.ts';
import { aCard } from '../../test/card-walks.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { testPlace } from '../../place/memory/index.ts';
import { engineOf } from '../runtime-client.ts';
import { howOf } from '../command/pages.verb.ts';
import { cardList, cardListOf, cardObject, cardObjectOf, type CardQuery } from './card.verb.ts';

const engine = eachTest(testEngine);
const stand = eachTest(testPlace);

/** Runs `program` against a fresh memory door on which `cards` are filed first, by name to their text, given the test place. */
const over = <A, E>(cards: Readonly<Record<string, string>>, program: Effect.Effect<A, E, PlaceService>) =>
  Effect.runSyncExit(
    Effect.gen(function* () {
      const door = yield* CardDoor;
      for (const [name, text] of Object.entries(cards)) yield* door.cards.add(CardName.read(name), text);
      return yield* program;
    }).pipe(Effect.provide(cardDoorMemory()), Effect.provide(stand().layer)),
  );

/** The inbox as the listing reads it now, through the door: no run started from any card. */
const listed = Effect.gen(function* () {
  const door = yield* CardDoor;
  return inboxListing(yield* door.cards.entries(), [], () => true);
});

const list = (query: CardQuery) => Effect.flatMap(listed, (l) => cardListOf(l, query));

/** What an exit holds, or the kind of the refusal it failed with. */
const valueOf = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw new Error(`failed: ${String(exit.cause)}`);
};
const kindOf = <A, E>(exit: Exit.Exit<A, E>): string => {
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
  for (const page of pages) for (const item of page.items) assert.equal(item.status.source, undefined, "a list's items carry no file");
});

test('a card is an object: its factory its namespace, filed time, a digest of its text, its labels, spec and status', () => {
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
  assert.match(card.metadata.resourceVersion, /^[0-9a-f]{16}$/);
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
  const how = howOf(undefined, process.env.WF_ROOT);
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

test('a stray entry is listed, never hidden: under its file, with why it is no card, dated when it was written; walked apart from a card of its name', () => {
  const home = scratch('card-strays-');
  const inbox = path.join(home, 'inbox');
  fs.mkdirSync(path.join(inbox, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(inbox, 'notes.md'), aCard('Notes'));
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
      }).pipe(Effect.provide(cardDoorFiles(home)), Effect.provide(stand().layer)),
    ),
  );
  assert.deepEqual(
    walked.map((c) => [c.metadata.name, c.status.file]),
    [
      ['idea.txt', 'idea.txt'],
      ['notes', 'notes'],
      ['notes', 'notes.md'],
      ['sub/', 'sub/'],
    ],
    'each entry once, a page at a time, the stray notes and the card notes.md two places of the list',
  );
  const saidWhy = walked.filter((c) => c.status.error !== undefined).map((c) => c.status.file);
  assert.deepEqual(saidWhy, ['idea.txt', 'notes', 'sub/'], 'each stray says why it is no card');
  const idea = walked[0];
  assert.equal(idea?.metadata.creationTimestamp, fs.statSync(path.join(inbox, 'idea.txt')).mtime.toISOString(), 'dated by its file');
  assert.equal(walked[3]?.metadata.creationTimestamp, fs.statSync(path.join(inbox, 'sub')).mtime.toISOString(), 'a folder by its own');
});
