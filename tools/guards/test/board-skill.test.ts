/**
 * The board's facts (`apps/web/CLAUDE.md`, *shadcn and the kit's skills*) send a session to shadcn right, as the repository holds it:
 *
 * 1. **The shell moves first.** The section orders `cd apps/web` before it orders the load of `shadcn` with the Skill tool: shadcn's
 *    skill reads the project as it loads, by a command that answers only where `components.json` is, and from the root it refuses
 *    with monorepo_root.
 * 2. **It names only files that are there.** Each path from the root its code spans name is in the repository, and the files a step
 *    whose fence refuses `cd` reads instead (`READ_INSTEAD`) are among them.
 *
 * Each rule is first made to refuse on the section with one break planted; then the section as the repository holds it is read, for a
 * name it must hold, so a file moved or emptied cannot make the guard pass by reading nothing.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { REPO } from 'test-kit/repo';

const FILE = 'apps/web/CLAUDE.md';

/** The heading of the section of `FILE` that says how a session reaches shadcn, whose paths are from the repository's root. */
const HEADING = "## shadcn and the kit's skills";

/** The section of `text` under `HEADING`, to the next section; empty when `text` has none. */
function sectionOf(text: string) {
  const start = text.indexOf(`${HEADING}\n`);
  if (start < 0) return '';
  const end = text.indexOf('\n## ', start + HEADING.length);
  return end < 0 ? text.slice(start) : text.slice(start, end);
}

const TEXT = fs.readFileSync(path.join(REPO, FILE), 'utf8');

/** The order to load shadcn's skill. */
const LOADS_SHADCN = /load\s+`shadcn`\s+with\s+the\s+Skill\s+tool/i;

/** What a step whose fence refuses `cd` and the skill reads in their place. */
const READ_INSTEAD = ['.claude/skills/shadcn/SKILL.md', 'apps/web/components.json', 'apps/web/src/components/ui'];

/** A code span that is a plain path from the repository's root: no placeholder, glob, parameter or space in it. */
const ROOT_PATH = /^(?:\.claude|apps|packages|docs|tools)\/[^\s<>?$*]*$/;

/** Rule 1 broken in the section of `text`: the load missing, or ordered before the shell is moved. Empty when held. */
function misordered(text: string) {
  const body = sectionOf(text);
  const load = LOADS_SHADCN.exec(body);
  if (!load) return ['no order to load `shadcn` with the Skill tool'];
  return body.slice(0, load.index).includes('`cd apps/web`') ? [] : ['the load of `shadcn` is ordered before `cd apps/web`'];
}

/** Rule 2 broken in the section of `text` against the repository at `root`: a path it names that is not there, a file to read not named. */
function misnamed(text: string, root: string) {
  const body = sectionOf(text);
  const named = [...new Set([...body.matchAll(/`([^`\n]+)`/g)].map(([, span]) => span ?? '').filter((span) => ROOT_PATH.test(span)))];
  return [
    ...READ_INSTEAD.filter((file) => !named.includes(file)).map((file) => `${file} is not named`),
    ...named.filter((file) => !fs.existsSync(path.join(root, file))).map((file) => `${file} is not there`),
  ];
}

/** The board's facts with `from` replaced by `to`, which must change it. */
function planted(from: string | RegExp, to: string) {
  const text = TEXT.replace(from, to);
  assert.notEqual(text, TEXT, `${FILE} holds what the fixture changes`);
  return text;
}

test('REFUSED: board facts that order the load of shadcn before it moves the shell into apps/web', () => {
  const swapped = planted('`cd apps/web` from', '`cd` into the board from').replace(
    /^1\. \*\*/m,
    '0. **Load `shadcn` with the Skill tool now.**\n1. **Then `cd apps/web`. ',
  );
  assert.deepEqual(misordered(swapped), ['the load of `shadcn` is ordered before `cd apps/web`']);
});

test('REFUSED: board facts that name a file the repository does not hold', () => {
  assert.deepEqual(misnamed(planted('`apps/web/components.json`', '`apps/web/component.json`'), REPO), [
    'apps/web/components.json is not named',
    'apps/web/component.json is not there',
  ]);
});

test("the board's facts move the shell into apps/web before they load shadcn, and name files that are there", () => {
  assert.ok(sectionOf(TEXT).includes('`cd apps/web`'), `${FILE}'s section ${HEADING} is read`);
  assert.deepEqual(misordered(TEXT), []);
  assert.deepEqual(misnamed(TEXT, REPO), []);
});
