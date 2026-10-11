/**
 * The factories on disk: `$WF_ROOT/factories/`, filed, listed and removed through `nemia factory`, as a person types it.
 *
 * Names and lines are pure, and live in factory.test.ts. This is the part that is not: the folder, what is and is not written, and the
 * create that two adds of one name cannot both win. `WF_ROOT` is set before the import, since the module reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';

const ROOT = scratch('wf-factory-');
const FACTORIES = path.join(ROOT, 'factories');

process.env.WF_ROOT = ROOT;
const {
  addFactory,
  attachWorkflow,
  clearSchedule,
  detachWorkflow,
  factoriesDir,
  fireAgent,
  hireAgent,
  readFactories,
  readFactory,
  setSchedule,
} = await import('../runner.ts');
const { main } = await import('../cli/main.ts');
const { FACTORY_HELP } = await import('./factory.verb.ts');
const { hireRefusalOf } = await import('./factory.ts');

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);

/** The engine of this test, the stand-in none of these commands asks anything of. */
const noEngine = () => engineOf(engine().layer);

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
    await main(argv, noEngine());
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

test('nemia factory add files <name>.json under the store, each repository absolute and named once, a plain directory being enough', async (t) => {
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
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  const before = fs.readFileSync(path.join(FACTORIES, 'pipao.json'));
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', other], noEngine()),
    refusedWith('Conflict', /^There is a factory pipao already, .* nemia factory ls; .* nemia factory rm pipao, then add it again\.$/),
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
    main(['factory', 'add', 'default', '--repo', repo], noEngine()),
    refusedWith('Conflict', /^`default` is the default factory: .* nemia factory add does not take it/),
  );
  assert.deepEqual(filed(), []);
});

test('REFUSED: an add with no --repo, or with one that is missing or a file, is Invalid and writes nothing', async () => {
  const repo = fresh();
  const gone = path.join(ROOT, 'no-such-dir');
  const aFile = path.join(repo, 'README.md');
  fs.writeFileSync(aFile, 'not a directory\n');
  await assert.rejects(
    main(['factory', 'add', 'pipao'], noEngine()),
    refusedWith('Invalid', /^A factory names one repository at least, and none was given: nemia factory add pipao --repo <path>/),
  );
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', repo, '--repo', gone, '--repo', aFile], noEngine()),
    refusedWith('Invalid', new RegExp(`^--repo names a directory, and ${escaped(gone)}, ${escaped(aFile)} are not directories\\.`)),
  );
  await assert.rejects(
    main(['factory', 'add', 'pipao', '--repo', gone], noEngine()),
    refusedWith('Invalid', new RegExp(`${escaped(gone)} is not a directory\\. .* Nothing was filed\\.$`)),
  );
  assert.deepEqual(filed(), []);
});

test('REFUSED: a name that is not a slug is Invalid before any path is made of it', async () => {
  const repo = fresh();
  for (const name of ['../x', 'Nemia', '.hidden', 'a/b'])
    await assert.rejects(
      main(['factory', 'add', name, '--repo', repo], noEngine()),
      refusedWith('Invalid', new RegExp(`^\`${escaped(name)}\` is not a factory's name`)),
      name,
    );
  assert.ok(!fs.existsSync(FACTORIES), 'not even the folder');
  assert.ok(!fs.existsSync(path.join(ROOT, 'x.json')));
});

test('nemia factory ls: the default alone with no folder; then the default first and each factory by name', async (t) => {
  const repo = fresh();
  const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  assert.deepEqual(readFactories(), []);
  const alone = await printedBy(t, 'factory');
  assert.equal(alone[0], 'default  every run and card that names no factory — read, never written');
  assert.equal(alone.length, 3);
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  await main(['factory', 'add', 'nemia', '--repo', repo, '--repo', other], noEngine());
  const listed = await printedBy(t, 'factory', 'ls');
  assert.deepEqual(listed.slice(0, 3), [
    'default  every run and card that names no factory — read, never written',
    `nemia    ${repo}, ${other}`,
    `pipao    ${repo}`,
  ]);
});

