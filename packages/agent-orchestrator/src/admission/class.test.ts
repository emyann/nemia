import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classBreaks } from './class.ts';

/** A switch a fixture's spec takes. */
const flag = (name: string, side?: 'cli' | 'api') => ({ flag: name, ...(side ? { only: { side } } : {}) });

test('REFUSED: a command with no class, said by name', () => {
  assert.deepEqual(classBreaks([{ name: 'frob', writes: true, nemia: undefined }]), [
    "frob has no class: say who answers for it when an agent calls it — 'read', 'hers', 'prompts', 'answers', 'out', or { bare: 'read', sets: 'prompts', setsBy }",
  ]);
});

test('REFUSED: a read classed as a write, and a write classed as a read', () => {
  assert.deepEqual(
    classBreaks([
      { name: 'ls', writes: false, nemia: 'hers' },
      { name: 'rm', writes: true, nemia: 'read' },
      { name: 'show', writes: false, nemia: 'read' },
      { name: 'tick', writes: true, nemia: 'out' },
    ]),
    ['ls writes nothing and is classed "hers": class it \'read\'', "rm writes and is classed 'read': class it as the write it is"],
  );
});

test('REFUSED: a flag of a command that reads bare in neither its setsBy nor its readsBy; a flag the api alone takes is no call of hers', () => {
  const nemia = { bare: 'read', sets: 'prompts', setsBy: ['--clear'], readsBy: ['--repo'] } as const;
  const spec = { flags: [flag('--clear'), flag('--repo'), flag('--frob'), flag('--words', 'api')] };
  assert.deepEqual(classBreaks([{ name: 'agents custom', writes: true, nemia, spec }]), [
    "agents custom's --frob is in neither its setsBy nor its readsBy: say whether it sets or reads",
  ]);
});

test('REFUSED: a name that extends an answer or a prompt by a word in another class, which the rule on the shorter name would override', () => {
  assert.deepEqual(
    classBreaks([
      { name: 'approve', writes: true, nemia: 'answers' },
      { name: 'approve now', writes: true, nemia: 'hers' },
      { name: 'agents', writes: false, nemia: 'read' },
      { name: 'agents write', writes: true, nemia: 'prompts' },
      { name: 'approved', writes: false, nemia: 'read' },
    ]),
    ['approve now is classed "hers" under approve, classed "answers", whose rule covers it: rename it, or class it "answers"'],
  );
});
