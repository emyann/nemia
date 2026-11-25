/**
 * The factories on disk, `$WF_ROOT/factories/`, as tables: what each `nemia factory` verb refuses — each row refused by kind (`_tag`),
 * exit 2 and the facts its words name, and nothing written — and what `nemia factory ls` says of a file that does not read. And the
 * create that two adds of one name cannot both win, a race kept focused. What a factory's door refuses of any layer — a name taken, the
 * default factory filed, no factory to remove — is its walks' (`test/factory-walks.ts`), and what a change of its wiring refuses for what
 * it offers, hires and schedules is `wiringRefusal`'s laws (`contracts/wiring.contract.ts`): these rows keep what only the verbs and the
 * disk say.
 *
 * A factory filed, given workflows, hires and a schedule, listed, started in and removed is a person's story, in
 * `test/factory-start.test.ts`; names and lines are pure, in `factory.test.ts`. Its store is at `ROOT`, given as `ENV`.
 */
import { describe, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { eachTest } from '../../test/placed.ts';
import { heldUnasked } from '../../test/unasked.ts';
import { names } from '../../test/assessed.ts';
import {
  addFactoryAt,
  attachWorkflowAt,
  fireAgentAt,
  hireAgentAt,
  readFactoriesAt,
  readFactoryAt,
  setScheduleAt,
  volumesMovedAt,
  wiringChecked,
} from './factory.store.ts';
import { detached } from '../../test/factory-planted.ts';
import { typed } from '../../test/typed.ts';
import { engineOf } from '../runtime-client.ts';
import { revisionsOf, type Factory } from './factory.ts';
import { volumeBase } from './volume/volume.ts';
import { treeDir } from './applied/applied.store.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-factory-');
const FACTORIES = path.join(ROOT, 'factories');

const ENV: Env = { ...process.env, WF_ROOT: ROOT };
/** A command line run onto its entry's handler over this file's store, `ENV`, as the api calls it (`typed`). */
const main = (argv: readonly string[], e: ReturnType<typeof noEngine>) => typed(argv, e, undefined, undefined, ENV);

const engine = eachTest(testEngine);
heldUnasked(engine);

/** The engine of this test: the stand-in, which no command here files on, stops, says to or forgets from (`heldUnasked`). */
const noEngine = () => engineOf(engine().layer);

type Refusal = Error & { exitCode?: number; _tag?: string };

/** Refused by kind, exit 2, and the facts its words name — never its sentence. */
const refused =
  (tag: 'Missing' | 'Conflict' | 'Invalid', ...facts: string[]) =>
  (err: Refusal) => {
    assert.deepEqual([err._tag, err.exitCode], [tag, 2], err.message);
    names(err.message, ...facts);
    return true as const satisfies true;
  };

/** The paths of `volumes` that are writable: the repositories a factory works on. */
const writable = (volumes: readonly { path: string; readOnly: boolean }[] | undefined) =>
  volumes?.filter((v) => !v.readOnly).map((v) => v.path) satisfies string[] | undefined;

/** The factories `nemia factory ls` reads, by name: each with the repositories it works on, or the file that does not read and why. */
const listedBy = async () => {
  const { factories } = (await main(['factory', 'ls'], noEngine())) as {
    factories: Array<{ name: string; volumes?: readonly { path: string; readOnly: boolean }[]; file: string; error?: string }>;
  };
  return factories.map((f) => [f.name, f.error === undefined ? writable(f.volumes) : `${f.file} ${f.error}`]);
};

