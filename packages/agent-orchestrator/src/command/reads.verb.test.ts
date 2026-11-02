/**
 * `nemia stats` as an entry of the table: how it prints what it read. What `nemia show`, `nemia logs` and `nemia stats` refuse of a
 * command line before anything is read are rows of `REFUSALS` (`command.test.ts`).
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from '../../test/scratch.ts';
import { statsLine, statsLines } from '../stats/index.ts';
import { statsOf } from '../stats/stats.ts';

process.env.WF_ROOT = scratch('wf-reads-');
const { STATS } = await import('./reads.verb.ts');

test('nemia stats prints JSON with --json, one line with --line, and its tiles and rows with neither', () => {
  const s = statsOf({ tries: [], runs: [], frozen: [] }, {}, new Date('2026-10-04T12:00:00Z'));
  assert.deepEqual(STATS.print?.(s, { json: true }), [JSON.stringify(s, null, 2)]);
  assert.deepEqual(STATS.print?.(s, { line: true }), [statsLine(s)]);
  assert.deepEqual(STATS.print?.(s, {}), statsLines(s));
});
