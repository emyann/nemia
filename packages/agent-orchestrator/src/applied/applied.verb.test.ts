/**
 * A factory made from a template, on disk: `nemia factory apply` refusing a bad parameter or template with nothing written, and filing
 * only the factory's file; the controller rendering its base and seeding its tree once, level-triggered, its status written by it alone;
 * and the factory's verbs reading and writing its tree. `WF_ROOT` is set before the import, since the store's modules read it as they load.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parse, stringify } from 'yaml';
import { scratch } from '../../test/scratch.ts';
import { promised } from '../../test/promised.ts';
import { teamCopy } from '../../test/team.ts';
import { testPlace } from '../../place/memory/index.ts';
import { eachTest, runOver } from '../../test/placed.ts';

const ROOT = scratch('wf-applied-');
process.env.WF_ROOT = ROOT;
const FACTORIES = path.join(ROOT, 'factories');
const { exportTemplate } = await import('../template/template.store.ts');
const { attachWorkflow, detachWorkflow, fireAgent, hireAgent, readFactories, readFactory } = await import('../runner.ts');
const { main: cli } = await import('../cli/main.ts');
const { reconcileFactory, reconcileOnce } = await import('./applied.verb.ts');
const { appliedDir, readStatus, statusFile, treeDir } = await import('./applied.store.ts');
const { readRun } = await import('../record/record.store.ts');
const { startDue } = await import('../schedule/schedule.verb.ts');
const { runWith: runEngine } = await import('../runtime-client.ts');
const stand = eachTest(testPlace);
const runWith = runOver(runEngine, () => stand().layer);
/** `nemia`, as a person types it, its commands given this test's place. */
const main = (argv: string[], e?: Parameters<typeof cli>[1]) => cli(argv, e, undefined, stand().place);
const { Effect } = await import('effect');

/** No verb here asks the engine anything. */
const NO_ENGINE = promised({});

/** Refused by kind, exit 2, and the message — never `String(err)`, which starts with `Error: `. */
const refusedWith = (tag: 'Missing' | 'Conflict' | 'Invalid', pattern: RegExp) => (err: Error & { exitCode?: number; _tag?: string }) =>
  err._tag === tag && err.exitCode === 2 && pattern.test(err.message);

/** A repository holding the tests' team as its `workflows/`, in one commit, so a start has a base to record. */
function repoWithTeam(): string {
  const repo = scratch('wf-applied-repo-');
  fs.renameSync(teamCopy(), path.join(repo, 'workflows'));
  stand().world.repository(repo, {});
  stand().world.commit(repo, 'base');
  return repo;
}

/** The tests' team exported as a template, `budget` a parameter of the review step with no default, and `model` one with a default. */
function template(): { dir: string; repo: string } {
  const repo = repoWithTeam();
  const dir = path.join(scratch('wf-applied-template-'), 'team');
  exportTemplate({ dir, from: repo });
  edit(dir, 'nemia.yaml', (spec) => {
    spec.parameters = {
      budget: { type: 'number', description: 'dollars for a review' },
      model: { type: 'string', description: 'the reviewer model', default: 'opus' },
    };
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].budget = { param: 'budget' };
  });
  edit(dir, 'agents/reviewer/agent.yaml', (spec) => {
    spec.claude.model = { param: 'model' };
  });
  return { dir, repo };
}

/** The document `file` of `dir`, its spec changed by `change`. */
function edit(dir: string, file: string, change: (spec: Record<string, any>) => void): void {
  const doc = parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  change(doc.spec);
  fs.writeFileSync(path.join(dir, file), stringify(doc, { lineWidth: 0 }));
}

/** Every file under the factories folder, by its path in it, so a refusal is seen to have written nothing. */
const filed = (): string[] => (fs.existsSync(FACTORIES) ? (fs.readdirSync(FACTORIES, { recursive: true }) as string[]).sort() : []);

/** `nemia factory apply` of the template `dir` as `name`, in the repository `repo`, with `rest` after. */
const apply = (name: string, dir: string, repo: string, ...rest: string[]) =>
  main(['factory', 'apply', name, '--template', dir, '--repo', repo, ...rest], NO_ENGINE);

/** The factory `name`, read as the controller reads it. */
const templated = (name: string) =>
  readFactory(name) as ReturnType<typeof readFactory> & { template: NonNullable<ReturnType<typeof readFactory>['template']> };

