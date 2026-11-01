/**
 * The factories on disk, `$WF_ROOT/factories/`, as tables: what each `nemia factory` verb refuses — each row refused by kind (`_tag`),
 * exit 2 and the facts its words name, and nothing written — and what `nemia factory ls` says of a file that does not read. And the
 * create that two adds of one name cannot both win, a race kept focused. What a factory's door refuses of any layer — a name taken, the
 * default factory filed, no factory to remove — is its walks' (`test/factory-walks.ts`), and what a change of its wiring refuses for what
 * it offers, hires and schedules is `wiringRefusal`'s laws (`contracts/wiring.contract.ts`): these rows keep what only the verbs and the
 * disk say.
 *
 * A factory filed, given workflows, hires and a schedule, listed, started in and removed is a person's story, in
 * `test/factory-start.test.ts`; names and lines are pure, in `factory.test.ts`. `WF_ROOT` is set before the import, since the module
 * reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { names } from '../../test/assessed.ts';

const ROOT = scratch('wf-factory-');
const FACTORIES = path.join(ROOT, 'factories');

process.env.WF_ROOT = ROOT;
const { addFactory, attachWorkflow, detachWorkflow, fireAgent, hireAgent, readFactories, readFactory, setSchedule } =
  await import('../runner.ts');
const { main } = await import('../cli/main.ts');

const { engineOf } = await import('../runtime-client.ts');
const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

type Refusal = Error & { exitCode?: number; _tag?: string };

/** Refused by kind, exit 2, and the facts its words name — never its sentence. */
const refused =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Refusal): true => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true;
  };

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
/** The factory `name`'s file, as JSON. */
const fileOf = (name: string): Record<string, unknown> => JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8'));
/** The bytes of the factory `name`'s file. */
const bytesOf = (name: string): Buffer => fs.readFileSync(path.join(FACTORIES, `${name}.json`));

/** An empty folder of factories, and a plain directory to name as a repository: no `.git`, which no factory asks for. */
const fresh = (): string => {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  return fs.mkdtempSync(path.join(ROOT, 'repo-'));
};

/** `fresh`, and the factory `pipao` filed on its repository, with `workflows` attached: the repository. */
const pipao = (...workflows: string[]): string => {
  const repo = fresh();
  addFactory({ name: 'pipao', repos: [repo] });
  for (const workflow of workflows) attachWorkflow({ factory: 'pipao', workflow });
  return repo;
};

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
  assert.throws(() => addFactory({ name: 'pipao', repos: [first] }), refused('Conflict', 'pipao'));
  assert.ok(raced, 'the second add, run between the first write and its link, filed the factory');
  assert.deepEqual(reposIn('pipao'), [second], 'the file is the one that won, never overwritten');
  assert.deepEqual(filed(), ['pipao.json']);
});

test('REFUSED: `nemia factory add`, nothing filed', async (t) => {
  await t.test('no --repo is Invalid, naming the flag', async () => {
    fresh();
    await assert.rejects(main(['factory', 'add', 'pipao'], noEngine()), refused('Invalid', 'nemia factory add pipao --repo <path>'));
    assert.deepEqual(filed(), []);
  });
  await t.test('a --repo missing, or a file, is Invalid, naming each', async () => {
    const repo = fresh();
    const gone = path.join(ROOT, 'no-such-dir');
    const aFile = path.join(repo, 'README.md');
    fs.writeFileSync(aFile, 'not a directory\n');
    await assert.rejects(
      main(['factory', 'add', 'pipao', '--repo', repo, '--repo', gone, '--repo', aFile], noEngine()),
      refused('Invalid', '--repo', `${gone}, ${aFile}`),
    );
    await assert.rejects(main(['factory', 'add', 'pipao', '--repo', gone], noEngine()), refused('Invalid', gone));
    assert.deepEqual(filed(), []);
  });
  for (const name of ['../x', 'Nemia', '.hidden', 'a/b'])
    await t.test(`a name that is no slug, ${name}, is Invalid before any path is made of it`, async () => {
      const repo = fresh();
      await assert.rejects(main(['factory', 'add', name, '--repo', repo], noEngine()), refused('Invalid', `\`${name}\``));
      assert.ok(!fs.existsSync(FACTORIES), 'not even the folder');
      assert.ok(!fs.existsSync(path.join(ROOT, 'x.json')));
    });
});

