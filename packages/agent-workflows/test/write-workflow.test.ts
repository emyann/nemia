/**
 * A workflow folder written from its steps (`writeWorkflow`): what the board's builder saves.
 *
 * The write is the only way the board changes a folder, so what it refuses is refused before a byte is written — each refusal here is
 * asserted in its words and with the folder as it was — and what it writes is what `loadWorkflows` reads back.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadWorkflows, WorkflowError, type StepDraft, type Workflow } from '../src/workflow.ts';

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-'));
// WF_ROOT is read as the module loads, so it is set before the import rather than after it.
process.env.WF_ROOT = ROOT;
const { writeWorkflow } = await import('../src/runner.ts');

const STORE = path.join(ROOT, 'workflows');
const SHIPPED = path.join(import.meta.dirname, '..', '..', '..', 'workflows', 'dev');

/** A copy of the repository's `dev` — README, schema, comments and all — as a workflow of the store's, named `name`. */
function devIn(name: string): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(SHIPPED)) fs.copyFileSync(path.join(SHIPPED, file), path.join(dir, file));
  return dir;
}

/** Every file under `dir`, by its path from `dir`, with what it holds: what a refused write must leave as it was. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries((fs.readdirSync(dir, { recursive: true, withFileTypes: true }) as fs.Dirent[])
    .filter((e) => e.isFile())
    .map((e) => {
      const at = path.join(e.parentPath, e.name);
      return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
    })
    .sort(([a], [b]) => (a! < b! ? -1 : 1)));
}

/** The refusal `write` threw — a `WorkflowError`, exit 2 — with `dir` asserted as it was before it; fails the test if it wrote. */
function refusal(dir: string, write: () => unknown): string {
  const before = snapshot(dir);
  const existed = fs.existsSync(dir);
  try {
    write();
  } catch (e) {
    assert.ok(e instanceof WorkflowError, String(e));
    assert.equal(e.exitCode, 2, 'the author has something to fix');
    assert.deepEqual(snapshot(dir), before, `${dir} is as it was: ${e.message}`);
    assert.equal(fs.existsSync(dir), existed, 'and a folder that was not there is not made');
    return e.message;
  }
  return assert.fail(`${dir} was written, and should have been refused`);
}

const step = (name: string, more: Partial<StepDraft> = {}): StepDraft => ({ name, after: [], body: `${name} it`, ...more });

test("a workflow's steps written back as they were leave every file as it was — comments included — and read back as the steps", () => {
  const dir = devIn('as-it-was');
  const before = snapshot(dir);
  const steps = loadWorkflows(dir);
  const done = writeWorkflow(dir, steps);
  assert.deepEqual(done, { dir, steps, written: [], kept: ['implement.md', 'review.md', 'ship.md'], removed: [] });
  assert.deepEqual(snapshot(dir), before);
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^# /m, 'the comments are still there');
});

test('a step changed is rendered and written, a step unchanged keeps its file, a step gone loses its file — and the schema and the README stay as they are', () => {
  const dir = devIn('changed');
  const before = snapshot(dir);
  const [implement, review, ship] = loadWorkflows(dir) as [Workflow, Workflow, Workflow];

  const fewer = writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship]);
  assert.deepEqual([fewer.written, fewer.kept, fewer.removed], [['review.md'], ['implement.md', 'ship.md'], []]);
  assert.equal(fs.readFileSync(path.join(dir, 'implement.md'), 'utf8'), before['implement.md'], 'byte for byte');
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^rounds: 2$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^# /m, 'a render has no comments');
  assert.deepEqual(loadWorkflows(dir), fewer.steps, 'what it returns is what the folder reads as');
  assert.equal(fewer.steps.find((s) => s.name === 'review')!.rounds, 2);

  // Implement and docs, review and ship gone: docs.md written, their files removed, review.schema.json and the README untouched.
  const docs = step('docs', { after: ['implement'], model: 'sonnet' });
  const other = writeWorkflow(dir, [docs, implement]);
  assert.deepEqual([other.written, other.kept, other.removed], [['docs.md'], ['implement.md'], ['review.md', 'ship.md']]);
  assert.deepEqual(Object.keys(snapshot(dir)), ['README.md', 'docs.md', 'implement.md', 'review.schema.json']);
  assert.equal(snapshot(dir)['README.md'], before['README.md']);
  assert.equal(snapshot(dir)['review.schema.json'], before['review.schema.json']);
  assert.equal(fs.readFileSync(path.join(dir, 'docs.md'), 'utf8'), '---\nafter: implement\nmodel: sonnet\n---\ndocs it\n');
  assert.deepEqual(loadWorkflows(dir).map((s) => s.name), ['implement', 'docs']);

  // A folder's other files are not steps, and are not the write's to remove.
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine\n');
  fs.mkdirSync(path.join(dir, 'schemas'));
  fs.writeFileSync(path.join(dir, 'schemas', 'old.md'), 'not a step: not in the folder itself\n');
  assert.deepEqual(writeWorkflow(dir, [implement]).removed, ['docs.md']);
  assert.deepEqual(Object.keys(snapshot(dir)), ['README.md', 'implement.md', 'notes.txt', 'review.schema.json', path.join('schemas', 'old.md')]);
});