test('apply refuses a key not declared, a value of the wrong type and a required one not given, every one at once, and writes nothing', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  const before = filed();
  await assert.rejects(
    apply('refused', dir, repo, '--set', 'colour=red', '--set', 'model=x'),
    refusedWith('Invalid', /with 2 problems:\n--set colour=red: the template declares no parameter colour[^\n]*\nbudget has no default/),
  );
  await assert.rejects(
    apply('refused', dir, repo, '--set', 'budget=lots'),
    refusedWith('Invalid', /--set budget=lots: budget is a number/),
  );
  await assert.rejects(apply('refused', dir, repo), refusedWith('Invalid', /budget has no default, and no --set gives it/));
  await assert.rejects(
    main(['factory', 'apply', 'refused', '--repo', repo], NO_ENGINE),
    refusedWith('Invalid', /name its folder or archive with --template <folder\|archive>/),
  );
  fs.writeFileSync(path.join(dir, 'nemia.yaml'), fs.readFileSync(path.join(dir, 'nemia.yaml'), 'utf8').replace('v1alpha1', 'v2'));
  await assert.rejects(
    apply('refused', dir, repo, '--set', 'budget=3'),
    refusedWith('Invalid', /nemia\.yaml:1:\d+: apiVersion is "nemia\.dev\/v2"/),
  );
  assert.deepEqual(filed(), before);
});

test("apply files only the factory's file, naming its template, version and parameters; the controller renders the rest", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('made', dir, repo, '--set', 'budget=7');
  assert.deepEqual(
    filed().filter((f) => f.startsWith('made')),
    ['made.json'],
  );
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(FACTORIES, 'made.json'), 'utf8')), {
    repos: [repo],
    template: { source: dir, version: '0.1.0', params: { budget: 7, model: 'opus' } },
  });
  assert.deepEqual(readFactory('made').workflows, [], 'a tree not rendered yet offers nothing');
  assert.deepEqual(
    (readFactories().find((f) => f.name === 'made') as { status?: unknown }).status,
    { applied: null, conditions: [] },
    'none is applied before the controller renders it',
  );
  await assert.rejects(apply('made', dir, repo, '--set', 'budget=7'), refusedWith('Conflict', /There is a factory made already/));
});

test("the controller renders the base read-only and seeds the tree once; a second pass changes nothing, and the tree stays the person's", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('seeded', dir, repo, '--set', 'budget=7');
  const status = reconcileFactory(templated('seeded'));
  assert.deepEqual(status.conditions, [
    { type: 'Applied', status: 'True', reason: 'Rendered', message: `The base holds ${dir} at 0.1.0; the tree is yours to change.` },
    {
      type: 'ConflictsPending',
      status: 'False',
      reason: 'NoUpgrade',
      message: 'No upgrade is under way, so no change waits to be merged.',
    },
  ]);
  assert.equal(status.version, '0.1.0');
  assert.match(status.digest ?? '', /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(readStatus('seeded'), status);
  const review = path.join(treeDir('seeded'), 'workflows', 'dev', 'review.md');
  assert.match(fs.readFileSync(review, 'utf8'), /^budget: 7$/m);
  assert.match(fs.readFileSync(path.join(treeDir('seeded'), 'workflows/agents/reviewer.md'), 'utf8'), /^model: opus$/m);
  assert.equal(fs.statSync(path.join(appliedDir('seeded'), 'workflows', 'dev', 'review.md')).mode & 0o222, 0, 'the base is read-only');
  assert.throws(
    () => fs.writeFileSync(path.join(appliedDir('seeded'), 'factory.json'), '{}'),
    (err: Error) => /EACCES/.test(err.message),
  );
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 7', 'budget: 9'));
  const written = fs.statSync(statusFile('seeded')).mtimeMs;
  assert.deepEqual(reconcileFactory(templated('seeded')), status);
  assert.match(fs.readFileSync(review, 'utf8'), /^budget: 9$/m, "the tree, once seeded, is the person's");
  assert.equal(fs.statSync(statusFile('seeded')).mtimeMs, written, 'a status that did not change is not written');
  fs.rmSync(statusFile('seeded'));
  fs.rmSync(treeDir('seeded'), { recursive: true });
  await Effect.runPromise(reconcileOnce());
  assert.deepEqual(readStatus('seeded'), status, 'a restart reads it all again off the disk');
  assert.match(fs.readFileSync(review, 'utf8'), /^budget: 7$/m, 'a tree removed is seeded again from the base');
});

