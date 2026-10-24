/**
 * A factory's folders, mounted: a run started in a factory reaches every repository of it but its own, read-only (`factoryMounts`),
 * frozen on its record at `nemia start`, filed with each local step — its first filing, a try and a round — and named on its brief. A
 * folder that is no directory at start is left out, and said; a step on a remote agent is filed none; a run in the default factory mounts
 * nothing, and its record has no `mounts`. A step whose `reads:` names the store's inbox is filed it read-only too, in any factory or
 * none, and its brief names it (`readsMounts`, `mountsLine`). Every folder a local step is filed with is named on its brief, as it is
 * mounted, the artifacts folder of each step before it included (`filedFolders`, `unnamed`).
 *
 * `WF_ROOT` is set before the runner is imported, since it is read as the module loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from './scratch.ts';
import { teamCopy } from './team.ts';
import { factoryMounts } from '../src/factory/factory.ts';
import { mountsLine } from '../src/start/index.ts';
import { testEngine } from 'agent-runtime/testing';
import { readsMounts } from '../src/filed/filed.ts';
import { testPlace } from '../place/memory/index.ts';
import { eachTest, runGiven, runOver } from './placed.ts';
import type { EnginePhase } from '../src/views/views-words.ts';

const ROOT = scratch('wf-factory-mounts-');
process.env.WF_ROOT = ROOT;
process.env.WF_VERIFY_REST = '1';
const { addFactory, advanceRun, attachWorkflow, hireAgent, retryRun, startRun, runWith: runEngine } = await import('../src/runner.ts');
const { engineOf } = await import('../src/runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const runPlaced = runGiven(() => stand().layer);
const { artifactsDir, inputsDir, readRun } = await import('../src/record/record.store.ts');
const { main: cli } = await import('../src/cli/main.ts');
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);

/** A git repository with one commit on `main`, in a folder named from `prefix`. */
function aRepo(prefix = 'repo-'): string {
  const repo = fs.mkdtempSync(path.join(ROOT, prefix));
  fs.writeFileSync(path.join(repo, 'README.md'), 'x\n');
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
}

/**
 * The tests' team with two more workflows: `loop`, where `review` may send `implement` back once, and `notes`, a folder team. The factory
 * `trio` is filed afresh on three repositories, `loop` and `notes` attached and every step of them hired. Its repositories, sorted.
 */
function fresh(): { repos: string[]; loop: string; notes: string } {
  fs.rmSync(path.join(ROOT, 'factories'), { recursive: true, force: true });
  const team = teamCopy();
  const loop = path.join(team, 'loop');
  const reviewer = path.join(team, 'agents', 'reviewer.md');
  fs.writeFileSync(reviewer, fs.readFileSync(reviewer, 'utf8').replace('output: review.schema.json\n', ''));
  fs.mkdirSync(loop);
  fs.writeFileSync(path.join(loop, 'implement.md'), '---\nplace: git\n---\nBuild what was asked.\n');
  fs.writeFileSync(
    path.join(loop, 'review.md'),
    '---\nafter: implement\nplace: git\noutput: review.schema.json\nloop: implement\nrounds: 2\n---\nReview it.\n',
  );
  fs.writeFileSync(
    path.join(loop, 'review.schema.json'),
    JSON.stringify({ type: 'object', properties: { again: { type: 'boolean' } }, required: ['again'], additionalProperties: false }),
  );
  const notes = path.join(team, 'notes');
  fs.mkdirSync(notes);
  fs.writeFileSync(path.join(notes, 'write.md'), '---\nworkspace: folder\nagent: implementer\n---\nWrite it.\n');
  const repos = [aRepo(), aRepo(), aRepo()].sort();
  addFactory({ name: 'trio', repos });
  for (const workflow of ['loop', 'notes']) attachWorkflow({ factory: 'trio', workflow });
  hireAgent({ factory: 'trio', agent: 'implementer', step: 'loop/implement' });
  hireAgent({ factory: 'trio', agent: 'reviewer', step: 'loop/review' });
  return { repos, loop, notes };
}

/** Read-only mounts of `paths`, as a record and a filing hold them. */
const readOnly = (...paths: string[]) => paths.map((p) => ({ path: p, readOnly: true }));

/**
 * The engine stand-in with each task's phase and closeout settled by hand, and every task filed, by id, as the run handed it. A task
 * settled `lost` keeps no session id, so what is filed after it starts a new session.
 */
