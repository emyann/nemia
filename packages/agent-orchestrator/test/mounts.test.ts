/**
 * The folders a step is filed beyond its workspace, on every filing — a person's stories on the stage (`story.ts`). A run started in a
 * factory freezes every repository of it but its own on its record, read-only (`factoryMounts`); a step's `writable:` folder is filed
 * writable for that step alone (`stepMounts`); a step whose `reads:` names the inbox is filed the store's inbox (`readsMounts`); a run
 * given an input files its inputs folder (`inputsMounts`); and a step after another the folder each step before it handed over
 * (`handedMounts`). Each is read-only but the writable one, on the first filing, a try and a round, and named on the brief as it is
 * mounted (`mountsLine`, `unnamed`); a later step reads what was handed and writes none of it, as Claude Code holds a mount (`readsAt`,
 * `writesAt`, in `mounted.ts`). Then where a run mounts less: the default factory, a factory of one repository, a folder gone at start,
 * a folder team, a remote agent, a run given no input.
 *
 * Beside the stories, three tables: the start refused over a factory's folders, each by kind, exit 2 and its facts with no run written;
 * the pure readers of the folders; and `writable:` as a step's file is read.
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { TEAM_DEV, teamCopy } from './team.ts';
import { names } from './assessed.ts';
import { staged, story } from './story.ts';
import { CARD, filedOf, handedBy, INBOX, INPUT_FILE, INPUTS, mountHolds, readsAt, RUN_ARTIFACTS, writesAt, type Filed } from './mounted.ts';
import { factoryMounts, stepMounts } from '../src/factory/factory.ts';
import { mountsLine } from '../src/start/index.ts';
import { inputsMounts, readsMounts } from '../src/filed/filed.ts';
import { handedMounts } from '../src/artifacts/artifacts.ts';
import { parseWorkflow, agentsDir } from '../src/workflow.ts';
import { loadAgents } from '../src/agents/read.store.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { Invalid } from '../src/refusal/refusal.ts';

const ROOT = scratch('wf-mounts-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
process.env.WF_MAX_RUNS = '100';
const { addFactory, advanceRun, approveRun, attachWorkflow, hireAgent, retryRun, startRun, runWith } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const { artifactsDir, inputsDir, readRun } = await import('../src/record/record.store.ts');
const { main } = await import('../src/cli/main.ts');
const stage = staged({ runWith, main, engineOf });

type Mount = { path: string; readOnly: boolean };
type Refusal = Error & { _tag?: string; exitCode?: number };

/** Read-only mounts of `paths`, as a record and a filing hold them. */
const readOnly = (...paths: string[]): Mount[] => paths.map((p) => ({ path: p, readOnly: true }));

/** A repository with one commit on `main`, in a folder named from `prefix`. */
function aRepo(prefix = 'repo-'): string {
  const repo = fs.mkdtempSync(path.join(ROOT, prefix));
  stage.place().world.repository(repo, { 'README.md': 'x\n' });
  return repo;
}

/** A workflow folder `name` in `team`, of `files`, each a step's file by its name. */
function workflow(team: string, name: string, files: Record<string, string>): string {
  const dir = path.join(team, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [step, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, `${step}.md`), text);
  return dir;
}

/**
 * The tests' team with two more workflows: `plain`, implement then review, and `notes`, a folder team; the factory `trio` filed afresh
 * on three repositories, both attached. Its repositories, sorted, the team and the two folders.
 */
function fresh(): { repos: string[]; team: string; plain: string; notes: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const team = teamCopy();
  const plain = workflow(team, 'plain', {
    implement: '---\nplace: git\nagent: implementer\n---\nBuild what was asked.\n',
    review: '---\nafter: implement\nplace: git\nagent: reviewer\n---\nReview it.\n',
  });
  const notes = workflow(team, 'notes', { write: '---\nworkspace: folder\nagent: implementer\n---\nWrite it.\n' });
  const repos = [aRepo(), aRepo(), aRepo()].sort();
  addFactory({ name: 'trio', repos });
  for (const name of ['plain', 'notes']) attachWorkflow({ factory: 'trio', workflow: name });
  return { repos, team, plain, notes };
}

/** `plain`'s implement step, rewritten to say `writable: <names>`. */
const writing = (plain: string, names: string) =>
  fs.writeFileSync(path.join(plain, 'implement.md'), `---\nplace: git\nagent: implementer\nwritable: ${names}\n---\nBuild it.\n`);

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };
/** A review's closeout, as its agent's schema asks: findings, and whether implement goes round again. */
const reviewed = (again: boolean) => ({ ...SIGNED, findings: [], again });

/** Each task the stage's engine was filed, by id, as the run handed it. */
const filings = () => new Map(stage.board().specs.map((spec) => [spec.id, spec]));
/** The task filed for `step` of the run `id` now. */
const filedFor = (id: string, step: string) => filings().get(readRun(id).steps[step].taskId!)!;
/** One pass of the run `id`, on the stage's engine. */
const pass = (id: string) => stage.runWith(stage.board().e, advanceRun(readRun(id)));

