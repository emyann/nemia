import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { projectAllows } from './settings.ts';
import { scratch } from '../../test/scratch.ts';

/** A scratch directory holding `.claude/settings.json` with `settings` as its text (none when undefined), and its local file beside. */
const dirWith = (settings: string | undefined, local?: string): string => {
  const dir = scratch('ae-settings-');
  if (settings === undefined) return dir;
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude', 'settings.json'), settings);
  if (local !== undefined) fs.writeFileSync(path.join(dir, '.claude', 'settings.local.json'), local);
  return dir;
};

const json = (value: unknown) => JSON.stringify(value);
const ALLOWS = json({ permissions: { allow: ['WebSearch', 'Bash(git log:*)'], deny: ['Bash(git push:*)'] } });

type Row = {
  name: string;
  settings: string | undefined;
  local?: string;
  harnesses: readonly string[];
  allows: readonly string[] | undefined;
};

const ROWS: readonly Row[] = [
  {
    name: "a directory's own project settings grant the allow rules they name, in the order they are written",
    settings: ALLOWS,
    harnesses: ['claude', 'claude-detached'],
    allows: ['WebSearch', 'Bash(git log:*)'],
  },
  { name: 'a directory with no settings file grants nothing', settings: undefined, harnesses: ['claude'], allows: [] },
  { name: 'a settings file that does not parse grants nothing', settings: '{', harnesses: ['claude'], allows: [] },
  { name: 'a settings file that is no object grants nothing', settings: '[]', harnesses: ['claude'], allows: [] },
  { name: 'settings that name no permissions grant nothing', settings: json({ env: { CI: '1' } }), harnesses: ['claude'], allows: [] },
  {
    name: 'permissions that name only a deny grant nothing',
    settings: json({ permissions: { deny: ['Bash(git push:*)'] } }),
    harnesses: ['claude'],
    allows: [],
  },
  { name: 'permissions that are no object grant nothing', settings: json({ permissions: 'all' }), harnesses: ['claude'], allows: [] },
  {
    name: 'an allow that is no list grants nothing',
    settings: json({ permissions: { allow: 'WebSearch' } }),
    harnesses: ['claude'],
    allows: [],
  },
  {
    name: 'an allow list keeps its strings and drops what is no string',
    settings: json({ permissions: { allow: ['WebSearch', 7, null] } }),
    harnesses: ['claude'],
    allows: ['WebSearch'],
  },
  {
    name: 'the local settings beside the shared file are not read: a job reads the project settings alone',
    settings: json({ permissions: { allow: ['WebSearch'] } }),
    local: json({ permissions: { allow: ['WebFetch'] } }),
    harnesses: ['claude'],
    allows: ['WebSearch'],
  },
  {
    name: 'a harness that reads no project configuration of its own answers nothing, whatever the directory holds',
    settings: json({ permissions: { allow: ['WebSearch'] } }),
    harnesses: ['codex', 'a2a:seldon', 'command', 'nothing'],
    allows: undefined,
  },
];

test('projectAllows: what a directory and a harness grant a job', async (t) => {
  for (const row of ROWS)
    await t.test(row.name, () => {
      const dir = dirWith(row.settings, row.local);
      for (const harness of row.harnesses) assert.deepEqual(projectAllows(harness, dir), row.allows, harness);
    });
});
