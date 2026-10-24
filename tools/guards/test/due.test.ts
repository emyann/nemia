/**
 * The guards' due decision, pure (`due.ts`, `dueOf`): which changed paths the `guards#test` inputs and the dependencies' folders make
 * due, and the input shapes it refuses rather than guess at.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dependencyFolders, dueOf, patternOf, TASK } from '../due.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

const INPUTS = [
  '$TURBO_DEFAULT$',
  '$TURBO_ROOT$/workflows/**',
  '$TURBO_ROOT$/turbo.json',
  '$TURBO_ROOT$/apps/*/CLAUDE.md',
  '$TURBO_ROOT$/apps/*/src/**',
  '$TURBO_ROOT$/apps/*/*.ts',
  'fixtures/**',
  '!$TURBO_ROOT$/apps/web/src/**',
  '!$TURBO_ROOT$/workflows/scratch/**',
];

test('a path under each input shape is due', () => {
  for (const file of [
    'tools/guards/due.ts',
    'workflows/build/implement.md',
    'turbo.json',
    'apps/api/CLAUDE.md',
    'apps/api/src/main.ts',
    'apps/api/vite.config.ts',
    'tools/guards/fixtures/a/b.json',
  ])
    assert.equal(dueOf([file], INPUTS, []).due, true, file);
});

test('a path near an input but outside it is not due', () => {
  for (const file of ['turbo.jsonc', 'apps/api/docs/CLAUDE.md', 'apps/api/src', 'workflowsx/a.md', 'tools/guardsx/a.ts'])
    assert.equal(dueOf([file], INPUTS, []).due, false, file);
});

test('a path matched only by a negation is not due, though a positive input names it', () => {
  assert.equal(dueOf(['apps/web/src/x.tsx'], INPUTS, []).due, false);
  assert.equal(dueOf(['workflows/scratch/a.md'], INPUTS, []).due, false);
  assert.equal(dueOf(['workflows/scratch/a.md', 'workflows/build/a.md'], INPUTS, []).due, true);
});

test('a path under a dependency folder is due', () => {
  assert.equal(dueOf(['packages/agent-runtime/src/core/domain.ts'], INPUTS, ['packages/agent-runtime']).due, true);
  assert.equal(dueOf(['packages/agent-runtime/src/core/domain.ts'], INPUTS, []).due, false);
});

test("a web source is not due under inputs that don't cover it", () => {
  assert.equal(dueOf(['apps/web/src/x.tsx'], ['$TURBO_DEFAULT$', '$TURBO_ROOT$/workflows/**'], ['packages/agent-runtime']).due, false);
});

test('no changed path is not due', () => {
  assert.equal(dueOf([], INPUTS, ['packages/agent-runtime']).due, false);
});

test('an input of a shape it does not read is refused, whatever the paths', () => {
  for (const input of [
    '$TURBO_ROOT$/{a,b}/**',
    '$TURBO_ROOT$/**/x.md',
    '$TURBO_ROOT$/a?.ts',
    '$TURBO_ROOT$/[ab].ts',
    '$TURBO_ROOT$/a/**/b',
  ])
    assert.throws(() => dueOf([], [input], []), Error, input);
});

test("the repository's own guards#test inputs, which turbo caches by, are the ones the due decision reads", () => {
  const turbo = JSON.parse(fs.readFileSync(path.join(ROOT, 'turbo.json'), 'utf8')) as { tasks: Record<string, { inputs?: string[] }> };
  const inputs = turbo.tasks[TASK]?.inputs ?? [];
  assert.ok(inputs.length > 0, `turbo.json lists inputs for ${TASK}`);
  for (const input of inputs) assert.doesNotThrow(() => patternOf(input), input);
  const folders = dependencyFolders(ROOT);
  for (const file of ['workflows/x.md', '.github/workflows/ci.yml', 'docs/x.md'])
    assert.equal(dueOf([file], inputs, folders).due, true, file);
  for (const file of [
    'apps/web/src/x.tsx',
    'apps/web/vite.config.ts',
    'apps/web/.storybook/preview.tsx',
    'apps/web/glossary.json',
    'apps/api/glossary.json',
    'packages/agent-runtime/glossary.json',
    'packages/agent-orchestrator/src/feed/glossary.json',
  ])
    assert.equal(dueOf([file], inputs, folders).due, true, `${file}: the glossary guard reads it`);
  assert.equal(dueOf(['apps/web/public/x.svg'], inputs, folders).due, false);
});