const board = () => {
  const held = engine();
  const filed = () => new Map(held.specs.map((spec) => [spec.id, spec]));
  const settle = (id: string, phase: EnginePhase, closeout?: unknown, lost = false) =>
    held.settle(id, phase, { ...(closeout !== undefined && { closeout }), ...(lost && { nativeId: null }) });
  return {
    e: engineOf(held.layer),
    get filed() {
      return filed();
    },
    settle,
  };
};

const SIGNED = { outcome: 'done', summary: 'did it', artifacts: [], needs: null };

/** What `nemia <argv>` prints, a line each. */
async function typed(argv: string[]): Promise<string[]> {
  const lines: string[] = [];
  const log = console.log;
  console.log = (...args: unknown[]) => lines.push(args.join(' '));
  try {
    await main(argv);
  } finally {
    console.log = log;
  }
  return lines;
}

test("factoryMounts: a factory's repositories as path.resolve spells them, sorted and once each, but the run's own, each read-only", () => {
  const [a, b, c] = ['/srv/a', '/srv/b', '/srv/c'];
  assert.deepEqual(factoryMounts({ repos: [a, b] }, a), readOnly(b));
  assert.deepEqual(factoryMounts({ repos: [a, b] }, `${a}/`), readOnly(b), 'the run on a/, through path.resolve');
  assert.deepEqual(factoryMounts({ repos: [`${b}/`, a] }, undefined), readOnly(a, b), 'a folder run mounts them all, sorted');
  assert.deepEqual(factoryMounts({ repos: [c, a, b] }, b), readOnly(a, c), 'a fixture listing them out of order gives them sorted');
  assert.deepEqual(factoryMounts({ repos: [a, `${a}/.`] }, undefined), readOnly(a), 'one folder named twice is mounted once');
  assert.deepEqual(factoryMounts({ repos: [a] }, a), [], 'a factory of one repository mounts none');
});

test('a run in a factory freezes its other repositories on its record, read-only, as written to disk and read back', async () => {
  const { repos, loop } = fresh();
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[1], workflowDir: loop, isolate: false, factory: 'trio' }));
  assert.deepEqual(run.mounts, readOnly(repos[0], repos[2]));
  assert.deepEqual(readRun(run.id).mounts, readOnly(repos[0], repos[2]));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ROOT, 'runs', `${run.id}.json`), 'utf8')).mounts, readOnly(repos[0], repos[2]));
  const out = await typed(['start', 'build it', '--workflows', loop, '--factory', 'trio', '--repo', repos[0], '--no-worktree']);
  assert.ok(out.includes(`mounts: ${repos[1]}, ${repos[2]} — read-only, for every local step`), out.join('\n'));
  assert.equal(
    out.some((l) => l.startsWith('not mounted')),
    false,
  );
});

test('a folder team in a factory mounts every repository of it, having none of its own', async () => {
  const { repos, notes } = fresh();
  const run = await runPlaced(startRun({ brief: 'a note', repo: ROOT, workflowDir: notes, factory: 'trio' }));
  assert.equal(run.place?.kind, 'folder');
  assert.deepEqual(readRun(run.id).mounts, readOnly(...repos));
});

test('a factory folder that is no directory at start is left out of the mounts, and nemia start says so', async () => {
  const { repos, loop } = fresh();
  fs.rmSync(repos[2], { recursive: true });
  const out = await typed(['start', 'build it', '--workflows', loop, '--factory', 'trio', '--repo', repos[0], '--no-worktree']);
  const run = readRun(out[0].split(' ')[0]);
  assert.deepEqual(run.mounts, readOnly(repos[1]));
  assert.ok(
    out.includes(`not mounted: ${repos[2]} — of the factory's repositories, and no directory now; start again once it is there`),
    out.join('\n'),
  );
  fs.rmSync(repos[1], { recursive: true });
  const none = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  assert.equal('mounts' in readRun(none.id), false, 'none left: no key');
});