/** The files in the factories folder, hidden ones too, by name. */
const filed = () => (fs.existsSync(FACTORIES) ? fs.readdirSync(FACTORIES).sort() : []);
/** The repositories the factory `name`'s file works on: its writable volumes' paths. */
const reposIn = (name: string) => writable(JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8')).volumes) as unknown;
/** The factory `name`'s file, as JSON. */
const fileOf = (name: string) => JSON.parse(fs.readFileSync(path.join(FACTORIES, `${name}.json`), 'utf8')) as Record<string, unknown>;
/** The bytes of the factory `name`'s file. */
const bytesOf = (name: string) => fs.readFileSync(path.join(FACTORIES, `${name}.json`)) satisfies Buffer;

/** An empty folder of factories, and a plain directory to name as a repository: no `.git`, which the store asks for of none (the verb asks
 * the place). */
const fresh = () => {
  fs.rmSync(FACTORIES, { recursive: true, force: true });
  return fs.mkdtempSync(path.join(ROOT, 'repo-'));
};

/** `fresh`, and the factory `pipao` filed on its repository, with `workflows` attached: the repository. */
const pipao = (...workflows: string[]) => {
  const repo = fresh();
  addFactoryAt(ROOT, { name: 'pipao', volumes: [repo].map((r) => `${r}:rw`) });
  for (const workflow of workflows) attachWorkflowAt(ROOT, { factory: 'pipao', workflow });
  return repo;
};

test('REFUSED: two adds of one name, the second while the first is between its write and its link, file one and refuse the other', () => {
  const first = fresh();
  const second = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const link = fs.linkSync;
  let raced: unknown;
  // oxlint-disable-next-line landmines-testing/no-test-doubles -- a second add between write and link: a race no seam gives
  const mocked = vi.spyOn(fs, 'linkSync').mockImplementation((from: fs.PathLike, to: fs.PathLike) => {
    mocked.mockRestore();
    raced = addFactoryAt(ROOT, { name: 'pipao', volumes: [second].map((r) => `${r}:rw`) });
    return link(from, to);
  });
  assert.throws(() => addFactoryAt(ROOT, { name: 'pipao', volumes: [first].map((r) => `${r}:rw`) }), refused('Conflict', 'pipao'));
  assert.ok(raced, 'the second add, run between the first write and its link, filed the factory');
  assert.deepEqual(reposIn('pipao'), [second], 'the file is the one that won, never overwritten');
  assert.deepEqual(filed(), ['pipao.json']);
});

test('a factory with no volume is filed, working on no repository yet, its instruction kept in the store', async () => {
  fresh();
  await main(['factory', 'add', 'acme'], noEngine());
  assert.deepEqual(fileOf('acme'), { volumes: [], instruction: { store: true }, generation: 1 });
  assert.deepEqual(await listedBy(), [['acme', []]]);
});

describe("an earlier release's file is moved once to one list of volumes, its repositories writable, and no key of the old shape kept", () => {
  const write = (name: string, content: object) => {
    fs.mkdirSync(FACTORIES, { recursive: true });
    fs.writeFileSync(path.join(FACTORIES, `${name}.json`), `${JSON.stringify(content)}\n`);
  };
  test('repositories first, writable, with their origins; the extra folders after, read-only, names and origins kept', () => {
    fresh();
    write('mill', {
      repos: ['/r/one', '/r/two'],
      origins: { '/r/two': 'https://h/o/two.git' },
      volumes: [{ path: '/data', readOnly: true, name: 'data' }],
      workflows: ['build'],
      workflowRepos: { build: 'one' },
    });
    write('new', { volumes: [{ path: '/r/three', readOnly: false }] });
    const before = bytesOf('new');
    assert.deepEqual(volumesMovedAt(ROOT), { moved: [path.join(FACTORIES, 'mill.json')], left: [] });
    assert.deepEqual(fileOf('mill'), {
      volumes: [
        { path: '/r/one', readOnly: false },
        { path: '/r/two', readOnly: false, origin: 'https://h/o/two.git' },
        { path: '/data', readOnly: true, name: 'data' },
      ],
      workflows: ['build'],
      workflowRepos: { build: 'one' },
    });
    assert.deepEqual(bytesOf('new'), before, 'a file of the new shape is not written');
  });
  test('a second start moves nothing', () => {
    const before = bytesOf('mill');
    assert.deepEqual(volumesMovedAt(ROOT), { moved: [], left: [] });
    assert.deepEqual(bytesOf('mill'), before);
  });
  test('a file whose repositories repeat is left as it was, with why, and reads as one of the old shape naming nemia up', () => {
    fresh();
    write('twice', { repos: ['/r/one', '/r/one'] });
    const before = bytesOf('twice');
    const { moved, left } = volumesMovedAt(ROOT);
    assert.deepEqual([moved, left.map((l) => l.file)], [[], [path.join(FACTORIES, 'twice.json')]]);
    assert.deepEqual(bytesOf('twice'), before);
    assert.throws(() => readFactoryAt(ROOT, 'twice'), refused('Invalid', 'twice', 'nemia up'));
  });
});

describe('REFUSED: `nemia factory add`, nothing filed', () => {
  test('--repo is Invalid, naming --volume: a repository is a writable volume', async () => {
    const repo = fresh();
    await assert.rejects(main(['factory', 'add', 'pipao', '--repo', repo], noEngine()), refused('Invalid', '--volume'));
    assert.deepEqual(filed(), []);
  });
  test('a volume with no mark is Invalid', async () => {
    const repo = fresh();
    await assert.rejects(main(['factory', 'add', 'pipao', '--volume', repo], noEngine()), refused('Invalid', repo));
    assert.deepEqual(filed(), []);
  });
  test('a --volume missing, or a file, is Invalid, naming each', async () => {
    const repo = fresh();
    const gone = path.join(ROOT, 'no-such-dir');
    const aFile = path.join(repo, 'README.md');
    fs.writeFileSync(aFile, 'not a directory\n');
    await assert.rejects(
      main(['factory', 'add', 'pipao', '--volume', `${repo}:rw`, '--volume', `${gone}:ro`, '--volume', `${aFile}:rw`], noEngine()),
      refused('Invalid', gone, aFile),
    );
    await assert.rejects(main(['factory', 'add', 'pipao', '--volume', `${gone}:rw`], noEngine()), refused('Invalid', gone));
    assert.deepEqual(filed(), []);
  });
  for (const name of ['../x', 'Nemia', '.hidden', 'a/b'])
    test(`a name that is no slug, ${name}, is Invalid before any path is made of it`, async () => {
      const repo = fresh();
      await assert.rejects(main(['factory', 'add', name, '--volume', `${repo}:rw`], noEngine()), refused('Invalid', `\`${name}\``));
      assert.ok(!fs.existsSync(FACTORIES), 'not even the folder');
      assert.ok(!fs.existsSync(path.join(ROOT, 'x.json')));
    });
});

describe('REFUSED: `nemia factory rm`, nothing removed', () => {
  const rows: Array<[string, string, 'Missing' | 'Conflict' | 'Invalid', string[]]> = [
    ['the default factory is a Conflict', 'default', 'Conflict', ['nemia factory rm']],
    ['a name that is no slug is Invalid', '../runs', 'Invalid', ['`../runs`']],
  ];
  for (const [row, name, tag, facts] of rows)
    test(row, async () => {
      pipao();
      await assert.rejects(main(['factory', 'rm', name], noEngine()), refused(tag, ...facts));
      assert.deepEqual(filed(), ['pipao.json']);
    });
});

describe('REFUSED: `nemia factory` typed with a subcommand, a flag or an argument it does not take, each by name, nothing written', () => {
  const rows: Array<[string[], string[]]> = [
    [
      ['frob'],
      [
        'nemia factory',
        'frob',
        'nemia factory ls',
        'nemia factory add <name> [--volume <path|url>:rw]',
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
      ['add', 'acme', '--template', 'mill', '--volume', '/x:rw'],
      ['--template', 'nemia factory apply <name> --template <name|folder|archive> [--volume <path|url>:ro|:rw ...]', '--set <key>=<value>'],
    ],
    [['add', 'acme', '--template=mill', '--volume', '/x:rw'], ['nemia factory apply <name> --template']],
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
    test(argv.join(' '), async () => {
      const repo = pipao('janitor');
      const before = bytesOf('pipao');
      await assert.rejects(main(['factory', ...argv], noEngine()), refused('Invalid', ...facts));
      assert.deepEqual(bytesOf('pipao'), before);
      assert.deepEqual(fileOf('pipao'), {
        volumes: [{ path: repo, readOnly: false, name: volumeBase(repo) }],
        workflows: ['janitor'],
        generation: 2,
      });
    });
});

/** `pipao` attaching `build` and hiring `agora` into its review: the file's bytes, to compare. */
const hiring = () => {
  pipao('build');
  hireAgentAt(ROOT, { factory: 'pipao', agent: 'agora', step: 'build/review' });
  return bytesOf('pipao') satisfies Buffer;
};

describe('REFUSED: `nemia factory hire` and `fire`, nothing written', () => {
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
    [
      'a fire in no factory is Missing',
      () => fireAgentAt(ROOT, { factory: 'nope', step: 'build/implement' }),
      'Missing',
      ['nope', 'pipao'],
    ],
    [
      'a hire in a factory whose name is no slug is Invalid',
      () => hireAgentAt(ROOT, { factory: 'Pipao', agent: 'ada', step: 'build/implement' }),
      'Invalid',
      ['`Pipao`'],
    ],
    ...['build', 'build/a/b', 'build/.x', '/x'].map(
      (step) =>
        [
          `a hire whose step is not <workflow>/<step>: ${step}`,
          () => hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step }),
          'Invalid',
          [`--step ${step}`],
        ] satisfies [string, () => unknown, 'Invalid', string[]],
    ),
    [
      'a hire whose agent is no name is Invalid',
      () => hireAgentAt(ROOT, { factory: 'pipao', agent: 'a/b', step: 'build/implement' }),
      'Invalid',
      ['`a/b`'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    test(row, async () => {
      const before = hiring();
      await assert.rejects(async () => await act(), refused(tag, ...facts));
      assert.deepEqual(bytesOf('pipao'), before);
      assert.deepEqual(filed(), ['pipao.json']);
    });
  test('a hire into a step whose own file names its agent is a Conflict, naming the file; a file naming none, and no file, take one', async () => {
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
        () => hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step: 'build/yours' }),
        refused('Conflict', '`agent: agora`', path.join(yours, 'yours.md')),
      );
      assert.deepEqual(bytesOf('pipao'), before);
      hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step: 'build/implement' });
      hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step: 'build/absent' });
      assert.deepEqual(fileOf('pipao').hires, { 'build/implement': 'ada', 'build/absent': 'ada' });
    } finally {
      fs.rmSync(path.join(ROOT, 'workflows'), { recursive: true, force: true });
    }
  });
});

