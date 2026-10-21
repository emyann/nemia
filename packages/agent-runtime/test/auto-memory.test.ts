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

test('a job, claude-detached and a background session are each given one --settings, auto-memory off in it', () => {
  const task = taskOf('/r');
  for (const [what, args] of [
    ['a job', claudePrintFlags(task, undefined)],
    ['claude-detached', claudeDetached.command(task).args],
    ['a background session', claudeArgv(task, [])],
  ] as const) {
    assert.deepEqual(settingsIn(args), { settings: { autoMemoryEnabled: false }, given: 1 }, what);
  }
});

test("a task's own settings keep every key they hold, and auto-memory is off beside them", () => {
  const task = taskOf('/r', { settings: JSON.stringify({ outputStyle: 'nemia-x:no-coding', env: { CI: '1' } }) });
  for (const [what, args] of [
    ['a job', claudePrintFlags(task, undefined)],
    ['a background session', claudeArgv(task, [])],
  ] as const) {
    assert.deepEqual(
      settingsIn(args),
      { settings: { outputStyle: 'nemia-x:no-coding', env: { CI: '1' }, autoMemoryEnabled: false }, given: 1 },
      what,
    );
  }
});

test("an attached session is given auto-memory off on the SDK's own settings, the task's keys kept", () => {
  const dir = scratch('auto-memory');
  assert.deepEqual(attachedOptions(taskOf(dir)).settings, { autoMemoryEnabled: false }, 'nothing given');
  assert.deepEqual(
    attachedOptions(taskOf(dir, { settings: JSON.stringify({ outputStyle: 'x' }) })).settings,
    { outputStyle: 'x', autoMemoryEnabled: false },
    "the task's own settings",
  );
  assert.deepEqual(
    attachedOptions({ ...taskOf(dir), config: { contextTokens: 150_000 } }).settings,
    { autoMemoryEnabled: false, autoCompactWindow: 150_000 },
    'the context window is a key of those same settings, and auto-memory stays off beside it',
  );
});

test('settings given as a file are handed over as they are: the runtime rewrites no file', () => {
  assert.equal(memorylessSettings('/a/settings.json'), undefined);
  assert.deepEqual(memorylessFlags({ settings: '/a/settings.json' }), { settings: '/a/settings.json' });
});
