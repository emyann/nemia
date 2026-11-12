/**
 * The board's workflow entries (`WORKFLOWS_WRITE`, `WORKFLOWS_REMOVE`, `WORKFLOWS_STEP`), and the folders it lists (`foldersLoaded`): a
 * folder written from its steps, or refused in the writer's words whole; a folder of yours removed whole, or refused with nothing removed
 * while it is not yours or something still needs it; each folder listed loaded, or with the loader's refusal, never failing the others;
 * and one step of a folder, or none, with the names of those it has. On a store of its own at `ROOT`,
 * given as `ENV`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Effect } from 'effect';
import { scratch } from 'test-kit/scratch';
import { testEngine } from 'agent-runtime/testing';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';
import { storeGiven } from '../../test/config-given.ts';
import { foldersLoaded, WORKFLOWS_REMOVE, WORKFLOWS_STEP, WORKFLOWS_WRITE } from './workflows.verb.ts';
import { runWith as runEngine } from '../runner.ts';
import { engineOf } from '../runtime-client.ts';
import { workflowVersion } from '../folder/version.store.ts';
import { removeWorkflowAt } from '../folder/write.store.ts';
import { filesStoreAt } from '../record/files.store.ts';
import * as verbs from '../inbox/inbox.store.ts';
import { StoreRoot } from '../config/root.store.ts';
import { Conflict, Invalid, Missing } from '../refusal/refusal.ts';
import { workflowDoorMemory } from './memory.store.ts';
import { AgentDoor } from '../agents/agent-door.store.ts';
import { agentDoorMemory } from '../agents/agent-memory.store.ts';
import { SkillDoor } from '../skills/skill-door.store.ts';
import { skillDoorMemory } from '../skills/skill-memory.store.ts';
import { doorFrom } from '../../test/door-walks.ts';
import type { Env } from '../config/config.store.ts';

const ROOT = scratch('wf-workflows-root-');
const ENV: Env = { ...process.env, WF_ROOT: ROOT };
const stand = eachTest(testPlace);
const engine = eachTest(testEngine);
const runWith = runOver(runEngine, () => stand().layer, ENV);
const runFiles = filesStoreAt(ROOT);
/** `nemia inbox queue`'s verb run at this test's store root and settings, as `nemia` gives them: its answer, or its refusal thrown. */
const queueInInbox = (...args: Parameters<typeof verbs.queueInInbox>) => Effect.runSync(storeGiven(ROOT, ENV)(verbs.queueInInbox(...args)));

const e = () => engineOf(engine().layer);

/** The folders `dirs`, each loaded in no factory at the test's store, as the api loads the board's list. */
const listedOf = (dirs: readonly string[]) => Effect.provideService(foldersLoaded(dirs, { home: ROOT }), StoreRoot, ROOT);

/**
 * One Workflow door's memory stand-in, given to each program the test runs: the folders it writes, the next reads; its agents and skills
 * found through the Agent and Skill doors' own stand-ins.
 */
const memoryOver = () => {
  const memory = workflowDoorMemory({
    agents: doorFrom(AgentDoor, agentDoorMemory()),
    skills: doorFrom(SkillDoor, skillDoorMemory()),
  });
  return <A, E, R>(program: Effect.Effect<A, E, R>) => Effect.provide(program, memory);
};

/** A folder of yours, `name`, with each step's file as given. */
function folder(name: string, files: Record<string, string>): string {
  const dir = path.join(ROOT, 'workflows', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const [file, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, file), text);
  return dir;
}

test('a folder written from its steps through the entry is the folder its list and its step read back', async () => {
  const onMemory = memoryOver();
  const dir = path.join(ROOT, 'workflows', 'written');
  const draft = [
    { name: 'plan', after: [], place: 'git' as const, body: 'Plan it.' },
    { name: 'build', after: ['plan'], place: 'git' as const, body: 'Build it.' },
  ];
  const done = await runWith(e(), onMemory(WORKFLOWS_WRITE.handler({ from: 'yours', name: 'written', draft })));
  assert.deepEqual(done.written, ['build.md', 'plan.md']);
  assert.equal(fs.existsSync(dir), false, 'written to the memory layer, not the disk');
  const listed = await runWith(e(), onMemory(listedOf([dir])));
  const loaded = listed[dir];
  assert.ok(loaded && 'steps' in loaded, JSON.stringify(loaded));
  assert.deepEqual(
    loaded.steps.map((s) => [s.name, s.after]),
    [
      ['plan', []],
      ['build', ['plan']],
    ],
  );
  const read = await runWith(e(), onMemory(WORKFLOWS_STEP.handler({ name: 'written', step: 'build', dir })));
  assert.equal(read.step?.body, 'Build it.');
  assert.deepEqual(read.steps, ['plan', 'build']);
});