test('nemia factory ls: a file that does not read is listed with why, the others still listed, and a hidden file not at all', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  fs.writeFileSync(path.join(FACTORIES, 'empty.json'), '{}\n');
  fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{"repos": [');
  fs.writeFileSync(path.join(FACTORIES, 'none.json'), '{"repos": []}\n');
  fs.writeFileSync(path.join(FACTORIES, '.pipao.json.123.abcd'), '{"repos": ["/x"]}\n');
  fs.writeFileSync(path.join(FACTORIES, '.hidden.json'), '{"repos": ["/x"]}\n');
  const listed = await printedBy(t, 'factory', 'ls');
  assert.equal(listed[0].split(' ')[0], 'default');
  assert.match(listed[1], /^empty {4}\S*empty\.json does not read as a factory: `repos` is missing\. nemia factory rm empty/);
  assert.match(listed[2], /^none {5}\S*none\.json does not read as a factory: `repos.0` is missing\. nemia factory rm none/);
  assert.equal(listed[3], `pipao    ${repo}`);
  assert.match(listed[4], /^torn {5}\S*torn\.json is not JSON \(/);
  assert.equal(listed[5], '');
  assert.equal(listed.length, 7);
});

test('nemia factory ls: a default.json written by hand is listed as a file to remove, never as the default factory or as a factory', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  fs.writeFileSync(path.join(FACTORIES, 'default.json'), '{"repos": ["/x"]}\n');
  const listed = await printedBy(t, 'factory', 'ls');
  assert.deepEqual(listed.slice(0, 3), [
    'default  every run and card that names no factory — read, never written',
    `default  ${path.join(FACTORIES, 'default.json')} is no factory: the default factory is no file, and nemia factory rm does not take it. Remove this file by hand.`,
    `pipao    ${repo}`,
  ]);
  assert.deepEqual(
    readFactories().flatMap((f) => ('repos' in f ? [f.name] : [])),
    ['pipao'],
  );
});

test('REFUSED: an rm of the default is a Conflict, and of a name with no factory is Missing, naming those there are', async () => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  await assert.rejects(main(['factory', 'rm', 'default'], noEngine()), refusedWith('Conflict', /nemia factory rm does not take it/));
  await assert.rejects(
    main(['factory', 'rm', 'nope'], noEngine()),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: pipao\. Nothing was removed\.$/),
  );
  await assert.rejects(main(['factory', 'rm', '../runs'], noEngine()), refusedWith('Invalid', /is not a factory's name/));
  assert.deepEqual(filed(), ['pipao.json']);
});

test("nemia factory rm removes that factory's file alone, and one that does not read too", async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  await main(['factory', 'add', 'nemia', '--repo', repo], noEngine());
  const nemia = fs.readFileSync(path.join(FACTORIES, 'nemia.json'));
  assert.deepEqual(await printedBy(t, 'factory', 'rm', 'pipao'), [`pipao  removed — ${path.join(FACTORIES, 'pipao.json')}`]);
  assert.deepEqual(filed(), ['nemia.json']);
  assert.deepEqual(fs.readFileSync(path.join(FACTORIES, 'nemia.json')), nemia);
  fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{');
  await main(['factory', 'rm', 'torn'], noEngine());
  assert.deepEqual(filed(), ['nemia.json']);
});

test('REFUSED: nemia factory with a subcommand it does not have names its forms; --help prints its help', async (t) => {
  await assert.rejects(
    main(['factory', 'frob'], noEngine()),
    refusedWith(
      'Invalid',
      /^nemia factory does not take frob\. .*nemia factory ls.*nemia factory add <name> --repo <path>.*nemia factory attach <factory> <workflow>.*nemia factory detach <factory> <workflow>.*nemia factory hire <factory> <agent> --step <workflow>\/<step>.*nemia factory fire <factory> --step <workflow>\/<step>.*nemia factory schedule <factory> <workflow> --cron <expr> --brief <text>.*nemia factory unschedule <factory> <workflow>.*nemia factory rm <name>/,
    ),
  );
  await assert.rejects(main(['factory', 'add', 'pipao', '--rep', '/x'], noEngine()), refusedWith('Invalid', /does not take --rep\./));
  assert.deepEqual(await printedBy(t, 'factory', '--help'), FACTORY_HELP.split('\n'));
});

/** The factory `name`'s file, as JSON. */
const fileOf = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8'));

test('nemia factory hire files one agent a step, keeping repos and a key a later nemia wrote; a second hire into the step replaces the first', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  const file = path.join(FACTORIES, 'pipao.json');
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  fs.writeFileSync(file, JSON.stringify({ ...fileOf('pipao'), later: { kept: true } }));
  assert.deepEqual(await printedBy(t, 'factory', 'hire', 'pipao', 'otto', '--step', 'build/implement'), [
    'pipao  build/implement ← otto',
    `hired: ${file}`,
  ]);
  assert.deepEqual(await printedBy(t, 'factory', 'hire', 'pipao', 'ada', '--step=build/implement'), [
    'pipao  build/implement ← ada (was otto)',
    `hired: ${file}`,
  ]);
  assert.deepEqual(hireAgent({ factory: 'pipao', agent: 'agora', step: 'build/review' }), { file });
  assert.deepEqual(fileOf('pipao'), {
    repos: [repo],
    workflows: ['build'],
    later: { kept: true },
    hires: { 'build/implement': 'ada', 'build/review': 'agora' },
  });
  assert.deepEqual(filed(), ['pipao.json'], 'no hidden file left behind');
  assert.deepEqual(readFactory('pipao'), {
    name: 'pipao',
    repos: [repo],
    workflows: ['build'],
    hires: { 'build/implement': 'ada', 'build/review': 'agora' },
    schedules: {},
  });
  const listed = await printedBy(t, 'factory', 'ls');
  assert.deepEqual(listed.slice(1, 5), [
    `pipao    ${repo}`,
    '         workflows: build',
    '         build/implement ← ada',
    '         build/review ← agora',
  ]);
});

