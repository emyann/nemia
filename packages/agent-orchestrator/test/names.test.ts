/**
 * The packages' former names, and the project's, are said only where the words are history.
 *
 * `packages/agent-runtime` and `packages/agent-orchestrator` have former names. A live file that still says them — an import, a path,
 * a sentence telling the next person where to look — points at nothing. So every file the repository holds is read, tracked or not yet
 * added (git's own list, ignored files left out), and a former name is refused anywhere but:
 *
 * - a file on `HISTORY`: dated writing that keeps the words it was written with, with a line at its top that says so — a `.md` file
 *   there that names a former package carries, in its first `NOTE_WITHIN` lines, one line with both `MARK` and `NOTE`, or the suite
 *   fails;
 * - a store's path, `~/.agent-workflows` or `~/.agent-engine`: the stores kept their names, since a new default would orphan every
 *   record on disk (each package's README says so);
 * - a line that says `MARK`: an alias kept on purpose, or the history the README gives.
 *
 * The project's former name is refused as the packages' are, outside history and a line that says `PROJECT_MARK`, in these forms
 * (`projectNames`): the upper-case word; the name with its version, spaced or hyphenated, but in a path, since a path that names the
 * checkout names a folder on disk; the lower-case word as a prefix of the machinery — a plugin, a storage key, a client's name, a scratch
 * folder — but for the folder's own name, the earlier project's migration notes, and a key an older board wrote in a person's browser
 * (`LEFT_IN_BROWSER`); and, in the board's own files (`BOARD`), the word alone. The brand is the name alone: `BRAND` is refused too.
 *
 * Turbo caches this package's pass by this package's files, so a change elsewhere alone replays it: `npx turbo run test --force`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { files, textOf } from './repo-files.ts';

const MARK = 'renamed on 2026-09-23';
/** The packages' former names, spelled in parts so that this line is not one that names them. */
const FORMER = ['engine', 'workflows'].map((name) => `agent-${name}`);

/** A former name as a word of its own; one right after a `.` is a store's directory, and is not the package. */
const NAME = new RegExp(`(?<![.\\w])(?:${FORMER.join('|')})(?!\\w)`, 'g');

/**
 * Dated history, by path from the repository's root: a file, a folder (`/` at its end), or a file pattern (`*`).
 */
const HISTORY = [
  'docs/design-2026-*.md',
  'docs/eval-2026-*.md',
  'docs/eval-2026-09-12/',
  'docs/eval-2026-09-25-composable-workflows/',
  'docs/spike-2026-*.md',
  'docs/pivot-2026-09-18.md',
  'docs/pivot-2026-09-18/',
  'docs/plan-hold-the-bar.md',
  'docs/night-*.md',
];

/** Whether a file is under one entry of `HISTORY`: the whole path, never a part of it. */
const under = (entry: string, file: string): boolean =>
  entry.endsWith('/')
    ? file.startsWith(entry)
    : entry.includes('*')
      ? new RegExp(`^${entry.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`).test(file)
      : file === entry;

const inHistory = (file: string): boolean => HISTORY.some((entry) => under(entry, file));

/** What the note at the top of a history file says, beside `MARK`, and how far down it may sit: a reader meets it before the old words. */
const NOTE = 'keeps the names it was written with';
const NOTE_WITHIN = 5;

/**
 * Only a `.md` file on history is asked for a note: a JSON fixture is read by a test, and a line added to it would change what the test
 * reads.
 */
const asksForNote = (file: string): boolean => file.endsWith('.md') && inHistory(file);

/** Whether a history file that names a former package says, near its top, that it keeps the old names: `undefined` when it does. */
function unnoted(text: string): string | undefined {
  if (!text.match(NAME)) return undefined;
  if (
    text
      .split('\n')
      .slice(0, NOTE_WITHIN)
      .some((line) => line.includes(MARK) && line.includes(NOTE))
  )
    return undefined;
  return `names a former package and has no line in its first ${NOTE_WITHIN} with "${MARK}" and "${NOTE}"`;
}