/** What `nemia <argv>` prints, a line each. */
async function typed(argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    await stage.main(argv);
  } finally {
    console.log = log;
  }
  return lines;
}

/** The runs in the store, by file. */
const runFiles = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);

/**
 * The folders a filing mounts that its brief does not name as it mounts them: a writable one on the line that says it may be written, a
 * read-only one on a line that says it must not be. Each by its path.
 */
const unnamed = (filing: { brief: string; config?: { mounts?: unknown } }): string[] => {
  const lines = filing.brief.split('\n');
  const mounts = (filing.config?.mounts ?? []) as Mount[];
  return mounts
    .filter((m) => !lines.some((l) => l.includes(`\`${m.path}\``) && (m.readOnly ? /must not write/ : /you may write/).test(l)))
    .map((m) => m.path);
};

test('mounts on every filing: a factory run whose implement writes one folder of it, reads the inbox and the inputs, then a review and an ending read what was handed', async (t) => {
  const s = story(t);
  const { repos, team } = fresh();
  const [own, web, docs] = repos;
  const wide = workflow(team, 'wide', {
    implement: `---\nplace: git\nagent: implementer\nwritable: ${path.basename(web)}\nreads: inbox\n---\nBuild what was asked.\n`,
    review: '---\nafter: implement\nplace: git\nagent: reviewer\nloop: implement\nrounds: 2\n---\nReview it.\n',
    ship: '---\nafter: review\nplace: git\nworkspace: base\nagent: shipper\ngate: true\n---\nShip it.\n',
  });
  attachWorkflow({ factory: 'trio', workflow: 'wide' });
  const given = path.join(ROOT, 'template-draft.md');
  fs.writeFileSync(given, 'the draft\n');
  const inbox = path.join(ROOT, 'inbox');
  let id = '';
  let inputs = '';
  let writes: Mount[] = [];
  let tried = '';

  await s.test(
    'nemia start freezes the other repositories on the record read-only, and says them and the one implement alone writes',
    async () => {
      const out = await typed(['start', 'build it', '--workflows', wide, '--factory', 'trio', '--repo', own, '--input', given]);
      id = out[0].split(' ')[0];
      const run = readRun(id);
      inputs = inputsDir(run);
      assert.deepEqual(run.mounts, readOnly(web, docs), 'read back');
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${id}.json`), 'utf8')).mounts,
        readOnly(web, docs),
        'as written',
      );
      names(out.join('\n'), `mounts: ${web}, ${docs}`, `writable: ${web}`, 'for implement alone');
      assert.equal(
        out.some((l) => l.startsWith('not mounted')),
        false,
      );
      writes = [{ path: web, readOnly: false }, ...readOnly(docs, inbox, inputs)];
    },
  );

  await s.test(
    "implement's first filing writes its folder alone, reads the rest, and names each on its brief; the factory changed since changes none",
    async () => {
      fs.writeFileSync(path.join(ROOT, 'factories', 'trio.json'), `${JSON.stringify({ repos: [...repos, aRepo()] })}\n`);
      await pass(id);
      const first = filedFor(id, 'implement');
      assert.deepEqual(first.config?.mounts, writes);
      const config = first.config as Filed;
      assert.ok(writesAt(config, path.join(web, 'a.ts')), 'the writable folder');
      for (const file of [path.join(docs, 'a.ts'), path.join(inbox, 'card.md'), path.join(inputs, 'template-draft.md')]) {
        assert.ok(readsAt(config, file), file);
        assert.equal(writesAt(config, file), false, file);
      }
      assert.deepEqual(unnamed(first), [], first.brief);
      names(first.brief, '`template-draft.md`', 'nemia start --input');
    },
  );

  await s.test('a try of implement is filed the same folders, and told them again', async () => {
    const b = stage.board();
    b.settle(`${id}-implement`, 'failed');
    await pass(id);
    await stage.runWith(b.e, retryRun(id, 'implement', { mode: 'fresh' }));
    await pass(id);
    tried = readRun(id).steps.implement.taskId!;
    assert.notEqual(tried, `${id}-implement`);
    const filing = filedFor(id, 'implement');
    assert.deepEqual(filing.config?.mounts, writes);
    assert.deepEqual(unnamed(filing), [], filing.brief);
    names(filing.brief, '`template-draft.md`');
  });

  await s.test(
    'review reads every folder of the factory, what implement handed over and the inputs, and writes none; no inbox, and its own folder held by none',
    async () => {
      stage.board().end(tried, 'succeeded', { closeout: SIGNED, nativeId: null });
      await pass(id);
      const review = filedFor(id, 'review');
      const handed = artifactsDir({ id }, 'implement');
      assert.deepEqual(review.config?.mounts, readOnly(web, docs, handed, inputs));
      assert.ok(fs.statSync(handed).isDirectory(), "implement's folder is there when the step after it is filed");
      const config = review.config as Filed;
      for (const file of [path.join(web, 'a.ts'), path.join(docs, 'a.ts'), path.join(handed, 'shot.png'), path.join(inputs, 'x.md')]) {
        assert.ok(readsAt(config, file), file);
        assert.equal(writesAt(config, file), false, file);
      }
      const own = path.join(artifactsDir({ id }, 'review'), 'shot.png');
      assert.equal(mountHolds(config, own, true) || mountHolds(config, own, false), false, 'its own folder is mounted by none');
      assert.deepEqual(unnamed(review), [], review.brief);
      names(review.brief, `\`${handed}\` (implement's)`, '`template-draft.md`');
      assert.doesNotMatch(review.brief, /Folders of this factory[^\n]*artifacts/, 'no handed folder said as a factory folder');
      assert.doesNotMatch(review.brief, /you may write/);
      assert.equal(review.brief.includes(inbox), false, 'told no inbox');
    },
  );

  await s.test(
    'a round of implement, on a new session since its try kept no session id, is filed and told every folder as its first filing was',
    async () => {
      stage.board().settle(readRun(id).steps.review.taskId!, 'succeeded', reviewed(true));
      await pass(id);
      const round = filedFor(id, 'implement');
      assert.notEqual(round.id, tried, 'a round is filed');
      assert.ok(round.brief.includes('## What was asked for'), 'on a new session');
      assert.deepEqual(round.config?.mounts, writes);
      assert.deepEqual(unnamed(round), [], round.brief);
      names(round.brief, '`template-draft.md`');
    },
  );

  await s.test(
    'the ending, filed once a person approves it, reads what implement and review handed over and writes none of it',
    async () => {
      const b = stage.board();
      const wt = readRun(id).steps.implement.workspace!;
      fs.writeFileSync(path.join(wt, 'flag.txt'), 'the flag\n');
      stage.place().world.commit(wt, 'add the flag');
      b.settle(readRun(id).steps.implement.taskId!, 'succeeded', {
        ...SIGNED,
        replies: [{ finding: 'none', answer: 'fixed', why: 'none' }],
      });
      await pass(id);
      await pass(id);
      b.settle(readRun(id).steps.review.taskId!, 'succeeded', reviewed(false));
      await pass(id);
      await stage.runWith(b.e, approveRun(id, 'ship'));
      await pass(id);
      const config = filedFor(id, 'ship').config as Filed;
      for (const by of ['implement', 'review']) {
        const file = path.join(artifactsDir({ id }, by), 'shot.png');
        assert.ok(readsAt(config, file), by);
        assert.equal(writesAt(config, file), false, by);
      }
    },
  );
});

