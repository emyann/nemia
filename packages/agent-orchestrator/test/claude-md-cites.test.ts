/**
 * A rule a `CLAUDE.md` states by citing its test is only held while that test is there: the file cites a test path, and often a test
 * name after it, and a cut that deletes the test leaves the prose pointing at nothing, with the whole suite still green. So every
 * `CLAUDE.md` of the repository — the root's, each package's and each app's — is read here, and a citation that resolves to no test
 * file, or to a name that file does not hold, is refused. It is the shape `comments.test.ts` has for a name a comment quotes.
 *
 * A cited path is read as the files cite them today: from the repository root (`packages/agent-orchestrator/test/boundary.test.ts`),
 * from a package by its name (`agent-runtime/test/engine.test.ts`), from the folder of the file that cites it
 * (`test/boundary.test.ts`), or by its name alone (`suite.test.ts`) — so a citation names a test when a test file of the repository
 * ends with it, at a path boundary. A glob or a placeholder cites no one file and is passed over.
 *
 * A cited name is a sentence in italics or backticks right after the path, and it is held when a test or a suite of that file declares
 * a name holding it: the files quote the short of a long name. The patterns match across line breaks, since a citation wraps.
 *
 * The test reads files outside this package: after a change to a `CLAUDE.md` or to a test's name, `npx turbo run test --force`.
 *
 * How many citations the files hold is no measure of this guard: the files are being cut down to what no test can refuse, so the corpus
 * shrinks on purpose and a floor near its size would refuse a cut rather than a broken citation. The floor below only says the walk
 * read the files at all; that a citation is read, and a name with it, is proven by the `REFUSED:` fixture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';

const ROOT = path.join(import.meta.dirname, '..', '..', '..');

/** The folders a walk never enters: another repository's code, a build's output, a cache, and the package manager's tree. */
const SKIPPED = new Set(['node_modules', '.git', '.turbo', 'dist', 'build', '.e2e', 'ds']);

/** Every file under `root` whose name `wanted` accepts, by its path from `root`, in order, the skipped folders left unentered. */
function walk(root: string, wanted: (name: string) => boolean, at = ''): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, at), { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const here = at === '' ? entry.name : `${at}/${entry.name}`;
    if (entry.isDirectory()) {
      if (!SKIPPED.has(entry.name) && !entry.name.startsWith('.claude')) found.push(...walk(root, wanted, here));
    } else if (entry.isFile() && wanted(entry.name)) found.push(here);
  }
  return found;
}

/** Every `CLAUDE.md` under `root`, by its path from `root`. */
export const claudeFiles = (root: string): string[] => walk(root, (name) => name === 'CLAUDE.md');

/** Every test file under `root`, beside the code or under a `test/`, by its path from `root`. */
export const testFiles = (root: string): string[] => walk(root, (name) => /\.test\.tsx?$/.test(name));

/** A test path a citation holds: a path of names ending `.test.ts`, with no glob, placeholder or space in it. */
const PATH = /^[\w./-]+\.test\.tsx?$/;

/** What a citation says: the path cited, the name cited after it where there is one, and the line the path is on. */
export type Cite = { path: string; name?: string; line: number };

/**
 * A citation in a `CLAUDE.md`: a backticked path ending `.test.ts`, then the name it quotes where one follows — in italics or in
 * backticks, over one line break or none, a comma or a colon between them or nothing.
 */
const CITE = /`([^`\n]+\.test\.tsx?)`(?:[,:]?[ \n]*(?:\*([^*\n]+(?:\n[^*\n]+)?)\*|`([^`\n]+)`))?/g;

/** Whether a quoted thing is a name a file holds rather than another path: a sentence of words, never a file or a folder. */
const isName = (quoted: string): boolean => / /.test(quoted) && !/\.tsx?$|\//.test(quoted);

/** Every citation of `text`, in order: a glob or a placeholder, which names no one file, is left out. */
export function citesOf(text: string): Cite[] {
  const lineOf = (index: number): number => text.slice(0, index).split('\n').length;
  return [...text.matchAll(CITE)].flatMap((match) => {
    if (!PATH.test(match[1])) return [];
    const quoted = match[2] ?? match[3];
    const name = quoted !== undefined && isName(quoted) ? quoted.replace(/\s+/g, ' ').trim() : undefined;
    return [{ path: match[1], ...(name === undefined ? {} : { name }), line: lineOf(match.index) }];
  });
}

/** The test files of `files` a cited path names: the ones ending with it, at a path boundary, read from the folder of `doc` too. */
export function resolve(cite: string, doc: string, files: string[]): string[] {
  const folder = path.posix.dirname(doc);
  const wanted = [cite, folder === '.' ? cite : `${folder}/${cite}`];
  return files.filter((file) => wanted.some((want) => file === want || file.endsWith(`/${want}`)));
}