test('a template packed into an archive applies as its folder does, each file read off the archive, its mode kept', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  const script = 'skills/implement-a-change/scripts/run.sh';
  fs.mkdirSync(path.dirname(path.join(dir, script)), { recursive: true });
  fs.writeFileSync(path.join(dir, script), '#!/bin/sh\necho run\n', { mode: 0o755 });
  const archive = path.join(scratch('wf-applied-archive-'), 'team.tgz');
  await main(['template', 'pack', dir, '--out', archive], NO_ENGINE);
  fs.rmSync(dir, { recursive: true });
  await apply('packed', archive, repo, '--set', 'budget=7');
  assert.deepEqual(templated('packed').template, { source: archive, version: '0.1.0', params: { budget: 7, model: 'opus' } });
  const status = reconcileFactory(templated('packed'));
  assert.deepEqual(status.conditions[0], {
    type: 'Applied',
    status: 'True',
    reason: 'Rendered',
    message: `The base holds ${archive} at 0.1.0; the tree is yours to change.`,
  });
  assert.match(fs.readFileSync(path.join(treeDir('packed'), 'workflows', 'dev', 'review.md'), 'utf8'), /^budget: 7$/m);
  const copied = path.join(treeDir('packed'), 'workflows', script);
  assert.equal(fs.readFileSync(copied, 'utf8'), '#!/bin/sh\necho run\n');
  assert.equal(fs.statSync(copied).mode & 0o111, 0o111, 'a copied file keeps the mode the archive holds');
  assert.deepEqual(reconcileFactory(templated('packed')), status, 'a second pass reads the archive to the same base');
});

test('a template moved to another version is drift: the base and tree are left as they are, and Applied says so', async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('drifted', dir, repo, '--set', 'budget=7');
  const first = reconcileFactory(templated('drifted'));
  edit(dir, 'nemia.yaml', (spec) => {
    spec.version = '0.2.0';
  });
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].rounds = 5;
  });
  const listed = () => readFactories().find((f) => f.name === 'drifted') as { status?: unknown };
  assert.deepEqual(listed().status, { applied: '0.1.0', conditions: first.conditions }, 'the listing reads what the controller wrote');
  const status = reconcileFactory(templated('drifted'));
  assert.deepEqual(listed().status, { applied: '0.1.0', conditions: status.conditions });
  assert.deepEqual(status.conditions[0], {
    type: 'Applied',
    status: 'False',
    reason: 'VersionDrift',
    message: `The template is at version 0.2.0, and drifted was applied at 0.1.0: its base and tree are left as they are. Put the template back at 0.1.0, or upgrade to 0.2.0: nemia factory plan drifted --to 0.2.0, then nemia factory upgrade drifted --to 0.2.0.`,
  });
  assert.equal(status.digest, first.digest);
  assert.doesNotMatch(fs.readFileSync(path.join(treeDir('drifted'), 'workflows/dev/review.md'), 'utf8'), /^rounds: 5$/m);
  fs.writeFileSync(path.join(dir, 'nemia.yaml'), 'not: [yaml');
  assert.equal(reconcileFactory(templated('drifted')).conditions[0].reason, 'TemplateInvalid');
});

test("parameters changed in the factory's file, or the template's files changed at its version, are said by Applied; base and tree kept", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('moved', dir, repo, '--set', 'budget=7');
  const first = reconcileFactory(templated('moved'));
  const file = path.join(FACTORIES, 'moved.json');
  const filedAs = fs.readFileSync(file, 'utf8');
  const content = JSON.parse(filedAs);
  content.template.params.budget = 9;
  fs.writeFileSync(file, JSON.stringify(content));
  const review = (folder: string) => fs.readFileSync(path.join(folder, 'workflows/dev/review.md'), 'utf8');
  const changed = reconcileFactory(templated('moved'));
  assert.deepEqual(changed.conditions[0], {
    type: 'Applied',
    status: 'False',
    reason: 'ParamsChanged',
    message:
      "The parameters in moved's file differ from those its base was rendered with: its base and tree are left as they are. Put them back, or upgrade with them to the template's next version: nemia factory plan moved --to <version>, then nemia factory upgrade moved --to <version>.",
  });
  assert.deepEqual([changed.digest, changed.params], [first.digest, first.params]);
  assert.match(review(appliedDir('moved')), /^budget: 7$/m);
  assert.match(review(treeDir('moved')), /^budget: 7$/m);
  fs.writeFileSync(file, filedAs);
  assert.equal(reconcileFactory(templated('moved')).conditions[0].reason, 'Rendered', 'the parameters put back, the base is as rendered');
  edit(dir, 'workflows/dev/workflow.yaml', (spec) => {
    spec.steps[1].rounds = 5;
  });
  const edited = reconcileFactory(templated('moved'));
  assert.deepEqual(edited.conditions[0], {
    type: 'Applied',
    status: 'False',
    reason: 'ContentChanged',
    message: "The template's files changed under version 0.1.0: give the template a new version for the change, or put its files back.",
  });
  assert.equal(edited.digest, first.digest);
  assert.doesNotMatch(review(appliedDir('moved')), /^rounds: 5$/m);
  assert.doesNotMatch(review(treeDir('moved')), /^rounds: 5$/m);
});