test('nemia factory fire takes one hire back and keeps the rest; a step it hires no one into is Missing, naming its hires', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'agora', step: 'build/review' });
  const file = path.join(FACTORIES, 'pipao.json');
  assert.deepEqual(await printedBy(t, 'factory', 'fire', 'pipao', '--step', 'build/implement'), [
    'pipao  build/implement  fired ada',
    `fired: ${file}`,
  ]);
  assert.deepEqual(fileOf('pipao'), { repos: [repo], workflows: ['build'], hires: { 'build/review': 'agora' } });
  const before = fs.readFileSync(file);
  assert.throws(
    () => fireAgent({ factory: 'pipao', step: 'build/implement' }),
    refusedWith('Missing', /^pipao hires no agent into build\/implement\. It hires into: build\/review\. Nothing was fired\.$/),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  fireAgent({ factory: 'pipao', step: 'build/review' });
  assert.throws(
    () => fireAgent({ factory: 'pipao', step: 'build/review' }),
    refusedWith('Missing', /It hires none\. Nothing was fired\.$/),
  );
});

test('REFUSED: a hire or a fire in the default factory is a Conflict, and in no factory Missing, nothing written', async () => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  await assert.rejects(
    main(['factory', 'hire', 'default', 'ada', '--step', 'build/implement'], noEngine()),
    refusedWith(
      'Conflict',
      /^`default` is the default factory: .* nemia factory hire does not take it\. In it, a step that names no agent runs as a plain session/,
    ),
  );
  await assert.rejects(
    main(['factory', 'fire', 'default', '--step', 'build/implement'], noEngine()),
    refusedWith('Conflict', /nemia factory fire does not take it/),
  );
  await assert.rejects(
    main(['factory', 'hire', 'nope', 'ada', '--step', 'build/implement'], noEngine()),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: pipao\. Nothing was hired\.$/),
  );
  assert.throws(() => fireAgent({ factory: 'nope', step: 'build/implement' }), refusedWith('Missing', /Nothing was fired\.$/));
  assert.throws(
    () => hireAgent({ factory: 'Pipao', agent: 'ada', step: 'build/implement' }),
    refusedWith('Invalid', /is not a factory's name/),
  );
  assert.deepEqual(filed(), ['pipao.json']);
  assert.deepEqual(fileOf('pipao'), { repos: [repo] });
});

