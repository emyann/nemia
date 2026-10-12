/**
 * A run's workflow folder read after its start (`workflowsOf`), as the start read it: with the run's places and its factory's hires and
 * rules, so a step a factory hires an agent into, whose file adds `skills:` to that agent, reads; and the warning kept for a folder that
 * is gone or truly no longer reads, said once, with one full stop — and, where the factory itself is gone or does not read, naming the
 * factory instead of quoting a loader that was given no hires. `WF_ROOT` is set before the import, since the store reads it as it loads.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratch } from '../../test/scratch.ts';

const ROOT = scratch('wf-reads-verb-');
process.env.WF_ROOT = ROOT;
const { workflowsOf } = await import('./reads.verb.ts');
const { loadWorkflows } = await import('../folder/folder.store.ts');
const { addFactory, attachWorkflow, hireAgent, removeFactory } = await import('../factory/factory.store.ts');
const { DEFAULT_FACTORY } = await import('../factory/factory.ts');
type Run = import('../record/record.ts').Run;

const write = (file: string, text: string): void => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

const FROZEN = 'the steps, their spec, prose and graph are the workflow the run froze at `nemia start`, which is what it is judged by.';
const HIRED_STEP = '---\nplace: git\nskills: spec-it\n---\nDesign it.\n';

/** A repository holding the workflow `build`, whose `design` names no agent and adds the skill `spec-it`, the agent `seldon` beside it. */
function repository(): { repo: string; folder: string } {
  const repo = fs.mkdtempSync(path.join(ROOT, 'repo-'));
  const folder = path.join(repo, 'workflows', 'build');
  write(path.join(folder, 'design.md'), HIRED_STEP);
  write(path.join(repo, 'workflows', 'agents', 'seldon.md'), '---\nharness: claude\n---\nYou design.\n');
  write(path.join(repo, 'workflows', 'skills', 'spec-it', 'SKILL.md'), '---\nname: spec-it\ndescription: Write a spec.\n---\nSpec it.\n');
  return { repo, folder };
}

/** The factory `name` over `repo`, attaching `build` and hiring `seldon` into `build/design`. */
function hiring(name: string, repo: string): void {
  addFactory({ name, repos: [repo] });
  attachWorkflow({ factory: name, workflow: 'build' });
  hireAgent({ factory: name, agent: 'seldon', step: 'build/design' });
}

/** A run of `folder` in `factory`, frozen unless `frozen` is false: all `workflowsOf` reads of a record. */
const runOf = (repo: string, folder: string, factory: string | undefined, frozen = true): Run =>
  ({
    id: 'a-run',
    repo,
    workflowDir: folder,
    steps: {},
    ...(factory !== undefined && { factory }),
    ...(frozen && { workflow: [{ name: 'design', after: [], body: 'Design it.' }] }),
  }) as unknown as Run;

/** Why `folder` does not load, read with `fills` none, in the loader's own words. */
const loaderWords = (folder: string, repo: string): string => {
  try {
    loadWorkflows(folder, { repo, home: ROOT });
  } catch (err) {
    return (err as Error).message;
  }
  throw new Error(`${folder} loaded`);
};

test("a step a factory hires an agent into, whose file adds `skills:`, reads with the factory's hires: no warning", () => {
  const { repo, folder } = repository();
  hiring('hires', repo);
  const read = workflowsOf(runOf(repo, folder, 'hires'), ROOT);
  assert.equal(read.warning, null);
  assert.deepEqual(
    read.steps?.map((s) => [s.name, s.agent?.name, s.agent?.skills]),
    [['design', 'seldon', ['spec-it']]],
  );
});

test("the factory's rules are read with its hires, as a start reads them", () => {
  const { repo, folder } = repository();
  hiring('ruled', repo);
  write(path.join(ROOT, 'factories', 'ruled', 'RULES.md'), 'Never push on a Friday.\n');
  const read = workflowsOf(runOf(repo, folder, 'ruled'), ROOT);
  assert.equal(read.warning, null);
  assert.match(JSON.stringify(read.steps), /Never push on a Friday\./);
});

