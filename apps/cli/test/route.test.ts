/**
 * The name a command opens with, as the route reads it (`nameOf`): a moved read's first word, and two words where the first heads the
 * table's commands of two (`inbox add`, which stays on the old path). Which way each name goes is the contract's (`route.contract.ts`).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nameOf, routeOf } from '../src/route.ts';

test('`nameOf`: the first word, and `inbox <word>` a command of its own', () => {
  for (const [argv, name] of [
    [['ls'], 'ls'],
    [['show', 'r1', '--raw'], 'show'],
    [['inbox'], 'inbox'],
    [['inbox', '--json'], 'inbox'],
    [['inbox', 'add', 'x'], 'inbox add'],
    [[], ''],
  ] as const)
    assert.equal(nameOf(argv), name, argv.join(' '));
  assert.equal(routeOf({ name: nameOf(['inbox', 'add', 'x']), local: false, help: false }), 'process');
});
