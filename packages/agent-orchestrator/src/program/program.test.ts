/**
 * The programs of a factory's template as the controller reads them: a task's id says what it runs, so each change of the declaration, the
 * factory's generation or its tree is a new task (`programTaskId`), and each factory's programs are the ones its tree's wiring declares
 * (`declaredPrograms`). What a beat files and stops is the laws of `contracts/programs-due.contract.ts`.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import { programStatus, programTaskId, writerOfIn } from './program.ts';
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

describe('programStatus', () => {
  const attempt = (startedAt: string, endedAt: string | null = null) => ({ startedAt, endedAt });

  test('is Pending where the engine holds no task, or one not filed', () => {
    assert.deepEqual(programStatus(undefined, 'p'), { phase: 'Pending', restarts: 0 });
    assert.deepEqual(programStatus({ settled: null, attempts: [] }, 'p'), { phase: 'Pending', restarts: 0 });
  });

  test('is Running while the task is not settled, its restarts the attempts after the first and since the latest start', () => {
    const status = programStatus(
      {
        filedAt: '2026-11-26T10:00:00.000Z',
        settled: null,
        attempts: [attempt('2026-11-26T10:00:01.000Z', '2026-11-26T10:05:00.000Z'), attempt('2026-11-26T10:05:10.000Z')],
      },
      'p',
    );
    assert.deepEqual([status.phase, status.restarts, status.since], ['Running', 1, '2026-11-26T10:05:10.000Z']);
  });

  test('is Down once settled, with what to type', () => {
    const status = programStatus(
      {
        filedAt: '2026-11-26T10:00:00.000Z',
        settled: 'failed',
        attempts: [attempt('2026-11-26T10:00:01.000Z', '2026-11-26T10:00:02.000Z')],
      },
      'p',
    );
    assert.deepEqual([status.phase, status.restarts, status.since], ['Down', 0, '2026-11-26T10:00:02.000Z']);
    assert.match('message' in status ? String(status.message) : '', /nemia factory upgrade/);
  });
});

describe('writerOfIn', () => {
  const standing = [
    { name: 'ci-writer', writes: ['ci'], phase: 'Running' },
    { name: 'deploy-writer', writes: ['deployed'], phase: 'Down' },
  ] as const;

  test('names the program that writes a condition and its phase, and none where no program does', () => {
    assert.deepEqual(writerOfIn(standing)('deployed'), { program: 'deploy-writer', phase: 'Down' });
    assert.equal(writerOfIn(standing)('other'), null);
  });
});
