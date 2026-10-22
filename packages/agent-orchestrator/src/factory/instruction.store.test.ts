/**
 * A factory's instruction and its rules on disk, as tables: what `nemia factory instruction` and `nemia factory instruct` refuse — each
 * row refused by kind (`_tag`), exit 2 and the facts its words name, the record and the store unchanged — and the guards both files
 * are read through, shared: a frontmatter block, a link, a directory, a path that climbs out, each read with why and never written
 * through.
 *
 * The instruction kept in a folder and in the store, written and cleared, and the rules told and frozen, are a person's story in
 * `test/factory-rules.test.ts`; their removal with the factory, in `test/factory-start.test.ts`. `WF_ROOT` is set before the import,
 * since the modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-instruction-');
const FACTORIES = path.join(ROOT, 'factories');

process.env.WF_ROOT = ROOT;
const {
  readFactories,
  setInstruction,
  FACTORY_INSTRUCT,
  FACTORY_INSTRUCTION,
  factoryInstruction,
  runWith: runEngine,
} = await import('../runner.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
const { readInstructionAt, writeInstructionText } = await import('./instruction.store.ts');
const { clearRules, readRules, writeRules } = await import('../rules/rules.store.ts');
const { main: cli } = await import('../cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

/** Refused by kind, exit 2, and the facts its words name — never its sentence. */
const refused =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Error & { exitCode?: number; _tag?: string }): true => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true;
  };

const recordOf = (name: string) => path.join(FACTORIES, `${name}.json`);
const storeFolder = (name: string) => path.join(FACTORIES, name);

/** A fresh store with the factory `pipao` filed on a new folder, its record holding `extra` beside its repository: the folder. */
function filed(extra: Record<string, unknown> = {}): string {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(FACTORIES, { recursive: true });
  fs.writeFileSync(recordOf('pipao'), JSON.stringify({ repos: [repo], ...extra }));
  return repo;
}

