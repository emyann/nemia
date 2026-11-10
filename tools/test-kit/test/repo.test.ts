/**
 * What is not ours, read from git's attributes (`notOurs`), and the names a piece of code has (`namesOf`), proven on planted input: every
 * guard that leaves a vendored file unread asks `notOurs`, so a reading that dropped nothing would let each guard read the kit.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { notOurs } from 'test-kit/repo';
import { scratch } from 'test-kit/scratch';
import { namesOf } from 'test-kit/words';

test('REFUSED: a path .gitattributes marks vendored or generated is not ours; an unmarked one beside it is', () => {
  const root = scratch('not-ours-');
  execFileSync('git', ['init', '-q', root]);
  fs.writeFileSync(path.join(root, '.gitattributes'), 'vendor/** linguist-vendored\nout.gen.ts linguist-generated\n');
  assert.deepEqual([...notOurs(['vendor/a/b.ts', 'out.gen.ts', 'src/a.ts', 'vendorish.ts'], root)].sort(), ['out.gen.ts', 'vendor/a/b.ts']);
  assert.deepEqual([...notOurs([], root)], []);
});

test('the names of a piece of code: an identifier, a private name, a string, its words and a hyphened word', () => {
  const source = ts.createSourceFile('a.ts', "class A { #seat = 1; } const say = 'run-core waits';", ts.ScriptTarget.Latest);
  const names = namesOf(source);
  for (const name of ['A', 'seat', 'say', 'run-core waits', 'run-core', 'run', 'core', 'waits']) assert.ok(names.has(name), name);
  assert.equal(names.has('#seat'), false);
});