/** Each line of `text` that names a former package, as `<line>: <text>`, where it is not allowed. */
function formerNames(text: string): string[] {
  return text
    .split('\n')
    .flatMap((line, i) => (!line.includes(MARK) && line.match(NAME) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

/** The line that says the project's former name on purpose: the history the README gives, or the plan that renamed it. */
const PROJECT_MARK = 'named Nemia on 2026-09-29';
/** The project's former name, spelled in parts so that this file is not one that names it: the word, and the word with its version. */
const OLD = ['h', 'k', 'b'].join('');
const OLD_V = `${OLD}[- ]v2(?!\\w)`;
/** The brand said with more than its name, in parts for the same reason. */
const BRAND = ['Nemia', 'AI'].join(' ');

/**
 * The project's former name in each form it is refused in, beside the brand said with more than its name. The versioned name after a `/`,
 * a `\\` or a `-` is the checkout's folder in a path (`/code/…`, a transcript's `-code-…` folder); `PATHED` allows the line that has one,
 * or that joins it into a path, as a fixture's folder does. The prefix is lower case and has no path allowance: a plugin, a storage key, a
 * client and a scratch folder are the project's machinery, wherever they sit.
 */
const PROJECT_FORMS: readonly RegExp[] = [
  new RegExp(`(?<!\\w)${OLD.toUpperCase()}(?!\\w)`),
  new RegExp(`(?<![\\w/\\\\-])${OLD_V}`, 'i'),
  new RegExp(`(?<!\\w)${OLD}[-:](?!v2(?!\\w)|migration(?!\\w))`),
  new RegExp(`(?<!\\w)${BRAND}(?!\\w)`),
];
const PATHED = new RegExp(`[/\\\\-]${OLD_V}|path\\.join\\([^)]*['"\`]${OLD_V}['"\`]`, 'i');

/**
 * The keys an older board wrote in a person's browser, each quoted whole: the board reads or forgets what is under them, so their names
 * are the browser's and stay. A key the board writes today is refused: this allows the Factory's narrow arrangement, its dragged steps,
 * its arrangement and open runs, and a run's arrangement from before `v2`, and no other.
 */
const LEFT_IN_BROWSER = new RegExp(`'${OLD}:(?:factory-(?:layout(?::v2)?|steps|open)|canvas-layout:[^':]+)'`, 'g');

/**
 * The board's own files, by path from the repository's root: what it shows is its name, so the lower-case word alone (`BARE`) is refused
 * there too. Elsewhere it is the earlier project, whose migration and ADRs the docs cite.
 */
const BOARD = ['apps/web/index.html', 'apps/web/src/'];
const BARE = new RegExp(`(?<![\\w/.-])${OLD}(?![\\w:-])`, 'i');
const onBoard = (file: string): boolean => BOARD.some((entry) => under(entry, file));

/** Whether one line calls the project by its former name where it is not allowed, `board` for a line of the board's own files. */
function namesOldProject(said: string, board: boolean): boolean {
  if (said.includes(PROJECT_MARK)) return false;
  const line = said.replace(LEFT_IN_BROWSER, "''");
  const [word, versioned, prefix, brand] = PROJECT_FORMS as [RegExp, RegExp, RegExp, RegExp];
  return (
    word.test(line) || (versioned.test(line) && !PATHED.test(line)) || prefix.test(line) || brand.test(line) || (board && BARE.test(line))
  );
}

/** Each line of `text` that calls the project by its former name where it is not allowed, as `<line>: <text>`. */
function projectNames(text: string, board = false): string[] {
  return text.split('\n').flatMap((line, i) => (namesOldProject(line, board) ? [`${i + 1}: ${line.trim().slice(0, 160)}`] : []));
}

test('no live file names a package by its former name', () => {
  const found = files()
    .filter((f) => !inHistory(f))
    .flatMap((f) => {
      const text = textOf(f);
      return text === undefined ? [] : formerNames(text).map((l) => `${f}:${l}`);
    });
  assert.deepEqual(
    found,
    [],
    `these name agent-runtime or agent-orchestrator by the names they had until 2026-09-23:\n${found.join('\n')}`,
  );
});

test('every history file that names a former package says so at its top', () => {
  const found = files()
    .filter(asksForNote)
    .flatMap((f) => {
      const text = textOf(f);
      const why = text === undefined ? undefined : unnoted(text);
      return why ? [`${f} ${why}`] : [];
    });
  assert.deepEqual(found, []);
  assert.ok(
    files()
      .filter(asksForNote)
      .some((f) => textOf(f)?.match(NAME)),
    'and some history names one: the rule reads something',
  );
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
  assert.equal(
    unnoted(['# Night run', '', `> The packages were ${MARK}.`, `the ${engine} had issue 24`].join('\n')),
    refused,
    'the mark without the note',
  );
  assert.equal(unnoted(['# Night run', '', note, `the ${engine} had issue 24`].join('\n')), undefined, 'and the note on line 3 passes');
  assert.equal(unnoted('# A plan\n\nnothing old here'), undefined, 'and history that names no former package needs none');
  assert.equal(asksForNote('docs/night-2026-09-22.md'), true);
  assert.equal(asksForNote('docs/pivot-2026-09-18/experiments/README.md'), true);
  assert.equal(asksForNote('docs/pivot-2026-09-18/experiments/cost/tx.py'), false, 'history that is not markdown carries no note');
  assert.equal(asksForNote('docs/plan-multi-repo.md'), false, 'a live file is held to no former name at all, not to a note');
});

test('every entry on the history list is there: a moved file never widens what is allowed', () => {
  const all = files();
  for (const entry of HISTORY)
    assert.ok(
      all.some((f) => under(entry, f)),
      `${entry} is on a history list and holds no file`,
    );
});

test('REFUSED: a former name in an import, a path, a sentence or a dependency', () => {
  const [engine, workflows] = FORMER as [string, string];
  for (const line of [
    `import { codex } from '${engine}';`,
    `const { tick } = await import('${workflows}/run');`,
    `import { codex } from '../../${engine}/src/runner-codex.ts';`,
    `See packages/${workflows}/docs/features.md, section 3.`,
    `the ${engine}'s open issue 24`,
    `  "${engine}": "*"`,
    workflows,
  ])
    assert.deepEqual(formerNames(line), [`1: ${line.trim()}`], line);
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
  ])
    assert.deepEqual(formerNames(line), [], line);
});

test('REFUSED: a file beside history is live, and history is matched whole', () => {
  assert.equal(inHistory('docs/night-2026-09-22.md'), true);
  assert.equal(inHistory('docs/pivot-2026-09-18/experiments/cost/tx.py'), true);
  assert.equal(inHistory('docs/design-2026-09-25-agents-and-skills.md'), true);
  assert.equal(inHistory('docs/spike-2026-09-25-agents-skills.md'), true);
  assert.equal(inHistory('docs/eval-2026-09-25-composable-workflows/brief.md'), true);
  assert.equal(inHistory('docs/plan-hold-the-bar.md'), true);
  for (const live of [
    'docs/night-2026-09-22.md.bak',
    'docs/night/notes.md',
    'docs/pivot-2026-09-18.md.orig',
    'docs/pivot-2026-09-18-later.md',
    'docs/plan-multi-repo.md',
    'docs/eval-sqlite-store.md',
    'docs/eval-thin-runtime.md',
    'docs/design-2026-09-25-agents-and-skills.md.bak',
    'packages/agent-orchestrator/test/fixtures/team/README.md',
    'CLAUDE.md',
  ])
    assert.equal(inHistory(live), false, live);
});

test('no live file calls the project by its former name', () => {
  const found = files()
    .filter((f) => !inHistory(f))
    .flatMap((f) => {
      const text = textOf(f);
      return text === undefined ? [] : projectNames(text, onBoard(f)).map((l) => `${f}:${l}`);
    });
  assert.deepEqual(found, [], `these call the project by the name it had until it was ${PROJECT_MARK}:\n${found.join('\n')}`);
});

test('REFUSED: the former project name in a title, a package, a label, a plugin, a key, a client, a scratch folder and a path segment', () => {
  const upper = OLD.toUpperCase();
  for (const line of [
    `# ${OLD} v2`,
    `# ${OLD}-v2 — contributor guide`,
    `# ${upper} v2`,
    `  "name": "${OLD}-v2",`,
    `Shipped with ${upper}`,
    `the skills ${upper} ships`,
    `\`${OLD}-planner:plan-a-change\``,
    `const FACTORY_KEY = '${OLD}:factory-layout:v3';`,
    `const layoutKey = (runId: string) => \`${OLD}:canvas-layout:v2:\${runId}\`;`,
    `kept.set('${OLD}:canvas-layout:v2:r-1', saved);`,
    `const KEY = "${OLD}:factory-open";`,
    `new Client({ name: '${OLD}-api', version: '0.0.0' })`,
    `const tmp = scratch('${OLD}-api-read-');`,
    `pluginDir: ['/a/${OLD}-x']`,
    `write(path.join(repo, 'CLAUDE.md'), '# ${OLD}-v2 — contributor guide\\n');`,
    `{ command: '${OLD}-no-such-mcp-server' }`,
    `${BRAND}, the machine for agent teams`,
  ])
    assert.deepEqual(projectNames(line), [`1: ${line.trim()}`], line);
  assert.deepEqual(projectNames(`one\ntwo ${OLD}-v2\nthree`), [`2: two ${OLD}-v2`], 'the line is named');
});

test('a path that names the checkout, the earlier project, a store, a key an older board wrote and the marked line pass; a word that only contains the name is not it', () => {
  for (const line of [
    `cwd: '/code/${OLD}-v2',`,
    `path.join('claude', 'projects', '-home-me-projects-${OLD}-v2', 'x.jsonl')`,
    `const repo = path.join(root, '${OLD}-v2');`,
    `assert.equal(repoName('/x/${OLD}-v2'), '${OLD}-v2');`,
    `| \`docs/${OLD}-migration.md\` | notes toward moving ${OLD} onto this engine |`,
    `the old ${OLD}, rebuilt`,
    `const shipped = '/${OLD}/workflows/skills';`,
    `AE_ROOT=~/.agent-engine and WF_ROOT=~/.agent-workflows`,
    `${OLD.toUpperCase()}_QUOTA_KEEP_MS=0`,
    `The project was ${OLD} v2 until it was ${PROJECT_MARK}.`,
    `sh${OLD}-x and ${OLD}s: a word of its own`,
    'Nemia — the name alone',
    `const NARROW_FACTORY_KEY = '${OLD}:factory-layout';`,
    `const FACTORY_LEFTOVER_KEYS = ['${OLD}:factory-steps', '${OLD}:factory-layout:v2', '${OLD}:factory-open'];`,
    `const kept = new Map([['${OLD}:canvas-layout:r-1', saved]]);`,
  ])
    assert.deepEqual(projectNames(line), [], line);
});

test("REFUSED: the board showing the former name alone, which elsewhere is the earlier project's", () => {
  for (const line of [`    <title>${OLD}</title>`, `<NavLink to="/" size="lg" tooltip="${OLD}" onPress={picked}>`])
    assert.deepEqual(projectNames(line, true), [`1: ${line.trim()}`], line);
  assert.deepEqual(projectNames(`    <title>${OLD}</title>`), [], 'outside the board, the word alone is the earlier project');
  assert.deepEqual(projectNames(`the old ${OLD} filed such a note`, true), [`1: the old ${OLD} filed such a note`]);
  assert.deepEqual(projectNames(`{ dir: '/${OLD}/workflows/skills' }`, true), [], 'a path is not the name');
  assert.equal(onBoard('apps/web/index.html'), true);
  assert.equal(onBoard('apps/web/src/routes/__root.tsx'), true);
  assert.equal(onBoard('apps/web/test/e2e/seed.ts'), false);
  assert.equal(onBoard('apps/web/index.html.bak'), false);
  const all = files();
  for (const entry of BOARD)
    assert.ok(
      all.some((f) => under(entry, f)),
      `${entry} is on the board's list and holds no file`,
    );
});