test('REFUSED: a hire whose step is not <workflow>/<step>, or whose agent is no name, is Invalid and writes nothing', () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  const before = fs.readFileSync(path.join(FACTORIES, 'pipao.json'));
  for (const step of ['build', 'build/a/b', 'build/.x', '/x'])
    assert.throws(
      () => hireAgent({ factory: 'pipao', agent: 'ada', step }),
      refusedWith('Invalid', new RegExp(`^--step ${escaped(step)}.* Nothing was hired\\.$`)),
      step,
    );
  assert.throws(
    () => hireAgent({ factory: 'pipao', agent: 'a/b', step: 'build/implement' }),
    refusedWith('Invalid', /^`a\/b` is not an agent's name/),
  );
  assert.deepEqual(fs.readFileSync(path.join(FACTORIES, 'pipao.json')), before);
  assert.deepEqual(filed(), ['pipao.json']);
});

test('REFUSED: a factory whose file does not read is Invalid to hire, fire and a start, its bytes left as they are', () => {
  fresh();
  fs.mkdirSync(FACTORIES, { recursive: true });
  const file = path.join(FACTORIES, 'bent.json');
  fs.writeFileSync(file, '{"repos": ["/x"], "hires": 3}\n');
  const before = fs.readFileSync(file);
  const bent = readFactories().find((f) => f.name === 'bent');
  assert.ok(bent && 'error' in bent, 'listed with why');
  assert.match(bent.error, /^does not read as a factory: `hires` /);
  assert.throws(() => readFactory('bent'), refusedWith('Invalid', /^the factory bent: \S*bent\.json does not read as a factory: `hires` /));
  assert.throws(
    () => hireAgent({ factory: 'bent', agent: 'ada', step: 'build/implement' }),
    refusedWith('Invalid', /^the factory bent: .* It was left as it is, and nothing was changed\.$/),
  );
  assert.throws(() => fireAgent({ factory: 'bent', step: 'build/implement' }), refusedWith('Invalid', /does not read as a factory/));
  assert.deepEqual(fs.readFileSync(file), before);
  assert.throws(
    () => readFactory('nope'),
    refusedWith('Missing', /^no factory nope in the store\. Its factories are: bent\. Nothing was started\.$/),
  );
});

test('REFUSED: nemia factory hire and fire with a --step missing or twice, an unknown flag, or an argument too many, each by name', async () => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  const refusals: Array<[string[], RegExp]> = [
    [['hire', 'pipao', 'ada'], /^nemia factory hire names the step with --step: .* Nothing was hired\.$/],
    [['hire', 'pipao'], /^nemia factory hire takes the factory, then the agent/],
    [['hire', 'pipao', 'ada', '--step', 'build/a', '--step', 'build/b'], /^nemia factory hire takes --step once/],
    [['hire', 'pipao', 'ada', '--step', 'build/a', '--stp', 'x'], /^nemia factory hire does not take --stp\./],
    [['hire', 'pipao', 'ada', 'otto', '--step', 'build/a'], /^nemia factory hire takes <factory> <agent>, and otto is one more/],
    [['fire', 'pipao'], /^nemia factory fire names the step with --step: .* Nothing was fired\.$/],
    [['fire', 'pipao', 'ada', '--step', 'build/a'], /^nemia factory fire takes <factory>, and ada is one more/],
    [['fire', '--step', 'build/a'], /^nemia factory fire takes the factory first/],
  ];
  for (const [argv, pattern] of refusals)
    await assert.rejects(main(['factory', ...argv], noEngine()), refusedWith('Invalid', pattern), argv.join(' '));
  assert.deepEqual(fileOf('pipao'), { repos: [repo] });
});

