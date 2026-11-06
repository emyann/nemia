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
  for (const argv of [
    ['label', 'run', 'r1', 'team=core'],
    ['label', 'inbox', 'cache-the-views', 'team-', '--overwrite'],
  ])
    assert.equal(routeOf({ name: nameOf(argv), local: false, help: false }), 'process', `${argv.join(' ')} is a write, in process`);
  assert.equal(routeOf({ name: nameOf(['ls', '-l', 'team=core']), local: false, help: false }), 'api', 'ls -l is the moved read');
});

test("the client's own verbs (`get`, `apply`, `explain`) go to the client with --help and --local too: no process has them", () => {
  for (const argv of [
    ['get', 'cards'],
    ['apply', '-f', 'x.yaml'],
    ['explain', 'card.spec.from'],
  ])
    for (const local of [false, true])
      for (const help of [false, true])
        assert.equal(routeOf({ name: nameOf(argv), local, help }), 'api', `${argv.join(' ')} local=${local} help=${help}`);
});