test('the README is written only when it is given, to the name the README already has — and a new workflow is a folder made, with its first step', () => {
  const dir = devIn('readme');
  const steps = loadWorkflows(dir);
  fs.renameSync(path.join(dir, 'README.md'), path.join(dir, 'readme.md'));
  const done = writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n');
  assert.deepEqual([done.written, done.kept], [['readme.md'], ['implement.md', 'review.md', 'ship.md']]);
  assert.deepEqual(Object.keys(snapshot(dir)).filter((f) => /readme/i.test(f)), ['readme.md'], 'no second README beside it');
  assert.equal(writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n').kept.includes('readme.md'), true, 'the same text is left as it is');

  const fresh = path.join(STORE, 'fresh');
  assert.equal(fs.existsSync(fresh), false);
  const made = writeWorkflow(fresh, [step('implement')], '# fresh\n\nA first step.\n');
  assert.deepEqual([made.written, made.kept, made.removed], [['README.md', 'implement.md'], [], []]);
  assert.deepEqual(snapshot(fresh), { 'README.md': '# fresh\n\nA first step.\n', 'implement.md': 'implement it\n' });
  assert.deepEqual(loadWorkflows(fresh), made.steps);
});

test("written where the board lists workflows from — the store's workflows/ and a repository's — and anywhere else with `{ anywhere: true }`", () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-repo-'));
  fs.mkdirSync(path.join(repo, '.git'));
  assert.deepEqual(writeWorkflow(path.join(repo, 'workflows', 'dev'), [step('implement')]).written, ['implement.md'], "a repository's");
  // A worktree's .git is a file, and a worktree is a repository all the same.
  const worktree = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-worktree-'));
  fs.writeFileSync(path.join(worktree, '.git'), 'gitdir: /elsewhere\n');
  assert.deepEqual(writeWorkflow(path.join(worktree, 'workflows', 'dev'), [step('implement')]).written, ['implement.md'], "a worktree's");

  const elsewhere = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-elsewhere-')), 'dev');
  assert.deepEqual(writeWorkflow(elsewhere, [step('implement')], undefined, { anywhere: true }).written, ['implement.md']);
  assert.deepEqual(loadWorkflows(elsewhere).map((s) => s.name), ['implement']);
});

test("REFUSED at shipped defaults, with the folder as it was: a folder outside the store's workflows/ and a repository's — or the workflows/ itself, or one below a workflow", () => {
  const fix = (at: string) => `${at} is not a workflow in the store's workflows/ (${path.join(STORE, '<name>')}) nor in a repository's (<repo>/workflows/<name>, beside its .git), and writing a workflow removes the files of the steps it no longer has. Write it to a folder in one of the two, or pass { anywhere: true } to write ${at} all the same.`;
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-outside-'));
  fs.writeFileSync(path.join(outside, 'old.md'), 'a step nobody meant to remove\n');
  assert.equal(refusal(outside, () => writeWorkflow(outside, [step('implement')])), fix(outside));
  const notYet = path.join(outside, 'workflows', 'dev');
  assert.equal(refusal(notYet, () => writeWorkflow(notYet, [step('implement')])), fix(notYet), 'a workflows/ with no .git beside it is no repository\'s');
  assert.equal(refusal(STORE, () => writeWorkflow(STORE, [step('implement')])), fix(STORE), "the store's workflows/ holds workflows, and is not one");
  const below = path.join(devIn('below'), 'ui');
  assert.equal(refusal(below, () => writeWorkflow(below, [step('implement')])), fix(below));
  assert.equal(refusal(outside, () => writeWorkflow(path.relative(process.cwd(), outside), [step('implement')])), fix(outside), 'a relative path, resolved');
});

