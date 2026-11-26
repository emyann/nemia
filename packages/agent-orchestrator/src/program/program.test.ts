/**
 * The programs of a factory's template as the controller reads them: a task's id says what it runs, so each change of the declaration, the
 * factory's generation or its tree is a new task (`programTaskId`), and each factory's programs are the ones its tree's wiring declares
 * (`declaredPrograms`). What a beat files and stops is the laws of `contracts/programs-due.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { programTaskId } from './program.ts';
import { declaredPrograms } from './program.verb.ts';
import type { FactoryListing } from '../factory/factory.ts';

const program = { run: 'node $WF_CARRIED_FILES/writer.ts', writes: ['ci'] };

describe('programTaskId', () => {
  test('is the same for the same declaration, and another task for each thing it runs from', () => {
    const base = programTaskId('mill', 'ci-writer', program, 1, '/trees/mill');
    assert.equal(programTaskId('mill', 'ci-writer', program, 1, '/trees/mill'), base);
    for (const other of [
      programTaskId('mill', 'ci-writer', { ...program, run: 'node other.ts' }, 1, '/trees/mill'),
      programTaskId('mill', 'ci-writer', { ...program, writes: [] }, 1, '/trees/mill'),
      programTaskId('mill', 'ci-writer', program, 2, '/trees/mill'),
      programTaskId('mill', 'ci-writer', program, 1, '/trees/other'),
      programTaskId('forge', 'ci-writer', program, 1, '/trees/mill'),
      programTaskId('mill', 'other', program, 1, '/trees/mill'),
    ])
      assert.notEqual(other, base);
  });

  test('a factory with no generation is at its first', () => {
    assert.equal(programTaskId('mill', 'w', program, undefined, '/t'), programTaskId('mill', 'w', program, 1, '/t'));
  });
});

describe('declaredPrograms', () => {
  const listed = (over: Partial<Extract<FactoryListing, { volumes: unknown }>>) =>
    ({ name: 'mill', file: '/f/mill.json', volumes: [], workflows: [], hires: {}, schedules: {}, ...over }) as FactoryListing;

  test('gives each program of a factory made from a template, and none for a factory without a tree, a program or a reading', () => {
    const got = declaredPrograms([
      listed({ tree: '/trees/mill', programs: { 'ci-writer': program } }),
      listed({ name: 'bare' }),
      listed({ name: 'treeless', programs: { w: program } }),
      { name: 'broken', file: '/f/broken.json', error: 'does not read' },
    ]);
    assert.deepEqual(
      got.map((d) => [d.factory, d.name, d.tree]),
      [['mill', 'ci-writer', '/trees/mill']],
    );
  });
});
