/**
 * The factories on disk: `$WF_ROOT/factories/`, filed, listed and removed through `wf factory`, as a person types it.
 *
 * Names and lines are pure, and live in factory.test.ts. This is the part that is not: the folder, what is and is not written, and the
 * create that two adds of one name cannot both win. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type { Engine } from 'agent-runtime';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-factory-');
const FACTORIES = path.join(ROOT, 'factories');

process.env.WF_ROOT = ROOT;
const { addFactory, factoriesDir, readFactories } = await import('../runner.ts');
const { main } = await import('../cli/main.ts');
const { FACTORY_HELP } = await import('../cli/factory/factory.ts');

/** No verb here asks the engine anything. */
const NO_ENGINE = {} as Engine;

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);
const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

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

/** The files in the factories folder, hidden ones too, by name. */
const filed = () => (fs.existsSync(FACTORIES) ? fs.readdirSync(FACTORIES).sort() : []);
const reposIn = (name: string): unknown => JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8')).repos;

/** An empty folder of factories, and a plain directory to name as a repository: no `.git`, which no factory asks for. */
const fresh = (): string => {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  return fs.mkdtempSync(path.join(ROOT, 'repo-'));
};

test('wf factory add files <name>.json under the store, each repository absolute and named once, a plain directory being enough', async (t) => {
  const repo = fresh();
  assert.equal(factoriesDir(), FACTORIES);
  const printed = await printedBy(t, 'factory', 'add', 'pipao', '--repo', repo, '--repo', path.relative(process.cwd(), repo));
  assert.deepEqual(filed(), ['pipao.json']);
  assert.deepEqual(reposIn('pipao'), [path.resolve(repo)]);
  assert.ok(!fs.existsSync(path.join(repo, '.git')));
  assert.deepEqual(printed, [`pipao  ${path.resolve(repo)}`, `filed: ${path.join(FACTORIES, 'pipao.json')}`]);
});

test('REFUSED: an add of a name already filed is a Conflict, and the file is left byte for byte', async () => {
  const repo = fresh();
  const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  await main(['factory', 'add', 'pipao', '--repo', repo], NO_ENGINE);
  const before = fs.readFileSync(path.join(FACTORIES, 'pipao.json'));
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', other], NO_ENGINE),
    refusedWith('Conflict', /^There is a factory pipao already, .* wf factory ls; .* wf factory rm pipao, then add it again\.$/),
  );
  assert.deepEqual(fs.readFileSync(path.join(FACTORIES, 'pipao.json')), before);
  assert.deepEqual(filed(), ['pipao.json'], 'no hidden file left behind');
});

test('REFUSED: two adds of one name, the second while the first is between its write and its link, file one and refuse the other', (t) => {
  const first = fresh();
  const second = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const link = fs.linkSync;
  let raced: unknown;
  const mocked = t.mock.method(fs, 'linkSync', (from: fs.PathLike, to: fs.PathLike) => {
    mocked.mock.restore();
    raced = addFactory({ name: 'pipao', repos: [second] });
    return link(from, to);
  });
  assert.throws(() => addFactory({ name: 'pipao', repos: [first] }), refusedWith('Conflict', /^There is a factory pipao already/));
  assert.ok(raced, 'the second add, run between the first write and its link, filed the factory');
  assert.deepEqual(reposIn('pipao'), [second], 'the file is the one that won, never overwritten');
  assert.deepEqual(filed(), ['pipao.json']);
});

test('REFUSED: the default factory is not added, and no file of its name is written', async () => {
  const repo = fresh();
  await assert.rejects(
    main(['factory', 'add', 'default', '--repo', repo], NO_ENGINE),
    refusedWith('Conflict', /^`default` is the default factory: .* wf factory add does not take it/),
  );
  assert.deepEqual(filed(), []);
});

test('REFUSED: an add with no --repo, or with one that is missing or a file, is Invalid and writes nothing', async () => {
  const repo = fresh();
  const gone = path.join(ROOT, 'no-such-dir');
  const aFile = path.join(repo, 'README.md');
  fs.writeFileSync(aFile, 'not a directory\n');
  await assert.rejects(
    main(['factory', 'add', 'pipao'], NO_ENGINE),
    refusedWith('Invalid', /^A factory names one repository at least, and none was given: wf factory add pipao --repo <path>/),
  );
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', repo, '--repo', gone, '--repo', aFile], NO_ENGINE),
    refusedWith('Invalid', new RegExp(`^--repo names a directory, and ${escaped(gone)}, ${escaped(aFile)} are not directories\\.`)),
  );
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', gone], NO_ENGINE),
    refusedWith('Invalid', new RegExp(`${escaped(gone)} is not a directory\\. .* Nothing was filed\\.$`)),
  );
  assert.deepEqual(filed(), []);
});

