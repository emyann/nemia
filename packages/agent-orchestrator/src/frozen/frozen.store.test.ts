/**
 * A run's copy of its factory's home (`freezeHomeFiles`): the tree's `home/` copied whole under `runs/<id>/home/<hex>/`, none for a
 * factory with no tree or no home, a link refused before anything is written; and what a filing finds of it (`startFoundAt`): its
 * `.mcp.json` and the skills of the home and of each folder a session in it may be added.
 */
import { describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { freezeHomeFiles, homeFilesDir, homeFilesOf, startFoundAt } from './frozen.store.ts';
import { Invalid } from '../refusal/refusal.ts';

/** A factory's tree holding `home/`, with the files given, by their paths from it. */
const treeWith = (files: Record<string, string>) => {
  const tree = scratch('wf-home-tree-');
  for (const [at, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(tree, 'home', at)), { recursive: true });
    fs.writeFileSync(path.join(tree, 'home', at), text);
  }
  return tree;
};

describe("freezeHomeFiles: a run's copy of its factory's home, and what a filing finds of it", () => {
  test("the tree's home is copied whole under runs/<id>/home/<hex>, read-only, and found again for the run's filings", () => {
    const store = scratch('wf-home-store-');
    const tree = treeWith({ 'CLAUDE.md': '# home\n', '.claude/skills/steer/SKILL.md': '---\nname: steer\n---\n', '.mcp.json': '{}' });
    const run = { id: 'r-1' };
    const hex = freezeHomeFiles(store, run, tree);
    assert.equal(typeof hex, 'string');
    const copy = homeFilesDir(store, run, hex);
    assert.equal(fs.readFileSync(path.join(copy, 'CLAUDE.md'), 'utf8'), '# home\n');
    assert.equal(fs.statSync(path.join(copy, 'CLAUDE.md')).mode & 0o222, 0, 'no write bit');
    const workspace = scratch('wf-home-ws-');
    fs.mkdirSync(path.join(workspace, '.claude', 'skills', 'repo'), { recursive: true });
    fs.writeFileSync(path.join(workspace, '.claude', 'skills', 'repo', 'SKILL.md'), '---\nname: repo\n---\n');
    fs.mkdirSync(path.join(workspace, '.claude', 'skills', 'nothing'), { recursive: true });
    const found = startFoundAt(store, { ...run, homeFiles: hex }, workspace).start;
    assert.deepEqual(found, { home: copy, mcp: true, skills: { [copy]: ['steer'], [workspace]: ['repo'] } });
  });
  test('a factory made by hand, or whose tree holds no home, freezes none, and a run that froze none finds none', () => {
    const store = scratch('wf-home-store-');
    assert.equal(freezeHomeFiles(store, { id: 'r-2' }, undefined), undefined);
    assert.equal(freezeHomeFiles(store, { id: 'r-2' }, scratch('wf-home-bare-')), undefined);
    assert.equal(fs.existsSync(homeFilesDir(store, { id: 'r-2' })), false);
    assert.deepEqual(startFoundAt(store, { id: 'r-2' }, '/wt'), {});
  });
  test('a link in the home is refused before anything is copied', () => {
    const tree = treeWith({ 'CLAUDE.md': '# home\n' });
    fs.symlinkSync('/etc/hostname', path.join(tree, 'home', 'linked'));
    assert.throws(() => homeFilesOf(tree), Invalid);
  });
});