describe('REFUSED: `nemia factory attach` and `detach`, nothing written', () => {
  for (const verb of ['attach', 'detach'] as const) {
    const change = (workflow: string, factory = 'pipao') =>
      verb === 'attach' ? attachWorkflowAt(ROOT, { factory, workflow }) : detached(ROOT, factory, workflow);
    test(`${verb} in the default factory is a Conflict`, async () => {
      pipao();
      await assert.rejects(
        main(['factory', verb, 'default', 'build'], noEngine()),
        refused('Conflict', '`default`', `nemia factory ${verb}`),
      );
    });
    test(`${verb} in no factory is Missing, naming those there are`, async () => {
      pipao();
      await assert.rejects(main(['factory', verb, 'nope', 'build'], noEngine()), refused('Missing', 'nope', 'pipao'));
    });
    for (const workflow of ['', '.git', 'a/b', 'agents', 'skills'])
      test(`${verb} of ${JSON.stringify(workflow)}, which is no workflow's name, is Invalid`, () => {
        pipao();
        const before = bytesOf('pipao');
        assert.throws(() => change(workflow), refused('Invalid', workflow));
        assert.deepEqual(bytesOf('pipao'), before);
        assert.deepEqual(filed(), ['pipao.json']);
      });
  }
  test('a detach of a workflow it still hires into is Invalid, naming each fire; once fired, it detaches', () => {
    const repo = pipao('build', 'builder');
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'agora', step: 'build/review' });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'ada', step: 'build/implement' });
    hireAgentAt(ROOT, { factory: 'pipao', agent: 'otto', step: 'builder/x' });
    const before = bytesOf('pipao');
    assert.throws(
      () => detached(ROOT, 'pipao', 'build'),
      refused(
        'Invalid',
        'pipao',
        'build/implement, build/review',
        'nemia factory fire pipao --step build/implement',
        'nemia factory fire pipao --step build/review',
      ),
    );
    assert.deepEqual(bytesOf('pipao'), before);
    fireAgentAt(ROOT, { factory: 'pipao', step: 'build/implement' });
    fireAgentAt(ROOT, { factory: 'pipao', step: 'build/review' });
    detached(ROOT, 'pipao', 'build');
    assert.deepEqual(
      fileOf('pipao'),
      {
        volumes: [{ path: repo, readOnly: false, name: volumeBase(repo) }],
        workflows: ['builder'],
        hires: { 'builder/x': 'otto' },
        generation: 9,
      },
      "builder's hire does not hold build",
    );
  });
});

