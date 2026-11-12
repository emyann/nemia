/**
 * The Card's update (`replaceCard`) over the Run and Card doors' memory: a card written whole — its workflow, gate, `from:`, body and
 * labels — its `queued:` and factory kept, a write that keeps every key leaving the file as it was, byte for byte, and each refusal by
 * its kind and exit code with the file left as it was: no card, a card in another namespace, a started card, a stale `resourceVersion`,
 * a changed `queued`, no body, a `from:` naming a run the store lacks, a retired `repo:` set or changed, and a workflow changed to a path.
 * An old card's `repo:` stays editable: written back as read it is kept, left out it is taken off.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Layer } from 'effect';
import type { CardWrite } from 'objects';
import { replaceCard, cardVersion } from './card-write.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { aRun } from '../../test/run-walks.ts';

const QUEUED = '2026-11-01T10:00:00.000Z';

/** The card planted: queued, labelled, handed a run, in the factory `alpha`. */
const PLANTED = [
  '---',
  'workflow: build',
  `queued: ${QUEUED}`,
  'gate: design',
  'factory: alpha',
  'from: r-1',
  'labels:',
  '  team: core',
  '---',
  '',
  'Cache the views.',
  '',
].join('\n');

/** What a write of every key of the planted card as it is sends. */
const asIs = (): CardWrite => ({
  metadata: {},
  spec: { workflow: 'build', gate: 'design', from: ['r-1'], queued: QUEUED, body: '\nCache the views.' },
});

/**
 * A program run over fresh memory doors with runs `r-1` and `r-2` and the card `cache-a1` (`text`) planted first, a run started from
 * the card where `started`: its exit, and the card's text after it.
 */
function over<A, E>(program: Effect.Effect<A, E>, opts: { text?: string; started?: boolean } = {}) {
  const read = Effect.gen(function* () {
    return yield* (yield* CardDoor).cards.read(CardName.read('cache-a1'));
  });
  const all = Effect.gen(function* () {
    const runs = (yield* RunDoor).runs;
    yield* runs.create(aRun('r-1'));
    yield* runs.create(aRun('r-2'));
    if (opts.started) yield* runs.create({ ...aRun('r-3'), from: { inbox: 'cache-a1' } });
    yield* (yield* CardDoor).cards.add(CardName.read('cache-a1'), opts.text ?? PLANTED);
    const exit = yield* Effect.exit(program);
    return { exit, text: yield* read };
  });
  return Effect.runSync(all.pipe(Effect.provide(Layer.mergeAll(runDoorMemory(), cardDoorMemory()))));
}

/** The refusal an exit failed with: its kind and exit code. */
function refusal(exit: Exit.Exit<unknown, unknown>): [string, number] {
  if (!Exit.isFailure(exit)) assert.fail('refused');
  const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
  if (failure === undefined || failure._tag !== 'Fail') assert.fail(`a failure, not a defect: ${String(exit.cause)}`);
  const error = failure.error as { _tag: string; exitCode: number };
  return [error._tag, error.exitCode];
}

test('a card written whole: workflow, gate, from, body and labels written, queued and factory kept', () => {
  const write: CardWrite = {
    metadata: { labels: { team: 'infra', area: 'web' } },
    spec: { workflow: 'ship', gate: 'review', from: ['r-2', 'r-1'], queued: QUEUED, body: 'Cache the views, and the lists.' },
  };
  const { exit, text } = over(replaceCard('cache-a1', 'alpha', write));
  assert.equal(Exit.isSuccess(exit), true, String(exit));
  assert.equal(
    text,
    [
      '---',
      'workflow: ship',
      `queued: ${QUEUED}`,
      'gate: review',
      'factory: alpha',
      'from: r-2, r-1',
      'labels:',
      '  area: web',
      '  team: infra',
      '---',
      'Cache the views, and the lists.',
      '',
    ].join('\n'),
  );
});

test('labels left out are kept; an empty map takes them all off; a key left out of the spec is taken off', () => {
  const kept = over(replaceCard('cache-a1', 'alpha', { metadata: {}, spec: { workflow: 'build', queued: QUEUED, body: 'B' } }));
  assert.match(kept.text ?? '', /team: core/);
  assert.doesNotMatch(kept.text ?? '', /gate:|from:/, 'gate and from not sent are taken off');
  const cleared = over(replaceCard('cache-a1', 'alpha', { metadata: { labels: {} }, spec: { ...asIs().spec } }));
  assert.doesNotMatch(cleared.text ?? '', /labels:/);
});