test('nemia factory attach adds a workflow by name, sorted and once, keeping every other key; detach takes it back and keeps the rest', async (t) => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  const file = path.join(FACTORIES, 'pipao.json');
  fs.writeFileSync(file, JSON.stringify({ ...fileOf('pipao'), later: { kept: true } }));
  assert.deepEqual(await printedBy(t, 'factory', 'attach', 'pipao', 'intake'), ['pipao  attached intake', `attached: ${file}`]);
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
  assert.deepEqual(fileOf('pipao'), {
    repos: [repo],
    later: { kept: true },
    workflows: ['build', 'intake'],
    hires: { 'build/implement': 'ada' },
  });
  const before = fs.readFileSync(file);
  assert.deepEqual(await printedBy(t, 'factory', 'attach', 'pipao', 'build'), ['pipao  already attached build', `unchanged: ${file}`]);
  assert.deepEqual(attachWorkflow({ factory: 'pipao', workflow: 'build' }), { file, already: true });
  assert.deepEqual(fs.readFileSync(file), before, 'an attach of one attached already writes nothing');
  assert.deepEqual(filed(), ['pipao.json'], 'no hidden file left behind');
  assert.deepEqual(readFactory('pipao').workflows, ['build', 'intake']);
  assert.deepEqual((await printedBy(t, 'factory', 'ls')).slice(1, 4), [
    `pipao    ${repo}`,
    '         workflows: build, intake',
    '         build/implement ← ada',
  ]);
  assert.deepEqual(await printedBy(t, 'factory', 'detach', 'pipao', 'intake'), ['pipao  detached intake', `detached: ${file}`]);
  assert.deepEqual(fileOf('pipao'), { repos: [repo], later: { kept: true }, workflows: ['build'], hires: { 'build/implement': 'ada' } });
  assert.deepEqual(filed(), ['pipao.json']);
});

test('a factory file with no workflows key reads as one that has attached, hired and scheduled none', () => {
  const repo = fresh();
  addFactory({ name: 'nemia', repos: [repo] });
  assert.deepEqual(fileOf('nemia'), { repos: [repo] }, 'an add writes no workflows key');
  assert.deepEqual(readFactory('nemia'), { name: 'nemia', repos: [repo], workflows: [], hires: {}, schedules: {} });
  const listed = readFactories().find((f) => f.name === 'nemia');
  assert.ok(listed && !('error' in listed) && listed.workflows.length === 0);
});

test('REFUSED: a hire into a step of a workflow the factory has not attached is Invalid, naming the attach, and writes nothing', () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'intake' });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  assert.throws(
    () => hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' }),
    refusedWith(
      'Invalid',
      /^pipao does not offer the workflow build, so it hires no one into its steps\. Attach it first — nemia factory attach pipao build — then hire\. Nothing was hired\.$/,
    ),
  );
  assert.throws(
    () => hireAgent({ factory: 'pipao', agent: 'ada', step: 'intak/x' }),
    refusedWith('Invalid', /nemia factory attach pipao intak /),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'intake/frame' });
  assert.deepEqual(fileOf('pipao').hires, { 'intake/frame': 'ada' });
});

test("REFUSED: a hire into a step whose own file names its agent is a Conflict, in hireRefusalOf's words, and writes nothing", async () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'build' });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  const theirs = path.join(repo, 'workflows', 'build');
  const yours = path.join(ROOT, 'workflows', 'build');
  for (const dir of [theirs, yours]) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(theirs, 'named.md'), '---\nagent: reviewer\n---\nSay it.\n');
  fs.writeFileSync(path.join(theirs, 'implement.md'), '---\nmodel: opus\n---\nBuild it.\n');
  fs.writeFileSync(path.join(yours, 'yours.md'), '---\nagent: agora\n---\nSay it.\n');
  const refusal = (named: string, at: string) =>
    `${hireRefusalOf({ name: 'pipao', workflows: ['build'] }, 'build', named)} ${at} names it. Nothing was hired.`;
  try {
    await assert.rejects(
      main(['factory', 'hire', 'pipao', 'ada', '--step', 'build/named'], noEngine()),
      refusedWith('Conflict', new RegExp(`^${escaped(refusal('reviewer', path.join(theirs, 'named.md')))}$`)),
    );
    assert.throws(
      () => hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/yours' }),
      refusedWith('Conflict', new RegExp(`^${escaped(refusal('agora', path.join(yours, 'yours.md')))}$`)),
    );
    assert.deepEqual(fs.readFileSync(file), before);
    hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
    hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/absent' });
    assert.deepEqual(
      fileOf('pipao').hires,
      { 'build/implement': 'ada', 'build/absent': 'ada' },
      'a file naming none, and no file, take a hire',
    );
  } finally {
    fs.rmSync(path.join(ROOT, 'workflows'), { recursive: true, force: true });
  }
});