test('where a run mounts less: the default factory and a factory of one repository, a run given no input, a folder team, a folder gone at start, a remote agent', async (t) => {
  const s = story(t);
  const { repos, team, plain, notes } = fresh();

  await s.test(
    'a run in the default factory, or in a factory of one repository, given no input, mounts nothing but what implement handed over',
    async () => {
      addFactory({ name: 'solo', repos: [repos[0]] });
      attachWorkflow({ factory: 'solo', workflow: 'plain' });
      for (const factory of [undefined, 'default', 'solo']) {
        const run = await stage.runPlaced(
          startRun({ brief: 'build it', repo: repos[0], workflowDir: plain, isolate: false, ...(factory ? { factory } : {}) }),
        );
        assert.equal('mounts' in readRun(run.id), false, `${String(factory)}: no key`);
        await pass(run.id);
        const first = filedFor(run.id, 'implement');
        assert.equal(Object.hasOwn(first.config!, 'mounts'), false, `${String(factory)}: the config as it was before mounts`);
        assert.doesNotMatch(first.brief, /mounted read-only|nemia start --input/, String(factory));
        stage.board().settle(first.id, 'succeeded', SIGNED);
        await pass(run.id);
        const review = filedFor(run.id, 'review');
        assert.deepEqual(review.config?.mounts, readOnly(artifactsDir(run, 'implement')), `${String(factory)}: implement's folder alone`);
        assert.doesNotMatch(review.brief, /Folders of this factory/, String(factory));
      }
    },
  );

  await s.test('a folder team in a factory mounts every repository of it, having none of its own', async () => {
    const run = await stage.runPlaced(startRun({ brief: 'a note', repo: repos[0], workflowDir: notes, factory: 'trio' }));
    assert.equal(run.place?.kind, 'folder');
    assert.deepEqual(readRun(run.id).mounts, readOnly(...repos));
  });

  await s.test(
    'a factory folder that is no directory at start is left out of the mounts, and nemia start says so; none left, the record has no key',
    async () => {
      fs.rmSync(repos[2], { recursive: true });
      const out = await typed(['start', 'build it', '--workflows', plain, '--factory', 'trio', '--repo', repos[0], '--no-worktree']);
      assert.deepEqual(readRun(out[0].split(' ')[0]).mounts, readOnly(repos[1]));
      names(out.join('\n'), `not mounted: ${repos[2]}`, 'start again once it is there');
      fs.rmSync(repos[1], { recursive: true });
      const none = await stage.runPlaced(
        startRun({ brief: 'build it', repo: repos[0], workflowDir: plain, isolate: false, factory: 'trio' }),
      );
      assert.equal('mounts' in readRun(none.id), false);
    },
  );

  await s.test('a step on a remote agent is filed no mounts, and its brief names none, a round of it included', async () => {
    fs.writeFileSync(path.join(ROOT, 'a2a-agents.json'), JSON.stringify({ peer: { url: 'https://peer.example' } }));
    const asked = workflow(team, 'asked', { ask: '---\nplace: git\nharness: a2a:peer\n---\nAsk it.\n' });
    const [own, other] = [aRepo(), aRepo()];
    addFactory({ name: 'peers', repos: [own, other] });
    attachWorkflow({ factory: 'peers', workflow: 'asked' });
    const run = await stage.runPlaced(startRun({ brief: 'ask it', repo: own, workflowDir: asked, isolate: false, factory: 'peers' }));
    assert.deepEqual(run.mounts, readOnly(other), 'the run mounts it');
    await pass(run.id);
    const filing = filedFor(run.id, 'ask');
    assert.equal(Object.hasOwn(filing, 'config'), false, 'a remote step files no local fields');
    assert.doesNotMatch(filing.brief, /mounted read-only/);
    assert.deepEqual(mountsLine({ harness: 'a2a:peer' }, { mounts: run.mounts }), [], 'nor a round of it, briefed as a local step is');
  });
});

