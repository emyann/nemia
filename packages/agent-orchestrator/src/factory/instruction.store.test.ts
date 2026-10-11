/**
 * A factory's instruction on disk: where its file says it is kept (`setInstruction`, `nemia factory instruction`), the text the store
 * keeps (`nemia factory instruct`), its read in a folder or the store, and its removal with the factory (`nemia factory rm`). `WF_ROOT`
 * is set before the import, since the modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-instruction-');
const FACTORIES = path.join(ROOT, 'factories');

process.env.WF_ROOT = ROOT;
const {
  readFactories,
  readFactory,
  setInstruction,
  FACTORY_INSTRUCT,
  FACTORY_INSTRUCTION,
  factoryInstruction,
  runWith: runEngine,
  gitPlaceLayer,
} = await import('../runner.ts');
const runWith = runOver(runEngine, gitPlaceLayer);
const { readInstructionAt, writeInstructionText } = await import('./instruction.store.ts');
const { main } = await import('../cli/main.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = promised({});

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

type Mocker = { mock: { method: (o: object, m: string, f: (...a: unknown[]) => void) => { mock: { restore: () => void } } } };

/** What `main` printed, line by line, for one verb. */
const printedBy = async (t: Mocker, ...argv: string[]): Promise<string[]> => {
  const printed: string[] = [];
  const log = t.mock.method(console, 'log', (...args: unknown[]) => {
    printed.push(args.join(' '));
  });
  try {
    await main(argv, NO_ENGINE);
  } finally {
    log.mock.restore();
  }
  return printed.join('\n').split('\n');
};

const recordOf = (name: string) => path.join(FACTORIES, `${name}.json`);
const storeFolder = (name: string) => path.join(FACTORIES, name);
const read = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(recordOf(name), 'utf8'));

/** A fresh store with the factory `pipao` filed on a new folder, its record holding `extra` beside its repository: the folder. */
function filed(extra: Record<string, unknown> = {}): string {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  fs.mkdirSync(FACTORIES, { recursive: true });
  fs.writeFileSync(recordOf('pipao'), JSON.stringify({ repos: [repo], ...extra }));
  return repo;
}

test('nemia factory instruction writes where the instruction is kept, every other key of the file kept, and a clear removes the key', () => {
  const repo = filed({ workflows: ['build'], hires: { 'build/implement': 'ada' }, later: { kept: 1 } });
  const others = { repos: [repo], workflows: ['build'], hires: { 'build/implement': 'ada' }, later: { kept: 1 } };
  setInstruction({ factory: 'pipao', at: { path: 'docs/../docs/X.md' } });
  assert.deepEqual(read('pipao'), { ...others, instruction: { path: 'docs/X.md' } });
  setInstruction({ factory: 'pipao', at: { store: true } });
  assert.deepEqual(read('pipao'), { ...others, instruction: { store: true } });
  assert.deepEqual(readFactory('pipao').instruction, { store: true });
  setInstruction({ factory: 'pipao', at: undefined });
  assert.deepEqual(read('pipao'), others);
  assert.ok(!('instruction' in read('pipao')), 'the key removed, never null');
});

test('REFUSED: the default factory, a name with no factory, a record that does not read and an absolute path — the file unchanged', () => {
  filed();
  fs.writeFileSync(recordOf('torn'), '{ not json');
  const before = fs.readFileSync(recordOf('pipao'));
  const tornBefore = fs.readFileSync(recordOf('torn'));
  assert.throws(
    () => setInstruction({ factory: 'default', at: { store: true } }),
    refusedWith('Conflict', /nemia factory instruction does not take it/),
  );
  assert.throws(
    () => setInstruction({ factory: 'nope', at: { store: true } }),
    refusedWith('Missing', /no factory nope in the store.* Nothing was changed\.$/),
  );
  assert.throws(() => setInstruction({ factory: 'torn', at: { store: true } }), refusedWith('Invalid', /is not JSON/));
  assert.throws(
    () => setInstruction({ factory: 'pipao', at: { path: '/etc/passwd' } }),
    refusedWith('Invalid', /is absolute.* Nothing was changed\.$/),
  );
  assert.throws(() => setInstruction({ factory: 'pipao', at: { path: '../x' } }), refusedWith('Invalid', /climbs out/));
  assert.deepEqual(fs.readFileSync(recordOf('pipao')), before);
  assert.deepEqual(fs.readFileSync(recordOf('torn')), tornBefore);
});