test('REFUSED: a folder truly broken after the start warns in the same words, with one full stop', () => {
  const { repo, folder } = repository();
  hiring('broken', repo);
  write(path.join(folder, 'design.md'), '---\nplace: git\nsomeNewerKey: 1\n---\nDesign it.\n');
  const why = loaderWords(folder, repo);
  assert.match(why, /someNewerKey/);
  const stopped = /[.!?]$/.test(why) ? why : `${why}.`;
  const { steps, warning } = workflowsOf(runOf(repo, folder, 'broken'), ROOT);
  assert.equal(steps, null);
  assert.equal(warning, `The workflow folder ${folder} no longer reads as a workflow: ${stopped} Nothing here is read from it: ${FROZEN}`);
  assert.ok(!warning.includes('..'), warning);
  assert.equal(
    workflowsOf(runOf(repo, folder, 'broken', false), ROOT).warning,
    `The workflow folder ${folder} no longer reads as a workflow: ${stopped}`,
  );
});

test("REFUSED: the loader's words that end with a full stop are given no second one, and those that end with none are given one", () => {
  const { repo, folder } = repository();
  const ended = loaderWords(folder, repo);
  assert.match(ended, /delete the line\.$/);
  assert.equal(
    workflowsOf(runOf(repo, folder, undefined, false), ROOT).warning,
    `The workflow folder ${folder} no longer reads as a workflow: ${ended}`,
  );
  const file = path.join(ROOT, 'a-file-not-a-folder');
  fs.writeFileSync(file, '');
  const unended = loaderWords(file, repo);
  assert.doesNotMatch(unended, /[.!?]$/);
  assert.equal(
    workflowsOf(runOf(repo, file, undefined, false), ROOT).warning,
    `The workflow folder ${file} no longer reads as a workflow: ${unended}.`,
  );
});

test('a folder that is gone is said gone, whatever its factory', () => {
  const { repo } = repository();
  hiring('gone-folder', repo);
  const gone = path.join(ROOT, 'no-such', 'build');
  assert.equal(
    workflowsOf(runOf(repo, gone, 'gone-folder'), ROOT).warning,
    `The workflow folder ${gone} is gone. Nothing here is read from it: ${FROZEN}`,
  );
  assert.equal(workflowsOf(runOf(repo, gone, 'gone-folder', false), ROOT).warning, `The workflow folder ${gone} is gone.`);
  assert.equal(workflowsOf(runOf(repo, gone, 'no-such-factory', false), ROOT).warning, `The workflow folder ${gone} is gone.`);
});

test('REFUSED: a run of a factory since removed is quiet while its folder reads, and names the factory when it does not', () => {
  const { repo, folder } = repository();
  hiring('removed', repo);
  removeFactory('removed');
  const { steps, warning } = workflowsOf(runOf(repo, folder, 'removed'), ROOT);
  assert.equal(steps, null);
  assert.equal(
    warning,
    `The workflow folder ${folder} is not read as this run's start read it: the factory removed it started in is gone. Nothing here is read from it: ${FROZEN}`,
  );
  assert.doesNotMatch(warning, /this step has none/);
  write(path.join(folder, 'design.md'), '---\nplace: git\n---\nDesign it.\n');
  assert.equal(workflowsOf(runOf(repo, folder, 'removed'), ROOT).warning, null);
});

test('REFUSED: a run of a factory whose file no longer reads names the factory, and never the hires the loader was not given', () => {
  const { repo, folder } = repository();
  hiring('unread', repo);
  fs.writeFileSync(path.join(ROOT, 'factories', 'unread.json'), 'not json');
  assert.equal(
    workflowsOf(runOf(repo, folder, 'unread', false), ROOT).warning,
    `The workflow folder ${folder} is not read as this run's start read it: the factory unread it started in no longer reads.`,
  );
});

test('a run in no factory, or in the default one, is read with its places and no hires, and no factory file is asked for', () => {
  const { repo, folder } = repository();
  write(path.join(folder, 'design.md'), '---\nplace: git\nagent: seldon\nskills: spec-it\n---\nDesign it.\n');
  for (const factory of [undefined, DEFAULT_FACTORY]) {
    const read = workflowsOf(runOf(repo, folder, factory), ROOT);
    assert.equal(read.warning, null);
    assert.equal(read.steps?.[0].agent?.name, 'seldon');
  }
});

test("REFUSED: a run whose record says the default factory, its folder broken, is warned in the loader's words: no factory is said gone", () => {
  const { repo, folder } = repository();
  const why = loaderWords(folder, repo);
  const warning = workflowsOf(runOf(repo, folder, DEFAULT_FACTORY, false), ROOT).warning;
  assert.equal(warning, `The workflow folder ${folder} no longer reads as a workflow: ${why}`);
  assert.doesNotMatch(warning ?? '', /the factory default/);
});
