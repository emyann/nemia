/**
 * `nemia label run` and `nemia label inbox` over the Run and Card doors' memory: a key set, a change refused without `--overwrite` and
 * taken with it, a key removed, an absent one said as no change (the verb reads no status, so a finished run is labelled as any), a
 * card's other keys and body kept, and the refusals — each by its kind, exit 2 and the facts it names.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect, Exit, Layer } from 'effect';
import { names } from '../../test/assessed.ts';
import { scratch } from 'test-kit/scratch';

process.env.WF_ROOT = scratch('wf-labels-verb-');
const { labelCard, labelRun } = await import('./labels.verb.ts');
const { LABEL_RUN } = await import('./commands.verb.ts');
const { RunDoor } = await import('../runs/runs.store.ts');
const { runDoorMemory } = await import('../runs/memory.store.ts');
const { CardDoor } = await import('../cards/cards.store.ts');
const { cardDoorMemory } = await import('../cards/memory.store.ts');
const { CardName } = await import('../inbox/inbox.model.ts');
const { RunId } = await import('../record/record.model.ts');
const { aRun } = await import('../../test/run-walks.ts');

/** A program run over fresh memory doors, a run `r-1` and a card `cache-a1` planted first: its exit. */
function over<A, E>(program: Effect.Effect<A, E>, card = '---\nworkflow: build\nfrom: a-1x2y\n---\nCache the views.\n') {
  const plant = Effect.gen(function* () {
    yield* (yield* RunDoor).runs.create(aRun('r-1'));
    yield* (yield* CardDoor).cards.add(CardName.read('cache-a1'), card);
  });
  return Effect.runSync(
    Effect.exit(Effect.andThen(plant, program).pipe(Effect.provide(Layer.mergeAll(runDoorMemory(), cardDoorMemory())))),
  );
}

/** The refusal an exit failed with: its kind, exit code and words. */
function refusal(exit: Exit.Exit<unknown, unknown>): { _tag: string; exitCode: number; message: string } {
  assert.equal(Exit.isFailure(exit), true, 'refused');
  if (!Exit.isFailure(exit)) throw new Error('unreachable');
  const failure = exit.cause.reasons.find((r) => r._tag === 'Fail');
  assert.ok(failure && failure._tag === 'Fail', 'a failure, not a defect');
  const error: { _tag: string; exitCode: number; message: string } = failure.error as never;
  return error;
}

const value = <A>(exit: Exit.Exit<A, unknown>): A => {
  if (!Exit.isSuccess(exit)) assert.fail(`refused: ${JSON.stringify(exit.cause)}`);
  return exit.value;
};

test('`nemia label run`: set, change refused without --overwrite and taken with it, removed, an absent key no change', () => {
  const set = value(over(labelRun('r-1', ['team=core'])));
  assert.deepEqual(set, { kind: 'Run', name: 'r-1', labels: { team: 'core' }, was: {} });

  const stored = value(
    over(
      Effect.gen(function* () {
        yield* labelRun('r-1', ['team=core']);
        const refused = yield* Effect.flip(labelRun('r-1', ['team=infra']));
        const changed = yield* labelRun('r-1', ['team=infra'], true);
        const removed = yield* labelRun('r-1', ['team-', 'x-']);
        const run = yield* (yield* RunDoor).runs.read(RunId.read('r-1'));
        return { refused, changed, removed, labels: run.labels };
      }),
    ),
  );
  assert.deepEqual([stored.refused._tag, stored.refused.exitCode], ['Invalid', 2]);
  names(stored.refused.message, 'team', 'core', '--overwrite');
  assert.deepEqual(stored.changed, { kind: 'Run', name: 'r-1', labels: { team: 'infra' }, was: { team: 'core' } });
  assert.deepEqual(stored.removed.labels, {});
  assert.equal(stored.labels, undefined, 'the map emptied leaves the run with none');

  const lines = LABEL_RUN.print(stored.removed, { labels: ['team-', 'x-'] });
  assert.ok(
    lines.some((line) => line.includes('team removed') && line.includes('infra')),
    lines.join('\n'),
  );
  assert.ok(
    lines.some((line) => line.includes('x already absent')),
    'an absent key removed is said as no change',
  );
});

test('`nemia label inbox`: its labels: written, every other key and the body kept, and edited again', () => {
  const read = value(
    over(
      Effect.gen(function* () {
        const done = yield* labelCard('cache-a1', ['team=core', 'area=inbox']);
        const text = yield* (yield* CardDoor).cards.read(CardName.read('cache-a1'));
        const again = yield* labelCard('cache-a1', ['area-']);
        return { done, text, again };
      }),
    ),
  );
  assert.deepEqual(read.done, { kind: 'Card', name: 'cache-a1', labels: { team: 'core', area: 'inbox' }, was: {} });
  assert.equal(read.text, '---\nworkflow: build\nfrom: a-1x2y\nlabels:\n  area: inbox\n  team: core\n---\nCache the views.\n');
  assert.deepEqual(read.again.labels, { team: 'core' });
});

test('REFUSED: an unknown run, an unknown card, a malformed edit, a reserved key, no edit at all — by kind, exit 2 and the facts named', async (t) => {
  const rows: Record<string, [Effect.Effect<unknown, unknown>, tag: string, facts: string[]]> = {
    'a run the store does not have': [labelRun('r-gone', ['team=core']), 'Missing', ['r-gone', 'nemia ls']],
    'a card the inbox does not have': [labelCard('gone-b2', ['team=core']), 'Missing', ['gone-b2', 'nemia inbox', 'cache-a1']],
    'an edit that is neither key=value nor key-': [labelRun('r-1', ['team']), 'Invalid', ['"team"', 'key=value', 'key-']],
    'a reserved key': [labelRun('r-1', ['reason=x']), 'Invalid', ['reason']],
    'a closed key': [labelCard('cache-a1', ['factory=x']), 'Invalid', ['factory']],
    'no edit': [labelRun('r-1', []), 'Invalid', ['key=value']],
    'an id that is not a run’s': [labelRun('R 1', ['team=core']), 'Invalid', ['"R 1"']],
  };
  for (const [row, [program, tag, facts]] of Object.entries(rows))
    await t.test(row, () => {
      const err = refusal(over(program));
      assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
      names(err.message, ...facts);
    });
});
