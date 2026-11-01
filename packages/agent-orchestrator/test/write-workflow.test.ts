/**
 * A workflow folder written from its steps (`writeWorkflow`): what the board's builder saves.
 *
 * The write is the only way the board changes a folder, so what it refuses is refused before a byte is written — each refusal here is
 * asserted in its words and with the folder as it was — and what it writes is what `loadWorkflows` reads back.
 *
 * `WF_ROOT` is set before the modules are imported, since they read it as they load. The tests' team's agents and skills are copied
 * beside the store's workflows, as beside its own: dev's steps name them.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseAgent, WorkflowError, type StepDraft, type Workflow } from '../src/workflow.ts';
import { agentDeniesOf } from '../src/workflow/index.ts';
import { loadWorkflows } from '../src/folder/folder.store.ts';
import { scratch } from './scratch.ts';
import { TEAM, TEAM_DEV } from './team.ts';

const ROOT = scratch('wf-write-');
process.env.WF_ROOT = ROOT;
const { addFactory, writeWorkflow } = await import('../src/runner.ts');

const STORE = path.join(ROOT, 'workflows');
fs.cpSync(path.join(TEAM, 'agents'), path.join(STORE, 'agents'), { recursive: true });
fs.cpSync(path.join(TEAM, 'skills'), path.join(STORE, 'skills'), { recursive: true });

/** A copy of the tests' team's `dev` — README, comments and all — as a workflow of the store's, named `name`. */
function devIn(name: string): string {
  const dir = path.join(STORE, name);
  fs.mkdirSync(dir, { recursive: true });
  for (const file of fs.readdirSync(TEAM_DEV)) fs.copyFileSync(path.join(TEAM_DEV, file), path.join(dir, file));
  return dir;
}

/** Every file under `dir`, by its path from `dir`, with what it holds: what a refused write must leave as it was. */
function snapshot(dir: string): Record<string, string> {
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const at = path.join(e.parentPath, e.name);
        return [path.relative(dir, at), fs.readFileSync(at, 'utf8')];
      })
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
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

const step = (name: string, more: Partial<StepDraft> = {}): StepDraft => ({ name, after: [], place: 'git', body: `${name} it`, ...more });

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
  fs.copyFileSync(path.join(STORE, 'agents', 'review.schema.json'), path.join(dir, 'review.schema.json'));
  const before = snapshot(dir);
  const [implement, review, ship] = loadWorkflows(dir) as [Workflow, Workflow, Workflow];

  const fewer = writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship]);
  assert.deepEqual([fewer.written, fewer.kept, fewer.removed], [['review.md'], ['implement.md', 'ship.md'], []]);
  assert.equal(fs.readFileSync(path.join(dir, 'implement.md'), 'utf8'), before['implement.md'], 'byte for byte');
  assert.match(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^rounds: 2$/m);
  assert.doesNotMatch(fs.readFileSync(path.join(dir, 'review.md'), 'utf8'), /^# /m, 'a render has no comments');
  assert.deepEqual(loadWorkflows(dir), fewer.steps, 'what it returns is what the folder reads as');
  assert.equal(fewer.steps.find((s) => s.name === 'review')!.rounds, 2);

  const docs = step('docs', { after: ['implement'], model: 'sonnet' });
  const other = writeWorkflow(dir, [docs, implement]);
  assert.deepEqual(
    [other.written, other.kept, other.removed],
    [['docs.md'], ['implement.md'], ['review.md', 'ship.md']],
    'implement and docs, review and ship gone: docs.md written, their files removed',
  );
  assert.deepEqual(Object.keys(snapshot(dir)), ['README.md', 'docs.md', 'implement.md', 'review.schema.json']);
  assert.equal(snapshot(dir)['README.md'], before['README.md'], 'the README untouched');
  assert.equal(
    snapshot(dir)['review.schema.json'],
    before['review.schema.json'],
    "a schema in the folder is the folder's, and no write of the steps touches it",
  );
  assert.equal(fs.readFileSync(path.join(dir, 'docs.md'), 'utf8'), '---\nafter: implement\nplace: git\nmodel: sonnet\n---\ndocs it\n');
  assert.deepEqual(
    loadWorkflows(dir).map((s) => s.name),
    ['implement', 'docs'],
  );

  fs.writeFileSync(path.join(dir, 'notes.txt'), 'mine\n');
  fs.mkdirSync(path.join(dir, 'schemas'));
  fs.writeFileSync(path.join(dir, 'schemas', 'old.md'), 'not a step: not in the folder itself\n');
  assert.deepEqual(
    writeWorkflow(dir, [implement]).removed,
    ['docs.md'],
    "a folder's other files are not steps, and not the write's to remove",
  );
  assert.deepEqual(
    Object.keys(snapshot(dir)),
    ['README.md', 'implement.md', 'notes.txt', 'review.schema.json', path.join('schemas', 'old.md')],
    "a folder's other files stay",
  );
});

