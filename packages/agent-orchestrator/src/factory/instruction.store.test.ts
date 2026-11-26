/**
 * A factory's instruction and its rules on disk, as tables: what `nemia factory instruction` and `nemia factory instruct` refuse — each
 * row refused by kind (`_tag`), exit 2 and the facts its words name, the record and the store unchanged — and the guards both files
 * are read through, shared: a frontmatter block, a link, a directory, a path that climbs out, each read with why and never written
 * through.
 *
 * The instruction kept in a folder and in the store, written and cleared, and the rules told and frozen, are a person's story in
 * `test/factory-rules.test.ts`; their removal with the factory, in `test/factory-start.test.ts`. Its store is at `ROOT`, given as
 * `ENV`.
 */
import { clearFactories } from '../../testing.ts';
import { factoriesNow } from '../../testing.ts';
import { beforeAll, describe, test } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { names } from '../../test/assessed.ts';
import { FACTORY_INSTRUCT, FACTORY_INSTRUCTION, factoryInstruction, runWith as runEngine } from '../runner.ts';
import { readFactoriesAt, setInstructionAt } from '../../testing.ts';
import { readInstructionAt, writeInstructionText } from './instruction.store.ts';
import { clearRules, readRules, writeRules } from './rules/rules.store.ts';
import { typed } from '../../test/typed.ts';
import { engineOf } from '../runtime-client.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-instruction-');
const FACTORIES = path.join(ROOT, 'factories');

const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer, ENV);
/** `nemia <argv>` read by its entry's words and run onto its handler, as the api calls it, given this test's place. */
const main = (argv: string[], e?: Parameters<typeof typed>[1]) => typed(argv, e, undefined, stand().place, ENV);

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** Refused by kind, exit 2, and the facts its words name — never its sentence. */
const refused =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true;
  };

const recordOf = (name: string) => path.join(FACTORIES, `${name}.json`);
const storeFolder = (name: string) => path.join(FACTORIES, name);

/** A fresh store with the factory `pipao` filed on a new folder, its record holding `extra` beside its repository: the folder. */
function filed(extra: Record<string, unknown> = {}) {
  clearFactories(ROOT);
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(FACTORIES, { recursive: true });
  fs.writeFileSync(recordOf('pipao'), JSON.stringify({ volumes: [{ path: repo, readOnly: false }], ...extra }));
  return repo;
}

