/**
 * What an owner proposes as the person's choices compose its files from an upgrade's merge (`ownerObjects`), row by row, where no story
 * reaches: the rules or the instruction a choice removes, refused `Invalid` since no proposal removes them; and a hire the composed wiring
 * no longer holds, proposed with no agent, which applying it reads as a fire.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { mergeTrees, type TreeFile } from './index.ts';
import { ownerObjects as objectsOf } from './owner-spec.ts';

/** A tree of text files, by path. */
const tree = (files: Record<string, string>) => Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

/** The one spec an owner proposes, as the choices compose it. */
const ownerObjects = (...args: Parameters<typeof objectsOf>) => objectsOf(...args)[0]?.spec;

/** A tree's text files, by path, as `ownerObjects` is handed the tree's now. */
const texts = (files: readonly TreeFile[]) => new Map(files.map((f) => [f.path, f.bytes.toString()]));

describe('an owner as the choices compose it, row by row: a removal of the rules or the instruction, and a hire dropped', () => {
  for (const file of ['RULES.md', 'NEMIA.md'])
    test(`--theirs on ${file}, which the template removes, is refused Invalid; --ours proposes the tree's`, () => {
      const base = tree({ [file]: 'one\n' });
      const ours = tree({ [file]: 'mine\n' });
      const merge = mergeTrees(base, ours, []);
      const [conflict] = merge.conflicts;
      assert.ok(conflict !== undefined, 'the change and the removal conflict');
      assert.throws(
        () => ownerObjects('acme', { kind: 'Factory', name: 'acme' }, merge, { [conflict.at]: 'theirs' }, texts(ours)),
        (err: { _tag?: string }) => err._tag === 'Invalid',
      );
      const kept = ownerObjects('acme', { kind: 'Factory', name: 'acme' }, merge, { [conflict.at]: 'ours' }, texts(ours));
      assert.deepEqual(kept, { [file === 'RULES.md' ? 'rules' : 'instruction']: 'mine\n' });
    });
  test('a hire the composed wiring drops is proposed with its workflow and step and no agent: a fire', () => {
    const wiring = (hires: Record<string, string>) => ({ 'factory.json': `${JSON.stringify({ workflows: ['flow'], hires }, null, 2)}\n` });
    const base = tree(wiring({ 'flow/review': 'reviewer' }));
    const ours = tree(wiring({ 'flow/review': 'mine' }));
    const theirs = tree(wiring({}));
    const merge = mergeTrees(base, ours, theirs);
    const at = merge.conflicts.find((c) => c.at === 'factory.json#hires.flow/review')?.at;
    assert.ok(at !== undefined, merge.conflicts.map((c) => c.at).join(', '));
    const hire = { kind: 'Hire', name: 'flow.review' } as const;
    assert.deepEqual(ownerObjects('acme', hire, merge, { [at]: 'theirs' }, texts(ours)), { workflow: 'flow', step: 'review' });
    assert.deepEqual(ownerObjects('acme', hire, merge, { [at]: 'ours' }, texts(ours)), { workflow: 'flow', step: 'review', agent: 'mine' });
  });
  describe('an agent the choices remove', () => {
    const wiring = (hires: Record<string, string>) => ({ 'factory.json': `${JSON.stringify({ workflows: ['flow'], hires }, null, 2)}\n` });
    const agent = { kind: 'Agent', name: 'implementer' } as const;
    const merge = (theirs: Record<string, string>) =>
      mergeTrees(
        tree({ ...wiring({ 'flow/review': 'implementer' }), 'workflows/agents/implementer.md': 'one\n' }),
        tree({ ...wiring({ 'flow/review': 'implementer' }), 'workflows/agents/implementer.md': 'mine\n' }),
        tree(theirs),
      );
    const ours = tree({ ...wiring({ 'flow/review': 'implementer' }), 'workflows/agents/implementer.md': 'mine\n' });
    test('proposes a hire fired for each step the tree hires it into, then its removal', () => {
      const m = merge(wiring({}));
      const at = 'workflows/agents/implementer.md';
      const objects = objectsOf('acme', agent, m, { [at]: 'theirs' }, texts(ours));
      assert.deepEqual(
        objects.map((o) => [o.kind, o.name]),
        [
          ['Hire', 'flow.review'],
          ['Agent', 'implementer'],
        ],
      );
    });
    test('is refused Invalid where the composed wiring still hires it', () => {
      const m = merge({ ...wiring({ 'flow/review': 'implementer' }) });
      assert.throws(
        () => objectsOf('acme', agent, m, { 'workflows/agents/implementer.md': 'theirs' }, texts(ours)),
        (err: { _tag?: string }) => err._tag === 'Invalid',
      );
    });
  });
});