test('REFUSED: a name that is not a slug is Invalid before any path is made of it', async () => {
  const repo = fresh();
  for (const name of ['../x', 'Nemia', '.hidden', 'a/b'])
    await assert.rejects(
      main(['factory', 'add', name, '--repo', repo], NO_ENGINE),
      refusedWith('Invalid', new RegExp(`^\`${escaped(name)}\` is not a factory's name`)),
      name,
    );
  assert.ok(!fs.existsSync(FACTORIES), 'not even the folder');
  assert.ok(!fs.existsSync(path.join(ROOT, 'x.json')));
});

test('wf factory ls: the default alone with no folder; then the default first and each factory by name', async (t) => {
  const repo = fresh();
  const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  assert.deepEqual(readFactories(), []);
  const alone = await printedBy(t, 'factory');
  assert.equal(alone[0], 'default  every run and card that names no factory — read, never written');
  assert.equal(alone.length, 3);
  await main(['factory', 'add', 'pipao', '--repo', repo], NO_ENGINE);
  await main(['factory', 'add', 'nemia', '--repo', repo, '--repo', other], NO_ENGINE);
  const listed = await printedBy(t, 'factory', 'ls');
  assert.deepEqual(listed.slice(0, 3), [
    'default  every run and card that names no factory — read, never written',
    `nemia    ${repo}, ${other}`,
    `pipao    ${repo}`,
  ]);
});

test('wf factory ls: a file that does not read is listed with why, the others still listed, and a hidden file not at all', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], NO_ENGINE);
  fs.writeFileSync(path.join(FACTORIES, 'empty.json'), '{}\n');
  fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{"repos": [');
  fs.writeFileSync(path.join(FACTORIES, 'none.json'), '{"repos": []}\n');
  fs.writeFileSync(path.join(FACTORIES, '.pipao.json.123.abcd'), '{"repos": ["/x"]}\n');
  fs.writeFileSync(path.join(FACTORIES, '.hidden.json'), '{"repos": ["/x"]}\n');
  const listed = await printedBy(t, 'factory', 'ls');
  assert.equal(listed[0].split(' ')[0], 'default');
  assert.match(listed[1], /^empty {4}\S*empty\.json does not read as a factory: `repos` is missing\. wf factory rm empty/);
  assert.match(listed[2], /^none {5}\S*none\.json does not read as a factory: `repos.0` is missing\. wf factory rm none/);
  assert.equal(listed[3], `pipao    ${repo}`);
  assert.match(listed[4], /^torn {5}\S*torn\.json is not JSON \(/);
  assert.equal(listed[5], '');
  assert.equal(listed.length, 7);
});

test('REFUSED: an rm of the default is a Conflict, and of a name with no factory is Missing, naming those there are', async () => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], NO_ENGINE);
  await assert.rejects(main(['factory', 'rm', 'default'], NO_ENGINE), refusedWith('Conflict', /wf factory rm does not take it/));
  await assert.rejects(
    main(['factory', 'rm', 'nope'], NO_ENGINE),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: pipao\. Nothing was removed\.$/),
  );
  await assert.rejects(main(['factory', 'rm', '../runs'], NO_ENGINE), refusedWith('Invalid', /is not a factory's name/));
  assert.deepEqual(filed(), ['pipao.json']);
});

test("wf factory rm removes that factory's file alone, and one that does not read too", async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], NO_ENGINE);
  await main(['factory', 'add', 'nemia', '--repo', repo], NO_ENGINE);
  const nemia = fs.readFileSync(path.join(FACTORIES, 'nemia.json'));
  assert.deepEqual(await printedBy(t, 'factory', 'rm', 'pipao'), [`pipao  removed — ${path.join(FACTORIES, 'pipao.json')}`]);
  assert.deepEqual(filed(), ['nemia.json']);
  assert.deepEqual(fs.readFileSync(path.join(FACTORIES, 'nemia.json')), nemia);
  fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{');
  await main(['factory', 'rm', 'torn'], NO_ENGINE);
  assert.deepEqual(filed(), ['nemia.json']);
});

test('REFUSED: wf factory with a subcommand it does not have names the three; --help prints its help', async (t) => {
  await assert.rejects(
    main(['factory', 'frob'], NO_ENGINE),
    refusedWith('Invalid', /^wf factory does not take frob\. .*wf factory ls.*wf factory add <name> --repo <path>.*wf factory rm <name>/),
  );
  await assert.rejects(main(['factory', 'add', 'pipao', '--rep', '/x'], NO_ENGINE), refusedWith('Invalid', /does not take --rep\./));
  assert.deepEqual(await printedBy(t, 'factory', '--help'), FACTORY_HELP.split('\n'));
});
