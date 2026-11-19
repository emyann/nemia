/**
 * The filter over the whole lists (src/lib/listFilter.ts): what the address keeps of it, `?q=`, and which things it keeps — those whose
 * name or one-line description holds what was typed, in any case.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { filterOf, matches } from '../src/lib/listFilter.ts';

test('filterOf: the address keeps a filter of any text, and nothing else', () => {
  const rows: Array<[Record<string, unknown>, { q?: string }]> = [
    [{ q: 'dev' }, { q: 'dev' }],
    [{ q: ' ' }, { q: ' ' }],
    [{ q: '' }, {}],
    [{ q: 3 }, {}],
    [{}, {}],
    [{ repo: 'x' }, {}],
  ];
  for (const [search, kept] of rows) assert.deepEqual(filterOf(search), kept, JSON.stringify(search));
});

test('matches: by name or description, in any case, the query trimmed', () => {
  const rows: Array<[string, string, string | null | undefined, boolean]> = [
    ['', 'triage', null, true],
    ['   ', 'triage', 'Sorts cards.', true],
    ['tri', 'triage', null, true],
    ['TRI', 'triage', null, true],
    ['  tri ', 'triage', null, true],
    ['sorts', 'triage', 'Sorts cards.', true],
    ['CARDS', 'triage', 'Sorts cards.', true],
    ['dev', 'triage', 'Sorts cards.', false],
    ['dev', 'triage', null, false],
    ['dev', 'triage', undefined, false],
    ['age sorts', 'triage', 'Sorts cards.', false],
  ];
  for (const [query, name, description, kept] of rows) assert.equal(matches(query, name, description), kept, `${query} / ${name}`);
});