/** That `opts` is refused as `Invalid`, exit 2, naming each of `facts`, with no run written: the refusal. */
const refused = async (opts: Parameters<typeof startRun>[0], ...facts: string[]): Promise<string> => {
  const before = runFiles();
  let failed: Refusal | undefined;
  try {
    await stage.runPlaced(startRun(opts));
  } catch (err) {
    failed = err as Refusal;
  }
  assert.ok(failed, 'refused');
  assert.deepEqual([failed._tag, failed.exitCode], ['Invalid', 2], failed.message);
  names(failed.message, ...facts);
  assert.deepEqual(runFiles(), before, 'nothing written');
  return failed.message;
};
/** `plain` started in `factory` on `repo`. */
const at = (plain: string, repo: string, factory?: string) => ({
  brief: 'build it',
  repo,
  workflowDir: plain,
  isolate: false,
  ...(factory ? { factory } : {}),
});
/** `name` filed on `repos`, `plain` attached. */
const factoryOf = (name: string, repos: string[]) => {
  addFactory({ name, repos });
  attachWorkflow({ factory: name, workflow: 'plain' });
};
/** The workflow `coded`, one step whose hired agent `coder` runs on codex with `agent`'s keys, and `code`'s own lines. */
const coded = (team: string, factory: string, agent: string, own = '') => {
  fs.writeFileSync(path.join(team, 'agents', 'coder.md'), `---\nharness: codex\n${agent}---\nWrite the code.\n`);
  const dir = workflow(team, 'coded', { code: `---\nplace: git\n${own}---\nCode it.\n` });
  attachWorkflow({ factory, workflow: 'coded' });
  hireAgent({ factory, agent: 'coder', step: 'coded/code' });
  return dir;
};