test('a run in the default factory, or in a factory of one repository, mounts nothing: its record has no mounts, and its filing none', async () => {
  const { repos, loop } = fresh();
  addFactory({ name: 'solo', repos: [repos[0]] });
  attachWorkflow({ factory: 'solo', workflow: 'loop' });
  hireAgent({ factory: 'solo', agent: 'implementer', step: 'loop/implement' });
  hireAgent({ factory: 'solo', agent: 'reviewer', step: 'loop/review' });
  for (const factory of [undefined, 'default', 'solo']) {
    const run = await runPlaced(
      startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, ...(factory ? { factory } : {}) }),
    );
    assert.equal('mounts' in readRun(run.id), false, String(factory));
    const b = board();
    await runWith(b.e, advanceRun(readRun(run.id)));
    const filing = b.filed.get(`${run.id}-implement`)!;
    assert.equal(Object.hasOwn(filing.config!, 'mounts'), false, `${String(factory)}: the config as it was before mounts`);
    assert.doesNotMatch(filing.brief, /mounted read-only/, String(factory));
    b.settle(`${run.id}-implement`, 'succeeded', SIGNED);
    await runWith(b.e, advanceRun(readRun(run.id)));
    const review = b.filed.get(`${run.id}-review`)!;
    assert.deepEqual(review.config?.mounts, readOnly(artifactsDir(run, 'implement')), `${String(factory)}: implement's folder alone`);
    assert.doesNotMatch(review.brief, /mounted read-only/, `${String(factory)}: no factory folder said`);
  }
});

test('REFUSED: a record whose mounts are not mounts is unreadable, naming the field', async () => {
  const { repos, loop } = fresh();
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  const file = path.join(ROOT, 'runs', `${run.id}.json`);
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), mounts: [{ path: 1 }] }));
  assert.throws(
    () => readRun(run.id),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' && err.message.includes('its `mounts.0.path` is 1, where nemia writes string'),
  );
});

test("the frozen mounts are filed with a local step's first filing, a try and a round, and named on its brief; a later factory changes none", async () => {
  const { repos, loop } = fresh();
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  const frozen = readOnly(repos[1], repos[2]);
  fs.writeFileSync(path.join(ROOT, 'factories', 'trio.json'), `${JSON.stringify({ repos: [...repos, aRepo()] })}\n`);
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const first = b.filed.get(`${run.id}-implement`)!;
  assert.deepEqual(first.config?.mounts, frozen, 'the first filing');
  assert.ok(
    first.brief.includes(
      `Folders of this factory you may read, and must not write: \`${repos[1]}\`, \`${repos[2]}\`. Each is mounted read-only; your own work stays in your workspace.`,
    ),
    first.brief,
  );
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const tried = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(tried, `${run.id}-implement`);
  assert.deepEqual(b.filed.get(tried)?.config?.mounts, frozen, 'a try');
  b.settle(tried, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const handed = { path: artifactsDir(run, 'implement'), readOnly: true };
  assert.deepEqual(b.filed.get(`${run.id}-review`)?.config?.mounts, [...frozen, handed], "the step after it, and implement's folder");
  assert.ok(fs.statSync(handed.path).isDirectory(), "implement's folder is there when the step after it is filed");
  assert.doesNotMatch(
    b.filed.get(`${run.id}-review`)!.brief,
    /Folders of this factory[^\n]*artifacts/,
    'no handed folder said as a factory folder',
  );
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, tried);
  assert.deepEqual(b.filed.get(round)?.config?.mounts, frozen, 'a round');
});

test("a step on a remote agent is filed no mounts, and its brief names none, a round's included", async () => {
  const { repos, loop } = fresh();
  fs.writeFileSync(path.join(ROOT, 'a2a-agents.json'), JSON.stringify({ peer: { url: 'https://peer.example' } }));
  const asked = path.join(path.dirname(loop), 'asked');
  fs.mkdirSync(asked);
  fs.writeFileSync(path.join(asked, 'ask.md'), '---\nplace: git\nharness: a2a:peer\n---\nAsk it.\n');
  attachWorkflow({ factory: 'trio', workflow: 'asked' });
  const run = await runPlaced(startRun({ brief: 'ask it', repo: repos[0], workflowDir: asked, isolate: false, factory: 'trio' }));
  assert.deepEqual(run.mounts, readOnly(repos[1], repos[2]), 'the run mounts them');
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const filing = b.filed.get(`${run.id}-ask`)!;
  assert.equal(Object.hasOwn(filing, 'config'), false, 'a remote step files no local fields');
  assert.doesNotMatch(filing.brief, /mounted read-only/);
  const mounts = readOnly(repos[1]);
  assert.deepEqual(mountsLine({ harness: 'a2a:peer' }, { mounts }), [], 'nor a round of it, briefed as a local step is');
  assert.match(mountsLine({ harness: 'claude' }, { mounts }).join('\n'), /mounted read-only/);
});