describe('REFUSED: `nemia factory instruction`, the record unchanged', () => {
  const rows: Array<[string, () => unknown, 'Missing' | 'Conflict' | 'Invalid', string[]]> = [
    [
      'the default factory',
      () => setInstructionAt(ROOT, { factory: 'default', at: { store: true } }),
      'Conflict',
      ['nemia factory instruction'],
    ],
    [
      'the default factory, by its handler',
      () => runWith(noEngine(), FACTORY_INSTRUCTION.handler({ factory: 'default' })),
      'Conflict',
      ['nemia factory instruction'],
    ],
    ['a name with no factory', () => setInstructionAt(ROOT, { factory: 'nope', at: { store: true } }), 'Missing', ['nope', 'pipao']],
    ['a record that does not read', () => setInstructionAt(ROOT, { factory: 'torn', at: { store: true } }), 'Invalid', ['torn', 'JSON']],
    ['an absolute path', () => setInstructionAt(ROOT, { factory: 'pipao', at: { path: '/etc/passwd' } }), 'Invalid', ['`/etc/passwd`']],
    ['a path that climbs out', () => setInstructionAt(ROOT, { factory: 'pipao', at: { path: '../x' } }), 'Invalid', ['`../x`']],
    [
      'two places at once, by the check, before anything is read',
      () => main(['factory', 'instruction', 'pipao', '--path', 'X.md', '--store'], noEngine()),
      'Invalid',
      ['--path', '--store', '--clear'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    test(row, async () => {
      filed();
      fs.writeFileSync(recordOf('torn'), '{ not json');
      const before = [fs.readFileSync(recordOf('pipao')), fs.readFileSync(recordOf('torn'))];
      await assert.rejects(async () => await act(), refused(tag, ...facts));
      assert.deepEqual([fs.readFileSync(recordOf('pipao')), fs.readFileSync(recordOf('torn'))], before);
    });
  test('a put that names no place, by the check', () =>
    assert.notEqual(FACTORY_INSTRUCTION.check!({ factory: 'pipao', clear: false }), null));
});

describe('REFUSED: `nemia factory instruct`, nothing written', () => {
  test('the default factory', async () => {
    await assert.rejects(
      runWith(noEngine(), FACTORY_INSTRUCT.handler({ factory: 'default', words: 'x', clear: false })),
      refused('Conflict', 'nemia factory instruct'),
    );
    assert.ok(!fs.existsSync(storeFolder('default')));
  });
  test("words for an instruction kept in the factory's folder: a Conflict naming the file and the --store, no store folder made", async () => {
    const repo = filed();
    await assert.rejects(
      runWith(noEngine(), FACTORY_INSTRUCT.handler({ factory: 'pipao', words: 'x', clear: false })),
      refused('Conflict', path.join(repo, 'NEMIA.md'), 'nemia factory instruction pipao --store'),
    );
    assert.ok(!fs.existsSync(storeFolder('pipao')), 'no store folder');
  });
  test('blank words', () => {
    filed({ instruction: { store: true } });
    assert.throws(() => writeInstructionText(ROOT, 'pipao', ' \n'), refused('Invalid', 'pipao'));
    assert.ok(!fs.existsSync(path.join(storeFolder('pipao'), 'NEMIA.md')));
  });
});

describe('a rules or instruction file that cannot be told is read with why, and never written through', () => {
  let RULES!: string;
  let outside!: string;
  beforeAll(() => {
    RULES = path.join(storeFolder('pipao'), 'RULES.md');
    outside = path.join(ROOT, 'elsewhere.md');
    fs.writeFileSync(outside, 'Words from elsewhere.\n');
  });
  test('rules: a blank file reads as no rules', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.writeFileSync(RULES, '  \n\n');
    assert.deepEqual(readRules(RULES), { words: null, error: null });
  });
  test('rules: a frontmatter block reads with why, the words given beside it to be mended', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.writeFileSync(RULES, '---\nmodel: opus\n---\nBe kind.\n');
    const read = readRules(RULES);
    names(read.error, 'RULES.md', 'frontmatter');
    assert.equal(read.words, '---\nmodel: opus\n---\nBe kind.');
  });
  test('rules: a link is not read, and a write replaces it without touching what it pointed at', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.symlinkSync(outside, RULES);
    const linked = readRules(RULES);
    assert.equal(linked.words, null);
    names(linked.error, 'RULES.md', 'link');
    writeRules(ROOT, { name: 'pipao' }, 'Our own words.');
    assert.equal(fs.lstatSync(RULES).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Words from elsewhere.\n', 'never written through');
    assert.deepEqual(readRules(RULES), { words: 'Our own words.', error: null });
  });
  test('rules: a directory reads with why, and a clear removes whatever is there', () => {
    filed();
    fs.mkdirSync(RULES, { recursive: true });
    names(readRules(RULES).error, 'RULES.md', 'not a file');
    assert.equal(clearRules(ROOT, { name: 'pipao' }), true);
    assert.equal(fs.existsSync(RULES), false);
  });
  test('instruction in the store: a link is read with why, and a write replaces it without touching what it pointed at', () => {
    filed({ instruction: { store: true } });
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.symlinkSync(outside, path.join(storeFolder('pipao'), 'NEMIA.md'));
    names(factoriesNow(ROOT, factoryInstruction(ROOT, 'pipao')).error, 'link');
    writeInstructionText(ROOT, 'pipao', 'mine');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Words from elsewhere.\n');
    assert.ok(!fs.lstatSync(path.join(storeFolder('pipao'), 'NEMIA.md')).isSymbolicLink());
  });
  test('instruction in the folder: a link leading outside it does not read; one that stays inside reads', () => {
    const repo = filed();
    const secret = path.join(ROOT, 'secret.md');
    fs.writeFileSync(secret, 'secret\n');
    fs.symlinkSync(secret, path.join(repo, 'NEMIA.md'));
    const escaped = factoriesNow(ROOT, factoryInstruction(ROOT, 'pipao'));
    assert.equal(escaped.words, null);
    names(escaped.error, secret);
    fs.writeFileSync(path.join(repo, 'real.md'), 'inside\n');
    fs.rmSync(path.join(repo, 'NEMIA.md'));
    fs.symlinkSync(path.join(repo, 'real.md'), path.join(repo, 'NEMIA.md'));
    assert.deepEqual(readInstructionAt({ in: 'folder', folder: repo, path: 'NEMIA.md', file: path.join(repo, 'NEMIA.md') }), {
      words: 'inside\n',
      error: null,
    });
  });
  test('instruction: a path written by hand that climbs out of the folder is not read', () => {
    const repo = filed({ instruction: { path: '../secret.md' } });
    fs.writeFileSync(path.join(path.dirname(repo), 'secret.md'), 'secret\n');
    const answer = factoriesNow(ROOT, factoryInstruction(ROOT, 'pipao'));
    assert.equal(answer.words, null);
    names(answer.error, 'inside');
  });
  test('instruction: a record whose instruction is no path nor the store is listed with why, never thrown', () => {
    filed({ instruction: 5 });
    fs.writeFileSync(recordOf('half'), JSON.stringify({ volumes: [{ path: '/x', readOnly: false }], instruction: { store: false } }));
    assert.deepEqual(
      readFactoriesAt(ROOT).map((l) => ('error' in l ? [l.name, l.error.includes('`instruction')] : [l.name, 'read'])),
      [
        ['half', true],
        ['pipao', true],
      ],
    );
  });
});
