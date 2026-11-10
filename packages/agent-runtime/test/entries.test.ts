/**
 * The runtime's two doors to one vocabulary: every name `agent-runtime/vocabulary` exports is the same value on `agent-runtime`, so a
 * caller that reads a word off one and a judgement off the other reads one table. Which names each entry exports is held by the
 * typecheck of the packages that import them, its map by `test/contract.test.ts`, and what the vocabulary door loads by
 * `test/vocabulary-door.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('every name the vocabulary door exports is the same value on the root', async () => {
  const root = { ...(await import('agent-runtime')) } as Record<string, unknown>;
  for (const [name, value] of Object.entries(await import('agent-runtime/vocabulary'))) assert.equal(root[name], value, name);
});