test('a record whose instruction is no path nor the store is listed with why, never thrown', () => {
  filed({ instruction: 5 });
  fs.writeFileSync(recordOf('half'), JSON.stringify({ repos: ['/x'], instruction: { store: false } }));
  const listed = readFactories();
  assert.deepEqual(
    listed.map((l) => ('error' in l ? [l.name, /does not read as a factory: `instruction/.test(l.error)] : [l.name, 'read'])),
    [
      ['half', true],
      ['pipao', true],
    ],
  );
});

test('nemia factory instruction, bare: NEMIA.md in the first folder, no words while no file is there, and its words once one is', async (t) => {
  const repo = filed();
  assert.deepEqual(factoryInstruction('pipao'), {
    name: 'pipao',
    path: null,
    store: false,
    file: path.join(repo, 'NEMIA.md'),
    words: null,
    error: null,
    stored: false,
  });
  fs.writeFileSync(path.join(repo, 'NEMIA.md'), 'Ship small.\n');
  assert.equal(factoryInstruction('pipao').words, 'Ship small.\n');
  assert.deepEqual(await printedBy(t, 'factory', 'instruction', 'pipao'), [
    `pipao: read from ${path.join(repo, 'NEMIA.md')}, in the factory's first folder`,
    '',
    'Ship small.',
    '',
  ]);
});

test('REFUSED: two places at once, by the check, before anything is read or written', async () => {
  filed();
  const before = fs.readFileSync(recordOf('pipao'));
  await assert.rejects(
    main(['factory', 'instruction', 'pipao', '--path', 'X.md', '--store'], NO_ENGINE),
    refusedWith('Invalid', /takes one of --path, --store and --clear/),
  );
  assert.equal(FACTORY_INSTRUCTION.check!({ factory: 'pipao', clear: false }) !== null, true, 'a put that names no place is refused');
  assert.deepEqual(fs.readFileSync(recordOf('pipao')), before);
});

test("REFUSED: words for an instruction kept in the factory's folder — Conflict, naming the file, and no store folder made", async () => {
  const repo = filed();
  await assert.rejects(
    runWith(NO_ENGINE, FACTORY_INSTRUCT.handler({ factory: 'pipao', words: 'x', clear: false })),
    refusedWith(
      'Conflict',
      new RegExp(`read from ${path.join(repo, 'NEMIA.md')}.*nemia factory instruction pipao --store\\. Nothing was written\\.$`),
    ),
  );
  assert.ok(!fs.existsSync(storeFolder('pipao')), 'no store folder');
  setInstruction({ factory: 'pipao', at: { store: true } });
  const written = await runWith(NO_ENGINE, FACTORY_INSTRUCT.handler({ factory: 'pipao', words: '  Ship small.  ', clear: false }));
  assert.equal(written.words, 'Ship small.\n');
  assert.equal(fs.readFileSync(path.join(storeFolder('pipao'), 'NEMIA.md'), 'utf8'), 'Ship small.\n');
});

test('nemia factory instruct --file writes the store-kept text, --clear removes it, and moving out of the store leaves it unread', async (t) => {
  filed({ instruction: { store: true } });
  const source = path.join(ROOT, 'words.md');
  fs.writeFileSync(source, 'Be brief.\n');
  assert.deepEqual(await printedBy(t, 'factory', 'instruct', 'pipao', '--file', source), [
    `pipao: instruction written to ${path.join(storeFolder('pipao'), 'NEMIA.md')}`,
  ]);
  setInstruction({ factory: 'pipao', at: undefined });
  const moved = factoryInstruction('pipao');
  assert.deepEqual([moved.store, moved.words, moved.stored], [false, null, true]);
  setInstruction({ factory: 'pipao', at: { store: true } });
  assert.equal(factoryInstruction('pipao').words, 'Be brief.\n');
  assert.deepEqual(await printedBy(t, 'factory', 'instruct', 'pipao', '--clear'), [
    `pipao: instruction removed, ${path.join(storeFolder('pipao'), 'NEMIA.md')}`,
  ]);
  assert.equal(factoryInstruction('pipao').stored, false);
});

test('REFUSED: blank words, and a link at the store file is replaced, never written through', () => {
  filed({ instruction: { store: true } });
  assert.throws(() => writeInstructionText('pipao', ' \n'), refusedWith('Invalid', /is blank/));
  const target = path.join(ROOT, 'elsewhere.md');
  fs.writeFileSync(target, 'untouched\n');
  fs.mkdirSync(storeFolder('pipao'), { recursive: true });
  fs.symlinkSync(target, path.join(storeFolder('pipao'), 'NEMIA.md'));
  assert.match(factoryInstruction('pipao').error ?? '', /is a link, and the store keeps its own file/);
  writeInstructionText('pipao', 'mine');
  assert.equal(fs.readFileSync(target, 'utf8'), 'untouched\n');
  assert.ok(!fs.lstatSync(path.join(storeFolder('pipao'), 'NEMIA.md')).isSymbolicLink());
});

test('a folder-kept instruction whose link leads outside the folder does not read; one whose link stays inside reads', () => {
  const repo = filed();
  const outside = path.join(ROOT, 'secret.md');
  fs.writeFileSync(outside, 'secret\n');
  fs.symlinkSync(outside, path.join(repo, 'NEMIA.md'));
  const escaped = factoryInstruction('pipao');
  assert.equal(escaped.words, null);
  assert.match(escaped.error ?? '', /leads to .*secret\.md, outside/);
  fs.writeFileSync(path.join(repo, 'real.md'), 'inside\n');
  fs.rmSync(path.join(repo, 'NEMIA.md'));
  fs.symlinkSync(path.join(repo, 'real.md'), path.join(repo, 'NEMIA.md'));
  assert.deepEqual(readInstructionAt({ in: 'folder', folder: repo, path: 'NEMIA.md', file: path.join(repo, 'NEMIA.md') }), {
    words: 'inside\n',
    error: null,
  });
});

test('a path written by hand that climbs out of the folder is not read', () => {
  const repo = filed({ instruction: { path: '../secret.md' } });
  fs.writeFileSync(path.join(path.dirname(repo), 'secret.md'), 'secret\n');
  const answer = factoryInstruction('pipao');
  assert.equal(answer.words, null);
  assert.match(answer.error ?? '', /is not a file inside/);
});

test('nemia factory rm removes the store folder after the record and says so; with none, no line; refused, it touches no folder', async (t) => {
  filed({ instruction: { store: true } });
  writeInstructionText('pipao', 'Ship small.');
  assert.deepEqual(await printedBy(t, 'factory', 'rm', 'pipao'), [
    `pipao  removed — ${recordOf('pipao')}`,
    `instruction removed: ${storeFolder('pipao')}`,
  ]);
  assert.ok(!fs.existsSync(storeFolder('pipao')));
  filed();
  assert.deepEqual(await printedBy(t, 'factory', 'rm', 'pipao'), [`pipao  removed — ${recordOf('pipao')}`]);
  fs.mkdirSync(storeFolder('orphan'), { recursive: true });
  fs.writeFileSync(path.join(storeFolder('orphan'), 'NEMIA.md'), 'kept\n');
  await assert.rejects(main(['factory', 'rm', 'orphan'], NO_ENGINE), refusedWith('Missing', /no factory orphan/));
  assert.ok(fs.existsSync(path.join(storeFolder('orphan'), 'NEMIA.md')), 'a refused rm leaves the folder');
});

test('REFUSED: the default factory, by both verbs, as a Conflict', async () => {
  await assert.rejects(
    runWith(NO_ENGINE, FACTORY_INSTRUCTION.handler({ factory: 'default' })),
    refusedWith('Conflict', /nemia factory instruction does not take it/),
  );
  await assert.rejects(
    runWith(NO_ENGINE, FACTORY_INSTRUCT.handler({ factory: 'default', words: 'x', clear: false })),
    refusedWith('Conflict', /nemia factory instruct does not take it/),
  );
});
