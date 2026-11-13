/**
 * The Card's edit (`editCard`) over the Run and Card doors' memory: a card written from its text keeps its name, its labels, its factory
 * and its `queued:`, and takes the text's body and keys; each refusal by its kind and exit code with the file left as it was, byte for
 * byte: a started card, a key that does not read, a factory moved, labels changed, a `queued:` changed, a stale version, no body, a
 * `from:` naming a run the store lacks, and a card in another namespace. A text the card already reads as writes nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Layer } from 'effect';
import type { CardEdit } from 'objects';
import { editCard } from './card-edit.verb.ts';
import { cardVersion } from './card-write.verb.ts';
import { RunDoor } from '../runs/runs.store.ts';
import { runDoorMemory } from '../runs/memory.store.ts';
import { CardDoor } from '../cards/cards.store.ts';
import { cardDoorMemory } from '../cards/memory.store.ts';
import { CardName } from '../inbox/inbox.model.ts';
import { aRun } from '../../test/run-walks.ts';

const QUEUED = '2026-11-01T10:00:00.000Z';

/** The card planted, in the default factory: a workflow, a gate, a label. */
const PLANTED = ['---', 'workflow: build', 'gate: plan', 'labels:', '  team: core', '---', '', 'Add a cache.', '', 'All of it.', ''].join(
  '\n',
);

/** The card planted queued. */
const QUEUED_CARD = PLANTED.replace('workflow: build\n', `workflow: build\nqueued: ${QUEUED}\n`);

/** A card's text: its frontmatter lines, then its body. */
const card = (keys: readonly string[], body = 'Add a cache to the views.\n\nThe lists come later.\n'): string =>
  keys.length ? ['---', ...keys, '---', '', body].join('\n') : body;

type Over<A> = { exit: Exit.Exit<A, unknown>; text: string | null; others: readonly string[] };

/**
 * A program run over fresh memory doors with the run `r-1` and the card `add-a-cache-x1y2` (`text`) planted first, a run started from
 * the card where `started`: its exit, the card's text after it, and every other entry's file the door holds.
 */
function over<A, E>(program: Effect.Effect<A, E>, opts: { text?: string; started?: boolean } = {}): Over<A> {
  const name$ = CardName.read('add-a-cache-x1y2');
  const all = Effect.gen(function* () {
    const runs = (yield* RunDoor).runs;
    const door = (yield* CardDoor).cards;
    yield* runs.create(aRun('r-1'));
    if (opts.started) yield* runs.create({ ...aRun('r-3'), from: { inbox: 'add-a-cache-x1y2' } });
    yield* door.add(name$, opts.text ?? PLANTED);
    const exit = yield* Effect.exit(program);
    const files = (yield* door.entries()).map((entry) => entry.file);
    return { exit, text: yield* door.read(name$), others: files.filter((f) => f !== 'add-a-cache-x1y2.md') };
  });
  return Effect.runSync(all.pipe(Effect.provide(Layer.mergeAll(runDoorMemory(), cardDoorMemory()))));
}

/** The refusal an exit failed with: its kind and exit code, and its message. */
function refusal(exit: Exit.Exit<unknown, unknown>): [string, number, string] {
  if (!Exit.isFailure(exit)) assert.fail('refused');
  const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
  if (failure === undefined || failure._tag !== 'Fail') assert.fail(`a failure, not a defect: ${String(exit.cause)}`);
  const error = failure.error as { _tag: string; exitCode: number; message: string };
  return [error._tag, error.exitCode, error.message];
}

const edit = (source: string, resourceVersion?: string): CardEdit => ({
  source,
  ...(resourceVersion !== undefined ? { resourceVersion } : {}),
});

test('a card retitled and cut keeps its name and labels, and takes the text: its workflow, no gate, its body', () => {
  const source = card(['workflow: quick']);
  const { exit, text, others } = over(editCard('add-a-cache-x1y2', 'default', edit(source)));
  assert.equal(Exit.isSuccess(exit), true, String(exit));
  assert.deepEqual(others, [], 'no other card filed');
  assert.equal(
    text,
    ['---', 'workflow: quick', 'labels:', '  team: core', '---', 'Add a cache to the views.', '', 'The lists come later.', ''].join('\n'),
  );
  if (Exit.isSuccess(exit)) {
    assert.equal(exit.value.card.name, 'add-a-cache-x1y2');
    assert.equal(exit.value.written, true);
  }
  assert.notEqual(cardVersion(text ?? ''), cardVersion(PLANTED), 'its version moved');
});