test('REFUSED: `nemia factory rm`, nothing removed', async (t) => {
  const rows: Array<[string, string, 'Missing' | 'Conflict' | 'Invalid', string[]]> = [
    ['the default factory is a Conflict', 'default', 'Conflict', ['nemia factory rm']],
    ['a name that is no slug is Invalid', '../runs', 'Invalid', ['`../runs`']],
  ];
  for (const [row, name, tag, facts] of rows)
    await t.test(row, async () => {
      pipao();
      await assert.rejects(main(['factory', 'rm', name], noEngine()), refused(tag, ...facts));
      assert.deepEqual(filed(), ['pipao.json']);
    });
});

test('REFUSED: `nemia factory` typed with a subcommand, a flag or an argument it does not take, each by name, nothing written', async (t) => {
  const rows: Array<[string[], string[]]> = [
    [
      ['frob'],
      [
        'nemia factory',
        'frob',
        'nemia factory ls',
        'nemia factory add <name> --repo <path>',
        'nemia factory attach <factory> <workflow>',
        'nemia factory detach <factory> <workflow>',
        'nemia factory hire <factory> <agent> --step',
        'nemia factory fire <factory> --step <workflow>/<step>',
        '--cron <expr> --brief <text>',
        'nemia factory unschedule <factory> <workflow>',
        'nemia factory rm <name>',
      ],
    ],
    [['add', 'pipao', '--rep', '/x'], ['--rep']],
    [
      ['hire', 'pipao', 'ada'],
      ['nemia factory hire', '--step'],
    ],
    [
      ['hire', 'pipao'],
      ['nemia factory hire', '<agent>'],
    ],
    [
      ['hire', 'pipao', 'ada', '--step', 'build/a', '--step', 'build/b'],
      ['nemia factory hire', '--step'],
    ],
    [
      ['hire', 'pipao', 'ada', '--step', 'build/a', '--stp', 'x'],
      ['nemia factory hire', '--stp'],
    ],
    [
      ['hire', 'pipao', 'ada', 'otto', '--step', 'build/a'],
      ['nemia factory hire', 'otto'],
    ],
    [
      ['fire', 'pipao'],
      ['nemia factory fire', '--step'],
    ],
    [
      ['fire', 'pipao', 'ada', '--step', 'build/a'],
      ['nemia factory fire', 'ada'],
    ],
    [
      ['fire', '--step', 'build/a'],
      ['nemia factory fire', '<factory>'],
    ],
    [
      ['attach', 'pipao'],
      ['nemia factory attach', '<workflow>'],
    ],
    [['attach'], ['nemia factory attach']],
    [
      ['attach', 'pipao', 'build', 'extra'],
      ['nemia factory attach', 'extra'],
    ],
    [
      ['attach', 'pipao', 'build', '--x'],
      ['nemia factory attach', '--x'],
    ],
    [
      ['detach', 'pipao'],
      ['nemia factory detach', '<workflow>'],
    ],
    [
      ['detach', '--step', 'build'],
      ['nemia factory detach', '--step'],
    ],
    [
      ['schedule', 'pipao', 'janitor', '--cron', '0 9 * * 1'],
      ['nemia factory schedule', '--brief'],
    ],
  ];
  for (const [argv, facts] of rows)
    await t.test(argv.join(' '), async () => {
      const repo = pipao('janitor');
      const before = bytesOf('pipao');
      await assert.rejects(main(['factory', ...argv], noEngine()), refused('Invalid', ...facts));
      assert.deepEqual(bytesOf('pipao'), before);
      assert.deepEqual(fileOf('pipao'), { repos: [repo], workflows: ['janitor'] });
    });
});

/** `pipao` attaching `build` and hiring `agora` into its review: the file's bytes, to compare. */
const hiring = (): Buffer => {
  pipao('build');
  hireAgent({ factory: 'pipao', agent: 'agora', step: 'build/review' });
  return bytesOf('pipao');
};