test('REFUSED: a detach of a workflow the factory still hires into is Invalid, naming each fire; one it has not attached is Missing', () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  for (const workflow of ['build', 'builder']) attachWorkflow({ factory: 'pipao', workflow });
  hireAgent({ factory: 'pipao', agent: 'agora', step: 'build/review' });
  hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
  hireAgent({ factory: 'pipao', agent: 'otto', step: 'builder/x' });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  assert.throws(
    () => detachWorkflow({ factory: 'pipao', workflow: 'build' }),
    refusedWith(
      'Invalid',
      /^pipao hires into build's steps: build\/implement, build\/review\. Fire each first — nemia factory fire pipao --step build\/implement; nemia factory fire pipao --step build\/review — then detach it\. Nothing was detached\.$/,
    ),
  );
  assert.throws(
    () => detachWorkflow({ factory: 'pipao', workflow: 'intake' }),
    refusedWith('Missing', /^pipao has not attached intake\. It offers: build, builder\. Nothing was detached\.$/),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  fireAgent({ factory: 'pipao', step: 'build/implement' });
  fireAgent({ factory: 'pipao', step: 'build/review' });
  detachWorkflow({ factory: 'pipao', workflow: 'build' });
  assert.deepEqual(
    fileOf('pipao'),
    { repos: [repo], workflows: ['builder'], hires: { 'builder/x': 'otto' } },
    "builder's hire does not hold build",
  );
  fireAgent({ factory: 'pipao', step: 'builder/x' });
  detachWorkflow({ factory: 'pipao', workflow: 'builder' });
  assert.throws(
    () => detachWorkflow({ factory: 'pipao', workflow: 'builder' }),
    refusedWith('Missing', /^pipao has not attached builder\. It offers none\. Nothing was detached\.$/),
  );
});

test('REFUSED: attach and detach on the default factory, on no factory, with a name no workflow has, or on a file that does not read', async () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  for (const verb of ['attach', 'detach'] as const) {
    const done = verb === 'attach' ? 'attached' : 'detached';
    const change = verb === 'attach' ? attachWorkflow : detachWorkflow;
    await assert.rejects(
      main(['factory', verb, 'default', 'build'], noEngine()),
      refusedWith('Conflict', new RegExp(`^\`default\` is the default factory: .* nemia factory ${verb} does not take it\\. `)),
    );
    await assert.rejects(
      main(['factory', verb, 'nope', 'build'], noEngine()),
      refusedWith('Missing', new RegExp(`^no factory nope in the store\\. Its factories are: pipao\\. Nothing was ${done}\\.$`)),
    );
    for (const workflow of ['', '.git', 'a/b', 'agents', 'skills'])
      assert.throws(
        () => change({ factory: 'pipao', workflow }),
        refusedWith('Invalid', new RegExp(`(is not a workflow's name|holds the agents or the skills).* Nothing was ${done}\\.$`)),
        `${verb} ${JSON.stringify(workflow)}`,
      );
  }
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(filed(), ['pipao.json']);
  const bent = path.join(FACTORIES, 'bent.json');
  fs.writeFileSync(bent, '{"repos": ["/x"], "workflows": 3}\n');
  const bentBefore = fs.readFileSync(bent);
  const listed = readFactories().find((f) => f.name === 'bent');
  assert.ok(listed && 'error' in listed, 'listed with why');
  assert.match(listed.error, /^does not read as a factory: `workflows` /);
  assert.throws(
    () => readFactory('bent'),
    refusedWith('Invalid', /^the factory bent: \S*bent\.json does not read as a factory: `workflows` /),
  );
  assert.throws(() => attachWorkflow({ factory: 'bent', workflow: 'build' }), refusedWith('Invalid', /It was left as it is/));
  assert.throws(() => detachWorkflow({ factory: 'bent', workflow: 'build' }), refusedWith('Invalid', /It was left as it is/));
  assert.deepEqual(fs.readFileSync(bent), bentBefore);
});

