/**
 * A factory's harness settings: which keys a factory may set (`harnessSettingsRefusal`), and what a Claude Code step is filed with
 * (`filedClaudeSettings`), one table each, a row per input.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Schema } from 'effect';
import { filedClaudeSettings, harnessSettingsRefusal, settingKeyOf, withoutSetting, withSetting } from './harness-settings.ts';
import { HarnessSettings } from './harness-settings.model.ts';

test('a factory sets the allowed Claude Code settings alone, each of its type', async (t) => {
  const rows: { name: string; settings: unknown; refused: string | false }[] = [
    { name: 'permissions widen the fence', settings: { claude: { permissions: { allow: ['Bash(*)'] } } }, refused: 'permissions' },
    { name: 'hooks run programs', settings: { claude: { hooks: {} } }, refused: 'hooks' },
    { name: 'the sandbox is the harness’s', settings: { claude: { sandbox: { enabled: false } } }, refused: 'sandbox' },
    { name: 'MCP servers are the agent’s', settings: { claude: { enabledMcpjsonServers: ['x'] } }, refused: 'enabledMcpjsonServers' },
    { name: 'env is the step’s environment', settings: { claude: { env: { A: '1' } } }, refused: 'env' },
    { name: 'a helper runs a program', settings: { claude: { apiKeyHelper: 'x' } }, refused: 'apiKeyHelper' },
    { name: 'an output style is the agent’s', settings: { claude: { outputStyle: 'p:s' } }, refused: 'outputStyle' },
    { name: 'a key nobody owns is refused too', settings: { claude: { somethingNew: 1 } }, refused: 'somethingNew' },
    { name: 'another harness', settings: { codex: { model: 'x' } }, refused: 'codex' },
    { name: 'an attribution mark of the wrong type', settings: { claude: { attribution: { commit: 1 } } }, refused: 'commit' },
    { name: 'an attribution mark it does not take', settings: { claude: { attribution: { co: '' } } }, refused: 'co' },
    { name: 'a language that is no string', settings: { claude: { language: 3 } }, refused: 'language' },
    { name: 'no object', settings: [], refused: 'f' },
    { name: 'attribution off by its marks', settings: { claude: { attribution: { commit: '', pr: '' } } }, refused: false },
    { name: 'attribution off', settings: { claude: { attribution: false } }, refused: false },
    { name: 'no session URL', settings: { claude: { attribution: { sessionUrl: false } } }, refused: false },
    { name: 'a language', settings: { claude: { language: 'french' } }, refused: false },
    { name: 'no git instructions', settings: { claude: { includeGitInstructions: false } }, refused: false },
    { name: 'none', settings: undefined, refused: false },
  ];
  for (const row of rows)
    await t.test(row.name, () => {
      const refusal = harnessSettingsRefusal(row.settings, 'f');
      if (row.refused === false) assert.equal(refusal, undefined);
      else assert.match(refusal ?? '', new RegExp(row.refused));
      if (row.settings !== undefined)
        assert.equal(Schema.is(HarnessSettings)(row.settings), row.refused === false, 'the model refuses it too, never strips it');
    });
});

test('a Claude Code step is filed the allowed settings, its own laid over them', async (t) => {
  const off = { attribution: { commit: '', pr: '' } };
  await t.test('beside an agent’s output style', () =>
    assert.deepEqual(JSON.parse(filedClaudeSettings(off, '{"outputStyle":"p:s"}') ?? ''), { ...off, outputStyle: 'p:s' }),
  );
  await t.test('with no settings of its own', () => assert.deepEqual(JSON.parse(filedClaudeSettings(off, undefined) ?? ''), off));
  await t.test('the step’s own wins a key both name', () =>
    assert.deepEqual(JSON.parse(filedClaudeSettings({ language: 'french' }, '{"language":"german"}') ?? ''), { language: 'german' }),
  );
  await t.test('none frozen leaves the step’s as they were', () => {
    assert.equal(filedClaudeSettings(undefined, undefined), undefined);
    assert.equal(filedClaudeSettings(undefined, '{"a":1}'), '{"a":1}');
  });
  await t.test('a hand-edited record’s widening key is never filed', () =>
    assert.deepEqual(JSON.parse(filedClaudeSettings({ ...off, permissions: { allow: ['Bash(*)'] } }, undefined) ?? ''), off),
  );
});

test('a setting is named <harness>.<key>, set and taken off', async (t) => {
  await t.test('split at its first dot', () =>
    assert.deepEqual(settingKeyOf('claude.attribution'), { harness: 'claude', key: 'attribution' }),
  );
  await t.test('no dot is refused', () => assert.equal(typeof settingKeyOf('attribution'), 'string'));
  await t.test('set beside the others', () =>
    assert.deepEqual(withSetting({ claude: { language: 'french' } }, 'claude', 'attribution', false), {
      claude: { language: 'french', attribution: false },
    }),
  );
  await t.test('the last taken off leaves none', () =>
    assert.equal(withoutSetting({ claude: { attribution: false } }, 'claude', 'attribution'), undefined),
  );
  await t.test('one taken off keeps the rest', () =>
    assert.deepEqual(withoutSetting({ claude: { attribution: false, language: 'x' } }, 'claude', 'attribution'), {
      claude: { language: 'x' },
    }),
  );
});