test("REFUSED at nemia start: a factory's folder a step cannot be filed, each Invalid with exit 2 naming its facts, and no run written", async (t) => {
  await t.test(
    "a harness that cannot hold the factory's read-only mounts, in the runtime's words; with nothing to mount, the same step starts",
    async () => {
      const { repos, team } = fresh();
      const dir = coded(team, 'trio', 'permissionMode: bypassPermissions\n');
      await refused(
        { ...at(dir, repos[0], 'trio') },
        `gives the session ${repos[1]} read-only`,
        'danger-full-access',
        "the factory trio's",
        'nemia factory hire trio <agent> --step coded/code',
      );
      addFactory({ name: 'solo', repos: [repos[0]] });
      attachWorkflow({ factory: 'solo', workflow: 'coded' });
      hireAgent({ factory: 'solo', agent: 'coder', step: 'coded/code' });
      const run = await stage.runPlaced(startRun(at(dir, repos[0], 'solo')));
      assert.equal('mounts' in run, false);
    },
  );

  await t.test('a factory folder whose path a permission rule cannot name, naming the step first, the factory and its fixes', async () => {
    const { plain } = fresh();
    const [own, spaced] = [aRepo(), aRepo('First (Last)-')];
    factoryOf('spaced', [own, spaced]);
    const said = await refused(
      at(plain, own, 'spaced'),
      `\`mounts\` gives the session ${JSON.stringify(spaced)} read-only`,
      "That folder is the factory spaced's",
      'nemia factory hire spaced <agent> --step plain/implement',
      'nemia factory rm spaced',
      'nemia factory add spaced --repo <path>',
      'start it in a factory',
      'Nothing was written.',
    );
    assert.match(said, /^implement: /, "the step's line first");
  });

  await t.test('REFUSED: a `writable:` name no folder of the factory has, naming the step, its line, the folders and the fix', async () => {
    const { repos, plain } = fresh();
    writing(plain, 'nope');
    const said = await refused(at(plain, repos[0], 'trio'), '`writable: nope`', ...repos.map((r) => path.basename(r)), 'delete the name');
    assert.match(said, /^plain\/implement: /);
  });

  await t.test('REFUSED: a `writable:` name two folders of the factory share, naming both', async () => {
    const { plain } = fresh();
    const own = aRepo();
    const [one, two] = ['p1-', 'p2-'].map((p) => {
      const parent = fs.mkdtempSync(path.join(ROOT, p));
      const repo = aRepo();
      fs.renameSync(repo, path.join(parent, 'web'));
      return path.join(parent, 'web');
    });
    factoryOf('twins', [own, one, two]);
    writing(plain, 'web');
    await refused(at(plain, own, 'twins'), '`writable: web`', '2 folders', one, two);
  });

  await t.test('REFUSED: a `writable:` folder that is no directory at start', async () => {
    const { repos, plain } = fresh();
    writing(plain, path.basename(repos[2]));
    fs.rmSync(repos[2], { recursive: true });
    await refused(at(plain, repos[0], 'trio'), `\`writable: ${path.basename(repos[2])}\``, `${repos[2]} is no directory`);
  });

  await t.test('REFUSED: a `writable:` in a run started in no factory', async () => {
    const { repos, plain } = fresh();
    writing(plain, path.basename(repos[1]));
    const said = await refused(at(plain, repos[0]), 'started in none', 'nemia start --factory <name>', 'or delete the line');
    assert.match(said, /^plain\/implement: `writable: /);
  });

  await t.test(
    "REFUSED: a read-only folder no rule can name, beside a step's `writable:` one, is said as the read-only mount it is",
    async () => {
      const { plain } = fresh();
      const [own, spaced, web] = [aRepo(), aRepo('First (Last)-'), aRepo()];
      factoryOf('spaced-web', [own, spaced, web]);
      writing(plain, path.basename(web));
      const said = await refused(
        at(plain, own, 'spaced-web'),
        `${JSON.stringify(spaced)} read-only`,
        "That folder is the factory spaced-web's",
        'nemia factory hire spaced-web <agent> --step plain/implement',
      );
      assert.match(said, /^implement: `mounts` gives the session /, 'quotes no `writable:` line: not a folder it names');
    },
  );

  await t.test(
    "REFUSED: a `writable:` folder on a harness that cannot hold a writable mount, quoted by its line, with the factory's fix",
    async () => {
      const { repos, team } = fresh();
      const dir = coded(team, 'trio', '', `writable: ${path.basename(repos[1])}\n`);
      const said = await refused(
        at(dir, repos[0], 'trio'),
        `gives the session ${repos[1]} writable`,
        '`codex` harness cannot hold a writable mount',
        '`claude`',
        'coded/code names it in `writable:`',
        'nemia factory hire trio <agent> --step coded/code',
        'delete the name from `writable:`',
      );
      assert.match(said, /^code: `writable: [^`]+` \(filed as `mounts`\): /);
      assert.equal(said.split('\n').length, 2, "the runtime's line, then the factory's");
    },
  );

  await t.test("a `writable:` that names the run's own repository mounts nothing more: that folder is its workspace", async () => {
    const { repos, plain } = fresh();
    writing(plain, path.basename(repos[0]));
    const run = await stage.runPlaced(startRun(at(plain, repos[0], 'trio')));
    assert.deepEqual(readRun(run.id).mounts, readOnly(repos[1], repos[2]));
  });

  await t.test('REFUSED: a record whose mounts are not mounts is unreadable, naming the field', async () => {
    const { repos, plain } = fresh();
    const run = await stage.runPlaced(startRun(at(plain, repos[0], 'trio')));
    const file = path.join(ROOT, 'runs', `${run.id}.json`);
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), mounts: [{ path: 1 }] }));
    assert.throws(
      () => readRun(run.id),
      (err: Refusal) => err._tag === 'Invalid' && err.message.includes('`mounts.0.path` is 1'),
    );
  });
});

/** The steps of `fronts`, each by its name and frontmatter, parsed as a folder hands them to the parser. */
const stepsOf = (fronts: Record<string, string>) =>
  Object.entries(fronts).map(([name, front]) => parseWorkflow(name, `---\nplace: git\n${front}\n---\n${name} it\n`));