test("REFUSED: a start whose step's harness cannot hold the factory's mounts, in the runtime's words, before anything is written", async () => {
  const { repos, loop } = fresh();
  const team = path.dirname(loop);
  fs.writeFileSync(path.join(team, 'agents', 'coder.md'), '---\nharness: codex\npermissionMode: bypassPermissions\n---\nWrite the code.\n');
  const coded = path.join(team, 'coded');
  fs.mkdirSync(coded);
  fs.writeFileSync(path.join(coded, 'code.md'), '---\nplace: git\n---\nCode it.\n');
  attachWorkflow({ factory: 'trio', workflow: 'coded' });
  hireAgent({ factory: 'trio', agent: 'coder', step: 'coded/code' });
  const runs = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);
  const before = runs();
  await assert.rejects(
    async () => await runPlaced(startRun({ brief: 'code it', repo: repos[0], workflowDir: coded, isolate: false, factory: 'trio' })),
    (err: Error & { _tag?: string }) =>
      err._tag === 'Invalid' &&
      err.message.includes(
        `\`mounts\` gives the session ${repos[1]} read-only, and Codex's \`danger-full-access\` sandbox writes everywhere.`,
      ) &&
      err.message.includes("That folder is the factory trio's") &&
      err.message.includes('nemia factory hire trio <agent> --step coded/code'),
  );
  assert.deepEqual(runs(), before, 'nothing written');
  addFactory({ name: 'solo', repos: [repos[0]] });
  attachWorkflow({ factory: 'solo', workflow: 'coded' });
  hireAgent({ factory: 'solo', agent: 'coder', step: 'coded/code' });
  const run = await runPlaced(startRun({ brief: 'code it', repo: repos[0], workflowDir: coded, isolate: false, factory: 'solo' }));
  assert.equal('mounts' in run, false, 'with nothing to mount, the same step starts');
});

test('REFUSED: a factory folder whose path a permission rule cannot name refuses a Claude Code step at start, naming the factory and what to do, before anything is written', async () => {
  const { loop } = fresh();
  const own = aRepo();
  const spaced = aRepo('First (Last)-');
  addFactory({ name: 'spaced', repos: [own, spaced] });
  attachWorkflow({ factory: 'spaced', workflow: 'loop' });
  hireAgent({ factory: 'spaced', agent: 'implementer', step: 'loop/implement' });
  hireAgent({ factory: 'spaced', agent: 'reviewer', step: 'loop/review' });
  const runs = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);
  const before = runs();
  let message = '';
  try {
    await runPlaced(startRun({ brief: 'build it', repo: own, workflowDir: loop, isolate: false, factory: 'spaced' }));
  } catch (err) {
    const refused = err as Error & { exitCode?: number; _tag?: string };
    assert.deepEqual([refused._tag, refused.exitCode], ['Invalid', 2], refused.message);
    message = refused.message;
  }
  assert.match(message, /^implement: /, "the step's line first");
  assert.ok(message.includes(`\`mounts\` gives the session ${JSON.stringify(spaced)} read-only, and Claude Code holds a folder`), message);
  const factory = message.slice(message.indexOf('\nThat folder is'));
  assert.ok(factory.startsWith("\nThat folder is the factory spaced's:"), message);
  for (const fix of [
    'nemia factory hire spaced <agent> --step loop/implement',
    'nemia factory rm spaced',
    'nemia factory add spaced --repo <path>',
    'start it in a factory',
  ])
    assert.ok(factory.includes(fix), `${fix} — in: ${message}`);
  assert.ok(factory.endsWith('Nothing was written.'), message);
  assert.deepEqual(runs(), before, 'nothing written');
});

/** `loop`'s implement step, rewritten to say `writable: <names>`. */
const writing = (loop: string, names: string) =>
  fs.writeFileSync(path.join(loop, 'implement.md'), `---\nplace: git\nwritable: ${names}\n---\nBuild what was asked.\n`);

/** The runs in the store, by file. */
const runFiles = () => (fs.existsSync(path.join(ROOT, 'runs')) ? fs.readdirSync(path.join(ROOT, 'runs')).sort() : []);