describe('REFUSED: an attach naming a repository the factory has no folder of that name for, nothing written; one named is written to its file, and a detach takes it off', () => {
  const shop = () => {
    const repo = fresh();
    addFactoryAt(ROOT, { name: 'shop', volumes: [repo].map((r) => `${r}:rw`) });
    attachWorkflowAt(ROOT, { factory: 'shop', workflow: 'dev' });
    return repo;
  };
  test('an unknown name is Invalid, naming the attach and the folder names to choose from', async () => {
    const repo = shop();
    const before = bytesOf('shop');
    await assert.rejects(
      main(['factory', 'attach', 'shop', 'dev', '--repo', 'nope'], noEngine()),
      refused('Invalid', 'nope', 'nemia factory attach shop dev --repo', path.basename(repo)),
    );
    assert.deepEqual(bytesOf('shop'), before);
  });
  test("its folder's name is kept in the factory's own file, and a detach takes it off with the workflow", async () => {
    const repo = shop();
    await main(['factory', 'attach', 'shop', 'dev', '--repo', path.basename(repo)], noEngine());
    assert.deepEqual(fileOf('shop').workflowRepos, { dev: path.basename(repo) });
    assert.deepEqual(readFactoryAt(ROOT, 'shop').workflowRepos, { dev: path.basename(repo) });
    detached(ROOT, 'shop', 'dev');
    assert.equal(fileOf('shop').workflowRepos, undefined);
  });
});

