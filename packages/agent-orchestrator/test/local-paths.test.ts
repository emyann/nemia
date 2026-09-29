/**
 * No file names a person's home or Windows user folder.
 *
 * The repository is public, and a path such as a Linux home, a WSL mount of a Windows user folder or Claude Code's transcript folder
 * named after one says whose machine it was (`docs/plan-github-ci.md`, "Local paths"). Every file the repository holds is read, as
 * `others.test.ts` reads them, and a line that names one is refused: write `~/…` for a home, `<repo>/…` or a relative path inside the
 * checkout, `<user>` for the name, and, in a test, `os.homedir()` or `scratch()`. The few names a fixture uses for no one are allowed,
 * matched whole, so a real name that starts with one is refused all the same.
 *
 * The paths are built from parts here, so this file names no folder either and refuses nothing of its own.
 *
 * Turbo caches this package's pass by this package's files, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, ours, textOf } from './repo-files.ts';

/** The names a fixture gives a home that belongs to no one. */
const PLACEHOLDERS = ['me', 'you', 'u'];

const HOME_DIR = ['', 'home', ''].join('/');
const USERS_DIR = ['', 'mnt', 'c', 'Users', ''].join('/');
const ENCODED_DIR = ['', 'home', ''].join('-');
const placeholder = PLACEHOLDERS.join('|');

/** A home or a mounted Windows user folder, `/<root>/<name>`, whose name is not a placeholder, and not the tail of a longer path word. */
const PATHED = new RegExp(`(?<![\\w.])/(?:home|mnt/[a-z]/[Uu]sers)/(?!(?:${placeholder})(?![\\w.-]))[A-Za-z0-9_]`);

/** The same home as Claude Code encodes it into a folder name under `~/.claude/projects`, each `/` a `-`. */
const ENCODED = new RegExp(`(?<![\\w-])-home-(?!(?:${placeholder})(?!\\w))[A-Za-z0-9_]`);

/** Each line of `text` that names a home or a user folder, as `<line>: <text>`. */
function localPaths(text: string): string[] {
  return text.split('\n').flatMap((line, i) => (PATHED.test(line) || ENCODED.test(line) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

test('no file names a home or a Windows user folder', () => {
  const read = files().filter(ours);
  const found = read.flatMap((f) => {
    const text = textOf(f);
    return text === undefined ? [] : localPaths(text).map((l) => `${f}:${l}`);
  });
  assert.deepEqual(
    found,
    [],
    'these name a home or a user folder; write ~/… for a home, <repo>/… or a relative path inside the checkout, <user> for the name ' +
      `(${USERS_DIR}<user>, ${ENCODED_DIR}*-…), and os.homedir() or scratch() in a test:\n${found.join('\n')}`,
  );
  for (const f of ['docs/eval-2026-09-12/REPORT.md', 'docs/pivot-2026-09-18/experiments/cost/corpus.py']) {
    assert.ok(read.includes(f), `${f} is read: the rule reads the files that named one`);
  }
});

test('REFUSED: a home, a mounted user folder on any drive, an encoded transcript folder, and a name a placeholder only begins', () => {
  const drive = (d: string) => USERS_DIR.replace('/c/', `/${d}/`);
  for (const line of [
    `See ${HOME_DIR}alice/projects/x for the checkout.`,
    `"Read(/${HOME_DIR}alice/.ssh/config)"`,
    `![shot](${USERS_DIR}Alice/Desktop/a.png)`,
    `${drive('d')}bob/x`,
    `${drive('c').toLowerCase()}bob/x`,
    `files=glob.glob(root+'/${ENCODED_DIR}alice--x-worktrees-*/*.jsonl')`,
    `renaming the directory orphans \`~/.claude/projects/${ENCODED_DIR}alice-projects-x/\``,
    `${HOME_DIR}meg/x`,
    `${HOME_DIR}me.backup/x`,
    `${ENCODED_DIR}meg-projects-x`,
  ])
    assert.deepEqual(localPaths(line), [`1: ${line.trim()}`], line);
  assert.deepEqual(localPaths(`one\ntwo ${HOME_DIR}alice\nthree`), [`2: two ${HOME_DIR}alice`], 'the line is named');
});

test('a placeholder home, a path from home or the checkout, a <user> and a glob pass; a word that only ends in the root is not it', () => {
  for (const line of [
    `cwd: '${HOME_DIR}me/code/app',`,
    `"Read(/${HOME_DIR}me/code/app/**)"`,
    `WF_ROOT=${HOME_DIR}you/.agent-workflows`,
    `[projects."${HOME_DIR}u/repo"]`,
    `path.join('claude', 'projects', '${ENCODED_DIR}me-projects-x', 'x.jsonl')`,
    '~/projects/x and ~/.claude/projects',
    '<repo>/docs/a.md',
    `${USERS_DIR}<user>/Desktop/a.png`,
    `${HOME_DIR}<user>/projects`,
    `glob.glob(root+'/${ENCODED_DIR}*--x-worktrees-*/*.jsonl')`,
    `~/.claude/projects/${ENCODED_DIR}<user>-projects-x/`,
    "scratch('nemia-api-layer-home-')",
    'apps/web/src/routes/home/index.tsx',
    `https://example.com${HOME_DIR}alice`,
  ])
    assert.deepEqual(localPaths(line), [], line);
});

test('REFUSED: each placeholder is one a file uses, so the list does not widen unnoticed', () => {
  const texts = files()
    .filter(ours)
    .map((f) => textOf(f) ?? '');
  for (const name of PLACEHOLDERS)
    assert.ok(
      texts.some((t) => t.includes(`${HOME_DIR}${name}/`) || t.includes(`${HOME_DIR}${name}"`)),
      `${HOME_DIR}${name} is used by no file: take it off PLACEHOLDERS`,
    );
});
