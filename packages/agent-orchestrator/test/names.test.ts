/**
 * The packages' former names are said only where the words are history.
 *
 * `packages/agent-runtime` and `packages/agent-orchestrator` had other names until 2026-09-23. A live file that still says them —
 * an import, a path, a sentence telling the next person where to look — points at nothing, and the next two changes are written in
 * the new words. So every file the repository holds is read, tracked or not yet added (git's own list, ignored files left out), and a
 * former name is refused anywhere but:
 *
 * - a file on `HISTORY`: dated writing that keeps the words it was written with, with a line at its top that says so;
 * - a store's path, `~/.agent-workflows` or `~/.agent-engine`: the stores kept their names, since a new default would orphan every
 *   record on disk (each package's README says so);
 * - a line that says `renamed on 2026-09-23`: an alias kept on purpose, or the history the README gives.
 *
 * Turbo caches this package's pass by this package's files, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.join(import.meta.dirname, '..', '..', '..');

const MARK = 'renamed on 2026-09-23';
const FORMER = ['agent-engine', 'agent-workflows']; // renamed on 2026-09-23

/** A former name as a word of its own; one right after a `.` is a store's directory, and is not the package. */
const NAME = new RegExp(`(?<![.\\w])(?:${FORMER.join('|')})(?!\\w)`, 'g');

/** Dated history, by path from the repository's root: a file, a folder (`/` at its end), or a file pattern (`*`). */
const HISTORY = [
  'docs/eval-2026-09-12/',
  'docs/pivot-2026-09-18.md',
  'docs/pivot-2026-09-18/',
  'docs/plan-hold-the-bar.md',
  'docs/night-*.md',
  // Never regenerated: what the loader read every shipped folder as before agents, keys and all (agents-before-after.test.ts).
  'packages/agent-orchestrator/test/fixtures/resolved-before.json',
];

/** Whether a file is under one entry of `HISTORY`: the whole path, never a part of it. */
const under = (entry: string, file: string): boolean =>
  entry.endsWith('/') ? file.startsWith(entry)
    : entry.includes('*') ? new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(file)
      : file === entry;

const inHistory = (file: string): boolean => HISTORY.some((entry) => under(entry, file));

/** Each line of `text` that names a former package, as `<line>: <text>`, where it is not allowed. */
function formerNames(text: string): string[] {
  return text.split('\n').flatMap((line, i) => (!line.includes(MARK) && line.match(NAME) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

/** Every file the repository holds, tracked or not yet added, ignored ones left out: git's list, as a path from the root. */
const files = (): string[] =>
  execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20 })
    .split('\0').filter(Boolean);

/** Text, not an image: a NUL in its first bytes is a binary file, which says no name a person reads. */
const textOf = (file: string): string | undefined => {
  const at = path.join(REPO, file);
  if (!fs.statSync(at, { throwIfNoEntry: false })?.isFile()) return undefined; // deleted, not yet staged; or a link
  const bytes = fs.readFileSync(at);
  return bytes.subarray(0, 8000).includes(0) ? undefined : bytes.toString('utf8');
};

test('no live file names a package by its former name', () => {
  const found = files().filter((f) => !inHistory(f)).flatMap((f) => {
    const text = textOf(f);
    return text === undefined ? [] : formerNames(text).map((l) => `${f}:${l}`);
  });
  assert.deepEqual(found, [], `these name agent-runtime or agent-orchestrator by the names they had until 2026-09-23:\n${found.join('\n')}`);
});

test('every entry on the history list is there: a moved file never widens what is allowed', () => {
  const all = files();
  for (const entry of HISTORY) assert.ok(all.some((f) => under(entry, f)), `${entry} is on the history list and holds no file`);
});

test('REFUSED: a former name in an import, a path, a sentence or a dependency', () => {
  const [engine, workflows] = FORMER as [string, string];
  for (const line of [
    `import { createEngine } from '${engine}';`,
    `const { tick } = await import('${workflows}/run');`,
    `import { codex } from '../../${engine}/src/runner-codex.ts';`,
    `See packages/${workflows}/docs/features.md, section 3.`,
    `the ${engine}'s open issue 24`,
    `  "${engine}": "*"`,
    `${workflows}`,
  ]) assert.deepEqual(formerNames(line), [`1: ${line.trim()}`], line);
  assert.deepEqual(formerNames(`one\ntwo ${engine}\nthree`), [`2: two ${engine}`], 'the line is named');
});

test('a store path, a new name and a marked line pass; a word that only contains a former name is not it', () => {
  const [engine, workflows] = FORMER as [string, string];
  for (const line of [
    `path.join(os.homedir(), '.${workflows}')`,
    `AE_ROOT="$HOME/.${workflows}/engine" ae watch, beside ~/.${engine}`,
    `import { tick } from 'agent-orchestrator/run'; // and agent-runtime`,
    `'packages/${engine}': 'packages/agent-runtime', // ${MARK}`,
    `my${engine}s and ${workflows}2`,
  ]) assert.deepEqual(formerNames(line), [], line);
});

test('REFUSED: a file beside history is live, and history is matched whole', () => {
  assert.equal(inHistory('docs/night-2026-09-22.md'), true);
  assert.equal(inHistory('docs/pivot-2026-09-18/experiments/jev/dataset.json'), true);
  assert.equal(inHistory('packages/agent-orchestrator/test/fixtures/resolved-before.json'), true);
  for (const live of [
    'docs/night-2026-09-22.md.bak', 'docs/night/notes.md', 'docs/pivot-2026-09-18.md.orig', 'docs/pivot-2026-09-18-later.md',
    'docs/plan-multi-repo.md', 'docs/eval-sqlite-store.md', 'packages/agent-orchestrator/test/fixtures/git-runs-before.json', 'CLAUDE.md',
  ]) assert.equal(inHistory(live), false, live);
});