test('REFUSED: `nemia factory instruction`, the record unchanged', async (t) => {
  const rows: Array<[string, () => unknown, 'Missing' | 'Conflict' | 'Invalid', string[]]> = [
    ['the default factory', () => setInstruction({ factory: 'default', at: { store: true } }), 'Conflict', ['nemia factory instruction']],
    [
      'the default factory, by its handler',
      () => runWith(noEngine(), FACTORY_INSTRUCTION.handler({ factory: 'default' })),
      'Conflict',
      ['nemia factory instruction'],
    ],
    ['a name with no factory', () => setInstruction({ factory: 'nope', at: { store: true } }), 'Missing', ['nope', 'pipao']],
    ['a record that does not read', () => setInstruction({ factory: 'torn', at: { store: true } }), 'Invalid', ['torn', 'JSON']],
    ['an absolute path', () => setInstruction({ factory: 'pipao', at: { path: '/etc/passwd' } }), 'Invalid', ['`/etc/passwd`']],
    ['a path that climbs out', () => setInstruction({ factory: 'pipao', at: { path: '../x' } }), 'Invalid', ['`../x`']],
    [
      'two places at once, by the check, before anything is read',
      () => main(['factory', 'instruction', 'pipao', '--path', 'X.md', '--store'], noEngine()),
      'Invalid',
      ['--path', '--store', '--clear'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    await t.test(row, async () => {
      filed();
      fs.writeFileSync(recordOf('torn'), '{ not json');
      const before = [fs.readFileSync(recordOf('pipao')), fs.readFileSync(recordOf('torn'))];
      await assert.rejects(async () => await act(), refused(tag, ...facts));
      assert.deepEqual([fs.readFileSync(recordOf('pipao')), fs.readFileSync(recordOf('torn'))], before);
    });
  await t.test('a put that names no place, by the check', () =>
    assert.notEqual(FACTORY_INSTRUCTION.check!({ factory: 'pipao', clear: false }), null),
  );
});

test('REFUSED: `nemia factory instruct`, nothing written', async (t) => {
  await t.test('the default factory', async () => {
    await assert.rejects(
      runWith(noEngine(), FACTORY_INSTRUCT.handler({ factory: 'default', words: 'x', clear: false })),
      refused('Conflict', 'nemia factory instruct'),
    );
    assert.ok(!fs.existsSync(storeFolder('default')));
  });
  await t.test(
    "words for an instruction kept in the factory's folder: a Conflict naming the file and the --store, no store folder made",
    async () => {
      const repo = filed();
      await assert.rejects(
        runWith(noEngine(), FACTORY_INSTRUCT.handler({ factory: 'pipao', words: 'x', clear: false })),
        refused('Conflict', path.join(repo, 'NEMIA.md'), 'nemia factory instruction pipao --store'),
      );
      assert.ok(!fs.existsSync(storeFolder('pipao')), 'no store folder');
    },
  );
  await t.test('blank words', () => {
    filed({ instruction: { store: true } });
    assert.throws(() => writeInstructionText('pipao', ' \n'), refused('Invalid', 'pipao'));
    assert.ok(!fs.existsSync(path.join(storeFolder('pipao'), 'NEMIA.md')));
  });
});

test('a rules or instruction file that cannot be told is read with why, and never written through', async (t) => {
  const RULES = path.join(storeFolder('pipao'), 'RULES.md');
  const outside = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(outside, 'Words from elsewhere.\n');

  await t.test('rules: a blank file reads as no rules', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.writeFileSync(RULES, '  \n\n');
    assert.deepEqual(readRules(RULES), { words: null, error: null });
  });
  await t.test('rules: a frontmatter block reads with why, the words given beside it to be mended', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.writeFileSync(RULES, '---\nmodel: opus\n---\nBe kind.\n');
    const read = readRules(RULES);
    names(read.error, 'RULES.md', 'frontmatter');
    assert.equal(read.words, '---\nmodel: opus\n---\nBe kind.');
  });
  await t.test('rules: a link is not read, and a write replaces it without touching what it pointed at', () => {
    filed();
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.symlinkSync(outside, RULES);
    const linked = readRules(RULES);
    assert.equal(linked.words, null);
    names(linked.error, 'RULES.md', 'link');
    writeRules({ name: 'pipao' }, 'Our own words.');
    assert.equal(fs.lstatSync(RULES).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Words from elsewhere.\n', 'never written through');
    assert.deepEqual(readRules(RULES), { words: 'Our own words.', error: null });
  });
  await t.test('rules: a directory reads with why, and a clear removes whatever is there', () => {
    filed();
    fs.mkdirSync(RULES, { recursive: true });
    names(readRules(RULES).error, 'RULES.md', 'not a file');
    assert.equal(clearRules({ name: 'pipao' }), true);
    assert.equal(fs.existsSync(RULES), false);
  });
  await t.test('instruction in the store: a link is read with why, and a write replaces it without touching what it pointed at', () => {
    filed({ instruction: { store: true } });
    fs.mkdirSync(storeFolder('pipao'), { recursive: true });
    fs.symlinkSync(outside, path.join(storeFolder('pipao'), 'NEMIA.md'));
    names(factoryInstruction('pipao').error, 'link');
    writeInstructionText('pipao', 'mine');
    assert.equal(fs.readFileSync(outside, 'utf8'), 'Words from elsewhere.\n');
    assert.ok(!fs.lstatSync(path.join(storeFolder('pipao'), 'NEMIA.md')).isSymbolicLink());
  });
  await t.test('instruction in the folder: a link leading outside it does not read; one that stays inside reads', () => {
    const repo = filed();
    const secret = path.join(ROOT, 'secret.md');
    fs.writeFileSync(secret, 'secret\n');
    fs.symlinkSync(secret, path.join(repo, 'NEMIA.md'));
    const escaped = factoryInstruction('pipao');
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
  await t.test('instruction: a path written by hand that climbs out of the folder is not read', () => {
    const repo = filed({ instruction: { path: '../secret.md' } });
    fs.writeFileSync(path.join(path.dirname(repo), 'secret.md'), 'secret\n');
    const answer = factoryInstruction('pipao');
    assert.equal(answer.words, null);
    names(answer.error, 'inside');
  });
  await t.test('instruction: a record whose instruction is no path nor the store is listed with why, never thrown', () => {
    filed({ instruction: 5 });
    fs.writeFileSync(recordOf('half'), JSON.stringify({ repos: ['/x'], instruction: { store: false } }));
    assert.deepEqual(
      readFactories().map((l) => ('error' in l ? [l.name, l.error.includes('`instruction')] : [l.name, 'read'])),
      [
        ['half', true],
        ['pipao', true],
      ],
    );
  });
});