test('the folders a step is filed, read by their pure functions and by the model a fence test holds a filing to', async (t) => {
  const team = loadWorkflows(TEAM_DEV);
  const filed = filedOf(team);

  await t.test("factoryMounts: a factory's repositories as path.resolve spells them, sorted and once each, but the run's own", () => {
    const [a, b, c] = ['/srv/a', '/srv/b', '/srv/c'];
    assert.deepEqual(factoryMounts({ repos: [a, b] }, a), readOnly(b));
    assert.deepEqual(factoryMounts({ repos: [a, b] }, `${a}/`), readOnly(b), 'the run on a/, through path.resolve');
    assert.deepEqual(factoryMounts({ repos: [`${b}/`, a] }, undefined), readOnly(a, b), 'a folder run mounts them all, sorted');
    assert.deepEqual(factoryMounts({ repos: [c, a, b] }, b), readOnly(a, c), 'listed out of order, given sorted');
    assert.deepEqual(factoryMounts({ repos: [a, `${a}/.`] }, undefined), readOnly(a), 'one folder named twice is mounted once');
    assert.deepEqual(factoryMounts({ repos: [a] }, a), [], 'a factory of one repository mounts none');
  });

  await t.test(
    "the tests' team: a later step reads, and never writes, what each step it comes after handed over; its own folder is held by none",
    () => {
      const review = filed.get('review')!;
      const ship = filed.get('ship')!;
      assert.ok(readsAt(review, handedBy('implement')));
      assert.equal(writesAt(review, handedBy('implement')), false);
      for (const by of ['implement', 'review']) {
        assert.ok(readsAt(ship, handedBy(by)), `ship reads ${by}'s`);
        assert.equal(writesAt(ship, handedBy(by)), false, `ship writes none of ${by}'s`);
      }
      assert.equal(readsAt(filed.get('implement')!, handedBy('review')), false, 'implement comes after nothing');
      for (const [name, config] of filed) {
        assert.equal(mountHolds(config, handedBy(name), true), false, `${name}'s own folder, read-only`);
        assert.equal(mountHolds(config, handedBy(name), false), false, `${name}'s own folder, writable`);
      }
    },
  );

  await t.test(
    'REFUSED: a step does not read the folder of a step it does not come after; it reads those it does, in the order of the workflow',
    () => {
      const steps = stepsOf({ a: 'permissionMode: dontAsk', b: 'permissionMode: dontAsk', c: 'after: a', d: 'after: b, c' });
      const diamond = filedOf(steps);
      const reads = (name: string) => ['a', 'b', 'c', 'd'].filter((by) => readsAt(diamond.get(name)!, handedBy(by)));
      assert.deepEqual(reads('c'), ['a'], "never its sibling b's nor d's after it");
      assert.deepEqual(reads('d'), ['a', 'b', 'c'], 'b and c, and a through c');
      assert.deepEqual([reads('a'), reads('b')], [[], []]);
      assert.deepEqual(
        handedMounts(steps[3], steps, RUN_ARTIFACTS),
        readOnly(...['a', 'b', 'c'].map((by) => path.join(RUN_ARTIFACTS, by))),
      );
    },
  );

  await t.test('a step on a sandboxed or a remote harness is filed no handed mount, nor the inbox, nor the inputs', () => {
    const review = team.find((s) => s.name === 'review')!;
    const codex = { ...review, harness: 'codex', permissionMode: 'read-only' };
    assert.deepEqual(handedMounts(codex, team, RUN_ARTIFACTS), [], 'codex reads the disk in its sandbox already');
    assert.equal(Object.hasOwn(filedOf(team.map((s) => (s.name === 'review' ? codex : s))).get('review')!, 'mounts'), false, 'no key');
    assert.deepEqual(handedMounts({ ...review, harness: 'a2a:peer' }, team, RUN_ARTIFACTS), [], 'a remote agent');
    assert.deepEqual(handedMounts({ ...review, harness: 'claude' }, team, RUN_ARTIFACTS), readOnly(path.join(RUN_ARTIFACTS, 'implement')));
    const reading = { harness: 'claude', reads: ['inbox'] };
    assert.deepEqual(readsMounts(reading, INBOX), readOnly(INBOX));
    assert.deepEqual(readsMounts({ ...reading, harness: 'codex' }, INBOX), []);
    assert.deepEqual(readsMounts({ ...reading, harness: 'a2a:peer' }, INBOX), []);
    const repo = [{ place: 'git' as const }];
    assert.deepEqual(inputsMounts({ harness: 'claude' }, repo, INPUTS), readOnly(INPUTS));
    assert.deepEqual(inputsMounts({ harness: undefined }, repo, INPUTS), readOnly(INPUTS), 'the default harness');
    assert.deepEqual(inputsMounts({ harness: 'codex' }, repo, INPUTS), []);
    assert.deepEqual(inputsMounts({ harness: 'a2a:peer' }, repo, INPUTS), []);
  });

  await t.test(
    "REFUSED: a step whose `reads:` names no inbox reads none of it; a folder team's steps and a run given no input read no inputs",
    () => {
      for (const [name, config] of filed) {
        assert.equal(readsAt(config, CARD), false, `${name} reads no card`);
        assert.equal(readsAt(config, INPUT_FILE), false, `${name} is given no input`);
      }
      assert.deepEqual(inputsMounts({ harness: 'claude' }, [{ place: 'folder' as const }], INPUTS), [], 'a folder team');
      assert.deepEqual(inputsMounts({ harness: 'claude' }, [{ place: 'git' as const }], undefined), [], 'a run given none');
    },
  );

  await t.test(
    'REFUSED: each folder mounted writable is open to a write, and an Edit allow on it is no write while it is mounted read-only',
    () => {
      const reading = filedOf([...stepsOf({ reader: 'reads: inbox' })]).get('reader')!;
      const given = filedOf(team, INPUTS).get('implement')!;
      const cases: [string, Filed, string, string][] = [
        ['a handed folder', filed.get('review')!, handedBy('implement'), path.join(RUN_ARTIFACTS, 'implement')],
        ['the inbox', reading, CARD, INBOX],
        ['the inputs', given, INPUT_FILE, INPUTS],
      ];
      for (const [what, config, file, folder] of cases) {
        assert.ok(readsAt(config, file), `${what} is read`);
        const opened = { ...config, mounts: config.mounts!.map((m) => ({ ...m, readOnly: false })) };
        assert.ok(writesAt(opened, file), `${what}: the model sees a writable mount as a write`);
        const allowed = { ...config, allowedTools: [...(config.allowedTools ?? []), `Edit(/${folder}/**)`] };
        assert.ok(writesAt({ ...allowed, mounts: [] }, file), `${what}: the model sees an Edit allow as a write`);
        assert.equal(writesAt(allowed, file), false, `${what}: the read-only mount's deny beats the allow`);
      }
    },
  );

  await t.test('mountsLine names the inbox for a local step whose `reads:` names it, and nothing for one without it or not local', () => {
    const told = (step: { harness: string; reads?: string[] }) =>
      mountsLine(step, {}, { handed: [], store: readsMounts(step, '/s/inbox'), inputs: [] });
    names(told({ harness: 'claude', reads: ['inbox'] }).join('\n'), '`reads:` names them: `/s/inbox`');
    assert.deepEqual(told({ harness: 'claude' }), []);
    assert.deepEqual(told({ harness: 'a2a:peer', reads: ['inbox'] }), []);
    assert.deepEqual(told({ harness: 'codex', reads: ['inbox'] }), [], 'codex reads the disk in its sandbox already');
    assert.match(mountsLine({ harness: 'claude' }, { mounts: readOnly('/srv/a') }).join('\n'), /mounted read-only/, "a factory's folder");
  });

  await t.test(
    'mountsLine names each folder the steps before it handed over, by its path and step, and how to list one; nothing for none',
    () => {
      const handed = readOnly('/s/runs/r-1/artifacts/design', '/s/runs/r-1/artifacts/implement');
      const [blank, line, ...more] = mountsLine({ harness: 'claude' }, {}, { handed, store: [], inputs: [] });
      assert.deepEqual([blank, more], ['', []]);
      names(
        line,
        "`/s/runs/r-1/artifacts/design` (design's)",
        "`/s/runs/r-1/artifacts/implement` (implement's)",
        'must not write',
        '`/s/runs/r-1/artifacts/design/**`',
      );
      assert.deepEqual(mountsLine({ harness: 'claude' }, {}, { handed: [], store: [], inputs: [] }), [], 'a step handed none');
      assert.deepEqual(mountsLine({ harness: 'a2a:peer' }, {}, { handed, store: [], inputs: [] }), [], 'a remote agent is filed none');
    },
  );

  await t.test('REFUSED: a brief that leaves out a folder its filing mounts names that folder', () => {
    const handed = artifactsDir({ id: 'r-1' }, 'implement');
    const brief = ['## What was asked for', '', 'build it'].join('\n');
    assert.deepEqual(unnamed({ brief, config: { mounts: readOnly(handed) } }), [handed]);
    const told = [brief, ...mountsLine({ harness: 'claude' }, {}, { handed: readOnly(handed), store: [], inputs: [] })].join('\n');
    assert.deepEqual(unnamed({ brief: told, config: { mounts: readOnly(handed) } }), []);
    assert.deepEqual(unnamed({ brief: told.replace('must not write', 'may write'), config: { mounts: readOnly(handed) } }), [handed]);
  });
});

