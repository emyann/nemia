/**
 * What an owner proposes as the person's choices compose its files from an upgrade's merge (`ownerSpec`), row by row, where no story
 * reaches: the rules or the instruction a choice removes, refused `Invalid` since no proposal removes them; and a hire the composed wiring
 * no longer holds, proposed with no agent, which applying it reads as a fire.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTrees, type TreeFile } from './index.ts';
import { ownerSpec } from './owner-spec.ts';

/** A tree of text files, by path. */
const tree = (files: Record<string, string>): TreeFile[] =>
  Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

/** A tree's text files, by path, as `ownerSpec` is handed the tree's now. */
const texts = (files: readonly TreeFile[]): ReadonlyMap<string, string> => new Map(files.map((f) => [f.path, f.bytes.toString()]));

test('an owner as the choices compose it, row by row: a removal of the rules or the instruction, and a hire dropped', async (t) => {
  for (const file of ['RULES.md', 'NEMIA.md'])
    await t.test(`--theirs on ${file}, which the template removes, is refused Invalid; --ours proposes the tree's`, () => {
      const base = tree({ [file]: 'one\n' });
      const ours = tree({ [file]: 'mine\n' });
      const merge = mergeTrees(base, ours, []);
      const [conflict] = merge.conflicts;
      assert.ok(conflict !== undefined, 'the change and the removal conflict');
      assert.throws(
        () => ownerSpec('acme', { kind: 'Factory', name: 'acme' }, merge, { [conflict.at]: 'theirs' }, texts(ours)),
        (err: { _tag?: string }) => err._tag === 'Invalid',
      );
      const kept = ownerSpec('acme', { kind: 'Factory', name: 'acme' }, merge, { [conflict.at]: 'ours' }, texts(ours));
      assert.deepEqual(kept, { [file === 'RULES.md' ? 'rules' : 'instruction']: 'mine\n' });
    });

  await t.test('a hire the composed wiring drops is proposed with its workflow and step and no agent: a fire', () => {
    const wiring = (hires: Record<string, string>) => ({ 'factory.json': `${JSON.stringify({ workflows: ['flow'], hires }, null, 2)}\n` });
    const base = tree(wiring({ 'flow/review': 'reviewer' }));
    const ours = tree(wiring({ 'flow/review': 'mine' }));
    const theirs = tree(wiring({}));
    const merge = mergeTrees(base, ours, theirs);
    const at = merge.conflicts.find((c) => c.at === 'factory.json#hires.flow/review')?.at;
    assert.ok(at !== undefined, merge.conflicts.map((c) => c.at).join(', '));
    const hire = { kind: 'Hire', name: 'flow.review' } as const;
    assert.deepEqual(ownerSpec('acme', hire, merge, { [at]: 'theirs' }, texts(ours)), { workflow: 'flow', step: 'review' });
    assert.deepEqual(ownerSpec('acme', hire, merge, { [at]: 'ours' }, texts(ours)), { workflow: 'flow', step: 'review', agent: 'mine' });
  });
});
