import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projectAllows } from './settings.ts';
import { scratch } from '../../test/scratch.ts';

/** A scratch directory holding `.claude/settings.json` with `settings` as its text, and the directory's path. */
const dirWith = (settings: string): string => {
  const dir = scratch('ae-settings-');
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), settings);
  return dir;
};

test("a directory's own project settings grant the allow rules they name, in the order they are written", () => {
  const dir = dirWith(JSON.stringify({ permissions: { allow: ['WebSearch', 'Bash(git log:*)'], deny: ['Bash(git push:*)'] } }));
  assert.deepEqual(projectAllows('claude', dir), ['WebSearch', 'Bash(git log:*)']);
  assert.deepEqual(projectAllows('claude-detached', dir), ['WebSearch', 'Bash(git log:*)']);
});

test('a directory with no settings file, one that does not parse, and one that names no allow each grant nothing', () => {
  assert.deepEqual(projectAllows('claude', scratch('ae-settings-')), []);
  assert.deepEqual(projectAllows('claude', dirWith('{')), []);
  assert.deepEqual(projectAllows('claude', dirWith('[]')), []);
  assert.deepEqual(projectAllows('claude', dirWith(JSON.stringify({ env: { CI: '1' } }))), []);
  assert.deepEqual(projectAllows('claude', dirWith(JSON.stringify({ permissions: { deny: ['Bash(git push:*)'] } }))), []);
  assert.deepEqual(projectAllows('claude', dirWith(JSON.stringify({ permissions: 'all' }))), []);
  assert.deepEqual(projectAllows('claude', dirWith(JSON.stringify({ permissions: { allow: 'WebSearch' } }))), []);
  assert.deepEqual(projectAllows('claude', dirWith(JSON.stringify({ permissions: { allow: ['WebSearch', 7, null] } }))), ['WebSearch']);
});

test('the local settings beside the shared file are not read: a job reads the project settings alone', () => {
  const dir = dirWith(JSON.stringify({ permissions: { allow: ['WebSearch'] } }));
  fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), JSON.stringify({ permissions: { allow: ['WebFetch'] } }));
  assert.deepEqual(projectAllows('claude', dir), ['WebSearch']);
});

test('a harness that reads no project configuration of its own answers nothing, whatever the directory holds', () => {
  const dir = dirWith(JSON.stringify({ permissions: { allow: ['WebSearch'] } }));
  for (const harness of ['codex', 'a2a:seldon', 'command', 'nothing']) {
    assert.equal(projectAllows(harness, dir), undefined, harness);
  }
});
