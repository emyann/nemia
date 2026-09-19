/**
 * The e2e's list of pages is the directory `pages/` (pages.ts): every file there visited, each once, in the order of their names, and
 * anything else there refused, since the runner would never visit it. No browser: `npm run e2e` runs this before it builds anything.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { loadPages, orderOf, PAGES_DIR, pageFiles } from './pages.ts';

const temps: string[] = [];
after(() => {
  for (const dir of temps) fs.rmSync(dir, { recursive: true, force: true });
});

/** A directory of pages: each file's name and what it holds — a page named as given, or any text. */
function dirOf(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hkb-e2e-pages-'));
  temps.push(dir);
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
const page = (name: string): string => `export default { name: ${JSON.stringify(name)}, route: '/', expect: async () => {} };\n`;

test('every file in pages/ is a page the e2e visits, once, named as its file is', async () => {
  const files = fs.readdirSync(PAGES_DIR);
  const pages = await loadPages();
  assert.equal(pages.length, files.length, 'one page per file');
  assert.deepEqual(pages.map((p) => p.name), pageFiles().map((file) => file.replace(/^\d{3}-/, '').replace(/\.ts$/, '')));
  assert.equal(new Set(pages.map((p) => p.name)).size, pages.length, 'no page twice');
});

test('the runner visits what loadPages reads, and no list of its own', () => {
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'run.ts'), 'utf8');
  assert.match(runner, /visitAll\(browser, base, pages, OUT\)/);
  assert.match(runner, /const pages = await loadPages\(\);/);
  assert.doesNotMatch(runner, /from '\.\/pages\//, 'run.ts imports no page by its file');
  assert.doesNotMatch(runner, /PageSpec\[\]/, 'run.ts keeps no array of pages');
});

test('no page imports run.ts, which would start the whole e2e as the pages load', () => {
  for (const file of pageFiles()) assert.doesNotMatch(fs.readFileSync(path.join(PAGES_DIR, file), 'utf8'), /from '\.\.\/run\.ts'/, file);
});

test('the pages are visited by their numbers, then their names — not by name alone, not in the order given', () => {
  const given = ['240-alpha.ts', '100-zeta.ts', '100-beta.ts', '010-yak.ts'];
  assert.deepEqual(orderOf(given), ['010-yak.ts', '100-beta.ts', '100-zeta.ts', '240-alpha.ts']);
  assert.deepEqual(given, ['240-alpha.ts', '100-zeta.ts', '100-beta.ts', '010-yak.ts'], 'the list given is left as it was');
});

test('the pages are visited in that order whatever order the directory lists them in', async () => {
  // The names disagree with the numbers, and the directory lists them backwards: only a sort by the file's name puts them right.
  const names = Array.from({ length: 12 }, (_, i) => `${String((i + 1) * 10).padStart(3, '0')}-p${12 - i}`);
  const dir = dirOf(Object.fromEntries(names.map((name) => [`${name}.ts`, page(name.slice(4))])));
  const backwards = (d: string) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? 1 : -1));
  assert.deepEqual(pageFiles(dir, backwards), names.map((name) => `${name}.ts`));
  assert.deepEqual((await loadPages(dir)).map((p) => p.name), names.map((name) => name.slice(4)));
});

for (const [what, files, refusal] of [
  ['a helper among the pages', { '010-a.ts': page('a'), 'helpers.ts': 'export const x = 1;\n' }, /would never visit helpers\.ts\. .*put a helper beside pages\.ts/],
  ['a page without its number', { '010-a.ts': page('a'), 'b.ts': page('b') }, /would never visit b\.ts\. Name a page for its place/],
  ['a page with a number of two digits', { '10-a.ts': page('a') }, /would never visit 10-a\.ts/],
  ['a page in another language', { '010-a.tsx': page('a') }, /would never visit 010-a\.tsx/],
] as const) {
  test(`pages/ refuses ${what}`, async () => {
    const dir = dirOf(files);
    assert.throws(() => pageFiles(dir), (e: Error) => refusal.test(e.message));
    await assert.rejects(loadPages(dir), (e: Error) => refusal.test(e.message));
  });
}

test('pages/ refuses a folder, and a link, however they are named', () => {
  const dir = dirOf({ '010-a.ts': page('a') });
  fs.mkdirSync(path.join(dir, '020-more.ts'));
  fs.symlinkSync(path.join(dir, '010-a.ts'), path.join(dir, '030-again.ts'));
  assert.throws(() => pageFiles(dir), (e: Error) => /would never visit 020-more\.ts, 030-again\.ts\./.test(e.message));
});

test('a page is refused when its file exports none', async () => {
  const dir = dirOf({ '010-a.ts': 'export const spec = { name: "a", route: "/", expect: async () => {} };\n' });
  await assert.rejects(loadPages(dir), (e: Error) => /^010-a\.ts default-exports its page/.test(e.message));
});

test('a page is refused when its name is not its file\'s, which names its screenshots', async () => {
  const dir = dirOf({ '010-a.ts': page('b') });
  await assert.rejects(loadPages(dir), (e: Error) => /^010-a\.ts is the a page, .* it says it is b: make the two the same\.$/.test(e.message));
});

test('a page is refused the second time it is there, under another number', async () => {
  const dir = dirOf({ '010-a.ts': page('a'), '020-b.ts': page('b'), '030-a.ts': page('a') });
  await assert.rejects(loadPages(dir), (e: Error) => /^010-a\.ts and 030-a\.ts are both the a page, which would be visited twice/.test(e.message));
});

test('an empty pages/ is refused: an e2e that visits nothing passes', async () => {
  await assert.rejects(loadPages(dirOf({})), (e: Error) => /has no page in it/.test(e.message));
});
