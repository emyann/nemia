/**
 * The board's skill (`.claude/skills/change-the-board/SKILL.md`) sends a session to shadcn right, as the repository holds it:
 *
 * 1. **The shell moves first.** It orders `cd apps/web` before it orders the load of `shadcn` with the Skill tool: shadcn's skill reads
 *    the project as it loads, by a command that answers only where `components.json` is, and from the root it refuses with
 *    monorepo_root.
 * 2. **It names only files that are there.** Each path from the root its code spans name is in the repository, and the files a step
 *    whose fence refuses `cd` reads instead (`READ_INSTEAD`) are among them.
 * 3. **Its description points to shadcn**: it says to load it before a file there is read, written or judged, and that it sends you to
 *    the board's components (shadcn).
 *
 * Each rule is first made to refuse on the skill with one break planted; then the skill as the repository holds it is read, for a name
 * it must hold, so a file moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { skillEntryOf, splitFrontmatter } from 'agent-orchestrator/workflow';
import { REPO } from './workspaces.ts';

const FILE = '.claude/skills/change-the-board/SKILL.md';
const TEXT = fs.readFileSync(path.join(REPO, FILE), 'utf8');

/** The order to load shadcn's skill. */
const LOADS_SHADCN = /load\s+`shadcn`\s+with\s+the\s+Skill\s+tool/i;

/** What a step whose fence refuses `cd` and the skill reads in their place. */
const READ_INSTEAD = ['.claude/skills/shadcn/SKILL.md', 'apps/web/components.json', 'apps/web/src/components/ui'];

/** What the description, in every session's list of skills, says of when to load it and where it sends you next. */
const SENDS_FIRST = [
  /load\s+it\s+before\s+reading,\s+writing\s+or\s+judging\s+a\s+file\s+there/,
  /It\s+sends\s+you\s+to\s+the\s+board's\s+components\s+\(shadcn\)/,
];

/** A code span that is a plain path from the repository's root: no placeholder, glob, parameter or space in it. */
const ROOT_PATH = /^(?:\.claude|apps|packages|docs|tools)\/[^\s<>?$*]*$/;

/** Rule 1 broken in the skill `text`: the load missing, or ordered before the shell is moved. Empty when held. */
function misordered(text: string): string[] {
  const { body } = splitFrontmatter(FILE, text);
  const load = LOADS_SHADCN.exec(body);
  if (!load) return ['no order to load `shadcn` with the Skill tool'];
  return body.slice(0, load.index).includes('`cd apps/web`') ? [] : ['the load of `shadcn` is ordered before `cd apps/web`'];
}

/** Rule 2 broken in the skill `text` against the repository at `root`: a path it names that is not there, a file to read not named. */
function misnamed(text: string, root: string): string[] {
  const { body } = splitFrontmatter(FILE, text);
  const named = [...new Set([...body.matchAll(/`([^`\n]+)`/g)].map(([, span]) => span ?? '').filter((span) => ROOT_PATH.test(span)))];
  return [
    ...READ_INSTEAD.filter((file) => !named.includes(file)).map((file) => `${file} is not named`),
    ...named.filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `${file} is not there`),
  ];
}

/** Rule 3 broken in the skill `text`: each of `SENDS_FIRST` its description does not say, by the pattern's source. */
function unsent(text: string): string[] {
  const { description } = skillEntryOf(FILE, 'change-the-board', text);
  return SENDS_FIRST.filter((pattern) => !pattern.test(description)).map((pattern) => pattern.source);
}

/** The skill with `from` replaced by `to`, which must change it. */
function planted(from: string | RegExp, to: string): string {
  const text = TEXT.replace(from, to);
  assert.notEqual(text, TEXT, `${FILE} holds what the fixture changes`);
  return text;
}

test('REFUSED: a board skill that orders the load of shadcn before it moves the shell into apps/web', () => {
  const swapped = planted('`cd apps/web` from', '`cd` into the board from').replace(
    /^1\. \*\*/m,
    '0. **Load `shadcn` with the Skill tool now.**\n1. **Then `cd apps/web`. ',
  );
  assert.deepEqual(misordered(swapped), ['the load of `shadcn` is ordered before `cd apps/web`']);
});

test('REFUSED: a board skill that names a file the repository does not hold', () => {
  assert.deepEqual(misnamed(planted('`apps/web/components.json`', '`apps/web/component.json`'), REPO), [
    'apps/web/components.json is not named',
    'apps/web/component.json is not there',
  ]);
});

test('REFUSED: a board skill whose description names shadcn no more', () => {
  assert.deepEqual(unsent(planted('(shadcn)', '(its components)')), [SENDS_FIRST[1]?.source]);
});

test("the board's skill moves the shell into apps/web before it loads shadcn, names files that are there, and points to shadcn", () => {
  assert.ok(TEXT.includes('# Change the board'), `${FILE} is read`);
  assert.deepEqual(misordered(TEXT), []);
  assert.deepEqual(misnamed(TEXT, REPO), []);
  assert.deepEqual(unsent(TEXT), []);
});
