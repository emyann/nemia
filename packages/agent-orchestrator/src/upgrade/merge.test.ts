/**
 * A templated factory's tree merged three ways: a file compared whole first, `factory.json` by key, a markdown file's frontmatter by key
 * and its body by line, a clash of whole files at its path; the person's choices composed; versions ordered by number; and the plan.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, compose, conflictCut, diff3Lines, linesOf, mergeTrees, planLines, type TreeFile } from './index.ts';

/** A tree of text files, by path. */
const tree = (files: Record<string, string>): TreeFile[] =>
  Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

/** The tree a merge composes, by path and text; refused where a conflict is left pending. */
function composed(...args: Parameters<typeof compose>): Record<string, string> {
  const out = compose(...args);
  assert.ok('entries' in out, `composed: ${JSON.stringify(out)}`);
  return Object.fromEntries(out.entries.map((e) => [e.path, e.bytes.toString()]));
}

/** A step file: its frontmatter, then its body. */
const step = (head: string, body: string) => `---\nname: review\n${head}---\n${body}`;

test("a templated factory's tree merged three ways, row by row: by file, by key, by line, composed, ordered and planned", async (t) => {
  await t.test(
    'a file one side changed is taken from it, the same change once, and a delete by the template where the tree kept base',
    () => {
      const base = tree({ 'a.md': 'a\n', 'b.md': 'b\n', 'c.md': 'c\n', 'd.md': 'd\n', 'e.md': 'e\n' });
      const ours = tree({ 'a.md': 'a\n', 'b.md': 'B\n', 'c.md': 'C\n', 'd.md': 'd\n', 'e.md': 'e\n' });
      const theirs = tree({ 'a.md': 'A\n', 'b.md': 'b\n', 'c.md': 'C\n', 'e.md': 'e\n', 'f.md': 'f\n' });
      const merge = mergeTrees(base, ours, theirs);
      assert.deepEqual(merge.merged, [
        { at: 'a.md', from: 'template' },
        { at: 'b.md', from: 'factory' },
        { at: 'c.md', from: 'both' },
        { at: 'd.md', from: 'template' },
        { at: 'f.md', from: 'template' },
      ]);
      assert.deepEqual(merge.conflicts, []);
      assert.deepEqual(composed(merge, {}), { 'a.md': 'A\n', 'b.md': 'B\n', 'c.md': 'C\n', 'e.md': 'e\n', 'f.md': 'f\n' });
    },
  );
  await t.test('a delete against a change, an add against another add, and two binaries changed apart conflict on the whole file', () => {
    const bin = (...bytes: number[]) => Buffer.from([0, ...bytes]);
    const base = [...tree({ 'gone.md': 'x\n' }), { path: 'p.bin', bytes: bin(1) }];
    const ours = [...tree({ 'new.md': 'mine\n' }), { path: 'p.bin', bytes: bin(2) }];
    const theirs = [...tree({ 'gone.md': 'y\n', 'new.md': 'theirs\n' }), { path: 'p.bin', bytes: bin(3) }];
    const merge = mergeTrees(base, ours, theirs);
    assert.deepEqual(merge.conflicts, [
      { at: 'gone.md', base: 'x\n', ours: null, theirs: 'y\n' },
      { at: 'new.md', base: null, ours: 'mine\n', theirs: 'theirs\n' },
      { at: 'p.bin', base: '(2 bytes, not text)', ours: '(2 bytes, not text)', theirs: '(2 bytes, not text)' },
    ]);
    const out = compose(merge, { 'gone.md': 'ours', 'new.md': { text: 'both\n' }, 'p.bin': 'theirs' });
    assert.ok('entries' in out);
    assert.deepEqual(
      out.entries.map((e) => [e.path, e.bytes]),
      [
        ['new.md', Buffer.from('both\n')],
        ['p.bin', bin(3)],
      ],
      'ours deleted it, so choosing ours deletes it; a binary chosen is its bytes, never its quote',
    );
  });
  await t.test(
    "a step's frontmatter merges by key: adjacent keys changed on each side are both kept, where a merge by line conflicts",
    () => {
      const base = step('budget: 5\nmodel: opus\n', 'Review it.\n');
      const ours = step('budget: 9\nmodel: opus\n', 'Review it.\n');
      const theirs = step('budget: 5\nmodel: sonnet\n', 'Review it.\n');
      assert.ok(
        diff3Lines(linesOf(base), linesOf(ours), linesOf(theirs)).some((segment) => 'conflict' in segment),
        'a merge by line alone conflicts on adjacent lines',
      );
      const merge = mergeTrees(tree({ 'w/review.md': base }), tree({ 'w/review.md': ours }), tree({ 'w/review.md': theirs }));
      assert.deepEqual(merge.conflicts, []);
      assert.deepEqual(composed(merge, {}), { 'w/review.md': step('budget: 9\nmodel: sonnet\n', 'Review it.\n') });
      const clash = mergeTrees(
        tree({ 'w/review.md': base }),
        tree({ 'w/review.md': ours }),
        tree({ 'w/review.md': step('budget: 7\nmodel: opus\n', 'Review it.\n') }),
      );
      assert.deepEqual(clash.conflicts, [{ at: 'w/review.md#budget', base: 'budget: 5\n', ours: 'budget: 9\n', theirs: 'budget: 7\n' }]);
      assert.deepEqual(composed(clash, { 'w/review.md#budget': { text: 'budget: 8' } }), {
        'w/review.md': step('budget: 8\nmodel: opus\n', 'Review it.\n'),
      });
    },
  );
  await t.test(
    "a step's frontmatter merges by key where a key's value is on the lines under it: a `check: |-` block and a `tools:` list",
    () => {
      const check = (command: string) => `check: |-\n  npm test\n  ${command}\n`;
      const tools = (...names: string[]) => `tools:\n${names.map((name) => `  - ${name}\n`).join('')}`;
      const base = step(`${check('npm run lint')}${tools('Read', 'Grep')}`, 'Review it.\n');
      const ours = step(`${check('npm run typecheck')}${tools('Read', 'Grep')}`, 'Review it.\n');
      const theirs = step(`${check('npm run lint')}${tools('Read', 'Grep', 'Bash')}`, 'Review it.\n');
      const merge = mergeTrees(tree({ 'w/review.md': base }), tree({ 'w/review.md': ours }), tree({ 'w/review.md': theirs }));
      assert.deepEqual(merge.conflicts, []);
      assert.deepEqual(composed(merge, {}), {
        'w/review.md': step(`${check('npm run typecheck')}${tools('Read', 'Grep', 'Bash')}`, 'Review it.\n'),
      });
      const clash = mergeTrees(
        tree({ 'w/review.md': base }),
        tree({ 'w/review.md': ours }),
        tree({ 'w/review.md': step(`${check('npm run build')}${tools('Read', 'Grep')}`, 'Review it.\n') }),
      );
      assert.deepEqual(
        clash.conflicts.map((c) => [c.at, c.ours, c.theirs]),
        [['w/review.md#check', check('npm run typecheck'), check('npm run build')]],
        'the block conflicts as one key, its lines with it',
      );
    },
  );
  await t.test("a step's body merges by line, a conflict addressed by the file's base lines", () => {
    const base = step('', 'one\ntwo\nthree\n');
    const merge = mergeTrees(
      tree({ 's.md': base }),
      tree({ 's.md': step('', 'one\nmine\nthree\n') }),
      tree({ 's.md': step('', 'one\ntheirs\nthree\n') }),
    );
    assert.deepEqual(merge.conflicts, [{ at: 's.md:5-5', base: 'two\n', ours: 'mine\n', theirs: 'theirs\n' }]);
    assert.equal(linesOf(base)[4], 'two\n', 'line 5 of the base is the line in conflict');
    assert.deepEqual(composed(merge, { 's.md:5-5': 'theirs' }), { 's.md': step('', 'one\ntheirs\nthree\n') });
  });
  await t.test(
    'factory.json merges by key: hires by step and workflows as a set, both sides kept; a hire changed apart conflicts by its step',
    () => {
      const wiring = (workflows: string[], hires: Record<string, string>) => `${JSON.stringify({ workflows, hires }, null, 2)}\n`;
      const base = tree({ 'factory.json': wiring(['dev'], { 'dev/implement': 'implementer' }) });
      const ours = tree({ 'factory.json': wiring(['a', 'dev'], { 'dev/implement': 'implementer', 'dev/review': 'reviewer' }) });
      const theirs = tree({ 'factory.json': wiring(['b', 'dev'], { 'dev/implement': 'implementer', 'dev/land': 'shipper' }) });
      const merge = mergeTrees(base, ours, theirs);
      assert.deepEqual(merge.conflicts, []);
      assert.deepEqual(JSON.parse(composed(merge, {})['factory.json']), {
        workflows: ['a', 'b', 'dev'],
        hires: { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/land': 'shipper' },
      });
      const clash = mergeTrees(
        base,
        tree({ 'factory.json': wiring(['dev'], { 'dev/implement': 'implementer', 'dev/review': 'reviewer' }) }),
        tree({ 'factory.json': wiring([], { 'dev/implement': 'implementer', 'dev/review': 'designer' }) }),
      );
      assert.deepEqual(clash.conflicts, [{ at: 'factory.json#hires.dev/review', base: null, ours: 'reviewer', theirs: 'designer' }]);
      assert.deepEqual(JSON.parse(composed(clash, { 'factory.json#hires.dev/review': 'theirs' })['factory.json']), {
        workflows: [],
        hires: { 'dev/implement': 'implementer', 'dev/review': 'designer' },
      });
    },
  );
  await t.test('compose waits on every conflict, names those pending, and ignores a choice for an address that is no conflict', () => {
    const merge = mergeTrees(
      tree({ 'a.md': 'a\n', 'b.md': 'b\n' }),
      tree({ 'a.md': 'x\n', 'b.md': 'y\n' }),
      tree({ 'a.md': 'A\n', 'b.md': 'B\n' }),
    );
    assert.deepEqual(
      merge.conflicts.map((c) => c.at),
      ['a.md:1-1', 'b.md:1-1'],
    );
    const pending = compose(merge, { 'a.md:1-1': 'ours', 'c.md': 'theirs' });
    assert.ok('pending' in pending);
    assert.deepEqual(
      pending.pending.map((c) => c.at),
      ['b.md:1-1'],
    );
    assert.deepEqual(composed(merge, { 'a.md:1-1': 'ours', 'b.md:1-1': 'theirs', 'c.md': 'theirs' }), { 'a.md': 'x\n', 'b.md': 'B\n' });
  });
  await t.test('versions are ordered by number, so 1.10.0 is above 1.9.0', () => {
    assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
    assert.ok(compareVersions('0.9.0', '1.0.0') < 0);
    assert.equal(compareVersions('1.2.3', '1.2.3'), 0);
  });
  await t.test(
    'the plan says what merges and each conflict with its sides and the line that resolves it; a status keeps a side cut',
    () => {
      const merge = mergeTrees(
        tree({ 'a.md': 'a\n', 'b.md': 'b\n' }),
        tree({ 'a.md': 'x\n', 'b.md': 'b\n' }),
        tree({ 'a.md': 'A\n', 'b.md': 'B\n' }),
      );
      assert.deepEqual(planLines('made', '1.0.0', '1.1.0', merge), [
        'made: 1.0.0 → 1.1.0',
        'merges cleanly: 1',
        '  b.md  from the template',
        'conflicts: 1',
        '  a.md:1-1',
        '    base:',
        '      | a',
        '    ours:',
        '      | x',
        '    theirs:',
        '      | A',
        "    nemia factory resolve made 'a.md:1-1' --ours|--theirs|--file <path>",
        'nemia factory upgrade made --to 1.1.0 files it; the daemon merges once each conflict is resolved.',
      ]);
      const long = { at: 'a.md', base: 'x\n'.repeat(5), ours: null, theirs: 'y\n' };
      assert.deepEqual(conflictCut(long, 2), { at: 'a.md', base: 'x\nx\n… 3 more lines: read applied/a.md\n', ours: null, theirs: 'y\n' });
    },
  );
});