test('REFUSED: nemia factory attach and detach with no workflow, a second one, or a flag, each by name, writing nothing', async () => {
  const repo = fresh();
  await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
  const refusals: Array<[string[], RegExp]> = [
    [['attach', 'pipao'], /^nemia factory attach takes the factory, then the workflow, by its folder's name: .* Nothing was attached\.$/],
    [['attach'], /^nemia factory attach takes the factory, then the workflow/],
    [['attach', 'pipao', 'build', 'extra'], /^nemia factory attach takes one workflow, and extra is a second/],
    [['attach', 'pipao', 'build', '--x'], /^nemia factory attach does not take --x\./],
    [['detach', 'pipao'], /^nemia factory detach takes the factory, then the workflow, .* Nothing was detached\.$/],
    [['detach', '--step', 'build'], /^nemia factory detach does not take --step\./],
  ];
  for (const [argv, pattern] of refusals)
    await assert.rejects(main(['factory', ...argv], noEngine()), refusedWith('Invalid', pattern), argv.join(' '));
  assert.deepEqual(fileOf('pipao'), { repos: [repo] });
});

test('nemia factory schedule writes a schedule stamped with since, read back on the factory, keeping every other key; unschedule takes it', () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'janitor' });
  const file = path.join(FACTORIES, 'pipao.json');
  fs.writeFileSync(file, JSON.stringify({ ...fileOf('pipao'), later: { kept: true } }));
  const before = Date.now();
  const { schedule } = setSchedule({
    factory: 'pipao',
    workflow: 'janitor',
    cron: '0 9 * * 1',
    brief: 'Read the stats',
    tz: 'America/Montreal',
  });
  assert.ok(Date.parse(schedule.since) >= before - 1000 && Date.parse(schedule.since) <= Date.now());
  assert.deepEqual(readFactory('pipao').schedules, {
    janitor: { cron: '0 9 * * 1', brief: 'Read the stats', tz: 'America/Montreal', since: schedule.since },
  });
  assert.deepEqual((fileOf('pipao') as { later: unknown }).later, { kept: true });
  const again = setSchedule({ factory: 'pipao', workflow: 'janitor', cron: '0 10 * * 1', brief: 'Read the stats', repo });
  assert.deepEqual(again.replaced, schedule);
  assert.equal(again.schedule.tz, undefined, 'a schedule written again is written whole');
  assert.equal(readFactory('pipao').schedules.janitor.repo, repo);
  assert.deepEqual(clearSchedule({ factory: 'pipao', workflow: 'janitor' }).cleared, again.schedule);
  assert.deepEqual(readFactory('pipao').schedules, {});
  assert.deepEqual((fileOf('pipao') as { later: unknown }).later, { kept: true });
});

test("REFUSED: a schedule of a workflow not attached, a cron or zone Cron does not read, an empty brief or a repository not the factory's", () => {
  const repo = fresh();
  const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'janitor' });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  const at = { factory: 'pipao', workflow: 'janitor', cron: '0 9 * * 1', brief: 'Read the stats' };
  assert.throws(
    () => setSchedule({ ...at, workflow: 'build' }),
    refusedWith(
      'Invalid',
      /^pipao does not offer the workflow build.*nemia factory attach pipao build — then schedule it\. Nothing was scheduled\.$/,
    ),
  );
  assert.throws(
    () => setSchedule({ ...at, cron: '61 * * * *' }),
    refusedWith('Invalid', /^--cron "61 \* \* \* \*": .*between 0 and 59.*Nothing was scheduled\.$/),
  );
  assert.throws(
    () => setSchedule({ ...at, tz: 'Not/AZone' }),
    refusedWith('Invalid', /--tz Not\/AZone: .*time zone.*Nothing was scheduled\.$/),
  );
  assert.throws(
    () => setSchedule({ ...at, cron: '0 0 30 2 *', tz: 'UTC' }),
    refusedWith('Invalid', /never fires.*Nothing was scheduled\.$/),
  );
  assert.throws(() => setSchedule({ ...at, brief: '  ' }), refusedWith('Invalid', /--brief says, and it is empty/));
  assert.throws(
    () => setSchedule({ ...at, repo: other }),
    refusedWith('Invalid', new RegExp(`^${escaped(other)}: pipao works on ${escaped(repo)}: .*--repo`)),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  assert.throws(
    () => clearSchedule({ factory: 'pipao', workflow: 'janitor' }),
    refusedWith('Missing', /^pipao does not schedule janitor\. It schedules none\. Nothing was unscheduled\.$/),
  );
  assert.deepEqual(fs.readFileSync(file), before);
});

