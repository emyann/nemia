/**
 * A factory's rules on disk (`rules.store.ts`): written trimmed and read back, cleared, a link neither read nor written through, the
 * refusals of a write — blank words, a frontmatter block, a tree not rendered yet — each writing nothing, and the folder gone with its
 * factory. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-rules-store-');
process.env.WF_ROOT = ROOT;
const { clearRules, readRules, rulesAt, rulesFolder, writeRules } = await import('./rules.store.ts');
const { addFactory } = await import('../factory/factory.store.ts');
const { FACTORIES } = await import('../factory/factory.verb.ts');
const { runWith: runEngine, gitPlaceLayer, engine } = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

const PIPAO = { name: 'pipao' };
const FILE = path.join(ROOT, 'factories', 'pipao', 'RULES.md');

test("a factory's rules are kept in the store's folder for it; written trimmed, read back, and cleared", () => {
  assert.equal(rulesAt(PIPAO), FILE);
  assert.deepEqual(readRules(FILE), { words: null, error: null }, 'no file: no rules, and nothing wrong');
  assert.equal(writeRules(PIPAO, '\n\nNever push on a Friday.\n\n'), FILE);
  assert.equal(fs.readFileSync(FILE, 'utf8'), 'Never push on a Friday.\n');
  assert.deepEqual(readRules(FILE), { words: 'Never push on a Friday.', error: null });
  assert.equal(clearRules(PIPAO), true);
  assert.equal(fs.existsSync(FILE), false);
  assert.equal(clearRules(PIPAO), false, 'nothing to remove the second time');
});

test('a blank file reads as no rules; a link is not read, and a write replaces it without touching what it pointed at', () => {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, '  \n\n');
  assert.deepEqual(readRules(FILE), { words: null, error: null });
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');
  fs.rmSync(FILE);
  fs.symlinkSync(outside, FILE);
  const linked = readRules(FILE);
  assert.equal(linked.words, null);
  assert.match(linked.error ?? '', /RULES\.md is a link, and the store keeps its own file/);
  writeRules(PIPAO, 'Our own words.');
  assert.equal(fs.lstatSync(FILE).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(outside, 'utf8'), 'Words from elsewhere.\n', 'never written through');
  assert.deepEqual(readRules(FILE), { words: 'Our own words.', error: null });
  clearRules(PIPAO);
});

test('a directory at the file, and a file that opens with frontmatter, read with why they cannot be told', () => {
  fs.mkdirSync(FILE, { recursive: true });
  assert.match(readRules(FILE).error ?? '', /RULES\.md is not a file/);
  assert.equal(clearRules(PIPAO), true, 'a clear removes whatever is there');
  fs.writeFileSync(FILE, '---\nmodel: opus\n---\nBe kind.\n');
  const read = readRules(FILE);
  assert.match(read.error ?? '', /opens with a frontmatter block/);
  assert.equal(read.words, '---\nmodel: opus\n---\nBe kind.', 'the words are given beside the refusal, to be mended');
  clearRules(PIPAO);
});

test('REFUSED, nothing written: blank rules, rules that open with a frontmatter block, and a bad name', () => {
  assert.throws(
    () => writeRules(PIPAO, ' \n '),
    refusedWith('Invalid', /^the rules of pipao are blank\. .* nemia factory rules pipao --clear\. Nothing was written\.$/),
  );
  assert.throws(
    () => writeRules(PIPAO, '---\nallowedTools: Bash\n---\nUse Bash.\n'),
    refusedWith('Invalid', /RULES\.md opens with a frontmatter block.* Nothing was written\.$/),
  );
  assert.equal(fs.existsSync(FILE), false);
  assert.throws(() => rulesFolder('../up'), refusedWith('Invalid', /is not a factory's name/));
});

test('REFUSED: the rules of a templated factory whose tree is not rendered yet; once it is, they are written in the tree', () => {
  const tree = path.join(ROOT, 'factories', 'made', 'tree');
  const made = { name: 'made', tree };
  assert.throws(
    () => writeRules(made, 'Be kind.'),
    refusedWith('Conflict', /^made is made from a template, and its tree is not rendered yet, at .*tree: .* Nothing was written\.$/),
  );
  assert.equal(fs.existsSync(tree), false);
  fs.mkdirSync(tree, { recursive: true });
  assert.equal(writeRules(made, 'Be kind.'), path.join(tree, 'RULES.md'));
  assert.deepEqual(readRules(rulesAt(made)), { words: 'Be kind.', error: null });
});

test('`nemia factory rm` leaves no rules behind: the folder the store keeps for the factory goes with it', async () => {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  addFactory({ name: 'gone', repos: [repo] });
  const file = writeRules({ name: 'gone' }, 'Be kind.');
  const rm = FACTORIES.find((c) => c.name === 'factory rm')!;
  await runWith(engine(), rm.handler({ factory: 'gone' }));
  assert.equal(fs.existsSync(file), false);
  assert.equal(fs.existsSync(path.dirname(file)), false);
});
