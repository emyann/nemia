/**
 * `configRefusal`, the runtime's one refusal of a task's configuration on a harness it runs by default: each family of what `file()`
 * refuses made to refuse through it, at shipped defaults, and a configuration every harness named takes let through.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configRefusal } from '../src/index.ts';

/** The refusal of `config` on `harness`, which the case expects there is. */
const refused = (harness: string, config: Parameters<typeof configRefusal>[1]): string => {
  const why = configRefusal(harness, config);
  assert.ok(why, `expected ${harness} to refuse ${JSON.stringify(config)}`);
  return why;
};

test("configRefusal: what each harness refuses of a task's configuration, and what it lets through", async (t) => {
  await t.test('configRefusal refuses a permission mode a harness does not have, on Claude Code and on Codex', () => {
    assert.match(refused('claude', { permissionMode: 'nope' }), /`permissionMode: nope` is not a mode Claude Code has/);
    assert.match(refused('codex', { permissionMode: 'nope' }), /`permissionMode: nope` is not a sandbox Codex has/);
  });
  await t.test("configRefusal refuses an effort outside the harness's efforts", () => {
    assert.match(refused('claude', { effort: 'ultra' }), /`effort: ultra` is not an effort Claude Code has/);
    assert.match(refused('codex', { effort: 'ultra' }), /`effort: ultra` is not a reasoning effort Codex has/);
  });
  await t.test("configRefusal refuses a context window outside Claude Code's range, and one on Codex, which has no such knob", () => {
    assert.match(refused('claude', { contextTokens: 5 }), /`contextTokens: 5` is outside the windows the `claude` harness takes/);
    assert.match(refused('codex', { contextTokens: 200_000 }), /the `codex` harness has no such knob/);
  });
  await t.test('configRefusal refuses a background session on Codex, and a spend cap on a Claude Code background session', () => {
    assert.match(refused('codex', { background: true }), /`background: true` asks for a Claude Code background session/);
    assert.match(refused('claude', { background: true, budgetUsd: 5 }), /a `claude --bg` session does not keep one/);
  });
  await t.test("configRefusal refuses on Codex a spend cap, a deny list, an allow list and Claude Code's flags", () => {
    assert.match(refused('codex', { budgetUsd: 5 }), /`budgetUsd: 5` is a spend cap in dollars, and `codex exec` has none/);
    assert.match(refused('codex', { disallowedTools: ['Bash(git commit:*)'] }), /is a deny list, and Codex has no tool list/);
    assert.match(refused('codex', { allowedTools: ['Edit(**)'] }), /is an allow list, and Codex has no tool list/);
    assert.match(refused('codex', { claude: { appendSystemPromptFile: '/p.md' } }), /gives Claude Code flags of its own, and/);
  });
  await t.test('configRefusal refuses what no harness could use, and a harness the runtime does not run', () => {
    assert.match(refused('claude', { budgetUsd: -1 }), /`budgetUsd: -1` is not an amount of dollars/);
    assert.match(refused('claude', { nope: 1 } as never), /`config.nope` is not a harness argument/);
    assert.match(refused('gemini', {}), /`harness: gemini` is not a harness this engine has/);
  });
  await t.test('configRefusal lets through a configuration its harness takes, each key left undefined included', () => {
    assert.equal(configRefusal('claude', { model: 'opus', effort: 'high', permissionMode: 'dontAsk', budgetUsd: 5 }), undefined);
    assert.equal(configRefusal('codex', { model: 'gpt-5', permissionMode: 'read-only', budgetUsd: undefined }), undefined);
  });
});
