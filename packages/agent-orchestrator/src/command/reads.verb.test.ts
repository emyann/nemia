/**
 * `nemia stats` and `nemia closeout` as entries of the table: how each prints what it read. What `nemia show`, `nemia logs`,
 * `nemia stats` and `nemia closeout` refuse of a command line before anything is read are rows of `REFUSALS` (`command.test.ts`).
 *
 * `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scratch } from 'test-kit/scratch';
import { statsOf } from '../stats/stats.ts';

process.env.WF_ROOT = scratch('wf-reads-');
const { CLOSEOUT, STATS } = await import('./reads.verb.ts');

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
  const lines = CLOSEOUT.print?.({ try: 2, closeout, unreadable: null }, { runId: 'r-1', step: 'implement' }) ?? [];
  const text = lines.join('\n');
  for (const said of ['blocked', 'Stopped at the flag.', 'Two names would do.', 'which flag name ships', 'notes.md', 'pull request']) {
    assert.ok(text.includes(said), `the print carries ${said}`);
  }
  assert.ok(text.includes('again'), 'an output field is printed by its name');
  assert.ok(text.includes('a.ts'), "and with its value, a review's findings among them");
  const reply = lines.findIndex((l) => l.includes('the flag is unnamed'));
  assert.ok(lines[reply + 1]?.includes('the spec names it in the next card'), "each reply's why is on the line under it");
  assert.deepEqual(
    CLOSEOUT.print?.({ try: 2, closeout: null, unreadable: null }, { runId: 'r-1', step: 'implement' }).length,
    1,
    'a try with no closeout yet says so in one line',
  );
});