test('a step the folder does not have is none, with the names of those it has', async () => {
  const onMemory = memoryOver();
  const dir = path.join(ROOT, 'workflows', 'one-step');
  const draft = [{ name: 'only', after: [], place: 'git' as const, body: 'Do it.' }];
  await runWith(e(), onMemory(WORKFLOWS_WRITE.handler({ from: 'yours', name: 'one-step', draft })));
  const read = await runWith(e(), onMemory(WORKFLOWS_STEP.handler({ name: 'one-step', step: 'other', dir })));
  assert.deepEqual(read, { step: null, steps: ['only'] });
});

test("REFUSED: a folder that does not load is listed with the loader's words whole, and the folder beside it still loads", async () => {
  const good = folder('good', { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  const bad = folder('bad', { 'only.md': '---\nafter: nowhere\nplace: git\n---\nDo it.\n' });
  const listed = await runWith(e(), listedOf([bad, good]));
  assert.deepEqual(listed[bad], { error: 'only: waits on "nowhere", which is not a step here' });
  assert.deepEqual(Object.keys(listed), [bad, good]);
  assert.ok(listed[good] && 'steps' in listed[good]);
});

test("REFUSED: a draft the model's Workflow refuses is thrown as the door's Invalid, naming the file, and nothing is written", async () => {
  const dir = path.join(ROOT, 'workflows', 'twice');
  const draft = [
    { name: 'plan', after: [], place: 'git' as const, body: 'Plan it.' },
    { name: 'plan', after: [], place: 'git' as const, body: 'Plan it again.' },
  ];
  await assert.rejects(runWith(e(), WORKFLOWS_WRITE.handler({ from: 'yours', name: 'twice', draft })), (err: Error) => {
    assert.deepEqual([(err as { _tag?: string })._tag, (err as { exitCode?: number }).exitCode], ['Invalid', 2]);
    assert.ok(err.message.includes('plan.md'), err.message);
    return true;
  });
  assert.equal(fs.existsSync(dir), false);
});

/** The version a remove of the folder `dir` is handed: the one it is at, where it is a folder; none where it is not. */
function versionAt(dir: string): { version?: string } {
  return fs.statSync(dir, { throwIfNoEntry: false })?.isDirectory()
    ? { version: Effect.runSync(Effect.provideService(workflowVersion(dir, { home: ROOT }), StoreRoot, ROOT)) }
    : {};
}

/** The folder of yours `dir` removed through the entry, by its name, at the version it is at, as the api hands it. */
const remove = (dir: string) =>
  runWith(e(), WORKFLOWS_REMOVE.handler({ from: 'yours', name: path.relative(path.join(ROOT, 'workflows'), dir), ...versionAt(dir) }));

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
  runFiles.runs.create({
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
  const fromRepo = WORKFLOWS_REMOVE.handler({ from: 'repo', name: 'shared', version: 'v1', repo });
  await assert.rejects(runWith(e(), fromRepo), (err: Error) => {
    assert.ok(err instanceof Invalid, `${err.name}: ${err.message}`);
    assert.ok(err.message.startsWith(`nemia workflows rm refuses `), err.message);
    assert.ok(err.message.includes(`(${path.join(repo, 'workflows')})`), err.message);
    assert.ok(err.message.includes(`only yours is written, in ${yours}`), err.message);
    assert.ok(err.message.includes(`\`cp -r ${theirs} ${yours}/\``), err.message);
    return true;
  });
  assert.ok(fs.existsSync(theirs));
  const nested = folder(path.join('outer', 'inner'), { 'only.md': '---\nplace: git\n---\nDo it.\n' });
  await refused(
    nested,
    Invalid,
    "nemia workflows rm: `outer/inner` is not a workflow's name: a workflow is named by its folder, not hidden, with no slash — build, say.",
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
      `nemia workflows rm: ${name}/ holds the agents or the skills beside the workflows, and no workflow has its name. Name the workflow's folder.`,
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
      () => removeWorkflowAt(ROOT, dir),
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
    () => removeWorkflowAt(ROOT, agents),
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
  runFiles.runs.forget('r-reads');
  runOn('r-froze', dir, true);
  await remove(dir);
  assert.equal(fs.existsSync(dir), false);
  runFiles.runs.forget('r-froze');
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
  assert.throws(
    () => queueInInbox('queued-idea', { workflow: path.basename(other) }),
    Conflict,
    'a card still queued is not queued on another',
  );
  queueInInbox('queued-idea', { off: true });
  queueInInbox('queued-idea', { workflow: path.basename(other) });
  await assert.rejects(remove(other), Conflict, 'a card queued by the folder name, as a card names its workflow now, holds it too');
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
