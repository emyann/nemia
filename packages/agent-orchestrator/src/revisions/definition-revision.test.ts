/**
 * `definitionRevision` (`pin.verb.ts`): the ledger's number for what a definition holds now, read through the Ledger door and never
 * appended — the number a resolve of that content was given, or one past the highest for a content the ledger has not seen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Effect } from 'effect';
import { ledgerDoorMemory } from './memory.store.ts';
import { LedgerDoor } from './revisions.store.ts';
import { definitionRevision } from './pin.verb.ts';

test('a definition reads the number its content was appended at, an unseen one the next, and nothing is appended', () => {
  const program = Effect.gen(function* () {
    const ledger = yield* LedgerDoor;
    yield* ledger.entries.append({ kind: 'agent', name: 'architect' }, 'h1', '2026-11-05T00:00:00.000Z');
    yield* ledger.entries.append({ kind: 'agent', name: 'architect' }, 'h2', '2026-11-05T00:00:01.000Z');
    const before = yield* ledger.entries.of({ kind: 'agent', name: 'architect' });
    const seen = yield* definitionRevision('agent', 'architect', 'h1');
    const unseen = yield* definitionRevision('agent', 'architect', 'h3');
    const fresh = yield* definitionRevision('skill', 'git', 'h1');
    const after = yield* ledger.entries.of({ kind: 'agent', name: 'architect' });
    return { before, seen, unseen, fresh, after };
  });
  const { before, seen, unseen, fresh, after } = Effect.runSync(program.pipe(Effect.provide(ledgerDoorMemory())));
  assert.equal(seen, 1, 'the content appended first is revision 1');
  assert.equal(unseen, 3, 'a content the ledger lacks reads one past the highest');
  assert.equal(fresh, 1, 'a kind and name with no ledger reads 1');
  assert.deepEqual(after, before, 'reading wrote nothing');
});