/** The refusal `start(opts)` fails with, after checking it is an `Invalid` and that no run was written. */
async function refusal(opts: Parameters<typeof startRun>[0]): Promise<string> {
  const before = runFiles();
  let failed: (Error & { _tag?: string }) | undefined;
  try {
    await runPlaced(startRun(opts));
  } catch (err) {
    failed = err as Error & { _tag?: string };
  }
  assert.equal(failed?._tag, 'Invalid', String(failed?.message));
  assert.deepEqual(runFiles(), before, 'nothing written');
  return failed.message;
}

test("a step's `writable:` folder is filed writable for that step alone, on its first filing, a try and a round, and said on its brief and by nemia start", async () => {
  const { repos, loop } = fresh();
  writing(loop, path.basename(repos[1]));
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  assert.deepEqual(readRun(run.id).mounts, readOnly(repos[1], repos[2]), 'the record keeps the run read-only list');
  const writes = [
    { path: repos[1], readOnly: false },
    { path: repos[2], readOnly: true },
  ];
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const first = b.filed.get(`${run.id}-implement`)!;
  assert.deepEqual(first.config?.mounts, writes, 'the first filing');
  assert.ok(
    first.brief.includes(
      `Folders of this factory you may write, as this step's \`writable:\` names them: \`${repos[1]}\`. Each is mounted writable for this step alone; every other step of the run only reads it.\n` +
        `Folders of this factory you may read, and must not write: \`${repos[2]}\`.`,
    ),
    first.brief,
  );
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const tried = readRun(run.id).steps.implement.taskId!;
  assert.deepEqual(b.filed.get(tried)?.config?.mounts, writes, 'a try');
  b.settle(tried, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const review = b.filed.get(`${run.id}-review`)!;
  assert.deepEqual(
    review.config?.mounts,
    [...readOnly(repos[1], repos[2]), ...readOnly(artifactsDir(run, 'implement'))],
    "every other step reads it, and the step after it implement's folder",
  );
  assert.doesNotMatch(review.brief, /you may write/);
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, tried);
  assert.deepEqual(b.filed.get(round)?.config?.mounts, writes, 'a round');
  const out = await typed(['start', 'build it', '--workflows', loop, '--factory', 'trio', '--repo', repos[0], '--no-worktree']);
  assert.ok(out.includes(`mounts: ${repos[1]}, ${repos[2]} — read-only, for every local step but where written below`), out.join('\n'));
  assert.ok(out.includes(`writable: ${repos[1]} — for implement alone`), out.join('\n'));
});

test("a step's `writable:` that names the run's own repository mounts nothing more: that folder is its workspace", async () => {
  const { repos, loop } = fresh();
  writing(loop, path.basename(repos[0]));
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  assert.deepEqual(readRun(run.id).mounts, readOnly(repos[1], repos[2]));
});

test("REFUSED at shipped defaults: a `writable:` name no folder of the factory has, naming the step, its line, the factory's folders and the fix", async () => {
  const { repos, loop } = fresh();
  writing(loop, 'nope');
  const names = repos.map((r) => path.basename(r)).join(', ');
  assert.equal(
    await refusal({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }),
    `loop/implement: \`writable: nope\` names \`nope\`, and no folder of the factory has that name — its folders are ${names}. Name one of them by its directory's name, or delete the name. Nothing was started.`,
  );
});

test('REFUSED: a `writable:` name two folders of the factory share, naming both', async () => {
  const { loop } = fresh();
  const own = aRepo();
  const [one, two] = ['p1-', 'p2-'].map((p) => {
    const parent = fs.mkdtempSync(path.join(ROOT, p));
    const repo = aRepo();
    fs.renameSync(repo, path.join(parent, 'web'));
    return path.join(parent, 'web');
  });
  addFactory({ name: 'twins', repos: [own, one, two] });
  attachWorkflow({ factory: 'twins', workflow: 'loop' });
  hireAgent({ factory: 'twins', agent: 'implementer', step: 'loop/implement' });
  hireAgent({ factory: 'twins', agent: 'reviewer', step: 'loop/review' });
  writing(loop, 'web');
  assert.equal(
    await refusal({ brief: 'build it', repo: own, workflowDir: loop, isolate: false, factory: 'twins' }),
    `loop/implement: \`writable: web\` names \`web\`, and 2 folders of the factory have that name: ${one}, ${two}. A step names a folder only when one alone has its name: rename one of the folders, then file the factory again on its new path. Nothing was started.`,
  );
});