test("REFUSED, with the folder as it was, in the parser's words and naming the step: a key a step does not have, `after:` naming no step, a cycle, a loop that is not a back edge", () => {
  const dir = devIn('refused');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const loadRefusal = (file: string, text: string): string => {
    const copy = devIn(`copy-${path.basename(file, '.md')}-${Math.random().toString(36).slice(2, 6)}`);
    fs.writeFileSync(path.join(copy, file), text);
    try { loadWorkflows(copy); } catch (e) { return (e as Error).message; }
    return assert.fail(`${file} loaded`);
  };

  const typo = refusal(dir, () => writeWorkflow(dir, [implement, { ...review, afer: ['implement'] } as StepDraft]));
  assert.match(typo, /^review: `afer` is not a key a step has\. A step's keys are: after, resume, /);
  assert.equal(typo, loadRefusal('review.md', '---\nafer: implement\n---\nreview it\n'), 'the sentence a folder on disk is refused with');

  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, after: ['implment'], loop: undefined, rounds: undefined }])),
    'review: waits on "implment", which is not a step here');

  assert.equal(refusal(dir, () => writeWorkflow(dir, [{ ...implement, after: ['review'] }, review])), 'these steps wait on each other: implement, review');

  const docs = step('docs', { after: ['implement'] });
  assert.match(refusal(dir, () => writeWorkflow(dir, [implement, docs, { ...review, after: ['implement'], loop: 'docs' }])),
    /^review: `loop: docs`, but review does not wait on docs, directly or through the steps between/);
  assert.match(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, loop: 'review' }])), /^review: `loop: review` names this step\./);
  assert.match(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, rounds: 0 }])), /^review: `rounds: 0` is not a count\./);
});

test("REFUSED, with the folder as it was: an `output:` naming a schema that is not beside the step — not there, or outside the folder though it is there", () => {
  const dir = devIn('output');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  assert.match(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: 'reviews.schema.json' } }])),
    /^review: `output: reviews\.schema\.json` is not there\. It is a JSON Schema file, relative to the workflow folder — write it beside review\.md/);
  // A schema of the step's own, beside another workflow: there, strict, and still not the folder's.
  const theirs = path.join(devIn('theirs'), 'review.schema.json');
  const up = path.relative(dir, theirs);
  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: up } }])),
    `review: \`output: ${up}\` names a file outside the workflow folder. A schema is part of what the step is judged by, and lives in the folder with it: write it beside review.md and name it from there — \`output: review.schema.json\` — or delete the line, and the step declares no output.`);
  assert.match(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: theirs } }])), /^review: `output: \/.*` names a file outside the workflow folder/);
  // A schema given with the step is not what is read: the folder's file is.
  const loose = { type: 'object', properties: { x: { type: 'string' } }, required: [], additionalProperties: false } as const;
  const written = writeWorkflow(dir, [implement, { ...review, output: { file: 'review.schema.json', schema: loose } } as StepDraft]);
  assert.deepEqual(written.steps.find((s) => s.name === 'review')!.output, review.output);
});

test("REFUSED, with the folder as it was: a step name that is not a file name, one name twice, no steps, a line break in a value, and a folder that is a file", () => {
  const dir = devIn('names');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const named = (name: string) => [implement, { ...step(name), after: ['implement'] }];
  const fix = 'Name it as its file is named, without .md — implement, say.';
  assert.equal(refusal(dir, () => writeWorkflow(dir, named('../escape'))), `\`../escape\` is not a step's name: a step is a file in its workflow's folder, and a slash names a file in another. ${fix}`);
  assert.equal(fs.existsSync(path.join(STORE, 'escape.md')), false);
  assert.equal(refusal(dir, () => writeWorkflow(dir, named('README'))), `\`README\` is not a step's name: README.md is the folder's README, which says what the workflow is for and is never read as a step. ${fix}`);
  assert.equal(refusal(dir, () => writeWorkflow(dir, named('docs.md'))), "`docs.md` is not a step's name: it is a file's name, and a step is named without its .md: `docs`.");
  assert.equal(refusal(dir, () => writeWorkflow(dir, named('plan,docs'))), `\`plan,docs\` is not a step's name: \`after:\` and \`input:\` split on every comma, so no step could wait on it. ${fix}`);
  assert.equal(refusal(dir, () => writeWorkflow(dir, named('.docs'))), `\`.docs\` is not a step's name: a name that starts with a dot is a hidden file, which a person listing the folder does not see. ${fix}`);
  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, name: '' }])), `A step has no name, and a step is named by its file in the workflow's folder. ${fix}`);

  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, review, { ...implement, body: 'again' }])), 'two steps are named implement, and a step is its file, implement.md. Rename one of them.');
  assert.equal(refusal(dir, () => writeWorkflow(dir, [])), `no steps to write to ${dir}, and a workflow has at least one. To remove the workflow, remove its folder.`);
  assert.match(refusal(dir, () => writeWorkflow(dir, [{ ...implement, check: 'npm test\nharness: codex' }, review])), /^implement: `check` holds a line break/);

  const file = path.join(STORE, 'a-file');
  fs.writeFileSync(file, 'not a folder\n');
  assert.equal(refusal(STORE, () => writeWorkflow(file, [implement])), `${file} is a file, and a workflow is a folder of steps. Name a folder — one that is not there yet is made.`);
  assert.equal(fs.readFileSync(file, 'utf8'), 'not a folder\n');
});