describe('REFUSED: `nemia factory schedule` and `unschedule`, nothing written', () => {
  const at = { factory: 'pipao', workflow: 'janitor', cron: '0 9 * * 1', brief: 'Read the stats' };
  const attach = `nemia factory attach ${at.factory} ${at.workflow} --repo`;
  const rows: Array<[string, (repo: string) => unknown, 'Missing' | 'Invalid', (repo: string) => string[]]> = [
    [
      'a cron Cron does not read, quoting it',
      () => setScheduleAt(ROOT, { ...at, cron: '61 * * * *' }),
      'Invalid',
      () => ['--cron "61 * * * *"', '59'],
    ],
    ['a zone Cron does not read', () => setScheduleAt(ROOT, { ...at, tz: 'Not/AZone' }), 'Invalid', () => ['--tz Not/AZone']],
    ['a cron that never fires', () => setScheduleAt(ROOT, { ...at, cron: '0 0 30 2 *', tz: 'UTC' }), 'Invalid', () => ['--cron']],
    ['an empty brief', () => setScheduleAt(ROOT, { ...at, brief: '  ' }), 'Invalid', () => ['--brief']],
    [
      'a repository set, which is retired: the wiring places its runs',
      () => setScheduleAt(ROOT, { ...at, repo: '/elsewhere' }),
      'Invalid',
      () => [attach],
    ],
    ["the factory's own repository set, retired all the same", (repo) => setScheduleAt(ROOT, { ...at, repo }), 'Invalid', () => [attach]],
    [
      'a bad cron through the command line',
      () => main(['factory', 'schedule', 'pipao', 'janitor', '--cron', '61 * * * *', '--brief', 'Read the stats'], noEngine()),
      'Invalid',
      () => ['--cron "61 * * * *"', '59'],
    ],
    [
      'a repository through the command line, its flag retired',
      () => main(['factory', 'schedule', at.factory, at.workflow, '--cron', at.cron, '--brief', 'x', '--repo', '/elsewhere'], noEngine()),
      'Invalid',
      () => [attach],
    ],
    [
      'a bad zone through the command line',
      () => main(['factory', 'schedule', 'pipao', 'janitor', '--cron', '0 9 * * 1', '--brief', 'x', '--tz', 'Not/AZone'], noEngine()),
      'Invalid',
      () => ['--tz Not/AZone'],
    ],
  ];
  for (const [row, act, tag, facts] of rows)
    test(row, async () => {
      const repo = pipao('janitor');
      const before = bytesOf('pipao');
      await assert.rejects(async () => await act(repo), refused(tag, ...facts(repo)));
      assert.deepEqual(bytesOf('pipao'), before);
    });
  test('a workflow the wiring places on none of a factory of two is refused naming the attach; one wired is written', () => {
    const repo = fresh();
    const other = fs.mkdtempSync(path.join(ROOT, 'repo-'));
    addFactoryAt(ROOT, { name: at.factory, volumes: [repo, other].map((r) => `${r}:rw`) });
    attachWorkflowAt(ROOT, at);
    const before = bytesOf(at.factory);
    assert.throws(() => setScheduleAt(ROOT, at), refused('Invalid', attach));
    assert.deepEqual(bytesOf(at.factory), before);
    attachWorkflowAt(ROOT, { ...at, repo: path.basename(other) });
    const written = setScheduleAt(ROOT, at).schedule;
    assert.equal(written.repo, undefined);
    assert.deepEqual(readFactoryAt(ROOT, at.factory).schedules[at.workflow], written);
  });
  test("an old schedule's repository sent back as it is, as a Schedule's object reads it, is written; another is refused", () => {
    const repo = pipao(at.workflow);
    const file = path.join(FACTORIES, `${at.factory}.json`);
    const old = { cron: '0 9 * * 1', brief: 'Read the stats', repo, since: '2026-01-01T00:00:00.000Z' };
    fs.writeFileSync(file, `${JSON.stringify({ ...fileOf(at.factory), schedules: { [at.workflow]: old } })}\n`);
    const before = bytesOf(at.factory);
    assert.throws(() => setScheduleAt(ROOT, { ...at, repo: path.join(ROOT, 'elsewhere') }), refused('Invalid', attach));
    assert.deepEqual(bytesOf(at.factory), before);
    const again = setScheduleAt(ROOT, { ...at, cron: '0 10 * * 1', repo });
    assert.deepEqual(again.replaced, old);
    assert.equal(readFactoryAt(ROOT, at.factory).schedules[at.workflow]?.cron, '0 10 * * 1');
  });
});

