/**
 * The board's workflow entries (`WORKFLOWS_WRITE`, `WORKFLOWS_REMOVE`, `WORKFLOWS_LIST`, `WORKFLOWS_STEP`), served on the api alone: a
 * folder written from its steps, or refused in the writer's words whole; a folder of yours removed whole, or refused with nothing removed
 * while it is not yours or something still needs it; each folder listed loaded, or with the loader's refusal, never failing the others;
 * and one step of a folder, or none, with the names of those it has. `WF_ROOT` is set before the import, since the store reads it as it
 * loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-workflows-root-');
process.env.WF_ROOT = ROOT;
const { WORKFLOWS_LIST, WORKFLOWS_REMOVE, WORKFLOWS_STEP, WORKFLOWS_WRITE } = await import('./workflows.verb.ts');
const { runWith: runEngine } = await import('../runner.ts');
const { engineOf } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer);
const { runStore } = await import('../record/files.store.ts');
const { workflowVersion } = await import('./version.store.ts');
const { removeWorkflow } = await import('./write.store.ts');
const { queueInInbox } = await import('../inbox/inbox.store.ts');
const { Conflict, Invalid, Missing } = await import('../refusal/refusal.ts');

const e = () => engineOf(engine().layer);

/** A folder of yours, `name`, with each step's file as given. */
function folder(name: string, files: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

test('a folder written from its steps through the entry is the folder its list and its step read back', async () => {
  const dir = path.join(ROOT, 'workflows', 'written');
  const draft = JSON.stringify([
    { name: 'plan', after: [], place: 'git', body: 'Plan it.' },
    { name: 'build', after: ['plan'], place: 'git', body: 'Build it.' },
  ]);
  const done = await runWith(e(), WORKFLOWS_WRITE.handler({ from: 'yours', name: 'written', draft }, undefined, ROOT));
  assert.deepEqual(done.written, ['build.md', 'plan.md']);
  const listed = await runWith(e(), WORKFLOWS_LIST.handler({ dirs: [dir] }, undefined, ROOT));
  const loaded = listed[dir];
  assert.ok(loaded && 'steps' in loaded, JSON.stringify(loaded));
  assert.deepEqual(
    loaded.steps.map((s) => [s.name, s.after]),
    [
      ['plan', []],
      ['build', ['plan']],
    ],
  );
  const read = await runWith(e(), WORKFLOWS_STEP.handler({ from: 'yours', name: 'written', step: 'build', dir }, undefined, ROOT));
  assert.equal(read.step?.body, 'Build it.');
  assert.deepEqual(read.steps, ['plan', 'build']);
});

test('a step the folder does not have is none, with the names of those it has', async () => {
  const dir = folder('one-step', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  const read = await runWith(e(), WORKFLOWS_STEP.handler({ from: 'yours', name: 'one-step', step: 'other', dir }, undefined, ROOT));
  assert.deepEqual(read, { step: null, steps: ['only'] });
});

test("REFUSED: a folder that does not load is listed with the loader's words whole, and the folder beside it still loads", async () => {
  const good = folder('good', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  const bad = folder('bad', { 'only.md': '---\nafter: nowhere\nplace: git\n---\nDo it.\n' });
  const listed = await runWith(e(), WORKFLOWS_LIST.handler({ dirs: [bad, good] }, undefined, ROOT));
  assert.deepEqual(listed[bad], { error: 'only: waits on "nowhere", which is not a step here' });
  assert.deepEqual(Object.keys(listed), [bad, good]);
  assert.ok(listed[good] && 'steps' in listed[good]);
});

test("REFUSED: a draft the writer refuses is thrown in the writer's words whole, and nothing is written", async () => {
  const dir = path.join(ROOT, 'workflows', 'twice');
  const draft = JSON.stringify([
    { name: 'plan', after: [], place: 'git', body: 'Plan it.' },
    { name: 'plan', after: [], place: 'git', body: 'Plan it again.' },
  ]);
  await assert.rejects(runWith(e(), WORKFLOWS_WRITE.handler({ from: 'yours', name: 'twice', draft }, undefined, ROOT)), (err: Error) => {
    assert.equal(err.message, 'two steps are named plan, and a step is its file, plan.md. Rename one of them.');
    return true;
  });
  assert.equal(fs.existsSync(dir), false);
});

/** The version a remove of the folder `dir` is handed: the one it is at, where it is a folder; none where it is not. */
function versionAt(dir: string): { version?: string } {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory() ? { version: workflowVersion(dir, { home: ROOT }) } : {};
}

/** The folder of yours `dir` removed through the entry, by its name, at the version it is at, as the api hands it. */
const remove = (dir: string) =>
  runWith(
    e(),
    WORKFLOWS_REMOVE.handler({ from: 'yours', name: path.relative(path.join(ROOT, 'workflows'), dir), ...versionAt(dir) }, undefined, ROOT),
  );

/** That removing `dir` is refused as `kind`, in exactly `message`, and the folder is still on disk. */
async function refused(dir: string, kind: new (...args: never[]) => Error, message: string): Promise<void> {
  await assert.rejects(remove(dir), (err: Error) => {
    assert.ok(err instanceof kind, `${err.name}: ${err.message}`);
    assert.equal(err.message, message);
    return true;
  });
  assert.ok(fs.existsSync(dir), `${dir} kept`);
}

/** A run's record whose steps are read from `dir`: frozen at its start, or not. */
function runOn(id: string, dir: string, frozen: boolean): void {
  runStore.runs.create({
    id,
    repo: dir,
    workspace: dir,
    baseRef: 'abc123',
    branch: 'main',
    isolate: false,
    brief: 'do it',
    workflowDir: dir,
    ...(frozen && { workflow: [{ name: 'only', after: [], body: 'Do it.', harness: 'claude' }] }),
    steps: { only: { taskId: null } },
    createdAt: '2026-10-01T00:00:00.000Z',
  });
}

/** A card in the inbox naming `dir` as its workflow, queued or not. */
function cardOn(name: string, dir: string, queued: boolean): void {
  fs.mkdirSync(path.join(ROOT, 'inbox'), { recursive: true });
  const queue = queued ? 'queued: 2026-10-01T00:00:00.000Z\n' : '';
  fs.writeFileSync(path.join(ROOT, 'inbox', `${name}.md`), `---\nworkflow: ${dir}\n${queue}---\nAn idea.\n`);
}

/** A factory's file: its repositories, the workflows it attaches and its hires. */
function factoryOf(name: string, repos: string[], workflows: string[], hires: Record<string, string>): void {
  fs.mkdirSync(path.join(ROOT, 'factories'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'factories', `${name}.json`), JSON.stringify({ repos, workflows, hires }));
}

test('a folder of yours removed through the entry is gone, with every file it held named', async () => {
  const dir = folder('gone', {
    'plan.md': '---\nplace: git\n---\nPlan it.\n',
    'build.md': '---\nafter: plan\nplace: git\n---\nBuild it.\n',
    'README.md': 'What it is for.\n',
    'plan.schema.json': '{}',
  });
  fs.mkdirSync(path.join(dir, 'notes'));
  fs.writeFileSync(path.join(dir, 'notes', 'a.txt'), 'a');
  assert.deepEqual(await remove(dir), {
    dir,
    removed: ['README.md', 'build.md', path.join('notes', 'a.txt'), 'plan.md', 'plan.schema.json'],
  });
  assert.equal(fs.existsSync(dir), false);
});

test("REFUSED: a repository's workflow is not removed here, nor a folder nested in yours, and the same folder in yours is", async () => {
  const repo = scratch('wf-remove-repo-');
  fs.mkdirSync(path.join(repo, '.git'));
  const theirs = path.join(repo, 'workflows', 'shared');
  fs.mkdirSync(theirs, { recursive: true });
  fs.writeFileSync(path.join(theirs, 'only.md'), '---\nplace: git\n---\nDo it.\n');
  const yours = path.join(ROOT, 'workflows');
  const fromRepo = WORKFLOWS_REMOVE.handler({ from: 'repo', name: 'shared', version: 'v1', repo }, undefined, ROOT);
  await assert.rejects(runWith(e(), fromRepo), (err: Error) => {
    assert.ok(err instanceof Invalid, `${err.name}: ${err.message}`);
    assert.equal(
      err.message,
      `nemia workflows remove refuses to write the repository's workflows (${path.join(repo, 'workflows')}): only yours is written, in ${yours}, and nothing into a checkout. Build the workflow in yours — \`cp -r ${theirs} ${yours}/\` starts from this one — then copy the folder into ${path.join(repo, 'workflows')} by hand, where git shows it as a change to commit.`,
    );
    return true;
  });
  assert.ok(fs.existsSync(theirs));
  const nested = folder(path.join('outer', 'inner'), { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  await refused(
    nested,
    Invalid,
    "nemia workflows remove: `outer/inner` is not a workflow's name: a workflow is named by its folder, not hidden, with no slash — build, say.",
  );
  fs.renameSync(theirs, path.join(yours, 'shared'));
  await remove(path.join(yours, 'shared'));
  assert.equal(fs.existsSync(path.join(yours, 'shared')), false);
});

test('REFUSED: the folders of agents and of skills are no workflow, and both are kept', async () => {
  for (const name of ['agents', 'skills']) {
    const dir = folder(name, { 'one.md': 'An agent.\n' });
    await refused(
      dir,
      Invalid,
      `nemia workflows remove: ${name}/ holds the agents or the skills beside the workflows, and no workflow has its name. Name the workflow's folder.`,
    );
    assert.ok(fs.existsSync(path.join(dir, 'one.md')));
  }
});

test("REFUSED, by the remover itself: a folder outside yours, one nested in it and the agents' folder, each kept", () => {
  const theirs = path.join(scratch('wf-remove-outside-'), 'workflows', 'shared');
  fs.mkdirSync(theirs, { recursive: true });
  const nested = folder(path.join('deep', 'inner'), { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  const yours = path.join(ROOT, 'workflows');
  for (const dir of [theirs, nested]) {
    assert.throws(
      () => removeWorkflow(dir, { home: ROOT }),
      (err: Error) => {
        assert.ok(err instanceof Invalid);
        assert.equal(
          err.message,
          `${dir} is not a workflow of yours (${path.join(yours, '<name>')}): only yours are removed here, and a repository's workflow is removed from its checkout, as a change to commit. Nothing was removed.`,
        );
        return true;
      },
    );
    assert.ok(fs.existsSync(dir));
  }
  const agents = folder('agents', { 'one.md': 'An agent.\n' });
  assert.throws(
    () => removeWorkflow(agents, { home: ROOT }),
    (err: Error) => err instanceof Invalid && new RegExp(`^${agents.replaceAll('/', '\\/')} is agents\\/, the folder of`).test(err.message),
  );
  assert.ok(fs.existsSync(path.join(agents, 'one.md')));
});

test('REFUSED: a folder that is a link is not removed, nor what it points at', async () => {
  const target = scratch('wf-remove-target-');
  fs.writeFileSync(path.join(target, 'only.md'), '---\nplace: git\n---\nDo it.\n');
  const link = path.join(ROOT, 'workflows', 'linked');
  fs.mkdirSync(path.dirname(link), { recursive: true });
  fs.symlinkSync(target, link);
  await assert.rejects(remove(link), (err: Error) => {
    assert.ok(err instanceof Invalid);
    assert.match(err.message, new RegExp(`^${link.replaceAll('/', '\\/')} is a link, and removing it would remove the link`));
    return true;
  });
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(target, 'only.md')));
});

test('REFUSED: a name not there, or a file of that name, is missing', async () => {
  const none = path.join(ROOT, 'workflows', 'never');
  await assert.rejects(remove(none), (err: Error) => {
    assert.ok(err instanceof Missing);
    assert.equal(err.message, `${none} is not there: it was removed already.`);
    return true;
  });
  const file = path.join(ROOT, 'workflows', 'plain');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'not a folder');
  await refused(file, Missing, `${file} is a file, not a workflow folder: nothing of yours is removed under that name.`);
});

test('REFUSED: a run that froze no workflow reads it from the folder, and one that froze it does not stop the removal', async () => {
  const dir = folder('run-reads', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  runOn('r-reads', dir, false);
  await refused(
    dir,
    Conflict,
    `${dir} is still needed: run r-reads froze no workflow at its start and reads its steps from ${dir}: nemia rm r-reads forgets it. Nothing was removed.`,
  );
  runStore.runs.forget('r-reads');
  runOn('r-froze', dir, true);
  await remove(dir);
  assert.equal(fs.existsSync(dir), false);
  runStore.runs.forget('r-froze');
});

test('REFUSED: a card queued on the folder, freed by the commands its refusal names, and a card not queued does not stop the removal', async () => {
  const dir = folder('card-on', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  const other = folder('card-elsewhere', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  cardOn('queued-idea', dir, true);
  await refused(
    dir,
    Conflict,
    `${dir} is still needed: card queued-idea is queued to start on ${dir}: nemia inbox queue queued-idea --off takes it back, and nemia inbox queue queued-idea --workflow <w> then queues it on another. Nothing was removed.`,
  );
  assert.throws(() => queueInInbox('queued-idea', { workflow: other }), Conflict, 'a card still queued is not queued on another');
  queueInInbox('queued-idea', { off: true });
  queueInInbox('queued-idea', { workflow: other });
  await remove(dir);
  assert.equal(fs.existsSync(dir), false);
  const idle = folder('card-idle', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  cardOn('idle-idea', idle, false);
  await remove(idle);
  assert.equal(fs.existsSync(idle), false);
  fs.rmSync(path.join(ROOT, 'inbox', 'queued-idea.md'));
  fs.rmSync(path.join(ROOT, 'inbox', 'idle-idea.md'));
});

test('REFUSED: a factory offering the name with nothing else to give under it, and neither one whose repository has the workflow nor one offering another name does', async () => {
  const dir = folder('offered', { 'review.md': '---\nplace: git\n---\nRead it.\n' });
  const repo = scratch('wf-remove-factory-repo-');
  factoryOf('shop', [repo], ['offered'], { 'offered/review': 'reader', 'other/plan': 'planner' });
  factoryOf('elsewhere', [scratch('wf-remove-elsewhere-repo-')], ['other'], { 'other/plan': 'planner' });
  await refused(
    dir,
    Conflict,
    `${dir} is still needed: factory shop offers offered, and none of its repositories has a workflow of that name: nemia factory fire shop --step offered/review, then nemia factory detach shop offered. Nothing was removed.`,
  );
  fs.mkdirSync(path.join(repo, 'workflows', 'offered'), { recursive: true });
  await remove(dir);
  assert.equal(fs.existsSync(dir), false);
  fs.rmSync(path.join(ROOT, 'factories', 'shop.json'));
  fs.rmSync(path.join(ROOT, 'factories', 'elsewhere.json'));
});
