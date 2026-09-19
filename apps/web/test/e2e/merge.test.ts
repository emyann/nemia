/**
 * Two runs that change the board side by side merge without a hand, in a throwaway repository: two that each add a page to the e2e, and two
 * that each add a lesson to CLAUDE.md. Each beside what the old shape did — one array of pages, CLAUDE.md merged as code — which conflicts,
 * so the test shows the structure is what stops it. Git with no config of this machine's: no hooks, no signing, no one's defaults.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { PAGES_DIR, pageFiles } from './pages.ts';

const REPO = path.resolve(import.meta.dirname, '..', '..', '..', '..');

const temps: string[] = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=e2e', '-c', 'user.email=e2e@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1' },
  });

const writeAll = (root: string, files: Record<string, string>): void => {
  for (const [file, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), text);
  }
};

/**
 * A repository holding `base`, and two branches off it, `one` and `other`, each writing its own files over it; then `other` merged into
 * `one`, as a person merges main into a branch. Answers the repository, and whether the merge was clean.
 */
function mergeOf(base: Record<string, string>, one: Record<string, string>, other: Record<string, string>): { repo: string; clean: boolean; said: string } {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-e2e-merge-'));
  temps.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  writeAll(repo, base);
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'base');
  for (const [branch, files] of [['one', one], ['other', other]] as const) {
    git(repo, 'checkout', '-qb', branch, 'main');
    writeAll(repo, files);
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', branch);
  }
  git(repo, 'checkout', '-q', 'one');
  try {
    return { repo, clean: true, said: git(repo, 'merge', '--no-edit', 'other') };
  } catch (err) {
    return { repo, clean: false, said: String((err as { stdout?: string }).stdout ?? err) };
  }
}

const pageFile = (name: string): string =>
  `import type { PageSpec } from '../visit.ts';\n\nexport default {\n  name: '${name}',\n  route: '/',\n  expect: async () => {},\n} satisfies PageSpec;\n`;

test('two branches that each add a page under pages/, with the same number, merge cleanly, and both are visited', () => {
  const base = Object.fromEntries(fs.readdirSync(PAGES_DIR).map((file) => [`pages/${file}`, fs.readFileSync(path.join(PAGES_DIR, file), 'utf8')]));
  const { repo, clean, said } = mergeOf(base, { 'pages/250-alpha.ts': pageFile('alpha') }, { 'pages/250-beta.ts': pageFile('beta') });
  assert.ok(clean, `the merge is clean — git said:\n${said}`);
  const merged = pageFiles(path.join(repo, 'pages'));
  assert.deepEqual(merged.slice(-3), ['240-capabilities.ts', '250-alpha.ts', '250-beta.ts']);
  assert.equal(merged.length, Object.keys(base).length + 2);
});

test('the old shape — one array of pages every run appends to — conflicts on the same two adds', () => {
  const list = (...names: string[]) => `const PAGES: PageSpec[] = [\n${names.map((name) => `  ${name},\n`).join('')}];\n`;
  const { clean } = mergeOf({ 'run.ts': list('agents', 'capabilities') }, { 'run.ts': list('agents', 'capabilities', 'alpha') }, { 'run.ts': list('agents', 'capabilities', 'beta') });
  assert.equal(clean, false, 'two appends at the end of one array conflict');
});

/** The repository's CLAUDE.md with `lesson` added as the last line of its first section, where a run adds what it learned. */
function withLesson(claude: string, lesson: string): string {
  const next = claude.indexOf('\n## ', claude.indexOf('\n## ') + 1);
  assert.ok(next > 0, 'CLAUDE.md has a second section');
  return `${claude.slice(0, next).trimEnd()}\n${lesson}\n${claude.slice(next)}`;
}

test('two branches that each add a lesson to CLAUDE.md, at the same place, merge cleanly with the repository\'s .gitattributes', () => {
  const claude = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
  const attributes = fs.readFileSync(path.join(REPO, '.gitattributes'), 'utf8');
  const [alpha, beta] = ['- **Alpha learned something.** And wrote it down.', '- **Beta learned something else.** And wrote that down.'];
  const { repo, clean, said } = mergeOf({ 'CLAUDE.md': claude, '.gitattributes': attributes }, { 'CLAUDE.md': withLesson(claude, alpha) }, { 'CLAUDE.md': withLesson(claude, beta) });
  assert.ok(clean, `the merge is clean — git said:\n${said}`);
  const merged = fs.readFileSync(path.join(repo, 'CLAUDE.md'), 'utf8');
  for (const lesson of [alpha, beta]) assert.equal(merged.split(lesson).length - 1, 1, `the merge keeps ${lesson} once`);
  assert.equal(merged.replace(`${alpha}\n`, '').replace(`${beta}\n`, ''), claude, 'and every other line as it was');
});

test('without the union rule, the same two lessons conflict', () => {
  const claude = fs.readFileSync(path.join(REPO, 'CLAUDE.md'), 'utf8');
  const { clean } = mergeOf({ 'CLAUDE.md': claude }, { 'CLAUDE.md': withLesson(claude, '- one') }, { 'CLAUDE.md': withLesson(claude, '- other') });
  assert.equal(clean, false);
});
