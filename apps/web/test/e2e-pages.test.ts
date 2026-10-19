/**
 * The e2e's list of pages is the directory `e2e/pages/` (pages.ts): every file there visited, each once, in the order of their names, and
 * anything else there refused, since the runner would never visit it; and `pages/NAMES` says which pages there are, so one deleted by
 * mistake is refused too. No browser, so `npm test` runs it; the tests in `e2e/` are the ones that need Chromium.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { loadPages, NAMES, namesIn, orderOf, PAGES_DIR, pageFiles, planOf, shardOf } from './e2e/pages.ts';
import { scratch } from './scratch.ts';

/**
 * A directory of pages: each file's name and what it holds — a page named as given, or any text. And a NAMES naming each file that is named
 * as a page is, unless `files` gives one of its own.
 */
function dirOf(files: Record<string, string>): string {
  const dir = scratch('nemia-e2e-pages-');
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

test('the runner and its workers visit what loadPages reads, and no list of their own', () => {
  const read = (file: string) => fs.readFileSync(path.join(import.meta.dirname, 'e2e', file), 'utf8');
  const runner = read('run.ts');
  const worker = read('worker.ts');
  assert.match(runner, /const pages = await loadPages\(\);\s*const plan = planOf\(process\.argv\.slice\(2\), pages\);/);
  assert.match(runner, /const queue = queueOf\(plan\.visit\.map\(\(p\) => p\.name\)\);/, 'the runner hands out the pages of its plan');
  assert.match(worker, /const plan = planOf\(rest, await loadPages\(\)\);/, 'a worker knows the pages by what loadPages reads');
  assert.match(
    worker,
    /for await \(const page of pagesOf\(plan\.visit, seat\.worker\)\)/,
    'a worker visits the pages of its plan it is handed',
  );
  assert.match(
    worker,
    /visitAll\(browser, base, \[page\], OUT, \{\s*store: root,\s*themes: plan\.themes,\s*pictured: plan\.pictured,/,
    'a worker visits each page, and hands the store its api serves too, so a store swept from under the e2e is said, not blamed on a page (`storeGone`)',
  );
  for (const [file, text] of [
    ['run.ts', runner],
    ['worker.ts', worker],
  ]) {
    assert.doesNotMatch(text, /from '\.\/pages\//, `${file} imports no page by its file`);
    assert.doesNotMatch(text, /PageSpec\[\]/, `${file} keeps no array of pages`);
  }
});

test('the runner refuses two workers sharing a store, an api or an app, and a worker refuses a store its pages left changed', () => {
  const read = (file: string) => fs.readFileSync(path.join(import.meta.dirname, 'e2e', file), 'utf8');
  const runner = read('run.ts');
  const worker = read('worker.ts');
  assert.match(
    runner,
    /apart\(seats\);\n(?:.*\n)*?\s*results = await Promise\.all\(seats\.map\([^\n]*\n\s*apart\(results\);/,
    'the runner refuses two workers sharing a store before it starts them, and an api or an app once they report theirs',
  );
  assert.match(
    worker,
    /const before = fingerprint\(root\);\n(?:.*\n)*?\s*for await \(const page of pagesOf\([^\n]*\n(?:.*\n)*?\s*const left = leftOver\(before, fingerprint\(root\), visited\);\s*if \(left\) throw new Error\(/,
    'a worker prints its store before its first page, and fails when its pages leave it other than it was (`leftOver`)',
  );
});

test('a worker that exits other than 0 stops the queue: no worker starts another page', () => {
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'e2e', 'run.ts'), 'utf8');
  assert.match(
    runner,
    /child\.on\('exit', \(code, signal\) => \{\s*if \(code !== 0\) queue\.stop\(\);/,
    'a worker that failed, or was killed, stops the queue the moment it exits',
  );
});

test('a whole run whose pages cost more than their bound fails: the runner throws what overBound says of them, never of its own time', () => {
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'e2e', 'run.ts'), 'utf8');
  assert.match(
    runner,
    /async function main\(\): Promise<void> \{\s*const started = performance\.now\(\);/,
    'the runner starts its clock first, so the time it says covers the whole run',
  );
  assert.match(
    runner,
    /const late = overBound\(timings, plan\.whole\);\s*if \(late\) throw new Error\(late\);/,
    'the runner holds a whole run to the bound of its pages, and fails with what overBound says',
  );
});

test("a whole run that took longer than a step's tool allows passes: the runner says what pastTool says, and throws nothing after it", () => {
  const runner = fs.readFileSync(path.join(import.meta.dirname, 'e2e', 'run.ts'), 'utf8');
  assert.match(
    runner,
    /const totalMs = performance\.now\(\) - started;[\s\S]*?const slow = pastTool\(totalMs, results\.length, plan\.whole\);\s*if \(slow\) console\.log\(/,
    'the time the whole run took is said, by the workers it got',
  );
  const after = runner.slice(runner.indexOf('const slow = pastTool('), runner.indexOf('exitOn(main()'));
  assert.ok(after.includes('pages passed in the'), 'the pass line is said after it, last');
  assert.doesNotMatch(after, /\bthrow\b/, 'nothing is refused once the pages passed their bound');
});

test('no page imports run.ts or worker.ts, which would start the whole e2e as the pages load', () => {
  for (const file of pageFiles())
    assert.doesNotMatch(fs.readFileSync(path.join(PAGES_DIR, file), 'utf8'), /from '\.\.\/(?:run|worker)\.ts'/, file);
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
  const dir = scratch('nemia-e2e-pages-');
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

/** Three pages, in the order they are visited, for a plan to choose from. */
const ABC = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];
const namesOf = (pages: readonly { name: string }[]): string[] => pages.map((p) => p.name);
const picturedOf = (plan: { pictured: (name: string) => boolean }): string[] => namesOf(ABC).filter((name) => plan.pictured(name));

test('the e2e visits every page once, in the dark theme, and pictures none, unless it is asked otherwise', () => {
  const plan = planOf([], ABC);
  assert.deepEqual(namesOf(plan.visit), ['a', 'b', 'c']);
  assert.deepEqual(plan.themes, ['dark']);
  assert.deepEqual(picturedOf(plan), []);
});

test('--photos visits every page in light, then dark, and pictures each', () => {
  const plan = planOf(['--photos'], ABC);
  assert.deepEqual(namesOf(plan.visit), ['a', 'b', 'c']);
  assert.deepEqual(plan.themes, ['light', 'dark']);
  assert.deepEqual(picturedOf(plan), ['a', 'b', 'c']);
});

test('--pages visits only the pages named, in the order of the pages, and --photos pictures only those', () => {
  const photos = planOf(['--photos', '--pages', 'b'], ABC);
  assert.deepEqual(namesOf(photos.visit), ['b'], 'a page reads only the seed and what it writes itself: no page before it is visited');
  assert.deepEqual(photos.themes, ['light', 'dark']);
  assert.deepEqual(picturedOf(photos), ['b']);
  const named = planOf(['--pages', 'c,a'], ABC);
  assert.deepEqual(namesOf(named.visit), ['a', 'c'], 'in the order of the pages, not of the names, and b left out');
  assert.deepEqual(named.themes, ['dark']);
  assert.deepEqual(picturedOf(named), [], 'no picture without --photos');
  assert.deepEqual(picturedOf(planOf(['--pages', 'a,c', '--photos'], ABC)), ['a', 'c'], 'in either order of the flags');
});

test('--contrast measures what --photos pictures, and is refused without it, saying to add --photos', () => {
  assert.equal(planOf(['--photos', '--contrast'], ABC).measured, true);
  assert.deepEqual(planOf(['--contrast', '--photos', '--pages', 'b'], ABC).themes, ['light', 'dark']);
  assert.equal(planOf(['--photos'], ABC).measured, false);
  assert.equal(planOf([], ABC).measured, false);
  assert.throws(
    () => planOf(['--contrast'], ABC),
    (e: Error) => /^--contrast measures what is pictured.*npm run e2e -- --photos --contrast$/.test(e.message),
  );
  assert.throws(
    () => planOf(['--contrast', '--pages', 'b'], ABC),
    (e: Error) => e.message.includes('--photos'),
  );
});

test('only a run of every page in the dark theme is whole, the run a check makes and holds to its bound', () => {
  assert.equal(planOf([], ABC).whole, true);
  assert.equal(planOf(['--workers', '2'], ABC).whole, true, 'however many workers');
  assert.equal(planOf(['--photos'], ABC).whole, false);
  assert.equal(planOf(['--pages', 'a,b,c'], ABC).whole, false, 'a run of pages named, even all of them');
});

test('--workers says how many workers visit the pages; without it the machine says', () => {
  assert.equal(planOf(['--workers', '3'], ABC).workers, 3);
  assert.equal(planOf(['--pages', 'b', '--workers', '1'], ABC).workers, 1);
  assert.equal(planOf([], ABC).workers, undefined);
});

test('REFUSED: --workers with no whole number of one or more after it', () => {
  for (const argv of [['--workers'], ['--workers', '0'], ['--workers', 'x'], ['--workers', '1.5'], ['--workers', '--photos']]) {
    assert.throws(
      () => planOf(argv, ABC),
      (e: Error) => e.message.startsWith('--workers takes a whole number of workers, one or more (--workers 4), not '),
      argv.join(' '),
    );
  }
});

test('REFUSED: a page --pages names that there is not, naming it and the pages there are', () => {
  assert.throws(
    () => planOf(['--photos', '--pages', 'b,nope'], ABC),
    (e: Error) => /^the e2e has no page nope: name pages there are, as pages\/NAMES lists them: a, b, c$/.test(e.message),
  );
});

test('REFUSED: --pages with no page after it', () => {
  for (const argv of [['--pages'], ['--pages', '--photos'], ['--pages', ',']]) {
    assert.throws(
      () => planOf(argv, ABC),
      (e: Error) => e.message.startsWith('--pages names no page: give it the pages to visit, separated by commas'),
      argv.join(' '),
    );
  }
});

test('REFUSED: a flag the e2e does not know', () => {
  assert.throws(
    () => planOf(['--colour'], ABC),
    (e: Error) =>
      /^the e2e takes --photos, --contrast, --pages <name,…>, --workers <n> and --shard <i> --of <n>, not --colour\b/.test(e.message),
  );
  assert.throws(
    () => planOf(['b'], ABC),
    (e: Error) => /^the e2e takes --photos, --contrast, --pages <name,…>, --workers <n> and --shard <i> --of <n>, not b\b/.test(e.message),
  );
});

test('the shards deal every page into exactly one of them, in the pages’ order, within one page of each other', async () => {
  const pages = await loadPages();
  const all = pages.map((p) => p.name);
  for (const n of [1, 2, 3, 4, 7, all.length]) {
    const shards = Array.from({ length: n }, (_, i) => shardOf(pages, i + 1, n).map((p) => p.name));
    const dealt = shards.flat();
    assert.equal(dealt.length, all.length, `of ${n}: every page is dealt once, and ${dealt.length} were dealt of ${all.length}`);
    assert.deepEqual(orderOf(dealt), orderOf(all), `of ${n}: the shards together are the pages, each once`);
    for (const shard of shards)
      assert.deepEqual(
        shard,
        all.filter((name) => shard.includes(name)),
        `of ${n}: a shard keeps the pages’ order`,
      );
    const sizes = shards.map((shard) => shard.length);
    assert.ok(
      Math.max(...sizes) - Math.min(...sizes) <= 1,
      `of ${n}: the shares are within one page of each other, and were ${sizes.join(', ')}`,
    );
  }
});

test('--shard <i> --of <n> visits that shard and is no whole run, so the bound is silent inside it', async () => {
  const pages = await loadPages();
  const plan = planOf(['--shard', '2', '--of', '4'], pages);
  assert.deepEqual(
    plan.visit.map((p) => p.name),
    shardOf(pages, 2, 4).map((p) => p.name),
  );
  assert.equal(
    plan.whole,
    false,
    'a shard is a run of some pages: its pages are not the whole e2e’s, and summing them would refuse nothing',
  );
  assert.deepEqual(
    plan.shard,
    { i: 2, of: 4 },
    'the plan says which shard it is, so the run can write its page times down under that name',
  );
  assert.deepEqual(plan.themes, ['dark'], 'a shard runs the assertions, in the dark theme, as a whole run does');
  assert.equal(
    plan.visit.some((p) => plan.pictured(p.name)),
    false,
    'a shard pictures nothing without --photos',
  );
  assert.equal(planOf([], pages).shard, undefined, 'a run that is no shard says so by having none');
  assert.equal(planOf(['--shard', '1', '--of', '1'], pages).visit.length, pages.length, 'one shard of one visits every page');
  assert.equal(planOf(['--shard', '1', '--of', '1'], pages).whole, false, 'and is still no whole run: --shard says a subset was asked for');
});

test('REFUSED: --shard without --of, and --of without --shard', () => {
  assert.throws(
    () => planOf(['--shard', '2'], ABC),
    (e: Error) =>
      e.message === '--shard 2 says which shard to visit, and --of says how many shards there are: give both (--shard 2 --of 4)',
  );
  assert.throws(
    () => planOf(['--of', '4'], ABC),
    (e: Error) =>
      e.message === '--of 4 says how many shards there are, and --shard says which of them to visit: give both (--shard 1 --of 4)',
  );
});

test('REFUSED: a shard past the shards there are, and an --of past the pages there are', () => {
  assert.throws(
    () => planOf(['--shard', '5', '--of', '4'], ABC),
    (e: Error) => e.message === '--shard 5 is no shard of 4: name a shard from 1 to 4 (--shard 1 --of 4)',
  );
  assert.throws(
    () => planOf(['--shard', '1', '--of', '200'], ABC),
    (e: Error) =>
      e.message ===
      '--of 200 asks for more shards than the e2e has pages (3), and a shard of them would visit nothing: give --of 3 at most',
  );
});

test('REFUSED: --shard or --of with no whole number of one or more after it', () => {
  for (const argv of [['--shard'], ['--shard', '0'], ['--shard', 'x'], ['--shard', '1.5'], ['--shard', '--of']]) {
    assert.throws(
      () => planOf([...argv, '--of', '2'], ABC),
      (e: Error) => e.message.startsWith('--shard takes the whole number of one shard, one or more (--shard 1 --of 4), not '),
      argv.join(' '),
    );
  }
  for (const argv of [['--of'], ['--of', '0'], ['--of', 'x'], ['--of', '1.5'], ['--of', '--shard']]) {
    assert.throws(
      () => planOf(['--shard', '1', ...argv], ABC),
      (e: Error) => e.message.startsWith('--of takes the whole number of shards, one or more (--shard 1 --of 4), not '),
      argv.join(' '),
    );
  }
});
