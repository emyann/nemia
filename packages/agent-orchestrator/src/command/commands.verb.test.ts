/**
 * The table's words: no name carries a refused word but those still pending, and only approve and retry answer. That every entry says its
 * class under `class`, one of `CommandClass`, the compiler holds: the two lines at the end are refused by it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANSWERS, PENDING, REFUSED_FLAGS, REFUSED_WORDS } from '../../test/command-words.ts';
import type { CommandSpec } from './command.ts';
import { TABLE } from './commands.verb.ts';

test('no command is named by a refused word but those pending their decision', () => {
  const pending = new Set(PENDING.map((p) => p.name));
  const refused = TABLE.filter((c) => !pending.has(c.name) && c.name.split(' ').some((w) => REFUSED_WORDS.includes(w)));
  assert.deepEqual(
    refused.map((c) => c.name),
    [],
  );
});

test('every pending name is still in the table, so the list only shrinks', () => {
  const names = new Set(TABLE.map((c) => c.name));
  assert.deepEqual(
    PENDING.filter((p) => !names.has(p.name)).map((p) => p.name),
    [],
  );
});

test('only approve and retry answer what waits on a person', () => {
  assert.deepEqual(
    TABLE.filter((c) => c.class === 'answer')
      .map((c) => c.name)
      .sort(),
    [...ANSWERS].sort(),
  );
});

test('no command takes a flag decision 7 renamed', () => {
  assert.deepEqual(
    TABLE.flatMap((c) => c.spec.flags.filter((f) => REFUSED_FLAGS.includes(f.flag)).map((f) => `${c.name} ${f.flag}`)),
    [],
  );
});

const { class: _class, ...unclassed } = TABLE[0];
// @ts-expect-error -- a class is read, act, ask, answer or none
const _hers: CommandSpec = { ...TABLE[0], class: 'hers' };
// @ts-expect-error -- the class field is class, never nemia
const _named: CommandSpec = { ...unclassed, nemia: 'read' };