test("a templated factory reads its tree's wiring, and attach, hire, fire and detach write the tree; none while it is not rendered", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('wired', dir, repo, '--set', 'budget=7');
  await assert.rejects(
    async () => attachWorkflow({ factory: 'wired', workflow: 'other' }),
    refusedWith('Conflict', /its tree is not rendered yet, at .*: start the daemon, nemia up/),
  );
  reconcileFactory(templated('wired'));
  const own = fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8');
  const wiring = () => JSON.parse(fs.readFileSync(path.join(treeDir('wired'), 'factory.json'), 'utf8'));
  assert.deepEqual(readFactory('wired').workflows, ['dev']);
  assert.deepEqual(readFactory('wired').hires, { 'dev/implement': 'implementer', 'dev/review': 'reviewer', 'dev/ship': 'shipper' });
  fireAgent({ factory: 'wired', step: 'dev/review' });
  hireAgent({ factory: 'wired', agent: 'implementer', step: 'dev/review' });
  assert.equal(wiring().hires['dev/review'], 'implementer');
  attachWorkflow({ factory: 'wired', workflow: 'other' });
  assert.deepEqual(wiring().workflows, ['dev', 'other']);
  detachWorkflow({ factory: 'wired', workflow: 'other' });
  assert.deepEqual(readFactory('wired').workflows, ['dev']);
  assert.equal(fs.readFileSync(path.join(FACTORIES, 'wired.json'), 'utf8'), own, "the factory's own file is not written");
});

test("a templated factory's instruction is its tree's NEMIA.md, written by instruct; and rm removes it all, its read-only base included", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('told', dir, repo, '--set', 'budget=7');
  const words = path.join(scratch('wf-applied-words-'), 'words.md');
  fs.writeFileSync(words, 'Operate the tree.\n');
  await assert.rejects(
    main(['factory', 'instruct', 'told', '--file', words], NO_ENGINE),
    refusedWith('Conflict', /its tree is not rendered yet/),
  );
  assert.equal(fs.existsSync(treeDir('told')), false, 'an instruct refused seeds no tree');
  reconcileFactory(templated('told'));
  await main(['factory', 'instruct', 'told', '--file', words], NO_ENGINE);
  assert.equal(fs.readFileSync(path.join(treeDir('told'), 'NEMIA.md'), 'utf8'), 'Operate the tree.\n');
  await assert.rejects(
    main(['factory', 'instruction', 'told', '--store'], NO_ENGINE),
    refusedWith('Invalid', /its instruction is its tree's NEMIA\.md/),
  );
  await main(['factory', 'rm', 'told'], NO_ENGINE);
  assert.deepEqual(
    filed().filter((f) => f.startsWith('told')),
    [],
  );
});

