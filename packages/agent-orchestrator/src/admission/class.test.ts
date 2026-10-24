import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classBreaks } from './class.ts';

/** A switch a fixture's spec takes. */
const flag = (name: string, side?: 'cli' | 'api') => ({ flag: name, ...(side ? { only: { side } } : {}) });

test('REFUSED: a read classed as a write, and a write classed as a read', () => {
  assert.deepEqual(
    classBreaks([
      { name: 'ls', writes: false, class: 'act' },
      { name: 'rm', writes: true, class: 'read' },
      { name: 'show', writes: false, class: 'read' },
      { name: 'tick', writes: true, class: 'none' },
    ]),
    ['ls writes nothing and is classed "act": class it \'read\'', "rm writes and is classed 'read': class it as the write it is"],
  );
});

test('REFUSED: a flag of a command that reads bare in neither its setsBy nor its readsBy; a flag the api alone takes is no call of hers', () => {
  const c = { bare: 'read', sets: 'ask', setsBy: ['--clear'], readsBy: ['--repo'] } as const;
  const spec = { flags: [flag('--clear'), flag('--repo'), flag('--frob'), flag('--words', 'api')] };
  assert.deepEqual(classBreaks([{ name: 'agents custom', writes: true, class: c, spec }]), [
    "agents custom's --frob is in neither its setsBy nor its readsBy: say whether it sets or reads",
  ]);
});

test('REFUSED: a name that extends an answer or a prompt by a word in another class, which the rule on the shorter name would override', () => {
  assert.deepEqual(
    classBreaks([
      { name: 'approve', writes: true, class: 'answer' },
      { name: 'approve now', writes: true, class: 'act' },
      { name: 'agents', writes: false, class: 'read' },
      { name: 'agents write', writes: true, class: 'ask' },
      { name: 'approved', writes: false, class: 'read' },
    ]),
    ['approve now is classed "act" under approve, classed "answer", whose rule covers it: rename it, or class it "answer"'],
  );
});

test("REFUSED: asksAlways on a class but ask, and a write of the person's rules for auto not asked always", () => {
  assert.deepEqual(
    classBreaks([
      { name: 'auto', writes: false, class: 'read' },
      { name: 'auto propose', writes: true, class: 'act' },
      { name: 'auto confirm', writes: true, class: 'ask', asksAlways: true },
      { name: 'auto drop', writes: true, class: 'ask' },
      { name: 'cancel', writes: true, class: 'answer', asksAlways: true },
    ]),
    [
      "auto drop writes the person's rules for auto and is not asked always: give it asksAlways, so no allow at a prompt reaches it",
      "cancel asks always and is classed \"answer\": asksAlways is a prompt's, so class it 'ask' or drop it",
    ],
  );
});