test('REFUSED: a schedule naming no repository in a factory of two, which a scheduled start could not choose between', () => {
  const repo = fresh();
  const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  addFactory({ name: 'pipao', repos: [repo, other] });
  attachWorkflow({ factory: 'pipao', workflow: 'janitor' });
  const at = { factory: 'pipao', workflow: 'janitor', cron: '0 9 * * 1', brief: 'Read the stats' };
  assert.throws(
    () => setSchedule(at),
    refusedWith('Invalid', /^pipao works on .*: name the one its scheduled runs work on with --repo\. Nothing was scheduled\.$/),
  );
  assert.equal(setSchedule({ ...at, repo: other }).schedule.repo, other);
});

test('REFUSED: a detach of a workflow the factory schedules is Invalid, naming the unschedule, and writes nothing', () => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  attachWorkflow({ factory: 'pipao', workflow: 'janitor' });
  setSchedule({ factory: 'pipao', workflow: 'janitor', cron: '0 9 * * 1', brief: 'Read the stats' });
  const file = path.join(FACTORIES, 'pipao.json');
  const before = fs.readFileSync(file);
  assert.throws(
    () => detachWorkflow({ factory: 'pipao', workflow: 'janitor' }),
    refusedWith(
      'Invalid',
      /^pipao schedules janitor: unschedule it first — nemia factory unschedule pipao janitor — then detach it\. Nothing was detached\.$/,
    ),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  clearSchedule({ factory: 'pipao', workflow: 'janitor' });
  detachWorkflow({ factory: 'pipao', workflow: 'janitor' });
  assert.deepEqual(readFactory('pipao').workflows, []);
});

test('nemia factory schedule and unschedule write through the command line; a bad cron is refused with exit 2, quoting Cron, writing nothing', async (t) => {
  const repo = fresh();
  addFactory({ name: 'nemia', repos: [repo] });
  attachWorkflow({ factory: 'nemia', workflow: 'janitor' });
  const file = path.join(FACTORIES, 'nemia.json');
  const before = fs.readFileSync(file);
  await assert.rejects(
    main(['factory', 'schedule', 'nemia', 'janitor', '--cron', '61 * * * *', '--brief', 'Read the stats'], noEngine()),
    refusedWith('Invalid', /^--cron "61 \* \* \* \*": .*between 0 and 59/),
  );
  await assert.rejects(
    main(['factory', 'schedule', 'nemia', 'janitor', '--cron', '0 9 * * 1', '--brief', 'Read the stats', '--tz', 'Not/AZone'], noEngine()),
    refusedWith('Invalid', /--tz Not\/AZone: .*time zone/),
  );
  await assert.rejects(
    main(['factory', 'schedule', 'nemia', 'janitor', '--cron', '0 9 * * 1'], noEngine()),
    refusedWith('Invalid', /^nemia factory schedule takes --brief:/),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  const printed = await printedBy(
    t,
    'factory',
    'schedule',
    'nemia',
    'janitor',
    '--cron',
    '0 9 * * 1',
    '--brief',
    'Read the stats',
    '--tz',
    'UTC',
  );
  assert.equal(printed[0], 'nemia  janitor at 0 9 * * 1 (UTC)');
  assert.equal(readFactory('nemia').schedules.janitor.brief, 'Read the stats');
  assert.match((await printedBy(t, 'factory', 'ls')).join('\n'), /schedule janitor {2}0 9 \* \* 1 \(UTC\) {2}"Read the stats"/);
  assert.equal((await printedBy(t, 'factory', 'unschedule', 'nemia', 'janitor'))[0], 'nemia  janitor no longer at 0 9 * * 1');
  assert.deepEqual(readFactory('nemia').schedules, {});
});