/** Whether this filesystem tells `plan.md` from `Plan.md` apart. Where it does not, they are one file, and a step renamed by case is that file renamed. */
const caseSensitive = (() => {
  const probe = fs.mkdtempSync(path.join(ROOT, 'case-'));
  fs.writeFileSync(path.join(probe, 'a.md'), '');
  const apart = !fs.existsSync(path.join(probe, 'A.md'));
  fs.rmSync(probe, { recursive: true, force: true });
  return apart;
})();

test('the files of the steps the folder no longer has go before a byte of the new ones is written', (t) => {
  const dir = devIn('order');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  // The order the write made them in, which is what a filesystem that does not tell case apart turns on, and the only way to read it on one
  // that does: there `review.md` and `REVIEW.md` are one file, and a removal after the write would remove what was written.
  const order: string[] = [];
  const { rmSync, writeFileSync } = fs;
  const removals = t.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => { order.push(`removed ${path.basename(String(at))}`); return rmSync(at, opts); });
  const writes = t.mock.method(fs, 'writeFileSync', (at: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) => {
    order.push(`wrote ${path.basename(String(at))}`);
    return writeFileSync(at, data, opts);
  });
  try {
    writeWorkflow(dir, [implement, { ...review, name: 'REVIEW', rounds: 2 }]);
  } finally { removals.mock.restore(); writes.mock.restore(); }
  assert.deepEqual(order, ['removed review.md', 'removed ship.md', 'wrote REVIEW.md'], 'implement.md is left as it is, and the removals come first');
});

test('a step renamed by case keeps its file where the filesystem does not tell case apart', { skip: caseSensitive && 'this filesystem tells implement.md from Implement.md apart, where a rename by case is an ordinary rename' }, () => {
  const dir = devIn('case');
  const [implement] = loadWorkflows(dir) as [Workflow];
  const done = writeWorkflow(dir, [{ ...implement, name: 'Implement' }]);
  assert.deepEqual([done.written, done.removed], [['Implement.md'], ['implement.md', 'review.md', 'ship.md']]);
  assert.deepEqual(Object.keys(snapshot(dir)), ['Implement.md', 'README.md', 'review.schema.json'], 'the step it was given is there, under its new name');
  assert.deepEqual(loadWorkflows(dir).map((s) => s.name), ['Implement'], 'and the folder reads as that step');
});

test("REFUSED at shipped defaults, with the folder as it was: a step's file that is a link, and a README that is one when a README is given", () => {
  const dir = devIn('linked');
  const [implement, review, ship] = loadWorkflows(dir) as [Workflow, Workflow, Workflow];
  const away = fs.mkdtempSync(path.join(os.tmpdir(), 'wf-write-linked-'));
  /** A file of the folder moved out of it and linked back in, as a person keeping a step beside another workflow would. */
  const link = (file: string): string => {
    const to = path.join(away, file);
    fs.renameSync(path.join(dir, file), to);
    fs.symlinkSync(to, path.join(dir, file));
    return to;
  };
  const fix = (file: string) => `${path.join(dir, file)} is a link, and a workflow's files are its own. Writing this workflow would follow it and write into whatever it points at, outside the folder, and would not remove it when its step goes. Replace the link with a file of its own — copy what it points at over it, cp --remove-destination — or take it out of the folder.`;

  const was = fs.readFileSync(link('review.md'), 'utf8');
  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship])), fix('review.md'), 'a step the write would render through it');
  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement])), fix('review.md'), 'and a step gone, whose link the write would not remove');
  assert.equal(fs.readFileSync(path.join(away, 'review.md'), 'utf8'), was, 'what it points at is untouched');

  // A linked README is refused when a README is given, since that is when it is written — and not otherwise, since then nothing touches it.
  fs.rmSync(path.join(dir, 'review.md'));
  fs.renameSync(path.join(away, 'review.md'), path.join(dir, 'review.md'));
  const readme = fs.readFileSync(link('README.md'), 'utf8');
  assert.equal(refusal(dir, () => writeWorkflow(dir, [implement, review, ship], '# theirs\n')), fix('README.md'));
  assert.equal(fs.readFileSync(path.join(away, 'README.md'), 'utf8'), readme, 'and what it points at is untouched');
  assert.deepEqual(writeWorkflow(dir, [implement, review, ship]).kept, ['implement.md', 'review.md', 'ship.md'], 'with no README given, the link is nothing the write touches');
});