test('the README is written only when it is given, to the name the README already has', () => {
  const dir = devIn('readme');
  const steps = loadWorkflows(dir);
  fs.renameSync(path.join(dir, 'README.md'), path.join(dir, 'readme.md'));
  const done = writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n');
  assert.deepEqual([done.written, done.kept], [['readme.md'], ['implement.md', 'review.md', 'ship.md']]);
  assert.deepEqual(
    Object.keys(snapshot(dir)).filter((f) => /readme/i.test(f)),
    ['readme.md'],
    'no second README beside it',
  );
  assert.equal(
    writeWorkflow(dir, steps, '# readme\n\nWhat it is for, now.\n').kept.includes('readme.md'),
    true,
    'the same text is left as it is',
  );
});

test("a draft naming its agent that sends the resolved denies, as the board lists them, is written with the step's own alone", () => {
  const dir = path.join(STORE, 'own-denies');
  const file = fs.readFileSync(path.join(STORE, 'agents', 'implementer.md'), 'utf8');
  const agentDenies = agentDeniesOf(parseAgent('implementer', file));
  assert.ok(agentDenies.length, "the tests' implementer denies something");
  const done = writeWorkflow(dir, [step('implement', { agent: 'implementer', disallowedTools: ['Bash(npm run build)', ...agentDenies] })]);
  const written = fs.readFileSync(path.join(dir, 'implement.md'), 'utf8');
  assert.match(written, /^claude:\n {2}fence:\n {4}disallowedTools: Bash\(npm run build\)$/m);
  assert.doesNotMatch(written, /^disallowedTools:/m, 'in its harness block, and no fence key at the top level');
  assert.deepEqual(done.steps[0].disallowedTools, ['Bash(npm run build)', ...agentDenies], "the session is still refused the agent's");
});

test("written where the board lists workflows from — the store's workflows/ and a known repository's — and anywhere else with `{ anywhere: true }`", () => {
  const repo = scratch('wf-write-repo-');
  addFactory({ name: 'write-known', repos: [repo] });
  assert.equal(fs.existsSync(path.join(repo, '.git')), false, 'a repository a factory names is known with no .git read');
  fs.mkdirSync(path.join(repo, '.claude', 'agents'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, '.claude', 'agents', 'only-here.md'),
    '---\nrole: Engineer\ndescription: Only in the repository.\n---\nYou are.\n',
  );
  assert.deepEqual(
    writeWorkflow(path.join(repo, 'workflows', 'dev'), [step('implement', { agent: 'only-here' })]).written,
    ['implement.md'],
    "a factory's repository's, its agents found in its .claude/",
  );
  const named = scratch('wf-write-named-');
  assert.deepEqual(
    writeWorkflow(path.join(named, 'workflows', 'dev'), [step('implement')], undefined, { places: { repo: named, home: ROOT } }).written,
    ['implement.md'],
    'the repository the caller names in its places',
  );

  const elsewhere = path.join(scratch('wf-write-elsewhere-'), 'dev');
  assert.deepEqual(writeWorkflow(elsewhere, [step('implement')], undefined, { anywhere: true }).written, ['implement.md']);
  assert.deepEqual(
    loadWorkflows(elsewhere).map((s) => s.name),
    ['implement'],
  );
});