describe('a factory file that does not read: listed with why, the others still listed, and refused to hire, fire, attach, detach and start', () => {
  test('`nemia factory ls` lists each with why, by name, a hidden file not at all', async () => {
    const repo = fresh();
    addFactoryAt(ROOT, { name: 'pipao', volumes: [`${repo}:rw`] });
    fs.writeFileSync(path.join(FACTORIES, 'empty.json'), '{}\n');
    fs.writeFileSync(path.join(FACTORIES, 'torn.json'), '{"volumes": [');
    fs.writeFileSync(path.join(FACTORIES, 'old.json'), '{"repos": ["/x"]}\n');
    fs.writeFileSync(path.join(FACTORIES, '.pipao.json.123.abcd'), '{"volumes": []}\n');
    fs.writeFileSync(path.join(FACTORIES, '.hidden.json'), '{"volumes": []}\n');
    const listed = await listedBy();
    const [empty, old, made, torn] = listed;
    assert.deepEqual([empty?.[0], old?.[0], torn?.[0], listed.length], ['empty', 'old', 'torn', 4]);
    names(String(empty?.[1]), 'empty.json', '`volumes`', 'nemia factory rm empty');
    names(String(old?.[1]), 'old.json', 'nemia up');
    assert.deepEqual(made, ['pipao', [repo]]);
    assert.match(String(torn?.[1]), /torn\.json .*JSON/);
  });
  test('a default.json written by hand is listed as a file to remove, never as the default factory or a factory', async () => {
    const repo = fresh();
    addFactoryAt(ROOT, { name: 'pipao', volumes: [`${repo}:rw`] });
    fs.writeFileSync(path.join(FACTORIES, 'default.json'), '{"volumes": []}\n');
    const listed = await listedBy();
    assert.deepEqual([listed[0]?.[0], listed.length], ['default', 2]);
    assert.ok(String(listed[0]?.[1]).startsWith(`${path.join(FACTORIES, 'default.json')} `), String(listed[0]?.[1]));
    names(String(listed[0]?.[1]), 'nemia factory rm');
    assert.deepEqual(listed[1], ['pipao', [repo]]);
    assert.deepEqual(
      readFactoriesAt(ROOT).flatMap((f) => ('volumes' in f ? [f.name] : [])),
      ['pipao'],
    );
  });
  for (const [key, verbs] of [
    ['hires', 'hire and fire'],
    ['workflows', 'attach and detach'],
  ] as const)
    test(`\`${key}\` that does not read: ${verbs} are Invalid, the bytes left; a read names it; no such factory is Missing`, () => {
      fresh();
      fs.mkdirSync(FACTORIES, { recursive: true });
      fs.writeFileSync(path.join(FACTORIES, 'bent.json'), `{"volumes": [], "${key}": 3}\n`);
      const before = bytesOf('bent');
      const bent = readFactoriesAt(ROOT).find((f) => f.name === 'bent');
      assert.ok(bent && 'error' in bent, 'listed with why');
      names(bent.error, `\`${key}\``);
      assert.throws(() => readFactoryAt(ROOT, 'bent'), refused('Invalid', 'bent', path.join(FACTORIES, 'bent.json'), `\`${key}\``));
      const acts =
        key === 'hires'
          ? [
              () => hireAgentAt(ROOT, { factory: 'bent', agent: 'ada', step: 'build/implement' }),
              () => fireAgentAt(ROOT, { factory: 'bent', step: 'build/implement' }),
            ]
          : [() => attachWorkflowAt(ROOT, { factory: 'bent', workflow: 'build' }), () => detached(ROOT, 'bent', 'build')];
      for (const act of acts) assert.throws(act, refused('Invalid', 'bent'));
      assert.deepEqual(bytesOf('bent'), before);
      assert.throws(() => readFactoryAt(ROOT, 'nope'), refused('Missing', 'nope', 'bent'));
    });
});

