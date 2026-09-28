/**
 * The e2e's list of pages is the directory `e2e/pages/` (pages.ts): every file there visited, each once, in the order of their names, and
 * anything else there refused, since the runner would never visit it; and `pages/NAMES` says which pages there are, so one deleted by
 * mistake is refused too. No browser, so `npm test` runs it; the tests in `e2e/` are the ones that need Chromium.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadPages, NAMES, namesIn, orderOf, PAGES_DIR, pageFiles } from './e2e/pages.ts';
import { scratch } from './scratch.ts';

/**
 * A directory of pages: each file's name and what it holds — a page named as given, or any text. And a NAMES naming each file that is named
 * as a page is, unless `files` gives one of its own.
 */
function dirOf(files: Record<string, string>): string {
  const dir = scratch('hkb-e2e-pages-');
  const names = Object.keys(files).flatMap((file) => /^\d{3}-(.+)\.ts$/.exec(file)?.[1] ?? []);
  for (const [name, text] of Object.entries({ [NAMES]: names.map((name) => `${name}\n`).join(''), ...files }))
    fs.writeFileSync(path.join(dir, name), text);
  return dir;
}
const page = (name: string): string => `export default { name: ${JSON.stringify(name)}, route: '/', expect: async () => {} };\n`;

test('every file in pages/ but NAMES is a page the e2e visits, once, named as its file is, and NAMES names each', async () => {
  const files = fs.readdirSync(PAGES_DIR).filter((file) => file !== NAMES);
  const pages = await loadPages();
  assert.equal(pages.length, files.length, 'one page per file');
  assert.deepEqual([...namesIn()].sort(), pages.map((p) => p.name).sort(), 'NAMES names the pages there are, and no other');
  assert.deepEqual(
    pages.map((p) => p.name),
    pageFiles().map((file) => file.replace(/^\d{3}-/, '').replace(/\.ts$/, '')),
  );
  assert.equal(new Set(pages.map((p) => p.name)).size, pages.length, 'no page twice');
});

test('the runner visits what loadPages reads, and no list of its own', () => {
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'e2e', 'run.ts'), 'utf8');
  assert.match(
    runner,
    /visitAll\(browser, base, pages, OUT, store\)/,
    'the runner hands the store the api serves too, so a store swept from under the e2e is said, not blamed on a page (`storeGone`)',
  );
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
  const names = Array.from({ length: 12 }, (_, i) => `${String((i + 1) * 10).padStart(3, '0')}-p${12 - i}`);
  const dir = dirOf(Object.fromEntries(names.map((name) => [`${name}.ts`, page(name.slice(4))])));
  const backwards = (d: string) => fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? 1 : -1));
  assert.deepEqual(
    pageFiles(dir, backwards),
    names.map((name) => `${name}.ts`),
    "the names disagree with the numbers, and the directory lists them backwards: only a sort by the file's name puts them right",
  );
  assert.deepEqual(
    (await loadPages(dir)).map((p) => p.name),
    names.map((name) => name.slice(4)),
  );
});

for (const [what, files, refusal] of [
  [
    'a helper among the pages',
    { '010-a.ts': page('a'), 'helpers.ts': 'export const x = 1;\n' },
    /would never visit helpers\.ts\. .*put a helper beside pages\.ts/,
  ],
  ['a page without its number', { '010-a.ts': page('a'), 'b.ts': page('b') }, /would never visit b\.ts\. Name a page for its place/],
  ['a page with a number of two digits', { '10-a.ts': page('a') }, /would never visit 10-a\.ts/],
  ['a page in another language', { '010-a.tsx': page('a') }, /would never visit 010-a\.tsx/],
] as const) {
  test(`pages/ refuses ${what}`, async () => {
    const dir = dirOf(files);
    assert.throws(
      () => pageFiles(dir),
      (e: Error) => refusal.test(e.message),
    );
    await assert.rejects(loadPages(dir), (e: Error) => refusal.test(e.message));
  });
}

