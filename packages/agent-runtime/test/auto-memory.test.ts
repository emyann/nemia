/**
 * Every Claude Code session the runtime starts runs with its auto-memory off: a job (`claude -p`), a background session
 * (`claude --bg`) and an attached session are each given `autoMemoryEnabled: false` in the settings they already carry, never a
 * second `--settings`, so none of them is handed the checkout's `MEMORY.md` or told it may write there.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { claudeArgv } from '../src/harness/claude/bg.ts';
import { claudeDetached, claudePrintFlags } from '../src/harness/claude/code.ts';
import { attachedOptions } from '../src/harness/claude/attached-options.ts';
import { memorylessFlags, memorylessSettings } from '../src/harness/claude/memory.ts';
import type { SpawnRequest } from '../src/harness/seam.ts';
import type { ClaudeFlags } from '../src/harness/claude/vocabulary.ts';
import { scratch } from './scratch.ts';

/** The settings of an argv, as the one `--settings` it holds says them; its count beside them. */
const settingsIn = (args: readonly string[]): { settings: unknown; given: number } => {
  const at = args.indexOf('--settings');
  return { settings: at === -1 ? undefined : JSON.parse(args[at + 1]), given: args.filter((a) => a === '--settings').length };
};

/** A task on `cwd`, with the Claude Code flags `claude`. */
const taskOf = (cwd: string, claude?: ClaudeFlags): SpawnRequest => ({
  name: 'ae/t/1',
  brief: 'the brief',
  cwd,
  ...(claude ? { config: { claude } } : {}),
});

const OWN = JSON.stringify({ outputStyle: 'nemia-x:no-coding', env: { CI: '1' } });

/** Each spawn of the task that spells a command line, by what it is. */
const ARGVS = {
  'a job': (task: SpawnRequest) => claudePrintFlags(task, undefined),
  'claude-detached': (task: SpawnRequest) => claudeDetached.command(task).args,
  'a background session': (task: SpawnRequest) => claudeArgv(task, []),
} as const;

test('auto-memory: every Claude Code spawn is given it off in the one settings it carries, the task keys kept', async (t) => {
  for (const [what, argv] of Object.entries(ARGVS))
    await t.test(`${what} is given one --settings, auto-memory off in it`, () => {
      assert.deepEqual(settingsIn(argv(taskOf('/r'))), { settings: { autoMemoryEnabled: false }, given: 1 });
    });

  for (const what of ['a job', 'a background session'] as const)
    await t.test(`${what}: a task's own settings keep every key they hold, and auto-memory is off beside them`, () => {
      assert.deepEqual(settingsIn(ARGVS[what](taskOf('/r', { settings: OWN }))), {
        settings: { outputStyle: 'nemia-x:no-coding', env: { CI: '1' }, autoMemoryEnabled: false },
        given: 1,
      });
    });

  const dir = scratch('auto-memory');
  const ATTACHED: readonly { name: string; task: SpawnRequest; settings: unknown }[] = [
    {
      name: "an attached session given nothing is given auto-memory off on the SDK's own settings",
      task: taskOf(dir),
      settings: { autoMemoryEnabled: false },
    },
    {
      name: "an attached session keeps the task's own settings, auto-memory off beside them",
      task: taskOf(dir, { settings: JSON.stringify({ outputStyle: 'x' }) }),
      settings: { outputStyle: 'x', autoMemoryEnabled: false },
    },
    {
      name: 'the context window is a key of those same settings, and auto-memory stays off beside it',
      task: { ...taskOf(dir), config: { contextTokens: 150_000 } },
      settings: { autoMemoryEnabled: false, autoCompactWindow: 150_000 },
    },
  ];
  for (const row of ATTACHED)
    await t.test(row.name, () => {
      assert.deepEqual(attachedOptions(row.task).settings, row.settings);
    });

  await t.test('settings given as a file are handed over as they are: the runtime rewrites no file', () => {
    assert.equal(memorylessSettings('/a/settings.json'), undefined);
    assert.deepEqual(memorylessFlags({ settings: '/a/settings.json' }), { settings: '/a/settings.json' });
  });
});