test('a write keeping every key leaves the file byte-equal', () => {
  const { exit, text } = over(replaceCard('cache-a1', 'alpha', asIs()));
  assert.equal(Exit.isSuccess(exit), true, String(exit));
  assert.equal(text, PLANTED);
  const versioned = over(replaceCard('cache-a1', 'alpha', { ...asIs(), metadata: { resourceVersion: cardVersion(PLANTED) } }));
  assert.equal(Exit.isSuccess(versioned.exit), true, 'the version the card has is no stale one');
  assert.equal(versioned.text, PLANTED);
});

test('each refusal by its kind, and the file left as it was', async (t) => {
  const rows: { name: string; write: CardWrite; name$?: string; namespace?: string; started?: boolean; says: [string, number] }[] = [
    { name: 'no such card is Missing', write: asIs(), name$: 'gone-a1', says: ['Missing', 2] },
    { name: 'a card in another namespace is Missing', write: asIs(), namespace: 'default', says: ['Missing', 2] },
    { name: 'a started card is a Conflict', write: asIs(), started: true, says: ['Conflict', 2] },
    {
      name: 'a stale resourceVersion is a Conflict',
      write: { ...asIs(), metadata: { resourceVersion: 'not-the-one' } },
      says: ['Conflict', 2],
    },
    {
      name: 'a changed queued is Invalid',
      write: { ...asIs(), spec: { ...asIs().spec, queued: '2026-11-02T10:00:00.000Z' } },
      says: ['Invalid', 2],
    },
    {
      name: 'queued taken off is Invalid',
      write: { ...asIs(), spec: { workflow: 'build', body: 'B' } },
      says: ['Invalid', 2],
    },
    { name: 'no body is Invalid', write: { ...asIs(), spec: { ...asIs().spec, body: '' } }, says: ['Invalid', 2] },
    {
      name: 'a from: naming a run the store lacks is Missing',
      write: { ...asIs(), spec: { ...asIs().spec, from: ['nope-9z9z'] } },
      says: ['Missing', 2],
    },
    {
      name: 'a repo set on a card that has none is Invalid: it is retired',
      write: { ...asIs(), spec: { ...asIs().spec, repo: '/code/app' } },
      says: ['Invalid', 2],
    },
    {
      name: 'a workflow changed to a path is Invalid',
      write: { ...asIs(), spec: { ...asIs().spec, workflow: 'flows/dev' } },
      says: ['Invalid', 2],
    },
    {
      name: 'a bad label is Invalid',
      write: { ...asIs(), metadata: { labels: { 'not a key': 'x' } } },
      says: ['Invalid', 2],
    },
  ];
  for (const row of rows) {
    await t.test(row.name, () => {
      const { exit, text } = over(replaceCard(row.name$ ?? 'cache-a1', row.namespace ?? 'alpha', row.write), {
        started: row.started ?? false,
      });
      assert.deepEqual(refusal(exit), row.says);
      assert.equal(text, PLANTED, 'nothing written');
    });
  }
});

test("an old card's retired repo: written back as read is kept, changed is refused, left out is taken off", async (t) => {
  const old = PLANTED.replace('workflow: build\n', 'workflow: build\nrepo: /x\n');
  const withRepo = (repo?: string): CardWrite => ({ ...asIs(), spec: { ...asIs().spec, ...(repo !== undefined ? { repo } : {}) } });
  await t.test('written back with the same repo: accepted, the file unchanged', () => {
    const { exit, text } = over(replaceCard('cache-a1', 'alpha', withRepo('/x')), { text: old });
    assert.equal(Exit.isSuccess(exit), true, String(exit));
    assert.equal(text, old);
  });
  await t.test('written with another repo: Invalid, the file unchanged', () => {
    const { exit, text } = over(replaceCard('cache-a1', 'alpha', withRepo('/y')), { text: old });
    assert.deepEqual(refusal(exit), ['Invalid', 2]);
    assert.equal(text, old);
  });
  await t.test('written without its repo: accepted, the line taken off', () => {
    const { exit, text } = over(replaceCard('cache-a1', 'alpha', withRepo()), { text: old });
    assert.equal(Exit.isSuccess(exit), true, String(exit));
    assert.equal(text, PLANTED);
  });
});
