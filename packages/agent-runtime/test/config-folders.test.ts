/**
 * `configFolderIn`, the first folder of a path that a harness reads as its own configuration inside a mounted folder: Claude Code's
 * `.claude`, matched as a whole segment on either separator, and no name that only resembles it.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG_FOLDERS, configFolderIn } from '../src/vocabulary.ts';
import { CLAUDE_CONFIG_FOLDERS } from '../src/harness/claude/vocabulary.ts';

test('configFolderIn: the configuration folder a path passes through, and CONFIG_FOLDERS', async (t) => {
  await t.test('a path through .claude, as a whole segment on either separator, names it', () => {
    for (const p of [
      '.claude/skills/x/SKILL.md',
      'docs/.claude/agents/a.md',
      'a\\.claude\\b',
      '/runs/r/artifacts/s/.claude/skills/x/SKILL.md',
    ])
      assert.equal(configFolderIn(p), '.claude', p);
  });
  await t.test('a path that only resembles one names none', () => {
    for (const p of ['claude/x.md', '.claude-notes/x.md', '.e2e/shot.png', 'x.claude', 'notes/.Claude2/x.md', ''])
      assert.equal(configFolderIn(p), undefined, p);
  });
  await t.test("CONFIG_FOLDERS holds every harness's list", () => {
    for (const folder of CLAUDE_CONFIG_FOLDERS) assert.ok(CONFIG_FOLDERS.includes(folder), folder);
    assert.deepEqual([...CONFIG_FOLDERS], ['.claude']);
  });
});