test("REFUSED at shipped defaults, with the folder as it was: a folder outside the store's workflows/ and a repository's — or the workflows/ itself, or one below a workflow", () => {
  const fix = (at: string) =>
    `${at} is not a workflow in the store's workflows/ (${path.join(STORE, '<name>')}) nor in a repository's the store knows (<repo>/workflows/<name>, for a factory's repo), and writing a workflow removes the files of the steps it no longer has. Write it to a folder in one of the two, give its repository to a factory (nemia factory add <name> --repo <repo>), or pass { anywhere: true } to write ${at} all the same.`;
  const outside = scratch('wf-write-outside-');
  fs.writeFileSync(path.join(outside, 'old.md'), 'a step nobody meant to remove\n');
  assert.equal(
    refusal(outside, () => writeWorkflow(outside, [step('implement')])),
    fix(outside),
  );
  const notYet = path.join(outside, 'workflows', 'dev');
  assert.equal(
    refusal(notYet, () => writeWorkflow(notYet, [step('implement')])),
    fix(notYet),
    "a workflows/ no factory names is no repository's",
  );
  const unknown = scratch('wf-write-unknown-');
  fs.mkdirSync(path.join(unknown, '.git'));
  const checkout = path.join(unknown, 'workflows', 'dev');
  assert.equal(
    refusal(checkout, () => writeWorkflow(checkout, [step('implement')])),
    fix(checkout),
    'a .git no factory names is not known by it',
  );
  assert.equal(
    refusal(STORE, () => writeWorkflow(STORE, [step('implement')])),
    fix(STORE),
    "the store's workflows/ holds workflows, and is not one",
  );
  const below = path.join(devIn('below'), 'ui');
  assert.equal(
    refusal(below, () => writeWorkflow(below, [step('implement')])),
    fix(below),
  );
  assert.equal(
    refusal(outside, () => writeWorkflow(path.relative(process.cwd(), outside), [step('implement')])),
    fix(outside),
    'a relative path, resolved',
  );
});

test("REFUSED, with the folder as it was, in the parser's words and naming the step: a key a step does not have, a loop that is not a back edge", () => {
  const dir = devIn('refused');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const loadRefusal = (file: string, text: string): string => {
    const copy = devIn(`copy-${path.basename(file, '.md')}-${Math.random().toString(36).slice(2, 6)}`);
    fs.writeFileSync(path.join(copy, file), text);
    try {
      loadWorkflows(copy);
    } catch (e) {
      return (e as Error).message;
    }
    return assert.fail(`${file} loaded`);
  };

  const typo = refusal(dir, () => writeWorkflow(dir, [implement, { ...review, afer: ['implement'] } as StepDraft]));
  assert.match(typo, /^review: `afer` is not a key a step has\. A step's keys are: after, resume, /);
  assert.equal(typo, loadRefusal('review.md', '---\nafer: implement\n---\nreview it\n'), 'the sentence a folder on disk is refused with');

  const docs = step('docs', { after: ['implement'] });
  const unwaited = refusal(dir, () => writeWorkflow(dir, [implement, docs, { ...review, after: ['implement'], loop: 'docs' }]));
  assert.ok(unwaited.startsWith('review: `loop: docs`, but review does not wait on docs'), unwaited);
  assert.match(
    refusal(dir, () => writeWorkflow(dir, [implement, { ...review, loop: 'review' }])),
    /^review: `loop: review` names this step\./,
  );
  assert.match(
    refusal(dir, () => writeWorkflow(dir, [implement, { ...review, rounds: 0 }])),
    /^review: `rounds: 0` is not a count\./,
  );
});

test('REFUSED, with the folder as it was: an `output:` naming a schema that is not beside the step — not there, or outside the folder though it is there', () => {
  const dir = devIn('output');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const absent = refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: 'reviews.schema.json' } }]));
  assert.ok(absent.startsWith('review: `output: reviews.schema.json` is not there.'), absent);
  assert.ok(absent.includes('write it beside review.md'), absent);
  const theirs = path.join(devIn('theirs'), 'review.schema.json');
  const up = path.relative(dir, theirs);
  const elsewhere = refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: up } }]));
  assert.ok(
    elsewhere.startsWith('review: `output: ' + up + '` names a file outside the workflow folder.'),
    "a schema of the step's own beside another workflow",
  );
  assert.ok(elsewhere.includes('write it beside review.md'), elsewhere);
  assert.ok(elsewhere.includes('`output: review.schema.json`'), elsewhere);
  assert.ok(elsewhere.includes('or delete the line'), elsewhere);
  const absolute = refusal(dir, () => writeWorkflow(dir, [implement, { ...review, output: { file: theirs } }]));
  assert.ok(absolute.startsWith('review: `output: ' + theirs + '` names a file outside the workflow folder'), absolute);
  const loose = { type: 'object', properties: { x: { type: 'string' } }, required: [], additionalProperties: false } as const;
  const written = writeWorkflow(dir, [implement, { ...review, output: { file: 'review.schema.json', schema: loose } } as StepDraft]);
  assert.deepEqual(
    written.steps.find((s) => s.name === 'review')!.output,
    review.output,
    "a schema given with the step is not what is read: the folder's file is",
  );
});