describe("a factory's revisions: pinned when its file says nothing, written by `nemia factory revisions`, and a third value refused", () => {
  test('absent reads pinned; the verb writes follow, every other key kept, and ls reads it', async () => {
    pipao('build');
    assert.equal(revisionsOf(readFactoryAt(ROOT, 'pipao')), 'pinned', 'a factory that says nothing keeps its runs pinned');
    await main(['factory', 'revisions', 'pipao', 'follow'], noEngine());
    assert.deepEqual(
      [fileOf('pipao').revisions, fileOf('pipao').workflows, revisionsOf(readFactoryAt(ROOT, 'pipao'))],
      ['follow', ['build'], 'follow'],
    );
    const { factories } = (await main(['factory', 'ls'], noEngine())) as { factories: Array<{ name: string; revisions?: string }> };
    assert.ok(
      factories.some((f) => f.revisions === 'follow'),
      'the listing reads the policy written',
    );
  });
  test('a file whose `revisions` is neither follow nor pinned does not read, naming the key', () => {
    fresh();
    fs.mkdirSync(FACTORIES, { recursive: true });
    fs.writeFileSync(path.join(FACTORIES, 'bent.json'), '{"volumes": [], "revisions": "always"}\n');
    assert.throws(() => readFactoryAt(ROOT, 'bent'), refused('Invalid', 'bent', '`revisions`'));
  });
  for (const [row, argv, tag] of [
    ['the default factory is a Conflict', ['factory', 'revisions', 'default', 'follow'], 'Conflict'],
    ['a policy that is neither is refused before the file is read', ['factory', 'revisions', 'pipao', 'always'], 'Invalid'],
    ['no such factory is Missing', ['factory', 'revisions', 'nope', 'follow'], 'Missing'],
  ] as const)
    test(`REFUSED: ${row}, nothing written`, async () => {
      pipao();
      const before = bytesOf('pipao');
      await assert.rejects(main([...argv], noEngine()), refused(tag));
      assert.deepEqual(bytesOf('pipao'), before);
    });
});

