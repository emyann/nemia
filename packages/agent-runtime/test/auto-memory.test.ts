/**
 * Every Claude Code session the runtime starts runs with its auto-memory off: a job and a held session alike are each given
 * `autoMemoryEnabled: false` in the settings they already carry, on the SDK's own `Options.settings`, so none of them is handed the
 * checkout's `MEMORY.md` or told it may write there; and every one excludes a dependency's `CLAUDE.md` in the same settings
 * (`claudeMdExcludes`), which `test/live.test.ts` measures Claude Code honouring.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { memorylessSettings } from '../src/harness/claude/memory.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import type { ClaudeFlags } from '../src/harness/claude/vocabulary.ts';
import { scratch } from './scratch.ts';

/** A task on `cwd`, with the Claude Code flags `claude`. */
const taskOf = (cwd: string, claude?: ClaudeFlags): SpawnRequest => ({
  name: 'ae/t/1',
  brief: 'the brief',
  cwd,
  ...(claude ? { config: { claude } } : {}),
});

const OWN = JSON.stringify({ outputStyle: 'nemia-x:no-coding', env: { CI: '1' } });

test('auto-memory: every Claude Code session is given it off in the one settings it carries, the task keys kept', async (t) => {
  await t.test("a task's own settings keep every key they hold, and auto-memory is off beside them", () => {
    assert.deepEqual(attachedOptions(taskOf('/r', { settings: OWN })).settings, {
      outputStyle: 'nemia-x:no-coding',
      env: { CI: '1' },
      autoMemoryEnabled: false,
      claudeMdExcludes: ['**/node_modules/**/CLAUDE.md'],
    });
  });

  const dir = scratch('auto-memory');
  const ATTACHED: readonly { name: string; task: SpawnRequest; settings: unknown }[] = [
    {
      name: "a session given nothing is given auto-memory off on the SDK's own settings",
      task: taskOf(dir),
      settings: { autoMemoryEnabled: false, claudeMdExcludes: ['**/node_modules/**/CLAUDE.md'] },
    },
    {
      name: "a session keeps the task's own settings, auto-memory off beside them",
      task: taskOf(dir, { settings: JSON.stringify({ outputStyle: 'x' }) }),
      settings: { outputStyle: 'x', autoMemoryEnabled: false, claudeMdExcludes: ['**/node_modules/**/CLAUDE.md'] },
    },
    {
      name: "a task's own excludes are kept, and every dependency's CLAUDE.md is added after them, once",
      task: taskOf(dir, { settings: JSON.stringify({ claudeMdExcludes: ['/x/CLAUDE.md', '**/node_modules/**/CLAUDE.md'] }) }),
      settings: { autoMemoryEnabled: false, claudeMdExcludes: ['/x/CLAUDE.md', '**/node_modules/**/CLAUDE.md'] },
    },
    {
      name: 'the context window is a key of those same settings, and auto-memory stays off beside it',
      task: { ...taskOf(dir), config: { contextTokens: 150_000 } },
      settings: { autoMemoryEnabled: false, claudeMdExcludes: ['**/node_modules/**/CLAUDE.md'], autoCompactWindow: 150_000 },
    },
  ];
  for (const row of ATTACHED)
    await t.test(row.name, () => {
      assert.deepEqual(attachedOptions(row.task).settings, row.settings);
    });

  await t.test('REFUSED: excludes that are no list of globs, which the runtime would add its own to', () => {
    assert.throws(
      () => attachedOptions(taskOf('/r', { settings: JSON.stringify({ claudeMdExcludes: '/x/CLAUDE.md' }) })),
      (err: Error) => err.message.includes('claudeMdExcludes'),
    );
  });

  await t.test('settings given as a file are handed over as they are: the runtime rewrites no file', () => {
    assert.equal(memorylessSettings('/a/settings.json'), undefined);
    assert.equal(attachedOptions(taskOf('/r', { settings: '/a/settings.json' })).settings, '/a/settings.json');
  });
});