test("a text in the card's own words is written: its factory or its labels sent back as the card has them", async (t) => {
  const rows: { name: string; source: string; planted?: string }[] = [
    { name: 'its factory named as its namespace', source: card(['workflow: build', 'factory: default']) },
    { name: 'its labels sent back', source: card(['workflow: build', 'labels:', '  team: core']) },
    { name: 'a byte order mark and CRLF lines', source: `﻿${card(['workflow: build']).replace(/\n/g, '\r\n')}` },
    { name: 'a queued card, its queued: left out, stays queued', source: card(['workflow: build']), planted: QUEUED_CARD },
  ];
  for (const row of rows) {
    await t.test(row.name, () => {
      const { exit, text } = over(editCard('add-a-cache-x1y2', 'default', edit(row.source)), { text: row.planted ?? PLANTED });
      assert.equal(Exit.isSuccess(exit), true, String(exit));
      assert.match(text ?? '', /team: core/);
      assert.match(text ?? '', /\nAdd a cache to the views\.\n\nThe lists come later\.\n$/);
      if (row.planted === QUEUED_CARD) assert.match(text ?? '', new RegExp(`queued: ${QUEUED}`));
    });
  }
});

test('a text the card already reads as writes nothing, and its version stays', () => {
  const { exit, text } = over(editCard('add-a-cache-x1y2', 'default', edit(PLANTED, cardVersion(PLANTED))));
  assert.equal(Exit.isSuccess(exit), true, String(exit));
  if (Exit.isSuccess(exit)) assert.equal(exit.value.written, false);
  assert.equal(text, PLANTED);
});

test('REFUSED, each by its kind, and the file left as it was', async (t) => {
  const rows: {
    name: string;
    source: string;
    planted?: string;
    namespace?: string;
    started?: boolean;
    version?: string;
    says: [string, number];
    names?: string;
  }[] = [
    {
      name: 'a started card is a Conflict naming inbox add',
      source: card(['workflow: build']),
      started: true,
      says: ['Conflict', 2],
      names: 'nemia inbox add',
    },
    {
      name: 'a started card, its text not reading, is a Conflict still',
      source: card(['gate: a,b']),
      started: true,
      says: ['Conflict', 2],
    },
    { name: 'a gate of two steps is Invalid', source: card(['workflow: build', 'gate: a,b']), says: ['Invalid', 2] },
    { name: 'a queued: that is no time is Invalid', source: card(['workflow: build', 'queued: soon']), says: ['Invalid', 2] },
    { name: 'a model: that does not read is Invalid', source: card(['workflow: build', 'model: implement']), says: ['Invalid', 2] },
    { name: 'a key no card has is Invalid', source: card(['workflow: build', 'owner: me']), says: ['Invalid', 2] },
    {
      name: 'another factory is Invalid naming inbox add',
      source: card(['workflow: build', 'factory: other']),
      says: ['Invalid', 2],
      names: 'nemia inbox add',
    },
    {
      name: 'other labels are Invalid naming label inbox',
      source: card(['workflow: build', 'labels:', '  team: x']),
      says: ['Invalid', 2],
      names: 'nemia label inbox',
    },
    { name: 'labels taken off are Invalid', source: card(['workflow: build', 'labels: {}']), says: ['Invalid', 2] },
    {
      name: 'a queued: other than the card has is Invalid naming inbox queue',
      source: card(['workflow: build', 'queued: 2026-11-02T10:00:00.000Z']),
      planted: QUEUED_CARD,
      says: ['Invalid', 2],
      names: 'nemia inbox queue',
    },
    { name: 'a stale version is a Conflict', source: card(['workflow: build']), version: 'not-the-one', says: ['Conflict', 2] },
    { name: 'no body is Invalid', source: card(['workflow: build'], ''), says: ['Invalid', 2] },
    { name: 'a from: naming a run the store lacks is Missing', source: card(['workflow: build', 'from: nope-9z9z']), says: ['Missing', 2] },
    { name: 'a card in another namespace is Missing', source: card(['workflow: build']), namespace: 'alpha', says: ['Missing', 2] },
  ];
  for (const row of rows) {
    await t.test(row.name, () => {
      const planted = row.planted ?? PLANTED;
      const { exit, text } = over(editCard('add-a-cache-x1y2', row.namespace ?? 'default', edit(row.source, row.version)), {
        text: planted,
        started: row.started ?? false,
      });
      const [kind, code, message] = refusal(exit);
      assert.deepEqual([kind, code], row.says);
      if (row.names !== undefined) assert.ok(message.includes(row.names), `${row.names} is not named in: ${message}`);
      assert.equal(text, planted, 'nothing written');
    });
  }
});
