/**
 * The packages' former names are said only where the words are history.
 *
 * `packages/agent-runtime` and `packages/agent-orchestrator` had other names until 2026-09-23. A live file that still says them —
 * an import, a path, a sentence telling the next person where to look — points at nothing, and the next two changes are written in
 * the new words. So every file the repository holds is read, tracked or not yet added (git's own list, ignored files left out), and a
 * former name is refused anywhere but:
 *
 * - a file on `HISTORY`: dated writing that keeps the words it was written with, with a line at its top that says so — a `.md` file
 *   there that names a former package carries, in its first `NOTE_WITHIN` lines, one line with both `MARK` and `NOTE`, or the suite
 *   fails (`UNNOTED` are the exceptions, each with its reason);
 * - a store's path, `~/.agent-workflows` or `~/.agent-engine`: the stores kept their names, since a new default would orphan every
 *   record on disk (each package's README says so);
 * - a line that says `renamed on 2026-09-23`: an alias kept on purpose, or the history the README gives.
 *
 * Turbo caches this package's pass by this package's files, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, textOf } from './repo-files.ts';

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

/** What the note at the top of a history file says, beside `MARK`, and how far down it may sit: a reader meets it before the old words. */
const NOTE = 'keeps the names it was written with';
const NOTE_WITHIN = 5;

/**
 * History that names a former package and carries no note. Only a `.md` file is asked for one: a JSON fixture is read by a test, and a line
 * added to it would change what the test reads. And the cards in the jev experiment are the briefs Jev was measured on, as they were sent: a
 * note would change what was measured, and the experiments' README says so in its own.
 */
const UNNOTED = ['docs/pivot-2026-09-18/experiments/jev/cards/'];

const asksForNote = (file: string): boolean => file.endsWith('.md') && inHistory(file) && !UNNOTED.some((entry) => under(entry, file));

/** Whether a history file that names a former package says, near its top, that it keeps the old names: `undefined` when it does. */
function unnoted(text: string): string | undefined {
  if (!text.match(NAME)) return undefined;
  if (text.split('\n').slice(0, NOTE_WITHIN).some((line) => line.includes(MARK) && line.includes(NOTE))) return undefined;
  return `names a former package and has no line in its first ${NOTE_WITHIN} with "${MARK}" and "${NOTE}"`;
}

/** Each line of `text` that names a former package, as `<line>: <text>`, where it is not allowed. */
function formerNames(text: string): string[] {
  return text.split('\n').flatMap((line, i) => (!line.includes(MARK) && line.match(NAME) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

test('no live file names a package by its former name', () => {
  const found = files().filter((f) => !inHistory(f)).flatMap((f) => {
    const text = textOf(f);
    return text === undefined ? [] : formerNames(text).map((l) => `${f}:${l}`);
  });
  assert.deepEqual(found, [], `these name agent-runtime or agent-orchestrator by the names they had until 2026-09-23:\n${found.join('\n')}`);
});

test('every history file that names a former package says so at its top', () => {
  const found = files().filter(asksForNote).flatMap((f) => {
    const text = textOf(f);
    const why = text === undefined ? undefined : unnoted(text);
    return why ? [`${f} ${why}`] : [];
  });
  assert.deepEqual(found, []);
  assert.ok(files().filter(asksForNote).some((f) => textOf(f)?.match(NAME)), 'and some history names one: the rule reads something');
});

test('REFUSED: history with no note, a note too far down, and a note that is not the one', () => {
  const [engine] = FORMER as [string];
  const note = `> The packages were ${MARK}. This document is history, and ${NOTE}.`;
  const body = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`);
  const refused = `names a former package and has no line in its first ${NOTE_WITHIN} with "${MARK}" and "${NOTE}"`;
  assert.equal(unnoted(['# Night run', '', ...body, `the ${engine} had issue 24`].join('\n')), refused, 'no note');
  const late = ['# Night run', ...body];
  late.splice(8, 0, note);
  assert.equal(late.indexOf(note) + 1, 9);
  assert.equal(unnoted([...late, `the ${engine} had issue 24`].join('\n')), refused, 'the note on line 9');
  assert.equal(unnoted(['# Night run', '', `> The packages were ${MARK}.`, `the ${engine} had issue 24`].join('\n')), refused, 'the mark without the note');
  assert.equal(unnoted(['# Night run', '', note, `the ${engine} had issue 24`].join('\n')), undefined, 'and the note on line 3 passes');
  assert.equal(unnoted('# A plan\n\nnothing old here'), undefined, 'and history that names no former package needs none');
  assert.equal(asksForNote('docs/night-2026-09-22.md'), true);
  assert.equal(asksForNote('docs/pivot-2026-09-18/experiments/jev/cards/card-p1.md'), false);
  assert.equal(asksForNote('packages/agent-orchestrator/test/fixtures/resolved-before.json'), false);
  assert.equal(asksForNote('docs/plan-multi-repo.md'), false, 'a live file is held to no former name at all, not to a note');
});

test('every entry on the history list is there: a moved file never widens what is allowed', () => {
  const all = files();
  for (const entry of [...HISTORY, ...UNNOTED]) assert.ok(all.some((f) => under(entry, f)), `${entry} is on a history list and holds no file`);
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
