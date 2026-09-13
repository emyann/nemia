/**
 * The format, and the two ways a folder of markdown is not a workflow.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fansOut, loadWorkflows, terminalSteps, parseWorkflow, validate, WorkflowError, type Workflow } from '../src/workflow.ts';

const step = (name: string, after: string[] = []): Workflow => ({ name, after, body: 'do a thing' });

test('a step is frontmatter and prose, and the prose is the point', () => {
  const w = parseWorkflow('review', '---\nharness: codex\nafter: implement\n---\nRead the diff.\n');
  assert.equal(w.name, 'review');
  assert.equal(w.harness, 'codex');
  assert.deepEqual(w.after, ['implement']);
  assert.equal(w.body, 'Read the diff.');
});

test('check and retries are read — the command verbatim, colons and all', () => {
  const w = parseWorkflow('implement', '---\ncheck: npm test && node -e "console.log(1 ? 2 : 3)"\nretries: 2\n---\nbuild it');
  assert.equal(w.check, 'npm test && node -e "console.log(1 ? 2 : 3)"');
  assert.equal(w.retries, 2);
  const bare = parseWorkflow('implement', '---\nharness: claude\n---\nbuild it');
  assert.equal(bare.check, undefined, 'absent means nothing runs');
  assert.equal(bare.retries, undefined);
});

test('no frontmatter at all is a valid step', () => {
  assert.deepEqual(parseWorkflow('only', 'Just do it.').after, []);
  assert.equal(parseWorkflow('only', 'Just do it.').body, 'Just do it.');
});

test('after takes a list', () => {
  assert.deepEqual(parseWorkflow('x', '---\nafter: a, b ,c\n---\nbody').after, ['a', 'b', 'c']);
});

test('a step with nothing to say is refused', () => {
  assert.throws(() => parseWorkflow('empty', '---\nharness: claude\n---\n'), WorkflowError);
});

test('waiting on a step that does not exist is refused before anything is spent', () => {
  assert.throws(() => validate([step('a'), step('b', ['nope'])]), /waits on "nope"/);
});

test('a cycle is refused, and named', () => {
  assert.throws(() => validate([step('a', ['b']), step('b', ['a'])]), /wait on each other: a, b/);
  assert.throws(() => validate([step('a', ['a'])]), /waits on itself/);
});

test('a diamond is fine — this is a DAG, not a line', () => {
  validate([step('a'), step('b', ['a']), step('c', ['a']), step('d', ['b', 'c'])]);
});

test('the review step runs on the other harness, after the implementation', () => {
  const steps = loadWorkflows(path.join(import.meta.dirname, '..', 'workflows'));
  const review = steps.find((s) => s.name === 'review')!;
  assert.deepEqual(review.after, ['implement']);
  assert.equal(review.harness, 'codex', 'a second opinion means a second model');
});

test('an empty or missing folder says so', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-'));
  assert.throws(() => loadWorkflows(dir), /no \.md steps/);
  assert.throws(() => loadWorkflows(path.join(dir, 'nope')), /no workflow folder/);
});

test('resume implies after — you cannot continue a session that has not run', () => {
  const w = parseWorkflow('respond', '---\nresume: implement\n---\nreply to the review');
  assert.equal(w.resume, 'implement');
  assert.deepEqual(w.after, ['implement'], 'the ordering comes for free');
});

test('resuming a step on a different harness is refused', () => {
  const steps = [
    { name: 'implement', after: [], body: 'x', harness: 'claude' },
    { name: 'respond', after: ['implement'], body: 'y', harness: 'codex', resume: 'implement' },
  ];
  assert.throws(() => validate(steps), /different harness/);
});

test('resuming a step that does not exist is refused', () => {
  assert.throws(() => validate([{ name: 'a', after: [], body: 'x', resume: 'ghost' }]), /resumes "ghost"/);
});

test('the three shipped steps are a valid workflow', () => {
  const steps = loadWorkflows(path.join(import.meta.dirname, '..', 'workflows'));
  assert.deepEqual(steps.map((s) => s.name).sort(), ['implement', 'respond', 'review']);
  const respond = steps.find((s) => s.name === 'respond')!;
  assert.equal(respond.resume, 'implement', 'it is the author coming back, not a third party');
  assert.deepEqual(respond.after.sort(), ['implement', 'review'], 'and it waits for the review to exist');
});

test('a chain does not fan out; a diamond does', () => {
  const chain = [
    { name: 'a', after: [], body: 'x' },
    { name: 'b', after: ['a'], body: 'x' },
    { name: 'c', after: ['b'], body: 'x' },
  ];
  assert.equal(fansOut(chain), false);
  assert.equal(fansOut([...chain, { name: 'd', after: ['a'], body: 'x' }]), true, 'two follow a');
  assert.equal(fansOut([{ name: 'a', after: [], body: 'x' }, { name: 'b', after: [], body: 'x' }]), true, 'two roots');
});

test('the terminal steps are where the work ends up', () => {
  const chain = [
    { name: 'implement', after: [], body: 'x' },
    { name: 'review', after: ['implement'], body: 'x' },
  ];
  assert.deepEqual(terminalSteps(chain).map((s) => s.name), ['review']);

  const fan = [
    { name: 'split', after: [], body: 'x' },
    { name: 'a', after: ['split'], body: 'x' },
    { name: 'b', after: ['split'], body: 'x' },
    { name: 'integrate', after: ['a', 'b'], body: 'x' },
  ];
  assert.deepEqual(terminalSteps(fan).map((s) => s.name), ['integrate']);

  // A workflow may deliberately end wide; then there is more than one place to look.
  assert.deepEqual(terminalSteps([{ name: 'a', after: [], body: 'x' }, { name: 'b', after: [], body: 'x' }]).map((s) => s.name), ['a', 'b']);
});

test('the shipped examples are valid workflows too', () => {
  const examples = path.join(import.meta.dirname, '..', 'wf-examples');
  for (const d of fs.readdirSync(examples, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    assert.ok(loadWorkflows(path.join(examples, d.name)).length, `${d.name} has steps`);
  }

  assert.equal(fansOut(loadWorkflows(path.join(examples, 'fanout'))), true, 'two roots meeting at integrate');

  // The splitter proposes parts; it does not file them. So it is one step that runs on its own,
  // and the concurrency it argues about happens in the runs a person starts after reading PLAN.md.
  const split = loadWorkflows(path.join(examples, 'split'));
  assert.deepEqual(split.map((s) => s.name), ['split']);
  assert.deepEqual(split[0]!.after, [], 'nothing precedes it — splitting is the first thing');
  assert.equal(fansOut(split), false);
});
