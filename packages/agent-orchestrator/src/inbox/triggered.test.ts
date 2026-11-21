/**
 * The inbox's triggered queue (`inboxListing` with its `triggering`): a card of a factory whose labels a card trigger of that factory
 * selects is listed queued by it, read on every pass and never written on the card, on its own workflow where it names one and on the
 * trigger's target where it names none, ordered with the cards queued by hand by when it was filed; two targets for a card naming none
 * leave it waiting on a clash; a card of another factory, one queued by hand and one already started are the triggers' none.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { inboxListing, type Triggering } from './inbox.ts';

/** The card file `name`.md of the factory `factory`, its labels `labels`, its other frontmatter lines `lines`. */
const card = (name: string, factory: string, labels: string, lines = '') => ({
  file: `${name}.md`,
  text: `---\nfactory: ${factory}\nlabels: { ${labels} }\n${lines}---\n${name}.\n`,
});

/** The card triggers of the factories `f` and `g` that `selected` names, each card filed at `filedAt[name]`. */
const triggering = (filedAt: Readonly<Record<string, string>>, ...selected: Array<[string, string, string, string]>) =>
  ({
    triggers: selected.map(([factory, name, selector, target]) => ({
      factory,
      name,
      selector,
      target: { kind: 'Workflow', name: target },
    })),
    filedAt: (name) => filedAt[name] ?? null,
  }) satisfies Triggering;

const AT = { a: '2026-11-19T10:00:00.000Z', b: '2026-11-19T09:00:00.000Z' };
const READY = triggering(AT, ['f', 'ready', 'ready', 'door']);

/** What the listing says of each card: its state, its queue record and its clash. */
const said = (files: ReturnType<typeof card>[], t: Triggering | undefined, runs: Parameters<typeof inboxListing>[1] = []) =>
  inboxListing(files, runs, new Map(), new Map(), t).map((l) => ({
    name: l.name,
    state: l.state,
    ...(l.queued ? { queued: l.queued } : {}),
    ...(l.clash ? { clash: l.clash } : {}),
  }));

describe('a card trigger queues the cards of its factory it selects', () => {
  test('a labelled card naming no workflow is queued by the trigger on its target, placed by when it was filed', () => {
    assert.deepEqual(said([card('a', 'f', 'ready: yes')], READY), [
      { name: 'a', state: 'queued', queued: { at: AT.a, place: 1, by: ['ready'], workflow: 'door' } },
    ]);
  });
  test('without the label it is filed', () => {
    assert.deepEqual(said([card('a', 'f', 'other: yes')], READY), [{ name: 'a', state: 'filed' }]);
  });
  test('two triggers to two targets leave a card naming no workflow waiting on a clash', () => {
    const two = triggering(AT, ['f', 'bugs', 'kind=bug', 'quick'], ['f', 'ready', 'ready', 'door']);
    assert.deepEqual(said([card('a', 'f', 'ready: yes, kind: bug')], two), [{ name: 'a', state: 'filed', clash: ['bugs', 'ready'] }]);
  });
  test('a card naming its workflow is queued on that one', () => {
    assert.deepEqual(said([card('a', 'f', 'ready: yes', 'workflow: make\n')], READY)[0]?.queued, {
      at: AT.a,
      place: 1,
      by: ['ready'],
      workflow: 'make',
    });
  });
  test("a card of another factory is not the trigger's", () => {
    assert.deepEqual(said([card('a', 'g', 'ready: yes')], READY), [{ name: 'a', state: 'filed' }]);
  });
  test('a card queued by hand keeps its own queue and no trigger, and orders with the triggered by when each was queued', () => {
    const files = [card('a', 'f', 'ready: yes'), card('b', 'f', 'ready: yes', 'workflow: make\nqueued: 2026-11-19T09:30:00.000Z\n')];
    assert.deepEqual(said(files, READY), [
      { name: 'a', state: 'queued', queued: { at: AT.a, place: 2, by: ['ready'], workflow: 'door' } },
      { name: 'b', state: 'queued', queued: { at: '2026-11-19T09:30:00.000Z', place: 1 } },
    ]);
  });
  test('a card already started is queued no more', () => {
    const run: Parameters<typeof inboxListing>[1][number] = { id: 'r-1', from: { inbox: 'a' }, phase: 'running' };
    assert.equal(said([card('a', 'f', 'ready: yes')], READY, [run])[0]?.queued, undefined);
  });
  test('with no triggering handed, nothing is queued by a trigger', () => {
    assert.deepEqual(said([card('a', 'f', 'ready: yes')], undefined), [{ name: 'a', state: 'filed' }]);
  });
});