test('a page deleted by mistake is refused: its line in NAMES is still there', async () => {
  const dir = dirOf({ '010-a.ts': page('a'), '020-b.ts': page('b'), '030-c.ts': page('c') });
  fs.rmSync(path.join(dir, '020-b.ts'));
  const refusal = (e: Error) =>
    /NAMES names b, and .* has no page file for it, .*: restore the file .*, or, if the page was deleted on purpose, delete its line from NAMES\.$/.test(
      e.message,
    );
  assert.throws(() => pageFiles(dir), refusal);
  await assert.rejects(loadPages(dir), refusal);
});

test('the shipped pages are refused with one of theirs deleted: the real NAMES, over a copy of the real pages less one, knows it is gone', () => {
  const dir = scratch('hkb-e2e-pages-');
  fs.cpSync(PAGES_DIR, dir, { recursive: true });
  const gone = pageFiles(dir)[0];
  fs.rmSync(path.join(dir, gone));
  assert.throws(
    () => pageFiles(dir),
    (e: Error) => new RegExp(`NAMES names ${gone.slice(4, -3)}, and .* has no page file for it`).test(e.message),
  );
});

test('a page NAMES does not name is refused', async () => {
  const dir = dirOf({ '010-a.ts': page('a'), '020-b.ts': page('b'), [NAMES]: 'a\n' });
  const refusal = (e: Error) => /^020-b\.ts is a page .*NAMES does not name: add a line for each \(b\)/.test(e.message);
  assert.throws(() => pageFiles(dir), refusal);
  await assert.rejects(loadPages(dir), refusal);
});

test('pages/ without NAMES is refused', () => {
  const dir = dirOf({ '010-a.ts': page('a') });
  fs.rmSync(path.join(dir, NAMES));
  assert.throws(
    () => pageFiles(dir),
    (e: Error) => /NAMES is not there, and it says which pages the e2e visits/.test(e.message),
  );
});

test('NAMES is read a name a line, in any order, blank lines and spaces aside', () => {
  const dir = dirOf({ '010-a.ts': page('a'), '020-b.ts': page('b'), [NAMES]: '\n  b \n\na\n' });
  assert.deepEqual(pageFiles(dir), ['010-a.ts', '020-b.ts']);
});

test('pages/ refuses a folder, and a link, however they are named', () => {
  const dir = dirOf({ '010-a.ts': page('a') });
  fs.mkdirSync(path.join(dir, '020-more.ts'));
  fs.symlinkSync(path.join(dir, '010-a.ts'), path.join(dir, '030-again.ts'));
  fs.rmSync(path.join(dir, NAMES));
  fs.symlinkSync(path.join(dir, '010-a.ts'), path.join(dir, NAMES));
  assert.throws(
    () => pageFiles(dir),
    (e: Error) => /would never visit 020-more\.ts, 030-again\.ts, NAMES\./.test(e.message),
  );
});

test('a page is refused when its file exports none', async () => {
  const dir = dirOf({ '010-a.ts': 'export const spec = { name: "a", route: "/", expect: async () => {} };\n' });
  await assert.rejects(loadPages(dir), (e: Error) => e.message.startsWith('010-a.ts default-exports its page'));
});

test("a page is refused when its name is not its file's, which names its screenshots", async () => {
  const dir = dirOf({ '010-a.ts': page('b') });
  await assert.rejects(loadPages(dir), (e: Error) =>
    /^010-a\.ts is the a page, .* it says it is b: make the two the same\.$/.test(e.message),
  );
});

test('a page is refused the second time it is there, under another number', async () => {
  const dir = dirOf({ '010-a.ts': page('a'), '020-b.ts': page('b'), '030-a.ts': page('a') });
  await assert.rejects(loadPages(dir), (e: Error) =>
    e.message.startsWith('010-a.ts and 030-a.ts are both the a page, which would be visited twice'),
  );
});

test('an empty pages/ is refused: an e2e that visits nothing passes', async () => {
  await assert.rejects(loadPages(dirOf({})), (e: Error) => /has no page in it/.test(e.message));
});