/** Every name the tests and suites of a test file declare, as its text spells them: a template or a built name is left as it is. */
export function declaredNames(text: string): string[] {
  return [...text.matchAll(/\b(?:test|it|describe|suite)(?:\.\w+)*\(\s*(['"])((?:\\.|(?!\1)[^\n])*)\1/g)].map((match) =>
    match[2].replace(/\\(['"\\])/g, '$1').replace(/\s+/g, ' '),
  );
}

/**
 * Each citation of `doc` that no test of `root` holds, in order, as `<doc>:<line> cites …`: a path that resolves to no test file, and
 * a name no test of the files it resolves to declares.
 */
export function brokenCites(root: string, doc: string, files: string[]): string[] {
  return citesOf(fs.readFileSync(path.join(root, doc), 'utf8')).flatMap((cite) => {
    const hits = resolve(cite.path, doc, files);
    const at = `${doc}:${cite.line} cites \`${cite.path}\``;
    if (hits.length === 0) return [`${at}, which is no test file of the repository`];
    const quoted = cite.name;
    if (quoted === undefined) return [];
    const held = hits.some((hit) => declaredNames(fs.readFileSync(path.join(root, hit), 'utf8')).some((name) => name.includes(quoted)));
    return held ? [] : [`${at}, *${quoted}*, a name it does not hold`];
  });
}

/** A fixture repository under a scratch root: a `CLAUDE.md` of `text`, and a test file holding one test, named `held`. */
function fixture(text: string, held: string): string {
  const root = scratch('claude-cites-');
  fs.mkdirSync(path.join(root, 'test'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), text);
  fs.writeFileSync(path.join(root, 'test', 'there.test.ts'), `test(${JSON.stringify(held)}, () => {});\n`);
  return root;
}

const HELD = 'a guard that refuses: the whole of its long name';

const FIXTURE = [
  '# A fixture',
  '',
  'A rule the suite holds (`test/there.test.ts`, *a guard that refuses*), and one it holds under another path',
  '(`there.test.ts`).',
  '',
  'A rule whose test is gone (`test/gone.test.ts`), and one whose name is gone (`test/there.test.ts`, *a guard',
  'nobody wrote*).',
  '',
  'A command, which cites no one file: `node --test test/*.test.ts`, and a shape: `<what>.boundary.test.ts`.',
  '',
].join('\n');

test('REFUSED: a CLAUDE.md citing a test file that is not there, and one citing a name that file does not hold, are found', () => {
  const root = fixture(FIXTURE, HELD);
  assert.deepEqual(brokenCites(root, 'CLAUDE.md', testFiles(root)), [
    'CLAUDE.md:6 cites `test/gone.test.ts`, which is no test file of the repository',
    'CLAUDE.md:6 cites `test/there.test.ts`, *a guard nobody wrote*, a name it does not hold',
  ]);
});

test('a citation whose test file and name are both there, on one line or over two, is no refusal', () => {
  const root = fixture(
    FIXTURE.replace('test/gone.test.ts', 'test/there.test.ts').replace('a guard\nnobody wrote', 'a guard that\nrefuses'),
    HELD,
  );
  assert.deepEqual(brokenCites(root, 'CLAUDE.md', testFiles(root)), []);
});

test("every CLAUDE.md of the repository is read, the root's and each package's, app's and the guards'", () => {
  assert.deepEqual([...claudeFiles(ROOT)].sort(), [
    'CLAUDE.md',
    'apps/api/CLAUDE.md',
    'apps/docs/CLAUDE.md',
    'apps/web/CLAUDE.md',
    'packages/agent-orchestrator/CLAUDE.md',
    'packages/agent-runtime/CLAUDE.md',
    'tools/guards/CLAUDE.md',
  ]);
});

test('every test file each CLAUDE.md cites is there, and every test name it quotes is one that file holds', () => {
  const files = testFiles(ROOT);
  assert.ok(files.length > 200, `the walk found ${files.length} test files, far fewer than the repository has`);
  const docs = claudeFiles(ROOT);
  const cited = docs.flatMap((doc) => citesOf(fs.readFileSync(path.join(ROOT, doc), 'utf8')));
  assert.ok(cited.length > 20, `the files cite ${cited.length} tests, far fewer than they do`);
  const broken = docs.flatMap((doc) => brokenCites(ROOT, doc, files));
  assert.deepEqual(broken, [], 'correct the citation to the test that holds the rule, or delete the line with its test');
});