describe('REFUSED: a detach of a workflow its template still triggers', () => {
  const treeTriggering = (workflow: string) => {
    const tree = scratch('wf-tree-triggers-');
    const trigger = { selector: 'ready', target: { kind: 'Workflow', name: workflow }, since: '' };
    fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: [workflow], hires: {}, triggers: { door: trigger } }));
    return tree;
  };
  const templated = (tree: string) => {
    const factory: Factory = { name: 'acme', volumes: [], workflows: ['front-door'], hires: {}, schedules: {}, tree };
    return factory;
  };
  test("its template's trigger on it refuses the detach as Invalid, naming the trigger; one on another workflow lets it go", () => {
    assert.throws(
      () => wiringChecked(templated(treeTriggering('front-door')), { verb: 'detach', workflow: 'front-door' }),
      refused('Invalid', 'door', 'front-door'),
    );
    assert.deepEqual(wiringChecked(templated(treeTriggering('intake')), { verb: 'detach', workflow: 'front-door' }).workflows, []);
  });
});

describe('the values each label key takes: a hand-made factory reads its file, a templated one its tree', () => {
  test("a hand-made factory's file states them, and a verb that writes it back keeps them", () => {
    pipao();
    const file = path.join(FACTORIES, 'pipao.json');
    fs.writeFileSync(file, JSON.stringify({ ...fileOf('pipao'), labelValues: { work: ['feature', 'fix'] } }));
    assert.deepEqual(readFactoryAt(ROOT, 'pipao').labelValues, { work: ['feature', 'fix'] });
    attachWorkflowAt(ROOT, { factory: 'pipao', workflow: 'build' });
    assert.deepEqual(fileOf('pipao').labelValues, { work: ['feature', 'fix'] });
    assert.deepEqual(readFactoryAt(ROOT, 'pipao').labelValues, { work: ['feature', 'fix'] });
  });
  test("a templated factory reads its tree's wiring, never its file's", () => {
    fresh();
    fs.mkdirSync(FACTORIES, { recursive: true });
    fs.writeFileSync(
      path.join(FACTORIES, 'acme.json'),
      JSON.stringify({ volumes: [], labelValues: { work: ['ignored'] }, template: { source: 't', version: '1.0.0', params: {} } }),
    );
    const tree = treeDir(ROOT, 'acme');
    fs.mkdirSync(tree, { recursive: true });
    fs.writeFileSync(path.join(tree, 'factory.json'), JSON.stringify({ workflows: [], hires: {}, labelValues: { work: ['fix'] } }));
    assert.deepEqual(readFactoryAt(ROOT, 'acme').labelValues, { work: ['fix'] });
  });
});
