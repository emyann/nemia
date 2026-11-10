/**
 * `nemia stats` as an entry of the table: how it prints what it read. What it refuses of a command line before anything is read are rows
 * of `REFUSALS` (`command.test.ts`).
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { statsOf } from './stats.ts';

process.env.WF_ROOT = scratch('wf-reads-');
const { STATS } = await import('./commands.verb.ts');

test('nemia stats prints JSON with --json, one line with --line, and its tiles and rows with neither', () => {
  const s = statsOf({ tries: [], runs: [], frozen: [] }, {}, new Date('2026-10-04T12:00:00Z'));
  const json = STATS.print?.(s, { json: true }) ?? [];
  assert.equal(json.length, 1, 'the JSON is one block');
  assert.deepEqual(JSON.parse(json[0] ?? ''), s, 'the whole answer, read back as it was');
  const line = STATS.print?.(s, { line: true }) ?? [];
  assert.equal(line.length, 1, 'one line');
  for (const fact of ['14 days', 'runs finished', 'landed']) assert.ok(line[0]?.includes(fact), `the recap says ${fact}`);
  const words = STATS.print?.(s, {}) ?? [];
  assert.ok(words.length > 1, words.join('\n'));
  assert.ok(
    words.some((l) => l.includes('no try has ended')),
    'an empty store says nothing has ended',
  );
  assert.ok(!words.some((l) => l.includes('runs finished')), 'and not the recap line');
});