/** A step `review` with this frontmatter and a body, as a folder hands it to the parser. */
const fm = (lines: string) => parseWorkflow('review', `---\nplace: git\n${lines}\n---\nDo the work.\n`);

/** The fix every refusal over a fence that writes nothing names. */
const FIX = ['never what it may do', 'Delete the line', 'allows `Edit(**)`'];

/** A row: what it reads, and, for a refusal, the text its message opens on and what else it names. */
type Row = { row: string; run: () => unknown; naming?: string[] };

/** A row reading `lines` as the folders `writable` lists. */
const reads = (row: string, lines: string, writable?: string[]): Row => ({
  row,
  run: () => assert.deepEqual(fm(lines).writable, writable),
});
/** A row refusing `lines`, naming each of `naming` after `review: `. */
const refuses = (row: string, lines: string, ...naming: string[]): Row => ({
  row: `REFUSED: ${row}`,
  run: () => fm(lines),
  naming: ['review: ', ...naming],
});

const MOUNTS = readOnly('/srv/a', '/srv/web');

test('`writable:`: the folders a step may write, read, refused, and mounted', async (t) => {
  const rows: Row[] = [
    reads('the folder names it lists', 'writable: web, docs', ['web', 'docs']),
    reads('none without the line', 'permissionMode: dontAsk'),
    refuses(
      'a path',
      'writable: web/src',
      '`writable: web/src` has `web/src`',
      "not a directory's name",
      '`writable: web, docs`',
      'nemia factory ls',
    ),
    refuses('a hidden one', 'writable: ..', '`writable: ..` has `..`', "not a directory's name"),
    refuses('one given twice', 'writable: web, web', 'names `web` twice'),
    refuses('none', 'writable: , ,', '`writable: , ,` names no folder'),
    refuses(
      'on a remote A2A agent',
      'harness: a2a:peer\nwritable: web',
      '`writable: web` gives a session on this machine',
      "another party's machine",
    ),
    refuses('over plan', 'permissionMode: plan\nwritable: web', '`writable: web`', 'runs in `plan`', 'writes nothing', ...FIX),
    refuses('over codex read-only', 'harness: codex\nsandbox: read-only\nwritable: web', 'runs in `read-only`', 'writes nothing', ...FIX),
    refuses(
      'over tools that write no file',
      'tools: Read, Grep\nwritable: web',
      'has only the tools `Read`, `Grep`',
      'none writes a file',
      ...FIX,
    ),
    refuses(
      'over dontAsk with no Edit rule',
      'permissionMode: dontAsk\nallowedTools: Bash(npm test)\nwritable: web',
      'runs in `dontAsk`',
      'asks before an edit',
      'allows no `Edit` rule',
      ...FIX,
    ),
    refuses('over default, which asks', 'permissionMode: default\nwritable: web', 'runs in `default`', 'asks before an edit', ...FIX),
    reads('over a fence that allows Edit', 'permissionMode: dontAsk\nallowedTools: Edit(**)\nwritable: web', ['web']),
    reads('over tools with Edit', 'tools: Read, Edit\nwritable: web', ['web']),
    reads('over tools with Bash, which writes by a redirection', 'tools: Read, Bash\nwritable: web', ['web']),
    reads("over the runtime's default mode", 'writable: web', ['web']),
    reads('over dontAsk with an edit rule', 'permissionMode: dontAsk\nallowedTools: Bash(npm test), Edit(src/**)\nwritable: web', ['web']),
    reads('over acceptEdits', 'permissionMode: acceptEdits\nwritable: web', ['web']),
    reads('over codex workspace-write', 'harness: codex\nsandbox: workspace-write\nwritable: web', ['web']),
    {
      row: "REFUSED: over an agent's fence that writes nothing, naming the agent's file",
      run: () => {
        const copy = teamCopy();
        fs.writeFileSync(path.join(copy, 'agents', 'planner.md'), '---\npermissionMode: plan\n---\nPlan it.\n');
        const agents = loadAgents(agentsDir(path.join(copy, 'dev')));
        return parseWorkflow('plan', '---\nplace: git\nagent: planner\nwritable: web\n---\n', undefined, agents);
      },
      naming: ['plan: `writable: web`', "with agents/planner.md's, runs in `plan`", 'Delete the line', 'allows `Edit(**)`'],
    },
    {
      row: 'stepMounts: the folders named writable, every other read-only',
      run: () =>
        assert.deepEqual(stepMounts({ writable: ['web'] }, MOUNTS), [...readOnly('/srv/a'), { path: '/srv/web', readOnly: false }]),
    },
    { row: 'stepMounts: none named, all read-only', run: () => assert.deepEqual(stepMounts({}, MOUNTS), MOUNTS) },
    {
      row: 'stepMounts: a parent folder is no folder of the factory',
      run: () => assert.deepEqual(stepMounts({ writable: ['srv'] }, MOUNTS), MOUNTS),
    },
    { row: 'stepMounts: a run that mounts none', run: () => assert.equal(stepMounts({ writable: ['web'] }, undefined), undefined) },
  ];
  for (const { row, run, naming } of rows)
    await t.test(row, () => {
      if (!naming) return void run();
      const [at = '', ...named] = naming;
      assert.throws(run, (e: unknown) => {
        assert.ok(e instanceof Invalid, String(e));
        assert.equal(e.exitCode, 2, e.message);
        assert.ok(e.message.startsWith(at), e.message);
        names(e.message, ...named);
        return true;
      });
    });
});