test('REFUSED, with the folder as it was: a folder that is a file', () => {
  const dir = devIn('names');
  const [implement] = loadWorkflows(dir) as [Workflow, Workflow];
  const file = path.join(STORE, 'a-file');
  fs.writeFileSync(file, 'not a folder\n');
  assert.equal(
    refusal(STORE, () => writeWorkflow(file, [implement])),
    `${file} is a file, and a workflow is a folder of steps. Name a folder — one that is not there yet is made.`,
  );
  assert.equal(fs.readFileSync(file, 'utf8'), 'not a folder\n');
});

/**
 * Whether this filesystem tells `plan.md` from `Plan.md` apart. Where it does not, they are one file, and a step renamed by case is that
 * file renamed.
 */
const caseSensitive = (() => {
  const probe = fs.mkdtempSync(path.join(ROOT, 'case-'));
  fs.writeFileSync(path.join(probe, 'a.md'), '---\nplace: git\n---\n');
  const apart = !fs.existsSync(path.join(probe, 'A.md'));
  fs.rmSync(probe, { recursive: true, force: true });
  return apart;
})();

test('the files of the steps the folder no longer has go before a byte of the new ones is written', (t) => {
  const dir = devIn('order');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  const order: string[] = [];
  const { rmSync, writeFileSync } = fs;
  const removals = t.mock.method(fs, 'rmSync', (at: fs.PathLike, opts?: fs.RmOptions) => {
    order.push(`removed ${path.basename(String(at))}`);
    return rmSync(at, opts);
  });
  const writes = t.mock.method(
    fs,
    'writeFileSync',
    (at: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, opts?: fs.WriteFileOptions) => {
      order.push(`wrote ${path.basename(String(at))}`);
      return writeFileSync(at, data, opts);
    },
  );
  try {
    writeWorkflow(dir, [implement, { ...review, name: 'REVIEW', rounds: 2 }]);
  } finally {
    removals.mock.restore();
    writes.mock.restore();
  }
  const wrote = order.indexOf('wrote REVIEW.md');
  assert.ok(wrote >= 0, order.join(', '));
  assert.deepEqual(
    order.slice(0, wrote).sort(),
    ['removed review.md', 'removed ship.md'],
    "both removals come before the write, in readdirSync's order, the filesystem's: where case is not told apart review.md and " +
      'REVIEW.md are one file, and a removal after the write would remove what was written',
  );
  assert.deepEqual(order.slice(wrote), ['wrote REVIEW.md'], 'and nothing is removed after it — implement.md is left as it is');
});

test(
  'a step renamed by case keeps its file where the filesystem does not tell case apart',
  { skip: caseSensitive && 'this filesystem tells implement.md from Implement.md apart, where a rename by case is an ordinary rename' },
  () => {
    const dir = devIn('case');
    const [implement] = loadWorkflows(dir) as [Workflow];
    const done = writeWorkflow(dir, [{ ...implement, name: 'Implement' }]);
    assert.deepEqual([done.written, done.removed], [['Implement.md'], ['implement.md', 'review.md', 'ship.md']]);
    assert.deepEqual(
      Object.keys(snapshot(dir)),
      ['Implement.md', 'README.md', 'review.schema.json'],
      'the step it was given is there, under its new name',
    );
    assert.deepEqual(
      loadWorkflows(dir).map((s) => s.name),
      ['Implement'],
      'and the folder reads as that step',
    );
  },
);