test('REFUSED: a `writable:` folder that is no directory at start', async () => {
  const { repos, loop } = fresh();
  writing(loop, path.basename(repos[2]));
  fs.rmSync(repos[2], { recursive: true });
  assert.equal(
    await refusal({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }),
    `loop/implement: \`writable: ${path.basename(repos[2])}\` names \`${path.basename(repos[2])}\`, and ${repos[2]} is no directory now, so the run would not mount it. Start the run again once it is there, or delete the name. Nothing was started.`,
  );
});

test('REFUSED: a `writable:` in a run started in no factory', async () => {
  const { repos, loop } = fresh();
  writing(loop, path.basename(repos[1]));
  const said = await refusal({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false });
  assert.ok(said.startsWith(`loop/implement: \`writable: ${path.basename(repos[1])}\` names folders`), said);
  assert.ok(said.includes('started in none'), said);
  assert.ok(said.includes('nemia start --factory <name>'), said);
  assert.ok(said.includes('or delete the line'), said);
  assert.ok(said.endsWith('Nothing was started.'), said);
});

test("REFUSED: a read-only folder no permission rule can name, beside a step's `writable:` one, is said as the read-only mount it is", async () => {
  const { loop } = fresh();
  const own = aRepo();
  const spaced = aRepo('First (Last)-');
  const web = aRepo();
  addFactory({ name: 'spaced-web', repos: [own, spaced, web] });
  attachWorkflow({ factory: 'spaced-web', workflow: 'loop' });
  hireAgent({ factory: 'spaced-web', agent: 'implementer', step: 'loop/implement' });
  hireAgent({ factory: 'spaced-web', agent: 'reviewer', step: 'loop/review' });
  writing(loop, path.basename(web));
  const message = await refusal({ brief: 'build it', repo: own, workflowDir: loop, isolate: false, factory: 'spaced-web' });
  assert.match(message, /^implement: `mounts` gives the session /, 'quotes no `writable:` line: not a folder it names');
  assert.ok(message.includes(`\`mounts\` gives the session ${JSON.stringify(spaced)} read-only, and Claude Code holds a folder`), message);
  assert.ok(message.includes("\nThat folder is the factory spaced-web's:"), message);
  assert.ok(message.includes('nemia factory hire spaced-web <agent> --step loop/implement'), message);
});

test('REFUSED at shipped defaults: a `writable:` folder on a harness that cannot hold a writable mount, in the runtime words quoted by the line, with the fix', async () => {
  const { repos, loop } = fresh();
  const team = path.dirname(loop);
  fs.writeFileSync(path.join(team, 'agents', 'coder.md'), '---\nharness: codex\n---\nWrite the code.\n');
  const coded = path.join(team, 'coded');
  fs.mkdirSync(coded);
  fs.writeFileSync(path.join(coded, 'code.md'), `---\nplace: git\nwritable: ${path.basename(repos[1])}\n---\nCode it.\n`);
  attachWorkflow({ factory: 'trio', workflow: 'coded' });
  hireAgent({ factory: 'trio', agent: 'coder', step: 'coded/code' });
  const said = await refusal({ brief: 'code it', repo: repos[0], workflowDir: coded, isolate: false, factory: 'trio' });
  const [runtime, factory, ...more] = said.split('\n');
  assert.deepEqual(more, [], said);
  assert.ok(runtime.startsWith(`code: \`writable: ${path.basename(repos[1])}\` (filed as \`mounts\`): `), said);
  assert.ok(runtime.includes(`gives the session ${repos[1]} writable`), said);
  assert.ok(runtime.includes('the `codex` harness cannot hold a writable mount'), said);
  assert.ok(runtime.includes('`claude`'), said);
  assert.ok(factory.startsWith("That folder is the factory trio's"), said);
  assert.ok(factory.includes('coded/code names it in `writable:`'), said);
  assert.ok(factory.includes('nemia factory hire trio <agent> --step coded/code'), said);
  assert.ok(factory.includes('delete the name from `writable:`'), said);
  assert.ok(factory.endsWith('Nothing was written.'), said);
});

