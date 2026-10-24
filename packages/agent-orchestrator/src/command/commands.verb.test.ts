/** The table's words: no name carries a refused word but those still pending, and every entry says its class under `class`. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PENDING, REFUSED_WORDS } from '../../test/command-words.ts';
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

test('no entry carries the retired class field nemia', () => {
  assert.deepEqual(
    TABLE.filter((c) => Object.hasOwn(c, 'nemia')).map((c) => c.name),
    [],
  );
});

const { class: _class, ...unclassed } = TABLE[0];
// @ts-expect-error -- a class is read, act, ask, answer or none
const _hers: CommandSpec = { ...TABLE[0], class: 'hers' };
// @ts-expect-error -- the class field is class, never nemia
const _named: CommandSpec = { ...unclassed, nemia: 'read' };