test("REFUSED at shipped defaults, with the folder as it was: a step's file that is a link, and a README that is one when a README is given", () => {
  const dir = devIn('linked');
  const [implement, review, ship] = loadWorkflows(dir) as [Workflow, Workflow, Workflow];
  const away = scratch('wf-write-linked-');
  const link = (file: string): string => {
    const to = path.join(away, file);
    fs.renameSync(path.join(dir, file), to);
    fs.symlinkSync(to, path.join(dir, file));
    return to;
  };
  const fix = (file: string) =>
    `${path.join(dir, file)} is a link, and a workflow's files are its own. Writing this workflow would follow it and write into whatever it points at, outside the folder, and would not remove it when its step goes. Replace the link with a file of its own — remove the link and copy what it pointed at into its place, rm <file> && cp <target> <file> — or take it out of the folder.`;

  const was = fs.readFileSync(link('review.md'), 'utf8');
  assert.equal(
    refusal(dir, () => writeWorkflow(dir, [implement, { ...review, rounds: 2 }, ship])),
    fix('review.md'),
    'a step the write would render through a link',
  );
  assert.equal(
    refusal(dir, () => writeWorkflow(dir, [implement])),
    fix('review.md'),
    'and a step gone, whose link the write would not remove',
  );
  assert.equal(fs.readFileSync(path.join(away, 'review.md'), 'utf8'), was, 'what it points at is untouched');

  fs.rmSync(path.join(dir, 'review.md'));
  fs.renameSync(path.join(away, 'review.md'), path.join(dir, 'review.md'));
  const readme = fs.readFileSync(link('README.md'), 'utf8');
  assert.equal(
    refusal(dir, () => writeWorkflow(dir, [implement, review, ship], '# theirs\n')),
    fix('README.md'),
    'a linked README is refused when a README is given',
  );
  assert.equal(fs.readFileSync(path.join(away, 'README.md'), 'utf8'), readme, 'and what it points at is untouched');
  assert.deepEqual(
    writeWorkflow(dir, [implement, review, ship]).kept,
    ['implement.md', 'review.md', 'ship.md'],
    'with no README given, the link is nothing the write touches',
  );
});

test('REFUSED at load and at write, in the same words: a `tally:` the closeout of the step cannot hold, naming its file, the schema and the field', () => {
  const dir = devIn('tallied');
  const review = path.join(dir, 'review.md');
  const original = fs.readFileSync(review, 'utf8');
  const steps = loadWorkflows(dir);
  fs.writeFileSync(review, original.replace(/^budget: 20$/m, 'budget: 20\ntally: findings, nope'));
  assert.match(fs.readFileSync(review, 'utf8'), /^tally: findings, nope$/m, 'the line is really in the file');
  const said =
    'review: `tally: findings, nope` in review.md: `output: review.schema.json` declares no field `nope`; it declares findings, again.';
  assert.throws(
    () => loadWorkflows(dir),
    (e: unknown) => e instanceof WorkflowError && e.message.startsWith(said),
  );
  fs.writeFileSync(review, original);

  const drafted = steps.map((s) => (s.name === 'review' ? { ...s, tally: ['findings', 'nope'] } : s));
  assert.ok(refusal(dir, () => writeWorkflow(dir, drafted)).startsWith(said));

  const kept = steps.map((s) => (s.name === 'review' ? { ...s, tally: ['findings'] } : s));
  writeWorkflow(dir, kept);
  assert.match(fs.readFileSync(review, 'utf8'), /^tally: findings$/m);
  assert.deepEqual(loadWorkflows(dir).find((s) => s.name === 'review')?.tally, ['findings'], 'and a tally it can hold reads back');
});

test('a line break in a value is written as a literal block, and read back as the one value, never as a key of its own', () => {
  const dir = devIn('names');
  const [implement, review] = loadWorkflows(dir) as [Workflow, Workflow];
  writeWorkflow(dir, [{ ...implement, check: 'npm test\nharness: codex' }, review]);
  assert.match(fs.readFileSync(path.join(dir, 'implement.md'), 'utf8'), /^check: \|-$/m);
  const [read] = loadWorkflows(dir) as [Workflow];
  assert.equal(read.check, 'npm test\nharness: codex');
  assert.equal(read.harness, implement.harness);
});