test("a bare workflow name started in a templated factory is its tree's, and the tree's step is what the run is told", async (t) => {
  const { dir, repo } = template();
  await apply('started', dir, repo, '--set', 'budget=7');
  reconcileFactory(templated('started'));
  const review = path.join(treeDir('started'), 'workflows', 'dev', 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 7', 'budget: 9'));
  const printed: string[] = [];
  t.mock.method(console, 'log', (...args: unknown[]) => printed.push(args.join(' ')));
  await main(['start', 'Cache the views', '--factory', 'started', '--workflows', 'dev'], NO_ENGINE);
  const run = readRun(printed[0].split(' ')[0]);
  assert.equal(run.workflowDir, path.join(treeDir('started'), 'workflows', 'dev'));
  assert.equal(run.workflow?.find((step) => step.name === 'review')?.budget, 9, "the tree's step, as the person changed it");
  assert.equal(run.factory, 'started');
});

test("a templated factory's due schedule starts its tree's workflow, as a person's start does, never the repository's", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('scheduled', dir, repo, '--set', 'budget=7');
  reconcileFactory(templated('scheduled'));
  const review = path.join(treeDir('scheduled'), 'workflows', 'dev', 'review.md');
  fs.writeFileSync(review, fs.readFileSync(review, 'utf8').replace('budget: 7', 'budget: 9'));
  await main(['factory', 'schedule', 'scheduled', 'dev', '--cron', '* * * * *', '--brief', 'Cache the views'], NO_ENGINE);
  const started = await runWith(NO_ENGINE, startDue(repo, [], Date.parse('2100-01-01T00:00:00Z')));
  assert.ok(started && 'run' in started, `the due schedule started a run: ${JSON.stringify(started)}`);
  const run = readRun(started.run);
  assert.equal(run.workflowDir, path.join(treeDir('scheduled'), 'workflows', 'dev'));
  assert.equal(run.workflow?.find((step) => step.name === 'review')?.budget, 9, "the tree's step, as the person changed it");
});

test("the writers' place factory writes a templated factory's tree; refused without --factory, for an untemplated one, and before its render", async (t) => {
  t.mock.method(console, 'log', () => {});
  const { dir, repo } = template();
  await apply('written', dir, repo, '--set', 'budget=7');
  await main(['factory', 'add', 'plain', '--repo', repo], NO_ENGINE);
  const drafts = scratch('wf-applied-drafts-');
  const beside = path.join(drafts, 'workflows', 'lean');
  fs.cpSync(path.join(repo, 'workflows', 'dev'), beside, { recursive: true });
  for (const part of ['agents', 'skills'])
    fs.cpSync(path.join(repo, 'workflows', part), path.join(drafts, 'workflows', part), { recursive: true });
  const bare = path.join(scratch('wf-applied-bare-'), 'lean');
  fs.cpSync(path.join(repo, 'workflows', 'dev'), bare, { recursive: true });
  const agent = path.join(drafts, 'scout.md');
  fs.copyFileSync(path.join(repo, 'workflows', 'agents', 'implementer.md'), agent);
  const skill = path.join(drafts, 'skills', 'tidy', 'SKILL.md');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, '---\nname: tidy\ndescription: Tidy a folder.\n---\nTidy it.\n');
  const writes = (folder: string) => [
    ['workflows', 'write', 'factory', 'lean', '--folder', folder],
    ['agents', 'write', 'factory', '--file', agent],
    ['skills', 'write', 'factory', '--file', skill],
  ];
  for (const write of writes(beside)) {
    await assert.rejects(main(write, NO_ENGINE), refusedWith('Invalid', /`factory` writes the tree .* none was named: .*--factory <name>/));
    await assert.rejects(
      main([...write, '--factory', 'written'], NO_ENGINE),
      refusedWith('Conflict', /its tree is not rendered yet, at .*: start the daemon, nemia up/),
    );
    await assert.rejects(main([...write, '--factory', 'plain'], NO_ENGINE), refusedWith('Invalid', /plain is not made from a template/));
    await assert.rejects(
      main([...write.slice(0, 2), 'yours', ...write.slice(3), '--factory', 'written'], NO_ENGINE),
      refusedWith('Invalid', /yours is the store's, and --factory names a factory's tree/),
    );
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'workflows', 'lean')), false, 'a refused write writes nothing of yours');
  reconcileFactory(templated('written'));
  for (const write of writes(bare)) await main([...write, '--factory', 'written'], NO_ENGINE);
  const tree = path.join(treeDir('written'), 'workflows');
  assert.ok(fs.existsSync(path.join(tree, 'lean', 'review.md')), "the workflow is written into the tree's, its agents read in the tree");
  assert.ok(fs.existsSync(path.join(tree, 'agents', 'scout.md')), "the agent is written into the tree's agents");
  assert.ok(fs.existsSync(path.join(tree, 'skills', 'tidy', 'SKILL.md')), "the skill is written into the tree's skills");
  assert.equal(fs.existsSync(path.join(ROOT, 'workflows', 'lean')), false, 'nothing of yours is written');
});