test('REFUSED: `nemia factory hire` and `fire`, nothing written', async (t) => {
  const rows: Array<[string, () => unknown, 'Missing' | 'Conflict' | 'Invalid', string[]]> = [
    [
      'a hire in the default factory is a Conflict, a plain session filling its steps',
      () => main(['factory', 'hire', 'default', 'ada', '--step', 'build/implement'], noEngine()),
      'Conflict',
      ['`default`', 'nemia factory hire'],
    ],
    [
      'a fire in the default factory is a Conflict',
      () => main(['factory', 'fire', 'default', '--step', 'build/implement'], noEngine()),
      'Conflict',
      ['`default`', 'nemia factory fire'],
    ],
    [
      'a hire in no factory is Missing, naming those there are',
      () => main(['factory', 'hire', 'nope', 'ada', '--step', 'build/implement'], noEngine()),
      'Missing',
      ['nope', 'pipao'],
    ],
    ['a fire in no factory is Missing', () => fireAgent({ factory: 'nope', step: 'build/implement' }), 'Missing', ['nope', 'pipao']],
    [
      'a hire in a factory whose name is no slug is Invalid',
      () => hireAgent({ factory: 'Pipao', agent: 'ada', step: 'build/implement' }),
      'Invalid',
      ['`Pipao`'],
    ],
    ...['build', 'build/a/b', 'build/.x', '/x'].map((step): [string, () => unknown, 'Invalid', string[]] => [
      `a hire whose step is not <workflow>/<step>: ${step}`,
      () => hireAgent({ factory: 'pipao', agent: 'ada', step }),
      'Invalid',
      [`--step ${step}`],
    ]),
    [
      'a hire whose agent is no name is Invalid',
      () => hireAgent({ factory: 'pipao', agent: 'a/b', step: 'build/implement' }),
      'Invalid',
      ['`a/b`'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    await t.test(row, async () => {
      const before = hiring();
      await assert.rejects(async () => await act(), refused(tag, ...facts));
      assert.deepEqual(bytesOf('pipao'), before);
      assert.deepEqual(filed(), ['pipao.json']);
    });

  await t.test(
    'a hire into a step whose own file names its agent is a Conflict, naming the file; a file naming none, and no file, take one',
    async () => {
      const repo = pipao('build');
      const before = bytesOf('pipao');
      const theirs = path.join(repo, 'workflows', 'build');
      const yours = path.join(ROOT, 'workflows', 'build');
      for (const dir of [theirs, yours]) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(theirs, 'named.md'), '---\nagent: reviewer\n---\nSay it.\n');
      fs.writeFileSync(path.join(theirs, 'implement.md'), '---\nmodel: opus\n---\nBuild it.\n');
      fs.writeFileSync(path.join(yours, 'yours.md'), '---\nagent: agora\n---\nSay it.\n');
      try {
        await assert.rejects(
          main(['factory', 'hire', 'pipao', 'ada', '--step', 'build/named'], noEngine()),
          refused('Conflict', '`agent: reviewer`', path.join(theirs, 'named.md')),
        );
        assert.throws(
          () => hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/yours' }),
          refused('Conflict', '`agent: agora`', path.join(yours, 'yours.md')),
        );
        assert.deepEqual(bytesOf('pipao'), before);
        hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
        hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/absent' });
        assert.deepEqual(fileOf('pipao').hires, { 'build/implement': 'ada', 'build/absent': 'ada' });
      } finally {
        fs.rmSync(path.join(ROOT, 'workflows'), { recursive: true, force: true });
      }
    },
  );
});

test('REFUSED: `nemia factory attach` and `detach`, nothing written', async (t) => {
  for (const verb of ['attach', 'detach'] as const) {
    const change = verb === 'attach' ? attachWorkflow : detachWorkflow;
    await t.test(`${verb} in the default factory is a Conflict`, async () => {
      pipao();
      await assert.rejects(
        main(['factory', verb, 'default', 'build'], noEngine()),
        refused('Conflict', '`default`', `nemia factory ${verb}`),
      );
    });
    await t.test(`${verb} in no factory is Missing, naming those there are`, async () => {
      pipao();
      await assert.rejects(main(['factory', verb, 'nope', 'build'], noEngine()), refused('Missing', 'nope', 'pipao'));
    });
    for (const workflow of ['', '.git', 'a/b', 'agents', 'skills'])
      await t.test(`${verb} of ${JSON.stringify(workflow)}, which is no workflow's name, is Invalid`, () => {
        pipao();
        const before = bytesOf('pipao');
        assert.throws(() => change({ factory: 'pipao', workflow }), refused('Invalid', workflow));
        assert.deepEqual(bytesOf('pipao'), before);
        assert.deepEqual(filed(), ['pipao.json']);
      });
  }

  await t.test('a detach of a workflow it still hires into is Invalid, naming each fire; once fired, it detaches', () => {
    const repo = pipao('build', 'builder');
    hireAgent({ factory: 'pipao', agent: 'agora', step: 'build/review' });
    hireAgent({ factory: 'pipao', agent: 'ada', step: 'build/implement' });
    hireAgent({ factory: 'pipao', agent: 'otto', step: 'builder/x' });
    const before = bytesOf('pipao');
    assert.throws(
      () => detachWorkflow({ factory: 'pipao', workflow: 'build' }),
      refused(
        'Invalid',
        'pipao',
        'build/implement, build/review',
        'nemia factory fire pipao --step build/implement',
        'nemia factory fire pipao --step build/review',
      ),
    );
    assert.deepEqual(bytesOf('pipao'), before);
    fireAgent({ factory: 'pipao', step: 'build/implement' });
    fireAgent({ factory: 'pipao', step: 'build/review' });
    detachWorkflow({ factory: 'pipao', workflow: 'build' });
    assert.deepEqual(
      fileOf('pipao'),
      { repos: [repo], workflows: ['builder'], hires: { 'builder/x': 'otto' } },
      "builder's hire does not hold build",
    );
  });
});

test('REFUSED: `nemia factory schedule` and `unschedule`, nothing written', async (t) => {
  const at = { factory: 'pipao', workflow: 'janitor', cron: '0 9 * * 1', brief: 'Read the stats' };
  const rows: Array<[string, (repo: string) => unknown, 'Missing' | 'Invalid', (repo: string) => string[]]> = [
    [
      'a cron Cron does not read, quoting it',
      () => setSchedule({ ...at, cron: '61 * * * *' }),
      'Invalid',
      () => ['--cron "61 * * * *"', '59'],
    ],
    ['a zone Cron does not read', () => setSchedule({ ...at, tz: 'Not/AZone' }), 'Invalid', () => ['--tz Not/AZone']],
    ['a cron that never fires', () => setSchedule({ ...at, cron: '0 0 30 2 *', tz: 'UTC' }), 'Invalid', () => ['--cron']],
    ['an empty brief', () => setSchedule({ ...at, brief: '  ' }), 'Invalid', () => ['--brief']],
    [
      "a repository not the factory's",
      () => setSchedule({ ...at, repo: '/elsewhere' }),
      'Invalid',
      (repo) => ['/elsewhere', 'pipao', repo, '--repo'],
    ],
    [
      'a bad cron through the command line',
      () => main(['factory', 'schedule', 'pipao', 'janitor', '--cron', '61 * * * *', '--brief', 'Read the stats'], noEngine()),
      'Invalid',
      () => ['--cron "61 * * * *"', '59'],
    ],
    [
      'a bad zone through the command line',
      () => main(['factory', 'schedule', 'pipao', 'janitor', '--cron', '0 9 * * 1', '--brief', 'x', '--tz', 'Not/AZone'], noEngine()),
      'Invalid',
      () => ['--tz Not/AZone'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    await t.test(row, async () => {
      const repo = pipao('janitor');
      const before = bytesOf('pipao');
      await assert.rejects(async () => await act(repo), refused(tag, ...facts(repo)));
      assert.deepEqual(bytesOf('pipao'), before);
    });

  await t.test('no repository named in a factory of two, which a scheduled start could not choose between; one named is taken', () => {
    const repo = fresh();
    const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    addFactory({ name: 'pipao', repos: [repo, other] });
    attachWorkflow({ factory: 'pipao', workflow: 'janitor' });
    assert.throws(() => setSchedule(at), refused('Invalid', 'pipao', '--repo'));
    assert.equal(setSchedule({ ...at, repo: other }).schedule.repo, other);
  });
});

test('a factory file that does not read: listed with why, the others still listed, and refused to hire, fire, attach, detach and start', async (t) => {
  await t.test('`nemia factory ls` lists each with why, by name, a hidden file not at all', async (sub) => {
    const repo = fresh();
    await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
    fs.writeFileSync(path.join(FACTORIES, 'empty.json'), '{}\n');
    fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{"repos": [');
    fs.writeFileSync(path.join(FACTORIES, 'none.json'), '{"repos": []}\n');
    fs.writeFileSync(path.join(FACTORIES, '.pipao.json.123.abcd'), '{"repos": ["/x"]}\n');
    fs.writeFileSync(path.join(FACTORIES, '.hidden.json'), '{"repos": ["/x"]}\n');
    const listed = await printedBy(sub, 'factory', 'ls');
    assert.equal(listed[0].split(' ')[0], 'default');
    assert.match(listed[1], /^empty {4}\S*empty\.json .*`repos`.* nemia factory rm empty/);
    assert.match(listed[2], /^none {5}\S*none\.json .*`repos.0`.* nemia factory rm none/);
    assert.equal(listed[3], `pipao    ${repo}`);
    assert.match(listed[4], /^torn {5}\S*torn\.json .*JSON/);
    assert.deepEqual([listed[5], listed.length], ['', 7]);
  });

  await t.test('a default.json written by hand is listed as a file to remove, never as the default factory or a factory', async (sub) => {
    const repo = fresh();
    await main(['factory', 'add', 'pipao', '--repo', repo], noEngine());
    fs.writeFileSync(path.join(FACTORIES, 'default.json'), '{"repos": ["/x"]}\n');
    const listed = await printedBy(sub, 'factory', 'ls');
    assert.equal(listed[0], 'default  every run and card that names no factory — read, never written');
    assert.ok(listed[1].startsWith(`default  ${path.join(FACTORIES, 'default.json')} `), listed[1]);
    names(listed[1], 'nemia factory rm');
    assert.equal(listed[2], `pipao    ${repo}`);
    assert.deepEqual(
      readFactories().flatMap((f) => ('repos' in f ? [f.name] : [])),
      ['pipao'],
    );
  });

  for (const [key, verbs] of [
    ['hires', 'hire and fire'],
    ['workflows', 'attach and detach'],
  ] as const)
    await t.test(`\`${key}\` that does not read: ${verbs} are Invalid, the bytes left; a read names it; no such factory is Missing`, () => {
      fresh();
      fs.mkdirSync(FACTORIES, { recursive: true });
      fs.writeFileSync(path.join(FACTORIES, 'bent.json'), `{"repos": ["/x"], "${key}": 3}\n`);
      const before = bytesOf('bent');
      const bent = readFactories().find((f) => f.name === 'bent');
      assert.ok(bent && 'error' in bent, 'listed with why');
      names(bent.error, `\`${key}\``);
      assert.throws(() => readFactory('bent'), refused('Invalid', 'bent', path.join(FACTORIES, 'bent.json'), `\`${key}\``));
      const acts =
        key === 'hires'
          ? [
              () => hireAgent({ factory: 'bent', agent: 'ada', step: 'build/implement' }),
              () => fireAgent({ factory: 'bent', step: 'build/implement' }),
            ]
          : [() => attachWorkflow({ factory: 'bent', workflow: 'build' }), () => detachWorkflow({ factory: 'bent', workflow: 'build' })];
      for (const act of acts) assert.throws(act, refused('Invalid', 'bent'));
      assert.deepEqual(bytesOf('bent'), before);
      assert.throws(() => readFactory('nope'), refused('Missing', 'nope', 'bent'));
    });
});

test("a factory's revisions: pinned when its file says nothing, written by `nemia factory revisions`, and a third value refused", async (t) => {
  const { revisionsOf } = await import('./factory.ts');
  await t.test('absent reads pinned; the verb writes follow, every other key kept, and ls prints it', async (sub) => {
    pipao('build');
    assert.equal(revisionsOf(readFactory('pipao')), 'pinned', 'a factory that says nothing keeps its runs pinned');
    await main(['factory', 'revisions', 'pipao', 'follow'], noEngine());
    assert.deepEqual(
      [fileOf('pipao').revisions, fileOf('pipao').workflows, revisionsOf(readFactory('pipao'))],
      ['follow', ['build'], 'follow'],
    );
    names((await printedBy(sub, 'factory', 'ls')).join('\n'), 'revisions: follow');
  });

  await t.test('a file whose `revisions` is neither follow nor pinned does not read, naming the key', () => {
    fresh();
    fs.mkdirSync(FACTORIES, { recursive: true });
    fs.writeFileSync(path.join(FACTORIES, 'bent.json'), '{"repos": ["/x"], "revisions": "always"}\n');
    assert.throws(() => readFactory('bent'), refused('Invalid', 'bent', '`revisions`'));
  });

  for (const [row, argv, tag] of [
    ['the default factory is a Conflict', ['factory', 'revisions', 'default', 'follow'], 'Conflict'],
    ['a policy that is neither is refused before the file is read', ['factory', 'revisions', 'pipao', 'always'], 'Invalid'],
    ['no such factory is Missing', ['factory', 'revisions', 'nope', 'follow'], 'Missing'],
  ] as const)
    await t.test(`REFUSED: ${row}, nothing written`, async () => {
      pipao();
      const before = bytesOf('pipao');
      await assert.rejects(main([...argv], noEngine()), refused(tag));
      assert.deepEqual(bytesOf('pipao'), before);
    });
});