test("a step's `reads: inbox` is filed the store's inbox read-only, on its first filing, a try and a round, and named on each new session's brief; no other step is", async () => {
  const { repos, loop } = fresh();
  fs.writeFileSync(path.join(loop, 'implement.md'), '---\nplace: git\nreads: inbox\n---\nBuild what was asked.\n');
  const inbox = path.join(ROOT, 'inbox');
  const said = `Folders of the store you may read, and must not write, as this step's \`reads:\` names them: \`${inbox}\`. Each is mounted read-only; read it with Read, Grep and Glob.`;
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const first = b.filed.get(`${run.id}-implement`)!;
  assert.deepEqual(first.config?.mounts, readOnly(inbox), 'the first filing');
  assert.ok(first.brief.includes(said), first.brief);
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const tried = readRun(run.id).steps.implement.taskId!;
  assert.deepEqual(b.filed.get(tried)?.config?.mounts, readOnly(inbox), 'a try');
  assert.ok(b.filed.get(tried)!.brief.includes(said), "a try's brief");
  b.settle(tried, 'succeeded', SIGNED);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const review = b.filed.get(`${run.id}-review`)!;
  assert.deepEqual(review.config?.mounts, readOnly(artifactsDir(run, 'implement')), 'the step after it reads no inbox');
  assert.equal(review.brief.includes(inbox), false, 'and is told none');
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, tried);
  assert.deepEqual(b.filed.get(round)?.config?.mounts, readOnly(inbox), 'a round, which continues a session told it on its try');
});

