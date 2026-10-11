/**
 * The git place's `report` (`place/git/verbs/report.ts`), asked of `gitPlace` against scratch repositories: the files each branch
 * changed — added, modified, renamed, binary, a name git would quote — the diff of each path asked of, whether a path is on a branch, the
 * text of a path at the base, a branch git does not have left out of every answer, and its refusals, never an empty list. Git runs with no
 * user or system configuration and a fixed identity.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { gitPlace } from '../place/git/place.ts';
import type { PlaceOutcome } from '../src/runner.ts';
import { scratch } from './scratch.ts';

/** The environment git runs in: this process's, without its git variables, with no configuration read and one identity. */
const ENV: NodeJS.ProcessEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@local',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@local',
};

/** Git in `dir`, its stdout trimmed. */
const git = (dir: string, ...args: string[]): string =>
  execFileSync('git', args, { cwd: dir, env: ENV, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** `file` of `dir` written with `text`, its directories made. */
const write = (dir: string, file: string, text: string | Uint8Array): void => {
  fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
  fs.writeFileSync(path.join(dir, file), text);
};

/** A repository on `main` with a `package.json`, `src/a.ts` and `docs/old.md`, and a branch `wf/x/a` that changes each way git counts. */
function repository(): string {
  const dir = scratch('wf-report-');
  git(dir, 'init', '-q', '-b', 'main');
  write(dir, 'package.json', '{ "workspaces": ["packages/*"] }\n');
  write(dir, 'src/a.ts', 'export const a = 0;\n');
  write(dir, 'docs/old.md', 'one\ntwo\nthree\nfour\nfive\n');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'base');
  git(dir, 'switch', '-q', '-c', 'wf/x/a');
  write(dir, 'src/a.ts', 'export const a = 1;\nexport const b = 2;\n');
  write(dir, 'NOTES.md', '# Notes\n');
  write(dir, 'shot.png', new Uint8Array([0, 1, 2, 0, 255]));
  write(dir, 'out/x.txt', 'x\n');
  write(dir, 'src/café\tx.ts', 'y\n');
  git(dir, 'mv', 'docs/old.md', 'docs/new.md');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'the work');
  git(dir, 'switch', '-q', 'main');
  return dir;
}

/** A report request on `dir`, against `main`, with `asked` over it. */
const request = (dir: string, asked: Partial<Record<'branches' | 'diffOf' | 'present' | 'atBase', string[]>> = {}) => ({
  repo: dir,
  baseRef: 'main',
  onto: 'main',
  branches: ['wf/x/a'],
  diffOf: [],
  present: [],
  atBase: [],
  ...asked,
});

/** `report` of the git place, in `ENV`, its request as given: one the contract's type refuses is how a malformed request is sent. */
const report = (asked: object): PlaceOutcome<'report'> => gitPlace({ env: ENV }).askNow('report', asked as never);

/** The answer of an outcome, or a failure naming what it was instead. */
function answerOf(outcome: PlaceOutcome<'report'>) {
  assert.ok('answer' in outcome, `an answer expected, got ${JSON.stringify(outcome)}`);
  return outcome.answer;
}

test('report answers the files a branch changed: added, modified, renamed with where it came from, binary with no counts', () => {
  const dir = repository();
  const answer = answerOf(report(request(dir)));
  assert.deepEqual(answer.at, {
    baseRef: 'main',
    onto: git(dir, 'rev-parse', 'main'),
    tips: { 'wf/x/a': git(dir, 'rev-parse', 'wf/x/a') },
  });
  const files = [...answer.files['wf/x/a']].sort((a, b) => (a.path < b.path ? -1 : 1));
  assert.deepEqual(files, [
    { path: 'NOTES.md', status: 'A', added: 1, removed: 0 },
    { path: 'docs/new.md', from: 'docs/old.md', status: 'R', added: 0, removed: 0 },
    { path: 'out/x.txt', status: 'A', added: 1, removed: 0 },
    { path: 'shot.png', status: 'A', added: null, removed: null },
    { path: 'src/a.ts', status: 'M', added: 2, removed: 1 },
    { path: 'src/café\tx.ts', status: 'A', added: 1, removed: 0 },
  ]);
});

test("report answers each path's diff it was asked, a rename's two ends as one, and none for a path the branch did not change", () => {
  const dir = repository();
  const answer = answerOf(report(request(dir, { diffOf: ['src/a.ts', 'docs/old.md', 'package.json'] })));
  const diffs = answer.diffs['wf/x/a'];
  assert.deepEqual(Object.keys(diffs).sort(), ['docs/old.md', 'src/a.ts']);
  assert.match(
    diffs['src/a.ts'],
    /^diff --git a\/src\/a\.ts b\/src\/a\.ts\n[\s\S]*\n-export const a = 0;\n\+export const a = 1;\n\+export const b = 2;\n$/,
  );
  assert.match(diffs['docs/old.md'], /rename from docs\/old\.md\nrename to docs\/new\.md/);
});

test('report answers whether each path is a file, a directory or absent on a branch, and its text at the base, null when absent', () => {
  const dir = repository();
  const answer = answerOf(report(request(dir, { present: ['shot.png', 'out', 'gone.txt'], atBase: ['package.json', 'NOTES.md'] })));
  assert.deepEqual(answer.present, { 'wf/x/a': { 'shot.png': 'file', out: 'directory', 'gone.txt': 'absent' } });
  assert.deepEqual(answer.atBase, { 'package.json': '{ "workspaces": ["packages/*"] }\n', 'NOTES.md': null });
});

test('a branch git does not have is in no answer, never one that changed nothing; a branch with no change is an empty list', () => {
  const dir = repository();
  git(dir, 'branch', 'wf/x/same', 'main');
  const answer = answerOf(report(request(dir, { branches: ['wf/x/a', 'wf/no/such', 'wf/x/same'], present: ['shot.png'] })));
  assert.deepEqual(Object.keys(answer.at.tips).sort(), ['wf/x/a', 'wf/x/same']);
  assert.deepEqual(Object.keys(answer.files).sort(), ['wf/x/a', 'wf/x/same']);
  assert.deepEqual(answer.files['wf/x/same'], []);
  assert.deepEqual(Object.keys(answer.present).sort(), ['wf/x/a', 'wf/x/same']);
});

test("REFUSED: report on no directory, and against a base git cannot read, in the place's words; unread for a request with no list", () => {
  const dir = repository();
  const gone = path.join(scratch('wf-report-gone-'), 'gone');
  assert.deepEqual(report(request(gone)), { refused: `${gone} is not a directory, so nothing a branch in it changed can be read` });
  assert.deepEqual(report({ ...request(dir), baseRef: 'no-such-base' }), { refused: `git cannot read the base no-such-base in ${dir}` });
  const unread = report({ ...request(dir), diffOf: 'src/a.ts' });
  assert.ok('unread' in unread, JSON.stringify(unread));
  assert.equal(unread.unread.said, 'the request\'s `diffOf` is "src/a.ts", where a list of strings is asked');
});

test('report is unread, never an empty answer, when git cannot be started at all', () => {
  const dir = repository();
  const outcome = gitPlace({ env: { ...ENV, PATH: scratch('wf-report-no-git-') } }).askNow('report', request(dir));
  assert.ok('unread' in outcome, JSON.stringify(outcome));
  assert.match(outcome.unread.said, /ENOENT/);
});
