/**
 * `nemia stats` and `nemia closeout` as entries of the table: how each prints what it read. What `nemia show`, `nemia logs`,
 * `nemia stats` and `nemia closeout` refuse of a command line before anything is read are rows of `REFUSALS` (`command.test.ts`).
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from '../../test/scratch.ts';
import { statsLine, statsLines } from '../stats/index.ts';
import { statsOf } from '../stats/stats.ts';

process.env.WF_ROOT = scratch('wf-reads-');
const { CLOSEOUT, STATS } = await import('./reads.verb.ts');

test('nemia stats prints JSON with --json, one line with --line, and its tiles and rows with neither', () => {
  const s = statsOf({ tries: [], runs: [], frozen: [] }, {}, new Date('2026-10-04T12:00:00Z'));
  assert.deepEqual(STATS.print?.(s, { json: true }), [JSON.stringify(s, null, 2)]);
  assert.deepEqual(STATS.print?.(s, { line: true }), [statsLine(s)]);
  assert.deepEqual(STATS.print?.(s, {}), statsLines(s));
});

test('nemia closeout prints the whole closeout a person reads: its question, its files and values, and the fields its workflow asked for', () => {
  const closeout = {
    apiVersion: 'nemia/v1',
    outcome: 'blocked' as const,
    summary: 'Stopped at the flag.',
    body: 'Two names would do.',
    needs: 'which flag name ships',
    artifacts: [{ path: '/runs/r/artifacts/implement/notes.md' }],
    values: [{ name: 'pull request', value: 'https://example.test/pr/1', link: 'https://example.test/pr/1' }],
    refused: [],
    output: { again: true, findings: [{ file: 'a.ts' }] },
    missing: [],
    replies: [{ finding: 'the flag is unnamed', answer: "won't fix", why: 'the spec names it in the next card' }],
    schema: {},
    questions: [],
    raw: {},
  };
  const lines = CLOSEOUT.print?.({ try: 2, closeout, unreadable: null }, { step: 'implement' }) ?? [];
  const text = lines.join('\n');
  for (const said of ['blocked', 'Stopped at the flag.', 'Two names would do.', 'which flag name ships', 'notes.md', 'pull request']) {
    assert.ok(text.includes(said), `the print carries ${said}`);
  }
  assert.ok(text.includes('again'), 'an output field is printed by its name');
  assert.ok(text.includes('a.ts'), "and with its value, a review's findings among them");
  const reply = lines.findIndex((l) => l.includes('the flag is unnamed'));
  assert.ok(lines[reply + 1]?.includes('the spec names it in the next card'), "each reply's why is on the line under it");
  assert.deepEqual(
    CLOSEOUT.print?.({ try: 2, closeout: null, unreadable: null }, { step: 'implement' }).length,
    1,
    'a try with no closeout yet says so in one line',
  );
});