test('mountsLine names the inbox for a local step whose `reads:` names it, and nothing for one without it or on a remote agent', () => {
  const told = (step: { harness: string; reads?: string[] }) =>
    mountsLine(step, {}, { handed: [], store: readsMounts(step, '/s/inbox'), inputs: [] });
  assert.match(told({ harness: 'claude', reads: ['inbox'] }).join('\n'), /reads:` names them: `\/s\/inbox`/);
  assert.deepEqual(told({ harness: 'claude' }), []);
  assert.deepEqual(told({ harness: 'a2a:peer', reads: ['inbox'] }), []);
  assert.deepEqual(told({ harness: 'codex', reads: ['inbox'] }), [], 'codex reads the disk in its sandbox already');
});

test('mountsLine names each folder the steps before it handed over, by its path and step, read-only, and how to list one; nothing for none', () => {
  const handed = readOnly('/s/runs/r-1/artifacts/design', '/s/runs/r-1/artifacts/implement');
  assert.deepEqual(mountsLine({ harness: 'claude' }, {}, { handed, store: [], inputs: [] }), [
    '',
    "Folders the steps before you handed over, which you may read and must not write: `/s/runs/r-1/artifacts/design` (design's), `/s/runs/r-1/artifacts/implement` (implement's). Each is mounted on its own path, and the run's artifacts folder above them is not: list one with Glob under its own path, as `/s/runs/r-1/artifacts/design/**`.",
  ]);
  assert.deepEqual(mountsLine({ harness: 'claude' }, {}, { handed: [], store: [], inputs: [] }), [], 'a step handed none');
  assert.deepEqual(mountsLine({ harness: 'a2a:peer' }, {}, { handed, store: [], inputs: [] }), [], 'a remote agent is filed none');
});

/**
 * The folders a filing mounts that its brief does not name as it mounts them: a writable one on the line that says it may be written, a
 * read-only one on a line that says it must not be. Each by its path.
 */
const unnamed = (filing: { brief: string; config?: { mounts?: unknown } }): string[] => {
  const lines = filing.brief.split('\n');
  const mounts = (filing.config?.mounts ?? []) as { path: string; readOnly: boolean }[];
  return mounts
    .filter((m) => !lines.some((l) => l.includes(`\`${m.path}\``) && (m.readOnly ? /must not write/ : /you may write/).test(l)))
    .map((m) => m.path);
};

test("every folder a local step is filed with is named on its brief, as it is mounted, on a first filing, a try and a round: the factory's, the steps' before it, the store's", async () => {
  const { repos, loop } = fresh();
  fs.writeFileSync(
    path.join(loop, 'implement.md'),
    `---\nplace: git\nwritable: ${path.basename(repos[1])}\nreads: inbox\n---\nBuild what was asked.\n`,
  );
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, factory: 'trio' }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const tried = readRun(run.id).steps.implement.taskId!;
  b.settle(tried, 'succeeded', SIGNED, true);
  await runWith(b.e, advanceRun(readRun(run.id)));
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, tried, 'a round is filed');
  assert.ok(b.filed.get(round)!.brief.includes('## What was asked for'), 'on a new session, its try having kept no session id');
  const filings = [...b.filed.values()];
  assert.equal(filings.length, 4, 'a first filing, a try, the step after it, and a round');
  const kinds = filings.flatMap((f) => (f.config?.mounts ?? []) as { path: string; readOnly: boolean }[]);
  assert.ok(kinds.some((m) => !m.readOnly) && kinds.some((m) => m.path === artifactsDir(run, 'implement')), 'every kind is filed');
  assert.ok(
    kinds.some((m) => m.path === path.join(ROOT, 'inbox')),
    "and the store's",
  );
  for (const filing of filings) assert.deepEqual(unnamed(filing), [], filing.brief);
  const review = b.filed.get(`${run.id}-review`)!;
  assert.ok(review.brief.includes(`\`${artifactsDir(run, 'implement')}\` (implement's)`), review.brief);
  assert.equal(review.brief.includes(path.join(ROOT, 'inbox')), false, 'the step after it reads no inbox, and is told none');
});

test('REFUSED: a brief that leaves out a folder its filing mounts names that folder', () => {
  const handed = artifactsDir({ id: 'r-1' }, 'implement');
  const brief = [
    '## What was asked for',
    '',
    'build it',
    ...mountsLine({ harness: 'claude' }, {}, { handed: [], store: [], inputs: [] }),
  ].join('\n');
  assert.deepEqual(unnamed({ brief, config: { mounts: readOnly(handed) } }), [handed]);
  const told = [brief, ...mountsLine({ harness: 'claude' }, {}, { handed: readOnly(handed), store: [], inputs: [] })].join('\n');
  assert.deepEqual(unnamed({ brief: told, config: { mounts: readOnly(handed) } }), []);
  assert.deepEqual(unnamed({ brief: told.replace('must not write', 'may write'), config: { mounts: readOnly(handed) } }), [handed]);
});

test('a run given an input files each local step its inputs folder read-only, on its first filing, a try and a round, and each brief names the file there', async () => {
  const { repos, loop } = fresh();
  const given = path.join(ROOT, 'template-draft.md');
  fs.writeFileSync(given, 'the draft\n');
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false, inputs: [given] }));
  const inputs = inputsDir(run);
  const said = `## Files given with it\n\nThe person gave these files with what was asked for (\`nemia start --input\`). They are part of what was asked, there for you to build your understanding of the task: \`template-draft.md\`, a text file. You may read them and must not write them, in \`${inputs}\`. The folder is mounted read-only; read them with Read, Grep and Glob.`;
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const first = b.filed.get(`${run.id}-implement`)!;
  assert.deepEqual(first.config?.mounts, readOnly(inputs), 'the first filing');
  b.settle(`${run.id}-implement`, 'failed');
  await runWith(b.e, advanceRun(readRun(run.id)));
  await runWith(b.e, retryRun(run.id, 'implement', { mode: 'fresh' }));
  await runWith(b.e, advanceRun(readRun(run.id)));
  const tried = readRun(run.id).steps.implement.taskId!;
  assert.deepEqual(b.filed.get(tried)?.config?.mounts, readOnly(inputs), 'a try');
  b.settle(tried, 'succeeded', SIGNED, true);
  await runWith(b.e, advanceRun(readRun(run.id)));
  const review = b.filed.get(`${run.id}-review`)!;
  assert.deepEqual(review.config?.mounts, readOnly(artifactsDir(run, 'implement'), inputs), 'the step after it, beside what it was handed');
  b.settle(`${run.id}-review`, 'succeeded', { ...SIGNED, again: true });
  await runWith(b.e, advanceRun(readRun(run.id)));
  const round = readRun(run.id).steps.implement.taskId!;
  assert.notEqual(round, tried, 'a round is filed');
  assert.deepEqual(b.filed.get(round)?.config?.mounts, readOnly(inputs), 'a round');
  const filings = [...b.filed.values()];
  assert.equal(filings.length, 4, 'a first filing, a try, the step after it, and a round');
  for (const filing of filings) {
    assert.equal(filing.brief.split(said).length, 2, filing.brief);
    assert.deepEqual(unnamed(filing), [], filing.brief);
  }
});

test('a run given no input is filed and told as before: no mount, and no line of files', async () => {
  const { repos, loop } = fresh();
  const run = await runPlaced(startRun({ brief: 'build it', repo: repos[0], workflowDir: loop, isolate: false }));
  const b = board();
  await runWith(b.e, advanceRun(readRun(run.id)));
  const first = b.filed.get(`${run.id}-implement`)!;
  assert.equal(Object.hasOwn(first.config!, 'mounts'), false, JSON.stringify(first.config));
  assert.doesNotMatch(first.brief, /nemia start --input/);
});
