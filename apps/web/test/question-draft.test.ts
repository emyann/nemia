/**
 * `chosenDraft`'s law `severalKeepTheirChoices`, held here while tsverify 0.9.1 answers `inconsistent` on it (its own bug, filed in the
 * tsverify factory as card `prover-a-law-that-holds-is-n-8890`): choosing an option of a question that takes several keeps every option
 * chosen before, and adds it. The law's own condition, asserted over planted drafts and a small sweep; it goes back into
 * `contracts/question-draft.contract.ts`, and this file away, once a release of tsverify proves it.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { Draft, DraftEntry, WayOut } from '../contracts/question-draft.contract.ts';
import { chosenDraft, entryOf } from '../src/lib/question-draft/questionDraft.ts';

/** A question that takes several, as the draft reads one. */
const several = (title: string) => ({ title, options: [], multiple: true });

/** The law's condition, as the contract wrote it, of choosing `label` on `title` in `draft`. */
const keepsAndAdds = (draft: Draft, title: string, label: string) => {
  const after = entryOf(chosenDraft(draft, several(title), label, true), title).chose;
  return after.includes(label) && entryOf(draft, title).chose.every((l) => after.includes(l));
};

test('choosing one more option of a question that takes several keeps every choice made before it, and adds it', () => {
  const planted: { draft: Draft; title: string; label: string }[] = [
    {
      draft: {
        E: { way: 'none', chose: ['l', 'l', 'l', 'l'], own: '' },
        G: { way: 'none', chose: ['l', 'l', 'l', 'l'], own: '' },
        F: { way: 'none', chose: ['l', 'l', 'l', 'l'], own: '' },
        '': { way: 'none', chose: ['l', 'C', 'D', 'A'], own: '' },
      },
      title: '',
      label: '',
    },
    { draft: { e: { way: 'else', chose: ['C', 'e', 'l', 'B'], own: '' } }, title: 'e', label: '' },
    {
      draft: { e: { way: 'none', chose: ['l', 'e', '', 's'], own: '' }, l: { way: 'none', chose: ['e', 'e', 'e', 'e'], own: '' } },
      title: 'e',
      label: 'A',
    },
    { draft: { A: { way: null, chose: ['D', 'C', 'B'], own: '' } }, title: 'A', label: 'E' },
    { draft: { a: { way: null, chose: ['x', 'y', 'z', 'w'], own: 'why' } }, title: 'a', label: 'x' },
    { draft: {}, title: 'a', label: 'x' },
  ];
  for (const { draft, title, label } of planted) assert.ok(keepsAndAdds(draft, title, label), JSON.stringify({ draft, title, label }));
});

test('so it holds over every draft of up to five choices among three labels, each way out, and each label chosen', () => {
  const labels = ['', 'a', 'b'];
  const lists: string[][] = [[]];
  for (let length = 1; length <= 5; length++)
    for (const list of lists.filter((l) => l.length === length - 1)) for (const l of labels) lists.push([...list, l]);
  const ways: (WayOut | null)[] = [null, 'else', 'none'];
  let swept = 0;
  for (const chose of lists)
    for (const way of ways)
      for (const label of [...labels, 'c']) {
        const entry: DraftEntry = { chose, own: '', way };
        const draft: Draft = { q: entry, other: { chose: ['a'], own: '', way: null } };
        assert.ok(keepsAndAdds(draft, 'q', label), JSON.stringify({ chose, way, label }));
        swept++;
      }
  assert.equal(swept, lists.length * ways.length * 4);
});
