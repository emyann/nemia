/**
 * A run that needs no git repository: a team whose steps say `workspace: folder`, started, advanced, decided and forgotten from a
 * directory that is not a repository, with a `git` first on PATH that fails and writes down that it was asked. Every test ends by
 * reading that list: a folder run runs no git at all.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-folder-'));
const NOT_A_REPO = path.join(ROOT, 'somewhere');
const TEAM = path.join(ROOT, 'workflows', 'note');
const GIT_ASKED = path.join(ROOT, 'git-asked');
fs.mkdirSync(path.join(ROOT, 'runs'), { recursive: true });
fs.mkdirSync(NOT_A_REPO, { recursive: true });
fs.mkdirSync(TEAM, { recursive: true });
fs.writeFileSync(path.join(TEAM, 'write.md'), '---\nworkspace: folder\n---\nwrite the note\n');
fs.writeFileSync(path.join(TEAM, 'review.md'), '---\nworkspace: folder\nafter: write\n---\nreview the note\n');

// A `git` that refuses and says so, first on PATH: anything that reaches for git during a folder run is written down.
const BIN = path.join(ROOT, 'bin');
fs.mkdirSync(BIN);
fs.writeFileSync(path.join(BIN, 'git'), `#!/bin/sh\necho "$*" >> ${JSON.stringify(GIT_ASKED)}\necho "fatal: not a git repository" >&2\nexit 128\n`, { mode: 0o755 });
process.env.PATH = `${BIN}${path.delimiter}${process.env.PATH}`;
const gitAsked = (): string[] => (fs.existsSync(GIT_ASKED) ? fs.readFileSync(GIT_ASKED, 'utf8').trim().split('\n') : []);

// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { readRun, start } = await import('../src/runner.ts');

const refusal = (fn: () => unknown): { message: string; exitCode: unknown } => {
  try { fn(); } catch (err) { return { message: (err as Error).message, exitCode: (err as { exitCode?: unknown }).exitCode }; }
  assert.fail('it was not refused');
};

test('a folder team starts from a directory that is no repository, and its record has a place and no git', () => {
  const run = start({ brief: 'a note on tides', repo: NOT_A_REPO, workflowDir: TEAM });
  const record = readRun(run.id);
  assert.deepEqual(record.place, { kind: 'folder' });
  assert.equal(record.workspace, path.join(ROOT, 'runs', run.id, 'work'));
  for (const key of ['repo', 'baseRef', 'branch', 'isolate'] as const) assert.equal(key in record, false, `${key} is not on a folder run's record`);
  assert.deepEqual(record.steps, { write: { taskId: null }, review: { taskId: null } });
  assert.deepEqual(gitAsked(), []);
});

test('a folder team refuses --repo, --no-worktree and --after, before anything is written', () => {
  const before = fs.readdirSync(path.join(ROOT, 'runs')).sort();
  const named = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, repoNamed: true, workflowDir: TEAM }));
  assert.equal(named.exitCode, 2);
  assert.match(named.message, /^--repo .*: this workflow's steps say `workspace: folder`/);
  assert.match(named.message, /Start it without --repo/);

  const inPlace = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, isolate: false }));
  assert.equal(inPlace.exitCode, 2);
  assert.match(inPlace.message, /^--no-worktree: this workflow's steps say `workspace: folder`/);

  const waiting = refusal(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: TEAM, after: ['some-run-a1b2'] }));
  assert.equal(waiting.exitCode, 2);
  assert.match(waiting.message, /^--after some-run-a1b2: this run's team works in folders \(workspace: folder\)/);

  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'runs')).sort(), before, 'nothing was written');
  assert.deepEqual(gitAsked(), []);
});

test('a git team is still a git run: from a directory that is no repository, it is refused by git', () => {
  const GIT_TEAM = path.join(ROOT, 'workflows', 'plain');
  fs.mkdirSync(GIT_TEAM, { recursive: true });
  fs.writeFileSync(path.join(GIT_TEAM, 'write.md'), 'write the note\n');
  assert.throws(() => start({ brief: 'x', repo: NOT_A_REPO, workflowDir: GIT_TEAM }));
  assert.ok(gitAsked().length > 0, 'a git team asks git');
  fs.rmSync(GIT_ASKED, { force: true });
});
